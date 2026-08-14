const prisma = require('../config/database');
const { roundMoney } = require('../utils/line-pricing');

const openInvoiceWhere = {
  status: { not: 'VOID' },
  balanceDue: { gt: 0 },
};

const invoiceSourceNumber = (invoice) =>
  invoice.order?.orderNumber ||
  invoice.ironBill?.billNumber ||
  invoice.serviceAppointment?.appointmentNumber ||
  invoice.invoiceNumber;

const normalizeReceivableInvoice = (invoice) => ({
  invoiceId: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  sourceType: invoice.sourceType,
  sourceId: invoice.orderId || invoice.ironBillId || invoice.serviceAppointmentId || invoice.id,
  sourceNumber: invoiceSourceNumber(invoice),
  customer: invoice.customer || null,
  orderId: invoice.orderId || null,
  orderNumber: invoice.order?.orderNumber || null,
  ironBillId: invoice.ironBillId || null,
  billNumber: invoice.ironBill?.billNumber || null,
  serviceAppointmentId: invoice.serviceAppointmentId || null,
  appointmentNumber: invoice.serviceAppointment?.appointmentNumber || null,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  totalAmount: Number(invoice.totalAmount || 0),
  paidAmount: Number(invoice.paidAmount || 0),
  creditAmount: Number(invoice.creditAmount || 0),
  balanceDue: Number(invoice.balanceDue || 0),
  status: invoice.order?.status || invoice.ironBill?.status || invoice.serviceAppointment?.status || invoice.status,
  balance: Number(invoice.balanceDue || 0),
});

const findOpenReceivableInvoices = async ({ customerId } = {}) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...openInvoiceWhere,
      ...(customerId ? { customerId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
      ironBill: { select: { id: true, billNumber: true, status: true } },
      serviceAppointment: { select: { id: true, appointmentNumber: true, status: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
  });
  return invoices.map(normalizeReceivableInvoice);
};

const getCustomerReceivablesSummary = async (customerId) => {
  const receivables = await findOpenReceivableInvoices({ customerId });
  const outstandingAmount = roundMoney(receivables.reduce((sum, invoice) => sum + invoice.balanceDue, 0));
  return {
    outstandingOrderCount: receivables.length,
    outstandingAmount,
    orderNumbers: receivables.map((invoice) => invoice.sourceNumber).filter(Boolean),
    receivables,
  };
};

const groupReceivablesByCustomer = (receivables) => {
  const grouped = new Map();
  for (const invoice of receivables || []) {
    const key = invoice.customer?.id || invoice.customer?.phone || invoice.customer?.name || 'unknown';
    const current = grouped.get(key) || {
      customer: invoice.customer || { id: null, name: 'Unknown customer', phone: null },
      receivables: [],
      invoiceCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      balance: 0,
      oldestDueDate: null,
      overdueCount: 0,
    };
    current.receivables.push(invoice);
    current.invoiceCount += 1;
    current.totalAmount = roundMoney(current.totalAmount + Number(invoice.totalAmount || 0));
    current.paidAmount = roundMoney(current.paidAmount + Number(invoice.paidAmount || 0));
    current.balance = roundMoney(current.balance + Number(invoice.balanceDue || invoice.balance || 0));
    if (!current.oldestDueDate || (invoice.dueDate && new Date(invoice.dueDate) < new Date(current.oldestDueDate))) {
      current.oldestDueDate = invoice.dueDate || current.oldestDueDate;
    }
    if (invoice.isOverdue) current.overdueCount += 1;
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance;
    return String(a.customer?.name || '').localeCompare(String(b.customer?.name || ''));
  });
};

module.exports = {
  findOpenReceivableInvoices,
  getCustomerReceivablesSummary,
  groupReceivablesByCustomer,
};
