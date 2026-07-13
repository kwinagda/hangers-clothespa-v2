// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS CONTROLLER — Record, update, and track payments for orders
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { success, created, badRequest, error, notFound, forbidden } = require('../utils/response');
const { recordPaymentSchema } = require('../validation/finance.schemas');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { getCapturedPaymentStatusValues, getCorePaymentMethods } = require('../services/masterData.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { PaymentRuleError, recordOrderSettlement } = require('../services/payment.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

// ── POST /api/v1/payments — Record a payment for an order ─────────────────────
const recordPayment = async (req, res) => {
  try {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid payment payload');
    const { orderId, amount, method, reference, notes } = parsed.data;
    const normalizedMethod = normalizePaymentMethod(method);
    const corePaymentMethods = await getCorePaymentMethods();
    if (!corePaymentMethods.includes(normalizedMethod)) {
      return badRequest(res, `Payment method must be one of: ${corePaymentMethods.join(', ')}`);
    }
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE } });
      if (!before) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      const settlement = await recordOrderSettlement(tx, {
        orderId,
        amount,
        method: normalizedMethod,
        reference,
        notes,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'PAYMENT_RECORDED',
        resource: 'order',
        resourceId: orderId,
        description: `Payment recorded for ${before.orderNumber}`,
        metadata: {
          orderNumber: before.orderNumber,
          paymentIds: settlement.payments.map((payment) => payment.id),
          method: normalizedMethod,
          reference: reference || null,
          before: { paidAmount: before.paidAmount, paymentStatus: before.paymentStatus },
          after: {
            paidAmount: settlement.paidAmount,
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
          aggregateId: orderId,
          payload: { paymentId: payment.id },
          dedupeKey: `payment-received:${payment.id}`,
        });
      }
      if (settlement.paymentStatus === 'PAID') {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.REFERRAL_QUALIFY,
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {},
          dedupeKey: `referral-qualify:${orderId}:paid-v${order.version}`,
        });
      }
      return { order, settlement };
    }, { isolationLevel: 'Serializable' });

    const payment = result.settlement.payments[0];

    created(res, {
      payment,
      paidAmount: result.settlement.paidAmount,
      paymentStatus: result.settlement.paymentStatus,
      balance: result.settlement.balanceDue,
    }, 'Payment recorded successfully');

  } catch (err) {
    console.error('recordPayment:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034') return badRequest(res, 'Payment conflicted with another update; retry with the same idempotency key');
    return error(res, 'Failed to record payment');
  }
};

// ── GET /api/v1/payments/order/:orderId — All payments for an order ───────────
const getOrderPayments = async (req, res) => {
  try {
    const { orderId } = req.params;
    const payments = await prisma.payment.findMany({
      where:   { orderId },
      include: { collectedByStaff: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return success(res, { payments });
  } catch (err) {
    return error(res, 'Failed to fetch payments');
  }
};

// ── GET /api/v1/payments/daily — Daily cash register summary ─────────────────
const getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const day   = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) return badRequest(res, 'date must be valid');
    const start = new Date(day.setHours(0, 0, 0, 0));
    const end   = new Date(day.setHours(23, 59, 59, 999));

    const capturedStatuses = await getCapturedPaymentStatusValues();
    const payments = await prisma.payment.findMany({
      where:   { createdAt: { gte: start, lte: end }, status: { in: capturedStatuses } },
      include: {
        order:            { select: { orderNumber: true, customer: { select: { name: true, phone: true } } } },
        customer:         { select: { name: true, phone: true } },
        allocations:      { include: { invoice: { select: { invoiceNumber: true, sourceType: true, ironBillId: true } } } },
        collectedByStaff: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paymentMethod = (payment) => normalizePaymentMethod(payment.method || payment.mode);
    const normalizedPayments = payments.map((payment) => ({
      ...payment,
      method: paymentMethod(payment),
      signedAmount: payment.kind === 'REFUND' ? -Number(payment.amount || 0) : Number(payment.amount || 0),
    }));
    const byMethod = normalizedPayments.reduce((acc, payment) => {
      acc[payment.method] = Number(((acc[payment.method] || 0) + payment.signedAmount).toFixed(2));
      return acc;
    }, {});
    const summary = {
      total:  normalizedPayments.reduce((s, p) => s + p.signedAmount, 0),
      byMethod,
      count:  normalizedPayments.length,
    };

    return success(res, { summary, payments: normalizedPayments });
  } catch (err) {
    return error(res, 'Failed to fetch daily summary');
  }
};

// ── GET /api/v1/payments/receivables — Outstanding balances ──────────────────
const getReceivables = async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: 'VOID' }, balanceDue: { gt: 0 } },
      include: {
        customer: { select: { name: true, phone: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
        ironBill: { select: { id: true, billNumber: true, status: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    });
    const now = new Date();
    const receivables = invoices.map((invoice) => ({
      id: invoice.orderId || invoice.ironBillId || invoice.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sourceType: invoice.sourceType,
      orderId: invoice.orderId,
      ironBillId: invoice.ironBillId,
      orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.invoiceNumber,
      customer: invoice.customer,
      totalAmount: Number(invoice.totalAmount || 0),
      paidAmount: Number(invoice.paidAmount || 0),
      balance: Number(invoice.balanceDue || 0),
      paymentStatus: Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
      status: invoice.order?.status || invoice.ironBill?.status || invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      daysOverdue: Math.max(0, Math.floor((now - new Date(invoice.dueDate)) / 86400000)),
      isOverdue: new Date(invoice.dueDate) < now,
    }));

    const total = receivables.reduce((sum, invoice) => sum + invoice.balance, 0);

    return success(res, {
      total,
      orders: receivables,
      receivables,
    });
  } catch (err) {
    return error(res, 'Failed to fetch receivables');
  }
};

module.exports = { recordPayment, getOrderPayments, getDailySummary, getReceivables };
