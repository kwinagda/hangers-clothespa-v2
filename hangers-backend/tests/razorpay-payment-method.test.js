const test = require('node:test');
const assert = require('node:assert/strict');
const { getSafeRazorpayPaymentMethod, getSafeRazorpayPaymentDiagnostics } = require('../src/utils/razorpay-payment-method');

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
    error_description: 'Call +91 9930367267; OTP abcdef; card 4111111111111111',
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
