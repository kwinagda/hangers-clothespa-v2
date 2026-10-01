const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');

process.env.RAZORPAY_KEY_ID = 'rzp_test_status_unit';
const targetFor = (invoice, shareId) => ({ invoice, share: { id: shareId, resourceType: 'INVOICE', resourceId: invoice.id } });
const boundAttempt = (invoice, shareId, fields) => ({
  customerId: invoice.customerId, invoiceId: invoice.id, publicShareId: shareId,
  amountPaise: BigInt(Math.round(invoice.balanceDue * 100)), currency: 'INR', mode: 'TEST', ...fields,
});
const boundProvider = (attempt, payments) => ({ orders: {
  fetchPayments: async () => ({ count: payments.length, items: payments.map((payment) => ({
    order_id: attempt.razorpayOrderId, amount: Number(attempt.amountPaise), currency: attempt.currency, ...payment,
  })) }),
  fetch: async () => ({
    id: attempt.razorpayOrderId, amount: Number(attempt.amountPaise), currency: attempt.currency,
    status: 'created', attempts: payments.length, amount_due: Number(attempt.amountPaise), amount_paid: 0,
    notes: { crm_attempt_id: attempt.id, invoice_id: attempt.invoiceId, share_id: attempt.publicShareId },
  }),
} });

test('status polling settles a captured payment bound to the same invoice share', async () => {
  const originalShareId = 'share_original';
  const invoice = { id: 'invoice_123', customerId: 'customer_123', invoiceNumber: 'INV-123', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = boundAttempt(invoice, originalShareId, {
    id: 'attempt_123',
    invoiceId: invoice.id,
    publicShareId: originalShareId,
    razorpayOrderId: 'order_123',
    amountPaise: 10000n,
    currency: 'INR',
    status: 'CREATED',
  });
  const provider = boundProvider(attempt, [{ id: 'pay_123', status: 'captured' }]);
  let settlementArgs;
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: originalShareId, invoiceId: invoice.id });
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
    params: { slug: originalShareId },
    query: { invoiceId: invoice.id },
    headers: {},
    id: 'request_123',
  }, res, undefined, {
    getPublicInvoiceForPayment: async (slug, options) => {
      assert.equal(slug, originalShareId);
      assert.deepEqual(options, { invoiceId: invoice.id });
      return targetFor(invoice, originalShareId);
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
  const invoice = { id: 'invoice_456', customerId: 'customer_456', invoiceNumber: 'INV-456', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  const attempt = boundAttempt(invoice, 'new_share_id', { id: 'attempt_456', status: 'FAILED', razorpayOrderId: 'order_456', razorpayPaymentId: 'pay_456' });
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'new_share_id', invoiceId: invoice.id });
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
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'new_share_id'),
    prisma: fakePrisma,
    getRazorpay: () => boundProvider(attempt, []),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'FAILED');
  assert.equal(res.body.data.attemptId, attempt.id);
  assert.equal(res.body.data.razorpayOrderId, attempt.razorpayOrderId);
  assert.equal(res.body.data.razorpayPaymentId, attempt.razorpayPaymentId);
});

test('status polling refreshes a failed attempt to the latest provider failure on the same Order', async () => {
  const invoice = { id: 'invoice_retry', customerId: 'customer_retry', invoiceNumber: 'INV-RETRY', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = boundAttempt(invoice, 'share_retry', { id: 'attempt_retry', status: 'FAILED', razorpayOrderId: 'order_retry', razorpayPaymentId: 'pay_old' });
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
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'share_retry'),
    getRazorpay: () => boundProvider(attempt, providerPayments),
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
  const invoice = { id: 'invoice_retry_capture', customerId: 'customer_retry_capture', invoiceNumber: 'INV-RETRY-CAPTURE', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = boundAttempt(invoice, 'share_retry_capture', { id: 'attempt_retry_capture', status: 'FAILED', razorpayOrderId: 'order_retry_capture' });
  let settledPaymentId;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_retry_capture' }, query: {}, headers: {}, id: 'request_retry_capture',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'share_retry_capture'),
    getRazorpay: () => boundProvider(attempt, [
      { id: 'pay_retry_fail', status: 'failed', created_at: 100 },
      { id: 'pay_retry_captured', status: 'captured', captured: true, created_at: 200 },
    ]),
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
  const invoice = { id: 'invoice_retry_pending', customerId: 'customer_retry_pending', invoiceNumber: 'INV-RETRY-PENDING', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  let attempt = boundAttempt(invoice, 'share_retry_pending', { id: 'attempt_retry_pending', status: 'FAILED', razorpayOrderId: 'order_retry_pending' });
  let pendingPaymentId;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_retry_pending' }, query: {}, headers: {}, id: 'request_retry_pending',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'share_retry_pending'),
    getRazorpay: () => boundProvider(attempt, [
      { id: 'pay_retry_old', status: 'failed', created_at: 100 },
      { id: 'pay_retry_pending', status: 'created', created_at: 200 },
    ]),
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
  const invoice = { id: 'invoice_789', customerId: 'customer_789', invoiceNumber: 'INV-789', status: 'OPEN', balanceDue: 73, paidAmount: 0 };
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(orderBy, { createdAt: 'desc' });
        if (where.publicShareId) {
          assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'share_789', invoiceId: invoice.id });
        } else {
          assert.deepEqual(where, {
            customerId: invoice.customerId,
            OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }],
            status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] },
          });
        }
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
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'share_789'),
    prisma: fakePrisma,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'NONE');
  assert.equal(res.body.data.attemptId, null);
});

test('a fresh invoice link sees another link’s unresolved attempt but cannot resume it', async () => {
  const invoice = { id: 'invoice_790', customerId: 'customer_790', invoiceNumber: 'INV-790', status: 'OPEN', balanceDue: 73, paidAmount: 0 };
  const activeAttempt = boundAttempt(invoice, 'original_share', {
    id: 'attempt_original', status: 'PENDING', razorpayOrderId: 'order_existing', razorpayPaymentId: 'pay_existing', amountPaise: 7300n,
  });
  let lookup = 0;
  let providerCalls = 0;
  const fakePrisma = {
    razorpayCheckoutAttempt: {
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(orderBy, { createdAt: 'desc' });
        lookup += 1;
        if (lookup === 1) {
          assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'fresh_share', invoiceId: invoice.id });
          return null;
        }
        assert.deepEqual(where, {
          customerId: invoice.customerId,
          OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }],
          status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] },
        });
        return activeAttempt;
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
    params: { slug: 'fresh_link' }, query: { checkoutIntegration: 'CUSTOM' }, headers: {}, id: 'request_790',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'fresh_share'),
    prisma: fakePrisma,
    getRazorpay: () => { providerCalls += 1; throw new Error('must not query another link’s order'); },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.equal(res.body.data.attemptId, null);
  assert.equal(res.body.data.razorpayOrderId, 'order_existing');
  assert.equal(res.body.data.razorpayPaymentId, 'pay_existing');
  assert.equal(providerCalls, 0);
});
