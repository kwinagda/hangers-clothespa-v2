const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');

test('status polling settles a captured payment through a refreshed token for the same invoice', async () => {
  const originalShareId = 'share_original';
  const refreshedShareId = 'share_refreshed';
  const invoice = { id: 'invoice_123', invoiceNumber: 'INV-123', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = {
    id: 'attempt_123',
    invoiceId: invoice.id,
    publicShareId: originalShareId,
    razorpayOrderId: 'order_123',
    amountPaise: 10000n,
    currency: 'INR',
    status: 'CREATED',
  };
  const provider = {
    orders: {
      fetchPayments: async (orderId) => {
        assert.equal(orderId, attempt.razorpayOrderId);
        return { count: 1, items: [{ id: 'pay_123', order_id: orderId, status: 'captured' }] };
      },
    },
  };
  let settlementArgs;
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }] });
        return attempt;
      },
      findUnique: async ({ where }) => {
        assert.equal(where.id, attempt.id);
        return attempt;
      },
    },
    invoice: {
      findUnique: async ({ where }) => {
        assert.equal(where.id, invoice.id);
        return { ...invoice, status: 'PAID', balanceDue: 0, paidAmount: 100 };
      },
    },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: refreshedShareId },
    query: { invoiceId: invoice.id },
    headers: {},
    id: 'request_123',
  }, res, undefined, {
    getPublicInvoiceForPayment: async (slug, options) => {
      assert.equal(slug, refreshedShareId);
      assert.deepEqual(options, { invoiceId: invoice.id });
      return { share: { id: refreshedShareId }, invoice };
    },
    getRazorpay: () => provider,
    prisma: fakePrisma,
    settleCapturedPayment: async (args) => {
      settlementArgs = args;
      attempt = { ...attempt, status: 'CAPTURED', razorpayPaymentId: args.paymentId };
    },
  });

  assert.equal(originalShareId, attempt.publicShareId);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'CAPTURED');
  assert.equal(res.body.data.paymentId, 'pay_123');
  assert.equal(res.body.data.invoice.status, 'PAID');
  assert.deepEqual(settlementArgs, {
    paymentId: 'pay_123',
    providerOrderId: 'order_123',
    source: 'STATUS_POLL',
    expectedInvoiceId: invoice.id,
    expectedShareId: originalShareId,
  });
});

test('status recovery resolves the latest invoice attempt without a browser-cached attempt ID', async () => {
  const invoice = { id: 'invoice_456', invoiceNumber: 'INV-456', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  const attempt = { id: 'attempt_456', invoiceId: invoice.id, status: 'FAILED', razorpayOrderId: 'order_456' };
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(where, { OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }] });
        assert.deepEqual(orderBy, { createdAt: 'desc' });
        return attempt;
      },
    },
    invoice: { findUnique: async () => invoice },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'refreshed_public_link' }, query: {}, headers: {}, id: 'request_456',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ share: { id: 'new_share_id' }, invoice }),
    prisma: fakePrisma,
    getRazorpay: () => ({ orders: { fetchPayments: async () => ({ items: [] }) } }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'FAILED');
  assert.equal(res.body.data.attemptId, attempt.id);
});

