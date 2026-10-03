const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const servicePath = path.resolve(__dirname, '../src/services/razorpay-invoice-checkout.service.js');

const loadService = () => {
  const calls = { audits: [], providerCreates: 0 };
  const invoice = {
    id: 'invoice-home-race-unit',
    invoiceNumber: 'INV-HOME-RACE-UNIT',
    customerId: 'home-customer-unit',
    orderId: null,
    ironBillId: null,
    serviceAppointmentId: null,
    status: 'OPEN',
    currency: 'INR',
    balanceDue: 10,
    voidedAt: null,
  };
  let attempt = null;
  const tx = {
    $queryRaw: async (strings) => strings.join('').includes('FROM "invoices"') ? [{ id: invoice.id }] : [],
    invoice: {
      findMany: async () => [{ orderId: null, ironBillId: null, serviceAppointmentId: null }],
      findUnique: async () => invoice,
    },
    order: { findUnique: async () => null },
    razorpayCheckoutAttempt: {
      findUnique: async ({ where }) => {
        if (where.idempotencyKey) return null;
        return attempt?.id === where.id ? attempt : null;
      },
      findFirst: async ({ where }) => {
        if (!attempt) return null;
        const expected = where.status;
        if (typeof expected === 'string') return attempt.status === expected ? attempt : null;
        if (expected?.in) return expected.in.includes(attempt.status) ? attempt : null;
        return null;
      },
      create: async ({ data }) => {
        attempt = { id: 'attempt-home-race-unit', razorpayOrderId: null, razorpayPaymentId: null, ...data };
        return attempt;
      },
      updateMany: async ({ where, data }) => {
        const matches = attempt?.id === where.id
          && (!where.mode || attempt.mode === where.mode)
          && (!where.status || attempt.status === where.status)
          && (!Object.hasOwn(where, 'razorpayOrderId') || attempt.razorpayOrderId === where.razorpayOrderId);
        if (!matches) return { count: 0 };
        attempt = { ...attempt, ...data };
        return { count: 1 };
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const dependencies = {
    crypto,
    razorpay: class Razorpay {},
    '../config/database': prisma,
    './payment.service': { PaymentRuleError: class PaymentRuleError {} },
    './outbox.service': { enqueueOutboxEvent: async () => {}, OUTBOX_EVENT: {} },
    './activity.service': { writeAuditEvent: async (_tx, event) => { calls.audits.push(event); return event; } },
    './razorpay-payment-journey-logger': { recordPaymentJourneyEvent: async () => {} },
    '../utils/redact': { safeText: (value) => typeof value === 'string' ? value.slice(0, 240) : null },
    '../utils/razorpay-payment-method': { getSafeRazorpayPaymentMethod: () => ({}), getSafeRazorpayPaymentDiagnostics: () => ({}) },
    './receivables.service': { openInvoiceWhere: {} },
  };
  const context = {
    module: { exports: {} },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`);
      return dependencies[id];
    },
    console: { warn: () => {}, error: () => {} },
    process: { env: { RAZORPAY_KEY_ID: 'rzp_test_unit', RAZORPAY_KEY_SECRET: 'test-secret' } },
  };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });
  return {
    service: context.module.exports,
    calls,
    getAttempt: () => attempt,
    advanceAttempt: (next) => { attempt = { ...attempt, ...next }; },
    invoice,
  };
};

const makeProvider = (harness, nextState) => ({
  orders: {
    create: async (payload) => {
      harness.calls.providerCreates += 1;
      harness.advanceAttempt(nextState);
      return {
        id: 'order-home-race-unit',
        receipt: payload.receipt,
        amount: payload.amount,
        amount_due: payload.amount,
        amount_paid: 0,
        currency: payload.currency,
        status: 'created',
        attempts: 0,
        notes: payload.notes,
      };
    },
    fetchPayments: async () => ({ count: 0, items: [] }),
  },
});

test('late provider order response preserves recovery REVIEW and blocks replacement checkout', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, { status: 'REVIEW' });
  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-first',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED'
      && error.details?.razorpayOrderId === 'order-home-race-unit',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_PROVIDER_ORDER_CREATE_RESPONSE_AFTER_RECOVERY'));

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-retry',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ALREADY_IN_PROGRESS',
  );
  assert.equal(harness.calls.providerCreates, 1, 'the recovery-held attempt must prevent a second provider order');
});

test('late provider order response cannot regress a captured attempt', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, {
    status: 'CAPTURED',
    razorpayOrderId: 'order-home-race-unit',
    razorpayPaymentId: 'pay-home-race-unit',
  });
  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-captured',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'CAPTURED');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.getAttempt().razorpayPaymentId, 'pay-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
});

test('known provider order is attached to REVIEW when payment verification fails after recovery', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, { status: 'REVIEW' });
  provider.orders.fetchPayments = async () => { throw Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' }); };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-verification-timeout',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED'
      && error.details?.razorpayOrderId === 'order-home-race-unit',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_OUTCOME_AFTER_RECOVERY'));
});

test('late definitive amount rejection cannot replace a recovery state', async () => {
  const harness = loadService();
  const provider = { orders: { create: async () => {
    harness.calls.providerCreates += 1;
    harness.advanceAttempt({ status: 'REVIEW' });
    throw Object.assign(new Error('validation rejected'), {
      statusCode: 400,
      error: {
        code: 'BAD_REQUEST_ERROR',
        source: 'business',
        step: 'payment_initiation',
        reason: 'input_validation_failed',
        field: 'amount',
      },
    });
  } } };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-late-rejection',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, null);
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_REJECTION_AFTER_RECOVERY'));
});

test('late ambiguous create error cannot regress a captured attempt', async () => {
  const harness = loadService();
  const provider = { orders: { create: async () => {
    harness.calls.providerCreates += 1;
    harness.advanceAttempt({
      status: 'CAPTURED',
      razorpayOrderId: 'order-home-race-unit',
      razorpayPaymentId: 'pay-home-race-unit',
    });
    throw Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' });
  } } };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-late-timeout',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'CAPTURED');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.getAttempt().razorpayPaymentId, 'pay-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_OUTCOME_AFTER_RECOVERY'));
});
