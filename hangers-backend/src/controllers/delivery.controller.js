// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY CONTROLLER — Delivery app operations
// GET  /api/v1/delivery/dashboard       → My tasks summary
// GET  /api/v1/delivery/orders          → My assigned orders
// GET  /api/v1/delivery/orders/:id      → Order detail
// POST /api/v1/delivery/orders/:id/pickup    → Mark picked up
// POST /api/v1/delivery/orders/:id/deliver   → Mark delivered (OTP or confirm)
// POST /api/v1/delivery/orders/:id/failed    → Mark failed delivery
// POST /api/v1/delivery/orders/:id/cash      → Record cash collected
// GET  /api/v1/delivery/summary         → Daily earnings summary
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { log, writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound, forbidden } = require('../utils/response');
const { generateOtp, hashOtp, sendDeliveryOtp } = require('../services/whatsapp-otp.service');
const { processReferralQualification } = require('../services/referral.service');
const { DELIVERY_MANAGER_ROLES, DELIVERY_PIN_ROLES } = require('../config/master-data');
const { getDeliveryFailReasons, getOrderStatuses, getOrderWorkflow } = require('../services/masterData.service');
const { deriveOrderPaymentState } = require('../utils/order-payment-state');
const { AUTH_CHALLENGE_PURPOSE, createAuthChallenge, verifyAuthChallenge } = require('../services/authChallenge.service');
const { enqueueNotification, NOTIFY_JOB } = require('../queues');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const { PaymentRuleError, recordOrderSettlement } = require('../services/payment.service');

const isDeliveryManager = (staff) => DELIVERY_MANAGER_ROLES.includes(staff?.role);
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const statusLabelsFrom = (statuses) => statuses.reduce((acc, status) => {
  acc[status.key] = status.label || status.key;
  return acc;
}, {});

const canAccessDeliveryOrder = (order, staff, orderWorkflow) => {
  if (!order || !staff) return false;
  if (isDeliveryManager(staff)) return true;
  if (order.assignedToId) return order.assignedToId === staff.id;
  return (orderWorkflow?.deliveryActions?.pickupFrom || []).includes(order.status);
};

// ── Dashboard — tasks today ───────────────────────────────────────────────────
const getDeliveryDashboard = async (req, res) => {
  const riderId = req.staff.id;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  try {
    // Delivery riders see orders assigned to them
    // Delivery managers see all delivery orders
    const isManager = DELIVERY_MANAGER_ROLES.includes(req.staff.role);
    const orderWorkflow = await getOrderWorkflow();
    const deliveryViews = orderWorkflow.deliveryViews || {};
    const deliveryActions = orderWorkflow.deliveryActions || {};

    const baseWhere = isManager
      ? { ...ORDER_ONLY_WHERE }
      : { ...ORDER_ONLY_WHERE, assignedToId: riderId };

    const [pendingPickups, outForDelivery, deliveredToday, totalCashToday] = await Promise.all([
      prisma.order.count({ where: { ...baseWhere, status: { in: deliveryViews.pickups || [] } } }),
      prisma.order.count({ where: { ...baseWhere, status: deliveryActions.outForDeliveryStatus || '__UNCONFIGURED__' } }),
      prisma.order.count({
        where: { ...baseWhere, status: { in: deliveryViews.done || [] }, updatedAt: { gte: todayStart } },
      }),
      prisma.payment.aggregate({
        where: {
          createdAt: { gte: todayStart },
          method:    'CASH',
          order: isManager
            ? { documentType: 'ORDER' }
            : { assignedToId: riderId, documentType: 'ORDER' },
        },
        _sum: { amount: true },
      }),
    ]);

    // Ready orders (need to go out)
    const readyOrders = await prisma.order.count({
      where: { ...ORDER_ONLY_WHERE, status: { in: deliveryViews.dispatch || [] } },
    });

    return success(res, {
      dashboard: {
        pendingPickups, outForDelivery, deliveredToday,
        readyForDispatch: readyOrders,
        cashCollectedToday: totalCashToday._sum.amount || 0,
        isManager,
      },
    });
  } catch (err) {
    return error(res, 'Failed to load dashboard');
  }
};

