const test = require('node:test');
const assert = require('node:assert/strict');
const { getSafeRazorpayPaymentMethod, getSafeRazorpayPaymentDiagnostics } = require('../src/utils/razorpay-payment-method');
const { classifyRazorpayPaymentError } = require('../src/utils/razorpay-error-classification');

test('normalizes the documented provider method independently of CRM tender', () => {
  assert.deepEqual(getSafeRazorpayPaymentMethod({ method: 'UPI', vpa: 'private@upi' }), {
    providerMethod: 'upi',
    providerMethodDetail: null,
  });
});

test('retains only safe card network and type labels, not cardholder or card identifiers', () => {
  assert.deepEqual(getSafeRazorpayPaymentMethod({
    method: 'card',
    card: {
      network: 'VISA',
      type: 'debit',
      last4: '1234',
      issuer: 'BANK',
      name: 'Customer Name',
      id: 'card_token',
    },
  }), {
    providerMethod: 'card',
    providerMethodDetail: 'visa:debit',
  });
});

test('omits unsupported or malformed provider method values', () => {
  assert.deepEqual(getSafeRazorpayPaymentMethod({ method: 'unknown_method' }), {
    providerMethod: null,
    providerMethodDetail: null,
  });
  assert.deepEqual(getSafeRazorpayPaymentMethod({ method: 'upi', vpa: 'x', card: { network: 'VISA' } }), {
    providerMethod: 'upi',
    providerMethodDetail: null,
  });
  assert.deepEqual(getSafeRazorpayPaymentMethod({ method: 'card', card: { network: 'person@example.com', type: 'debit' } }), {
    providerMethod: 'card',
    providerMethodDetail: 'debit',
  });
});

test('keeps documented method failure taxonomy while excluding free-text and contact details', () => {
  assert.deepEqual(getSafeRazorpayPaymentDiagnostics({
    method: 'card',
    card: { network: 'VISA', type: 'debit' },
    error_code: 'BAD_REQUEST_ERROR',
    error_source: 'customer',
    error_step: 'payment_authentication',
    error_reason: 'payment_cancelled',
    error_description: 'Call +91 9930367267; OTP abcdef; card 4100280000001007',
    contact: '+91 9930367267',
    vpa: 'person@upi',
  }), {
    providerMethod: 'card',
    providerMethodDetail: 'visa:debit',
    providerErrorCode: 'BAD_REQUEST_ERROR',
    providerErrorSource: 'customer',
    providerErrorStep: 'payment_authentication',
    providerErrorReason: 'payment_cancelled',
  });
});

test('rejects malformed provider error taxonomy values', () => {
  assert.deepEqual(getSafeRazorpayPaymentDiagnostics({
    method: 'upi',
    error_code: 'BAD CODE\ncontact@example.com',
    error_source: 'customer +91 9930367267',
    error_step: 'payment authentication',
    error_reason: 'cancelled!',
  }), {
    providerMethod: 'upi',
    providerMethodDetail: null,
    providerErrorCode: null,
    providerErrorSource: null,
    providerErrorStep: null,
    providerErrorReason: null,
  });
});

