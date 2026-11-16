const prisma = require('../config/database');

const invoiceDocumentSelect = {
  id: true,
  invoiceNumber: true,
  sourceType: true,
  status: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  totalAmount: true,
  paidAmount: true,
  creditAmount: true,
  balanceDue: true,
  postedAt: true,
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
      taxAmount: true,
      lineTotal: true,
      metadata: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  allocations: {
    where: {
      status: 'POSTED',
      reversedAt: null,
      payment: { kind: 'RECEIPT', status: { in: ['CAPTURED', 'SUCCESS', 'PAID'] }, reversedAt: null },
    },
    select: {
      amount: true,
      createdAt: true,
      payment: {
        select: {
          method: true,
          reference: true,
          createdAt: true,
          providerMethod: true,
          providerMethodDetail: true,
          razorpayPaymentId: true,
          receipt: {
            select: {
              receiptNumber: true,
              status: true,
              issuedAt: true,
              voidedAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
};

const paymentMethodLabel = (payment) => {
  const method = String(payment?.method || '').trim().toUpperCase();
  if (method === 'RAZORPAY') {
    const providerMethod = String(payment?.providerMethod || '').trim().toLowerCase();
    const providerDetail = String(payment?.providerMethodDetail || '').trim().toLowerCase();
    const providerLabels = {
      upi: 'UPI',
      card: 'Card',
      netbanking: 'Net banking',
      wallet: 'Wallet',
      emi: 'EMI',
      paylater: 'Pay later',
      cardless_emi: 'Cardless EMI',
      bank_transfer: 'Bank transfer',
    };
    const baseLabel = providerLabels[providerMethod] || 'Online payment';
    const detailLabel = providerDetail && providerDetail !== providerMethod
      ? providerDetail.split(':').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
      : '';
    return `${baseLabel}${detailLabel ? ` (${detailLabel})` : ''} via Razorpay`;
  }
  const directLabels = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', ONLINE: 'Online payment', COD: 'Cash on delivery', WALLET: 'Wallet' };
  return directLabels[method] || method || 'Payment';
};

const paymentReference = (payment) => {
  if (payment?.reference) return String(payment.reference);
  if (payment?.razorpayPaymentId) return String(payment.razorpayPaymentId);
  return null;
};

const normalizeInvoiceDocument = (invoice) => {
  if (!invoice) return null;
  const source = invoice.order || invoice.ironBill || invoice.serviceAppointment || {};
  const items = (invoice.lines || []).map((line) => ({
    serviceName: line.description,
    garmentType: line.lineType,
    variant: null,
    quantity: Number(line.quantity || 0),
    unitPrice: line.unitPrice,
    lineDiscountAmount: line.discountAmount,
    taxAmount: line.taxAmount,
    subtotal: line.lineTotal,
  }));
  const payments = (invoice.allocations || []).map((allocation) => ({
    receiptNumber: allocation.payment.receipt?.status === 'ISSUED' && !allocation.payment.receipt?.voidedAt
      ? allocation.payment.receipt.receiptNumber
      : null,
    paidAt: allocation.payment.receipt?.issuedAt || allocation.payment.createdAt || allocation.createdAt,
    amountApplied: allocation.amount,
    method: paymentMethodLabel(allocation.payment),
    reference: paymentReference(allocation.payment),
  }));
  const paidAmount = Number(invoice.paidAmount || 0);
  const creditAmount = Number(invoice.creditAmount || 0);
  const writeOffAmount = Math.max(0, Number((Number(invoice.totalAmount || 0) - paidAmount - creditAmount - Number(invoice.balanceDue || 0)).toFixed(2)));

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.sourceType,
    currency: invoice.currency,
    orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.serviceAppointment?.appointmentNumber || invoice.invoiceNumber,
    status: source.status || invoice.status,
    invoiceStatus: invoice.status,
    subtotal: invoice.subtotal,
    discount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    creditAmount: invoice.creditAmount,
    writeOffAmount,
    balanceDue: invoice.balanceDue,
    paymentStatus: invoice.status === 'PAID' || Number(invoice.balanceDue || 0) <= 0
      ? 'PAID'
      : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
    pickupDate: invoice.order?.pickupDate || invoice.ironBill?.billingPeriodStart || invoice.serviceAppointment?.scheduledAt || null,
    deliveryDate: invoice.order?.deliveryDate || invoice.ironBill?.billingPeriodEnd || invoice.serviceAppointment?.completedAt || null,
    serviceDate: invoice.serviceAppointment?.scheduledAt || null,
    deliveredAt: invoice.order?.deliveredAt || invoice.ironBill?.paidAt || invoice.serviceAppointment?.completedAt || null,
    createdAt: invoice.issueDate,
    dueDate: invoice.dueDate,
    postedAt: invoice.postedAt,
    customer: invoice.customer,
    totalPieces: items.reduce((total, item) => total + item.quantity, 0),
    items,
    payments,
  };
};

const findInvoiceDocument = async ({ id, where, client = prisma }) => {
  const invoice = id
    ? await client.invoice.findUnique({ where: { id }, select: invoiceDocumentSelect })
    : await client.invoice.findFirst({ where, select: invoiceDocumentSelect });
  if (!invoice || invoice.status === 'VOID') return null;
  return normalizeInvoiceDocument(invoice);
};

const invoicePdfFilename = (invoiceNumber) => {
  const safe = String(invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
};

module.exports = {
  invoiceDocumentSelect,
  normalizeInvoiceDocument,
  findInvoiceDocument,
  invoicePdfFilename,
};
