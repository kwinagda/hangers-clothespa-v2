const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcilePublicRazorpayCheckout } = require('../src/controllers/public.controller');
const publicRouter = require('../src/routes/public.routes');

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('public checkout reconciliation is bound to the invoice in the share link', async () => {
  const attempt = {
    id: 'attempt_123', invoiceId: 'invoice_123', customerId: 'customer_123',
    status: 'REVIEW', allocationPlan: null,
  };
  const res = response();
  let reconcileArgs;

  await reconcilePublicRazorpayCheckout({
    params: { slug: 'public-link' },
    body: { attemptId: attempt.id, invoiceId: attempt.invoiceId },
    id: 'request_123',
  }, res, undefined, {
    getPublicInvoiceForPayment: async (slug, options) => {
      assert.equal(slug, 'public-link');
      assert.deepEqual(options, { invoiceId: attempt.invoiceId });
      return { invoice: { id: attempt.invoiceId, customerId: attempt.customerId } };
    },
    prisma: { razorpayCheckoutAttempt: { findUnique: async () => attempt } },
    reconcileCheckoutAttempt: async (args) => {
      reconcileArgs = args;
      return { attempt: { ...attempt, status: 'CREATED', razorpayOrderId: 'order_123' }, order: { id: 'order_123' }, reused: true };
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'CREATED');
  assert.equal(res.body.data.canResumeCheckout, true);
  assert.equal(res.body.data.razorpayOrderId, 'order_123');
  assert.equal(reconcileArgs.attemptId, attempt.id);
  assert.equal(reconcileArgs.actor.requestId, 'request_123');
});

test('public checkout reconciliation does not expose or reconcile an attempt for another invoice', async () => {
  const res = response();
  let reconciled = false;

  await reconcilePublicRazorpayCheckout({
    params: { slug: 'public-link' },
    body: { attemptId: 'other_attempt', invoiceId: 'invoice_123' },
    id: 'request_456',
  }, res, undefined, {
    getPublicInvoiceForPayment: async () => ({ invoice: { id: 'invoice_123', customerId: 'customer_123' } }),
    prisma: { razorpayCheckoutAttempt: { findUnique: async () => ({ id: 'other_attempt', invoiceId: 'invoice_other', customerId: 'customer_other', status: 'REVIEW' }) } },
    reconcileCheckoutAttempt: async () => { reconciled = true; },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'CHECKOUT_ATTEMPT_NOT_FOUND');
  assert.equal(reconciled, false);
});

test('public checkout reconciliation requires an attempt reference', async () => {
  const res = response();
  await reconcilePublicRazorpayCheckout({ params: { slug: 'public-link' }, body: {}, id: 'request_789' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CHECKOUT_ATTEMPT_INVALID');
});

test('the invoice recovery URL used by the customer UI is registered', () => {
  const registered = publicRouter.stack.some((layer) => layer.route?.path === '/invoices/:slug/payment/reconcile' && layer.route.methods.post);
  assert.equal(registered, true);
});
