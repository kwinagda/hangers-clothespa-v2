// ── Staff Wallet Controller ───────────────────────────────────────────────────
// Staff-facing wallet management for CRM
// Routes:
//   GET  /api/v1/wallet/:customerId          — balance + full ledger
//   POST /api/v1/wallet/:customerId/credit   — add credit
//   POST /api/v1/wallet/:customerId/deduct   — deduct balance
//   POST /api/v1/wallet/:customerId/apply    — apply wallet to order (POS)

const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { walletAdjustmentSchema, walletApplySchema } = require('../validation/finance.schemas');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

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

    if (!customer) return notFound(res, 'Customer not found');

    return success(res, {
      customer,
      balance:      customer.walletBalance,
      transactions: txns,
      total,
    });
  } catch (e) {
    return error(res, 'Failed to fetch customer wallet');
  }
};

// POST /api/v1/wallet/:customerId/credit
const creditWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const parsed = walletAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid wallet credit payload');
    const { amount, reason, orderId } = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return notFound(res, 'Customer not found');

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount,
          type:    'CREDIT',
          reason,
          orderId: orderId || null,
        }
      });
      const updated = await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { increment: amount } },
        select: { walletBalance: true }
      });
      return { txn, newBalance: updated.walletBalance };
    });

    return success(res, result, `₹${amount} credited to wallet`);
  } catch (e) {
    return error(res, 'Failed to credit wallet');
  }
};

// POST /api/v1/wallet/:customerId/deduct
const deductWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const parsed = walletAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid wallet deduction payload');
    const { amount, reason, orderId } = parsed.data;

    const customer = await prisma.customer.findUnique({
      where:  { id: customerId },
      select: { walletBalance: true }
    });

    if (!customer) return notFound(res, 'Customer not found');
    if (customer.walletBalance < amount) {
      return badRequest(res, `Insufficient wallet balance. Current balance: ₹${customer.walletBalance}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount,
          type:    'DEBIT',
          reason,
          orderId: orderId || null,
        }
      });
      const updated = await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { decrement: amount } },
        select: { walletBalance: true }
      });
      return { txn, newBalance: updated.walletBalance };
    });

    return success(res, result, `₹${amount} deducted from wallet`);
  } catch (e) {
    return error(res, 'Failed to deduct wallet balance');
  }
};

// POST /api/v1/wallet/:customerId/apply — apply wallet balance to an order (POS)
const applyWalletToOrder = async (req, res) => {
  try {
    const { customerId } = req.params;
    const parsed = walletApplySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid wallet apply payload');
    const { orderId, amount } = parsed.data;

    const [customer, order] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { walletBalance: true } }),
      prisma.order.findFirst({
        where: { id: orderId, ...ORDER_ONLY_WHERE },
        select: { id: true, customerId: true, totalAmount: true, paidAmount: true, writeOffAmount: true, paymentStatus: true },
      })
    ]);

    if (!customer) return notFound(res, 'Customer not found');
    if (!order)    return notFound(res, 'Order not found');
    if (order.customerId !== customerId) {
      return badRequest(res, 'Wallet can only be applied to orders belonging to the same customer');
    }

    const balanceDue = Math.max(0, Number((order.totalAmount - order.paidAmount - (order.writeOffAmount || 0)).toFixed(2)));
    const applyAmount = Math.min(amount, customer.walletBalance, balanceDue);
    if (applyAmount <= 0) return badRequest(res, 'Nothing to apply');

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
          paymentStatus: newPaid + (order.writeOffAmount || 0) >= order.totalAmount ? 'PAID' : newPaid > 0 || (order.writeOffAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID'
        }
      });

      return { appliedAmount: applyAmount, newBalance: customer.walletBalance - applyAmount, order: updated };
    });

    return success(res, result, `₹${applyAmount} applied from wallet to order`);
  } catch (e) {
    return error(res, 'Failed to apply wallet to order');
  }
};

module.exports = { getCustomerWallet, creditWallet, deductWallet, applyWalletToOrder };
