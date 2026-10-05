const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });

test('existing local saved-card routes deny missing or invalid customer authentication', {
  skip: process.env.RUN_LOCAL_SAVED_CARDS_HTTP_INTEGRATION !== '1',
}, async (t) => {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, 'localhost');
  assert.equal(database.port, '5432');
  assert.equal(database.pathname, '/hangers_db');
  assert.match(process.env.RAZORPAY_KEY_ID || '', /^rzp_test_/);
  const jwt = require('jsonwebtoken');
  assert.ok(process.env.JWT_SECRET);
  const staffToken = jwt.sign({ id: 'local-negative-no-session', type: 'staff' }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const expiredCustomerToken = jwt.sign({ id: 'local-negative-no-session', type: 'customer' }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const [label, authorization] of [
    ['no token', ''],
    ['invalid token', 'Bearer invalid-auth-negative-test'],
    ['staff token', `Bearer ${staffToken}`],
    ['expired customer token', `Bearer ${expiredCustomerToken}`],
  ]) {
    for (const [method, path] of [
      ['GET', '/config'], ['GET', ''], ['POST', '/consents'],
      ['POST', '/prepare'], ['POST', '/select'], ['DELETE', ''],
    ]) {
      await t.test(`${method} ${path}: ${label}`, async () => {
        const response = await fetch(`http://localhost:5002/api/v1/customer/payments/razorpay/saved-cards${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...(authorization ? { authorization } : {}) },
          ...(['POST', 'DELETE'].includes(method) ? { body: '{}' } : {}),
        });
        assert.equal(response.status, 401);
        assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
        const result = await response.json();
        assert.equal(result.success, false);
        if (label === 'staff token') assert.equal(result.message, 'Invalid token type');
        if (label === 'expired customer token') assert.match(result.message, /Session expired/);
        assert.doesNotMatch(JSON.stringify(result), /razorpayCustomerId|customer_id|"cards"|"sdk"|key_secret/);
      });
    }
  }
});
