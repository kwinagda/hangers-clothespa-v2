const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadRefundService = ({ env, state, onGet = () => assert.fail('Unexpected Razorpay GET'), onPost = () => assert.fail('Unexpected Razorpay POST') }) => {
  const audits = [];
  const makeAttempt = () => ({
    ...state.attempt,
    sourcePayment: state.sourcePayment,
    localRefundPayment: state.refundPayment,
  });
  const tx = {
    $queryRaw: async () => [{ id: state.attempt.id }],
    razorpayRefundAttempt: {
      findUnique: async ({ where }) => where?.id ? makeAttempt() : null,
      create: async ({ data }) => {
        state.refundAttemptCreateCalls += 1;
        return { id: 'manual-refund-fixture', ...data };
      },
      update: async ({ data }) => {
        state.attempt = { ...state.attempt, ...data };
        return makeAttempt();
      },
    },
    payment: {
      findFirst: async () => state.manualSource || null,
      findUnique: async () => state.sourcePayment,
      create: async ({ data }) => {
        state.createRefundPaymentCalls += 1;
        state.refundPayment = { id: 'crm-refund-fixture', ...data };
        return state.refundPayment;
      },
      update: async ({ data }) => {
        state.sourcePayment = { ...state.sourcePayment, ...data };
        return state.sourcePayment;
      },
    },
    invoice: { findFirst: async () => state.manualInvoice || null },
    refundAllocation: { groupBy: async () => [] },
  };
  const prisma = {
    razorpayRefundAttempt: {
      findFirst: async () => makeAttempt(),
      findUnique: async () => makeAttempt(),
    },
    $transaction: async (run) => run(tx),
  };
  class PaymentRuleError extends Error {
    constructor(code, message, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  const dependencies = {
    axios: { get: onGet, post: onPost },
    crypto: require('node:crypto'),
    '../config/database': prisma,
    './payment.service': {
      PaymentRuleError,
      recordOrderRefund: async () => assert.fail('Unexpected manual refund ledger path'),
    },
    './activity.service': { writeAuditEvent: async (_tx, audit) => { audits.push(audit); return audit; } },
    '../utils/redact': { razorpayErrorSummary: () => ({}) },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/services/razorpay-refund.service.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    Date,
    process: { env },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { service: module.exports, audits };
};

const refundFixture = () => ({
  attempt: {
    id: 'refund-attempt-fixture', sourcePaymentId: 'payment-fixture', checkoutAttemptId: 'checkout-fixture',
    customerId: 'home-fixture', amountPaise: 500n, currency: 'INR', mode: 'TEST', status: 'PENDING',
    providerIdempotencyKey: 'hcrf_fixture_key_12345', razorpayRefundId: 'rfnd_fixture', automatic: true,
    attemptCount: 1, orderId: null, invoiceId: null,
  },
  sourcePayment: { id: 'payment-fixture', customerId: 'home-fixture', razorpayPaymentId: 'pay_fixture', unallocatedAmount: 10 },
  refundPayment: null,
  createRefundPaymentCalls: 0,
  refundAttemptCreateCalls: 0,
});

test('automatic refund worker refuses a Test refund when Live credentials are configured', async () => {
  const state = refundFixture();
  state.attempt.status = 'CREATING';
  state.attempt.razorpayRefundId = null;
  let providerWrites = 0;
  const { service } = loadRefundService({
    env: { RAZORPAY_KEY_ID: 'rzp_live_fixture', RAZORPAY_KEY_SECRET: 'not-a-real-secret' },
    state,
    onPost: async () => { providerWrites += 1; throw new Error('must not send'); },
  });

  const result = await service.processAutomaticRazorpayRefundBatch();

  assert.equal(result.claimed, 1);
  assert.equal(result.processed, 0);
  assert.equal(providerWrites, 0);
  assert.equal(state.attempt.status, 'REVIEW');
  assert.equal(state.attempt.failureCode, 'RAZORPAY_MODE_MISMATCH');
  assert.equal(state.createRefundPaymentCalls, 0);
});

test('automatic normal-refund retry uses the same payment, paise amount, body, and Razorpay idempotency key', async () => {
  const state = refundFixture();
  state.attempt.status = 'CREATING';
  state.attempt.razorpayRefundId = null;
  const requests = [];
  const { service } = loadRefundService({
    env: { RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'not-a-real-secret' },
    state,
    onPost: async (...args) => {
      requests.push(args);
      if (requests.length === 1) throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      return { data: {
        id: 'rfnd_fixture', payment_id: 'pay_fixture', amount: 500, currency: 'INR', status: 'pending',
        notes: { crm_refund_attempt_id: 'refund-attempt-fixture', crm_refund_reason: 'DUPLICATE_CAPTURE_SURPLUS' },
      } };
    },
  });

  await service.processAutomaticRazorpayRefundBatch();
  assert.equal(state.attempt.status, 'REVIEW', 'an ambiguous timeout is retained for safe retry');
  assert.equal(state.attempt.failureCode, 'ECONNRESET');
  await service.processAutomaticRazorpayRefundBatch();

  assert.equal(requests.length, 2);
  assert.equal(requests[0][0], 'https://api.razorpay.com/v1/payments/pay_fixture/refund');
  assert.equal(requests[0][1].amount, 500, 'Razorpay receives the partial amount in paise');
  assert.equal(requests[0][1].speed, 'normal');
  assert.equal(requests[0][1].receipt, 'hcr-refund-attempt-fixture');
  assert.equal(requests[0][2].headers['X-Refund-Idempotency'], state.attempt.providerIdempotencyKey);
  assert.equal(JSON.stringify(requests[1][1]), JSON.stringify(requests[0][1]));
  assert.equal(requests[1][2].headers['X-Refund-Idempotency'], requests[0][2].headers['X-Refund-Idempotency']);
  assert.equal(state.attempt.status, 'PENDING', 'a pending provider response is not recorded as refunded');
  assert.equal(state.attempt.providerStatus, 'pending');
  assert.equal(state.refundPayment, null, 'no refund ledger payment is posted before provider status is processed');
});

test('refund status fetch fails closed when the configured key mode is unknown', async () => {
  const state = refundFixture();
  let providerReads = 0;
  const { service } = loadRefundService({
    env: { RAZORPAY_KEY_ID: 'unrecognized_key_prefix', RAZORPAY_KEY_SECRET: 'not-a-real-secret' },
    state,
    onGet: async () => { providerReads += 1; throw new Error('must not send'); },
  });

  await assert.rejects(service.fetchProviderRefund('rfnd_fixture', 'TEST'), { code: 'RAZORPAY_MODE_UNAVAILABLE' });
  assert.equal(providerReads, 0);
});

test('manual refund refuses a Razorpay source payment whose mode is not recorded', async () => {
  const state = refundFixture();
  state.manualSource = {
    id: 'payment-fixture', customerId: 'home-fixture', mode: null, method: 'RAZORPAY',
    razorpayPaymentId: 'pay_fixture', allocations: [{ id: 'allocation-fixture', amount: 10 }],
    razorpayRefundAttemptsFromPayment: [],
  };
  state.manualInvoice = { id: 'invoice-fixture', currency: 'INR' };
  let providerWrites = 0;
  const { service } = loadRefundService({
    env: { RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'not-a-real-secret' },
    state,
  });

  await assert.rejects(service.createRazorpayRefund({
    orderId: 'order-fixture', sourcePaymentId: 'payment-fixture', amount: 1,
    reasonCode: 'CUSTOMER_REFUND', reason: 'Source mode test',
    staff: { id: 'staff-fixture', effectivePermissions: ['finance.refund'] },
    idempotencyKey: 'refund-source-mode-fixture',
    provider: async () => { providerWrites += 1; return {}; },
  }), { code: 'RAZORPAY_MODE_UNAVAILABLE' });
  assert.equal(providerWrites, 0);
  assert.equal(state.refundAttemptCreateCalls, 0);
});

test('authoritative processed refund creates one REFUND ledger row and duplicate webhook replay is idempotent', async () => {
  const state = refundFixture();
  const providerRefund = {
    id: 'rfnd_fixture', payment_id: 'pay_fixture', amount: 500, currency: 'INR', status: 'processed',
    notes: { crm_refund_attempt_id: 'refund-attempt-fixture' },
  };
  const { service, audits } = loadRefundService({
    env: { RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'not-a-real-secret' },
    state,
  });
  const event = { refundId: providerRefund.id, refundAttemptId: state.attempt.id, mode: 'TEST' };
  const fetcher = async (refundId, expectedMode) => {
    assert.equal(refundId, providerRefund.id);
    assert.equal(expectedMode, 'TEST');
    return providerRefund;
  };

  const first = await service.reconcileRazorpayRefundWebhook(event, fetcher);
  const replay = await service.reconcileRazorpayRefundWebhook(event, fetcher);

  assert.equal(first.providerStatus, 'processed');
  assert.equal(state.attempt.status, 'PROCESSED');
  assert.equal(state.attempt.providerStatus, 'processed');
  assert.equal(state.attempt.razorpayRefundId, providerRefund.id);
  assert.equal(state.attempt.localRefundPaymentId, 'crm-refund-fixture');
  assert.equal(state.refundPayment.kind, 'REFUND');
  assert.equal(state.refundPayment.status, 'CAPTURED');
  assert.equal(state.refundPayment.amount, 5);
  assert.equal(state.refundPayment.razorpayRefundId, providerRefund.id);
  assert.equal(state.sourcePayment.unallocatedAmount, 5);
  assert.equal(state.createRefundPaymentCalls, 1);
  assert.equal(replay.state, 'PROCESSED');
  assert.equal(audits.filter(({ action }) => action === 'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED').length, 1);
  const audit = audits.find(({ action }) => action === 'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED');
  assert.equal(audit.resource, 'razorpay_refund_attempt');
  assert.equal(audit.resourceId, state.attempt.id);
  assert.equal(audit.metadata.sourcePaymentId, state.sourcePayment.id);
  assert.equal(audit.metadata.razorpayPaymentId, state.sourcePayment.razorpayPaymentId);
  assert.equal(audit.metadata.razorpayRefundId, providerRefund.id);
  assert.equal(audit.metadata.localRefundPaymentId, 'crm-refund-fixture');
});

test('refund webhook mode must match the reserved refund attempt', async () => {
  const state = refundFixture();
  const { service } = loadRefundService({ env: {}, state });
  let fetches = 0;

  await assert.rejects(service.reconcileRazorpayRefundWebhook({
    refundId: 'rfnd_fixture', refundAttemptId: state.attempt.id, mode: 'LIVE',
  }, async () => { fetches += 1; return {}; }), { code: 'RAZORPAY_MODE_MISMATCH' });
  assert.equal(fetches, 0);
});
