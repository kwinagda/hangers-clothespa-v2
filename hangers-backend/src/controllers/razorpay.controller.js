// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY CONTROLLER — Online payment for customer app
// Endpoints:
//   POST /customer/payments/razorpay/create-order  — create Razorpay order
//   POST /customer/payments/razorpay/verify        — verify & record payment
//   GET  /customer/payments/history                — customer payment history
// ─────────────────────────────────────────────────────────────────────────────

const crypto  = require('crypto');
const Razorpay = require('razorpay');
const prisma  = require('../config/database');
const { success, badRequest, error, unauthorized, notFound } = require('../utils/response');

// ── Razorpay instance ─────────────────────────────────────────────────────────
const getRazorpay = () => {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay keys not configured in .env');
  return new Razorpay({ key_id, key_secret });
};

const isDevMode = () => {
  const key = process.env.RAZORPAY_KEY_ID || '';
  return !key || key.includes('XXXX') || key.includes('YOUR_KEY');
};

// ── POST /customer/payments/razorpay/create-order ─────────────────────────────
const createRazorpayOrder = async (req, res) => {
  const { orderId } = req.body;
  const customerId  = req.customer.id;

  if (!orderId) return badRequest(res, 'orderId is required');

  try {
    // Fetch the hangers order — must belong to this customer
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true },
    });

    if (!order)                        return notFound(res, 'Order not found');
    if (order.paymentStatus === 'PAID') return badRequest(res, 'Order is already paid');
    if (order.totalAmount <= 0)        return badRequest(res, 'Order total must be greater than zero');

    // Dev mode — skip Razorpay, return a fake order
    if (isDevMode()) {
      const fakeRzpOrderId = `order_DEV_${Date.now()}`;
      return success(res, {
        razorpayOrderId: fakeRzpOrderId,
        amount:          order.totalAmount * 100,  // paise
        currency:        'INR',
        key:             'rzp_test_DEV_MODE',
        orderNumber:     order.orderNumber,
        orderAmount:     order.totalAmount,
        devMode:         true,
        note:            'Add RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to .env for live payments',
      }, 'DEV MODE — Razorpay not configured');
    }

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount:   Math.round(order.totalAmount * 100), // paise
      currency: 'INR',
      receipt:  order.orderNumber,
      notes: {
        orderId:     order.id,
        orderNumber: order.orderNumber,
        customerId,
      },
    });

    return success(res, {
      razorpayOrderId: rzpOrder.id,
      amount:          rzpOrder.amount,
      currency:        rzpOrder.currency,
      key:             process.env.RAZORPAY_KEY_ID,
      orderNumber:     order.orderNumber,
      orderAmount:     order.totalAmount,
      devMode:         false,
    }, 'Razorpay order created');

  } catch (err) {
    console.error('createRazorpayOrder error:', err.message);
    return error(res, err.message || 'Failed to create payment order');
  }
};

// ── POST /customer/payments/razorpay/verify ───────────────────────────────────
const verifyRazorpayPayment = async (req, res) => {
  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    amount,
  } = req.body;
  const customerId = req.customer.id;

  if (!orderId || !razorpayPaymentId) return badRequest(res, 'Missing required fields');

  try {
    // Verify the order belongs to this customer
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true },
    });

    if (!order)                        return notFound(res, 'Order not found');
    if (order.paymentStatus === 'PAID') return badRequest(res, 'Order is already paid');

    // Dev mode — skip signature check
    if (!isDevMode()) {
      const body      = razorpayOrderId + '|' + razorpayPaymentId;
      const expected  = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      if (expected !== razorpaySignature) {
        return unauthorized(res, 'Payment verification failed — invalid signature');
      }
    }

    // Record payment in DB
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount:            amount || order.totalAmount,
        method:            'RAZORPAY',
        status:            'SUCCESS',
        razorpayOrderId:   razorpayOrderId   || null,
        razorpayPaymentId: razorpayPaymentId,
        razorpaySignature: razorpaySignature  || null,
        reference:         razorpayPaymentId,
        notes:             'Online payment via Razorpay',
      },
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        paidAmount:    { increment: amount || order.totalAmount },
      },
    });

    return success(res, {
      paymentId:   payment.id,
      orderNumber: order.orderNumber,
      amount:      payment.amount,
      method:      'RAZORPAY',
      status:      'SUCCESS',
    }, 'Payment successful! 🎉');

  } catch (err) {
    console.error('verifyRazorpayPayment error:', err.message);
    return error(res, 'Payment verification failed');
  }
};

// ── GET /customer/payments/history ────────────────────────────────────────────
const getPaymentHistory = async (req, res) => {
  const customerId = req.customer.id;

  try {
    // Get all payments for all orders belonging to this customer
    const payments = await prisma.payment.findMany({
      where: {
        order: { customerId },
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            status:      true,
            totalAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = payments.map(p => ({
      id:          p.id,
      amount:      p.amount,
      method:      p.method,
      status:      p.status,
      reference:   p.reference,
      createdAt:   p.createdAt,
      orderNumber: p.order?.orderNumber,
      orderStatus: p.order?.status,
    }));

    return success(res, { payments: formatted });
  } catch (err) {
    return error(res, 'Failed to fetch payment history');
  }
};

module.exports = { createRazorpayOrder, verifyRazorpayPayment, getPaymentHistory };
