// ── Staff Wallet Controller ───────────────────────────────────────────────────
// Staff-facing wallet management for CRM
// Routes:
//   GET  /api/v1/wallet/:customerId          — balance + full ledger
//   POST /api/v1/wallet/:customerId/credit   — add credit
//   POST /api/v1/wallet/:customerId/deduct   — deduct balance
//   POST /api/v1/wallet/:customerId/transactions/:transactionId/reverse — reverse a manual adjustment
//   POST /api/v1/wallet/:customerId/apply    — apply wallet to order (POS)

const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { walletAdjustmentSchema, walletApplySchema, walletReversalSchema } = require('../validation/finance.schemas');
const { creditWallet: creditWalletLedger, debitWallet: debitWalletLedger, reverseWalletTransaction } = require('../services/wallet.service');
const { PaymentRuleError, recordOrderSettlement } = require('../services/payment.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { getWalletAdjustmentReasons } = require('../services/masterData.service');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const resolveAdjustmentReason = async (kind, reasonCode, note) => {
  const reasonGroups = await getWalletAdjustmentReasons();
  const option = (reasonGroups?.[kind] || []).find((item) => item.value === reasonCode);
  if (!option) return null;
  return { reasonCode, reason: `${option.label}: ${note}` };
};

// GET /api/v1/wallet/:customerId
const getCustomerWallet = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));

    const [customer, txns, total] = await Promise.all([
      prisma.customer.findUnique({
        where:  { id: customerId },
        select: { id: true, name: true, phone: true, walletBalance: true, loyaltyPoints: true }
      }),
      prisma.walletTransaction.findMany({
        where:   { customerId },
        orderBy: { createdAt: 'desc' },
        take:    pageSize,
        skip:    (pageNumber - 1) * pageSize,
        include: {
          order: { select: { orderNumber: true } },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          reversalOf: { select: { id: true } },
          reversals: { select: { id: true, createdAt: true } },
        }
      }),
      prisma.walletTransaction.count({ where: { customerId } })
    ]);

    if (!customer) return notFound(res, 'Customer not found');

    return success(res, {
      customer,
      balance:      customer.walletBalance,
      transactions: txns,
      total,
      page: pageNumber,
      limit: pageSize,
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
    const { amount, reasonCode, note } = parsed.data;
    const adjustmentReason = await resolveAdjustmentReason('CREDIT', reasonCode, note);
    if (!adjustmentReason) return badRequest(res, 'Select a valid wallet credit reason');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return notFound(res, 'Customer not found');

    const result = await prisma.$transaction(async (tx) => {
      const ledger = await creditWalletLedger(customerId, amount, adjustmentReason.reason, {
        tx,
        actorId: req.staff?.id,
        origin: 'CRM_MANUAL_ADJUSTMENT',
        reasonCode: adjustmentReason.reasonCode,
        idempotencyKey: req.idempotencyKey,
        returnTransaction: true,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'WALLET_CREDITED', resource: 'customer', resourceId: customerId,
        description: `Wallet credited by Rs ${amount.toFixed(2)}`,
        metadata: { transactionId: ledger.transaction.id, amount, reasonCode, note, balanceAfter: ledger.balance },
        ...getRequestMeta(req),
      });
      return { txn: ledger.transaction, newBalance: ledger.balance };
    }, { isolationLevel: 'Serializable' });

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
    const { amount, reasonCode, note } = parsed.data;
    const adjustmentReason = await resolveAdjustmentReason('DEBIT', reasonCode, note);
    if (!adjustmentReason) return badRequest(res, 'Select a valid wallet debit reason');

    const exists = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!exists) return notFound(res, 'Customer not found');

    const result = await prisma.$transaction(async (tx) => {
      const ledger = await debitWalletLedger(customerId, amount, adjustmentReason.reason, {
        tx,
        actorId: req.staff?.id,
        origin: 'CRM_MANUAL_ADJUSTMENT',
        reasonCode: adjustmentReason.reasonCode,
        idempotencyKey: req.idempotencyKey,
        returnTransaction: true,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'WALLET_DEBITED', resource: 'customer', resourceId: customerId,
        description: `Wallet debited by Rs ${amount.toFixed(2)}`,
        metadata: { transactionId: ledger.transaction.id, amount, reasonCode, note, balanceAfter: ledger.balance },
        ...getRequestMeta(req),
      });
      return { txn: ledger.transaction, newBalance: ledger.balance };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, `₹${amount} deducted from wallet`);
  } catch (e) {
    if (e.message === 'Insufficient wallet balance') return badRequest(res, e.message);
    if (/Customer .* not found/.test(e.message || '')) return notFound(res, 'Customer not found');
    return error(res, 'Failed to deduct wallet balance');
  }
};

