const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });

test('existing local public payment routes reject an invalid invoice share', {
  skip: process.env.RUN_LOCAL_PUBLIC_CHECKOUT_HTTP_INTEGRATION !== '1',
}, async (t) => {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, 'localhost');
  assert.equal(database.port, '5432');
  assert.equal(database.pathname, '/hangers_db');
  assert.match(process.env.RAZORPAY_KEY_ID || '', /^rzp_test_/);
  for (const [method, path, body] of [
    ['GET', '', null],
    ['GET', '/payment/status', null],
    ['GET', '/payment/custom/capabilities', null],
    ['GET', '/payment/custom/downtime', null],
    ['POST', '/payment/custom/card-eligibility', { iin: '410028' }],
    ['POST', '/payment/custom/card-observation', { iin: '41002800', attemptId: 'invalid-share-attempt' }],
    ['POST', '/payment/custom/bank-transfer', {}],
    ['POST', '/payment/create-order', {}],
    ['POST', '/payment/verify', { razorpayOrderId: 'order_invalid_share_test', razorpayPaymentId: 'pay_invalid_share_test', razorpaySignature: 'a'.repeat(64) }],
    ['POST', '/payment/reconcile', { attemptId: 'invalid-share-test-attempt' }],
    ['POST', '/payment/callback', {}],
  ]) {
    await t.test(`${method} ${path || '/invoice'}`, async () => {
      const response = await fetch(`http://localhost:5002/api/v1/public/invoices/invalid-acceptance-token${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5002', 'sec-fetch-site': 'same-origin' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, 404);
      assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
      assert.equal(response.headers.get('ratelimit-limit'), '60');
      const result = await response.json();
      assert.equal(result.success, false);
      assert.doesNotMatch(JSON.stringify(result), /key_secret|"methods"|"sdk"|razorpayCustomerId|allocationPlan/);
    });
  }
});
