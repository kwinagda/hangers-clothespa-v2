const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const {
  generateCustomerToken,
  generateStaffToken,
  verifyToken,
  getTokenExpiry,
} = require('../src/services/jwt.service');

test('customer token carries sessionVersion', () => {
  const token = generateCustomerToken({ id: 'c1', phone: '9999999999', sessionVersion: 3 }, '1h');
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 'c1');
  assert.equal(decoded.sessionVersion, 3);
  assert.equal(decoded.type, 'customer');
});

test('staff token carries sessionVersion and role', () => {
  const token = generateStaffToken({ id: 's1', phone: '9999999999', email: 'a@b.com', role: 'MANAGER', sessionVersion: 4 }, '1h');
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 's1');
  assert.equal(decoded.sessionVersion, 4);
  assert.equal(decoded.role, 'MANAGER');
  assert.equal(decoded.type, 'staff');
});

test('getTokenExpiry parses supported expiry formats', () => {
  const before = Date.now();
  const expiry = getTokenExpiry('1h');
  const diff = expiry.getTime() - before;
  assert.ok(diff > 3_500_000 && diff <= 3_600_500);
});
