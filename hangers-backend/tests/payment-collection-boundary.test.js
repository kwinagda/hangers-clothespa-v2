const test = require('node:test');
const assert = require('node:assert/strict');
const { CORE_PAYMENT_METHODS, PAYMENT_METHODS, STAFF_COLLECTABLE_PAYMENT_METHOD_VALUES } = require('../src/config/master-data');
const { assertSettlementMethodAllowed, recordInvoiceSettlement, recordOrderSettlement } = require('../src/services/payment.service');

test('staff collection methods include offline tenders and exclude provider Razorpay', () => {
  assert.deepEqual(STAFF_COLLECTABLE_PAYMENT_METHOD_VALUES, ['CASH', 'UPI', 'CARD', 'ONLINE']);
  assert.deepEqual(CORE_PAYMENT_METHODS, STAFF_COLLECTABLE_PAYMENT_METHOD_VALUES);
  assert.equal(CORE_PAYMENT_METHODS.includes('RAZORPAY'), false);
  assert.equal(PAYMENT_METHODS.find((method) => method.value === 'ONLINE')?.label, 'Bank transfer');
});

test('generic payment services reject Razorpay without provider capture verification', async () => {
  assert.throws(
    () => assertSettlementMethodAllowed('RAZORPAY'),
    { code: 'RAZORPAY_PROVIDER_VERIFICATION_REQUIRED', statusCode: 409 }
  );
  await assert.rejects(
    recordOrderSettlement({}, { orderId: 'order-test', amount: 10, method: 'RAZORPAY' }),
    { code: 'RAZORPAY_PROVIDER_VERIFICATION_REQUIRED', statusCode: 409 }
  );
  await assert.rejects(
    recordInvoiceSettlement({}, { invoiceId: 'invoice-test', amount: 10, method: 'RAZORPAY' }),
    { code: 'RAZORPAY_PROVIDER_VERIFICATION_REQUIRED', statusCode: 409 }
  );
});

test('provider-verified Razorpay settlement is permitted and manual tenders stay available', () => {
  assert.doesNotThrow(() => assertSettlementMethodAllowed('RAZORPAY', { providerCaptureVerified: true }));
  for (const method of STAFF_COLLECTABLE_PAYMENT_METHOD_VALUES) {
    assert.doesNotThrow(() => assertSettlementMethodAllowed(method));
  }
});
