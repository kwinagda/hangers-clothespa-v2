const { nextDocumentNumber } = require('./document-number.service');
const { roundMoney } = require('../utils/line-pricing');

const CAPTURED_PAYMENT_STATUSES = ['CAPTURED', 'SUCCESS', 'PAID'];
const DEFAULT_PAYMENT_TERMS_DAYS = 7;

class BillingRuleError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'BillingRuleError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const orderDueDate = (order, issueDate, termsDays) => {
  const termsDue = addDays(issueDate, termsDays);
  if (!order.deliveryDate) return termsDue;
  const deliveryDue = new Date(order.deliveryDate);
  return deliveryDue > issueDate ? deliveryDue : termsDue;
};

const invoiceNumber = (tx) => nextDocumentNumber({
  tx,
  documentType: 'INVOICE',
  prefix: 'INV-',
  padding: 6,
});

const orderLineData = (item) => ({
  orderItemId: item.id,
  lineType: 'SERVICE',
  description: [item.serviceName, item.variant, item.garmentType].filter(Boolean).join(' - '),
  quantity: item.quantity,
  unitPrice: Number(item.unitPrice || 0),
  discountAmount: Number(item.lineDiscountAmount || 0),
  taxAmount: 0,
  lineTotal: Number(item.subtotal || 0),
  metadata: {
    serviceId: item.serviceId || null,
    baseUnitPrice: Number(item.baseUnitPrice || item.unitPrice || 0),
    priceSource: item.priceSource || 'CATALOG',
    upcharges: item.upcharges || null,
    notes: item.notes || null,
  },
});

const ironLineData = (log) => ({
  lineType: 'DAILY_IRON_USAGE',
  description: `${log.service?.name || 'Daily Iron'} - ${new Date(log.date).toISOString().slice(0, 10)}`,
  quantity: log.pieces,
  unitPrice: Number(log.ratePerPiece || 0),
  discountAmount: 0,
  taxAmount: 0,
  lineTotal: Number(log.amount || 0),
  metadata: {
    ironLogId: log.id,
    serviceId: log.serviceId,
    serviceDate: new Date(log.date).toISOString(),
  },
});

const revisionSnapshot = (invoice) => ({
  invoiceNumber: invoice.invoiceNumber,
  sourceType: invoice.sourceType,
  status: invoice.status,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  subtotal: Number(invoice.subtotal || 0),
  discountAmount: Number(invoice.discountAmount || 0),
  taxAmount: Number(invoice.taxAmount || 0),
  totalAmount: Number(invoice.totalAmount || 0),
  paidAmount: Number(invoice.paidAmount || 0),
  creditAmount: Number(invoice.creditAmount || 0),
  balanceDue: Number(invoice.balanceDue || 0),
  paymentTermsDays: invoice.paymentTermsDays,
  lines: (invoice.lines || []).map((line) => ({
    orderItemId: line.orderItemId,
    lineType: line.lineType,
    description: line.description,
    quantity: Number(line.quantity || 0),
    unitPrice: Number(line.unitPrice || 0),
    discountAmount: Number(line.discountAmount || 0),
    taxAmount: Number(line.taxAmount || 0),
    lineTotal: Number(line.lineTotal || 0),
    metadata: line.metadata || null,
  })),
});

const storeRevision = async (tx, invoice, reason, actorId) => tx.invoiceRevision.create({
  data: {
    invoiceId: invoice.id,
    version: invoice.version,
    reason,
    snapshot: revisionSnapshot(invoice),
    createdById: actorId || null,
  },
});

