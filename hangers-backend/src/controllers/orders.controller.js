// ─────────────────────────────────────────────────────────────────────────────
// ORDERS CONTROLLER — Phase 3 CRM Backend
// Endpoints: list, get, create, update status, archive
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                       = require('../config/database');
const { log, writeAuditEvent, getRequestMeta }     = require('../services/activity.service');
const { success, badRequest, error, notFound, forbidden }     = require('../utils/response');
const { generateOrderNumber }                      = require('../utils/order-number');
const { hasPermission }                            = require('../middleware/rbac');
const { orderStatusUpdateSchema, createOrderSchema, editOrderSchema, orderPaymentSchema, orderRefundSchema, addItemsSchema } = require('../validation/orders.schemas');
const { normalizeOrderItem, roundMoney }           = require('../utils/line-pricing');
const { emitOrderUpdate }                          = require('../services/sse.service');
const { buildOrderSearchOr }                       = require('../utils/order-search');
const { normalizePaymentMethod }                   = require('../utils/payment-method');
const { withDerivedPaymentState }                  = require('../utils/order-payment-state');
const { normalizeOrderSource }                     = require('../utils/order-source');
const { getCapturedPaymentStatusValues, getCorePaymentMethods, getOrderSources, getOrderStatuses, getOrderWorkflow } = require('../services/masterData.service');
const { CommercialRuleError, commitPricingBenefits, resolveOrderPricing } = require('../services/pricing.service');
const { PaymentRuleError, recordOrderRefund, recordOrderSettlement }  = require('../services/payment.service');
const { OUTBOX_EVENT, enqueueOutboxEvent }          = require('../services/outbox.service');
const { BillingRuleError, ensureOrderInvoice, refreshOrderInvoice } = require('../services/billing.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { GarmentUnitError, syncOrderGarmentUnits } = require('../services/garment-unit.service');

const STATUS_CORRECTION_ROLES = ['SUPER_ADMIN', 'MANAGER'];
const HIGH_RISK_STATUS_CORRECTION_ROLES = ['SUPER_ADMIN'];
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const getOrderViewStatuses = (workflow, viewKey) => {
  const viewConfig = workflow.views?.[viewKey];
  if (Array.isArray(viewConfig)) return viewConfig;
  return Array.isArray(viewConfig?.statuses) ? viewConfig.statuses : null;
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasCorrectionAuthority = (staff) =>
  STATUS_CORRECTION_ROLES.includes(staff?.role) || hasPermission(staff, 'orders.edit');

const hasHighRiskCorrectionAuthority = (staff) =>
  HIGH_RISK_STATUS_CORRECTION_ROLES.includes(staff?.role);

const getTransitionContext = (currentStatus, nextStatus, workflow) => {
  const orderStatusSequence = workflow.sequence || [];
  const backwardTransitions = workflow.allowedBackward || {};
  const forwardTransitions = workflow.allowedForward || {};
  const cancellableStatuses = new Set(workflow.cancellableStatuses || []);
  const deliveredCorrectionTargets = new Set(workflow.deliveredCorrectionTargets || []);

  if (currentStatus === nextStatus) return { kind: 'noop' };

  if (currentStatus === 'DELIVERED') {
    if (nextStatus === 'CANCELLED') return { kind: 'forbidden_delivered_cancel' };
    if (deliveredCorrectionTargets.has(nextStatus)) return { kind: 'delivered_correction' };
    return { kind: 'forbidden_delivered_change' };
  }

  if (currentStatus === 'CANCELLED') {
    if (nextStatus === 'PENDING') return { kind: 'restore' };
    return { kind: 'forbidden_cancelled_change' };
  }

  if (nextStatus === 'CANCELLED') {
    return cancellableStatuses.has(currentStatus)
      ? { kind: 'cancel' }
      : { kind: 'forbidden_cancel' };
  }

  const currentIndex = orderStatusSequence.indexOf(currentStatus);
  const nextIndex = orderStatusSequence.indexOf(nextStatus);

  if (currentIndex !== -1 && nextIndex !== -1 && nextIndex > currentIndex) {
    return forwardTransitions[currentStatus]?.includes(nextStatus)
      ? { kind: 'forward' }
      : { kind: 'forbidden_forward' };
  }

  if (currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex) {
    if (backwardTransitions[currentStatus]?.includes(nextStatus)) {
      return { kind: 'backward' };
    }
    return { kind: 'forbidden_backward' };
  }

  if (forwardTransitions[currentStatus]?.includes(nextStatus)) return { kind: 'forward' };
  return { kind: 'forbidden_unknown' };
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
      view,
      search,
      dateFrom,
      dateTo,
      customerId,
    } = req.query;

    const orderWorkflow = await getOrderWorkflow();
    const parsedPage = parsePositiveInt(page);
    const parsedLimit = parsePositiveInt(limit);
    if (!parsedPage) return badRequest(res, 'page must be a positive integer');
    if (!parsedLimit || parsedLimit > 100) return badRequest(res, 'limit must be an integer between 1 and 100');
    const where = { ...ORDER_ONLY_WHERE };
    if (customerId) {
      where.customerId = String(customerId);
    }
    if (view && view !== 'all') {
      const statuses = getOrderViewStatuses(orderWorkflow, view);
      if (!statuses) return badRequest(res, 'Invalid order view');
      if (view === 'cancelled') {
        where.AND = [
          ...(where.AND || []),
          { OR: [
            { status: { in: statuses } },
            { isReturn: true },
            { orderNumber: { contains: '-RT-', mode: 'insensitive' } },
          ] },
        ];
      } else {
        where.status = { in: statuses };
      }
    } else if (status === 'PROCESSING') {
      where.status = { in: getOrderViewStatuses(orderWorkflow, 'in_process') || [] };
    } else if (status) {
      where.status = status;
    }
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
      where.OR = buildOrderSearchOr(search);
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer:   { select: { id: true, name: true, phone: true } },
          items:      { include: { service: { select: { name: true, category: true } } } },
          payments:   { select: { amount: true, status: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
        orderBy:  { createdAt: 'desc' },
        skip:     (parsedPage - 1) * parsedLimit,
        take:     parsedLimit,
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      orders: orders.map(withDerivedPaymentState),
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
    const [orderWorkflow, capturedPaymentStatuses] = await Promise.all([
      getOrderWorkflow(),
      getCapturedPaymentStatusValues(),
    ]);

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
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: getOrderViewStatuses(orderWorkflow, 'in_process') || [] } } }),
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: getOrderViewStatuses(orderWorkflow, 'ready') || [] } } }),
      prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: getOrderViewStatuses(orderWorkflow, 'delivered') || [] }, createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: { in: capturedPaymentStatuses } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: capturedPaymentStatuses },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.order.findMany({
        where: ORDER_ONLY_WHERE,
        take:    8,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          payments: { select: { amount: true, status: true } },
        },
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
      recentOrders: recentOrders.map(withDerivedPaymentState),
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
        items:      { include: { service: true, garmentUnits: { where: { status: { not: 'VOID' } }, orderBy: { sequence: 'asc' } } } },
        stages:     { orderBy: { createdAt: 'asc' } },
        assignedTo: { select: { id: true, name: true, role: true } },
        payments:   true,
      },
    });
    if (!order) return notFound(res, 'Order not found');
    return success(res, { order: withDerivedPaymentState(order) });
  } catch (err) {
    return error(res, 'Failed to fetch order');
  }
};

