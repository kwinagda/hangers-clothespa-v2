const test = require('node:test');
const assert = require('node:assert/strict');

const { maskPhone, maskToken, providerErrorSummary } = require('../src/utils/redact');

test('maskPhone keeps only the last four digits', () => {
  assert.equal(maskPhone('+91 98765 43210'), '********3210');
});

test('maskToken keeps only short token edges', () => {
  assert.equal(maskToken('ExponentPushToken[abcdef123456]'), 'Expo...456]');
});

test('providerErrorSummary omits raw provider payload shape', () => {
  const summary = providerErrorSummary({
    response: {
      status: 400,
      data: {
        code: 'BAD_REQUEST',
        message: 'Invalid recipient phone 919999999999 with payload details',
        fullPayload: { secret: 'do-not-log' },
      },
    },
  });

  assert.deepEqual(Object.keys(summary), ['status', 'code', 'message']);
  assert.equal(summary.status, 400);
});
