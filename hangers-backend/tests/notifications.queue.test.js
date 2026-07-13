const test = require('node:test');
const assert = require('node:assert/strict');
const { UnrecoverableError } = require('bullmq');

const { _internals } = require('../src/queues/notifications.queue');

test('notification queue classifies ordinary failures as retryable', () => {
  const err = new Error('provider timeout');
  const result = _internals.classifyError(err);

  assert.equal(result.retryable, true);
  assert.equal(result.code, 'Error');
});

test('notification queue classifies explicit permanent failures as non-retryable', () => {
  const err = new Error('missing template');
  err.retryable = false;
  err.code = 'MISSING_TEMPLATE';

  const result = _internals.classifyError(err);

  assert.equal(result.retryable, false);
  assert.equal(result.code, 'MISSING_TEMPLATE');
});

test('notification queue classifies BullMQ unrecoverable failures as non-retryable', () => {
  const result = _internals.classifyError(new UnrecoverableError('invalid recipient'));

  assert.equal(result.retryable, false);
  assert.equal(result.code, 'UnrecoverableError');
});

test('direct fallback returns false instead of throwing for unknown notification jobs', async () => {
  const result = await _internals.directFallback('UNKNOWN_JOB', {});

  assert.equal(result, false);
});