// ── My assigned orders ────────────────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  const { type = 'active' } = req.query;
  const riderId = req.staff.id;
  const isManager = DELIVERY_MANAGER_ROLES.includes(req.staff.role);

  const [orderWorkflow, orderStatuses] = await Promise.all([getOrderWorkflow(), getOrderStatuses()]);
  const statusMap = orderWorkflow.deliveryViews || {};
  const statusLabels = statusLabelsFrom(orderStatuses);

  const statusFilter = statusMap[type] || statusMap.active || [];
  const baseWhere = isManager
    ? { ...ORDER_ONLY_WHERE, status: { in: statusFilter } }
    : { ...ORDER_ONLY_WHERE, assignedToId: riderId, status: { in: statusFilter } };

  try {
    const orders = await prisma.order.findMany({
      where: baseWhere,
      include: {
        customer: { select: { name: true, phone: true } },
        items: { select: { serviceName: true, quantity: true } },
        payments: { select: { amount: true, method: true, status: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    return success(res, {
      orders: orders.map(o => {
        const paymentState = deriveOrderPaymentState(o);
        return ({
        id: o.id, orderNumber: o.orderNumber, status: o.status,
        statusLabel:  statusLabels[o.status] || o.status,
        customer:     { name: o.customer?.name, phone: o.customer?.phone },
        pickupAddress: o.pickupAddress,
        totalAmount:  o.totalAmount,
        paidAmount:   paymentState.paidAmount,
        paymentStatus: paymentState.paymentStatus,
        balanceDue:   paymentState.balanceDue,
        items:        o.items,
        itemCount:    o.items.reduce((s, i) => s + i.quantity, 0),
        notes:        o.notes,
        updatedAt:    o.updatedAt,
      });
      }),
      total: orders.length,
    });
  } catch (err) {
    return error(res, 'Failed to load orders');
  }
};

const getDeliveryOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, ...ORDER_ONLY_WHERE },
      include: {
        customer: { select: { name: true, phone: true } },
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        stages: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!order) return notFound(res, 'Order not found');
    const [orderWorkflow, orderStatuses] = await Promise.all([getOrderWorkflow(), getOrderStatuses()]);
    const statusLabels = statusLabelsFrom(orderStatuses);
    if (!canAccessDeliveryOrder(order, req.staff, orderWorkflow)) {
      return forbidden(res, 'You can only access delivery orders assigned to you');
    }
    const paymentState = deriveOrderPaymentState(order);

    return success(res, {
      order: {
        ...order,
        paidAmount: paymentState.paidAmount,
        paymentStatus: paymentState.paymentStatus,
        statusLabel: statusLabels[order.status] || order.status,
        balanceDue: paymentState.balanceDue,
        itemCount:  order.items.reduce((s, i) => s + i.quantity, 0),
      },
    });
  } catch (err) {
    return error(res, 'Failed to load order');
  }
};

// ── Mark Picked Up ────────────────────────────────────────────────────────────
const markPickedUp = async (req, res) => {
  const { id } = req.params;
  const { bagCount, notes } = req.body;

  try {
    const [orderWorkflow, orderStatuses] = await Promise.all([getOrderWorkflow(), getOrderStatuses()]);
    const statusLabels = statusLabelsFrom(orderStatuses);
    const deliveryActions = orderWorkflow.deliveryActions || {};
    if (!deliveryActions.pickupTarget) return badRequest(res, 'Delivery pickup target is not configured');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (!(deliveryActions.pickupFrom || []).includes(order.status)) throw new Error('ORDER_NOT_PICKUP_READY');
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { orderId: id, kind: 'PICKUP', status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' },
      });
      if (!assignment) throw new Error('PICKUP_ASSIGNMENT_REQUIRED');
      if (!isDeliveryManager(req.staff) && assignment.assigneeId !== req.staff.id) throw new Error('DELIVERY_ACCESS_DENIED');
      const attempt = await tx.deliveryAttempt.create({
        data: {
          assignmentId: assignment.id, orderId: id, attemptedById: req.staff.id, outcome: 'PICKED_UP',
          notes: notes ? String(notes).trim() : null,
        },
      });
      await tx.deliveryAssignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } } });
      await tx.order.update({ where: { id }, data: { status: deliveryActions.pickupTarget, assignedToId: null, version: { increment: 1 } } });
      await tx.orderStage.create({
        data: {
          orderId: id, stage: deliveryActions.pickupTarget, eventType: 'DELIVERY_ATTEMPT',
          fromStatus: order.status, toStatus: deliveryActions.pickupTarget, reasonCode: 'PICKUP_COMPLETED',
          notes: notes ? String(notes).trim() : null, metadata: { assignmentId: assignment.id, attemptId: attempt.id, bagCount: Number(bagCount || 0) },
          changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'ORDER_PICKED_UP', resource: 'delivery_attempt', resourceId: attempt.id,
        description: `${req.staff.name} picked up ${order.orderNumber}`,
        metadata: { orderId: id, assignmentId: assignment.id, bagCount: Number(bagCount || 0) }, ...getRequestMeta(req),
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_STATUS, aggregateType: 'order', aggregateId: id,
        payload: { status: deliveryActions.pickupTarget }, dedupeKey: `pickup-attempt:${attempt.id}:status`,
      });
      return { order, attempt };
    }, { isolationLevel: 'Serializable' });

    return success(res, { orderId: id, orderNumber: result.order.orderNumber, status: deliveryActions.pickupTarget, attempt: result.attempt },
      `${result.order.orderNumber} marked as ${statusLabels[deliveryActions.pickupTarget] || deliveryActions.pickupTarget}`);
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'ORDER_NOT_PICKUP_READY') return badRequest(res, 'Order is not ready for pickup');
    if (err.message === 'PICKUP_ASSIGNMENT_REQUIRED') return badRequest(res, 'Assign this pickup before completing it');
    if (err.message === 'DELIVERY_ACCESS_DENIED') return forbidden(res, 'You can only complete pickups assigned to you');
    return error(res, 'Failed to mark picked up');
  }
};

