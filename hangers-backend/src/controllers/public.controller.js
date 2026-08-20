const prisma = require('../config/database');
const { success, notFound, error } = require('../utils/response');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { compareServiceDisplay } = require('../utils/service-sort');
const { resolvePublicShareToken } = require('../services/publicShare.service');
const { getLegalTerms, getServiceCategoryUi } = require('../services/masterData.service');

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

const normalizeCategoryDisplay = (category, categoryUi = {}) => {
  const fallbackLabel = String(category || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const meta = categoryUi?.[category] || {};
  return {
    id: meta.id || String(category || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    key: category,
    label: meta.label || fallbackLabel || 'Services',
    color: meta.color || '#023c62',
    lightColor: meta.lightColor || '#E8F0F7',
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
  customer: { select: { name: true, phone: true } },
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
  serviceAppointment: {
    select: {
      appointmentNumber: true,
      status: true,
      scheduledAt: true,
      completedAt: true,
      addressSnapshot: true,
      address: true,
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
  const source = invoice.order || invoice.ironBill || invoice.serviceAppointment || {};
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.sourceType,
    orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.serviceAppointment?.appointmentNumber || invoice.invoiceNumber,
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
    pickupDate: invoice.order?.pickupDate || invoice.ironBill?.billingPeriodStart || invoice.serviceAppointment?.scheduledAt || invoice.issueDate,
    deliveryDate: invoice.order?.deliveryDate || invoice.ironBill?.billingPeriodEnd || invoice.serviceAppointment?.completedAt || invoice.dueDate,
    deliveredAt: invoice.order?.deliveredAt || invoice.ironBill?.paidAt || invoice.serviceAppointment?.completedAt || null,
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

const getPublicPaymentSummary = async (customerId, legalTerms) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId,
      status: { not: 'VOID' },
      balanceDue: { gt: 0 },
    },
    select: canonicalInvoiceSelect,
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
  });
  const receivables = invoices.map(normalizeCanonicalInvoice);
  const customer = receivables[0]?.customer || await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, phone: true },
  });
  const totals = receivables.reduce((acc, invoice) => {
    acc.totalAmount += Number(invoice.totalAmount || 0);
    acc.paidAmount += Number(invoice.paidAmount || 0);
    acc.balanceDue += Number(invoice.balanceDue || 0);
    return acc;
  }, { totalAmount: 0, paidAmount: 0, balanceDue: 0 });
  return {
    customer,
    legalTerms,
    generatedAt: new Date(),
    invoiceCount: receivables.length,
    totals: {
      totalAmount: roundMoney(totals.totalAmount),
      paidAmount: roundMoney(totals.paidAmount),
      balanceDue: roundMoney(totals.balanceDue),
    },
    receivables: receivables.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sourceType: invoice.invoiceType,
      sourceNumber: invoice.orderNumber,
      status: invoice.status,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      items: invoice.items,
    })),
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

    if (share.resourceType === 'CUSTOMER') {
      const paymentSummary = await getPublicPaymentSummary(share.resourceId, await getLegalTerms());
      if (!paymentSummary.customer) return notFound(res, 'Payment summary not found');
      return success(res, { paymentSummary });
    }

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
    return success(res, { invoice: { ...normalizeCanonicalInvoice(invoice), legalTerms: await getLegalTerms() } });
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

    return success(res, { quotation: { ...normalizePublicQuotation(quotation), legalTerms: await getLegalTerms() } });
  } catch (err) {
    console.error('getPublicQuotation error:', err);
    return error(res, 'Failed to load quotation');
  }
};

const getPublicRateChart = async (_req, res) => {
  try {
    const [services, categoryUi] = await Promise.all([
      prisma.service.findMany({
        where: {
          isActive: true,
          basePrice: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          sortOrder: true,
        },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      getServiceCategoryUi(),
    ]);

    const categoryRank = new Map(Object.keys(categoryUi || {}).map((category, index) => [category, index]));
    const grouped = new Map();
    services.forEach((service) => {
      if (!grouped.has(service.category)) grouped.set(service.category, []);
      grouped.get(service.category).push({
        id: service.id,
        name: service.name,
        price: Number(service.basePrice || 0),
        sortOrder: service.sortOrder,
      });
    });

    const categories = Array.from(grouped.entries())
      .map(([category, items]) => ({
        ...normalizeCategoryDisplay(category, categoryUi),
        items: [...items].sort(compareServiceDisplay),
      }))
      .sort((a, b) => {
        const aRank = categoryRank.has(a.key) ? categoryRank.get(a.key) : Number.MAX_SAFE_INTEGER;
        const bRank = categoryRank.has(b.key) ? categoryRank.get(b.key) : Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.label.localeCompare(b.label);
      });

    return success(res, {
      rateChart: {
        generatedAt: new Date(),
        categories,
        totalItems: services.length,
      },
    });
  } catch (err) {
    console.error('getPublicRateChart error:', err);
    return error(res, 'Failed to load rate chart');
  }
};

module.exports = {
  getPublicInvoice,
  getPublicDailyIronLogs,
  getPublicQuotation,
  getPublicRateChart,
};
