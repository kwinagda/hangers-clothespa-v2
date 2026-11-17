const test = require('node:test');
const assert = require('node:assert/strict');

const { reverseWalletTransaction } = require('../src/services/wallet.service');
const { WALLET_ADJUSTMENT_REASONS } = require('../src/config/master-data');
const { MASTER_SETTING_KEYS } = require('../src/services/masterData.service');

const makeTx = (original) => {
  const created = [];
  return {
    created,
    walletTransaction: {
      findFirst: async () => original,
      create: async ({ data }) => {
        const transaction = { id: 'reversal-1', ...data };
        created.push(transaction);
        return transaction;
      },
    },
    customer: { findUnique: async () => ({ id: 'customer-1' }) },
    $queryRaw: async () => [{ before: 100, after: 75 }],
  };
};

test('manual wallet adjustment reversal posts a linked opposite immutable entry', async () => {
  const tx = makeTx({
    id: 'adjustment-1',
    customerId: 'customer-1',
    amount: 25,
    type: 'CREDIT',
    origin: 'CRM_MANUAL_ADJUSTMENT',
    externalReference: null,
    reversalOfId: null,
    reversals: [],
  });

  const result = await reverseWalletTransaction('customer-1', 'adjustment-1', 'Entry made in error: duplicate', {
    tx,
    actorId: 'staff-1',
    idempotencyKey: 'wallet.reverse:test',
  });

  assert.equal(result.balance, 75);
  assert.equal(result.transaction.type, 'DEBIT');
  assert.equal(result.transaction.origin, 'CRM_MANUAL_REVERSAL');
  assert.equal(result.transaction.reasonCode, 'MANUAL_REVERSAL');
  assert.equal(result.transaction.reversalOfId, 'adjustment-1');
  assert.equal(result.transaction.createdById, 'staff-1');
});

test('system movements and already reversed adjustments cannot use manual reversal', async () => {
  const systemTx = makeTx({ id: 'system-1', origin: 'REFERRAL_REWARD', reversals: [], reversalOfId: null });
  await assert.rejects(
    reverseWalletTransaction('customer-1', 'system-1', 'Not allowed', { tx: systemTx }),
    { statusCode: 409, message: 'Only manual CRM wallet adjustments can be reversed here' }
  );

  const reversedTx = makeTx({ id: 'adjustment-1', type: 'CREDIT', origin: 'CRM_MANUAL_ADJUSTMENT', reversals: [{ id: 'reversal-1' }], reversalOfId: null });
  await assert.rejects(
    reverseWalletTransaction('customer-1', 'adjustment-1', 'Again', { tx: reversedTx }),
    { statusCode: 409, message: 'Wallet transaction has already been reversed' }
  );
});

test('wallet adjustment choices are governed by the DB-backed master setting', () => {
  assert.equal(MASTER_SETTING_KEYS.walletAdjustmentReasons, 'master.walletAdjustmentReasons');
  assert.ok(WALLET_ADJUSTMENT_REASONS.CREDIT.length > 0);
  assert.ok(WALLET_ADJUSTMENT_REASONS.DEBIT.length > 0);
  assert.ok(WALLET_ADJUSTMENT_REASONS.REVERSAL.length > 0);
  for (const options of Object.values(WALLET_ADJUSTMENT_REASONS)) {
    assert.equal(new Set(options.map((option) => option.value)).size, options.length);
    assert.ok(options.every((option) => option.value && option.label));
  }
});