// ── POST /api/v1/orders ───────────────────────────────────────────────────────
const createOrder = async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid order payload');

  const {
    customerId,
    customerPhone,
    customerName,
    items,
    pickupDate,
    deliveryDate,
    pickupAddress,
    pickupSlot,
    notes,
    source: rawSource = 'COUNTER',
    discount = 0,
    couponCode,
    loyaltyPointsRedeemed = 0,
    walletAmount = 0,
    commercialReason,
    paymentMethod,
    paidAmount = 0,
    writeOffAmount = 0,
    writeOffReason,
  } = parsed.data;

  try {
    if (pickupDate && deliveryDate && new Date(deliveryDate) < new Date(pickupDate)) {
      return badRequest(res, 'deliveryDate cannot be before pickupDate');
    }

    const [corePaymentMethods, orderSources] = await Promise.all([
      getCorePaymentMethods(),
      getOrderSources(),
    ]);
    const sourceMeta = normalizeOrderSource(rawSource, orderSources);
    if (!sourceMeta) return badRequest(res, 'Invalid order source');
    if (!sourceMeta.initialStatus) return badRequest(res, 'Order source is missing its initial status');
    const source = sourceMeta.value;
    const initialStatus = sourceMeta.initialStatus;

    const externalAmount = Number(paidAmount || 0);
    const storedValueAmount = Number(walletAmount || 0);
    const normalizedPaymentMethod = externalAmount > 0 ? normalizePaymentMethod(paymentMethod) : null;
    if (externalAmount > 0 && !corePaymentMethods.includes(normalizedPaymentMethod)) {
      return badRequest(res, `Payment method must be one of: ${corePaymentMethods.join(', ')}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      let customer;
      let customerCreated = false;
      if (customerId) {
        customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new CommercialRuleError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
      } else {
        const phone = customerPhone.replace(/\D/g, '').slice(-10);
        if (phone.length !== 10) throw new CommercialRuleError('INVALID_CUSTOMER_PHONE', 'A valid 10-digit customer phone is required');
        const existing = await tx.customer.findUnique({ where: { phone } });
        customer = existing || await tx.customer.create({ data: { phone, name: customerName || null } });
        customerCreated = !existing;
      }

      const pricing = await resolveOrderPricing(tx, {
        items,
        customerId: customer.id,
        couponCode,
        loyaltyPointsRedeemed,
        discount,
        commercialReason,
        staff: req.staff,
      });
      const orderNumber = await generateOrderNumber({ client: tx });
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId:   customer.id,
          status:       initialStatus,
          source,
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          discountReason: pricing.discount > 0 ? pricing.commercialReason : null,
          discountApprovedById: pricing.discount > 0 ? req.staff?.id || null : null,
          couponCode: pricing.couponCode,
          couponDiscount: pricing.couponDiscount,
          loyaltyPointsRedeemed: pricing.loyaltyPointsRedeemed,
          loyaltyDiscount: pricing.loyaltyDiscount,
          totalAmount: pricing.totalAmount,
          paymentStatus: pricing.totalAmount <= 0 ? 'PAID' : 'UNPAID',
          pickupDate:   pickupDate  ? new Date(pickupDate)  : null,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          pickupAddress: pickupAddress || null,
          pickupSlot: pickupSlot || null,
          notes:        notes || null,
          assignedToId: req.staff?.id || null,
          pricingSnapshot: {
            resolvedAt: new Date().toISOString(),
            source: 'CRM_CATALOG',
            overrides: pricing.overrideDetails,
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            couponDiscount: pricing.couponDiscount,
            loyaltyDiscount: pricing.loyaltyDiscount,
            totalAmount: pricing.totalAmount,
          },
          items: {
            create: pricing.items.map((item, index) => {
              const override = pricing.overrideDetails.find((entry) => entry.line === index + 1 && ['CUSTOM_ITEM', 'PRICE_OVERRIDE'].includes(entry.kind));
              return {
              serviceId:   item.serviceId   || null,
              serviceName: item.serviceName,
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
              catalogUnitPrice: item.baseUnitPrice,
              priceSource: override?.kind || 'CATALOG',
              priceOverrideReason: override?.reason || null,
              priceOverriddenById: override ? req.staff?.id || null : null,
              pricingSnapshot: {
                catalogUnitPrice: item.baseUnitPrice,
                unitPrice: item.unitPrice,
                lineDiscountType: item.lineDiscountType,
                lineDiscountValue: item.lineDiscountValue,
                lineDiscountAmount: item.lineDiscountAmount,
                upcharges: item.upcharges,
              },
            };
            }),
          },
          stages: {
            create: {
              stage:       initialStatus,
              notes:       `Order created from ${sourceMeta.label}`,
              changedById: req.staff?.id || null,
            },
          },
        },
      });

      await syncOrderGarmentUnits(tx, newOrder.id);
      await ensureOrderInvoice(tx, newOrder.id, req.staff?.id);
      await commitPricingBenefits(tx, pricing, { customerId: customer.id, orderId: newOrder.id });

      let settlement = null;
      if (externalAmount > 0 || storedValueAmount > 0 || Number(writeOffAmount || 0) > 0) {
        settlement = await recordOrderSettlement(tx, {
          orderId: newOrder.id,
          amount: externalAmount,
          walletAmount: storedValueAmount,
          method: normalizedPaymentMethod,
          writeOffAmount,
          writeOffReason: writeOffReason || commercialReason,
          staff: req.staff,
          idempotencyKey: req.idempotencyKey,
        });
      }

      const order = await tx.order.findUnique({
        where: { id: newOrder.id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
          stages: { orderBy: { createdAt: 'asc' } },
          payments: { orderBy: { createdAt: 'asc' } },
          financialAdjustments: { orderBy: { createdAt: 'asc' } },
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'ORDER_CREATED',
        resource: 'order',
        resourceId: newOrder.id,
        description: `Order ${order.orderNumber} created for ${customer.name || customer.phone}`,
        metadata: {
          orderNumber: order.orderNumber,
          source,
          initialStatus,
          customerCreated,
          pricing: {
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            couponCode: pricing.couponCode,
            couponDiscount: pricing.couponDiscount,
            loyaltyPointsRedeemed: pricing.loyaltyPointsRedeemed,
            loyaltyDiscount: pricing.loyaltyDiscount,
            totalAmount: pricing.totalAmount,
            overrides: pricing.overrideDetails,
          },
          settlement: settlement ? {
            paidAmount: settlement.paidAmount,
            writeOffAmount: settlement.writeOffAmount,
            paymentStatus: settlement.paymentStatus,
          } : null,
        },
        ...getRequestMeta(req),
      });

      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_STATUS,
        aggregateType: 'order',
        aggregateId: newOrder.id,
        payload: { status: initialStatus },
        dedupeKey: `order-created-status:${newOrder.id}:${initialStatus}`,
      });
      for (const payment of settlement?.payments || []) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.PAYMENT_RECEIVED,
          aggregateType: 'order',
          aggregateId: newOrder.id,
          payload: { paymentId: payment.id },
          dedupeKey: `payment-received:${payment.id}`,
        });
      }
      if (settlement?.paymentStatus === 'PAID') {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.REFERRAL_QUALIFY,
          aggregateType: 'order',
          aggregateId: newOrder.id,
          payload: {},
          dedupeKey: `referral-qualify:${newOrder.id}:paid`,
        });
      }

      return { order, customer, settlement };
    }, { isolationLevel: 'Serializable' });

    return success(res, { order: result.order }, `Order ${result.order.orderNumber} created successfully`, 201);
  } catch (err) {
    console.error('createOrder error:', err);
    if (err instanceof CommercialRuleError || err instanceof PaymentRuleError || err instanceof BillingRuleError || err instanceof GarmentUnitError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034' || err?.code === 'P2002') return badRequest(res, 'Order changed concurrently; retry with the same idempotency key');
    return error(res, 'Failed to create order');
  }
};

// ── PATCH /api/v1/orders/:id ─────────────────────────────────────────────────
// Replace editable order commercial details: item lines, discount, notes, delivery date.
const updateOrder = async (req, res) => {
  const parsed = editOrderSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid order edit payload');

  try {
    const { id } = req.params;
    const { items, discount = 0, deliveryDate, notes, reason, commercialReason, version } = parsed.data;
    const orderWorkflow = await getOrderWorkflow();
    const transactionResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id, ...ORDER_ONLY_WHERE },
        include: {
          items: true,
          challanOrders: { include: { challan: { select: { challanNo: true, status: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
        },
      });
      if (!order) throw new CommercialRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (order.version !== version) {
        throw new CommercialRuleError('STALE_ORDER_VERSION', 'This order changed after it was opened. Refresh before editing.', 409);
      }
      if (order.isReturn) throw new CommercialRuleError('RETURN_EDIT_FORBIDDEN', 'Return or re-clean orders cannot be edited here');
      if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status)) {
        throw new CommercialRuleError('ORDER_EDIT_FORBIDDEN', `Cannot edit a ${order.status.toLowerCase()} order. Use a correction document.`);
      }

      const plantLockedStatuses = new Set(orderWorkflow.plantLockedStatuses || []);
      const activeChallan = order.challanOrders.find((entry) => ['DISPATCHED', 'PARTIAL', 'PROCESSED'].includes(entry.challan?.status));
      if (plantLockedStatuses.has(order.status) || activeChallan) {
        throw new CommercialRuleError('PLANT_LOCKED', activeChallan
          ? `Cannot edit items after plant challan ${activeChallan.challan?.challanNo || ''} is active`
          : 'Cannot edit items while the order is in the plant workflow');
      }

      const pricing = await resolveOrderPricing(tx, {
        items,
        customerId: order.customerId,
        discount,
        commercialReason: commercialReason || reason,
        staff: req.staff,
      });
      const retainedIncentives = roundMoney(Number(order.couponDiscount || 0) + Number(order.loyaltyDiscount || 0));
      if (retainedIncentives > pricing.totalAmount) {
        throw new CommercialRuleError('INCENTIVE_EXCEEDS_REPRICED_TOTAL', 'Existing coupon or loyalty value exceeds the repriced order. Reverse the incentive before editing.');
      }
      const totalAmount = roundMoney(pricing.totalAmount - retainedIncentives);
      const settledAmount = roundMoney(Number(order.paidAmount || 0) + Number(order.writeOffAmount || 0));
      if (totalAmount < settledAmount) {
        throw new CommercialRuleError(
          'TOTAL_BELOW_SETTLED_AMOUNT',
          `Repriced total cannot be below the settled amount of Rs ${settledAmount.toFixed(2)}. Create a refund or credit adjustment first.`
        );
      }

      const existingIds = new Set(order.items.map((item) => item.id));
      const suppliedIds = items.map((item) => item.id).filter(Boolean);
      const invalidIds = suppliedIds.filter((itemId) => !existingIds.has(itemId));
      if (invalidIds.length) throw new CommercialRuleError('INVALID_ORDER_ITEM', 'One or more edited lines do not belong to this order');
      const removedIds = order.items.map((item) => item.id).filter((itemId) => !suppliedIds.includes(itemId));
      if (removedIds.length) {
        const referenced = await tx.challanItem.count({ where: { orderItemId: { in: removedIds } } });
        if (referenced > 0) throw new CommercialRuleError('HISTORICAL_LINE_LOCKED', 'A line referenced by a plant challan cannot be removed');
        await tx.orderItem.deleteMany({ where: { id: { in: removedIds }, orderId: id } });
      }

      for (let index = 0; index < pricing.items.length; index += 1) {
        const item = pricing.items[index];
        const input = items[index];
        const override = pricing.overrideDetails.find((entry) => entry.line === index + 1 && ['CUSTOM_ITEM', 'PRICE_OVERRIDE'].includes(entry.kind));
        const data = {
          serviceId: item.serviceId || null,
          serviceName: item.serviceName,
          garmentType: item.garmentType || '',
          variant: item.variant || null,
          quantity: item.quantity,
          baseUnitPrice: item.baseUnitPrice,
          catalogUnitPrice: item.baseUnitPrice,
          unitPrice: item.unitPrice,
          lineDiscountType: item.lineDiscountType,
          lineDiscountValue: item.lineDiscountValue || 0,
          lineDiscountAmount: item.lineDiscountAmount || 0,
          subtotal: item.subtotal,
          upcharges: item.upcharges?.length ? JSON.stringify(item.upcharges) : null,
          notes: item.notes || null,
          priceSource: override?.kind || 'CATALOG',
          priceOverrideReason: override?.reason || null,
          priceOverriddenById: override ? req.staff?.id || null : null,
          pricingSnapshot: {
            catalogUnitPrice: item.baseUnitPrice,
            unitPrice: item.unitPrice,
            lineDiscountType: item.lineDiscountType,
            lineDiscountValue: item.lineDiscountValue,
            lineDiscountAmount: item.lineDiscountAmount,
            upcharges: item.upcharges,
          },
        };
        if (input.id) await tx.orderItem.update({ where: { id: input.id }, data });
        else await tx.orderItem.create({ data: { ...data, orderId: id } });
      }

      const effectivePaid = settledAmount;
      const paymentStatus = effectivePaid >= totalAmount ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';
      const beforeSummary = {
        version: order.version,
        subtotal: order.subtotal,
        discount: order.discount,
        totalAmount: order.totalAmount,
        itemCount: order.items.length,
        pieces: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };
      const afterSummary = {
        version: order.version + 1,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        totalAmount,
        itemCount: pricing.items.length,
        pieces: pricing.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };

      await tx.order.update({
        where: { id },
        data: {
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          discountReason: pricing.discount > 0 ? pricing.commercialReason || reason : null,
          discountApprovedById: pricing.discount > 0 ? req.staff?.id || null : null,
          totalAmount,
          paymentStatus,
          version: { increment: 1 },
          pricingSnapshot: {
            resolvedAt: new Date().toISOString(),
            source: 'CRM_CATALOG_REPRICE',
            reason,
            overrides: pricing.overrideDetails,
            retainedCouponDiscount: Number(order.couponDiscount || 0),
            retainedLoyaltyDiscount: Number(order.loyaltyDiscount || 0),
            totalAmount,
          },
          deliveryDate: Object.prototype.hasOwnProperty.call(parsed.data, 'deliveryDate') ? deliveryDate : order.deliveryDate,
          notes: Object.prototype.hasOwnProperty.call(parsed.data, 'notes') ? notes : order.notes,
        },
      });
      await syncOrderGarmentUnits(tx, id, { voidReason: reason });
      await refreshOrderInvoice(tx, id, req.staff?.id, reason);
      await tx.orderStage.create({
        data: {
          orderId: id,
          stage: 'ORDER_EDITED',
          notes: `[ORDER_EDIT] ${reason}. Total ${Number(order.totalAmount).toFixed(2)} -> ${totalAmount.toFixed(2)}`,
          changedById: req.staff?.id || null,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'ORDER_EDITED', resource: 'order', resourceId: id,
        description: `Order ${order.orderNumber} edited: Rs ${Number(order.totalAmount).toFixed(2)} -> Rs ${totalAmount.toFixed(2)}`,
        metadata: { orderNumber: order.orderNumber, reason, before: beforeSummary, after: afterSummary, overrides: pricing.overrideDetails },
        ...getRequestMeta(req),
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_UPDATED,
        aggregateType: 'order',
        aggregateId: id,
        payload: { version: order.version + 1 },
        dedupeKey: `order-updated:${id}:v${order.version + 1}`,
      });

      const updatedOrder = await tx.order.findUnique({
        where: { id },
        include: {
          items: true,
          stages: { orderBy: { createdAt: 'asc' } },
          payments: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      });
      return { updatedOrder, beforeSummary, afterSummary };
    }, { isolationLevel: 'Serializable' });

    const { updatedOrder, beforeSummary, afterSummary } = transactionResult;
    emitOrderUpdate(updatedOrder.id, { status: updatedOrder.status, orderNumber: updatedOrder.orderNumber, totalAmount: updatedOrder.totalAmount });
    return success(res, { order: updatedOrder, before: beforeSummary, after: afterSummary }, 'Order updated successfully');
  } catch (err) {
    console.error('updateOrder error:', err);
    if (err instanceof CommercialRuleError || err instanceof BillingRuleError || err instanceof GarmentUnitError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      if (err.statusCode === 409) return res.status(409).json({ success: false, message: err.message });
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034') return res.status(409).json({ success: false, message: 'Order changed concurrently; refresh and retry' });
    return error(res, 'Failed to update order');
  }
};

// ── PATCH /api/v1/orders/:id/status ──────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
  const parsed = orderStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid status update payload');
  const { status, notes, reasonCode, expectedVersion } = parsed.data;

  try {
    const [orderWorkflow, orderStatuses] = await Promise.all([
      getOrderWorkflow(),
      getOrderStatuses(),
    ]);
    const orderStatusKeys = orderStatuses.map((item) => item.key);
    if (!orderStatusKeys.includes(status)) return badRequest(res, 'Invalid order status');
    const trimmedNotes = notes?.trim() || '';
    const transactionResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: req.params.id, ...ORDER_ONLY_WHERE },
        include: {
          items: { select: { id: true } },
          walletTxns: { select: { id: true } },
          financialAdjustments: { where: { status: 'POSTED' }, select: { id: true, kind: true, amount: true } },
        },
      });
      if (!order) throw new CommercialRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (expectedVersion && order.version !== expectedVersion) {
        throw new CommercialRuleError('STALE_ORDER_VERSION', 'This order changed after it was opened. Refresh before changing status.', 409);
      }
      if (order.status === 'RETURNED') throw new CommercialRuleError('RETURNED_ORDER_LOCKED', 'This order has been returned and cannot be updated');
      if (order.status === 'SENT_TO_PLANT') throw new CommercialRuleError('PLANT_ORDER_LOCKED', 'This order is at the plant. Receive the challan before changing status');

      const transition = getTransitionContext(order.status, status, orderWorkflow);
      const requiresCorrectionAuthority = ['backward', 'cancel', 'restore'].includes(transition.kind);
      const requiresHighRiskAuthority = transition.kind === 'delivered_correction';
      const requiresReason = ['backward', 'cancel', 'restore', 'delivered_correction'].includes(transition.kind);
      if (transition.kind === 'noop') throw new CommercialRuleError('STATUS_NOOP', 'Order is already in that status');
      if (requiresCorrectionAuthority && !hasCorrectionAuthority(req.staff)) {
        throw new CommercialRuleError('STATUS_AUTHORITY_REQUIRED', 'Only managers or staff with order edit authority can make status corrections', 403);
      }
      if (requiresHighRiskAuthority && !hasHighRiskCorrectionAuthority(req.staff)) {
        throw new CommercialRuleError('HIGH_RISK_AUTHORITY_REQUIRED', 'Only super admins can change a delivered order', 403);
      }
      if (requiresReason && !trimmedNotes) throw new CommercialRuleError('STATUS_REASON_REQUIRED', 'A reason note is required for this status correction');

      const forbiddenTransitions = {
        forbidden_backward: 'That backward status change is not allowed. Use the approved correction steps only.',
        forbidden_forward: 'That status change is not allowed in the current workflow.',
        forbidden_unknown: 'This status combination is not defined in the active workflow.',
        forbidden_cancel: 'This order can no longer be cancelled from its current workflow state.',
        forbidden_cancelled_change: 'Cancelled orders can only be restored back to Pending.',
        forbidden_delivered_cancel: 'Delivered orders cannot be cancelled. Use the return or re-clean flow instead.',
        forbidden_delivered_change: 'Delivered orders are locked from normal workflow changes.',
      };
      if (forbiddenTransitions[transition.kind]) {
        throw new CommercialRuleError('STATUS_TRANSITION_FORBIDDEN', forbiddenTransitions[transition.kind]);
      }
      if (transition.kind === 'cancel') {
        const hasFinancialImpact = Number(order.paidAmount || 0) > 0
          || Number(order.writeOffAmount || 0) > 0
          || order.walletTxns.length > 0
          || order.financialAdjustments.length > 0;
        if (hasFinancialImpact) {
          throw new CommercialRuleError('CANCELLATION_REVERSAL_REQUIRED', 'This order has financial activity. Post refunds or reversals before cancellation.');
        }
      }
      if ((orderWorkflow.requiresItems || []).includes(status) && order.items.length === 0) {
        throw new CommercialRuleError('ITEMS_REQUIRED', 'Add garment items before moving this order to processing', 422);
      }

      const canonicalReasonCode = reasonCode || {
        backward: 'WORKFLOW_CORRECTION',
        cancel: 'ORDER_CANCELLATION',
        restore: 'ORDER_RESTORATION',
        delivered_correction: 'DELIVERED_ORDER_CORRECTION',
        forward: 'NORMAL_PROGRESSION',
      }[transition.kind] || 'WORKFLOW_TRANSITION';
      const action = transition.kind === 'backward'
        ? 'ORDER_STATUS_REVERSED'
        : transition.kind === 'cancel'
          ? 'ORDER_CANCELLED'
          : transition.kind === 'restore'
            ? 'ORDER_RESTORED'
            : transition.kind === 'delivered_correction'
              ? 'ORDER_HIGH_RISK_CORRECTION'
              : 'ORDER_STATUS_UPDATED';

      const updated = await tx.order.update({
        where: { id: req.params.id },
        data:  {
          status,
          version: { increment: 1 },
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
          eventType:   transition.kind === 'forward' ? 'WORKFLOW_TRANSITION' : 'WORKFLOW_CORRECTION',
          fromStatus:  order.status,
          toStatus:    status,
          reasonCode:  canonicalReasonCode,
          notes:       trimmedNotes || null,
          metadata:    { transitionType: transition.kind, beforeVersion: order.version, afterVersion: order.version + 1 },
          changedById: req.staff?.id || null,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action, resource: 'order', resourceId: order.id,
        description: `Order ${order.orderNumber}: ${order.status} -> ${status}`,
        metadata: {
          fromStatus: order.status,
          toStatus: status,
          transitionType: transition.kind,
          reasonCode: canonicalReasonCode,
          reason: trimmedNotes || null,
          beforeVersion: order.version,
          afterVersion: order.version + 1,
        },
        ...getRequestMeta(req),
      });
      const liveStatus = (orderWorkflow.liveStatuses || []).includes(status) && status !== 'RETURNED';
      if (liveStatus) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.ORDER_STATUS,
          aggregateType: 'order',
          aggregateId: order.id,
          payload: { status, push: orderWorkflow.pushNotifications?.[status] || null },
          dedupeKey: `order-status:${order.id}:v${order.version + 1}:${status}`,
        });
      }
      if (status === 'DELIVERED') {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.REFERRAL_QUALIFY,
          aggregateType: 'order',
          aggregateId: order.id,
          payload: {},
          dedupeKey: `referral-qualify:${order.id}:delivered`,
        });
      }
      return { updated, transition };
    }, { isolationLevel: 'Serializable' });
    const { updated } = transactionResult;

    // Emit real-time update to all CRM SSE subscribers immediately
    emitOrderUpdate(updated.id, { status, orderNumber: updated.orderNumber });

    return success(res, { order: updated }, `Status updated to ${status}`);
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    if (err instanceof CommercialRuleError || err instanceof BillingRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      if (err.statusCode === 409) return res.status(409).json({ success: false, message: err.message });
      if (err.statusCode === 422) return res.status(422).json({ success: false, code: err.code, message: err.message });
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034') return res.status(409).json({ success: false, message: 'Order changed concurrently; refresh and retry' });
    return error(res, 'Failed to update status');
  }
};

// ── DELETE /api/v1/orders/:id ─────────────────────────────────────────────────
const deleteOrder = async (req, res) => {
  try {
    const orderWorkflow = await getOrderWorkflow();
    const deletableStatuses = new Set(orderWorkflow.deletableStatuses || []);
    const archived = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: req.params.id, ...ORDER_ONLY_WHERE },
        include: {
          payments: { select: { id: true } },
          paymentAllocations: { select: { id: true } },
          financialAdjustments: { select: { id: true } },
          challanOrders: { select: { id: true } },
          walletTxns: { select: { id: true } },
        },
      });
      if (!order) throw new CommercialRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (!deletableStatuses.has(order.status)) {
        throw new CommercialRuleError('ORDER_ARCHIVE_FORBIDDEN', `Only ${[...deletableStatuses].join(' or ')} orders can be archived`);
      }
      const hasFinancialEvidence = order.payments.length > 0
        || order.paymentAllocations.length > 0
        || order.financialAdjustments.length > 0
        || order.walletTxns.length > 0;
      if (hasFinancialEvidence || order.challanOrders.length > 0) {
        throw new CommercialRuleError('ORDER_EVIDENCE_LOCKED', 'This order has financial or plant evidence. Use cancellation, refund, or correction workflows.');
      }

      const notes = [
        order.notes || '',
        `[ARCHIVED_NOT_DELETED] ${new Date().toISOString()} by ${req.staff?.name || req.staff?.id || 'staff'}`,
      ].filter(Boolean).join('\n');

      const updated = await tx.order.update({
        where: { id: req.params.id },
        data: {
          status: 'CANCELLED',
          notes,
          version: { increment: 1 },
        },
      });

      await tx.orderStage.create({
        data: {
          orderId: req.params.id,
          stage: 'ARCHIVED_NOT_DELETED',
          eventType: 'ARCHIVE',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          reasonCode: 'ARCHIVE_REQUEST',
          notes: 'Delete request converted to archive. Order, items, and audit history retained.',
          metadata: { beforeVersion: order.version, afterVersion: order.version + 1 },
          changedById: req.staff?.id || null,
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'ORDER_ARCHIVED_NOT_DELETED', resource: 'order', resourceId: updated.id,
        description: `Order ${updated.orderNumber} archive requested; physical deletion blocked by policy`,
        metadata: { orderNumber: updated.orderNumber, previousStatus: order.status, newStatus: updated.status, beforeVersion: order.version, afterVersion: order.version + 1 },
        ...getRequestMeta(req),
      });

      return updated;
    }, { isolationLevel: 'Serializable' });

    emitOrderUpdate(archived.id, { status: archived.status, orderNumber: archived.orderNumber });
    return success(res, { order: archived }, 'Order archived. No financial or audit records were deleted.');
  } catch (err) {
    if (err instanceof CommercialRuleError || err instanceof GarmentUnitError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to archive order');
  }
};

// ── PATCH /api/v1/orders/:id/items ───────────────────────────────────────────
// Add garments to an existing order (e.g. app-booked pickup with no items)
const addItemsToOrder = async (req, res) => {
  const parsed = addItemsSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid order itemization payload');

  try {
    const { id } = req.params;
    const { items, discount = 0, commercialReason, version } = parsed.data;
    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id, ...ORDER_ONLY_WHERE },
        include: { items: { select: { id: true } } },
      });
      if (!order) throw new CommercialRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (order.version !== version) throw new CommercialRuleError('STALE_ORDER_VERSION', 'This order changed after it was opened. Refresh before itemizing.', 409);
      if (order.items.length) throw new CommercialRuleError('ORDER_ALREADY_ITEMIZED', 'This endpoint only itemizes an empty pickup order. Use full order edit for existing lines.');
      if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status)) {
        throw new CommercialRuleError('ORDER_EDIT_FORBIDDEN', `Cannot itemize a ${order.status.toLowerCase()} order`);
      }
      if (Number(order.paidAmount || 0) > 0 || Number(order.writeOffAmount || 0) > 0) {
        throw new CommercialRuleError('SETTLED_EMPTY_ORDER', 'A settled empty order must be corrected before itemization');
      }

      const pricing = await resolveOrderPricing(tx, {
        items,
        customerId: order.customerId,
        discount,
        commercialReason,
        staff: req.staff,
      });
      for (let index = 0; index < pricing.items.length; index += 1) {
        const item = pricing.items[index];
        const override = pricing.overrideDetails.find((entry) => entry.line === index + 1 && ['CUSTOM_ITEM', 'PRICE_OVERRIDE'].includes(entry.kind));
        await tx.orderItem.create({
          data: {
            orderId: id,
            serviceId: item.serviceId || null,
            serviceName: item.serviceName,
            garmentType: item.garmentType || '',
            variant: item.variant || null,
            quantity: item.quantity,
            baseUnitPrice: item.baseUnitPrice,
            catalogUnitPrice: item.baseUnitPrice,
            unitPrice: item.unitPrice,
            lineDiscountType: item.lineDiscountType,
            lineDiscountValue: item.lineDiscountValue || 0,
            lineDiscountAmount: item.lineDiscountAmount || 0,
            subtotal: item.subtotal,
            upcharges: item.upcharges?.length ? JSON.stringify(item.upcharges) : null,
            notes: item.notes || null,
            priceSource: override?.kind || 'CATALOG',
            priceOverrideReason: override?.reason || null,
            priceOverriddenById: override ? req.staff?.id || null : null,
          },
        });
      }
      await tx.order.update({
        where: { id },
        data: {
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          discountReason: pricing.discount > 0 ? pricing.commercialReason : null,
          discountApprovedById: pricing.discount > 0 ? req.staff?.id || null : null,
          totalAmount: pricing.totalAmount,
          paymentStatus: pricing.totalAmount <= 0 ? 'PAID' : 'UNPAID',
          pricingSnapshot: { resolvedAt: new Date().toISOString(), source: 'PICKUP_ITEMIZATION', overrides: pricing.overrideDetails },
          version: { increment: 1 },
        },
      });
      await syncOrderGarmentUnits(tx, id, { voidReason: commercialReason || 'PICKUP_ITEMIZATION' });
      await refreshOrderInvoice(tx, id, req.staff?.id, commercialReason || 'PICKUP_ITEMIZATION');
      const pieceCount = pricing.items.reduce((sum, item) => sum + item.quantity, 0);
      await tx.orderStage.create({
        data: {
          orderId: id,
          stage: 'ORDER_ITEMIZED',
          notes: `${pieceCount} garment(s) itemized. Total Rs ${pricing.totalAmount.toFixed(2)}`,
          changedById: req.staff?.id || null,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'ORDER_ITEMIZED', resource: 'order', resourceId: id,
        description: `${order.orderNumber} itemized with ${pieceCount} garment(s)`,
        metadata: { orderNumber: order.orderNumber, beforeVersion: version, afterVersion: version + 1, pricing },
        ...getRequestMeta(req),
      });
      return tx.order.findUnique({
        where: { id },
        include: { items: true, stages: { orderBy: { createdAt: 'asc' } }, customer: { select: { id: true, name: true, phone: true } } },
      });
    }, { isolationLevel: 'Serializable' });

    return success(res, { order: updatedOrder }, 'Order itemized successfully');
  } catch (err) {
    console.error('addItemsToOrder error:', err);
    if (err instanceof CommercialRuleError || err instanceof BillingRuleError || err instanceof GarmentUnitError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      if (err.statusCode === 409) return res.status(409).json({ success: false, message: err.message });
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to add items');
  }
};

// ── Record Payment ─────────────────────────────────────────────────────────────
const recordPayment = async (req, res) => {
  const parsed = orderPaymentSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid payment payload');

  try {
    const { id } = req.params;
    const { amount, method, reference, notes, writeOffAmount = 0, writeOffReason } = parsed.data;
    const normalizedMethod = normalizePaymentMethod(method);
    const corePaymentMethods = await getCorePaymentMethods();
    if (amount > 0 && !corePaymentMethods.includes(normalizedMethod)) {
      return badRequest(res, `Payment method must be one of: ${corePaymentMethods.join(', ')}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!before) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      const settlement = await recordOrderSettlement(tx, {
        orderId: id,
        amount,
        method: normalizedMethod,
        reference,
        notes,
        writeOffAmount,
        writeOffReason,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { createdAt: 'asc' } },
          financialAdjustments: { orderBy: { createdAt: 'asc' } },
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'PAYMENT_RECORDED',
        resource: 'order',
        resourceId: id,
        description: `Settlement recorded for ${before.orderNumber}`,
        metadata: {
          orderNumber: before.orderNumber,
          paymentIds: settlement.payments.map((payment) => payment.id),
          adjustmentId: settlement.adjustment?.id || null,
          method: normalizedMethod,
          reference: reference || null,
          before: {
            paidAmount: before.paidAmount,
            writeOffAmount: before.writeOffAmount,
            paymentStatus: before.paymentStatus,
          },
          after: {
            paidAmount: settlement.paidAmount,
            writeOffAmount: settlement.writeOffAmount,
            paymentStatus: settlement.paymentStatus,
            balanceDue: settlement.balanceDue,
          },
        },
        ...getRequestMeta(req),
      });
      for (const payment of settlement.payments) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.PAYMENT_RECEIVED,
          aggregateType: 'order',
          aggregateId: id,
          payload: { paymentId: payment.id },
          dedupeKey: `payment-received:${payment.id}`,
        });
      }
      if (settlement.paymentStatus === 'PAID') {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.REFERRAL_QUALIFY,
          aggregateType: 'order',
          aggregateId: id,
          payload: {},
          dedupeKey: `referral-qualify:${id}:paid-v${order.version}`,
        });
      }

      return { settlement, order };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      order: result.order,
      payments: result.settlement.payments,
      adjustment: result.settlement.adjustment,
      balanceDue: result.settlement.balanceDue,
    }, 'Payment recorded successfully');
  } catch (err) {
    console.error('recordPayment error:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    if (err instanceof BillingRuleError) return badRequest(res, err.message);
    if (err?.code === 'P2034') return badRequest(res, 'Payment conflicted with another update; retry with the same idempotency key');
    return error(res, 'Failed to record payment');
  }
};