// ── Mark Delivered ────────────────────────────────────────────────────────────
const markDelivered = async (req, res) => {
  const { id } = req.params;
  const { notes, confirmationReference } = req.body;
  const confirmationMethod = String(req.body.confirmationMethod || '').trim().toUpperCase();
  const allowedConfirmationMethods = new Set(['CUSTOMER_SIGNATURE', 'CUSTOMER_VERBAL', 'CONTACTLESS', 'MANAGER_CONFIRMED']);
  if (!allowedConfirmationMethods.has(confirmationMethod)) {
    return badRequest(res, `confirmationMethod must be one of: ${[...allowedConfirmationMethods].join(', ')}`);
  }
  if (confirmationMethod === 'MANAGER_CONFIRMED' && !isDeliveryManager(req.staff)) {
    return forbidden(res, 'Only a delivery manager can use manager confirmation');
  }

  try {
    const [orderWorkflow, orderStatuses] = await Promise.all([getOrderWorkflow(), getOrderStatuses()]);
    const statusLabels = statusLabelsFrom(orderStatuses);
    const deliveryActions = orderWorkflow.deliveryActions || {};
    if (!deliveryActions.deliveredTarget) return badRequest(res, 'Delivery delivered target is not configured');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE }, include: { customer: { select: { name: true } } } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (!(deliveryActions.deliverableFrom || []).includes(order.status)) throw new Error('ORDER_NOT_DELIVERABLE');
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { orderId: id, kind: 'DELIVERY', status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (!assignment) throw new Error('DELIVERY_ASSIGNMENT_REQUIRED');
      if (!isDeliveryManager(req.staff) && assignment.assigneeId !== req.staff.id) throw new Error('DELIVERY_ACCESS_DENIED');
      const deliveredAt = new Date();
      const attempt = await tx.deliveryAttempt.create({
        data: {
          assignmentId: assignment.id, orderId: id, attemptedById: req.staff.id, outcome: 'DELIVERED',
          notes: notes ? String(notes).trim() : null, confirmationMethod,
          confirmationReference: confirmationReference ? String(confirmationReference).trim() : null,
        },
      });
      await tx.deliveryAssignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED', completedAt: deliveredAt, version: { increment: 1 } } });
      await tx.order.update({ where: { id }, data: { status: deliveryActions.deliveredTarget, deliveredAt, version: { increment: 1 } } });
      await tx.garmentUnit.updateMany({
        where: { orderItem: { orderId: id }, status: { notIn: ['VOID', 'ISSUE_HOLD'] } },
        data: { status: 'DELIVERED', currentPlantPartnerId: null, version: { increment: 1 } },
      });
      await tx.orderStage.create({
        data: {
          orderId: id, stage: deliveryActions.deliveredTarget, eventType: 'DELIVERY_ATTEMPT',
          fromStatus: order.status, toStatus: deliveryActions.deliveredTarget, reasonCode: confirmationMethod,
          notes: notes ? String(notes).trim() : null,
          metadata: { assignmentId: assignment.id, attemptId: attempt.id, confirmationMethod, confirmationReference: confirmationReference || null },
          changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'ORDER_DELIVERED', resource: 'delivery_attempt', resourceId: attempt.id,
        description: `${req.staff.name} delivered ${order.orderNumber} to ${order.customer?.name || 'customer'}`,
        metadata: { orderId: id, assignmentId: assignment.id, confirmationMethod }, ...getRequestMeta(req),
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_STATUS, aggregateType: 'order', aggregateId: id,
        payload: { status: deliveryActions.deliveredTarget }, dedupeKey: `delivery-attempt:${attempt.id}:status`,
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.REFERRAL_QUALIFY, aggregateType: 'order', aggregateId: id,
        payload: {}, dedupeKey: `delivery-attempt:${attempt.id}:referral`,
      });
      return { order, attempt, deliveredAt };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id, orderNumber: result.order.orderNumber, status: deliveryActions.deliveredTarget,
      deliveredAt: result.deliveredAt, attempt: result.attempt,
    }, `${result.order.orderNumber} delivered successfully`);
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'ORDER_NOT_DELIVERABLE') return badRequest(res, 'Order is not in a deliverable status');
    if (err.message === 'DELIVERY_ASSIGNMENT_REQUIRED') return badRequest(res, 'Assign this order for delivery before completing it');
    if (err.message === 'DELIVERY_ACCESS_DENIED') return forbidden(res, 'You can only deliver orders assigned to you');
    if (err.code === 'P2034') return res.status(409).json({ success: false, message: 'Delivery changed concurrently; retry with the same idempotency key' });
    return error(res, 'Failed to mark delivered');
  }
};

