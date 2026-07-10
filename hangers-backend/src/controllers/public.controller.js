const prisma = require('../config/database');
const { success, notFound, error } = require('../utils/response');

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

    return success(res, {
      invoice: {
        ...order,
        balanceDue: Math.max(
          0,
          Number(order.totalAmount || 0) - Number(order.paidAmount || 0) - Number(order.writeOffAmount || 0)
        ),
      },
    });
  } catch (err) {
    console.error('getPublicInvoice error:', err);
    return error(res, 'Failed to load invoice');
  }
};

module.exports = {
  getPublicInvoice,
};
