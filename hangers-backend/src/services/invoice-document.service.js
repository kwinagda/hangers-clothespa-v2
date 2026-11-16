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
    return String(payment?.providerMethodDetail || payment?.providerMethod || 'Online payment').trim();
  }
  return method || 'Payment';
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

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (value, currency = 'INR') => {
  const amount = Number(value || 0).toFixed(2);
  return currency === 'INR' ? `&#8377;${amount}` : `${escapeHtml(currency)} ${amount}`;
};

const dateTime = (value) => value
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  : '—';

const invoicePdfFilename = (invoiceNumber) => {
  const safe = String(invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
};

const generateInvoiceHTML = (invoice) => {
  const itemRows = invoice.items.map((item) => `<tr>
    <td>${escapeHtml(item.serviceName || item.garmentType || 'Service')}</td>
    <td class="num">${escapeHtml(item.quantity)}</td>
    <td class="num">${money(item.unitPrice, invoice.currency)}</td>
    <td class="num">${money(item.subtotal, invoice.currency)}</td>
  </tr>`).join('');
  const paymentRows = invoice.payments.length
    ? invoice.payments.map((payment) => `<tr>
      <td>${escapeHtml(dateTime(payment.paidAt))}</td>
      <td>${escapeHtml(payment.method)}</td>
      <td>${escapeHtml(payment.receiptNumber || '—')}</td>
      <td>${escapeHtml(payment.reference || '—')}</td>
      <td class="num">${money(payment.amountApplied, invoice.currency)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="empty">No posted payment has been allocated to this invoice.</td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#172033;font-family:Arial,sans-serif;font-size:12px}.header{background:#023c62;color:white;padding:22px;border-radius:12px;display:flex;justify-content:space-between}.brand{font-size:25px;font-weight:800}.muted{color:#64748b}.header .muted{color:#dcecf9}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.card{border:1px solid #dbe6ee;border-radius:9px;padding:11px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}.value{margin-top:4px;font-weight:700;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#eff5f8;color:#38536b;text-align:left;font-size:10px;text-transform:uppercase}th,td{border-bottom:1px solid #e5edf2;padding:9px}.num{text-align:right}.section{margin-top:19px;color:#023c62;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.totals{margin:18px 0 0 auto;width:310px;border:1px solid #dbe6ee;border-radius:10px;overflow:hidden}.row{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #e5edf2}.row:last-child{border:0;background:#023c62;color:white;font-weight:800}.paid{color:#087443}.empty{text-align:center;color:#64748b;padding:18px}.footer{margin-top:22px;border-top:1px solid #dbe6ee;padding-top:12px;color:#64748b;font-size:10px}</style></head><body>
    <header class="header"><div><div class="brand">Hangers Clothes Spa</div><div class="muted">Premium garment care</div></div><div style="text-align:right"><div style="font-size:22px;font-weight:800">INVOICE</div><div>${escapeHtml(invoice.invoiceNumber)}</div><div>${escapeHtml(invoice.paymentStatus)}</div></div></header>
    <section class="meta"><div class="card"><div class="label">Customer</div><div class="value">${escapeHtml(invoice.customer?.name || 'Customer')}</div><div class="muted">${escapeHtml(invoice.customer?.phone || '')}</div></div><div class="card"><div class="label">Order / Source</div><div class="value">${escapeHtml(invoice.orderNumber)}</div></div><div class="card"><div class="label">Invoice date</div><div class="value">${escapeHtml(dateTime(invoice.createdAt))}</div></div></section>
    <div class="section">Services</div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <div class="totals"><div class="row"><span>Subtotal</span><b>${money(invoice.subtotal, invoice.currency)}</b></div>${Number(invoice.discount || 0)>0?`<div class="row"><span>Discount</span><b>-${money(invoice.discount, invoice.currency)}</b></div>`:''}${Number(invoice.taxAmount||0)>0?`<div class="row"><span>Tax</span><b>${money(invoice.taxAmount, invoice.currency)}</b></div>`:''}<div class="row"><span>Total</span><b>${money(invoice.totalAmount, invoice.currency)}</b></div><div class="row"><span>Paid</span><b class="paid">${money(invoice.paidAmount, invoice.currency)}</b></div><div class="row"><span>Balance due</span><b>${money(invoice.balanceDue, invoice.currency)}</b></div></div>
    <div class="section">Payment details</div><table><thead><tr><th>Date</th><th>Method</th><th>Receipt</th><th>Reference</th><th class="num">Applied</th></tr></thead><tbody>${paymentRows}</tbody></table>
    <div class="footer">This invoice is generated from the Hangers CRM master record. Payment rows show posted, unreversed allocations only.</div>
  </body></html>`;
};

module.exports = {
  invoiceDocumentSelect,
  normalizeInvoiceDocument,
  findInvoiceDocument,
  generateInvoiceHTML,
  invoicePdfFilename,
};
