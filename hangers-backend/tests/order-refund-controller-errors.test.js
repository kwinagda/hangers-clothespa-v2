const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recordPayment, refundPayment, reconcileRefundPayment, reversePaymentCorrection } = require('../src/controllers/orders.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('refund validation emits the stable payment error contract and field paths', async () => {
  const res = response();
  await refundPayment({ body: {}, params: { id: 'order-1' }, id: 'req-refund-validation' }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'ORDER_REFUND_VALIDATION_FAILED');
  assert.equal(res.body.requestId, 'req-refund-validation');
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.action, 'CORRECT_REQUEST');
  assert.deepEqual(res.body.fieldErrors.map(({ field }) => field), ['sourcePaymentId', 'amount', 'reasonCode', 'reason']);
});

test('refund reconciliation permission failure is structured and never retryable', async () => {
  const res = response();
  await reconcileRefundPayment({
    params: { id: 'order-1', attemptId: 'attempt-1' },
    id: 'req-refund-reconcile-auth',
    staff: { id: 'staff-1', effectivePermissions: [] },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REFUND_APPROVAL_REQUIRED');
  assert.equal(res.body.requestId, 'req-refund-reconcile-auth');
  assert.equal(res.body.retryable, false);
  assert.equal(res.body.action, 'CONTACT_ADMIN');
});

test('order payment and reversal validation use stable codes and request correlation', async () => {
  const paymentRes = response();
  await recordPayment({ body: {}, params: { id: 'order-1' }, id: 'req-order-payment-validation' }, paymentRes);
  assert.equal(paymentRes.statusCode, 400);
  assert.equal(paymentRes.body.code, 'ORDER_PAYMENT_VALIDATION_FAILED');
  assert.equal(paymentRes.body.requestId, 'req-order-payment-validation');
  assert.ok(paymentRes.body.fieldErrors.some(({ field }) => field === 'amount'));

  const reversalRes = response();
  await reversePaymentCorrection({ body: {}, params: { id: 'order-1', paymentId: 'payment-1' }, id: 'req-payment-reversal-validation' }, reversalRes);
  assert.equal(reversalRes.statusCode, 400);
  assert.equal(reversalRes.body.code, 'ORDER_PAYMENT_REVERSAL_VALIDATION_FAILED');
  assert.equal(reversalRes.body.requestId, 'req-payment-reversal-validation');
  assert.deepEqual(reversalRes.body.fieldErrors.map(({ field }) => field), ['reason']);
});
