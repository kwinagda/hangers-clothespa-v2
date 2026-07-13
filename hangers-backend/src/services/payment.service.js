const crypto = require('crypto');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { roundMoney } = require('../utils/line-pricing');
const { creditWallet, debitWallet } = require('./wallet.service');
const { ensureOrderInvoice, syncInvoiceBalance } = require('./billing.service');
const { issueReceipt } = require('./receipt.service');
const { nextDocumentNumber } = require('./document-number.service');

const CAPTURED_PAYMENT_STATUSES = ['CAPTURED', 'SUCCESS'];

class PaymentRuleError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'PaymentRuleError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const paymentReferenceFingerprint = (method, reference) => {
  const normalized = String(reference || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) return null;
  return crypto.createHash('sha256').update(`${method}:${normalized}`).digest('hex');
};

const lockOrder = async (tx, orderId) => {
  const rows = await tx.$queryRaw`
    SELECT "id"
    FROM "Order"
    WHERE "id" = ${orderId} AND "documentType" = 'ORDER'
    FOR UPDATE
  `;
  if (!rows.length) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
};

const getLedgerState = async (tx, orderId) => {
  const [order, allocations, refunds, credits, adjustments] = await Promise.all([
    tx.order.findFirst({ where: { id: orderId, documentType: 'ORDER' } }),
    tx.paymentAllocation.aggregate({
      where: {
        orderId,
        status: 'POSTED',
        payment: { kind: 'RECEIPT', status: { in: CAPTURED_PAYMENT_STATUSES } },
      },
      _sum: { amount: true },
    }),
    tx.refundAllocation.aggregate({
      where: {
        invoice: { orderId },
        status: 'POSTED',
        refundPayment: { kind: 'REFUND', status: { in: CAPTURED_PAYMENT_STATUSES } },
      },
      _sum: { amount: true },
    }),
    tx.creditNote.aggregate({
      where: { orderId, status: 'POSTED' },
      _sum: { amount: true },
    }),
    tx.financialAdjustment.aggregate({
      where: { orderId, kind: 'WRITE_OFF', status: 'POSTED' },
      _sum: { amount: true },
    }),
  ]);
  if (!order) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);

  const paidAmount = roundMoney(Math.max(0, Number(allocations._sum.amount || 0) - Number(refunds._sum.amount || 0)));
  const creditAmount = roundMoney(Number(credits._sum.amount || 0));
  const postedWriteOff = roundMoney(Number(adjustments._sum.amount || 0));
  const legacyWriteOff = roundMoney(Number(order.writeOffAmount || 0));
  const writeOffAmount = Math.max(postedWriteOff, legacyWriteOff);
  const totalAmount = roundMoney(Number(order.totalAmount || 0));
  const balanceDue = roundMoney(Math.max(0, totalAmount - creditAmount - paidAmount - writeOffAmount));

  return { order, paidAmount, creditAmount, writeOffAmount, totalAmount, balanceDue };
};

const syncOrderPaymentState = async (tx, orderId) => {
  const state = await getLedgerState(tx, orderId);
  const effectivePaid = roundMoney(state.paidAmount + state.writeOffAmount + state.creditAmount);
  const paymentStatus = state.totalAmount <= 0 || effectivePaid >= state.totalAmount
    ? 'PAID'
    : effectivePaid > 0
      ? 'PARTIAL'
      : 'UNPAID';

  const order = await tx.order.update({
    where: { id: orderId },
    data: {
      paidAmount: state.paidAmount,
      writeOffAmount: state.writeOffAmount,
      paymentStatus,
      version: { increment: 1 },
    },
  });
  const invoice = await ensureOrderInvoice(tx, orderId);
  const syncedInvoice = await syncInvoiceBalance(tx, invoice.id);
  return {
    order,
    invoice: syncedInvoice,
    paidAmount: state.paidAmount,
    writeOffAmount: state.writeOffAmount,
    creditAmount: state.creditAmount,
    balanceDue: roundMoney(Math.max(0, state.totalAmount - effectivePaid)),
    paymentStatus,
  };
};

