const test = require('node:test');
const assert = require('node:assert/strict');

const { maskPhone, maskToken, providerErrorSummary, razorpayErrorSummary } = require('../src/utils/redact');

test('maskPhone keeps only the last four digits', () => {
  assert.equal(maskPhone('+91 99303 67267'), '********7267');
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
        message: 'Invalid recipient phone 919930367267 with payload details',
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
        description: 'Invalid OTP 654321 for +91 9930367267 kevinnagda@gmail.com',
        field: 'amount', source: 'business', step: 'payment_initiation', reason: 'input_validation_failed',
        metadata: { payment_id: 'pay_ABC12345678901', order_id: 'order_XYZ1234567890', card: 'never-log' },
        otp: '654321',
      } },
    },
  });

  assert.deepEqual(summary, {
    httpStatus: 400,
    code: 'BAD_REQUEST_ERROR',
    description: 'Invalid [redacted-credential] for [redacted-number] [redacted-email]',
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

test('payment diagnostics exclude credentials and digit-only webhook fields', () => {
  const { safeText } = require('../src/utils/redact');
  const { getSafeRazorpayPaymentDiagnostics } = require('../src/utils/razorpay-payment-method');
  for (const value of ['123', 'CVV=123', 'OTP 123456', 'key_secret=AbcSecretValue', 'signature=' + 'a'.repeat(64), 'token_ABcd1234', 'card_ABcd1234', 'cust_ABcd1234', 'rzp_live_SecretValue']) {
    const result = safeText(value, 1000);
    assert.notEqual(result, value);
    assert.ok(result.includes('[redacted-'));
  }
  const diagnostics = getSafeRazorpayPaymentDiagnostics({ method: 'card', error_code: '4100280000001007', error_source: '123', error_step: '654321', error_reason: 'token_ABcd1234' });
  for (const field of ['providerErrorCode', 'providerErrorSource', 'providerErrorStep', 'providerErrorReason']) assert.equal(diagnostics[field], null);
  assert.equal(safeText('BAD_REQUEST_ERROR payment_authorization insufficient_fund', 1000), 'BAD_REQUEST_ERROR payment_authorization insufficient_fund');
  assert.doesNotMatch(safeText('{"key_secret":"AbcSecretValue"}', 1000), /AbcSecretValue/);
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
