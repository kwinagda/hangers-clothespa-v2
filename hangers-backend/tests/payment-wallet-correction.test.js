const test = require('node:test');
const assert = require('node:assert/strict');

const { restoreWalletPaymentCorrection } = require('../src/services/payment.service');

const walletPayment = {
  id: 'payment-1',
  orderId: 'order-1',
  customerId: 'customer-1',
  amount: 35,
  method: 'WALLET',
  idempotencyKey: 'request-1:wallet-payment',
};

test('wallet payment correction restores the exact linked debit with an immutable reversal', async () => {
  const created = [];
  const tx = {
    walletTransaction: {
      findUnique: async ({ where }) => {
        assert.equal(where.idempotencyKey, 'request-1:wallet-debit');
        return {
          id: 'wallet-debit-1', customerId: 'customer-1', orderId: 'order-1', amount: 35,
          type: 'DEBIT', reversalOfId: null, reversals: [],
        };
      },
      create: async ({ data }) => {
        const transaction = { id: 'wallet-restore-1', ...data };
        created.push(transaction);
        return transaction;
      },
    },
    $queryRaw: async () => [{ before: 65, after: 100 }],
  };

  const result = await restoreWalletPaymentCorrection(tx, walletPayment, { id: 'staff-1' }, 'Wrong tender selected');
  assert.equal(result.balance, 100);
  assert.equal(created.length, 1);
  assert.equal(result.transaction.type, 'CREDIT');
  assert.equal(result.transaction.origin, 'PAYMENT_CORRECTION');
  assert.equal(result.transaction.reasonCode, 'PAYMENT_REVERSAL');
  assert.equal(result.transaction.reversalOfId, 'wallet-debit-1');
  assert.equal(result.transaction.idempotencyKey, 'payment-correction:payment-1:wallet-restore');
  assert.equal(result.transaction.createdById, 'staff-1');
});

test('wallet payment correction fails closed without a verified ledger link', async () => {
  await assert.rejects(
    restoreWalletPaymentCorrection({}, { ...walletPayment, idempotencyKey: null }, { id: 'staff-1' }, 'Wrong tender'),
    { code: 'WALLET_LEDGER_LINK_REQUIRED', statusCode: 409 }
  );
  await assert.rejects(
    restoreWalletPaymentCorrection({ walletTransaction: { findUnique: async () => null } }, walletPayment, { id: 'staff-1' }, 'Wrong tender'),
    { code: 'WALLET_LEDGER_LINK_INVALID', statusCode: 409 }
  );
});
