// ─────────────────────────────────────────────────────────────────────────────
// WALLET SERVICE — single entry point for all customer wallet mutations.
//
// RULE: No controller or service may update Customer.walletBalance directly.
//       Always call creditWallet() or debitWallet() here, which atomically
//       update both the balance and insert a WalletTransaction row.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { roundMoney } = require('../utils/line-pricing');

const validateAmount = (operation, amount) => {
  const normalized = roundMoney(Number(amount));
  if (!(normalized > 0)) throw new Error(`${operation}: amount must be a positive number`);
  return normalized;
};

const buildTransactionData = (customerId, amount, type, reason, balances, opts) => ({
  customerId,
  amount,
  type,
  reasonCode: opts.reasonCode || 'MANUAL_ADJUSTMENT',
  reason,
  orderId: opts.orderId ?? null,
  balanceBefore: balances.before,
  balanceAfter: balances.after,
  createdById: opts.actorId ?? null,
  approvedById: opts.approvedById ?? null,
  idempotencyKey: opts.idempotencyKey ?? null,
  externalReference: opts.externalReference ?? null,
  expiresAt: opts.expiresAt ?? null,
  reversalOfId: opts.reversalOfId ?? null,
});

/**
 * Credits amount to customer wallet inside an optional existing transaction.
 * @param {string} customerId
 * @param {number} amount        — must be > 0
 * @param {string} reason        — human-readable label for the transaction row
 * @param {object} [opts]
 * @param {string} [opts.orderId]
 * @param {object} [opts.tx]     — Prisma transaction client; if omitted a new
 *                                 transaction is started automatically
 */
async function creditWallet(customerId, amount, reason, opts = {}) {
  if (!customerId) throw new Error('creditWallet: customerId is required');
  const normalizedAmount = validateAmount('creditWallet', amount);

  const run = async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE "customers"
      SET "walletBalance" = "walletBalance" + ${normalizedAmount},
          "updatedAt" = NOW()
      WHERE "id" = ${customerId}
      RETURNING "walletBalance" - ${normalizedAmount} AS "before", "walletBalance" AS "after"
    `;
    if (!rows.length) throw new Error(`Customer ${customerId} not found`);
    const balances = { before: Number(rows[0].before), after: Number(rows[0].after) };
    const transaction = await tx.walletTransaction.create({
      data: buildTransactionData(customerId, normalizedAmount, 'CREDIT', reason, balances, opts),
    });
    return opts.returnTransaction ? { balance: balances.after, transaction } : balances.after;
  };

  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

/**
 * Debits amount from customer wallet inside an optional existing transaction.
 * Throws if the customer has insufficient balance.
 */
async function debitWallet(customerId, amount, reason, opts = {}) {
  if (!customerId) throw new Error('debitWallet: customerId is required');
  const normalizedAmount = validateAmount('debitWallet', amount);

  const run = async (tx) => {
    // Atomic: decrement only succeeds if balance >= amount; prevents double-debit races
    const rows = await tx.$queryRaw`
      UPDATE "customers"
      SET    "walletBalance" = "walletBalance" - ${normalizedAmount},
             "updatedAt" = NOW()
      WHERE  "id" = ${customerId}
      AND    "walletBalance" >= ${normalizedAmount}
      RETURNING "walletBalance" + ${normalizedAmount} AS "before", "walletBalance" AS "after"
    `;
    if (!rows.length) {
      const row = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!row) throw new Error(`Customer ${customerId} not found`);
      const err = new Error('Insufficient wallet balance');
      err.statusCode = 400;
      throw err;
    }
    const balances = { before: Number(rows[0].before), after: Number(rows[0].after) };
    const transaction = await tx.walletTransaction.create({
      data: buildTransactionData(customerId, normalizedAmount, 'DEBIT', reason, balances, opts),
    });
    return opts.returnTransaction ? { balance: balances.after, transaction } : balances.after;
  };

  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

/**
 * Returns the wallet balance and recent transaction history for a customer.
 */
async function getWalletSummary(customerId, { limit = 20 } = {}) {
  const [customer, transactions] = await Promise.all([
    prisma.customer.findUnique({
      where:  { id: customerId },
      select: { walletBalance: true },
    }),
    prisma.walletTransaction.findMany({
      where:   { customerId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    }),
  ]);
  return {
    balance:      customer?.walletBalance ?? 0,
    transactions,
  };
}

module.exports = { creditWallet, debitWallet, getWalletSummary };
