// ─────────────────────────────────────────────────────────────────────────────
// ORDERS CONTROLLER — Phase 3 CRM Backend
// Endpoints: list, get, create, update status, delete
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                       = require('../config/database');
const { log, getRequestMeta }                      = require('../services/activity.service');
const { success, badRequest, error, notFound, forbidden }     = require('../utils/response');
const { sendStatusNotification }                   = require('../services/whatsapp-notifications.service');
const { sendPushNotification }                     = require('../services/push.service');
const { processReferralQualification }            = require('../services/referral.service');
const { generateOrderNumber }                      = require('../utils/order-number');
const { CORE_PAYMENT_METHODS, ORDER_STATUS_KEYS }  = require('../config/master-data');
const { hasPermission }                            = require('../middleware/rbac');
const { orderStatusUpdateSchema }                  = require('../validation/orders.schemas');
const { normalizeOrderItem }                       = require('../utils/line-pricing');
const { emitOrderUpdate }                          = require('../services/sse.service');
const { enqueueNotification, NOTIFY_JOB }          = require('../queues');

const WA_NOTIFY_STATUSES = new Set(['PICKED_UP','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED']);
const ORDER_STATUS_SEQUENCE = ['PENDING', 'PICKED_UP', 'SENT_TO_PLANT', 'PROCESSING', 'WASHING', 'DRYING', 'IRONING', 'QC', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'];
const STATUS_CORRECTION_ROLES = ['SUPER_ADMIN', 'MANAGER'];
const HIGH_RISK_STATUS_CORRECTION_ROLES = ['SUPER_ADMIN'];
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const BACKWARD_TRANSITIONS = {
  PICKED_UP: ['PENDING'],
  SENT_TO_PLANT: ['PICKED_UP'],
  PROCESSING: ['PICKED_UP', 'SENT_TO_PLANT'],
  WASHING: ['PROCESSING'],
  DRYING: ['WASHING'],
  IRONING: ['DRYING'],
  QC: ['IRONING'],
  READY_FOR_DELIVERY: ['QC'],
  OUT_FOR_DELIVERY: ['READY_FOR_DELIVERY'],
  CANCELLED: ['PENDING'],
};
const CANCELLABLE_STATUSES = new Set(['PENDING', 'PICKED_UP', 'PROCESSING', 'READY_FOR_DELIVERY']);
const DELIVERED_CORRECTION_TARGETS = new Set(['READY_FOR_DELIVERY']);

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasCorrectionAuthority = (staff) =>
  STATUS_CORRECTION_ROLES.includes(staff?.role) || hasPermission(staff, 'orders.edit');

const hasHighRiskCorrectionAuthority = (staff) =>
  HIGH_RISK_STATUS_CORRECTION_ROLES.includes(staff?.role);

const getTransitionContext = (currentStatus, nextStatus) => {
  if (currentStatus === nextStatus) return { kind: 'noop' };

  if (currentStatus === 'DELIVERED') {
    if (nextStatus === 'CANCELLED') return { kind: 'forbidden_delivered_cancel' };
    if (DELIVERED_CORRECTION_TARGETS.has(nextStatus)) return { kind: 'delivered_correction' };
    return { kind: 'forbidden_delivered_change' };
  }

  if (currentStatus === 'CANCELLED') {
    if (nextStatus === 'PENDING') return { kind: 'restore' };
    return { kind: 'forbidden_cancelled_change' };
  }

  if (nextStatus === 'CANCELLED') {
    return CANCELLABLE_STATUSES.has(currentStatus)
      ? { kind: 'cancel' }
      : { kind: 'forbidden_cancel' };
  }

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(currentStatus);
  const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(nextStatus);

  if (currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex) {
    if (BACKWARD_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
      return { kind: 'backward' };
    }
    return { kind: 'forbidden_backward' };
  }

  return { kind: 'forward' };
};

const PUSH_MESSAGES = {
  PICKED_UP:          { title: 'Clothes Picked Up!',       body: 'Your order has been picked up. We\'re on our way to the plant.' },
  READY_FOR_DELIVERY: { title: 'Ready for Delivery!',      body: 'Your order is cleaned and ready. Delivery will be scheduled soon.' },
  OUT_FOR_DELIVERY:   { title: 'Out for Delivery!',        body: 'Your order is on its way. Expect delivery soon.' },
  DELIVERED:          { title: 'Delivered!',               body: 'Your order has been delivered. Thank you for choosing Hangers!' },
};

const calculatePaymentState = (order, incomingAmount, writeOffAmount = 0) => {
  const requestedAmount = Number.parseFloat(incomingAmount);
  const writeOff = Math.max(0, Number.parseFloat(writeOffAmount) || 0);
  const currentPaid = Number(order?.paidAmount || 0);
  const currentWriteOff = Number(order?.writeOffAmount || 0);
  const totalAmount = Number(order?.totalAmount || 0);
  const balanceDue = Math.max(0, Number((totalAmount - currentPaid - currentWriteOff).toFixed(2)));
  const cappedWriteOff = Math.min(writeOff, Math.max(0, balanceDue - requestedAmount));
  const payableAfterWriteOff = Math.max(0, Number((balanceDue - cappedWriteOff).toFixed(2)));
  const appliedAmount = Math.min(requestedAmount, payableAfterWriteOff);
  const overpayment = Math.max(0, Number((requestedAmount - appliedAmount).toFixed(2)));
  const nextPaidAmount = Number((currentPaid + appliedAmount).toFixed(2));
  const nextWriteOffAmount = Number((currentWriteOff + cappedWriteOff).toFixed(2));
  const effectivePaid = Number((nextPaidAmount + nextWriteOffAmount).toFixed(2));
  const paymentStatus = effectivePaid >= totalAmount ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';

  return {
    requestedAmount,
    balanceDue,
    cappedWriteOff,
    appliedAmount,
    overpayment,
    nextPaidAmount,
    nextWriteOffAmount,
    paymentStatus,
  };
};

// ── GET /api/v1/orders ────────────────────────────────────────────────────────
const listOrders = async (req, res) => {
  try {
    const {
      page   = 1,
      limit  = 30,
      status,
      search,
      dateFrom,
      dateTo,
    } = req.query;

    const parsedPage = parsePositiveInt(page);
    const parsedLimit = parsePositiveInt(limit);
    if (!parsedPage) return badRequest(res, 'page must be a positive integer');
    if (!parsedLimit || parsedLimit > 100) return badRequest(res, 'limit must be an integer between 1 and 100');
    const where = { ...ORDER_ONLY_WHERE };
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const parsedFrom = new Date(dateFrom);
        if (Number.isNaN(parsedFrom.getTime())) return badRequest(res, 'dateFrom must be a valid date');
        where.createdAt.gte = parsedFrom;
      }
      if (dateTo) {
        const parsedTo = new Date(dateTo + 'T23:59:59Z');
        if (Number.isNaN(parsedTo.getTime())) return badRequest(res, 'dateTo must be a valid date');
        where.createdAt.lte = parsedTo;
      }
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name:  { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer:   { select: { id: true, name: true, phone: true } },
          items:      { include: { service: { select: { name: true, category: true } } } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
        orderBy:  { createdAt: 'desc' },
        skip:     (parsedPage - 1) * parsedLimit,
        take:     parsedLimit,
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      orders,
      pagination: {
        total,
        page:     parsedPage,
        limit:    parsedLimit,
        pages:    Math.ceil(total / parsedLimit),
      },
    });
  } catch (err) {
    console.error('listOrders error:', err);
    return error(res, 'Failed to fetch orders');
  }
};

