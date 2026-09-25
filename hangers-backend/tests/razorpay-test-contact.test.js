const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getRazorpayTestContact } = require('../src/utils/razorpay-test-contact');

test('Razorpay Test Mode checkout uses the configured India test contact', () => {
  assert.equal(getRazorpayTestContact({
    mode: 'TEST',
    configuredContact: '9930367267',
  }), '+919930367267');
});

test('Razorpay test contact override is disabled in Live Mode', () => {
  assert.equal(getRazorpayTestContact({ mode: 'LIVE', configuredContact: '9930367267' }), null);
});

test('invalid Razorpay test contact configuration fails closed', () => {
  assert.equal(getRazorpayTestContact({ mode: 'TEST', configuredContact: 'not-approved' }), null);
  assert.equal(getRazorpayTestContact({ mode: 'TEST', configuredContact: 'not-a-phone' }), null);
});
