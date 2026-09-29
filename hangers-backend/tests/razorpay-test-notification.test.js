const assert = require('node:assert/strict');
const test = require('node:test');
const { isRazorpayTestPayment } = require('../src/utils/razorpay-test-notification');

test('suppresses external notifications for Razorpay Test payments only', () => {
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: 'TEST' }), true);
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: 'LIVE' }), false);
  assert.equal(isRazorpayTestPayment({ method: 'CASH', mode: 'TEST' }), false);
  assert.equal(isRazorpayTestPayment({ method: 'RAZORPAY', mode: null }), false);
  assert.equal(isRazorpayTestPayment(null), false);
});
