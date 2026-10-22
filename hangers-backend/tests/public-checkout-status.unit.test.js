const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');
const { RazorpayCheckoutError } = require('../src/services/razorpay-invoice-checkout.service');

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

test('customer share recovers its explicit combined attempt after the outstanding anchor changes', async () => {
  const invoice = { id: 'new-outstanding-invoice', customerId: 'home', balanceDue: 20, status: 'OPEN' };
  const attempt = boundAttempt(invoice, 'customer-share', {
    id: 'combined-attempt', invoiceId: 'settled-original-anchor', status: 'CAPTURED',
    razorpayOrderId: 'order_combined', razorpayPaymentId: 'pay_combined', amountPaise: 3000n,
    allocationPlan: [{ invoiceId: 'settled-original-anchor', invoiceNumber: 'INV-OLD', amount: 30 }],
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'customer-share' }, query: { invoiceId: invoice.id, attemptId: attempt.id }, headers: {},
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice, share: { id: 'customer-share', resourceType: 'CUSTOMER', resourceId: 'home' } }),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async ({ where }) => {
        assert.deepEqual(where, { customerId: 'home', mode: 'TEST', id: attempt.id });
        return attempt;
      } },
      invoice: { findUnique: async () => invoice },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.paymentId, 'pay_combined');
  assert.equal(res.body.data.allocations[0].invoiceId, 'settled-original-anchor');
  assert.equal(res.body.data.invoice.balanceDue, 20, 'new invoice remains unpaid');
});

test('combined status checks unresolved attempts on every unpaid invoice, not only its first invoice', async () => {
  const invoice = { id: 'first', customerId: 'home', balanceDue: 10, status: 'OPEN' };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getPublicRazorpayCheckoutStatus({ params: { slug: 'customer-share' }, query: { invoiceId: 'first' }, headers: {} }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice, share: { id: 'customer-share', resourceType: 'CUSTOMER', resourceId: 'home' } }),
    prisma: {
      invoice: { findMany: async ({ where }) => {
        assert.equal(where.customerId, 'home');
        return [{ id: 'first' }, { id: 'second' }];
      }, findUnique: async () => invoice },
      razorpayCheckoutAttempt: { findFirst: async ({ where }) => {
        if (where.publicShareId) return null;
        assert.equal(where.mode, 'TEST');
        assert.deepEqual(where.OR, [{ invoiceId: { in: ['first', 'second'] } },
          { allocationPlan: { array_contains: [{ invoiceId: 'first' }] } },
          { allocationPlan: { array_contains: [{ invoiceId: 'second' }] } }]);
        return boundAttempt(invoice, 'individual-share', { id: 'second-attempt', invoiceId: 'second', status: 'PENDING', razorpayOrderId: 'order_second' });
      } },
    },
    getRazorpay: () => boundProvider({
      id: 'second-attempt', invoiceId: 'second', customerId: 'home', amountPaise: 1000n,
      currency: 'INR', mode: 'TEST', razorpayOrderId: 'order_second', publicShareId: 'individual-share',
    }, [{ id: 'pay_second', status: 'created', created_at: 1 }]),
    markAttemptPending: async ({ attemptId }) => ({
      id: attemptId, invoiceId: 'second', customerId: 'home', amountPaise: 1000n,
      currency: 'INR', mode: 'TEST', status: 'PENDING', razorpayOrderId: 'order_second', razorpayPaymentId: 'pay_second',
    }),
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.equal(res.body.data.razorpayOrderId, 'order_second');
  assert.equal(res.body.data.attemptId, 'second-attempt');
});

