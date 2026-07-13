const { nextDocumentNumber } = require('./document-number.service');

const issueReceipt = async (tx, { payment, invoiceId, staffId = null }) => {
  if (!payment) throw new Error('Payment is required to issue a receipt');
  const existing = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
  if (existing) return existing;

  const allocations = await tx.paymentAllocation.findMany({
    where: { paymentId: payment.id, status: 'POSTED' },
    include: { invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!allocations.length) throw new Error('A posted allocation is required to issue a receipt');
  const primaryInvoiceId = allocations.length === 1 ? allocations[0].invoiceId : null;
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId || allocations[0].invoiceId },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  if (!invoice) throw new Error('Invoice not found while issuing receipt');

  const receiptNumber = await nextDocumentNumber({
    tx,
    documentType: 'RECEIPT',
    prefix: 'REC-',
    padding: 6,
  });
  return tx.receipt.create({
    data: {
      receiptNumber,
      paymentId: payment.id,
      invoiceId: primaryInvoiceId,
      customerId: invoice.customerId,
      issuedById: staffId,
      snapshot: {
        paymentId: payment.id,
        kind: payment.kind,
        amount: Number(payment.amount || 0),
        method: payment.method,
        reference: payment.reference || null,
        collectedAt: payment.createdAt,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceTotal: Number(invoice.totalAmount || 0),
        customer: invoice.customer,
        allocations: allocations.map((allocation) => ({
          allocationId: allocation.id,
          invoiceId: allocation.invoiceId,
          invoiceNumber: allocation.invoice.invoiceNumber,
          amount: Number(allocation.amount || 0),
        })),
      },
      allocations: {
        create: allocations.map((allocation) => ({
          paymentAllocationId: allocation.id,
          invoiceId: allocation.invoiceId,
          amount: Number(allocation.amount || 0),
        })),
      },
    },
  });
};

module.exports = { issueReceipt };
