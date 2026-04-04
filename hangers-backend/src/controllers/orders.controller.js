// ─────────────────────────────────────────────────────────────────────────────
// ORDERS CONTROLLER — Phase 3 CRM Backend
// Endpoints: list, get, create, update status, delete
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                       = require('../config/database');
const { log, getRequestMeta }                      = require('../services/activity.service');
const { success, badRequest, error, notFound }     = require('../utils/response');
const { sendStatusNotification }                   = require('../services/whatsapp-notifications.service');
const { sendPushNotification }                     = require('../services/push.service');
const { generateOrderNumber }                      = require('../utils/order-number');
const { CORE_PAYMENT_METHODS, ORDER_STATUS_KEYS }  = require('../config/master-data');

const WA_NOTIFY_STATUSES = new Set(['PICKED_UP','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED']);

const PUSH_MESSAGES = {
  PICKED_UP:          { title: 'Clothes Picked Up!',       body: 'Your order has been picked up. We\'re on our way to the plant.' },
  READY_FOR_DELIVERY: { title: 'Ready for Delivery!',      body: 'Your order is cleaned and ready. Delivery will be scheduled soon.' },
  OUT_FOR_DELIVERY:   { title: 'Out for Delivery!',        body: 'Your order is on its way. Expect delivery soon.' },
  DELIVERED:          { title: 'Delivered!',               body: 'Your order has been delivered. Thank you for choosing Hangers!' },
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

    const where = {};
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
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
        skip:     (Number(page) - 1) * Number(limit),
        take:     Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      orders,
      pagination: {
        total,
        page:     Number(page),
        limit:    Number(limit),
        pages:    Math.ceil(total / Number(limit)),
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
      totalRevenue,
      todayRevenue,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.order.count({ where: { status: { in: ['PENDING','PROCESSING','WASHING','IRONING','QC'] } } }),
      prisma.order.count({ where: { status: 'READY_FOR_DELIVERY' } }),
      prisma.order.count({ where: { status: 'DELIVERED', createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: 'DELIVERED' } }),
      prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: 'DELIVERED', createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.order.findMany({
        take:    8,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true, phone: true } } },
      }),
    ]);

    return success(res, {
      today: {
        orders:    totalToday,
        delivered: deliveredCount,
        revenue:   todayRevenue._sum.totalAmount || 0,
      },
      active: {
        pending: pendingCount,
        ready:   readyCount,
      },
      allTime: {
        revenue: totalRevenue._sum.totalAmount || 0,
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
    const order = await prisma.order.findUnique({
      where:   { id: req.params.id },
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

    const serviceIds = items.map((item) => item.serviceId).filter(Boolean);
    if (serviceIds.length) {
      const services = await prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, category: true, name: true },
      });

      const dailyIronServiceIds = new Set(
        services.filter((service) => service.category === 'DAILY_IRON').map((service) => service.id)
      );

      if (items.some((item) => item.serviceId && dailyIronServiceIds.has(item.serviceId))) {
        return badRequest(res, 'DAILY_IRON items must be logged through the Daily Iron flow, not a regular order');
      }
    }

    // Calculate totals
    const subtotal    = items.reduce((sum, item) => {
      const upchargeTotal = (item.upcharges || []).reduce((s, u) => s + (u.amount || 0), 0);
      return sum + (item.unitPrice * item.quantity) + upchargeTotal;
    }, 0);
    const totalAmount = Math.max(0, subtotal - discount);

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
          customerId:   customer.id,
          status:       (source === 'counter' || source === 'walk-in') ? 'PICKED_UP' : 'PENDING',
          source,
          subtotal,
          discount,
          totalAmount,
          writeOffAmount: writeOffAmt || 0,
          pickupDate:   pickupDate  ? new Date(pickupDate)  : null,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          notes:        notes || null,
          assignedToId: req.staff?.id || null,
          items: {
            create: items.map(item => ({
              serviceId:   item.serviceId   || null,
              serviceName: item.serviceName || 'Custom',
              garmentType: item.garmentType || '',
              variant:     item.variant     || null,
              quantity:    item.quantity    || 1,
              unitPrice:   item.unitPrice   || 0,
              subtotal:    item.unitPrice * (item.quantity || 1),
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
  try {
    const chk = await prisma.order.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (chk?.status === 'RETURNED') return res.status(400).json({ success: false, message: 'This order has been returned and cannot be updated.' });
    if (chk?.status === 'SENT_TO_PLANT') return res.status(400).json({ success: false, message: 'This order is at the plant. Wait for the challan to be marked as Received.' });
    const origChk = await prisma.order.findUnique({ where: { id: req.params.id }, select: { notes: true, status: true } });
    if (origChk?.status === 'CANCELLED' && origChk?.notes?.includes('[RETURNED')) return res.status(400).json({ success: false, message: 'This order has been returned and is locked.' });
  } catch(e) {}
  const { status, notes } = req.body;

  const validStatuses = ORDER_STATUS_KEYS;

  if (!status || !validStatuses.includes(status)) {
    return badRequest(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const order = await prisma.order.findUnique({
      where:   { id: req.params.id },
      include: { items: { select: { id: true } } },
    });
    if (!order) return notFound(res, 'Order not found');

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

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: req.params.id },
        data:  {
          status,
          deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
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
          notes:       notes || null,
          changedById: req.staff?.id || null,
        },
      });
      return o;
    });

    await log({
      actorType:   'staff',
      actorId:     req.staff?.id,
      actorName:   req.staff?.name,
      action:      'ORDER_STATUS_UPDATED',
      resource:    'order',
      resourceId:  order.id,
      description: `Order ${order.orderNumber}: ${order.status} → ${status}`,
      ...getRequestMeta(req),
    });

    // Fire-and-forget WhatsApp + push notifications for key statuses
    if (WA_NOTIFY_STATUSES.has(status)) {
      sendStatusNotification(updated, status).catch(() => {});

      // Push notification — fetch customer's token + prefs if not already included
      const pushMsg = PUSH_MESSAGES[status];
      if (pushMsg && updated.customer) {
        const customerWithPrefs = await prisma.customer.findUnique({
          where:  { id: updated.customer.id },
          select: { pushToken: true, notifPush: true },
        });
        if (customerWithPrefs?.notifPush && customerWithPrefs?.pushToken) {
          sendPushNotification(
            customerWithPrefs.pushToken,
            pushMsg.title,
            pushMsg.body,
            { orderId: updated.id, status }
          ).catch(() => {});
        }
      }
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
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
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

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return notFound(res, 'Order not found');

    // Create the new items
    await prisma.orderItem.createMany({
      data: items.map(item => ({
        orderId:     id,
        serviceName: item.serviceName,
        garmentType: item.garmentType || '',
        quantity:    parseInt(item.quantity)  || 1,
        unitPrice:   parseFloat(item.unitPrice) || 0,
        subtotal:    (parseFloat(item.unitPrice) || 0) * (parseInt(item.quantity) || 1),
      })),
    });

    // Recalculate totals from ALL items on this order
    const allItems    = await prisma.orderItem.findMany({ where: { orderId: id } });
    const newSubtotal = allItems.reduce((s, i) => s + (i.subtotal || i.unitPrice * i.quantity), 0);
    const newDiscount = discount !== undefined ? parseFloat(discount) : (order.discount || 0);
    const newTotal    = Math.max(0, newSubtotal - newDiscount);

    const updatedOrder = await prisma.order.update({
      where:   { id },
      data:    { subtotal: newSubtotal, discount: newDiscount, totalAmount: newTotal },
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
    const { amount, method = 'CASH', reference, notes } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }
    if (!CORE_PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({ success: false, message: `Payment method must be one of: ${CORE_PAYMENT_METHODS.join(', ')}` });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Create payment record
    await prisma.payment.create({
      data: {
        orderId: id,
        amount: parseFloat(amount),
        method,
        reference: reference || null,
        notes: notes || null,
      }
    });

    // Handle overpayment → wallet
    const rawPaid = parseFloat(amount);
    const newPaidRaw = order.paidAmount + rawPaid;
    const overpayment = newPaidRaw - order.totalAmount;
    const actualPaid = overpayment > 0 ? order.totalAmount - order.paidAmount : rawPaid;
    const newPaidAmount = order.paidAmount + actualPaid;
    const paymentStatus = newPaidAmount >= order.totalAmount ? 'PAID' : newPaidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    const updated = await prisma.order.update({
      where: { id },
      data: { paidAmount: newPaidAmount, paymentStatus }
    });

    // Credit overpayment to wallet
    if (overpayment > 0 && order.customerId) {
      await prisma.customer.update({
        where: { id: order.customerId },
        data:  { walletBalance: { increment: overpayment } }
      });
      await prisma.walletTransaction.create({
        data: {
          customerId: order.customerId,
          amount:     overpayment,
          type:       'CREDIT',
          reason:     `Overpayment on ${order.orderNumber} refunded to wallet`,
          orderId:    id,
        }
      });
    }

    return res.json({ success: true, data: { order: updated, overpayment: overpayment > 0 ? overpayment : 0 } });
  } catch (err) {
    console.error('recordPayment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to record payment' });
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