// ── Mark Failed Delivery ──────────────────────────────────────────────────────
const markFailed = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const [orderWorkflow, orderStatuses, deliveryFailReasons] = await Promise.all([getOrderWorkflow(), getOrderStatuses(), getDeliveryFailReasons()]);
    const statusLabels = statusLabelsFrom(orderStatuses);
    const reasonMap = Object.fromEntries(deliveryFailReasons.map((item) => [item.value, item.label]));
    const reasonValues = Object.keys(reasonMap);
    if (!reason || !reasonValues.includes(reason)) {
      return badRequest(res, `Reason required. Options: ${reasonValues.join(', ')}`);
    }
    const deliveryActions = orderWorkflow.deliveryActions || {};
    if (!deliveryActions.failedTarget) return badRequest(res, 'Delivery failed target is not configured');

    const reasonLabel = reasonMap[reason];
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (!(deliveryActions.deliverableFrom || []).includes(order.status)) throw new Error('ORDER_NOT_DELIVERABLE');
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { orderId: id, kind: 'DELIVERY', status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' },
      });
      if (!assignment) throw new Error('DELIVERY_ASSIGNMENT_REQUIRED');
      if (!isDeliveryManager(req.staff) && assignment.assigneeId !== req.staff.id) throw new Error('DELIVERY_ACCESS_DENIED');
      const attempt = await tx.deliveryAttempt.create({
        data: {
          assignmentId: assignment.id, orderId: id, attemptedById: req.staff.id,
          outcome: 'FAILED', reasonCode: reason, notes: req.body.notes ? String(req.body.notes).trim() : null,
        },
      });
      await tx.deliveryAssignment.update({ where: { id: assignment.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, version: { increment: 1 } } });
      await tx.order.update({ where: { id }, data: { status: deliveryActions.failedTarget, assignedToId: null, version: { increment: 1 } } });
      await tx.orderStage.create({
        data: {
          orderId: id, stage: deliveryActions.failedTarget, eventType: 'DELIVERY_ATTEMPT',
          fromStatus: order.status, toStatus: deliveryActions.failedTarget, reasonCode: reason,
          notes: `Delivery failed: ${reasonLabel}`, metadata: { assignmentId: assignment.id, attemptId: attempt.id }, changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'DELIVERY_FAILED', resource: 'delivery_attempt', resourceId: attempt.id,
        description: `${order.orderNumber} delivery failed: ${reasonLabel}`,
        metadata: { orderId: id, assignmentId: assignment.id, reasonCode: reason }, ...getRequestMeta(req),
      });
      return { order, attempt };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id, orderNumber: result.order.orderNumber,
      status: deliveryActions.failedTarget, failReason: reason, attempt: result.attempt,
    }, 'Failed delivery recorded. Order set back to Ready.');
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'ORDER_NOT_DELIVERABLE') return badRequest(res, 'Order is not in a deliverable status');
    if (err.message === 'DELIVERY_ASSIGNMENT_REQUIRED') return badRequest(res, 'Assign this order for delivery before recording an attempt');
    if (err.message === 'DELIVERY_ACCESS_DENIED') return forbidden(res, 'You can only update delivery attempts assigned to you');
    return error(res, 'Failed to record delivery failure');
  }
};

