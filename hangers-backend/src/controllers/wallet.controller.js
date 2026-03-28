// ─────────────────────────────────────────────────────────────────────────────
// WALLET CONTROLLER
// GET /api/v1/customer/wallet   — balance + recent transactions
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, error } = require('../utils/response');

// GET /api/v1/customer/wallet
const getWallet = async (req, res) => {
  const customerId = req.customer.id;

  try {
    const [customer, txns] = await Promise.all([
      prisma.customer.findUnique({
        where:  { id: customerId },
        select: { walletBalance: true },
      }),
      prisma.walletTransaction.findMany({
        where:   { customerId },
        orderBy: { createdAt: 'desc' },
        take:    50,
      }),
    ]);

    return success(res, {
      balance:      customer?.walletBalance || 0,
      transactions: txns,
    });
  } catch (err) {
    return error(res, 'Failed to fetch wallet');
  }
};

module.exports = { getWallet };