test('refreshed customer share resumes a failed combined order only after Razorpay confirms all payments failed', async () => {
  const invoiceIds = ['invoice-a', 'invoice-b', 'invoice-c'];
  const invoice = { id: invoiceIds[0], customerId: 'home', invoiceNumber: 'INV-A', balanceDue: 10, status: 'OPEN' };
  const allocationPlan = [
    { invoiceId: invoiceIds[0], invoiceNumber: 'INV-A', amount: 10 },
    { invoiceId: invoiceIds[1], invoiceNumber: 'INV-B', amount: 10 },
    { invoiceId: invoiceIds[2], invoiceNumber: 'INV-C', amount: 100 },
  ];
  const attempt = boundAttempt(invoice, 'previous-customer-share', {
    id: 'combined-failed-attempt', status: 'FAILED', razorpayOrderId: 'order_combined_failed',
    razorpayPaymentId: 'pay_latest_failed', amountPaise: 12000n, allocationPlan,
  });
  const allocationHash = crypto.createHash('sha256')
    .update(JSON.stringify(allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount }))))
    .digest('hex');
  const payments = [
    { id: 'pay_failed_1', status: 'failed', created_at: 1 },
    { id: 'pay_latest_failed', status: 'failed', created_at: 2 },
  ];
  const provider = { orders: {
    fetchPayments: async () => ({ items: payments.map((payment) => ({
      order_id: attempt.razorpayOrderId, amount: 12000, currency: 'INR', ...payment,
    })) }),
    fetch: async () => ({ id: attempt.razorpayOrderId, amount: 12000, currency: 'INR', status: 'attempted',
      attempts: 2, amount_due: 12000, amount_paid: 0, notes: {
        crm_attempt_id: attempt.id, invoice_id: attempt.invoiceId,
        share_id: attempt.publicShareId, allocation_plan_hash: allocationHash,
      } }),
  } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'current-customer-share' }, query: { invoiceId: invoice.id, checkoutIntegration: 'CUSTOM' }, headers: {},
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice, share: {
      id: 'current-customer-share', resourceType: 'CUSTOMER', resourceId: 'home', invoiceIds,
    } }),
    prisma: {
      invoice: {
        findMany: async ({ where }) => {
          assert.equal(where.customerId, 'home');
          assert.deepEqual(where.id, { in: invoiceIds });
          return invoiceIds.map((id) => ({ id }));
        },
        findUnique: async () => invoice,
      },
      razorpayCheckoutAttempt: {
        findFirst: async ({ where }) => {
          if (where.publicShareId) return null;
          assert.equal(where.mode, 'TEST');
          assert.deepEqual(where.status.in, ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW', 'FAILED', 'SUPERSEDED']);
          return attempt;
        },
      },
    },
    getPublicPaymentSummary: async (customerId, _legalTerms, scopedInvoiceIds) => {
      assert.equal(customerId, 'home');
      assert.deepEqual(scopedInvoiceIds, invoiceIds);
      return { receivables: allocationPlan.map((item) => ({ invoiceId: item.invoiceId, balanceDue: item.amount })) };
    },
    getRazorpay: () => provider,
    markAttemptFailed: async ({ paymentId }) => ({ ...attempt, status: 'FAILED', razorpayPaymentId: paymentId }),
  });

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.attemptId, attempt.id);
  assert.equal(res.body.data.status, 'FAILED');
  assert.equal(res.body.data.razorpayOrderId, attempt.razorpayOrderId);
  assert.equal(res.body.data.razorpayPaymentId, 'pay_latest_failed');
  assert.equal(res.body.data.canResumeCheckout, true);
  assert.equal(res.body.data.providerLookupUnavailable, false);
});