// ── Record Cash Collected ─────────────────────────────────────────────────────
const collectCash = async (req, res) => {
  const { id } = req.params;
  const { amount, notes } = req.body;

  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    return badRequest(res, 'Valid amount required');
  }

  try {
    const amt = parseFloat(amount);
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { orderId: id, kind: 'DELIVERY', status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' },
      });
      if (!assignment) throw new PaymentRuleError('DELIVERY_ASSIGNMENT_REQUIRED', 'An active delivery assignment is required');
      if (!isDeliveryManager(req.staff) && assignment.assigneeId !== req.staff.id) {
        throw new PaymentRuleError('DELIVERY_ACCESS_DENIED', 'You can only collect cash for orders assigned to you', 403);
      }
      const settlement = await recordOrderSettlement(tx, {
        orderId: id, amount: amt, method: 'CASH', notes: notes || `Cash collected by ${req.staff.name} on delivery`,
        staff: req.staff, idempotencyKey: req.idempotencyKey,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'DELIVERY_CASH_COLLECTED', resource: 'order', resourceId: id,
        description: `${req.staff.name} collected cash for ${order.orderNumber}`,
        metadata: { assignmentId: assignment.id, amount: amt, paymentIds: settlement.payments.map((payment) => payment.id) },
        ...getRequestMeta(req),
      });
      return { order, settlement };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id, orderNumber: result.order.orderNumber,
      collected: amt, totalPaid: result.settlement.paidAmount,
      paymentStatus: result.settlement.paymentStatus,
    }, `₹${amt.toLocaleString('en-IN')} cash recorded`);
  } catch (err) {
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to record cash');
  }
};

// ── Send Delivery OTP via WhatsApp ────────────────────────────────────────────
// Called by rider app when they arrive at customer door
// POST /api/v1/delivery/orders/:id/send-otp
const sendDeliveryOtpController = async (req, res) => {
  const { id } = req.params;

  try {
    const order = await prisma.order.findFirst({
      where:   { id, ...ORDER_ONLY_WHERE },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) return notFound(res, 'Order not found');
    const orderWorkflow = await getOrderWorkflow();
    const deliveryActions = orderWorkflow.deliveryActions || {};
    if (!canAccessDeliveryOrder(order, req.staff, orderWorkflow)) {
      return forbidden(res, 'You can only send OTPs for orders assigned to you');
    }
    if (!(deliveryActions.deliverableFrom || []).includes(order.status)) {
      return badRequest(res, `Cannot send OTP — order status is: ${order.status}`);
    }

    const customerPhone = order.customer?.phone;
    const customerName  = order.customer?.name || 'Customer';
    if (!customerPhone) return badRequest(res, 'Customer phone not found');

    // Expire any existing delivery OTPs for this order
    await prisma.otpVerification.updateMany({
      where: { phone: customerPhone, purpose: 'DELIVERY', isUsed: false },
      data:  { isUsed: true },
    });

    const otp       = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit delivery OTP
    const hashedOtp = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.otpVerification.create({
      data: {
        phone:     customerPhone,
        otp:       hashedOtp,
        purpose:   'DELIVERY',
        expiresAt,
        },
    });
    await createAuthChallenge({
      subjectType: 'delivery',
      subjectKey: `${id}:${customerPhone}`,
      purpose: AUTH_CHALLENGE_PURPOSE.DELIVERY_CONFIRMATION,
      code: otp,
      ttlMs: 15 * 60 * 1000,
      maxAttempts: 5,
      cooldownMs: 60 * 1000,
      metadata: { orderId: id, orderNumber: order.orderNumber },
    });

    // Send via WhatsApp
    await sendDeliveryOtp(customerPhone, customerName, order.orderNumber, otp);

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'DELIVERY_OTP_SENT', resource: 'order', resourceId: id,
      description: `Delivery OTP sent to ${customerPhone} for ${order.orderNumber}`,
      ...getRequestMeta(req),
    });

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      sentTo: `+91 ${customerPhone.slice(-4).padStart(customerPhone.length, '*')}`,
    }, 'OTP sent to customer via WhatsApp');

  } catch (err) {
    console.error('sendDeliveryOtp error:', err);
    return error(res, 'Failed to send OTP. Try again.');
  }
};

