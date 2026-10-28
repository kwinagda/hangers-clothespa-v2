const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldRunDevOutbox } = require('../src/utils/dev-outbox');

test('development outbox worker is disabled unless explicitly enabled', () => {
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: undefined }), false);
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: 'false' }), false);
  assert.equal(shouldRunDevOutbox({ isProduction: false, workerEnabled: 'true' }), true);
});

test('development outbox worker cannot run in production', () => {
  assert.equal(shouldRunDevOutbox({ isProduction: true, workerEnabled: 'true' }), false);
});