const getInvoiceSettlement = async (tx, invoice) => {
  const [allocated, refunded, credits, adjustments] = await Promise.all([
    tx.paymentAllocation.aggregate({
      where: {
        invoiceId: invoice.id,
        status: 'POSTED',
        payment: {
          kind: 'RECEIPT',
          status: { in: CAPTURED_PAYMENT_STATUSES },
        },
      },
      _sum: { amount: true },
    }),
    tx.refundAllocation.aggregate({
      where: {
        invoiceId: invoice.id,
        status: 'POSTED',
        refundPayment: { kind: 'REFUND', status: { in: CAPTURED_PAYMENT_STATUSES } },
      },
      _sum: { amount: true },
    }),
    tx.creditNote.aggregate({
      where: { invoiceId: invoice.id, status: 'POSTED' },
      _sum: { amount: true },
    }),
    invoice.orderId
      ? tx.financialAdjustment.aggregate({
          where: { orderId: invoice.orderId, kind: 'WRITE_OFF', status: 'POSTED' },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
  ]);
  return {
    paidAmount: roundMoney(Math.max(0, Number(allocated._sum.amount || 0) - Number(refunded._sum.amount || 0))),
    refundedAmount: roundMoney(Number(refunded._sum.amount || 0)),
    creditAmount: roundMoney(Number(credits._sum.amount || 0)),
    writeOffAmount: roundMoney(Number(adjustments._sum.amount || 0)),
  };
};

const syncInvoiceBalance = async (tx, invoiceId) => {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new BillingRuleError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
  const settlement = await getInvoiceSettlement(tx, invoice);
  const totalAmount = roundMoney(Number(invoice.totalAmount || 0));
  const balanceDue = roundMoney(Math.max(0, totalAmount - settlement.creditAmount - settlement.paidAmount - settlement.writeOffAmount));
  const status = invoice.voidedAt
    ? 'VOID'
    : settlement.creditAmount >= totalAmount && settlement.paidAmount <= 0
      ? 'CREDITED'
    : balanceDue <= 0
      ? 'PAID'
      : settlement.paidAmount > 0 || settlement.writeOffAmount > 0
        ? 'PARTIAL'
        : 'OPEN';

  const updated = await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: settlement.paidAmount,
      creditAmount: settlement.creditAmount,
      balanceDue,
      status,
    },
  });

  if (invoice.ironBillId) {
    await tx.ironBill.update({
      where: { id: invoice.ironBillId },
      data: {
        paidAmount: settlement.paidAmount,
        paidAt: status === 'PAID' ? new Date() : null,
        status: status === 'OPEN' ? 'SENT' : status,
      },
    });
  }

  return { ...updated, refundedAmount: settlement.refundedAmount, writeOffAmount: settlement.writeOffAmount };
};

const createOrderInvoice = async (tx, order, actorId) => {
  if (order.isReturn) {
    throw new BillingRuleError('RETURN_CREDIT_NOTE_REQUIRED', 'Return orders require a credit note, not a sales invoice');
  }
  const issueDate = order.createdAt || new Date();
  const paymentTermsDays = DEFAULT_PAYMENT_TERMS_DAYS;
  const discountAmount = roundMoney(
    Number(order.discount || 0) + Number(order.couponDiscount || 0) + Number(order.loyaltyDiscount || 0)
  );
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await invoiceNumber(tx),
      customerId: order.customerId,
      orderId: order.id,
      sourceType: 'ORDER',
      status: 'OPEN',
      issueDate,
      dueDate: orderDueDate(order, issueDate, paymentTermsDays),
      subtotal: Number(order.subtotal || 0),
      discountAmount,
      taxAmount: 0,
      totalAmount: Number(order.totalAmount || 0),
      paidAmount: 0,
      balanceDue: Number(order.totalAmount || 0),
      paymentTermsDays,
      postedAt: new Date(),
      createdById: actorId || null,
      postedById: actorId || null,
      lines: { create: order.items.map(orderLineData) },
    },
    include: { lines: true },
  });
  return syncInvoiceBalance(tx, invoice.id);
};

const ensureOrderInvoice = async (tx, orderId, actorId = null) => {
  const order = await tx.order.findFirst({
    where: { id: orderId, documentType: 'ORDER' },
    include: { items: { orderBy: { createdAt: 'asc' } }, invoice: { include: { lines: true } } },
  });
  if (!order) throw new BillingRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
  if (order.invoice) return order.invoice;
  return createOrderInvoice(tx, order, actorId);
};