// ── Verify Delivery OTP ───────────────────────────────────────────────────────
// Called by rider app when customer reads out their OTP
// POST /api/v1/delivery/orders/:id/verify-otp
const verifyDeliveryOtpController = async (req, res) => {
  const { id }  = req.params;
  const { otp } = req.body;

  if (!otp) return badRequest(res, 'OTP is required');

  try {
    const order = await prisma.order.findFirst({
      where:   { id, ...ORDER_ONLY_WHERE },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) return notFound(res, 'Order not found');
    const orderWorkflow = await getOrderWorkflow();
    const deliveryActions = orderWorkflow.deliveryActions || {};
    if (!canAccessDeliveryOrder(order, req.staff, orderWorkflow)) {
      return forbidden(res, 'You can only verify OTPs for orders assigned to you');
    }
    if (!(deliveryActions.deliverableFrom || []).includes(order.status)) {
      return badRequest(res, `Cannot verify OTP — order status is: ${statusLabels[order.status] || order.status}`);
    }
    if (!deliveryActions.deliveredTarget) return badRequest(res, 'Delivery delivered target is not configured');

    const customerPhone = order.customer?.phone;

    const verification = await verifyAuthChallenge({
      subjectType: 'delivery',
      subjectKey: `${id}:${customerPhone}`,
      purpose: AUTH_CHALLENGE_PURPOSE.DELIVERY_CONFIRMATION,
      code: otp,
    });
    if (!verification.ok) {
      if (verification.reason === 'NOT_FOUND') {
        return badRequest(res, 'OTP expired or not found. Ask customer to check WhatsApp and try again.');
      }
      if (verification.reason === 'LOCKED') {
        await prisma.otpVerification.updateMany({
          where: { phone: customerPhone, purpose: 'DELIVERY', isUsed: false },
          data:  { isUsed: true },
        });
        return badRequest(res, 'Too many wrong OTP attempts. Please send a new OTP.');
      }
      return badRequest(res, 'Incorrect OTP. Please check with the customer.');
    }

    // Mark OTP used
    await prisma.otpVerification.updateMany({
      where: { phone: customerPhone, purpose: 'DELIVERY', isUsed: false },
      data:  { isUsed: true },
    });

    // Mark delivered
    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data:  { status: deliveryActions.deliveredTarget, deliveredAt: new Date() },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       deliveryActions.deliveredTarget,
          notes:       `Delivered by ${req.staff.name}. Customer verified via WhatsApp OTP.`,
          changedById: req.staff.id,
        },
      }),
    ]);

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'ORDER_DELIVERED', resource: 'order', resourceId: id,
      description: `${req.staff.name} delivered ${order.orderNumber} — OTP verified`,
      ...getRequestMeta(req),
    });

    // Queue notifications (non-blocking, retried on failure)
    enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order: { ...order, customer: order.customer }, status: deliveryActions.deliveredTarget }).catch(() => {});
    processReferralQualification(id).catch(() => {});

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      status: deliveryActions.deliveredTarget, deliveredAt: new Date(),
    }, `${order.orderNumber} delivered successfully!`);

  } catch (err) {
    console.error('verifyDeliveryOtp error:', err);
    return error(res, 'OTP verification failed. Try again.');
  }
};

