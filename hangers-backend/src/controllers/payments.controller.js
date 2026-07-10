// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS CONTROLLER — Record, update, and track payments for orders
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { processReferralQualification } = require('../services/referral.service');
const { success, created, badRequest, error, notFound } = require('../utils/response');
const { recordPaymentSchema } = require('../validation/finance.schemas');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { getCorePaymentMethods } = require('../services/masterData.service');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const calculatePaymentState = (order, incomingAmount) => {
  const requestedAmount = Number.parseFloat(incomingAmount);
  const currentPaid = Number(order?.paidAmount || 0);
  const currentWriteOff = Number(order?.writeOffAmount || 0);
  const totalAmount = Number(order?.totalAmount || 0);
  const balanceDue = Math.max(0, Number((totalAmount - currentPaid - currentWriteOff).toFixed(2)));
  const appliedAmount = Math.min(requestedAmount, balanceDue);
  const overpayment = Math.max(0, Number((requestedAmount - appliedAmount).toFixed(2)));
  const nextPaidAmount = Number((currentPaid + appliedAmount).toFixed(2));
  const effectivePaid = Number((nextPaidAmount + currentWriteOff).toFixed(2));
  const paymentStatus = effectivePaid >= totalAmount ? 'PAID' : effectivePaid > 0 ? 'PARTIAL' : 'UNPAID';

  return { requestedAmount, balanceDue, appliedAmount, overpayment, nextPaidAmount, paymentStatus };
};

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
    const amountNum = amount;

    const { payment, updatedOrder, overpayment } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE } });
      if (!order) {
        const err = new Error('ORDER_NOT_FOUND');
        throw err;
      }

      const { balanceDue, appliedAmount, overpayment, nextPaidAmount, paymentStatus } =
        calculatePaymentState(order, amountNum);

      if (balanceDue <= 0 || appliedAmount <= 0) {
        const err = new Error('ORDER_ALREADY_PAID');
        throw err;
      }

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: appliedAmount,
          method: normalizedMethod,
          reference: reference || null,
          notes: notes || null,
          collectedBy: req.staff?.id || null,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { paidAmount: nextPaidAmount, paymentStatus },
      });

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
            reason: 'Overpayment refunded to wallet',
            orderId,
          },
        });
      }

      await tx.orderStage.create({
        data: {
          orderId,
          stage: 'PAYMENT_RECORDED',
          notes: `₹${appliedAmount} received via ${normalizedMethod}${reference ? ` (Ref: ${reference})` : ''}${overpayment > 0 ? `. ₹${overpayment} credited to wallet` : ''}`,
          changedById: req.staff?.id || null,
        },
      });

      return { payment, updatedOrder, overpayment };
    });

    created(res, {
      payment,
      paidAmount:    updatedOrder.paidAmount,
      paymentStatus: updatedOrder.paymentStatus,
      balance:       Math.max(0, Number(updatedOrder.totalAmount) - Number(updatedOrder.paidAmount) - Number(updatedOrder.writeOffAmount || 0)),
      overpayment,
    }, 'Payment recorded successfully');
    if (updatedOrder.paymentStatus === 'PAID') {
      processReferralQualification(orderId).catch(() => {});
    }
  } catch (err) {
    console.error('recordPayment:', err);
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'ORDER_ALREADY_PAID') return badRequest(res, 'This order is already fully paid');
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

    const payments = await prisma.payment.findMany({
      where:   { createdAt: { gte: start, lte: end }, status: { not: 'FAILED' } },
      include: {
        order:            { select: { orderNumber: true, customer: { select: { name: true, phone: true } } } },
        collectedByStaff: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paymentMethod = (payment) => normalizePaymentMethod(payment.method || payment.mode);
    const normalizedPayments = payments.map((payment) => ({
      ...payment,
      method: paymentMethod(payment),
    }));
    const byMethod = normalizedPayments.reduce((acc, payment) => {
      acc[payment.method] = Number(((acc[payment.method] || 0) + Number(payment.amount || 0)).toFixed(2));
      return acc;
    }, {});
    const summary = {
      total:  normalizedPayments.reduce((s, p) => s + p.amount, 0),
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
    const orders = await prisma.order.findMany({
      where:   { ...ORDER_ONLY_WHERE, paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, status: { not: 'CANCELLED' } },
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const total = orders.reduce((s, o) => s + Math.max(0, o.totalAmount - o.paidAmount - (o.writeOffAmount || 0)), 0);

    return success(res, {
      total,
      orders: orders.map((o) => ({
        ...o,
        balance: Math.max(0, o.totalAmount - o.paidAmount - (o.writeOffAmount || 0)),
      })),
    });
  } catch (err) {
    return error(res, 'Failed to fetch receivables');
  }
};

module.exports = { recordPayment, getOrderPayments, getDailySummary, getReceivables };