// POST /api/v1/wallet/:customerId/transactions/:transactionId/reverse
const reverseAdjustment = async (req, res) => {
  try {
    const { customerId, transactionId } = req.params;
    const parsed = walletReversalSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid wallet reversal payload');
    const { reasonCode, note } = parsed.data;
    const reversalReason = await resolveAdjustmentReason('REVERSAL', reasonCode, note);
    if (!reversalReason) return badRequest(res, 'Select a valid wallet reversal reason');

    const result = await prisma.$transaction(async (tx) => {
      const ledger = await reverseWalletTransaction(customerId, transactionId, reversalReason.reason, {
        tx,
        actorId: req.staff?.id,
        idempotencyKey: req.idempotencyKey,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'WALLET_ADJUSTMENT_REVERSED', resource: 'customer', resourceId: customerId,
        description: `Wallet adjustment ${transactionId} reversed`,
        metadata: { originalTransactionId: transactionId, reversalTransactionId: ledger.transaction.id, reasonCode, note, balanceAfter: ledger.balance },
        ...getRequestMeta(req),
      });
      return { txn: ledger.transaction, newBalance: ledger.balance };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, 'Wallet adjustment reversed');
  } catch (e) {
    if (e.statusCode === 404) return notFound(res, e.message);
    if (e.statusCode === 409) return error(res, e.message, 409);
    if (e.code === 'P2002' && e.meta?.target?.includes('reversalOfId')) return error(res, 'Wallet transaction has already been reversed', 409);
    if (e.message === 'Insufficient wallet balance') return badRequest(res, 'The credited amount has already been spent and cannot be reversed');
    return error(res, 'Failed to reverse wallet adjustment');
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
      const order = await tx.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE } });
      if (!order) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (order.customerId !== customerId) throw new PaymentRuleError('WRONG_CUSTOMER', 'Wallet can only be applied to an order owned by the same customer');

      const settlement = await recordOrderSettlement(tx, {
        orderId,
        walletAmount: amount,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      const wallet = await tx.customer.findUnique({ where: { id: customerId }, select: { walletBalance: true } });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'WALLET_APPLIED_TO_ORDER', resource: 'order', resourceId: orderId,
        description: `Rs ${amount.toFixed(2)} applied from wallet to ${order.orderNumber}`,
        metadata: { customerId, amount, paymentIds: settlement.payments.map((payment) => payment.id), balanceAfter: wallet.walletBalance },
        ...getRequestMeta(req),
      });
      return { appliedAmount: amount, newBalance: wallet.walletBalance, order: settlement.order };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, `₹${result.appliedAmount} applied from wallet to order`);
  } catch (e) {
    if (e instanceof PaymentRuleError) {
      if (e.statusCode === 404) return notFound(res, e.message);
      return badRequest(res, e.message);
    }
    if (e.message === 'Insufficient wallet balance') return badRequest(res, e.message);
    return error(res, 'Failed to apply wallet to order');
  }
};

module.exports = { getCustomerWallet, creditWallet, deductWallet, applyWalletToOrder, reverseAdjustment };