// ── Daily Summary ─────────────────────────────────────────────────────────────
const getDailySummary = async (req, res) => {
  const riderId = req.staff.id;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  try {
    const [delivered, pickups, cashPayments] = await Promise.all([
      prisma.order.findMany({
        where: { ...ORDER_ONLY_WHERE, assignedToId: riderId, status: 'DELIVERED', deliveredAt: { gte: todayStart } },
        select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, deliveredAt: true,
                  customer: { select: { name: true } } },
      }),
      prisma.order.findMany({
        where: { ...ORDER_ONLY_WHERE, assignedToId: riderId, status: 'PICKED_UP', updatedAt: { gte: todayStart } },
        select: { id: true, orderNumber: true, customer: { select: { name: true } } },
      }),
      prisma.payment.findMany({
        where: {
          collectedBy: riderId,
          method:      'CASH',
          createdAt:   { gte: todayStart },
          order:       { documentType: 'ORDER' },
        },
        select: { amount: true, orderId: true, createdAt: true },
      }),
    ]);

    const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);

    return success(res, {
      summary: {
        date:              todayStart.toISOString().split('T')[0],
        deliveriesCompleted: delivered.length,
        pickupsCompleted:    pickups.length,
        cashCollected:       cashTotal,
        delivered,
        pickups,
      },
    });
  } catch (err) {
    return error(res, 'Failed to load summary');
  }
};

// ── Assign order to delivery rider (manager/admin only) ──────────────────────
const assignOrder = async (req, res) => {
  const { id } = req.params;
  const { riderId } = req.body;

  if (!riderId) return badRequest(res, 'Rider ID required');

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const [order, rider, workflow] = await Promise.all([
        tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } }),
        tx.staff.findUnique({ where: { id: riderId } }),
        getOrderWorkflow(),
      ]);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (!rider) throw new Error('RIDER_NOT_FOUND');
      if (!rider.isActive) throw new Error('RIDER_INACTIVE');
      if (!DELIVERY_PIN_ROLES.includes(rider.role)) throw new Error('RIDER_ROLE_INVALID');
      const kind = (workflow.deliveryActions?.pickupFrom || []).includes(order.status) ? 'PICKUP' : 'DELIVERY';
      await tx.deliveryAssignment.updateMany({
        where: { orderId: id, kind, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'REASSIGNED', version: { increment: 1 } },
      });
      const assignment = await tx.deliveryAssignment.create({
        data: { orderId: id, kind, assigneeId: rider.id, assignedById: req.staff.id, scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null },
      });
      await tx.order.update({ where: { id }, data: { assignedToId: riderId, version: { increment: 1 } } });
      await tx.orderStage.create({
        data: {
          orderId: id, stage: order.status, eventType: 'DELIVERY_ASSIGNMENT', reasonCode: 'RIDER_ASSIGNED',
          notes: `${kind} assigned to ${rider.name}`, metadata: { assignmentId: assignment.id, riderId }, changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'DELIVERY_ASSIGNED', resource: 'delivery_assignment', resourceId: assignment.id,
        description: `${order.orderNumber} ${kind.toLowerCase()} assigned to ${rider.name}`,
        metadata: { orderId: id, riderId, kind }, ...getRequestMeta(req),
      });
      return { rider, assignment };
    }, { isolationLevel: 'Serializable' });

    return success(res, { orderId: id, riderId, riderName: result.rider.name, assignment: result.assignment },
      `Order assigned to ${result.rider.name}`);
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'RIDER_NOT_FOUND') return notFound(res, 'Rider not found');
    if (err.message === 'RIDER_INACTIVE') return badRequest(res, 'Selected rider is inactive');
    if (err.message === 'RIDER_ROLE_INVALID') return badRequest(res, 'Selected staff member is not a delivery assignee');
    if (err.code === 'P2034') return res.status(409).json({ success: false, message: 'Assignment changed concurrently; retry with the same idempotency key' });
    return error(res, 'Failed to assign order');
  }
};

module.exports = {
  getDeliveryDashboard, getMyOrders, getDeliveryOrder,
  markPickedUp, markDelivered, markFailed, collectCash,
  sendDeliveryOtpController, verifyDeliveryOtpController,
  getDailySummary, assignOrder,
};
