const prisma = require('../config/database');
const { error } = require('../utils/response');

const getARLedger = async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: 'VOID' }, balanceDue: { gt: 0 } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
        ironBill: { select: { id: true, billNumber: true, status: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    });

    const now = new Date();
    const ledger = invoices.map((invoice) => {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / 86400000));
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        sourceType: invoice.sourceType,
        orderId: invoice.orderId,
        orderNumber: invoice.order?.orderNumber || null,
        ironBillId: invoice.ironBillId,
        billNumber: invoice.ironBill?.billNumber || null,
        customer: invoice.customer,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount || 0),
        paidAmount: Number(invoice.paidAmount || 0),
        balance: Number(invoice.balanceDue || 0),
        status: invoice.status,
        daysOverdue,
        isOverdue: new Date(invoice.dueDate) < now,
      };
    });

    const totalOutstanding = ledger.reduce((sum, invoice) => sum + invoice.balance, 0);
    const overdueCount = ledger.filter((invoice) => invoice.isOverdue).length;
    return res.json({ success: true, data: { ledger, totalOutstanding, overdueCount, asOf: now } });
  } catch (err) {
    console.error('getARLedger error:', err);
    return error(res, 'Failed to fetch AR ledger');
  }
};

module.exports = { getARLedger };