const refundPayment = async (req, res) => {
  const parsed = orderRefundSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid refund payload');
  try {
    const normalizedMethod = parsed.data.method ? normalizePaymentMethod(parsed.data.method) : undefined;
    if (normalizedMethod) {
      const methods = await getCorePaymentMethods();
      if (!methods.includes(normalizedMethod)) return badRequest(res, `Refund method must be one of: ${methods.join(', ')}`);
    }
    const result = await prisma.$transaction(async (tx) => {
      const refund = await recordOrderRefund(tx, {
        orderId: req.params.id,
        ...parsed.data,
        method: normalizedMethod,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'ORDER_REFUND_ISSUED', resource: 'payment', resourceId: refund.refundPayment.id,
        description: `${refund.creditNote.creditNoteNumber}: Rs ${Number(refund.refundPayment.amount).toFixed(2)} refunded`,
        metadata: {
          orderId: req.params.id,
          sourcePaymentId: parsed.data.sourcePaymentId,
          refundPaymentId: refund.refundPayment.id,
          creditNoteId: refund.creditNote.id,
          invoiceId: refund.invoice.id,
          method: refund.refundPayment.method,
          reasonCode: parsed.data.reasonCode,
          reason: parsed.data.reason,
          balanceDue: refund.balanceDue,
        },
        ...getRequestMeta(req),
      });
      return refund;
    }, { isolationLevel: 'Serializable' });
    return success(res, result, 'Refund and credit note posted');
  } catch (err) {
    console.error('refundPayment error:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      if (err.statusCode === 409) return res.status(409).json({ success: false, message: err.message });
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034') return res.status(409).json({ success: false, message: 'Refund conflicted with another update; retry with the same idempotency key' });
    return error(res, 'Failed to post refund');
  }
};

// ── POST /api/v1/orders/return ────────────────────────────────────────────────
const { z } = require('zod');
const returnOrderSchema = z.object({
  originalOrderId: z.string().trim().min(1),
  kind: z.enum(['RECLEAN', 'RETURN', 'DAMAGE']).default('RECLEAN'),
  reasonCode: z.string().trim().min(2).max(64),
  reasonNarrative: z.string().trim().max(500).optional().nullable(),
  responsibility: z.enum(['UNDER_REVIEW', 'COMPANY', 'PLANT', 'CUSTOMER']).default('UNDER_REVIEW'),
  disposition: z.enum(['RECLEAN', 'REPAIR', 'REFUND', 'REPLACE', 'RETURN_TO_CUSTOMER']).default('RECLEAN'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  lines: z.array(z.object({
    orderItemId: z.string().trim().min(1),
    quantity: z.coerce.number().int().min(1).max(999),
    garmentUnitIds: z.array(z.string().trim().min(1)).max(999).optional(),
    conditionCode: z.string().trim().max(64).optional().nullable(),
    conditionNotes: z.string().trim().max(500).optional().nullable(),
  }).strict()).min(1).max(200),
}).strict();

const createReturnOrder = async (req, res) => {
  try {
    const parsed = returnOrderSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid return order payload');
    const result = await prisma.$transaction(async (tx) => {
      const found = await tx.order.findFirst({
        where: { ...ORDER_ONLY_WHERE, OR: [{ id: parsed.data.originalOrderId }, { orderNumber: parsed.data.originalOrderId }] },
        select: { id: true },
      });
      if (!found) throw new CommercialRuleError('ORIGINAL_ORDER_NOT_FOUND', 'Original order not found', 404);
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.id} FOR UPDATE`;
      const original = await tx.order.findFirst({
        where: { id: found.id, ...ORDER_ONLY_WHERE },
        include: { customer: true, items: { include: { garmentUnits: { where: { status: { not: 'VOID' } }, orderBy: { sequence: 'asc' } } } } },
      });
      if (original.isReturn) throw new CommercialRuleError('RETURN_OF_RETURN_FORBIDDEN', 'Return or re-clean orders cannot be returned again');
      if (original.status !== 'DELIVERED') throw new CommercialRuleError('RETURN_NOT_ELIGIBLE', 'Only a delivered order can enter the return or re-clean workflow');
      const existingOpenCase = await tx.returnCase.findFirst({
        where: { originalOrderId: original.id, status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_RESOLUTION'] } },
        select: { caseNumber: true },
      });
      if (existingOpenCase) throw new CommercialRuleError('ACTIVE_RETURN_CASE_EXISTS', `An active return case already exists: ${existingOpenCase.caseNumber}`);

      const originalItemById = new Map(original.items.map((item) => [item.id, item]));
      const selectedLines = parsed.data.lines.map((line) => {
        const originalItem = originalItemById.get(line.orderItemId);
        if (!originalItem) throw new CommercialRuleError('INVALID_RETURN_LINE', 'A selected return line does not belong to the original order');
        if (line.quantity > originalItem.quantity) {
          throw new CommercialRuleError('RETURN_QUANTITY_EXCEEDED', `${originalItem.serviceName} return quantity exceeds the delivered quantity`);
        }
        const requestedIds = line.garmentUnitIds || [];
        if (requestedIds.length && requestedIds.length !== line.quantity) {
          throw new CommercialRuleError('RETURN_UNIT_COUNT_MISMATCH', `${originalItem.serviceName} requires one selected garment tag per returned piece`);
        }
        const availableById = new Map(originalItem.garmentUnits.map((unit) => [unit.id, unit]));
        const selectedUnits = requestedIds.length
          ? requestedIds.map((unitId) => availableById.get(unitId))
          : originalItem.garmentUnits.slice(0, line.quantity);
        if (selectedUnits.length !== line.quantity || selectedUnits.some((unit) => !unit)) {
          throw new CommercialRuleError('INVALID_RETURN_UNIT', `${originalItem.serviceName} has invalid or unavailable garment tags`);
        }
        return { ...line, originalItem, selectedUnits };
      });
      const orderNumber = await generateOrderNumber({ isReturn: true, documentType: 'ORDER', client: tx });
      const createdReturn = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId: original.customerId,
          status: 'PICKED_UP',
          source: 'COUNTER',
          items: {
            create: selectedLines.map(({ originalItem, quantity }) => ({
              serviceId: originalItem.serviceId, serviceName: originalItem.serviceName,
              garmentType: originalItem.garmentType, variant: originalItem.variant, quantity,
              baseUnitPrice: originalItem.baseUnitPrice, catalogUnitPrice: originalItem.catalogUnitPrice,
              unitPrice: 0, subtotal: 0, priceSource: 'NO_CHARGE_REWORK',
              pricingSnapshot: { originalOrderId: original.id, originalOrderItemId: originalItem.id, originalUnitPrice: Number(originalItem.unitPrice || 0) },
            }))
          },
          totalAmount: 0,
          subtotal: 0,
          isReturn: true,
          returnReason: parsed.data.reasonNarrative || parsed.data.reasonCode,
          originalOrderId: original.id,
          paymentStatus: 'PAID',
          notes: `No-charge ${parsed.data.kind.toLowerCase()} linked to ${original.orderNumber}`,
          stages: {
            create: {
              stage: 'RETURN_RECEIVED', eventType: 'RETURN_EVENT', toStatus: 'PICKED_UP',
              reasonCode: parsed.data.reasonCode, notes: parsed.data.reasonNarrative || null,
              changedById: req.staff?.id || null,
            },
          },
        }
      });
      await syncOrderGarmentUnits(tx, createdReturn.id);

      const dueAt = new Date(Date.now() + (parsed.data.priority === 'URGENT' ? 24 : 72) * 60 * 60 * 1000);
      const returnCase = await tx.returnCase.create({
        data: {
          caseNumber: await nextDocumentNumber({ tx, documentType: 'RETURN_CASE', prefix: 'RC-', padding: 6 }),
          customerId: original.customerId,
          originalOrderId: original.id,
          reworkOrderId: createdReturn.id,
          kind: parsed.data.kind,
          status: 'OPEN',
          reasonCode: parsed.data.reasonCode,
          reasonNarrative: parsed.data.reasonNarrative || null,
          responsibility: parsed.data.responsibility,
          disposition: parsed.data.disposition,
          financialResolution: parsed.data.disposition === 'REFUND' ? 'REFUND_PENDING' : 'NO_CHARGE_REWORK',
          priority: parsed.data.priority,
          dueAt,
          createdById: req.staff.id,
          lines: {
            create: selectedLines.map((line) => ({
              originalOrderItemId: line.orderItemId,
              quantity: line.quantity,
              conditionCode: line.conditionCode || null,
              conditionNotes: line.conditionNotes || null,
              disposition: parsed.data.disposition,
              responsibility: parsed.data.responsibility,
              garmentUnits: { create: line.selectedUnits.map((unit) => ({ garmentUnitId: unit.id })) },
            })),
          },
        },
      });

      await tx.garmentUnit.updateMany({
        where: { id: { in: selectedLines.flatMap((line) => line.selectedUnits.map((unit) => unit.id)) } },
        data: { status: 'RETURN_RECEIVED', currentPlantPartnerId: null, version: { increment: 1 } },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'RETURN_CASE_OPENED', resource: 'return_case', resourceId: returnCase.id,
        description: `${returnCase.caseNumber} opened for delivered order ${original.orderNumber}`,
        metadata: {
          originalOrderId: original.id,
          reworkOrderId: createdReturn.id,
          reasonCode: parsed.data.reasonCode,
          responsibility: parsed.data.responsibility,
          disposition: parsed.data.disposition,
          lines: selectedLines.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
          dueAt,
        },
        ...getRequestMeta(req),
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_STATUS,
        aggregateType: 'order', aggregateId: createdReturn.id,
        payload: { status: 'PICKED_UP' },
        dedupeKey: `return-case-order:${returnCase.id}:${createdReturn.id}`,
      });
      return { returnOrder: createdReturn, returnCase };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, `${result.returnCase.caseNumber} created`, 201);
  } catch (err) {
    if (err instanceof CommercialRuleError || err instanceof GarmentUnitError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2002') return res.status(409).json({ success: false, message: 'An active return case or duplicate return record already exists' });
    console.error('createReturnOrder error:', err);
    return error(res, 'Failed to create return order');
  }
};

module.exports = {
  listOrders,
  getOrderStats,
  getOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
  addItemsToOrder,
  deleteOrder,
  recordPayment,
  refundPayment,
  createReturnOrder,
};
