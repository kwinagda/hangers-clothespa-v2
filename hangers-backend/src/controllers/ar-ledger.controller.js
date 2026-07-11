const prisma = require('../config/database');
const { error } = require('../utils/response');
const { deriveOrderPaymentState, withDerivedPaymentState } = require('../utils/order-payment-state');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const getARLedger = async (req, res) => {
  try {
    const allOrders = await prisma.order.findMany({
      where: ORDER_ONLY_WHERE,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: 'asc' }
    });
    const orders = allOrders.filter((order) => deriveOrderPaymentState(order).balanceDue > 0);

    const now = new Date();
    const ledger = orders.map(o => {
      const paymentState = deriveOrderPaymentState(o);
      return ({
      ...withDerivedPaymentState(o),
      balance:    paymentState.balanceDue,
      daysOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)),
      isOverdue:   Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)) > 7
    });
    });

    const totalOutstanding = ledger.reduce((s, o) => s + (o.balance || 0), 0);
    const overdueCount = ledger.filter(o => o.isOverdue).length;

    res.json({ success: true, data: { ledger, totalOutstanding, overdueCount } });
  } catch (err) {
    return error(res, 'Failed to fetch AR ledger');
  }
};

module.exports = { getARLedger };