// ── GET /api/v1/orders/stats ──────────────────────────────────────────────────
const getOrderStats = async (req, res) => {
  try {
    const today     = new Date();
    const todayStart = new Date(today.setHours(0,0,0,0));
    const todayEnd   = new Date(today.setHours(23,59,59,999));
    today.setHours(0,0,0,0); // reset

    const [
      totalToday,
      pendingCount,
      readyCount,
      deliveredCount,
      totalCollections,
      todayCollections,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: ['PENDING','PROCESSING','WASHING','IRONING','QC'] } } }),
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: 'READY_FOR_DELIVERY' } }),
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: 'DELIVERED', createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: { not: 'FAILED' } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: { not: 'FAILED' },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.order.findMany({
        where: ORDER_ONLY_WHERE,
        take:    8,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true, phone: true } } },
      }),
    ]);

    return success(res, {
      today: {
        orders:    totalToday,
        delivered: deliveredCount,
        revenue:   todayCollections._sum.amount || 0,
      },
      active: {
        pending: pendingCount,
        ready:   readyCount,
      },
      allTime: {
        revenue: totalCollections._sum.amount || 0,
      },
      recentOrders,
    });
  } catch (err) {
    console.error('getOrderStats error:', err);
    return error(res, 'Failed to fetch stats');
  }
};

