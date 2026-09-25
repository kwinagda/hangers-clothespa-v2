const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatPaymentMethod,
  requirePaymentReceivedTemplate,
  PAYMENT_RECEIVED_TEMPLATE_NAME,
} = require('../src/services/whatomate.service');

test('payment receipt uses the provider payment method instead of the CRM Razorpay tender', () => {
  assert.equal(formatPaymentMethod('RAZORPAY', 'card'), 'Card');
  assert.equal(formatPaymentMethod('RAZORPAY', 'upi'), 'UPI');
});

test('payment receipt formats known Razorpay provider methods for customers', () => {
  assert.equal(formatPaymentMethod('RAZORPAY', 'netbanking'), 'Netbanking');
  assert.equal(formatPaymentMethod('RAZORPAY', 'wallet'), 'Wallet');
  assert.equal(formatPaymentMethod('RAZORPAY', 'emi'), 'EMI');
  assert.equal(formatPaymentMethod('RAZORPAY', 'cardless_emi'), 'Cardless EMI');
});

test('manual tender labels are preserved and unknown Razorpay methods stay generic', () => {
  assert.equal(formatPaymentMethod('CASH', null), 'CASH');
  assert.equal(formatPaymentMethod('UPI', null), 'UPI');
  assert.equal(formatPaymentMethod('RAZORPAY', null), 'Online payment');
});

test('payment receipts require the established CRM payment-received template', () => {
  const template = { templateName: PAYMENT_RECEIVED_TEMPLATE_NAME, params: ['customerName', 'paymentAmount'] };
  assert.equal(requirePaymentReceivedTemplate(template), template);
});

test('payment receipts fail closed rather than sending a different configured template', () => {
  assert.throws(
    () => requirePaymentReceivedTemplate({ templateName: 'razorpay_local_test_receipt' }),
    (error) => error?.code === 'PAYMENT_TEMPLATE_MISMATCH'
      && error?.retryable === false
      && error?.templateName === 'razorpay_local_test_receipt',
  );
  assert.throws(
    () => requirePaymentReceivedTemplate(null),
    (error) => error?.code === 'PAYMENT_TEMPLATE_MISMATCH' && error?.templateName === null,
  );
});
