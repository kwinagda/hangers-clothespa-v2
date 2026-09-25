const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recordPayment, getDailySummary } = require('../src/controllers/payments.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('record payment validation returns the stable error contract and request ID', async () => {
  const res = response();
  await recordPayment({ body: {}, id: 'req-payment-validation' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'PAYMENT_VALIDATION_FAILED');
  assert.equal(res.body.requestId, 'req-payment-validation');
  assert.equal(res.body.retryable, false);
  assert.ok(Array.isArray(res.body.fieldErrors));
});

test('daily payment report rejects malformed dates with a stable code before database access', async () => {
  const res = response();
  await getDailySummary({ query: { date: 'not-a-date' }, id: 'req-payment-report' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'PAYMENT_REPORT_DATE_INVALID');
  assert.equal(res.body.requestId, 'req-payment-report');
  assert.equal(res.body.retryable, false);
});
