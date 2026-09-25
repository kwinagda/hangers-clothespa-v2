const test = require('node:test');
const assert = require('node:assert/strict');
const { ALLOWED_EVENTS, EXPERIMENT_ID, assignVariant, getExperimentConfig, hashVisitorId, normalizeVisitorId } = require('../src/utils/razorpay-checkout-experiment');

test('checkout experiment is enabled only with an explicit Test Mode flag and strong hash secret', () => {
  const enabled = getExperimentConfig({
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_CHECKOUT_AB_ENABLED: 'true',
    RAZORPAY_AB_HASH_SECRET: 'a'.repeat(32),
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.mode, 'TEST');
  assert.equal(getExperimentConfig({
    RAZORPAY_KEY_ID: 'rzp_live_key',
    RAZORPAY_CHECKOUT_AB_ENABLED: 'true',
    RAZORPAY_AB_HASH_SECRET: 'a'.repeat(32),
  }).enabled, false);
  assert.equal(getExperimentConfig({
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_CHECKOUT_AB_ENABLED: 'true',
    RAZORPAY_AB_HASH_SECRET: 'short',
  }).enabled, false);
  assert.equal(getExperimentConfig({
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_CHECKOUT_AB_ENABLED: 'false',
    RAZORPAY_AB_HASH_SECRET: 'a'.repeat(32),
  }).enabled, false);
});

test('visitor identifiers are validated and only deterministic hashes drive allocation', () => {
  const visitorId = '12ab34cd-56ef-4789-8abc-1234567890ab';
  assert.equal(normalizeVisitorId(visitorId.toUpperCase()), visitorId);
  assert.equal(normalizeVisitorId('not-an-id'), null);
  const firstHash = hashVisitorId(visitorId, 'a'.repeat(32));
  const repeatedHash = hashVisitorId(visitorId, 'a'.repeat(32));
  const differentSecretHash = hashVisitorId(visitorId, 'b'.repeat(32));
  assert.match(firstHash, /^[a-f0-9]{64}$/);
  assert.equal(firstHash, repeatedHash);
  assert.notEqual(firstHash, visitorId);
  assert.notEqual(firstHash, differentSecretHash);
  assert.equal(assignVariant(firstHash), assignVariant(repeatedHash));
  assert.ok(['A', 'B'].includes(assignVariant(firstHash)));
  assert.equal(EXPERIMENT_ID, 'invoice_checkout_presentation_v1');
});

test('checkout experiment event names distinguish client-observable outcomes', () => {
  for (const event of ['CHECKOUT_OPEN_REQUESTED', 'CHECKOUT_DISMISSED', 'CHECKOUT_HANDLER_RETURNED', 'PAYMENT_FAILED_CALLBACK']) {
    assert.equal(ALLOWED_EVENTS.has(event), true);
  }
  for (const ambiguousLegacyEvent of ['CHECKOUT_OPENED', 'CHECKOUT_ABANDONED', 'CHECKOUT_CALLBACK_RETURNED']) {
    assert.equal(ALLOWED_EVENTS.has(ambiguousLegacyEvent), false);
  }
  assert.equal(ALLOWED_EVENTS.has('CRM_CAPTURED'), true, 'the trusted server capture event remains available internally');
});
