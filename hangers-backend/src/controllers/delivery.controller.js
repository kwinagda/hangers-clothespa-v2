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
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound, forbidden } = require('../utils/response');
const { generateOtp, hashOtp, sendDeliveryOtp } = require('../services/whatsapp-otp.service');
const { sendStatusNotification } = require('../services/whatsapp-notifications.service');
const { processReferralQualification } = require('../services/referral.service');
const { DELIVERY_MANAGER_ROLES, DELIVERY_PIN_ROLES, ORDER_STATUS_LABELS } = require('../config/master-data');
const { AUTH_CHALLENGE_PURPOSE, createAuthChallenge, verifyAuthChallenge } = require('../services/authChallenge.service');
const { enqueueNotification, NOTIFY_JOB } = require('../queues');

const isDeliveryManager = (staff) => DELIVERY_MANAGER_ROLES.includes(staff?.role);
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const canAccessDeliveryOrder = (order, staff) => {
  if (!order || !staff) return false;
  if (isDeliveryManager(staff)) return true;
  if (order.assignedToId) return order.assignedToId === staff.id;
  return order.status === 'PENDING';
};

// ── Dashboard — tasks today ───────────────────────────────────────────────────
const getDeliveryDashboard = async (req, res) => {
  const riderId = req.staff.id;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  try {
    // Delivery riders see orders assigned to them
    // Delivery managers see all delivery orders
    const isManager = DELIVERY_MANAGER_ROLES.includes(req.staff.role);

    const baseWhere = isManager
      ? { ...ORDER_ONLY_WHERE }
      : { ...ORDER_ONLY_WHERE, assignedToId: riderId };

    const [pendingPickups, outForDelivery, deliveredToday, totalCashToday] = await Promise.all([
      prisma.order.count({ where: { ...baseWhere, status: 'PENDING' } }),
      prisma.order.count({ where: { ...baseWhere, status: 'OUT_FOR_DELIVERY' } }),
      prisma.order.count({
        where: { ...baseWhere, status: 'DELIVERED', updatedAt: { gte: todayStart } },
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
      where: { ...ORDER_ONLY_WHERE, status: 'READY_FOR_DELIVERY' },
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

  const statusMap = {
    pickups:  ['PENDING'],
    dispatch: ['READY_FOR_DELIVERY'],
    active:   ['PENDING', 'OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'],
    done:     ['DELIVERED'],
  };

  const statusFilter = statusMap[type] || statusMap.active;
  const baseWhere = isManager
    ? { ...ORDER_ONLY_WHERE, status: { in: statusFilter } }
    : { ...ORDER_ONLY_WHERE, assignedToId: riderId, status: { in: statusFilter } };

  try {
    const orders = await prisma.order.findMany({
      where: baseWhere,
      include: {
        customer: { select: { name: true, phone: true } },
        items: { select: { serviceName: true, quantity: true } },
        payments: { select: { amount: true, method: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    return success(res, {
      orders: orders.map(o => ({
        id: o.id, orderNumber: o.orderNumber, status: o.status,
        statusLabel:  ORDER_STATUS_LABELS[o.status] || o.status,
        customer:     { name: o.customer?.name, phone: o.customer?.phone },
        pickupAddress: o.pickupAddress,
        totalAmount:  o.totalAmount,
        paidAmount:   o.paidAmount,
        paymentStatus: o.paymentStatus,
        balanceDue:   Math.max(0, (o.totalAmount || 0) - (o.paidAmount || 0) - (o.writeOffAmount || 0)),
        items:        o.items,
        itemCount:    o.items.reduce((s, i) => s + i.quantity, 0),
        notes:        o.notes,
        updatedAt:    o.updatedAt,
      })),
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
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only access delivery orders assigned to you');
    }

    return success(res, {
      order: {
        ...order,
        statusLabel: ORDER_STATUS_LABELS[order.status] || order.status,
        balanceDue: Math.max(0, (order.totalAmount || 0) - (order.paidAmount || 0) - (order.writeOffAmount || 0)),
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
    const order = await prisma.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
    if (!order) return notFound(res, 'Order not found');
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only pick up orders assigned to you');
    }
    if (order.status !== 'PENDING') {
      return badRequest(res, `Cannot mark picked up — current status: ${ORDER_STATUS_LABELS[order.status] || order.status}`);
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data:  { status: 'PICKED_UP', assignedToId: req.staff.id },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       'PICKED_UP',
          notes:       `Picked up by ${req.staff.name}${bagCount ? `. Bags: ${bagCount}` : ''}${notes ? `. ${notes}` : ''}`,
          changedById: req.staff.id,
        },
      }),
    ]);

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'ORDER_PICKED_UP', resource: 'order', resourceId: id,
      description: `${req.staff.name} picked up ${order.orderNumber}`,
      metadata: { bagCount },
      ...getRequestMeta(req),
    });

    // Queue WhatsApp notification (non-blocking, retried on failure)
    const pickedOrder = await prisma.order.findUnique({
      where: { id }, include: { customer: { select: { name: true, phone: true } } },
    });
    if (pickedOrder) {
      enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order: pickedOrder, status: 'PICKED_UP' }).catch(() => {});
    }

    return success(res, { orderId: id, orderNumber: order.orderNumber, status: 'PICKED_UP' },
      `${order.orderNumber} marked as Picked Up`);
  } catch (err) {
    return error(res, 'Failed to mark picked up');
  }
};

// ── Mark Delivered ────────────────────────────────────────────────────────────
const markDelivered = async (req, res) => {
  const { id } = req.params;
  const { confirmCode, notes } = req.body;  // confirmCode = customer OTP or last 4 of phone

  try {
    const order = await prisma.order.findFirst({
      where: { id, ...ORDER_ONLY_WHERE },
      include: { customer: { select: { phone: true, name: true } } },
    });
    if (!order) return notFound(res, 'Order not found');
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only deliver orders assigned to you');
    }
    if (!['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'].includes(order.status)) {
      return badRequest(res, `Cannot mark delivered — current status: ${ORDER_STATUS_LABELS[order.status] || order.status}`);
    }
    const expectedCode = order.customer?.phone?.slice(-4);
    if (!confirmCode || String(confirmCode).trim().length < 4) {
      return badRequest(res, 'Delivery confirmation code is required');
    }
    if (!expectedCode || String(confirmCode).trim() !== expectedCode) {
      return badRequest(res, 'Invalid delivery confirmation code');
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data:  { status: 'DELIVERED', deliveredAt: new Date() },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       'DELIVERED',
          notes:       `Delivered by ${req.staff.name}${notes ? `. ${notes}` : ''}`,
          changedById: req.staff.id,
        },
      }),
    ]);

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'ORDER_DELIVERED', resource: 'order', resourceId: id,
      description: `${req.staff.name} delivered ${order.orderNumber} to ${order.customer?.name}`,
      ...getRequestMeta(req),
    });

    // Queue notifications (non-blocking, retried on failure)
    enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order: { ...order, customer: order.customer }, status: 'DELIVERED' }).catch(() => {});
    processReferralQualification(id).catch(() => {});

    return success(res, {
      orderId: id, orderNumber: order.orderNumber, status: 'DELIVERED',
      deliveredAt: new Date(),
    }, `${order.orderNumber} delivered successfully!`);
  } catch (err) {
    return error(res, 'Failed to mark delivered');
  }
};

