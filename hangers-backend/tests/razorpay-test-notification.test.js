const assert = require('node:assert/strict');
const test = require('node:test');
const { isRazorpayTestPayment, shouldSuppressRazorpayTestNotification } = require('../src/utils/razorpay-test-notification');

test('suppresses external notifications for Razorpay Test payments only', () => {
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: 'TEST' }), true);
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: 'LIVE' }), false);
  assert.equal(isRazorpayTestPayment({ method: 'CASH', mode: 'TEST' }), false);
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: null }), false);
  assert.equal(isRazorpayTestPayment(null), false);
});

test('only explicitly enabled Home can receive Razorpay Test notifications', () => {
  const payment = { method: 'RAZORPAY', mode: 'TEST' };
  assert.equal(shouldSuppressRazorpayTestNotification(payment, '919930367267', true), false);
  assert.equal(shouldSuppressRazorpayTestNotification(payment, '919930367267', false), true);
  assert.equal(shouldSuppressRazorpayTestNotification(payment, '919930367267', undefined), true);
  assert.equal(shouldSuppressRazorpayTestNotification(payment, '919876543210', true), true);
  assert.equal(shouldSuppressRazorpayTestNotification(payment, '', true), true);
  assert.equal(shouldSuppressRazorpayTestNotification({ ...payment, mode: 'LIVE' }, '919876543210', true), false);
});