test('status polling refreshes a failed attempt to the latest provider failure on the same Order', async () => {
  const invoice = { id: 'invoice_retry', invoiceNumber: 'INV-RETRY', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = { id: 'attempt_retry', invoiceId: invoice.id, status: 'FAILED', razorpayOrderId: 'order_retry', razorpayPaymentId: 'pay_old' };
  let failureArgs;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const providerPayments = [
    { id: 'pay_old', status: 'failed', created_at: 100 },
    { id: 'pay_new', status: 'failed', created_at: 200 },
  ];

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_retry' }, query: {}, headers: {}, id: 'request_retry',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ share: { id: 'share_retry' }, invoice }),
    getRazorpay: () => ({ orders: { fetchPayments: async () => ({ items: providerPayments }) } }),
    prisma: {
      razorpayCheckoutAttempt: {
        findFirst: async () => attempt,
        findUnique: async () => attempt,
      },
      invoice: { findUnique: async () => invoice },
    },
    markAttemptFailed: async (args) => {
      failureArgs = args;
      attempt = { ...attempt, razorpayPaymentId: args.paymentId };
      return attempt;
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'FAILED');
  assert.equal(failureArgs.paymentId, 'pay_new');
  assert.equal(attempt.razorpayPaymentId, 'pay_new');
});

test('status polling settles a captured retry even when the local attempt was previously failed', async () => {
  const invoice = { id: 'invoice_retry_capture', invoiceNumber: 'INV-RETRY-CAPTURE', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = { id: 'attempt_retry_capture', invoiceId: invoice.id, status: 'FAILED', razorpayOrderId: 'order_retry_capture' };
  let settledPaymentId;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_retry_capture' }, query: {}, headers: {}, id: 'request_retry_capture',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ share: { id: 'share_retry_capture' }, invoice }),
    getRazorpay: () => ({ orders: { fetchPayments: async () => ({ items: [
      { id: 'pay_retry_fail', status: 'failed', created_at: 100 },
      { id: 'pay_retry_captured', status: 'captured', captured: true, created_at: 200 },
    ] }) } }),
    prisma: {
      razorpayCheckoutAttempt: {
        findFirst: async () => attempt,
        findUnique: async () => attempt,
      },
      invoice: { findUnique: async () => ({ ...invoice, status: 'PAID', balanceDue: 0, paidAmount: 100 }) },
    },
    settleCapturedPayment: async ({ paymentId }) => {
      settledPaymentId = paymentId;
      attempt = { ...attempt, status: 'CAPTURED', razorpayPaymentId: paymentId };
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'CAPTURED');
  assert.equal(res.body.data.paymentId, 'pay_retry_captured');
  assert.equal(settledPaymentId, 'pay_retry_captured');
});

test('status polling restores pending state when a retry on a failed attempt is nonterminal', async () => {
  const invoice = { id: 'invoice_retry_pending', invoiceNumber: 'INV-RETRY-PENDING', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = { id: 'attempt_retry_pending', invoiceId: invoice.id, status: 'FAILED', razorpayOrderId: 'order_retry_pending' };
  let pendingPaymentId;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_retry_pending' }, query: {}, headers: {}, id: 'request_retry_pending',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ share: { id: 'share_retry_pending' }, invoice }),
    getRazorpay: () => ({ orders: { fetchPayments: async () => ({ items: [
      { id: 'pay_retry_old', status: 'failed', created_at: 100 },
      { id: 'pay_retry_pending', status: 'created', created_at: 200 },
    ] }) } }),
    prisma: {
      razorpayCheckoutAttempt: {
        findFirst: async () => attempt,
        findUnique: async () => attempt,
      },
      invoice: { findUnique: async () => invoice },
    },
    markAttemptPending: async ({ paymentId }) => {
      pendingPaymentId = paymentId;
      attempt = { ...attempt, status: 'PENDING', razorpayPaymentId: paymentId };
      return attempt;
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(pendingPaymentId, 'pay_retry_pending');
});

test('status recovery returns NONE for an invoice without any checkout attempt', async () => {
  const invoice = { id: 'invoice_789', invoiceNumber: 'INV-789', status: 'OPEN', balanceDue: 73, paidAmount: 0 };
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(where, { OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }] });
        assert.deepEqual(orderBy, { createdAt: 'desc' });
        return null;
      },
    },
    invoice: { findUnique: async () => invoice },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'valid_public_link' }, query: {}, headers: {}, id: 'request_789',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ share: { id: 'share_789' }, invoice }),
    prisma: fakePrisma,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'NONE');
  assert.equal(res.body.data.attemptId, null);
});
