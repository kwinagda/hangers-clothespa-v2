const prisma = require('../config/database');
const { success, notFound, error } = require('../utils/response');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { resolvePublicShareToken } = require('../services/publicShare.service');

const publicQuotationSelect = {
  id: true,
  orderNumber: true,
  quotationStatus: true,
  subtotal: true,
  discount: true,
  totalAmount: true,
  validUntil: true,
  notes: true,
  createdAt: true,
  customer: {
    select: {
      name: true,
    },
  },
  items: {
    select: {
      serviceName: true,
      garmentType: true,
      variant: true,
      quantity: true,
      unitPrice: true,
      lineDiscountAmount: true,
      subtotal: true,
      notes: true,
    },
    orderBy: { createdAt: 'asc' },
  },
};

const normalizePublicQuotation = (quotation) => {
  const items = Array.isArray(quotation?.items)
    ? quotation.items.map((item) => normalizeOrderItem(item, { defaultServiceName: item.serviceName || 'Service' }))
    : [];
  const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const discount = Math.max(0, Number.parseFloat(String(quotation?.discount ?? 0)) || 0);
  const totalAmount = roundMoney(Math.max(0, subtotal - discount));
  return {
    ...quotation,
    items,
    subtotal,
    discount,
    totalAmount,
  };
};

const canonicalInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  sourceType: true,
  status: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  totalAmount: true,
  paidAmount: true,
  balanceDue: true,
  customer: { select: { name: true } },
  order: {
    select: {
      orderNumber: true,
      status: true,
      pickupDate: true,
      deliveryDate: true,
      deliveredAt: true,
    },
  },
  ironBill: {
    select: {
      billNumber: true,
      status: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
      paidAt: true,
    },
  },
  lines: {
    select: {
      lineType: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      lineTotal: true,
      metadata: true,
    },
    orderBy: { createdAt: 'asc' },
  },
};

const normalizeCanonicalInvoice = (invoice) => {
  const source = invoice.order || invoice.ironBill || {};
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.sourceType,
    orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.invoiceNumber,
    status: source.status || invoice.status,
    subtotal: invoice.subtotal,
    discount: invoice.discountAmount,
    couponDiscount: 0,
    upcharge: 0,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    writeOffAmount: Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0) - Number(invoice.balanceDue || 0)),
    paymentStatus: invoice.status === 'PAID' ? 'PAID' : Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
    pickupDate: invoice.order?.pickupDate || invoice.ironBill?.billingPeriodStart || invoice.issueDate,
    deliveryDate: invoice.order?.deliveryDate || invoice.ironBill?.billingPeriodEnd || invoice.dueDate,
    deliveredAt: invoice.order?.deliveredAt || invoice.ironBill?.paidAt || null,
    createdAt: invoice.issueDate,
    dueDate: invoice.dueDate,
    customer: invoice.customer,
    items: invoice.lines.map((line) => ({
      serviceName: line.description,
      garmentType: line.lineType,
      variant: null,
      quantity: Number(line.quantity || 0),
      unitPrice: line.unitPrice,
      lineDiscountAmount: line.discountAmount,
      subtotal: line.lineTotal,
    })),
    balanceDue: invoice.balanceDue,
  };
};

const startOfMonth = (value) => new Date(value.getFullYear(), value.getMonth(), 1);

const endOfMonth = (value) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getPublicDailyIronLogs = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Daily Iron account not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'DAILY_IRON_LOGS' });
    if (!share || share.resourceType !== 'IRON_SUBSCRIPTION') return notFound(res, 'Daily Iron account not found');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const today = new Date();
    const periodStart = month && year ? new Date(year, month - 1, 1) : startOfMonth(today);
    if (Number.isNaN(periodStart.getTime())) return notFound(res, 'Daily Iron account not found');
    const periodEnd = endOfMonth(periodStart);

    const subscription = await prisma.ironSubscription.findFirst({
      where: { id: share.resourceId },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!subscription) return notFound(res, 'Daily Iron account not found');

    const [logs, bills] = await Promise.all([
      prisma.ironLog.findMany({
        where: {
          customerId: subscription.customerId,
          status: 'ACTIVE',
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          serviceName: true,
          date: true,
          pieces: true,
          ratePerPiece: true,
          amount: true,
          notes: true,
          bill: { select: { id: true, billNumber: true, status: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.ironBill.findMany({
        where: { customerId: subscription.customerId },
        select: {
          id: true,
          billNumber: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          totalPieces: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
        },
        orderBy: [{ billingPeriodStart: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      }),
    ]);

    const totals = logs.reduce((acc, log) => {
      acc.pieces += Number(log.pieces || 0);
      acc.amount += Number(log.amount || 0);
      return acc;
    }, { pieces: 0, amount: 0 });

    return success(res, {
      dailyIron: {
        subscription: {
          id: subscription.id,
          status: subscription.applicationStatus,
          appliedAt: subscription.appliedAt,
          confirmedAt: subscription.confirmedAt,
        },
        customer: subscription.customer,
        period: {
          start: periodStart,
          end: periodEnd,
          month: periodStart.getMonth() + 1,
          year: periodStart.getFullYear(),
        },
        logs,
        totals: {
          pieces: totals.pieces,
          amount: Number(totals.amount.toFixed(2)),
        },
        bills,
      },
    });
  } catch (err) {
    console.error('getPublicDailyIronLogs error:', err);
    return error(res, 'Failed to load Daily Iron logs');
  }
};

const getPublicInvoice = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Invoice not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'INVOICE_VIEW' });
    if (!share) return notFound(res, 'Invoice not found');

    const where = share.resourceType === 'INVOICE'
      ? { id: share.resourceId }
      : share.resourceType === 'IRON_BILL'
        ? { ironBillId: share.resourceId }
        : share.resourceType === 'ORDER'
          ? { orderId: share.resourceId }
          : null;
    if (!where) return notFound(res, 'Invoice not found');

    const invoice = await prisma.invoice.findFirst({ where, select: canonicalInvoiceSelect });
    if (!invoice || invoice.status === 'VOID') return notFound(res, 'Invoice not found');
    return success(res, { invoice: normalizeCanonicalInvoice(invoice) });
  } catch (err) {
    console.error('getPublicInvoice error:', err);
    return error(res, 'Failed to load invoice');
  }
};

const getPublicQuotation = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Quotation not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'QUOTATION_VIEW' });
    if (!share || share.resourceType !== 'QUOTATION') return notFound(res, 'Quotation not found');

    const quotation = await prisma.order.findFirst({
      where: {
        id: share.resourceId,
        documentType: 'QUOTATION',
      },
      select: publicQuotationSelect,
    });
    if (!quotation) return notFound(res, 'Quotation not found');

    return success(res, { quotation: normalizePublicQuotation(quotation) });
  } catch (err) {
    console.error('getPublicQuotation error:', err);
    return error(res, 'Failed to load quotation');
  }
};

module.exports = {
  getPublicInvoice,
  getPublicDailyIronLogs,
  getPublicQuotation,
};
