const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkoutCouponSchema,
  checkoutLoyaltySchema,
  recordPaymentSchema,
  walletAdjustmentSchema,
  walletApplySchema,
} = require('../src/validation/finance.schemas');

test('checkoutCouponSchema accepts valid coupon payload', () => {
  const parsed = checkoutCouponSchema.safeParse({ code: 'SAVE10', orderTotal: 250 });
  assert.equal(parsed.success, true);
});

test('checkoutLoyaltySchema rejects non-positive points', () => {
  const parsed = checkoutLoyaltySchema.safeParse({ customerId: 'c1', pointsToRedeem: 0, orderTotal: 200 });
  assert.equal(parsed.success, false);
});

test('recordPaymentSchema accepts payment method strings for DB-backed validation', () => {
  const parsed = recordPaymentSchema.safeParse({ orderId: 'o1', amount: 100, method: 'CHEQUE' });
  assert.equal(parsed.success, true);
});

test('wallet schemas reject invalid payloads', () => {
  assert.equal(walletAdjustmentSchema.safeParse({ amount: -1, reason: 'x' }).success, false);
  assert.equal(walletApplySchema.safeParse({ orderId: '', amount: 10 }).success, false);
});
