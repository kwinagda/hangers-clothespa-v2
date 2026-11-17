const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkoutCouponSchema,
  checkoutLoyaltySchema,
  recordPaymentSchema,
  walletAdjustmentSchema,
  walletApplySchema,
  walletReversalSchema,
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

test('recordPaymentSchema supports wallet-only and split settlements', () => {
  assert.equal(recordPaymentSchema.safeParse({ orderId: 'o1', amount: 0, walletAmount: 25 }).success, true);
  assert.equal(recordPaymentSchema.safeParse({ orderId: 'o1', amount: 50, walletAmount: 25, method: 'CASH' }).success, true);
  assert.equal(recordPaymentSchema.safeParse({ orderId: 'o1', amount: 0, walletAmount: 0 }).success, false);
  assert.equal(recordPaymentSchema.safeParse({ orderId: 'o1', amount: -1, walletAmount: 10 }).success, false);
});

test('wallet schemas reject invalid payloads', () => {
  assert.equal(walletAdjustmentSchema.safeParse({ amount: -1, reason: 'x' }).success, false);
  assert.equal(walletAdjustmentSchema.safeParse({ amount: 10, reasonCode: 'OTHER_CREDIT', note: 'Documented correction' }).success, true);
  assert.equal(walletAdjustmentSchema.safeParse({ amount: 10, reasonCode: 'OTHER_CREDIT', note: 'x', unexpected: true }).success, false);
  assert.equal(walletReversalSchema.safeParse({ reasonCode: 'ENTRY_ERROR', note: 'Wrong entry' }).success, true);
  assert.equal(walletApplySchema.safeParse({ orderId: '', amount: 10 }).success, false);
});
