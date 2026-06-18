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

    const exists = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!exists) return notFound(res, 'Customer not found');

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { walletBalance: true },
      });
      if (!customer) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
      if (Number(customer.walletBalance) < amount) {
        throw Object.assign(new Error('INSUFFICIENT'), { code: 'INSUFFICIENT', balance: Number(customer.walletBalance) });
      }
      const txn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount,
          type:    'DEBIT',
          reason,
          orderId: orderId || null,
        },
      });
      const updated = await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { decrement: amount } },
        select: { walletBalance: true },
      });
      return { txn, newBalance: updated.walletBalance };
    });

    return success(res, result, `₹${amount} deducted from wallet`);
  } catch (e) {
    if (e.code === 'INSUFFICIENT') return badRequest(res, `Insufficient wallet balance. Current balance: ₹${e.balance}`);
    if (e.code === 'NOT_FOUND') return notFound(res, 'Customer not found');
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

    const result = await prisma.$transaction(async (tx) => {
      const [customer, order] = await Promise.all([
        tx.customer.findUnique({ where: { id: customerId }, select: { walletBalance: true } }),
        tx.order.findFirst({
          where: { id: orderId, ...ORDER_ONLY_WHERE },
          select: { id: true, customerId: true, totalAmount: true, paidAmount: true, writeOffAmount: true, paymentStatus: true },
        }),
      ]);

      if (!customer) throw Object.assign(new Error('CUSTOMER_NOT_FOUND'), { code: 'CUSTOMER_NOT_FOUND' });
      if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { code: 'ORDER_NOT_FOUND' });
      if (order.customerId !== customerId) {
        throw Object.assign(new Error('WRONG_CUSTOMER'), { code: 'WRONG_CUSTOMER' });
      }

      const balanceDue = Math.max(0, Number((Number(order.totalAmount) - Number(order.paidAmount) - Number(order.writeOffAmount || 0)).toFixed(2)));
      const applyAmount = Math.min(amount, Number(customer.walletBalance), balanceDue);
      if (applyAmount <= 0) throw Object.assign(new Error('NOTHING_TO_APPLY'), { code: 'NOTHING_TO_APPLY' });

      await tx.customer.update({
        where: { id: customerId },
        data:  { walletBalance: { decrement: applyAmount } },
      });

      await tx.walletTransaction.create({
        data: {
          customerId,
          amount:  applyAmount,
          type:    'DEBIT',
          reason:  `Applied to order ${order.id}`,
          orderId,
        },
      });

      const newPaid = Number(order.paidAmount) + applyAmount;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          paidAmount:    newPaid,
          paymentStatus: newPaid + Number(order.writeOffAmount || 0) >= Number(order.totalAmount) ? 'PAID' : newPaid > 0 || Number(order.writeOffAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
        },
      });

      return { appliedAmount: applyAmount, newBalance: Number(customer.walletBalance) - applyAmount, order: updated };
    });

    return success(res, result, `₹${result.appliedAmount} applied from wallet to order`);
  } catch (e) {
    if (e.code === 'CUSTOMER_NOT_FOUND') return notFound(res, 'Customer not found');
    if (e.code === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (e.code === 'WRONG_CUSTOMER') return badRequest(res, 'Wallet can only be applied to orders belonging to the same customer');
    if (e.code === 'NOTHING_TO_APPLY') return badRequest(res, 'Nothing to apply');
    return error(res, 'Failed to apply wallet to order');
  }
};

module.exports = { getCustomerWallet, creditWallet, deductWallet, applyWalletToOrder };
