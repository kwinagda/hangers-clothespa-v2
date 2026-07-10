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

    if (!order) return notFound(res, 'Invoice not found');

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