const refreshOrderInvoice = async (tx, orderId, actorId, reason = 'ORDER_REPRICED') => {
  const order = await tx.order.findFirst({
    where: { id: orderId, documentType: 'ORDER' },
    include: { items: { orderBy: { createdAt: 'asc' } }, invoice: { include: { lines: true } } },
  });
  if (!order) throw new BillingRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
  if (!order.invoice) return createOrderInvoice(tx, order, actorId);
  if (order.invoice.voidedAt) throw new BillingRuleError('INVOICE_VOID', 'A void invoice cannot be changed');

  const settlement = await getInvoiceSettlement(tx, order.invoice);
  if (Number(order.totalAmount || 0) + 0.005 < settlement.paidAmount + settlement.creditAmount + settlement.writeOffAmount) {
    throw new BillingRuleError('INVOICE_BELOW_SETTLEMENT', 'Invoice total cannot be reduced below its settled value');
  }

  await storeRevision(tx, order.invoice, reason, actorId);
  await tx.invoiceLine.deleteMany({ where: { invoiceId: order.invoice.id } });
  const discountAmount = roundMoney(
    Number(order.discount || 0) + Number(order.couponDiscount || 0) + Number(order.loyaltyDiscount || 0)
  );
  await tx.invoice.update({
    where: { id: order.invoice.id },
    data: {
      dueDate: orderDueDate(order, order.invoice.issueDate, order.invoice.paymentTermsDays),
      subtotal: Number(order.subtotal || 0),
      discountAmount,
      totalAmount: Number(order.totalAmount || 0),
      balanceDue: roundMoney(Number(order.totalAmount || 0) - settlement.paidAmount - settlement.creditAmount - settlement.writeOffAmount),
      version: { increment: 1 },
      lines: { create: order.items.map(orderLineData) },
    },
  });
  return syncInvoiceBalance(tx, order.invoice.id);
};

const createIronBillInvoice = async (tx, bill, actorId) => {
  const issueDate = bill.billingPeriodEnd || new Date();
  const paymentTermsDays = DEFAULT_PAYMENT_TERMS_DAYS;
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await invoiceNumber(tx),
      customerId: bill.customerId,
      ironBillId: bill.id,
      sourceType: 'DAILY_IRON',
      status: 'OPEN',
      issueDate,
      dueDate: addDays(issueDate, paymentTermsDays),
      subtotal: Number(bill.totalAmount || 0),
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: Number(bill.totalAmount || 0),
      paidAmount: 0,
      balanceDue: Number(bill.totalAmount || 0),
      paymentTermsDays,
      postedAt: new Date(),
      createdById: actorId || null,
      postedById: actorId || null,
      lines: { create: bill.logs.map(ironLineData) },
    },
  });
  return syncInvoiceBalance(tx, invoice.id);
};

const ensureIronBillInvoice = async (tx, billId, actorId = null) => {
  const bill = await tx.ironBill.findUnique({
    where: { id: billId },
    include: {
      logs: { include: { service: { select: { id: true, name: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
      invoice: { include: { lines: true } },
    },
  });
  if (!bill) throw new BillingRuleError('IRON_BILL_NOT_FOUND', 'Daily Iron bill not found', 404);
  if (bill.invoice) return bill.invoice;
  return createIronBillInvoice(tx, bill, actorId);
};

const refreshIronBillInvoice = async (tx, billId, actorId, reason = 'DAILY_IRON_BILL_REGENERATED') => {
  const bill = await tx.ironBill.findUnique({
    where: { id: billId },
    include: {
      logs: { include: { service: { select: { id: true, name: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
      invoice: { include: { lines: true } },
    },
  });
  if (!bill) throw new BillingRuleError('IRON_BILL_NOT_FOUND', 'Daily Iron bill not found', 404);
  if (!bill.invoice) return createIronBillInvoice(tx, bill, actorId);
  const settlement = await getInvoiceSettlement(tx, bill.invoice);
  if (settlement.paidAmount > 0) {
    throw new BillingRuleError('PAID_INVOICE_REBILL_REQUIRED', 'A paid Daily Iron invoice must be corrected with void/rebill or a credit note');
  }
  await storeRevision(tx, bill.invoice, reason, actorId);
  await tx.invoiceLine.deleteMany({ where: { invoiceId: bill.invoice.id } });
  await tx.invoice.update({
    where: { id: bill.invoice.id },
    data: {
      issueDate: bill.billingPeriodEnd,
      dueDate: addDays(bill.billingPeriodEnd, bill.invoice.paymentTermsDays),
      subtotal: Number(bill.totalAmount || 0),
      totalAmount: Number(bill.totalAmount || 0),
      balanceDue: Number(bill.totalAmount || 0),
      version: { increment: 1 },
      lines: { create: bill.logs.map(ironLineData) },
    },
  });
  return syncInvoiceBalance(tx, bill.invoice.id);
};

module.exports = {
  BillingRuleError,
  CAPTURED_PAYMENT_STATUSES,
  ensureIronBillInvoice,
  ensureOrderInvoice,
  refreshIronBillInvoice,
  refreshOrderInvoice,
  syncInvoiceBalance,
};
