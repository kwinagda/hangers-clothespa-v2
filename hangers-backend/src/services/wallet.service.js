// ─────────────────────────────────────────────────────────────────────────────
// WALLET SERVICE — single entry point for all customer wallet mutations.
//
// RULE: No controller or service may update Customer.walletBalance directly.
//       Always call creditWallet() or debitWallet() here, which atomically
//       update both the balance and insert a WalletTransaction row.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');

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
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('creditWallet: amount must be a positive number');
  }

  const run = async (tx) => {
    const updated = await tx.customer.update({
      where: { id: customerId },
      data:  { walletBalance: { increment: amount } },
      select: { walletBalance: true },
    });
    await tx.walletTransaction.create({
      data: {
        customerId,
        amount,
        type:    'CREDIT',
        reason,
        orderId: opts.orderId ?? null,
      },
    });
    return updated.walletBalance;
  };

  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

/**
 * Debits amount from customer wallet inside an optional existing transaction.
 * Throws if the customer has insufficient balance.
 */
async function debitWallet(customerId, amount, reason, opts = {}) {
  if (!customerId) throw new Error('debitWallet: customerId is required');
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('debitWallet: amount must be a positive number');
  }

  const run = async (tx) => {
    // Atomic: decrement only succeeds if balance >= amount; prevents double-debit races
    const rows = await tx.$queryRaw`
      UPDATE "Customer"
      SET    "walletBalance" = "walletBalance" - ${amount}
      WHERE  "id" = ${customerId}
      AND    "walletBalance" >= ${amount}
      RETURNING "walletBalance"
    `;
    if (!rows.length) {
      const row = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!row) throw new Error(`Customer ${customerId} not found`);
      const err = new Error('Insufficient wallet balance');
      err.statusCode = 400;
      throw err;
    }
    await tx.walletTransaction.create({
      data: {
        customerId,
        amount,
        type:    'DEBIT',
        reason,
        orderId: opts.orderId ?? null,
      },
    });
    return Number(rows[0].walletBalance);
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
