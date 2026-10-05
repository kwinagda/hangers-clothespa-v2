const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { reconcileRazorpayRefundWebhook } = require('../src/services/razorpay-refund.service');

test('refund webhook rejects unbound provider results before ledger transactions', async (t) => {
  const originalFind = prisma.razorpayRefundAttempt.findFirst;
  const originalTransaction = prisma.$transaction;
  let attempt = {
    id: 'refund-attempt-fixture', amountPaise: 1000, currency: 'INR',
    razorpayRefundId: 'rfnd_fixture',
    sourcePayment: { razorpayPaymentId: 'pay_fixture' },
  };
  let fetches = 0;
  prisma.razorpayRefundAttempt.findFirst = async () => attempt;
  prisma.$transaction = async () => assert.fail('Invalid refund must not reach ledger transaction');
  t.after(async () => {
    prisma.razorpayRefundAttempt.findFirst = originalFind;
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  });
  const base = { id: 'rfnd_fixture', payment_id: 'pay_fixture', amount: 1000, currency: 'INR', status: 'processed' };
  const fetcher = (overrides) => async (id) => {
    fetches += 1;
    assert.equal(id, 'rfnd_fixture');
    return { ...base, ...overrides };
  };
  await t.test('missing reference never fetches provider', async () => {
    await assert.rejects(reconcileRazorpayRefundWebhook({}, fetcher({})), { code: 'MISSING_REFUND_ID', permanent: true });
    assert.equal(fetches, 0);
  });
  for (const [name, overrides, code] of [
    ['foreign payment', { payment_id: 'pay_foreign' }, 'RAZORPAY_REFUND_PROVIDER_MISMATCH'],
    ['wrong amount', { amount: 999 }, 'RAZORPAY_REFUND_PROVIDER_MISMATCH'],
    ['wrong currency', { currency: 'USD' }, 'RAZORPAY_REFUND_PROVIDER_MISMATCH'],
    ['foreign reservation metadata', { notes: { crm_refund_attempt_id: 'other' } }, 'RAZORPAY_REFUND_BINDING_MISMATCH'],
    ['different refund reference', { id: 'rfnd_other' }, 'RAZORPAY_REFUND_ID_MISMATCH'],
    ['unknown provider status', { status: 'unknown' }, 'RAZORPAY_REFUND_STATE_UNSUPPORTED'],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(reconcileRazorpayRefundWebhook({ refundId: 'rfnd_fixture' }, fetcher(overrides)), { code });
    });
  }
  await t.test('unmatched reservation never fetches provider', async () => {
    attempt = null;
    const before = fetches;
    await assert.rejects(reconcileRazorpayRefundWebhook({ refundId: 'rfnd_fixture' }, fetcher({})), { code: 'UNMATCHED_REFUND', permanent: true });
    assert.equal(fetches, before);
  });
});
