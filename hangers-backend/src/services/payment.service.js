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

const assertSettlementMethodAllowed = (method, { providerCaptureVerified = false } = {}) => {
  if (normalizePaymentMethod(method) === 'RAZORPAY' && !providerCaptureVerified) {
    throw new PaymentRuleError(
      'RAZORPAY_PROVIDER_VERIFICATION_REQUIRED',
      'Razorpay payments can only be recorded after server-side provider verification',
      409
    );
  }
};

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
  orderId,
  customerId,
  invoiceId,
  amount,
  method,
  reference,
  notes,
  staffId,
  idempotencyKey,
  effectiveAt,
  razorpayOrderId,
  razorpayPaymentId,
  providerMethod,
  providerMethodDetail,
  mode,
  razorpaySignature,
  allocations,
}) => {
  const normalizedAmount = roundMoney(Number(amount || 0));
  if (!(normalizedAmount > 0)) return null;
  const normalizedMethod = normalizePaymentMethod(method);
  const referenceFingerprint = paymentReferenceFingerprint(normalizedMethod, reference);

  try {
    const payment = await tx.payment.create({
      data: {
        orderId: order?.id || orderId || null,
        customerId: order?.customerId || customerId,
        amount: normalizedAmount,
        kind: 'RECEIPT',
        method: normalizedMethod,
        status: 'CAPTURED',
        reference: reference || null,
        referenceFingerprint,
        notes: notes || null,
        createdAt: effectiveAt || undefined,
        collectedBy: staffId || null,
        idempotencyKey: idempotencyKey || null,
        razorpayOrderId: razorpayOrderId || null,
        razorpayPaymentId: razorpayPaymentId || null,
        providerMethod: providerMethod || null,
        providerMethodDetail: providerMethodDetail || null,
        ...(mode ? { mode } : {}),
        razorpaySignature: razorpaySignature || null,
      },
    });
    const allocationRows = (allocations || [{ invoiceId, orderId: order?.id || orderId || null, amount: normalizedAmount }]).map((allocation) => ({
      paymentId: payment.id,
      orderId: allocation.orderId || null,
      invoiceId: allocation.invoiceId,
      amount: roundMoney(Number(allocation.amount)),
      status: 'POSTED',
      reason: allocations ? 'Captured payment allocated across customer invoices' : 'Captured payment applied to invoice balance',
      createdAt: effectiveAt || undefined,
    }));
    if (allocations) await tx.paymentAllocation.createMany({ data: allocationRows });
    else await tx.paymentAllocation.create({ data: allocationRows[0] });
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

const recordInvoiceAllocationsSettlement = async (tx, {
  allocations,
  allowPartial = false,
  staff,
  effectiveAt,
  expectedCustomerId,
  expectedCurrency,
  amount,
  method,
  reference,
  notes,
  idempotencyKey,
  razorpayOrderId,
  razorpayPaymentId,
  providerMethod,
  providerMethodDetail,
  mode,
  providerCaptureVerified = false,
}) => {
  assertSettlementMethodAllowed(method, { providerCaptureVerified });
  if (!Array.isArray(allocations) || allocations.length < 1) throw new PaymentRuleError('INVALID_ALLOCATION_PLAN', 'At least one invoice allocation is required');
  const normalized = allocations.map((item) => ({ invoiceId: String(item.invoiceId), amount: roundMoney(Number(item.amount)) }));
  if (new Set(normalized.map((item) => item.invoiceId)).size !== normalized.length || normalized.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
    throw new PaymentRuleError('INVALID_ALLOCATION_PLAN', 'The invoice allocation plan is invalid');
  }
  const expectedTotal = roundMoney(normalized.reduce((sum, item) => sum + item.amount, 0));
  if (expectedTotal !== roundMoney(Number(amount))) throw new PaymentRuleError('INVALID_ALLOCATION_PLAN', 'Allocation total does not match the captured payment');

  const ids = normalized.map((item) => item.invoiceId).sort();
  const initialRows = await tx.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, orderId: true } });
  const initialOrderIds = [...new Set(initialRows.map((invoice) => invoice.orderId).filter(Boolean))].sort();
  for (const orderId of initialOrderIds) {
    const locked = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    if (!locked.length) throw new PaymentRuleError('ORDER_NOT_FOUND', 'An order in this payment could not be found', 404);
  }
  for (const id of ids) {
    const locked = await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked.length) throw new PaymentRuleError('INVOICE_NOT_FOUND', 'An invoice in this payment could not be found', 404);
  }
  const invoices = await tx.invoice.findMany({ where: { id: { in: ids } } });
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const customerId = invoices[0]?.customerId;
  const currency = String(invoices[0]?.currency || 'INR').toUpperCase();
  if (!expectedCustomerId || customerId !== expectedCustomerId || currency !== String(expectedCurrency || '').toUpperCase()) {
    throw new PaymentRuleError('INVALID_ALLOCATION_PLAN', 'Invoice ownership or currency does not match the checkout attempt', 409);
  }
  const orderIds = new Set();
  for (const allocation of normalized) {
    const invoice = byId.get(allocation.invoiceId);
    if (!invoice || invoice.customerId !== customerId || String(invoice.currency || 'INR').toUpperCase() !== currency
      || invoice.voidedAt || invoice.status === 'VOID'
      || (allowPartial
        ? allocation.amount > roundMoney(Number(invoice.balanceDue || 0))
        : roundMoney(Number(invoice.balanceDue || 0)) !== allocation.amount)) {
      throw new PaymentRuleError('ALLOCATION_BALANCE_CHANGED', 'An invoice balance changed while payment was being completed. Finance review is required.', 409);
    }
    if (invoice.orderId) {
      const order = await tx.order.findUnique({ where: { id: invoice.orderId }, select: { status: true } });
      if (!order || ['CANCELLED', 'RETURNED'].includes(order.status)) throw new PaymentRuleError('ORDER_CANCELLED', 'A cancelled or returned order cannot accept a new payment', 409);
      orderIds.add(invoice.orderId);
    } else if (invoice.ironBillId) {
      const bill = await tx.ironBill.findUnique({ where: { id: invoice.ironBillId }, select: { status: true } });
      if (!bill || bill.status === 'VOID') throw new PaymentRuleError('BILL_VOID', 'A voided bill cannot accept payment', 409);
    } else if (invoice.serviceAppointmentId) {
      const appointment = await tx.serviceAppointment.findUnique({ where: { id: invoice.serviceAppointmentId }, select: { status: true } });
      if (!appointment || appointment.status === 'CANCELLED') throw new PaymentRuleError('APPOINTMENT_CANCELLED', 'A cancelled appointment cannot accept payment', 409);
    }
  }

  const payment = await createCapturedPayment(tx, {
    customerId,
    staffId: staff?.id,
    effectiveAt,
    invoiceId: normalized[0].invoiceId,
    amount: expectedTotal,
    method,
    reference,
    notes,
    idempotencyKey,
    razorpayOrderId,
    razorpayPaymentId,
    providerMethod,
    providerMethodDetail,
    mode,
    allocations: normalized.map((item) => ({ ...item, orderId: byId.get(item.invoiceId).orderId || null })),
  });
  const syncedInvoices = [];
  for (const orderId of [...orderIds].sort()) {
    const synced = await syncOrderPaymentState(tx, orderId);
    if (synced.invoice) syncedInvoices.push(synced.invoice);
  }
  for (const allocation of normalized) {
    const invoice = byId.get(allocation.invoiceId);
    if (!invoice.orderId) syncedInvoices.push(await syncInvoiceBalance(tx, invoice.id));
  }
  return { payment, invoice: syncedInvoices.find((invoice) => invoice.id === normalized[0].invoiceId) || await tx.invoice.findUnique({ where: { id: normalized[0].invoiceId } }), invoices: syncedInvoices };
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
  effectiveAt,
  razorpayOrderId,
  razorpayPaymentId,
  providerMethod,
  providerMethodDetail,
  mode,
  razorpaySignature,
}) => {
  assertSettlementMethodAllowed(method);
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
        effectiveAt,
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
      effectiveAt,
      razorpayOrderId,
      razorpayPaymentId,
      providerMethod,
      providerMethodDetail,
      mode,
      razorpaySignature,
    }));
  }

  let adjustment = null;
  if (writeOff > 0) {
    adjustment = await tx.financialAdjustment.create({
      data: {
        orderId,
        invoiceId: invoice.id,
        kind: 'WRITE_OFF',
        status: 'POSTED',
        amount: writeOff,
        reasonCode: 'APPROVED_WRITE_OFF',
        reason: String(writeOffReason).trim(),
        createdAt: effectiveAt || undefined,
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
  amount = 0,
  walletAmount = 0,
  method,
  reference,
  notes,
  writeOffAmount = 0,
  writeOffReason,
  staff,
  idempotencyKey,
  effectiveAt,
  razorpayOrderId,
  razorpayPaymentId,
  providerMethod,
  providerMethodDetail,
  mode,
  razorpaySignature,
  providerCaptureVerified = false,
}) => {
  assertSettlementMethodAllowed(method, { providerCaptureVerified });
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
  const externalAmount = roundMoney(Number(amount || 0));
  const storedValueAmount = roundMoney(Number(walletAmount || 0));
  const writeOff = roundMoney(Number(writeOffAmount || 0));
  const requestedSettlement = roundMoney(externalAmount + storedValueAmount + writeOff);
  if (!(requestedSettlement > 0)) {
    throw new PaymentRuleError('EMPTY_SETTLEMENT', 'A payment, wallet amount, or write-off is required');
  }
  if (requestedSettlement > Number(invoice.balanceDue || 0)) {
    throw new PaymentRuleError(
      'OVERPAYMENT_NOT_ALLOWED',
      `Settlement exceeds the outstanding balance of Rs ${Number(invoice.balanceDue || 0).toFixed(2)}. Record only the amount due.`
    );
  }
  if (externalAmount > 0 && !method) throw new PaymentRuleError('PAYMENT_METHOD_REQUIRED', 'Payment method is required');
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
      invoice.customerId,
      storedValueAmount,
      `Applied to invoice ${invoice.invoiceNumber}`,
      {
        tx,
        orderId: invoice.orderId || null,
        actorId: staff?.id,
        reasonCode: 'INVOICE_PAYMENT',
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:wallet-debit` : null,
      }
    );
    payments.push(await createCapturedPayment(tx, {
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      amount: storedValueAmount,
      method: 'WALLET',
      notes: notes || 'Wallet payment',
      staffId: staff?.id,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:wallet-payment` : null,
      effectiveAt,
    }));
  }

  if (externalAmount > 0) {
    payments.push(await createCapturedPayment(tx, {
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      amount: externalAmount,
      method,
      reference,
      notes,
      staffId: staff?.id,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:payment` : null,
      effectiveAt,
      razorpayOrderId,
      razorpayPaymentId,
      providerMethod,
      providerMethodDetail,
      mode,
      razorpaySignature,
    }));
  }

  let adjustment = null;
  if (writeOff > 0) {
    adjustment = await tx.financialAdjustment.create({
      data: {
        orderId: invoice.orderId || null,
        invoiceId: invoice.id,
        kind: 'WRITE_OFF',
        status: 'POSTED',
        amount: writeOff,
        reasonCode: 'APPROVED_WRITE_OFF',
        reason: String(writeOffReason).trim(),
        createdAt: effectiveAt || undefined,
        createdById: staff.id,
        approvedById: staff.id,
      },
    });
  }

  const synced = invoice.orderId
    ? await syncOrderPaymentState(tx, invoice.orderId)
    : { invoice: await syncInvoiceBalance(tx, invoice.id) };
  const syncedInvoice = synced.invoice || await syncInvoiceBalance(tx, invoice.id);
  return {
    payment: payments.filter(Boolean)[0] || null,
    payments: payments.filter(Boolean),
    adjustment,
    invoice: syncedInvoice,
    paidAmount: Number(syncedInvoice.paidAmount || 0),
    writeOffAmount: Number(syncedInvoice.writeOffAmount || writeOff || 0),
    creditAmount: Number(syncedInvoice.creditAmount || 0),
    balanceDue: Number(syncedInvoice.balanceDue || 0),
    paymentStatus: syncedInvoice.status === 'OPEN' ? 'UNPAID' : syncedInvoice.status,
    ...(synced.order ? { order: synced.order } : {}),
  };
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
  providerRefundId,
  mode,
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
  if (sourcePayment.razorpayPaymentId && !providerRefundId) {
    throw new PaymentRuleError(
      'RAZORPAY_REFUND_WORKFLOW_REQUIRED',
      'Razorpay-collected payments must be refunded through the provider refund workflow. No local refund was posted.',
      409
    );
  }
  if (providerRefundId && !sourcePayment.razorpayPaymentId) {
    throw new PaymentRuleError('REFUND_PROVIDER_SOURCE_MISMATCH', 'A provider refund can only be posted against its original Razorpay payment', 409);
  }

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
      ...(providerRefundId ? { razorpayRefundId: providerRefundId } : {}),
      ...(mode ? { mode } : {}),
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

const reverseOrderPaymentCorrection = async (tx, {
  orderId,
  paymentId,
  reason,
  staff,
}) => {
  const permissions = staff?.effectivePermissions || [];
  if (!permissions.includes('*') && !permissions.includes('finance.refund')) {
    throw new PaymentRuleError('PAYMENT_REVERSAL_APPROVAL_REQUIRED', 'Payment corrections require finance.refund authority', 403);
  }
  if (!reason || String(reason).trim().length < 3) {
    throw new PaymentRuleError('PAYMENT_REVERSAL_REASON_REQUIRED', 'A correction reason is required');
  }
  await lockOrder(tx, orderId);
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  const payment = await tx.payment.findFirst({
    where: {
      id: paymentId,
      orderId,
      kind: 'RECEIPT',
      status: { in: CAPTURED_PAYMENT_STATUSES },
    },
    include: {
      allocations: { where: { status: 'POSTED' } },
      receipt: true,
    },
  });
  if (!payment) {
    throw new PaymentRuleError('PAYMENT_NOT_REVERSIBLE', 'Captured receipt payment not found for this order', 404);
  }
  const refundCount = await tx.refundAllocation.count({
    where: {
      sourceAllocationId: { in: payment.allocations.map((allocation) => allocation.id) },
      status: 'POSTED',
    },
  });
  if (refundCount > 0) {
    throw new PaymentRuleError('PAYMENT_ALREADY_REFUNDED', 'This payment already has refund activity. Use the refund/credit-note workflow.');
  }

  const trimmedReason = String(reason).trim();
  const now = new Date();
  await tx.paymentAllocation.updateMany({
    where: { paymentId, status: 'POSTED' },
    data: {
      status: 'REVERSED',
      reversedAt: now,
      reason: trimmedReason,
    },
  });
  const reversedPayment = await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: 'VOIDED',
      reversedAt: now,
      reversalReason: trimmedReason,
    },
  });
  if (payment.receipt) {
    await tx.receipt.update({
      where: { id: payment.receipt.id },
      data: {
        status: 'VOID',
        voidedAt: now,
        voidReason: trimmedReason,
      },
    });
  }

  const synced = await syncOrderPaymentState(tx, orderId);
  await tx.orderStage.create({
    data: {
      orderId,
      stage: 'PAYMENT_ENTRY_VOIDED',
      eventType: 'FINANCIAL_CORRECTION',
      reasonCode: 'MISTAKEN_PAYMENT_ENTRY_VOIDED',
      notes: `Mistaken payment entry voided: Rs ${Number(payment.amount).toFixed(2)} ${payment.method}. No customer refund issued; order balance restored. ${trimmedReason}`,
      changedById: staff?.id || null,
      metadata: {
        paymentId,
        method: payment.method,
        amount: Number(payment.amount || 0),
        correctionType: 'INTERNAL_ENTRY_VOID',
        customerMoneyMovement: 'NONE',
        beforeStatus: payment.status,
        afterStatus: reversedPayment.status,
      },
    },
  });

  return { payment: reversedPayment, ...synced };
};

const reverseInvoicePaymentCorrection = async (tx, {
  invoiceId,
  paymentId,
  reason,
  staff,
}) => {
  const permissions = staff?.effectivePermissions || [];
  if (!permissions.includes('*') && !permissions.includes('finance.refund')) {
    throw new PaymentRuleError('PAYMENT_REVERSAL_APPROVAL_REQUIRED', 'Payment corrections require finance.refund authority', 403);
  }
  if (!reason || String(reason).trim().length < 3) {
    throw new PaymentRuleError('PAYMENT_REVERSAL_REASON_REQUIRED', 'A correction reason is required');
  }
  const invoiceRows = await tx.$queryRaw`
    SELECT "id"
    FROM "invoices"
    WHERE "id" = ${invoiceId}
    FOR UPDATE
  `;
  if (!invoiceRows.length) throw new PaymentRuleError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  const payment = await tx.payment.findFirst({
    where: {
      id: paymentId,
      kind: 'RECEIPT',
      status: { in: CAPTURED_PAYMENT_STATUSES },
      allocations: { some: { invoiceId, status: 'POSTED' } },
    },
    include: {
      allocations: { where: { invoiceId, status: 'POSTED' } },
      receipt: true,
    },
  });
  if (!payment) {
    throw new PaymentRuleError('PAYMENT_NOT_REVERSIBLE', 'Captured receipt payment not found for this invoice', 404);
  }
  const refundCount = await tx.refundAllocation.count({
    where: {
      sourceAllocationId: { in: payment.allocations.map((allocation) => allocation.id) },
      status: 'POSTED',
    },
  });
  if (refundCount > 0) {
    throw new PaymentRuleError('PAYMENT_ALREADY_REFUNDED', 'This payment already has refund activity. Use the refund/credit-note workflow.');
  }

  const trimmedReason = String(reason).trim();
  const now = new Date();
  await tx.paymentAllocation.updateMany({
    where: { paymentId, invoiceId, status: 'POSTED' },
    data: {
      status: 'REVERSED',
      reversedAt: now,
      reason: trimmedReason,
    },
  });
  const reversedPayment = await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: 'VOIDED',
      reversedAt: now,
      reversalReason: trimmedReason,
    },
  });
  if (payment.receipt) {
    await tx.receipt.update({
      where: { id: payment.receipt.id },
      data: {
        status: 'VOID',
        voidedAt: now,
        voidReason: trimmedReason,
      },
    });
  }

  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  const synced = invoice?.orderId
    ? await syncOrderPaymentState(tx, invoice.orderId)
    : { invoice: await syncInvoiceBalance(tx, invoiceId) };
  return {
    payment: reversedPayment,
    invoice: synced.invoice,
    ...(synced.order ? { order: synced.order } : {}),
  };
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
  assertSettlementMethodAllowed,
  creditOverpayment,
  getLedgerState,
  paymentReferenceFingerprint,
  recordInvoiceAllocationsSettlement,
  recordInvoiceSettlement,
  recordOrderRefund,
  reverseInvoicePaymentCorrection,
  reverseOrderPaymentCorrection,
  recordOrderSettlement,
  syncOrderPaymentState,
};