// ── GET /api/v1/orders/:id ────────────────────────────────────────────────────
const getOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where:   { id: req.params.id, ...ORDER_ONLY_WHERE },
      include: {
        customer:   { select: { id: true, name: true, phone: true } },
        items:      { include: { service: true } },
        stages:     { orderBy: { createdAt: 'asc' } },
        assignedTo: { select: { id: true, name: true, role: true } },
        payments:   true,
      },
    });
    if (!order) return notFound(res, 'Order not found');
    return success(res, { order });
  } catch (err) {
    return error(res, 'Failed to fetch order');
  }
};

// ── POST /api/v1/orders ───────────────────────────────────────────────────────
const createOrder = async (req, res) => {
  const {
    customerId,
    customerPhone,      // alternate: find/create customer by phone
    customerName,
    items = [],         // [{ serviceId, serviceName, garmentType, variant, quantity, unitPrice, upcharges }]
    pickupDate,
    deliveryDate,
    notes,
    source = 'COUNTER',
    discount = 0,
    paymentMethod,
    paidAmount: paidAmountRaw,
  } = req.body;

  if (!items.length) return badRequest(res, 'At least one item is required');

  try {
    // Find or create customer
    let customer;
    if (customerId) {
      customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) return notFound(res, 'Customer not found');
    } else if (customerPhone) {
      const phone = customerPhone.replace(/\D/g, '').slice(-10);
      customer = await prisma.customer.upsert({
        where:  { phone },
        update: {},
        create: { phone, name: customerName || null },
      });
    } else {
      return badRequest(res, 'customerId or customerPhone is required');
    }

    const normalizedItems = items.map((item) => normalizeOrderItem(item, {
      defaultServiceName: 'Custom',
      allowUpcharges: true,
    }));
    if (normalizedItems.some((item) => item.unitPrice < 0)) return badRequest(res, 'Item unitPrice cannot be negative');
    if (normalizedItems.some((item) => !item.serviceName)) return badRequest(res, 'Each item must include a serviceName');
    const serviceIds = normalizedItems.map((item) => item.serviceId).filter(Boolean);
    if (serviceIds.length) {
      const services = await prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, category: true, name: true },
      });

      const dailyIronServiceIds = new Set(
        services.filter((service) => service.category === 'DAILY_IRON').map((service) => service.id)
      );

      if (normalizedItems.some((item) => item.serviceId && dailyIronServiceIds.has(item.serviceId))) {
        return badRequest(res, 'DAILY_IRON items must be logged through the Daily Iron flow, not a regular order');
      }
    }

    // Calculate totals
    const parsedDiscount = Math.max(0, Number.parseFloat(discount) || 0);
    const subtotal    = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalAmount = Math.max(0, subtotal - parsedDiscount);

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Write-off amount
    const writeOffAmt = parseFloat(req.body.writeOffAmount) || 0;
    console.log('BACKEND WRITEOFF:', { writeOffAmount: req.body.writeOffAmount, writeOffAmt, paymentMethod: req.body.paymentMethod, paidAmount: req.body.paidAmount });

    // Create order + items in one transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId:   customer.id,
          status:       (source === 'counter' || source === 'walk-in') ? 'PICKED_UP' : 'PENDING',
          source,
          subtotal,
          discount: parsedDiscount,
          totalAmount,
          writeOffAmount: writeOffAmt || 0,
          pickupDate:   pickupDate  ? new Date(pickupDate)  : null,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          notes:        notes || null,
          assignedToId: req.staff?.id || null,
          items: {
            create: normalizedItems.map(item => ({
              serviceId:   item.serviceId   || null,
              serviceName: item.serviceName || 'Custom',
              garmentType: item.garmentType || '',
              variant:     item.variant     || null,
              quantity:    item.quantity    || 1,
              baseUnitPrice: item.baseUnitPrice,
              unitPrice:   item.unitPrice   || 0,
              lineDiscountType: item.lineDiscountType,
              lineDiscountValue: item.lineDiscountValue || 0,
              lineDiscountAmount: item.lineDiscountAmount || 0,
              subtotal:    item.subtotal,
              upcharges:   item.upcharges   ? JSON.stringify(item.upcharges) : null,
              notes:       item.notes       || null,
            })),
          },
          stages: {
            create: {
              stage:       'RECEIVED',
              notes:       `Order received at counter. Source: ${source}`,
              changedById: req.staff?.id || null,
            },
          },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items:    true,
          stages:   true,
        },
      });

      // ── Handle payment at order creation ──────────────────────────
      const paidNow    = parseFloat(paidAmountRaw) || 0;
      if (paidNow > 0 && paymentMethod && paymentMethod !== 'Pay Later') {
        const overpayment = paidNow - totalAmount;
        const actualPaid  = overpayment > 0 ? totalAmount : paidNow;
        const effectivePaid = actualPaid + writeOffAmt;
        const payStatus   = effectivePaid >= totalAmount ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';

        // Record payment
        await tx.payment.create({
          data: {
            orderId:    newOrder.id,
            amount:     actualPaid,
            method:     paymentMethod,
            collectedBy: req.staff?.id || null,
          }
        });

        // Update order payment status
        await tx.order.update({
          where: { id: newOrder.id },
          data:  { paidAmount: actualPaid, paymentStatus: payStatus }
        });

        // Log write-off
        if (writeOffAmt > 0) {
          await tx.orderStage.create({
            data: { orderId: newOrder.id, stage: 'PAYMENT_RECORDED', notes: `₹${writeOffAmt} written off at counter`, changedById: req.staff?.id || null }
          });
        }

        // Handle overpayment → wallet
        if (overpayment > 0 && customer.id) {
          await tx.customer.update({
            where: { id: customer.id },
            data:  { walletBalance: { increment: overpayment } }
          });
          await tx.walletTransaction.create({
            data: {
              customerId: customer.id,
              amount:     overpayment,
              type:       'CREDIT',
              reason:     'Overpayment refunded to wallet',
              orderId:    newOrder.id,
            }
          });
        }
      }
      // ──────────────────────────────────────────────────────────────

      return newOrder;
    });

    await log({
      actorType:   'staff',
      actorId:     req.staff?.id,
      actorName:   req.staff?.name,
      action:      'ORDER_CREATED',
      resource:    'order',
      resourceId:  order.id,
      description: `Order ${order.orderNumber} created for ${customer.name || customer.phone}`,
      metadata:    { orderNumber: order.orderNumber, source, totalAmount },
      ...getRequestMeta(req),
    });

    return success(res, { order }, `Order ${order.orderNumber} created successfully`, 201);
  } catch (err) {
    console.error('createOrder error:', err);
    return error(res, 'Failed to create order');
  }
};