test('individual invoice status reconciles an overlapping combined attempt without exposing other allocations', async () => {
  const invoice = { id: 'invoice-b', customerId: 'customer-b', invoiceNumber: 'INV-B', balanceDue: 20, status: 'OPEN' };
  let attempt = boundAttempt(invoice, 'combined-share', {
    id: 'combined-attempt-b', invoiceId: 'invoice-a', publicShareId: 'combined-share',
    status: 'CREATED', razorpayOrderId: 'order-combined-b', amountPaise: 3000n,
    allocationPlan: [
      { invoiceId: 'invoice-a', invoiceNumber: 'INV-A', amount: 10 },
      { invoiceId: 'invoice-b', invoiceNumber: 'INV-B', amount: 20 },
    ],
  });
  const planHash = crypto.createHash('sha256').update(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))).digest('hex');
  const provider = { orders: {
    fetchPayments: async () => ({ items: [{ id: 'pay-pending-b', order_id: attempt.razorpayOrderId, amount: 3000, currency: 'INR', status: 'created', created_at: 1 }] }),
    fetch: async () => ({ id: attempt.razorpayOrderId, amount: 3000, currency: 'INR', status: 'attempted', attempts: 1,
      amount_due: 3000, amount_paid: 0, notes: { crm_attempt_id: attempt.id, invoice_id: attempt.invoiceId,
        share_id: attempt.publicShareId, allocation_plan_hash: planHash } }),
  } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'invoice-share-b' }, query: { invoiceId: invoice.id, checkoutIntegration: 'CUSTOM' }, headers: {},
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice, share: { id: 'invoice-share-b', resourceType: 'INVOICE', resourceId: invoice.id } }),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async ({ where }) => {
        if (where.publicShareId) return null;
        assert.deepEqual(where.OR, [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }]);
        return attempt;
      }, findUnique: async () => attempt },
      invoice: { findUnique: async () => invoice },
    },
    getRazorpay: () => provider,
    markAttemptPending: async ({ paymentId }) => {
      attempt = { ...attempt, status: 'PENDING', razorpayPaymentId: paymentId };
      return attempt;
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(res.body.data.attemptId, attempt.id);
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.deepEqual(res.body.data.allocations, []);
  assert.equal(res.body.data.razorpayOrderId, attempt.razorpayOrderId);
});

test('captured combined status on an individual link returns only that invoice allocation', async () => {
  const invoice = { id: 'invoice-b', customerId: 'customer-b', invoiceNumber: 'INV-B', balanceDue: 0, paidAmount: 20, status: 'PAID' };
  const attempt = boundAttempt(invoice, 'combined-share', {
    id: 'combined-attempt-b', invoiceId: 'invoice-a', publicShareId: 'combined-share',
    status: 'CAPTURED', razorpayOrderId: 'order-combined-b', razorpayPaymentId: 'pay-combined-b', amountPaise: 3000n,
    allocationPlan: [
      { invoiceId: 'invoice-a', invoiceNumber: 'INV-A', amount: 10 },
      { invoiceId: 'invoice-b', invoiceNumber: 'INV-B', amount: 20 },
    ],
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'invoice-share-b' }, query: { invoiceId: invoice.id, attemptId: attempt.id, checkoutIntegration: 'CUSTOM' }, headers: {},
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice, share: { id: 'invoice-share-b', resourceType: 'INVOICE', resourceId: invoice.id } }),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async ({ where }) => {
        assert.equal(where.id, attempt.id);
        assert.equal(where.customerId, invoice.customerId);
        assert.deepEqual(where.OR, [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }]);
        return attempt;
      } },
      invoice: { findUnique: async () => invoice },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.capturedAmountPaise, '2000');
  assert.deepEqual(res.body.data.allocations, [{ invoiceId: 'invoice-b', invoiceNumber: 'INV-B', amountPaise: '2000' }]);
});

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
        assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: originalShareId, invoiceId: invoice.id, mode: 'TEST' });
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
        assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'new_share_id', invoiceId: invoice.id, mode: 'TEST' });
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
          assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'share_789', invoiceId: invoice.id, mode: 'TEST' });
        } else {
          assert.deepEqual(where, {
            customerId: invoice.customerId,
            mode: 'TEST',
            OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }],
            status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW', 'FAILED', 'SUPERSEDED'] },
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

test('a new valid invoice share shows only its own posted Razorpay capture when the invoice is paid', async () => {
  const invoice = { id: 'invoice_paid_share', customerId: 'customer_paid_share', invoiceNumber: 'INV-PAID-SHARE', status: 'PAID', balanceDue: 0, paidAmount: 100 };
  let paymentLookup = 0;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'fresh_paid_share' }, query: { invoiceId: invoice.id, checkoutIntegration: 'CUSTOM' }, headers: {}, id: 'request_paid_share',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'fresh_paid_share'),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async () => null },
      invoice: { findUnique: async () => invoice },
      paymentAllocation: {
        findFirst: async (query) => {
          paymentLookup += 1;
          assert.deepEqual(query, {
            where: {
              invoiceId: invoice.id, status: 'POSTED', reversedAt: null,
              payment: { is: {
                method: 'RAZORPAY', status: 'CAPTURED', mode: 'TEST', reversedAt: null,
                OR: [{ razorpayPaymentId: { not: null } }, { razorpayOrderId: { not: null } }],
              } },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              amount: true,
              invoice: { select: { invoiceNumber: true } },
              payment: { select: { razorpayOrderId: true, razorpayPaymentId: true, createdAt: true } },
            },
          });
          return {
            amount: 100,
            invoice: { invoiceNumber: invoice.invoiceNumber },
            payment: { razorpayOrderId: 'order_paid_invoice', razorpayPaymentId: 'pay_paid_invoice', createdAt: new Date('2026-10-02T00:00:00.000Z') },
          };
        },
      },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'CAPTURED');
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.equal(res.body.data.paymentId, 'pay_paid_invoice');
  assert.equal(res.body.data.razorpayOrderId, 'order_paid_invoice');
  assert.equal(res.body.data.capturedAmountPaise, '10000');
  assert.deepEqual(res.body.data.allocations, [{ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amountPaise: '10000' }]);
  assert.equal(paymentLookup, 1);
});

