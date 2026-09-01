const { nextDocumentNumber } = require('./document-number.service');
const { getFieldServiceWorkflow } = require('./masterData.service');
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

const fieldServiceLineData = (appointmentLine, appointment) => ({
  lineType: 'FIELD_SERVICE',
  description: appointmentLine.description,
  quantity: Number(appointmentLine.quantity || 0),
  unitPrice: Number(appointmentLine.unitPrice || 0),
  discountAmount: Number(appointmentLine.discountAmount || 0),
  taxAmount: 0,
  lineTotal: Number(appointmentLine.lineTotal || 0),
  metadata: {
    serviceAppointmentId: appointment.id,
    serviceAppointmentLineId: appointmentLine.id,
    serviceId: appointmentLine.serviceId || null,
    lineDiscountType: appointmentLine.lineDiscountType || null,
    lineDiscountValue: Number(appointmentLine.lineDiscountValue || 0),
    scheduledAt: appointment.scheduledAt ? new Date(appointment.scheduledAt).toISOString() : null,
    completedAt: appointment.completedAt ? new Date(appointment.completedAt).toISOString() : null,
    lineMetadata: appointmentLine.metadata || null,
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
    tx.financialAdjustment.aggregate({
      where: {
        kind: 'WRITE_OFF',
        status: 'POSTED',
        OR: [
          { invoiceId: invoice.id },
          ...(invoice.orderId ? [{ orderId: invoice.orderId }] : []),
        ],
      },
      _sum: { amount: true },
    }),
  ]);
  return {
    paidAmount: roundMoney(Math.max(0, Number(allocated._sum.amount || 0) - Number(refunded._sum.amount || 0))),
    refundedAmount: roundMoney(Number(refunded._sum.amount || 0)),
    creditAmount: roundMoney(Number(credits._sum.amount || 0)),
    writeOffAmount: roundMoney(Number(adjustments._sum.amount || 0)),
  };
};

const resolveIronBillStatusAfterInvoiceSync = (invoiceStatus, currentBillStatus) => {
  const normalizedInvoiceStatus = String(invoiceStatus || '').toUpperCase();
  const normalizedBillStatus = String(currentBillStatus || '').toUpperCase();

  if (normalizedInvoiceStatus === 'OPEN') {
    return normalizedBillStatus === 'DRAFT' ? 'DRAFT' : 'SENT';
  }
  return normalizedInvoiceStatus;
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
    const ironBill = await tx.ironBill.findUnique({
      where: { id: invoice.ironBillId },
      select: { status: true },
    });
    await tx.ironBill.update({
      where: { id: invoice.ironBillId },
      data: {
        paidAmount: settlement.paidAmount,
        paidAt: status === 'PAID' ? new Date() : null,
        status: resolveIronBillStatusAfterInvoiceSync(status, ironBill?.status),
      },
    });
  }

  if (invoice.serviceAppointmentId) {
    const workflow = await getFieldServiceWorkflow();
    await tx.serviceAppointment.update({
      where: { id: invoice.serviceAppointmentId },
      data: {
        status: status === 'PAID' ? 'PAID' : (workflow.payableStatuses || ['INVOICED'])[0],
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
  if (String(bill.status || '').toUpperCase() === 'VOID') {
    throw new BillingRuleError('IRON_BILL_VOID', 'This Daily Iron bill is voided and cannot be used for payment or sending');
  }
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
  if (String(bill.status || '').toUpperCase() === 'VOID') {
    throw new BillingRuleError('IRON_BILL_VOID', 'This Daily Iron bill is voided and cannot be regenerated');
  }
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

const voidIronBillInvoice = async (tx, billId, actorId, reason) => {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) {
    throw new BillingRuleError('BILL_VOID_REASON_REQUIRED', 'A void reason is required');
  }

  await tx.$queryRaw`SELECT "id" FROM "iron_bills" WHERE "id" = ${billId} FOR UPDATE`;
  const bill = await tx.ironBill.findUnique({
    where: { id: billId },
    include: {
      invoice: {
        include: {
          lines: true,
          allocations: { where: { status: 'POSTED' } },
          creditNotes: { where: { status: 'POSTED' } },
          refundAllocations: { where: { status: 'POSTED' } },
          financialAdjustments: { where: { status: 'POSTED' } },
        },
      },
      logs: { select: { id: true, status: true } },
    },
  });
  if (!bill) throw new BillingRuleError('IRON_BILL_NOT_FOUND', 'Daily Iron bill not found', 404);
  if (String(bill.status || '').toUpperCase() === 'VOID') {
    throw new BillingRuleError('IRON_BILL_ALREADY_VOID', 'Daily Iron bill is already voided');
  }

  const invoice = bill.invoice;
  const hasSettlement = Number(bill.paidAmount || 0) > 0
    || Number(invoice?.paidAmount || 0) > 0
    || Number(invoice?.creditAmount || 0) > 0
    || (invoice?.allocations || []).length > 0
    || (invoice?.creditNotes || []).length > 0
    || (invoice?.refundAllocations || []).length > 0
    || (invoice?.financialAdjustments || []).length > 0;

  if (hasSettlement) {
    throw new BillingRuleError(
      'IRON_BILL_HAS_SETTLEMENT',
      'Void the payment, credit, or write-off entries first, then void this Daily Iron bill'
    );
  }

  if (invoice) {
    await storeRevision(tx, invoice, 'DAILY_IRON_BILL_VOIDED', actorId);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidReason: cleanReason,
        balanceDue: 0,
        version: { increment: 1 },
      },
    });
  }

  await tx.ironLog.updateMany({
    where: { billId: bill.id },
    data: { billId: null },
  });

  const voidedBill = await tx.ironBill.update({
    where: { id: bill.id },
    data: {
      status: 'VOID',
      paidAmount: 0,
      paidAt: null,
      notes: [bill.notes, `Voided: ${cleanReason}`].filter(Boolean).join('\n'),
    },
    include: { invoice: true, logs: true },
  });

  return {
    bill: voidedBill,
    invoiceId: invoice?.id || null,
    invoiceNumber: invoice?.invoiceNumber || null,
    releasedLogCount: bill.logs.length,
  };
};

