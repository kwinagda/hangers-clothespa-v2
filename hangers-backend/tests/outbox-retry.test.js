const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyOutboxFailure } = require('../src/utils/outbox-retry');

test('permanent outbox failures are dead-lettered after the first attempt', () => {
  const error = new Error('Template not found');
  error.retryable = false;

  assert.equal(classifyOutboxFailure({ error, attempts: 1 }).dead, true);
});

test('temporary outbox failures retain exponential retry backoff', () => {
  const error = new Error('Provider timeout');
  error.retryable = true;

  assert.deepEqual(classifyOutboxFailure({ error, attempts: 3 }), {
    dead: false,
    delayMs: 8000,
  });
});

test('temporary outbox failures stop after the maximum attempt count', () => {
  const error = new Error('Provider timeout');
  error.retryable = true;

  assert.equal(classifyOutboxFailure({ error, attempts: 10 }).dead, true);
});