test('an explicit missing attempt ID does not fall back to invoice payment history', async () => {
  const invoice = { id: 'invoice_missing_attempt', customerId: 'customer_missing_attempt', invoiceNumber: 'INV-MISSING-ATTEMPT', status: 'PAID', balanceDue: 0, paidAmount: 100 };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'valid_paid_share' }, query: { invoiceId: invoice.id, attemptId: 'missing_attempt' }, headers: {}, id: 'request_missing_attempt',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'valid_paid_share'),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async () => null },
      invoice: { findUnique: async () => invoice },
      paymentAllocation: { findFirst: async () => assert.fail('must not expose a historical capture for an explicit attempt lookup') },
    },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'CHECKOUT_ATTEMPT_NOT_FOUND');
});

test('a fresh invoice link can inspect an unresolved attempt but cannot resume an attempted payment', async () => {
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
          assert.deepEqual(where, { customerId: invoice.customerId, publicShareId: 'fresh_share', invoiceId: invoice.id, mode: 'TEST' });
          return null;
        }
        assert.deepEqual(where, {
          customerId: invoice.customerId,
          mode: 'TEST',
          OR: [{ invoiceId: invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: invoice.id }] } }],
          status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW', 'FAILED', 'SUPERSEDED'] },
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
    getRazorpay: () => {
      providerCalls += 1;
      return { orders: {
        fetchPayments: async () => ({ count: 1, items: [{
          id: 'pay_existing', order_id: 'order_existing', amount: 7300, currency: 'INR', status: 'created',
        }] }),
        fetch: async () => ({
          id: 'order_existing', amount: 7300, currency: 'INR', status: 'attempted', attempts: 1,
          amount_due: 7300, amount_paid: 0,
          notes: { crm_attempt_id: activeAttempt.id, invoice_id: invoice.id, share_id: 'original_share' },
        }),
      } };
    },
    markAttemptPending: async ({ attemptId, paymentId }) => ({ ...activeAttempt, id: attemptId, razorpayPaymentId: paymentId }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.equal(res.body.data.attemptId, activeAttempt.id);
  assert.equal(res.body.data.razorpayOrderId, 'order_existing');
  assert.equal(res.body.data.razorpayPaymentId, 'pay_existing');
  assert.equal(providerCalls, 1);
});