const createServiceAppointmentInvoice = async (tx, appointment, actorId) => {
  const workflow = await getFieldServiceWorkflow();
  if (!(workflow.invoiceableStatuses || []).includes(appointment.status)) {
    throw new BillingRuleError('SERVICE_NOT_COMPLETE', 'Complete the service before creating an invoice');
  }
  if (!Array.isArray(appointment.lines) || !appointment.lines.length) {
    throw new BillingRuleError('FIELD_SERVICE_LINES_REQUIRED', 'Field service invoice requires saved appointment line items');
  }
  const issueDate = appointment.completedAt || new Date();
  const paymentTermsDays = DEFAULT_PAYMENT_TERMS_DAYS;
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await invoiceNumber(tx),
      customerId: appointment.customerId,
      serviceAppointmentId: appointment.id,
      sourceType: 'FIELD_SERVICE',
      status: 'OPEN',
      issueDate,
      dueDate: addDays(issueDate, paymentTermsDays),
      subtotal: Number(appointment.subtotal || appointment.totalAmount || 0),
      discountAmount: Number(appointment.discountAmount || 0),
      taxAmount: 0,
      totalAmount: Number(appointment.totalAmount || 0),
      paidAmount: 0,
      balanceDue: Number(appointment.totalAmount || 0),
      paymentTermsDays,
      postedAt: new Date(),
      createdById: actorId || null,
      postedById: actorId || null,
      lines: { create: appointment.lines.map((line) => fieldServiceLineData(line, appointment)) },
    },
  });
  await tx.serviceAppointment.update({
    where: { id: appointment.id },
    data: { status: (workflow.payableStatuses || ['INVOICED'])[0] },
  });
  return syncInvoiceBalance(tx, invoice.id);
};

const ensureServiceAppointmentInvoice = async (tx, appointmentId, actorId = null) => {
  const appointment = await tx.serviceAppointment.findUnique({
    where: { id: appointmentId },
    include: { lines: true, invoice: { include: { lines: true } } },
  });
  if (!appointment) throw new BillingRuleError('SERVICE_APPOINTMENT_NOT_FOUND', 'Service appointment not found', 404);
  if (appointment.invoice) return appointment.invoice;
  return createServiceAppointmentInvoice(tx, appointment, actorId);
};

module.exports = {
  BillingRuleError,
  CAPTURED_PAYMENT_STATUSES,
  ensureIronBillInvoice,
  ensureOrderInvoice,
  ensureServiceAppointmentInvoice,
  refreshIronBillInvoice,
  refreshOrderInvoice,
  resolveIronBillStatusAfterInvoiceSync,
  syncInvoiceBalance,
  voidIronBillInvoice,
};
