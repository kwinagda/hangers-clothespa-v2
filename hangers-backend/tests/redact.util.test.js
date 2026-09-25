const test = require('node:test');
const assert = require('node:assert/strict');

const { maskPhone, maskToken, providerErrorSummary, razorpayErrorSummary } = require('../src/utils/redact');

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

test('razorpayErrorSummary preserves documented nested fields and safe references', () => {
  const summary = razorpayErrorSummary({
    response: {
      status: 400,
      data: { error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Invalid OTP 654321 for +91 9930367267 user@example.com',
        field: 'amount', source: 'business', step: 'payment_initiation', reason: 'input_validation_failed',
        metadata: { payment_id: 'pay_ABC12345678901', order_id: 'order_XYZ1234567890', card: 'never-log' },
        otp: '654321',
      } },
    },
  });

  assert.deepEqual(summary, {
    httpStatus: 400,
    code: 'BAD_REQUEST_ERROR',
    description: 'Invalid OTP [redacted-number] for [redacted-number] [redacted-email]',
    field: 'amount',
    source: 'business',
    step: 'payment_initiation',
    reason: 'input_validation_failed',
    payment_id: 'pay_ABC12345678901',
    order_id: 'order_XYZ1234567890',
  });
  assert.equal(JSON.stringify(summary).includes('654321'), false);
  assert.equal(JSON.stringify(summary).includes('never-log'), false);
});

test('razorpayErrorSummary rejects malformed metadata and bounds provider text', () => {
  const summary = razorpayErrorSummary({
    response: { data: { error: {
      code: 'X'.repeat(200), description: 'D'.repeat(400),
      metadata: { payment_id: 'pay_bad', order_id: { secret: true } },
    } } },
  });
  assert.equal(summary.code.length, 80);
  assert.equal(summary.description.length, 240);
  assert.equal('payment_id' in summary, false);
  assert.equal('order_id' in summary, false);
});