test('classifies known Razorpay error sources into safe operator actions without enabling retries', () => {
  assert.equal(classifyRazorpayPaymentError({ providerErrorSource: 'customer', providerErrorReason: 'incorrect_otp' }).category, 'CUSTOMER_OR_INSTRUMENT');
  assert.equal(classifyRazorpayPaymentError({ providerErrorSource: 'gateway', providerErrorReason: 'bank_technical_error' }).operatorAction, 'CHECK_TERMINAL_STATUS_AND_PROVIDER_DOWNTIME');
  assert.equal(classifyRazorpayPaymentError({ providerErrorSource: 'razorpay', providerErrorReason: 'gateway_technical_error' }).category, 'RAZORPAY_PLATFORM');
  assert.equal(classifyRazorpayPaymentError({ providerErrorSource: 'business', providerErrorReason: 'emi_plan_unavailable' }).category, 'MERCHANT_CONFIGURATION');
  assert.equal(classifyRazorpayPaymentError({ providerErrorSource: 'customer', providerErrorReason: 'collect_request_pending' }).operatorAction, 'CHECK_PROVIDER_STATUS');
  assert.deepEqual(classifyRazorpayPaymentError({ providerErrorSource: 'gateway', providerErrorReason: 'new_provider_reason' }), {
    category: 'BANK_OR_GATEWAY',
    operatorAction: 'CHECK_TERMINAL_STATUS_AND_PROVIDER_DOWNTIME',
    automaticRetry: false,
  });
  assert.deepEqual(classifyRazorpayPaymentError({ providerErrorSource: 'unknown', providerErrorReason: 'unrecognized' }), {
    category: 'UNCLASSIFIED',
    operatorAction: 'FINANCE_REVIEW',
    automaticRetry: false,
  });
  assert.equal(classifyRazorpayPaymentError({ providerErrorReason: 'payment_method_not_enabled' }).operatorAction, 'REVIEW_RAZORPAY_ACCOUNT_OR_INTEGRATION');
  assert.equal(classifyRazorpayPaymentError({ providerErrorReason: 'payment_failed' }).automaticRetry, false);
  assert.equal(classifyRazorpayPaymentError({}), null);
});

test('classifies documented Payment Gateway reasons as unresolved or merchant-actionable without retrying', () => {
  for (const reason of [
    'payment_pending', 'payment_timed_out', 'request_timed_out',
    'payment_session_expired', 'payment_collect_request_expired',
  ]) {
    const result = classifyRazorpayPaymentError({ providerErrorSource: 'gateway', providerErrorReason: reason });
    assert.equal(result.category, 'PENDING_OR_UNKNOWN', reason);
    assert.equal(result.operatorAction, 'CHECK_PROVIDER_STATUS', reason);
    assert.equal(result.automaticRetry, false, reason);
  }

  for (const reason of [
    'emi_plan_unavailable', 'invalid_amount', 'invalid_currency', 'invalid_order_id',
    'live_mode_not_enabled', 'order_amount_mismatch', 'order_payment_method_mismatch',
  ]) {
    const result = classifyRazorpayPaymentError({ providerErrorSource: 'business', providerErrorReason: reason });
    assert.equal(result.category, 'MERCHANT_CONFIGURATION', reason);
    assert.equal(result.operatorAction, 'REVIEW_RAZORPAY_ACCOUNT_OR_INTEGRATION', reason);
    assert.equal(result.automaticRetry, false, reason);
  }
});

test('keeps all 18 published Indian Visa and Mastercard failure fixtures non-retryable', () => {
  const documentedCardFailureFixtures = [
    'payment_timed_out', 'payment_timed_out',
    'insufficient_fund', 'insufficient_fund',
    'payment_cancelled', 'payment_cancelled',
    'card_declined', 'card_declined', 'card_declined', 'card_declined',
    'card_disabled_for_online_payments', 'card_disabled_for_online_payments',
    'card_number_invalid', 'card_number_invalid',
    'gateway_technical_error', 'gateway_technical_error',
    'authentication_failed', 'authentication_failed',
  ];

  assert.equal(documentedCardFailureFixtures.length, 18);
  for (const reason of documentedCardFailureFixtures) {
    const result = classifyRazorpayPaymentError({ providerErrorReason: reason });
    assert.ok(result, `${reason} should have a safe classification`);
    assert.equal(result.automaticRetry, false, `${reason} must never automatically retry`);
    assert.equal(
      result.operatorAction,
      reason === 'payment_timed_out' ? 'CHECK_PROVIDER_STATUS' : 'FINANCE_REVIEW',
      `${reason} with no trusted source must fail closed`,
    );
  }
});