// ── Mark Failed Delivery ──────────────────────────────────────────────────────
const markFailed = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;  // NOT_HOME | REFUSED | WRONG_ADDRESS | OTHER

  const REASONS = ['NOT_HOME','REFUSED','WRONG_ADDRESS','CUSTOMER_CANCELLED','OTHER'];
  if (!reason || !REASONS.includes(reason)) {
    return badRequest(res, `Reason required. Options: ${REASONS.join(', ')}`);
  }

  try {
    const order = await prisma.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
    if (!order) return notFound(res, 'Order not found');
    if (!['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'].includes(order.status)) {
      return badRequest(res, `Cannot mark delivery failed — order is currently: ${ORDER_STATUS_LABELS[order.status] || order.status}`);
    }
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only update delivery attempts for orders assigned to you');
    }

    const reasonLabel = {
      NOT_HOME: 'Customer not home',
      REFUSED: 'Customer refused delivery',
      WRONG_ADDRESS: 'Wrong address',
      CUSTOMER_CANCELLED: 'Customer cancelled',
      OTHER: 'Other reason',
    }[reason];

    await prisma.$transaction([
      // Move back to READY_FOR_DELIVERY for re-attempt
      prisma.order.update({
        where: { id },
        data:  { status: 'READY_FOR_DELIVERY' },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       'READY_FOR_DELIVERY',
          notes:       `Delivery failed: ${reasonLabel}. Reported by ${req.staff.name}`,
          changedById: req.staff.id,
        },
      }),
    ]);

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      status: 'READY_FOR_DELIVERY', failReason: reason,
    }, 'Failed delivery recorded. Order set back to Ready.');
  } catch (err) {
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
    const order = await prisma.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
    if (!order) return notFound(res, 'Order not found');
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only collect cash for orders assigned to you');
    }

    const amt = parseFloat(amount);
    const balanceDue = Math.max(0, (order.totalAmount || 0) - (order.paidAmount || 0) - (order.writeOffAmount || 0));
    if (balanceDue <= 0) {
      return badRequest(res, 'This order has no balance due');
    }
    if (amt > balanceDue) {
      return badRequest(res, `Amount exceeds balance due of ₹${balanceDue.toLocaleString('en-IN')}`);
    }

    const { newPaid, newStatus } = await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId:     id,
          amount:      amt,
          method:      'CASH',
          notes:       notes || `Cash collected by ${req.staff.name} on delivery`,
          collectedBy: req.staff.id,
        },
      });
      const updated = await tx.order.update({
        where:  { id },
        data:   { paidAmount: { increment: amt } },
        select: { paidAmount: true, totalAmount: true, writeOffAmount: true },
      });
      const paid = Number(updated.paidAmount);
      const status = paid + Number(updated.writeOffAmount || 0) >= Number(updated.totalAmount || 0) ? 'PAID' : 'PARTIAL';
      await tx.order.update({ where: { id }, data: { paymentStatus: status } });
      return { newPaid: paid, newStatus: status };
    });

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      collected: amt, totalPaid: newPaid,
      paymentStatus: newStatus,
    }, `₹${amt.toLocaleString('en-IN')} cash recorded`);
  } catch (err) {
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
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only send OTPs for orders assigned to you');
    }
    if (!['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'].includes(order.status)) {
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
    if (!canAccessDeliveryOrder(order, req.staff)) {
      return forbidden(res, 'You can only verify OTPs for orders assigned to you');
    }
    if (!['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'].includes(order.status)) {
      return badRequest(res, `Cannot verify OTP — order status is: ${ORDER_STATUS_LABELS[order.status] || order.status}`);
    }

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
        data:  { status: 'DELIVERED', deliveredAt: new Date() },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       'DELIVERED',
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
    enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order: { ...order, customer: order.customer }, status: 'DELIVERED' }).catch(() => {});
    processReferralQualification(id).catch(() => {});

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      status: 'DELIVERED', deliveredAt: new Date(),
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
    const [order, rider] = await Promise.all([
      prisma.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } }),
      prisma.staff.findUnique({ where: { id: riderId } }),
    ]);

    if (!order) return notFound(res, 'Order not found');
    if (!rider)  return notFound(res, 'Rider not found');
    if (!rider.isActive) return badRequest(res, 'Selected rider is inactive');
    if (!DELIVERY_PIN_ROLES.includes(rider.role)) {
      return badRequest(res, 'Selected staff member is not a delivery assignee');
    }

    await prisma.order.update({
      where: { id },
      data:  { assignedToId: riderId },
    });

    return success(res, { orderId: id, riderId, riderName: rider.name },
      `Order assigned to ${rider.name}`);
  } catch (err) {
    return error(res, 'Failed to assign order');
  }
};

module.exports = {
  getDeliveryDashboard, getMyOrders, getDeliveryOrder,
  markPickedUp, markDelivered, markFailed, collectCash,
  sendDeliveryOtpController, verifyDeliveryOtpController,
  getDailySummary, assignOrder,
};