test('a fresh invoice link resumes the same provider order only when Razorpay confirms zero attempts and payments', async () => {
  const invoice = { id: 'invoice_share_resume', customerId: 'customer_share_resume', invoiceNumber: 'INV-SHARE-RESUME', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  const attempt = boundAttempt(invoice, 'original_share', {
    id: 'attempt_share_resume', status: 'CREATED', razorpayOrderId: 'order_share_resume',
  });
  let lookup = 0;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'fresh_invoice_link' }, query: { checkoutIntegration: 'CUSTOM' }, headers: {}, id: 'request_share_resume',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'fresh_share'),
    prisma: {
      razorpayCheckoutAttempt: {
        findFirst: async ({ where }) => {
          lookup += 1;
          if (lookup === 1) return null;
          assert.deepEqual(where.status, { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW', 'FAILED', 'SUPERSEDED'] });
          return attempt;
        },
      },
      invoice: { findUnique: async () => invoice },
    },
    getRazorpay: () => boundProvider(attempt, []),
    logRazorpayAction: async () => {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'CREATED');
  assert.equal(res.body.data.attemptId, attempt.id);
  assert.equal(res.body.data.razorpayOrderId, attempt.razorpayOrderId);
  assert.equal(res.body.data.canResumeCheckout, true);
  assert.equal(res.body.data.providerLookupUnavailable, false);
});

test('provider status outage preserves the unresolved attempt and never enables another payment', async () => {
  const invoice = { id: 'invoice_outage', customerId: 'customer_outage', invoiceNumber: 'INV-OUTAGE', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  const attempt = boundAttempt(invoice, 'share_outage', {
    id: 'attempt_outage', status: 'PENDING', razorpayOrderId: 'order_outage', razorpayPaymentId: 'pay_outage',
  });
  let settlementCalls = 0;
  let failureCalls = 0;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'share_outage' },
    query: { invoiceId: invoice.id, checkoutIntegration: 'CUSTOM' },
    headers: {}, id: 'request_outage',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'share_outage'),
    getRazorpay: () => ({ orders: {
      fetchPayments: async () => { throw Object.assign(new Error('provider timeout'), { code: 'ETIMEDOUT' }); },
      fetch: async () => { throw new Error('must not continue provider lookup'); },
    } }),
    prisma: {
      razorpayCheckoutAttempt: {
        findFirst: async () => attempt,
        findUnique: async () => attempt,
      },
      invoice: { findUnique: async () => invoice },
    },
    settleCapturedPayment: async () => { settlementCalls += 1; },
    markAttemptFailed: async () => { failureCalls += 1; },
    logRazorpayAction: async () => {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'PENDING');
  assert.equal(res.body.data.canResumeCheckout, false);
  assert.equal(res.body.data.providerLookupUnavailable, true);
  assert.equal(res.body.data.razorpayOrderId, 'order_outage');
  assert.equal(res.body.data.razorpayPaymentId, 'pay_outage');
  assert.equal(res.body.data.invoice.status, 'OPEN');
  assert.equal(res.body.data.invoice.balanceDue, 100);
  assert.equal(settlementCalls, 0);
  assert.equal(failureCalls, 0);
});

test('unexpected checkout status failures log safe request correlation without raw exceptions', async () => {
  const log = [];
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'test-share' }, query: { checkoutIntegration: 'CUSTOM' }, headers: {}, id: 'request_status_diag',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => { throw new Error('do not persist this raw detail'); },
    logRazorpayAction: async (_req, action, description, metadata, status) => log.push({ action, description, metadata, status }),
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'CHECKOUT_STATUS_CHECK_FAILED');
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'RAZORPAY_PAYMENT_STATUS_CHECK_FAILED');
  assert.equal(log[0].metadata.requestId, 'request_status_diag');
  assert.equal(log[0].metadata.errorClass, 'Error');
  assert.equal(log[0].metadata.applicationErrorCode, null);
  assert.equal(JSON.stringify(log[0]).includes('do not persist this raw detail'), false);
});

test('typed checkout status failures log their safe CRM code and invoice correlation', async () => {
  const log = [];
  const invoice = { id: 'invoice_diag', customerId: 'customer_diag', invoiceNumber: 'INV-DIAG', status: 'OPEN', balanceDue: 100, paidAmount: 0 };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: 'test-share' }, query: { checkoutIntegration: 'CUSTOM' }, headers: {}, id: 'request_typed_diag',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => targetFor(invoice, 'test-share'),
    prisma: { razorpayCheckoutAttempt: { findFirst: async () => { throw new RazorpayCheckoutError('CHECKOUT_DIAGNOSTIC', 'safe client message', 503); } } },
    logRazorpayAction: async (_req, action, description, metadata, status) => log.push({ action, description, metadata, status }),
  });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'CHECKOUT_DIAGNOSTIC');
  assert.equal(log[0].metadata.requestId, 'request_typed_diag');
  assert.equal(log[0].metadata.invoiceId, invoice.id);
  assert.equal(log[0].metadata.applicationErrorCode, 'CHECKOUT_DIAGNOSTIC');
  assert.equal(log[0].metadata.errorClass, 'RazorpayCheckoutError');
});
