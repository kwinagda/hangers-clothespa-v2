// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS CONTROLLER — Record, update, and track payments for orders
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');

// ── POST /api/v1/payments — Record a payment for an order ─────────────────────
const recordPayment = async (req, res) => {
  try {
    const { orderId, amount, method, reference, notes } = req.body;

    if (!orderId || !amount || !method) {
      return res.status(400).json({ error: 'orderId, amount, and method are required' });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Record payment entry
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount:    parseFloat(amount),
        method,           // CASH | UPI | CARD | RAZORPAY | OTHER
        reference:  reference || null,
        notes:      notes || null,
        collectedBy: req.staff?.id || null,
      },
    });

    // Recalculate total paid
    const allPayments = await prisma.payment.findMany({ where: { orderId } });
    let totalPaid   = allPayments.reduce((sum, p) => sum + p.amount, 0);

    // Determine payment status
    let paymentStatus = 'UNPAID';
    if (totalPaid >= order.totalAmount) paymentStatus = 'PAID';
    else if (totalPaid > 0)             paymentStatus = 'PARTIAL';

    // Handle overpayment → wallet credit
    const overpayment = totalPaid - order.totalAmount;
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
          reason:     'Overpayment refunded to wallet',
          orderId,
        }
      });
      // Cap paid amount at total
      totalPaid = order.totalAmount;
      paymentStatus = 'PAID';
    }

    // Update order paid amount + status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data:  { paidAmount: totalPaid, paymentStatus },
    });

    // Log activity
    await prisma.orderStage.create({
      data: {
        orderId,
        stage:   'PAYMENT_RECORDED',
        notes:   `₹${amount} received via ${method}${reference ? ` (Ref: ${reference})` : ''}`,
        changedById: req.staff?.id || null,
      },
    });

    res.status(201).json({
      success: true,
      payment,
      paidAmount:    totalPaid,
      paymentStatus: updatedOrder.paymentStatus,
      balance:       Math.max(0, order.totalAmount - totalPaid),
    });
  } catch (err) {
    console.error('recordPayment:', err);
    res.status(500).json({ error: 'Failed to record payment' });
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
    res.json({ success: true, data: { payments } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

// ── GET /api/v1/payments/daily — Daily cash register summary ─────────────────
const getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const day   = date ? new Date(date) : new Date();
    const start = new Date(day.setHours(0, 0, 0, 0));
    const end   = new Date(day.setHours(23, 59, 59, 999));

    const payments = await prisma.payment.findMany({
      where:   { createdAt: { gte: start, lte: end } },
      include: {
        order:            { select: { orderNumber: true, customer: { select: { name: true, phone: true } } } },
        collectedByStaff: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      total:  payments.reduce((s, p) => s + p.amount, 0),
      cash:   payments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0),
      upi:    payments.filter(p => p.method === 'UPI').reduce((s, p) => s + p.amount, 0),
      card:   payments.filter(p => p.method === 'CARD').reduce((s, p) => s + p.amount, 0),
      online: payments.filter(p => p.method === 'RAZORPAY').reduce((s, p) => s + p.amount, 0),
      count:  payments.length,
    };

    res.json({ success: true, data: { summary, payments } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily summary' });
  }
};

// ── GET /api/v1/payments/receivables — Outstanding balances ──────────────────
const getReceivables = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where:   { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, status: { not: 'CANCELLED' } },
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const total = orders.reduce((s, o) => s + (o.totalAmount - o.paidAmount), 0);

    res.json({ success: true, data: { total, orders: orders.map(o => ({
      ...o,
      balance: o.totalAmount - o.paidAmount,
    })) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch receivables' });
  }
};

module.exports = { recordPayment, getOrderPayments, getDailySummary, getReceivables };
