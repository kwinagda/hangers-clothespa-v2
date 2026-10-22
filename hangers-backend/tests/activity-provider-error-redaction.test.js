const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { buildEventData } = require('../src/services/activity.service');

test('Razorpay provider errors are redacted again before activity and audit persistence', (t) => {
  t.after(() => prisma.$disconnect());
  const event = buildEventData({
    actorType: 'system',
    action: 'RAZORPAY_CHECKOUT_FAILED',
    resource: 'payment',
    description: 'Provider request failed',
    metadata: {
      provider: 'RAZORPAY',
      attemptId: 'attempt_fixture',
      providerError: {
        httpStatus: 400,
        code: 'BAD_REQUEST_ERROR',
        description: 'Invalid CVV=123 key_secret=AbcSecretValue signature=opaqueSignature',
        source: 'gateway',
        step: 'payment_authorization',
        reason: 'payment_failed',
        payment_id: 'pay_ABC12345678901',
        order_id: 'order_XYZ1234567890',
        rawBody: 'must-not-persist',
      },
    },
  });

  for (const sink of [event.activity, event.audit]) {
    assert.equal(sink.metadata.attemptId, 'attempt_fixture');
    assert.equal(sink.metadata.providerError.code, 'BAD_REQUEST_ERROR');
    assert.equal(sink.metadata.providerError.source, 'gateway');
    assert.equal(sink.metadata.providerError.reason, 'payment_failed');
    assert.equal(sink.metadata.providerError.payment_id, 'pay_ABC12345678901');
    assert.equal(sink.metadata.providerError.order_id, 'order_XYZ1234567890');
    assert.doesNotMatch(JSON.stringify(sink.metadata.providerError), /\b123\b|AbcSecretValue|opaqueSignature|must-not-persist/);
    assert.equal('rawBody' in sink.metadata.providerError, false);
  }
});

test('malformed Razorpay provider error metadata is omitted without altering sibling audit data', (t) => {
  t.after(() => prisma.$disconnect());
  const event = buildEventData({
    actorType: 'system',
    action: 'RAZORPAY_CHECKOUT_FAILED',
    metadata: {
      provider: 'RAZORPAY',
      unrelated: 'retained',
      providerError: 'untrusted raw string',
    },
  });

  assert.equal(event.activity.metadata.unrelated, 'retained');
  assert.deepEqual(event.activity.metadata.providerError, {});
  assert.deepEqual(event.audit.metadata.providerError, {});
});
