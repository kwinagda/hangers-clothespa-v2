const prisma = require('../config/database');
const { error } = require('../utils/response');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const getARLedger = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { ...ORDER_ONLY_WHERE, paymentStatus: { in: ['UNPAID', 'PARTIAL'] } },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' }
    });

    const now = new Date();
    const ledger = orders.map(o => ({
      ...o,
      balance:    Math.max(0, (o.totalAmount || 0) - (o.paidAmount || 0) - (o.writeOffAmount || 0)),
      daysOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)),
      isOverdue:   Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)) > 7
    }));

    const totalOutstanding = ledger.reduce((s, o) => s + (o.balance || 0), 0);
    const overdueCount = ledger.filter(o => o.isOverdue).length;

    res.json({ success: true, data: { ledger, totalOutstanding, overdueCount } });
  } catch (err) {
    return error(res, 'Failed to fetch AR ledger');
  }
};

module.exports = { getARLedger };
