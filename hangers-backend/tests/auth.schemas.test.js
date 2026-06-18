const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sendOtpSchema,
  verifyOtpSchema,
  staffCreateSchema,
  staffUpdateSchema,
} = require('../src/validation/auth.schemas');

test('sendOtpSchema accepts valid Indian phone', () => {
  const parsed = sendOtpSchema.safeParse({ phone: '9876543210' });
  assert.equal(parsed.success, true);
});

test('verifyOtpSchema rejects invalid otp payload', () => {
  const parsed = verifyOtpSchema.safeParse({ phone: '9876543210', otp: '12' });
  assert.equal(parsed.success, false);
});

test('staffCreateSchema enforces strong password', () => {
  const weak = staffCreateSchema.safeParse({
    name: 'Test User',
    phone: '9876543210',
    email: 'user@example.com',
    password: 'password123',
    role: 'MANAGER',
  });
  assert.equal(weak.success, false);
});

test('staffUpdateSchema requires at least one field', () => {
  const parsed = staffUpdateSchema.safeParse({});
  assert.equal(parsed.success, false);
});
