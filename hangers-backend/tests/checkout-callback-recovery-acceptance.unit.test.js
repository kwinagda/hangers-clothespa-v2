const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// Block default database access, including import-time Prisma initialization.
const databasePath = require.resolve('../src/config/database');
const previousDatabase = require.cache[databasePath];
const forbiddenDatabase = new Proxy({}, {
  get(_target, property) { throw new Error(`Unexpected database access: ${String(property)}`); },
});
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: forbiddenDatabase };
const {
  handlePublicRazorpayCallback, reconcilePublicRazorpayCheckout,
} = require('../src/controllers/public.controller');
const previousKey = process.env.RAZORPAY_KEY_ID;
process.env.RAZORPAY_KEY_ID = 'rzp_test_callback_recovery_unit';
after(() => {
  if (previousDatabase) require.cache[databasePath] = previousDatabase;
  else delete require.cache[databasePath];
  if (previousKey === undefined) delete process.env.RAZORPAY_KEY_ID;
  else process.env.RAZORPAY_KEY_ID = previousKey;
});

const response = () => ({
  statusCode: 200, headers: {},
  set(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  redirect(code, destination) { this.statusCode = code; this.destination = destination; return this; },
});

const fixture = (status) => {
  let invoice = {
    id: 'invoice_recovery', customerId: 'customer_home', invoiceNumber: 'UNIT-RECOVERY',
    status: 'OPEN', balanceDue: 10, paidAmount: 0,
  };
  let attempt = {
    id: 'attempt_recovery', invoiceId: invoice.id, customerId: invoice.customerId,
    publicShareId: 'share_recovery', mode: 'TEST', currency: 'INR', amountPaise: 1000n,
    allocationPlan: null, status, razorpayOrderId: 'order_recovery',
  };
  const counts = { reconciliations: 0, settlements: 0, providerReads: 0 };
  const hooks = {
    getPublicInvoiceForPayment: async () => ({
      invoice, share: { id: attempt.publicShareId, resourceType: 'INVOICE' },
    }),
    prisma: {
      razorpayCheckoutAttempt: { findFirst: async () => attempt, findUnique: async () => attempt },
      invoice: { findUnique: async () => invoice },
    },
    logRazorpayAction: async () => {},
    settleCapturedPayment: async (input) => {
      assert.equal(input.providerOrderId, attempt.razorpayOrderId);
      assert.equal(input.expectedInvoiceId, invoice.id);
      assert.equal(input.expectedShareId, undefined,
        'a currently valid share may settle its invoice even when the provider order was created from an older share');
      counts.settlements += 1;
      // Settlement persistence is a double, not proof of database idempotency.
      const alreadyRecorded = attempt.status === 'CAPTURED';
      attempt = { ...attempt, status: 'CAPTURED', razorpayPaymentId: input.paymentId };
      invoice = { ...invoice, status: 'PAID', balanceDue: 0, paidAmount: 10 };
      return { alreadyRecorded };
    },
    reconcileCheckoutAttempt: async (input) => {
      assert.equal(input.attemptId, attempt.id);
      assert.equal(input.customCheckout, true);
      counts.reconciliations += 1;
      attempt = { ...attempt, status: 'CREATED' };
    },
    getRazorpay: () => ({ orders: {
      fetchPayments: async () => { counts.providerReads += 1; return { items: [] }; },
      fetch: async () => {
        counts.providerReads += 1;
        return {
          id: attempt.razorpayOrderId, status: 'created', attempts: 0,
          amount: 1000, amount_due: 1000, amount_paid: 0, currency: 'INR',
          notes: { crm_attempt_id: attempt.id, invoice_id: invoice.id, share_id: attempt.publicShareId },
        };
      },
      create: async () => { throw new Error('Recovery must not create another order'); },
    } }),
  };
  const recover = async () => {
    const res = response();
    await reconcilePublicRazorpayCheckout({
      params: { slug: 'share_recovery' }, query: {},
      body: { invoiceId: invoice.id, attemptId: attempt.id }, id: 'unit-recovery',
    }, res, undefined, hooks);
    assert.equal(res.statusCode, 200);
    return res.body.data;
  };
  return { hooks, counts, recover };
};

test('capture survives a lost callback redirect and repeated recovery does not resettle', async () => {
  const { hooks, counts, recover } = fixture('PENDING');
  const req = {
    params: { slug: 'share_recovery' }, query: { invoiceId: 'invoice_recovery' },
    body: { razorpay_order_id: 'order_recovery', razorpay_payment_id: 'pay_recovery', razorpay_signature: 'unit-signature' },
  };
  const lostResponse = response();
  lostResponse.redirect = () => { throw new Error('Simulated disconnected callback response'); };
  await assert.rejects(handlePublicRazorpayCallback(req, lostResponse, undefined, hooks), /disconnected/);
  for (let replay = 0; replay < 2; replay += 1) {
    const data = await recover();
    assert.equal(data.status, 'CAPTURED');
    assert.equal(data.paymentId, 'pay_recovery');
    assert.equal(data.razorpayOrderId, 'order_recovery');
    assert.equal(data.canResumeCheckout, false);
    assert.equal(data.capturedAmountPaise, '1000');
    assert.deepEqual(data.allocations, [{ invoiceId: 'invoice_recovery', invoiceNumber: null, amountPaise: '1000' }]);
    assert.equal(data.invoice.balanceDue, 0);
  }
  assert.deepEqual(counts, { reconciliations: 0, settlements: 1, providerReads: 0 });
});

test('lost ambiguous-order recovery response replays the recovered order without another reconciliation', async () => {
  const { counts, recover } = fixture('REVIEW');
  // Discard the first successful response as though it never reached the client.
  await recover();
  const data = await recover();
  assert.equal(data.status, 'CREATED');
  assert.equal(data.attemptId, 'attempt_recovery');
  assert.equal(data.razorpayOrderId, 'order_recovery');
  assert.equal(data.canResumeCheckout, true);
  assert.equal(data.paymentId, null);
  assert.deepEqual(data.allocations, []);
  assert.equal(data.invoice.paidAmount, 0);
  assert.deepEqual(counts, { reconciliations: 1, settlements: 0, providerReads: 4 });
});
