const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldRunDevOutbox } = require('../src/utils/dev-outbox');
const testScope = { homeOnly: 'true', razorpayKeyId: 'rzp_test_example' };

test('development outbox worker is disabled unless explicitly enabled', () => {
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: undefined }), false);
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: 'false' }), false);
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: 'true' }), false);
  assert.equal(shouldRunDevOutbox({ ...testScope, isProduction: false, workerEnabled: 'true' }), true);
});

test('development outbox worker cannot run in production', () => {
  assert.equal(shouldRunDevOutbox({ ...testScope, isProduction: true, workerEnabled: 'true' }), false);
});

test('development worker rejects unrestricted scope and Live keys', () => {
  assert.equal(shouldRunDevOutbox({ ...testScope, isProduction: false, workerEnabled: 'true', homeOnly: 'false' }), false);
  assert.equal(shouldRunDevOutbox({ ...testScope, isProduction: false, workerEnabled: 'true', razorpayKeyId: 'rzp_live_example' }), false);
});
