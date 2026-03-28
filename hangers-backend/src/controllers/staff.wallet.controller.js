// ── Staff Wallet Controller ───────────────────────────────────────────────────
// Staff-facing wallet management for CRM
// Routes:
//   GET  /api/v1/wallet/:customerId          — balance + full ledger
//   POST /api/v1/wallet/:customerId/credit   — add credit
//   POST /api/v1/wallet/:customerId/deduct   — deduct balance
//   POST /api/v1/wallet/:customerId/apply    — apply wallet to order (POS)

const prisma = require('../config/database');

const ok  = (res, data, msg = 'Success') => res.json({ success: true, message: msg, data });
const bad = (res, msg) => res.status(400).json({ success: false, message: msg });
const err = (res, e)   => res.status(500).json({ success: false, message: e.message });

// GET /api/v1/wallet/:customerId
const getCustomerWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const [customer, txns, total] = await Promise.all([
      prisma.customer.findUnique({
        where:  { id: customerId },
        select: { id: true, name: true, phone: true, walletBalance: true, loyaltyPoints: true }
      }),
      prisma.walletTransaction.findMany({
        where:   { customerId },
        orderBy: { createdAt: 'desc' },
        take:    parseInt(limit),
        skip:    (parseInt(page) - 1) * parseInt(limit),
        include: { order: { select: { orderNumber: true } } }
      }),
      prisma.walletTransaction.count({ where: { customerId } })
    ]);

    if (!customer) return bad(res, 'Customer not found');

    ok(res, {
      customer,
      balance:      customer.walletBalance,
      transactions: txns,
      total,
    });
  } catch (e) { err(res, e); }
};

// POST /api/v1/wallet/:customerId/credit
const creditWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount, reason, orderId } = req.body;

    if (!amount || amount <= 0) return bad(res, 'Amount must be greater than 0');
    if (!reason)               return bad(res, 'Reason is required');

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount:  parseFloat(amount),
          type:    'CREDIT',
          reason,
          orderId: orderId || null,
        }
      });
      const updated = await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { increment: parseFloat(amount) } },
        select: { walletBalance: true }
      });
      return { txn, newBalance: updated.walletBalance };
    });

    ok(res, result, `₹${amount} credited to wallet`);
  } catch (e) { err(res, e); }
};

// POST /api/v1/wallet/:customerId/deduct
const deductWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount, reason, orderId } = req.body;

    if (!amount || amount <= 0) return bad(res, 'Amount must be greater than 0');
    if (!reason)               return bad(res, 'Reason is required');

    const customer = await prisma.customer.findUnique({
      where:  { id: customerId },
      select: { walletBalance: true }
    });

    if (!customer) return bad(res, 'Customer not found');
    if (customer.walletBalance < parseFloat(amount)) {
      return bad(res, `Insufficient wallet balance. Current balance: ₹${customer.walletBalance}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount:  parseFloat(amount),
          type:    'DEBIT',
          reason,
          orderId: orderId || null,
        }
      });
      const updated = await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { decrement: parseFloat(amount) } },
        select: { walletBalance: true }
      });
      return { txn, newBalance: updated.walletBalance };
    });

    ok(res, result, `₹${amount} deducted from wallet`);
  } catch (e) { err(res, e); }
};

// POST /api/v1/wallet/:customerId/apply — apply wallet balance to an order (POS)
const applyWalletToOrder = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { orderId, amount } = req.body;

    if (!orderId) return bad(res, 'orderId required');
    if (!amount || amount <= 0) return bad(res, 'Amount must be greater than 0');

    const [customer, order] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { walletBalance: true } }),
      prisma.order.findUnique({ where: { id: orderId }, select: { id: true, totalAmount: true, paidAmount: true, paymentStatus: true } })
    ]);

    if (!customer) return bad(res, 'Customer not found');
    if (!order)    return bad(res, 'Order not found');

    const applyAmount = Math.min(parseFloat(amount), customer.walletBalance, order.totalAmount - order.paidAmount);
    if (applyAmount <= 0) return bad(res, 'Nothing to apply');

    const result = await prisma.$transaction(async (tx) => {
      // Deduct from wallet
      await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { decrement: applyAmount } }
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          customerId,
          amount:  applyAmount,
          type:    'DEBIT',
          reason:  `Applied to order ${order.id}`,
          orderId,
        }
      });

      // Update order paid amount
      const newPaid = order.paidAmount + applyAmount;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          paidAmount:    newPaid,
          paymentStatus: newPaid >= order.totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'
        }
      });

      return { appliedAmount: applyAmount, newBalance: customer.walletBalance - applyAmount, order: updated };
    });

    ok(res, result, `₹${applyAmount} applied from wallet to order`);
  } catch (e) { err(res, e); }
};

module.exports = { getCustomerWallet, creditWallet, deductWallet, applyWalletToOrder };
