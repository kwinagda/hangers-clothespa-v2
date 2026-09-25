const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentApiError, validationFieldErrors } = require('../src/utils/payment-api-error');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('payment API errors provide stable safe fields and request correlation', () => {
  const res = response();
  paymentApiError(res, { statusCode: 503, code: 'CHECKOUT_ORDER_CREATE_FAILED', requestId: 'req-123' });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    success: false,
    code: 'CHECKOUT_ORDER_CREATE_FAILED',
    message: 'Payment request could not be completed.',
    requestId: 'req-123',
    retryable: true,
    action: 'RETRY_SAME_REQUEST',
  });
});

test('payment API errors can explicitly prevent retrying a configuration failure', () => {
  const res = response();
  paymentApiError(res, {
    statusCode: 503,
    code: 'TEST_CONTACT_NOT_CONFIGURED',
    message: 'Test checkout is unavailable until the approved test contact is configured.',
    retryable: false,
    action: 'CONTACT_SUPPORT',
  });
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.action, 'CONTACT_SUPPORT');
});

test('ambiguous Razorpay order creation tells clients to check attempt state instead of retrying', () => {
  const res = response();
  paymentApiError(res, {
    statusCode: 503,
    code: 'CHECKOUT_RESULT_UNKNOWN',
    message: 'Do not retry; inspect the saved checkout attempt.',
  });
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.action, 'CHECK_STATUS_FIRST');
});

test('payment validation errors serialize field names without exposing source issues', () => {
  const res = response();
  paymentApiError(res, {
    statusCode: 400,
    code: 'PAYMENT_VALIDATION_FAILED',
    fieldErrors: validationFieldErrors([{ path: ['amount'], code: 'too_small', message: 'Amount must be positive' }]),
  });
  assert.deepEqual(res.body.fieldErrors, [{ field: 'amount', code: 'too_small', message: 'Amount must be positive' }]);
  assert.equal(Object.hasOwn(res.body, 'stack'), false);
});