const createCapturedPayment = async (tx, {
  order,
  customerId,
  invoiceId,
  amount,
  method,
  reference,
  notes,
  staffId,
  idempotencyKey,
}) => {
  const normalizedAmount = roundMoney(Number(amount || 0));
  if (!(normalizedAmount > 0)) return null;
  const normalizedMethod = normalizePaymentMethod(method);
  const referenceFingerprint = paymentReferenceFingerprint(normalizedMethod, reference);

  try {
    const payment = await tx.payment.create({
      data: {
        orderId: order?.id || null,
        customerId: order?.customerId || customerId,
        amount: normalizedAmount,
        kind: 'RECEIPT',
        method: normalizedMethod,
        status: 'CAPTURED',
        reference: reference || null,
        referenceFingerprint,
        notes: notes || null,
        collectedBy: staffId || null,
        idempotencyKey: idempotencyKey || null,
      },
    });
    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        orderId: order?.id || null,
        invoiceId,
        amount: normalizedAmount,
        status: 'POSTED',
        reason: 'Captured payment applied to order balance',
      },
    });
    await issueReceipt(tx, { payment, invoiceId, staffId });
    return payment;
  } catch (error) {
    if (error?.code === 'P2002' && referenceFingerprint && error?.meta?.target?.includes('referenceFingerprint')) {
      throw new PaymentRuleError('DUPLICATE_PAYMENT_REFERENCE', 'This payment reference has already been recorded');
    }
    if (error?.code === 'P2002' && idempotencyKey) {
      throw new PaymentRuleError('DUPLICATE_PAYMENT_REQUEST', 'This payment request has already been processed', 409);
    }
    throw error;
  }
};