// ── PATCH /api/v1/orders/:id/status ──────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
  const parsed = orderStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid status update payload');

  try {
    const chk = await prisma.order.findFirst({ where: { id: req.params.id, ...ORDER_ONLY_WHERE }, select: { status: true } });
    if (chk?.status === 'RETURNED') return res.status(400).json({ success: false, message: 'This order has been returned and cannot be updated.' });
    if (chk?.status === 'SENT_TO_PLANT') return res.status(400).json({ success: false, message: 'This order is at the plant. Wait for the challan to be marked as Received.' });
    const origChk = await prisma.order.findFirst({ where: { id: req.params.id, ...ORDER_ONLY_WHERE }, select: { notes: true, status: true } });
    if (origChk?.status === 'CANCELLED' && origChk?.notes?.includes('[RETURNED')) return res.status(400).json({ success: false, message: 'This order has been returned and is locked.' });
  } catch(e) {}
  const { status, notes } = parsed.data;

    const validStatuses = ORDER_STATUS_KEYS;

  if (!status || !validStatuses.includes(status)) {
    return badRequest(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const order = await prisma.order.findFirst({
      where:   { id: req.params.id, ...ORDER_ONLY_WHERE },
      include: { items: { select: { id: true } } },
    });
    if (!order) return notFound(res, 'Order not found');
    const trimmedNotes = notes?.trim() || '';
    const transition = getTransitionContext(order.status, status);
    const requiresCorrectionAuthority = ['backward', 'cancel', 'restore'].includes(transition.kind);
    const requiresHighRiskAuthority = transition.kind === 'delivered_correction';
    const requiresReason = ['backward', 'cancel', 'restore', 'delivered_correction'].includes(transition.kind);

    if (transition.kind === 'noop') {
      return badRequest(res, 'Order is already in that status');
    }
    if (requiresCorrectionAuthority && !hasCorrectionAuthority(req.staff)) {
      return forbidden(res, 'Only managers or staff with order edit authority can make status corrections');
    }
    if (requiresHighRiskAuthority && !hasHighRiskCorrectionAuthority(req.staff)) {
      return forbidden(res, 'Only super admins can change a delivered order');
    }
    if (requiresReason && !trimmedNotes) {
      return badRequest(res, 'A reason note is required for this status correction');
    }
    if (transition.kind === 'forbidden_backward') {
      return badRequest(res, 'That backward status change is not allowed. Use the approved correction steps only.');
    }
    if (transition.kind === 'forbidden_cancel') {
      return badRequest(res, 'This order can no longer be cancelled from its current workflow state');
    }
    if (transition.kind === 'forbidden_cancelled_change') {
      return badRequest(res, 'Cancelled orders can only be restored back to Pending');
    }
    if (transition.kind === 'forbidden_delivered_cancel') {
      return badRequest(res, 'Delivered orders cannot be cancelled. Use the return / re-clean flow instead.');
    }
    if (transition.kind === 'forbidden_delivered_change') {
      return badRequest(res, 'Delivered orders are locked from normal workflow changes');
    }

    // ── ITEM GUARD: Block moving past PICKED_UP with zero items ──────────────
    // Industry standard: garments must be logged before plant work begins.
    // PENDING→PICKED_UP is always allowed. Beyond that, items must exist.
    const REQUIRES_ITEMS = ['PROCESSING','WASHING','DRYING','IRONING','QC',
                            'READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED'];
    if (REQUIRES_ITEMS.includes(status) && order.items.length === 0) {
      return res.status(422).json({
        error:       'ITEMS_REQUIRED',
        message:     'Please add garment items to this order before moving it to processing. No items have been logged yet.',
        orderNumber: order.orderNumber,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    let stageNotes = trimmedNotes || null;
    if (transition.kind === 'backward') {
      stageNotes = `[REVERSAL] ${trimmedNotes}`;
    } else if (transition.kind === 'cancel') {
      stageNotes = `[CANCELLED] ${trimmedNotes}`;
    } else if (transition.kind === 'restore') {
      stageNotes = `[RESTORED] ${trimmedNotes}`;
    } else if (transition.kind === 'delivered_correction') {
      stageNotes = `[HIGH_RISK_CORRECTION] ${trimmedNotes}`;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: req.params.id },
        data:  {
          status,
          deliveredAt: status === 'DELIVERED'
            ? new Date()
            : transition.kind === 'delivered_correction'
              ? null
              : undefined,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items:    true,
        },
      });
      await tx.orderStage.create({
        data: {
          orderId:     req.params.id,
          stage:       status,
          notes:       stageNotes,
          changedById: req.staff?.id || null,
        },
      });
      return o;
    });

    const action = transition.kind === 'backward'
      ? 'ORDER_STATUS_REVERSED'
      : transition.kind === 'cancel'
        ? 'ORDER_CANCELLED'
        : transition.kind === 'restore'
          ? 'ORDER_RESTORED'
          : transition.kind === 'delivered_correction'
            ? 'ORDER_HIGH_RISK_CORRECTION'
            : 'ORDER_STATUS_UPDATED';

    await log({
      actorType:   'staff',
      actorId:     req.staff?.id,
      actorName:   req.staff?.name,
      action,
      resource:    'order',
      resourceId:  order.id,
      description: `Order ${order.orderNumber}: ${order.status} → ${status}`,
      metadata:    {
        fromStatus: order.status,
        toStatus: status,
        transitionType: transition.kind,
        reason: trimmedNotes || null,
      },
      ...getRequestMeta(req),
    });

    // Emit real-time update to all CRM SSE subscribers immediately
    emitOrderUpdate(updated.id, { status, orderNumber: updated.orderNumber });

    // Queue WhatsApp + push notifications for key statuses (non-blocking, retried)
    if (WA_NOTIFY_STATUSES.has(status)) {
      enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order: updated, status }).catch(() => {});

      // Push notification — fetch customer's token + prefs if not already included
      const pushMsg = PUSH_MESSAGES[status];
      if (pushMsg && updated.customer) {
        const customerWithPrefs = await prisma.customer.findUnique({
          where:  { id: updated.customer.id },
          select: { pushToken: true, notifPush: true },
        });
        if (customerWithPrefs?.notifPush && customerWithPrefs?.pushToken) {
          enqueueNotification(NOTIFY_JOB.PUSH, {
            token:   customerWithPrefs.pushToken,
            title:   pushMsg.title,
            body:    pushMsg.body,
            payload: { orderId: updated.id, status },
          }).catch(() => {});
        }
      }
    }

    if (status === 'DELIVERED') {
      processReferralQualification(updated.id).catch(() => {});
    }

    return success(res, { order: updated }, `Status updated to ${status}`);
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    return error(res, 'Failed to update status');
  }
};

