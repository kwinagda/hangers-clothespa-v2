const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJourneyEvent, recordPaymentJourneyEvent } = require('../src/services/razorpay-payment-journey-logger');

const attempt = {
  id: 'attempt_fixture_1',
  paymentJourneyId: 'pj_11111111-1111-4111-8111-111111111111',
  invoiceId: 'invoice_fixture_1',
  status: 'CAPTURED',
  mode: 'TEST',
  amountPaise: 1000n,
  currency: 'INR',
  razorpayOrderId: 'order_ABCDEF123456',
  razorpayPaymentId: 'pay_ABCDEF123456',
};

test('journey event keeps payment correlation fields and allowlisted diagnostics only', () => {
  const row = buildJourneyEvent({
    attempt,
    action: 'RAZORPAY_PAYMENT_CAPTURE_POSTED',
    status: 'SUCCESS',
    metadata: {
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      traceId: 'abcdefabcdefabcdefabcdefabcdefab',
      spanId: 'abcdefabcdefabcd',
      priorState: 'PENDING',
      nextState: 'CAPTURED',
      crmPaymentId: 'payment_fixture_2',
      providerError: { code: 'BAD_REQUEST_ERROR', source: 'gateway', step: 'payment_authorization', reason: 'payment_failed', description: 'CVV 123' },
      phone: '+919999999999',
      rawBody: { card: '4111111111111111', cvv: '123', otp: '456789' },
    },
  });

  assert.equal(row.paymentJourneyId, attempt.paymentJourneyId);
  assert.equal(row.checkoutAttemptId, attempt.id);
  assert.equal(row.razorpayOrderId, attempt.razorpayOrderId);
  assert.equal(row.razorpayPaymentId, attempt.razorpayPaymentId);
  assert.equal(row.priorState, 'PENDING');
  assert.equal(row.nextState, 'CAPTURED');
  assert.deepEqual(row.diagnostics, {
    crmPaymentId: 'payment_fixture_2',
    providerErrorCode: 'BAD_REQUEST_ERROR',
    providerErrorSource: 'gateway',
    providerErrorStep: 'payment_authorization',
    providerErrorReason: 'payment_failed',
  });
  const serialized = JSON.stringify(row, (_, value) => typeof value === 'bigint' ? value.toString() : value);
  assert.doesNotMatch(serialized, /999999999|4111111111111111|456789|CVV|rawBody|phone/);
});

test('journey event rejects malformed correlation identifiers and marks review outcomes', () => {
  const row = buildJourneyEvent({
    attempt: { ...attempt, paymentJourneyId: 'pj_existing', status: 'REVIEW', razorpayOrderId: 'order_bad', razorpayPaymentId: null },
    action: 'RAZORPAY_CAPTURE_REQUIRES_FINANCE_REVIEW',
    status: 'FAILURE',
    metadata: { requestId: 'not-a-uuid', traceId: '0'.repeat(32), spanId: '0'.repeat(16), nextState: 'REVIEW' },
  });
  assert.equal(row.outcome, 'REVIEW');
  assert.equal(row.requestId, null);
  assert.equal(row.traceId, null);
  assert.equal(row.spanId, null);
  assert.equal(row.razorpayOrderId, null);
});

test('journey event records webhook linkage and keeps retry distinct from payment failure', () => {
  const event = buildJourneyEvent({
    attempt,
    action: 'RAZORPAY_WEBHOOK_RETRY_SCHEDULED',
    status: 'FAILURE',
    metadata: {
      journeyOutcome: 'RETRY',
      sourceWebhookRecordId: 'cm123456789012345678901234',
      sourceWebhookEventType: 'payment.authorized',
      sourceWebhookAttempt: 2,
      webhookErrorCode: 'GATEWAY_ERROR',
      description: 'must not be retained',
    },
  });
  assert.equal(event.outcome, 'RETRY');
  assert.deepEqual(event.diagnostics, {
    sourceWebhookRecordId: 'cm123456789012345678901234',
    sourceWebhookEventType: 'payment.authorized',
    sourceWebhookAttempt: 2,
    webhookErrorCode: 'GATEWAY_ERROR',
  });
});

test('legacy attempt gets a persisted journey ID before its event is appended', async () => {
  let persistedAttempt;
  let persistedEvent;
  const tx = {
    razorpayCheckoutAttempt: {
      async updateMany({ where, data }) {
        assert.equal(where.id, attempt.id);
        assert.equal(where.paymentJourneyId, null);
        persistedAttempt = { ...attempt, ...data };
        return { count: 1 };
      },
      async findUnique({ where }) { assert.equal(where.id, attempt.id); return persistedAttempt; },
    },
    razorpayPaymentJourneyEvent: {
      async create({ data }) { persistedEvent = data; return data; },
    },
  };

  await recordPaymentJourneyEvent(tx, {
    attempt: { ...attempt, paymentJourneyId: null },
    action: 'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED',
    status: 'SUCCESS',
    metadata: { nextState: 'CREATING' },
  });

  assert.match(persistedAttempt.paymentJourneyId, /^pj_[0-9a-f-]{36}$/i);
  assert.equal(persistedEvent.paymentJourneyId, persistedAttempt.paymentJourneyId);
  assert.equal(persistedEvent.outcome, 'SUCCESS');
});

test('concurrent legacy transition uses the journey ID assigned by the winning transaction', async () => {
  const winningJourney = 'pj_22222222-2222-4222-8222-222222222222';
  let persistedEvent;
  const tx = {
    razorpayCheckoutAttempt: {
      async updateMany() { return { count: 0 }; },
      async findUnique() { return { ...attempt, paymentJourneyId: winningJourney }; },
    },
    razorpayPaymentJourneyEvent: {
      async create({ data }) { persistedEvent = data; return data; },
    },
  };
  await recordPaymentJourneyEvent(tx, {
    attempt: { ...attempt, paymentJourneyId: null },
    action: 'RAZORPAY_PAYMENT_PROVIDER_PENDING',
    status: 'SUCCESS',
    metadata: { nextState: 'PENDING' },
  });
  assert.equal(persistedEvent.paymentJourneyId, winningJourney);
});

test('journey logging requires both persistence models instead of silently dropping events', async () => {
  await assert.rejects(
    recordPaymentJourneyEvent({}, { attempt, action: 'RAZORPAY_PAYMENT_CAPTURE_POSTED', status: 'SUCCESS' }),
    /persistence is unavailable/,
  );
});
