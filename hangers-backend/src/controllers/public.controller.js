const prisma = require('../config/database');
const { success, notFound, error } = require('../utils/response');
const { withDerivedPaymentState } = require('../utils/order-payment-state');

const publicOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  discount: true,
  couponDiscount: true,
  upcharge: true,
  totalAmount: true,
  paidAmount: true,
  writeOffAmount: true,
  paymentStatus: true,
  pickupDate: true,
  deliveryDate: true,
  deliveredAt: true,
  createdAt: true,
  customer: {
    select: {
      name: true,
      phone: true,
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
    },
    orderBy: { createdAt: 'asc' },
  },
  payments: {
    select: {
      amount: true,
      method: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
};

const publicIronBillSelect = {
  id: true,
  billNumber: true,
  billingPeriodStart: true,
  billingPeriodEnd: true,
  totalPieces: true,
  totalAmount: true,
  paidAmount: true,
  status: true,
  paymentMethod: true,
  paidAt: true,
  createdAt: true,
  customer: {
    select: {
      name: true,
      phone: true,
    },
  },
  logs: {
    select: {
      serviceName: true,
      date: true,
      pieces: true,
      ratePerPiece: true,
      amount: true,
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  },
};

const normalizeIronBillInvoice = (bill) => {
  const balanceDue = Math.max(0, Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0));
  return {
    id: bill.id,
    invoiceType: 'IRON_BILL',
    orderNumber: bill.billNumber,
    status: bill.status,
    subtotal: bill.totalAmount,
    discount: 0,
    couponDiscount: 0,
    upcharge: 0,
    totalAmount: bill.totalAmount,
    paidAmount: bill.paidAmount,
    writeOffAmount: 0,
    paymentStatus: balanceDue <= 0 ? 'PAID' : Number(bill.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
    pickupDate: bill.billingPeriodStart,
    deliveryDate: bill.billingPeriodEnd,
    deliveredAt: bill.paidAt,
    createdAt: bill.createdAt,
    customer: bill.customer,
    items: (bill.logs || []).map((log) => ({
      serviceName: 'Daily Iron',
      garmentType: log.serviceName,
      variant: log.date,
      quantity: log.pieces,
      unitPrice: log.ratePerPiece,
      lineDiscountAmount: 0,
      subtotal: log.amount,
    })),
    payments: Number(bill.paidAmount || 0) > 0
      ? [{
          amount: bill.paidAmount,
          method: bill.paymentMethod || 'CASH',
          createdAt: bill.paidAt || bill.createdAt,
        }]
      : [],
    balanceDue,
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

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const today = new Date();
    const periodStart = month && year ? new Date(year, month - 1, 1) : startOfMonth(today);
    if (Number.isNaN(periodStart.getTime())) return notFound(res, 'Daily Iron account not found');
    const periodEnd = endOfMonth(periodStart);

    const subscription = await prisma.ironSubscription.findFirst({
      where: {
        OR: [
          { id: slug },
          { customerId: slug },
        ],
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });
    if (!subscription) return notFound(res, 'Daily Iron account not found');

    const [logs, bills] = await Promise.all([
      prisma.ironLog.findMany({
        where: {
          customerId: subscription.customerId,
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

    const order = await prisma.order.findFirst({
      where: {
        documentType: 'ORDER',
        OR: [
          { orderNumber: slug },
          { id: slug },
        ],
      },
      select: publicOrderSelect,
    });

    if (!order) {
      const bill = await prisma.ironBill.findFirst({
        where: {
          OR: [
            { billNumber: slug },
            { id: slug },
          ],
        },
        select: publicIronBillSelect,
      });
      if (!bill) return notFound(res, 'Invoice not found');
      return success(res, { invoice: normalizeIronBillInvoice(bill) });
    }

    return success(res, { invoice: withDerivedPaymentState(order) });
  } catch (err) {
    console.error('getPublicInvoice error:', err);
    return error(res, 'Failed to load invoice');
  }
};

module.exports = {
  getPublicInvoice,
  getPublicDailyIronLogs,
};