// ── DELETE /api/v1/orders/:id ─────────────────────────────────────────────────
const deleteOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...ORDER_ONLY_WHERE } });
    if (!order) return notFound(res, 'Order not found');
    if (!['PENDING', 'CANCELLED'].includes(order.status)) {
      return badRequest(res, 'Only PENDING or CANCELLED orders can be deleted');
    }
    await prisma.order.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Order deleted');
  } catch (err) {
    return error(res, 'Failed to delete order');
  }
};

// ── PATCH /api/v1/orders/:id/items ───────────────────────────────────────────
// Add garments to an existing order (e.g. app-booked pickup with no items)
const addItemsToOrder = async (req, res) => {
  try {
    const { id }               = req.params;
    const { items = [], discount } = req.body;

    if (!items.length) return badRequest(res, 'At least one item is required');

    const order = await prisma.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
    if (!order) return notFound(res, 'Order not found');
    if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status)) {
      return badRequest(res, `Cannot add items to a ${order.status.toLowerCase()} order`);
    }
    const normalizedItems = items.map((item) => normalizeOrderItem(item, { defaultServiceName: '' }));
    if (normalizedItems.some((item) => !item.serviceName)) return badRequest(res, 'Each item must include a serviceName');
    if (normalizedItems.some((item) => item.unitPrice < 0)) return badRequest(res, 'Item unitPrice cannot be negative');

    // Create the new items
    await prisma.orderItem.createMany({
      data: normalizedItems.map(item => ({
        orderId:     id,
        serviceId:   item.serviceId || null,
        serviceName: item.serviceName,
        garmentType: item.garmentType || '',
        quantity:    parseInt(item.quantity)  || 1,
        baseUnitPrice: item.baseUnitPrice,
        unitPrice:   parseFloat(item.unitPrice) || 0,
        lineDiscountType: item.lineDiscountType,
        lineDiscountValue: item.lineDiscountValue || 0,
        lineDiscountAmount: item.lineDiscountAmount || 0,
        subtotal:    item.subtotal,
      })),
    });

    // Recalculate totals from ALL items on this order
    const allItems    = await prisma.orderItem.findMany({ where: { orderId: id } });
    const newSubtotal = allItems.reduce((s, i) => s + (i.subtotal || i.unitPrice * i.quantity), 0);
    const newDiscount = discount !== undefined ? Math.max(0, parseFloat(discount)) : (order.discount || 0);
    const newTotal    = Math.max(0, newSubtotal - newDiscount);

    const paidAmount = Number(order.paidAmount || 0);
    const writeOff = Number(order.writeOffAmount || 0);
    const effectivePaid = paidAmount + writeOff;
    const newPaymentStatus = effectivePaid >= newTotal ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';
    const updatedOrder = await prisma.order.update({
      where:   { id },
      data:    { subtotal: newSubtotal, discount: newDiscount, totalAmount: newTotal, paymentStatus: newPaymentStatus },
      include: {
        items:    true,
        stages:   { orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    await prisma.orderStage.create({
      data: {
        orderId:     id,
        stage:       order.status,  // keep same status — just logging items
        notes:       `${items.reduce((s,i)=>s+(parseInt(i.quantity)||1),0)} garment(s) added by staff. New total: ₹${newTotal.toFixed(0)}`,
        changedById: req.staff?.id || null,
      },
    });

    return success(res, { order: updatedOrder }, 'Items added successfully');
  } catch (err) {
    console.error('addItemsToOrder error:', err);
    return error(res, 'Failed to add items');
  }
};

module.exports = {
  listOrders,
  getOrderStats,
  getOrder,
  createOrder,
  updateOrderStatus,
  addItemsToOrder,
  deleteOrder,
};

// ── Record Payment ─────────────────────────────────────────────────────────────
const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method = 'CASH', reference, notes, writeOffAmount } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return badRequest(res, 'Valid amount is required');
    }
    if (!CORE_PAYMENT_METHODS.includes(method)) {
      return badRequest(res, `Payment method must be one of: ${CORE_PAYMENT_METHODS.join(', ')}`);
    }

    const amountNum = Number.parseFloat(amount);
    const writeOffNum = Math.max(0, Number.parseFloat(writeOffAmount) || 0);

    const { updatedOrder, overpayment } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      const {
        balanceDue,
        cappedWriteOff,
        appliedAmount,
        overpayment,
        nextPaidAmount,
        nextWriteOffAmount,
        paymentStatus,
      } = calculatePaymentState(order, amountNum, writeOffNum);

      if (balanceDue <= 0 || (appliedAmount <= 0 && cappedWriteOff <= 0)) {
        const err = new Error('This order is already fully settled');
        err.statusCode = 400;
        throw err;
      }

      if (appliedAmount > 0) {
        await tx.payment.create({
          data: {
            orderId: id,
            amount: appliedAmount,
            method,
            reference: reference || null,
            notes: notes || null,
            collectedBy: req.staff?.id || null,
          },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          paidAmount: nextPaidAmount,
          writeOffAmount: nextWriteOffAmount,
          paymentStatus,
        },
      });

      if (cappedWriteOff > 0) {
        await tx.orderStage.create({
          data: {
            orderId: id,
            stage: 'PAYMENT_RECORDED',
            notes: `₹${cappedWriteOff} written off`,
            changedById: req.staff?.id || null,
          },
        });
      }

      if (appliedAmount > 0) {
        await tx.orderStage.create({
          data: {
            orderId: id,
            stage: 'PAYMENT_RECORDED',
            notes: `₹${appliedAmount} received via ${method}${reference ? ` (Ref: ${reference})` : ''}${overpayment > 0 ? `. ₹${overpayment} credited to wallet` : ''}`,
            changedById: req.staff?.id || null,
          },
        });
      }

      if (overpayment > 0 && order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { walletBalance: { increment: overpayment } },
        });
        await tx.walletTransaction.create({
          data: {
            customerId: order.customerId,
            amount: overpayment,
            type: 'CREDIT',
            reason: `Overpayment on ${order.orderNumber} refunded to wallet`,
            orderId: id,
          },
        });
      }

      return { updatedOrder, overpayment };
    });

    return success(res, { order: updatedOrder, overpayment });
  } catch (err) {
    console.error('recordPayment error:', err);
    if (err.statusCode === 404) return notFound(res, 'Order not found');
    if (err.statusCode === 400) return badRequest(res, err.message || 'Failed to record payment');
    return error(res, 'Failed to record payment');
  }
};

module.exports = {
  listOrders,
  getOrderStats,
  getOrder,
  createOrder,
  updateOrderStatus,
  addItemsToOrder,
  deleteOrder,
  recordPayment,
};