const recordOrderSettlement = async (tx, {
  orderId,
  amount = 0,
  walletAmount = 0,
  method,
  reference,
  notes,
  writeOffAmount = 0,
  writeOffReason,
  staff,
  idempotencyKey,
}) => {
  await lockOrder(tx, orderId);
  const before = await getLedgerState(tx, orderId);
  const invoice = await ensureOrderInvoice(tx, orderId, staff?.id);
  if (['CANCELLED', 'RETURNED'].includes(before.order.status)) {
    throw new PaymentRuleError('ORDER_NOT_COLLECTIBLE', `Payments cannot be recorded against a ${before.order.status.toLowerCase()} order`);
  }

  const externalAmount = roundMoney(Number(amount || 0));
  const storedValueAmount = roundMoney(Number(walletAmount || 0));
  const writeOff = roundMoney(Number(writeOffAmount || 0));
  const requestedSettlement = roundMoney(externalAmount + storedValueAmount + writeOff);
  if (!(requestedSettlement > 0)) {
    throw new PaymentRuleError('EMPTY_SETTLEMENT', 'A payment, wallet amount, or write-off is required');
  }
  if (requestedSettlement > before.balanceDue) {
    throw new PaymentRuleError(
      'OVERPAYMENT_NOT_ALLOWED',
      `Settlement exceeds the outstanding balance of Rs ${before.balanceDue.toFixed(2)}. Record only the amount due.`
    );
  }
  if (externalAmount > 0 && !method) {
    throw new PaymentRuleError('PAYMENT_METHOD_REQUIRED', 'Payment method is required');
  }
  if (writeOff > 0) {
    const permissions = staff?.effectivePermissions || [];
    if (!permissions.includes('*') && !permissions.includes('finance.writeoff')) {
      throw new PaymentRuleError('WRITE_OFF_APPROVAL_REQUIRED', 'Write-offs require finance.writeoff authority', 403);
    }
    if (!writeOffReason || String(writeOffReason).trim().length < 3) {
      throw new PaymentRuleError('WRITE_OFF_REASON_REQUIRED', 'A write-off reason is required');
    }
  }

  const payments = [];
  if (storedValueAmount > 0) {
    await debitWallet(
      before.order.customerId,
      storedValueAmount,
      `Applied to order ${before.order.orderNumber}`,
      {
        tx,
        orderId,
        actorId: staff?.id,
        reasonCode: 'ORDER_PAYMENT',
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:wallet-debit` : null,
      }
    );
    payments.push(await createCapturedPayment(tx, {
      order: before.order,
      invoiceId: invoice.id,
      amount: storedValueAmount,
      method: 'WALLET',
      notes: notes || 'Wallet payment',
      staffId: staff?.id,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:wallet-payment` : null,
    }));
  }

  if (externalAmount > 0) {
    payments.push(await createCapturedPayment(tx, {
      order: before.order,
      invoiceId: invoice.id,
      amount: externalAmount,
      method,
      reference,
      notes,
      staffId: staff?.id,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:payment` : null,
    }));
  }

  let adjustment = null;
  if (writeOff > 0) {
    adjustment = await tx.financialAdjustment.create({
      data: {
        orderId,
        kind: 'WRITE_OFF',
        status: 'POSTED',
        amount: writeOff,
        reasonCode: 'APPROVED_WRITE_OFF',
        reason: String(writeOffReason).trim(),
        createdById: staff.id,
        approvedById: staff.id,
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        writeOffReason: String(writeOffReason).trim(),
        writeOffApprovedById: staff.id,
      },
    });
  }

  const synced = await syncOrderPaymentState(tx, orderId);
  const paymentNotes = payments.map((payment) => `Rs ${Number(payment.amount).toFixed(2)} via ${payment.method}`);
  if (adjustment) paymentNotes.push(`Rs ${writeOff.toFixed(2)} approved write-off`);
  await tx.orderStage.create({
    data: {
      orderId,
      stage: 'PAYMENT_RECORDED',
      notes: paymentNotes.join('; '),
      changedById: staff?.id || null,
    },
  });

  return {
    payments: payments.filter(Boolean),
    adjustment,
    ...synced,
  };
};

const recordInvoiceSettlement = async (tx, {
  invoiceId,
  amount,
  method,
  reference,
  notes,
  staff,
  idempotencyKey,
}) => {
  const locked = await tx.$queryRaw`
    SELECT "id"
    FROM "invoices"
    WHERE "id" = ${invoiceId}
    FOR UPDATE
  `;
  if (!locked.length) throw new PaymentRuleError('INVOICE_NOT_FOUND', 'Invoice not found', 404);

  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.voidedAt || invoice.status === 'VOID') {
    throw new PaymentRuleError('INVOICE_NOT_COLLECTIBLE', 'This invoice cannot accept payments');
  }
  const normalizedAmount = roundMoney(Number(amount || 0));
  if (!(normalizedAmount > 0)) throw new PaymentRuleError('EMPTY_SETTLEMENT', 'Payment amount must be greater than zero');
  if (normalizedAmount > Number(invoice.balanceDue || 0)) {
    throw new PaymentRuleError(
      'OVERPAYMENT_NOT_ALLOWED',
      `Payment exceeds the outstanding balance of Rs ${Number(invoice.balanceDue || 0).toFixed(2)}. Record only the amount due.`
    );
  }
  if (!method) throw new PaymentRuleError('PAYMENT_METHOD_REQUIRED', 'Payment method is required');

  const payment = await createCapturedPayment(tx, {
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    amount: normalizedAmount,
    method,
    reference,
    notes,
    staffId: staff?.id,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:payment` : null,
  });
  const syncedInvoice = await syncInvoiceBalance(tx, invoice.id);
  return { payment, invoice: syncedInvoice };
};

const recordOrderRefund = async (tx, {
  orderId,
  sourcePaymentId,
  amount,
  method,
  reference,
  reasonCode,
  reason,
  staff,
  idempotencyKey,
}) => {
  const permissions = staff?.effectivePermissions || [];
  if (!permissions.includes('*') && !permissions.includes('finance.refund')) {
    throw new PaymentRuleError('REFUND_APPROVAL_REQUIRED', 'Refunds require finance.refund authority', 403);
  }
  if (!reason || String(reason).trim().length < 3) {
    throw new PaymentRuleError('REFUND_REASON_REQUIRED', 'A refund reason is required');
  }
  await lockOrder(tx, orderId);
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${sourcePaymentId} FOR UPDATE`;
  const invoice = await ensureOrderInvoice(tx, orderId, staff?.id);
  const sourcePayment = await tx.payment.findFirst({
    where: {
      id: sourcePaymentId,
      kind: 'RECEIPT',
      status: { in: CAPTURED_PAYMENT_STATUSES },
      allocations: { some: { invoiceId: invoice.id, status: 'POSTED' } },
    },
    include: { allocations: { where: { invoiceId: invoice.id, status: 'POSTED' }, orderBy: { createdAt: 'asc' } } },
  });
  if (!sourcePayment) throw new PaymentRuleError('SOURCE_PAYMENT_NOT_FOUND', 'Captured source payment not found for this order', 404);

  const refundAmount = roundMoney(Number(amount || 0));
  if (!(refundAmount > 0)) throw new PaymentRuleError('INVALID_REFUND_AMOUNT', 'Refund amount must be greater than zero');
  const sourceAllocationIds = sourcePayment.allocations.map((allocation) => allocation.id);
  const priorRefunds = sourceAllocationIds.length
    ? await tx.refundAllocation.groupBy({
        by: ['sourceAllocationId'],
        where: { sourceAllocationId: { in: sourceAllocationIds }, status: 'POSTED' },
        _sum: { amount: true },
      })
    : [];
  const refundedByAllocation = new Map(priorRefunds.map((row) => [row.sourceAllocationId, Number(row._sum.amount || 0)]));
  const previouslyRefunded = roundMoney(priorRefunds.reduce((total, row) => total + Number(row._sum.amount || 0), 0));
  const refundable = roundMoney(sourcePayment.allocations.reduce(
    (total, allocation) => total + Math.max(0, Number(allocation.amount || 0) - (refundedByAllocation.get(allocation.id) || 0)),
    0
  ));
  const state = await getLedgerState(tx, orderId);
  if (refundAmount > refundable || refundAmount > state.paidAmount) {
    throw new PaymentRuleError(
      'REFUND_EXCEEDS_AVAILABLE',
      `Refund exceeds the available refundable amount of Rs ${Math.min(refundable, state.paidAmount).toFixed(2)}`
    );
  }

  const normalizedMethod = normalizePaymentMethod(method || sourcePayment.method);
  const fingerprint = paymentReferenceFingerprint(`REFUND_${normalizedMethod}`, reference);
  const refundPayment = await tx.payment.create({
    data: {
      orderId,
      customerId: sourcePayment.customerId,
      amount: refundAmount,
      kind: 'REFUND',
      method: normalizedMethod,
      status: 'CAPTURED',
      reference: reference || null,
      referenceFingerprint: fingerprint,
      notes: String(reason).trim(),
      collectedBy: staff?.id || null,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:refund` : null,
      reversalOfId: sourcePayment.id,
      reversalReason: String(reason).trim(),
    },
  });

  let remaining = refundAmount;
  for (const allocation of sourcePayment.allocations) {
    if (remaining <= 0) break;
    const available = roundMoney(Number(allocation.amount || 0) - (refundedByAllocation.get(allocation.id) || 0));
    const applied = roundMoney(Math.min(available, remaining));
    if (applied <= 0) continue;
    await tx.refundAllocation.create({
      data: {
        refundPaymentId: refundPayment.id,
        sourceAllocationId: allocation.id,
        invoiceId: invoice.id,
        amount: applied,
        status: 'POSTED',
        reason: String(reason).trim(),
      },
    });
    remaining = roundMoney(remaining - applied);
  }
  if (remaining > 0) throw new PaymentRuleError('REFUND_ALLOCATION_FAILED', 'Refund could not be fully allocated');

  const creditNoteNumber = await nextDocumentNumber({
    tx,
    documentType: 'CREDIT_NOTE',
    prefix: 'CN-',
    padding: 6,
  });
  const creditNote = await tx.creditNote.create({
    data: {
      creditNoteNumber,
      invoiceId: invoice.id,
      customerId: sourcePayment.customerId,
      orderId,
      refundPaymentId: refundPayment.id,
      status: 'POSTED',
      amount: refundAmount,
      reasonCode: reasonCode || 'CUSTOMER_REFUND',
      reason: String(reason).trim(),
      createdById: staff.id,
      approvedById: staff.id,
      lines: {
        create: {
          description: `Credit against ${invoice.invoiceNumber}`,
          quantity: 1,
          amount: refundAmount,
        },
      },
    },
  });

  if (normalizedMethod === 'WALLET') {
    await creditWallet(sourcePayment.customerId, refundAmount, `Refund for ${state.order.orderNumber}`, {
      tx,
      orderId,
      actorId: staff.id,
      approvedById: staff.id,
      reasonCode: 'ORDER_REFUND',
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:wallet-refund` : null,
    });
  }

  const fullyRefunded = roundMoney(previouslyRefunded + refundAmount) >= Number(sourcePayment.amount || 0);
  if (fullyRefunded) {
    await tx.payment.update({
      where: { id: sourcePayment.id },
      data: { reversedAt: new Date(), reversalReason: String(reason).trim() },
    });
  }
  const synced = await syncOrderPaymentState(tx, orderId);
  await tx.orderStage.create({
    data: {
      orderId,
      stage: 'REFUND_ISSUED',
      eventType: 'FINANCIAL_EVENT',
      reasonCode: reasonCode || 'CUSTOMER_REFUND',
      notes: `${creditNoteNumber}: Rs ${refundAmount.toFixed(2)} refunded via ${normalizedMethod}. ${String(reason).trim()}`,
      changedById: staff.id,
      metadata: { sourcePaymentId, refundPaymentId: refundPayment.id, creditNoteId: creditNote.id },
    },
  });
  return { refundPayment, creditNote, ...synced };
};

const creditOverpayment = async (tx, order, amount, staff, idempotencyKey) => creditWallet(
  order.customerId,
  amount,
  `Explicit customer credit from order ${order.orderNumber}`,
  {
    tx,
    orderId: order.id,
    actorId: staff?.id,
    approvedById: staff?.id,
    reasonCode: 'OVERPAYMENT_CREDIT',
    idempotencyKey,
  }
);

module.exports = {
  CAPTURED_PAYMENT_STATUSES,
  PaymentRuleError,
  creditOverpayment,
  getLedgerState,
  paymentReferenceFingerprint,
  recordInvoiceSettlement,
  recordOrderRefund,
  recordOrderSettlement,
  syncOrderPaymentState,
};
