const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInvoiceDocument, generateInvoiceHTML, invoicePdfFilename } = require('../src/services/invoice-document.service');

const invoiceFixture = {
  id: 'invoice-1', invoiceNumber: 'INV-1001', sourceType: 'ORDER', status: 'PAID', currency: 'INR',
  issueDate: new Date('2026-11-01T10:00:00Z'), dueDate: new Date('2026-11-08T10:00:00Z'), postedAt: new Date('2026-11-01T10:00:00Z'),
  subtotal: 800, discountAmount: 0, taxAmount: 0, totalAmount: 800, paidAmount: 800, creditAmount: 0, balanceDue: 0,
  customer: { name: 'Customer', phone: '9000000000' },
  order: { orderNumber: 'HCS-1001', status: 'DELIVERED', pickupDate: null, deliveryDate: null, deliveredAt: null },
  ironBill: null, serviceAppointment: null,
  lines: [{ lineType: 'SERVICE', description: 'Dry cleaning', quantity: 2, unitPrice: 400, discountAmount: 0, taxAmount: 0, lineTotal: 800 }],
  allocations: [
    { amount: 300, createdAt: new Date('2026-11-01T11:00:00Z'), payment: { id: 'cash-1', method: 'CASH', reference: 'COUNTER-1', createdAt: new Date('2026-11-01T11:00:00Z'), status: 'CAPTURED', receipt: { receiptNumber: 'REC-1', status: 'ISSUED', issuedAt: new Date('2026-11-01T11:00:00Z'), voidedAt: null } } },
    { amount: 500, createdAt: new Date('2026-11-01T12:00:00Z'), payment: { id: 'rzp-1', method: 'RAZORPAY', providerMethod: 'upi', providerMethodDetail: 'UPI', razorpayPaymentId: 'pay_safe', createdAt: new Date('2026-11-01T12:00:00Z'), status: 'CAPTURED', mode: 'LIVE', receipt: { receiptNumber: 'REC-2', status: 'ISSUED', issuedAt: new Date('2026-11-01T12:00:00Z'), voidedAt: null } } },
  ],
};

test('invoice document exposes safe settlement details for every posted payment method', () => {
  const document = normalizeInvoiceDocument(invoiceFixture);
  assert.equal(document.payments.length, 2);
  assert.deepEqual(document.payments.map((payment) => payment.method), ['CASH', 'UPI']);
  assert.deepEqual(document.payments.map((payment) => payment.receiptNumber), ['REC-1', 'REC-2']);
  assert.deepEqual(document.payments.map((payment) => Number(payment.amountApplied)), [300, 500]);
  assert.equal(document.payments[1].reference, 'pay_safe');
  assert.equal('paymentId' in document.payments[0], false);
  assert.equal('mode' in document.payments[1], false);
});

test('invoice PDF filename cannot inject response headers', () => {
  assert.equal(invoicePdfFilename('INV-1001\r\nX-Test: unsafe'), 'INV-1001-X-Test-unsafe.pdf');
});

test('invoice PDF HTML contains invoice lines, totals, and payment evidence', () => {
  const html = generateInvoiceHTML(normalizeInvoiceDocument(invoiceFixture));
  assert.match(html, /INV-1001/);
  assert.match(html, /Dry cleaning/);
  assert.match(html, /REC-1/);
  assert.match(html, /COUNTER-1/);
  assert.match(html, /REC-2/);
  assert.match(html, /pay_safe/);
});
