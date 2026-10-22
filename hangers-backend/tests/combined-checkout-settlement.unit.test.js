const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const loadPaymentService = ({ invoices, orders = [] }) => {
  const paymentRows = [];
  const allocations = [];
  const orderRows = new Map(orders.map((order) => [order.id, { ...order }]));
  const receiptCalls = [];
  const invoiceRows = new Map(invoices.map((invoice) => [invoice.id, { ...invoice }]));
  const dependency = {
    crypto,
    '../utils/payment-method': require('../src/utils/payment-method'),
    '../utils/line-pricing': require('../src/utils/line-pricing'),
    './wallet.service': { creditWallet: async () => {}, debitWallet: async () => {} },
    './billing.service': {
      ensureOrderInvoice: async (_tx, orderId) => [...invoiceRows.values()].find((invoice) => invoice.orderId === orderId),
      syncInvoiceBalance: async (_tx, invoiceId) => {
        const invoice = invoiceRows.get(invoiceId);
        const paid = allocations.filter((allocation) => allocation.invoiceId === invoiceId).reduce((sum, allocation) => sum + allocation.amount, 0);
        invoice.paidAmount = paid;
        invoice.balanceDue = Math.max(0, invoice.totalAmount - paid);
        invoice.status = invoice.balanceDue === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN';
        return { ...invoice };
      },
    },
    './receipt.service': { issueReceipt: async (_tx, args) => { receiptCalls.push(args); return { id: 'receipt-fixture' }; } },
    './document-number.service': { nextDocumentNumber: async () => 'REC-000001' },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/payment.service.js'), 'utf8'), {
    module,
    require: (id) => {
      assert.ok(Object.hasOwn(dependency, id), `Unexpected dependency: ${id}`);
      return dependency[id];
    },
  }, { filename: path.join(__dirname, '../src/services/payment.service.js') });

  const tx = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('');
      if (sql.includes('FROM "Order"')) return orderRows.has(values[0]) ? [{ id: values[0] }] : [];
      if (sql.includes('FROM "invoices"')) return invoiceRows.has(values[0]) ? [{ id: values[0] }] : [];
      return [];
    },
    invoice: {
      findMany: async ({ where, select }) => {
        const rows = where?.id?.in ? where.id.in.map((id) => invoiceRows.get(id)).filter(Boolean) : [...invoiceRows.values()];
        return select ? rows.map(({ id, orderId }) => ({ id, orderId })) : rows;
      },
      findUnique: async ({ where }) => invoiceRows.get(where.id) || null,
    },
    order: {
      findUnique: async ({ where }) => orderRows.get(where.id) || null,
      findFirst: async ({ where }) => {
        const order = orderRows.get(where.id);
        if (!order) return null;
        return { ...order, invoice: [...invoiceRows.values()].find((invoice) => invoice.orderId === order.id) || null };
      },
      update: async ({ where, data }) => {
        const updated = { ...orderRows.get(where.id), ...data };
        orderRows.set(where.id, updated);
        return updated;
      },
    },
    payment: {
      create: async ({ data }) => {
        const payment = { id: `payment-${paymentRows.length + 1}`, ...data };
        paymentRows.push(payment);
        return payment;
      },
    },
    paymentAllocation: {
      createMany: async ({ data }) => { allocations.push(...data); return { count: data.length }; },
      aggregate: async ({ where }) => ({ _sum: { amount: allocations.filter((row) => row.orderId === where.orderId && row.status === 'POSTED').reduce((sum, row) => sum + row.amount, 0) } }),
    },
    refundAllocation: { aggregate: async () => ({ _sum: { amount: 0 } }) },
    creditNote: { aggregate: async () => ({ _sum: { amount: 0 } }) },
    financialAdjustment: { aggregate: async () => ({ _sum: { amount: 0 } }) },
  };
  return { service: module.exports, tx, allocations, paymentRows, receiptCalls, invoiceRows, orderRows };
};

test('late combined capture allocates only remaining snapshot balances and retains exact surplus', async () => {
  const paid = { id: 'invoice-paid', invoiceNumber: 'INV-PAID', customerId: 'home', orderId: null, ironBillId: null, serviceAppointmentId: null, status: 'PAID', currency: 'INR', balanceDue: 0, totalAmount: 10, voidedAt: null };
  const open = { id: 'invoice-open', invoiceNumber: 'INV-OPEN', customerId: 'home', orderId: null, ironBillId: null, serviceAppointmentId: null, status: 'OPEN', currency: 'INR', balanceDue: 100, totalAmount: 100, voidedAt: null };
  const harness = loadPaymentService({ invoices: [paid, open] });

  const result = await harness.service.recordInvoiceAllocationsSettlement(harness.tx, {
    allocations: [{ invoiceId: paid.id, amount: 10 }, { invoiceId: open.id, amount: 100 }],
    snapshotInvoiceIds: [paid.id, open.id], expectedCustomerId: 'home', expectedCurrency: 'INR',
    amount: 110, method: 'RAZORPAY', reference: 'pay_fixture', razorpayPaymentId: 'pay_fixture',
    razorpayOrderId: 'order_fixture', mode: 'TEST', idempotencyKey: 'capture-fixture', providerCaptureVerified: true,
  });

  assert.equal(result.payment.amount, 110);
  assert.equal(result.payment.unallocatedAmount, 10);
  assert.equal(result.allocatedAmountPaise, 10000n);
  assert.equal(result.unallocatedAmountPaise, 1000n);
  assert.deepEqual(harness.allocations.map(({ invoiceId, amount }) => ({ invoiceId, amount })), [{ invoiceId: open.id, amount: 100 }]);
  assert.equal(harness.receiptCalls.length, 1);
  assert.equal(harness.receiptCalls[0].invoiceId, open.id);
  assert.equal(harness.invoiceRows.get(paid.id).balanceDue, 0);
  assert.equal(harness.invoiceRows.get(open.id).balanceDue, 0);
});

test('fully consumed snapshot records the verified capture without fabricating an invoice allocation or receipt', async () => {
  const paid = { id: 'invoice-paid', invoiceNumber: 'INV-PAID', customerId: 'home', orderId: null, ironBillId: null, serviceAppointmentId: null, status: 'PAID', currency: 'INR', balanceDue: 0, totalAmount: 10, voidedAt: null };
  const harness = loadPaymentService({ invoices: [paid] });
  const result = await harness.service.recordInvoiceAllocationsSettlement(harness.tx, {
    allocations: [{ invoiceId: paid.id, amount: 10 }], snapshotInvoiceIds: [paid.id],
    expectedCustomerId: 'home', expectedCurrency: 'INR', amount: 10, method: 'RAZORPAY',
    reference: 'pay_fixture', razorpayPaymentId: 'pay_fixture', mode: 'TEST',
    idempotencyKey: 'capture-fixture', providerCaptureVerified: true,
  });

  assert.equal(result.payment.amount, 10);
  assert.equal(result.unallocatedAmountPaise, 1000n);
  assert.equal(harness.allocations.length, 0);
  assert.equal(harness.receiptCalls.length, 0);
  assert.equal(result.invoice, null);
});

test('combined allocation writes order identifiers and refreshes order payment totals', async () => {
  const invoice = { id: 'invoice-order', invoiceNumber: 'INV-ORDER', customerId: 'home', orderId: 'order-1', ironBillId: null, serviceAppointmentId: null, status: 'OPEN', currency: 'INR', balanceDue: 10, totalAmount: 10, voidedAt: null };
  const order = { id: 'order-1', customerId: 'home', documentType: 'ORDER', status: 'PICKED_UP', totalAmount: 10, paidAmount: 0, writeOffAmount: 0 };
  const harness = loadPaymentService({ invoices: [invoice], orders: [order] });
  await harness.service.recordInvoiceAllocationsSettlement(harness.tx, {
    allocations: [{ invoiceId: invoice.id, amount: 10 }], snapshotInvoiceIds: [invoice.id],
    expectedCustomerId: 'home', expectedCurrency: 'INR', amount: 10, method: 'RAZORPAY',
    reference: 'pay_fixture', razorpayPaymentId: 'pay_fixture', mode: 'TEST',
    idempotencyKey: 'capture-fixture', providerCaptureVerified: true,
  });

  assert.equal(harness.allocations[0].orderId, order.id);
  assert.equal(harness.orderRows.get(order.id).paidAmount, 10);
  assert.equal(harness.orderRows.get(order.id).paymentStatus, 'PAID');
});

const loadRefundService = () => {
  const audits = [];
  const prisma = {};
  class PaymentRuleError extends Error {
    constructor(code, message, statusCode = 400) { super(message); this.code = code; this.statusCode = statusCode; }
  }
  const dependencies = {
    axios: { post: async () => assert.fail('Unit test must not call Razorpay') },
    crypto,
    '../config/database': prisma,
    './payment.service': { PaymentRuleError, recordOrderRefund: async () => assert.fail('Unexpected manual-refund ledger call') },
    './activity.service': { writeAuditEvent: async (_tx, audit) => { audits.push(audit); return audit; } },
    '../utils/redact': { razorpayErrorSummary: () => ({}) },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/services/razorpay-refund.service.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    process: { env: { RAZORPAY_KEY_ID: 'rzp_test_unit' } },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  }, { filename });
  return { service: module.exports, audits };
};

test('automatic surplus refund reservation is payment-bound, idempotent, and honors Razorpay minimum', async () => {
  const { service, audits } = loadRefundService();
  let saved = null;
  const tx = {
    razorpayRefundAttempt: {
      findUnique: async () => saved,
      create: async ({ data }) => { saved = { id: 'refund-attempt-fixture', ...data }; return saved; },
    },
  };
  const input = {
    sourcePayment: { id: 'payment-fixture', customerId: 'home', razorpayPaymentId: 'pay_fixture' },
    amountPaise: 1250n,
    checkoutAttempt: { id: 'checkout-fixture', mode: 'TEST' },
    requestId: 'request-fixture',
  };

  const first = await service.reserveAutomaticSurplusRefund(tx, input);
  const repeat = await service.reserveAutomaticSurplusRefund(tx, input);
  assert.equal(first.id, repeat.id);
  assert.equal(first.automatic, true);
  assert.equal(first.sourcePaymentId, input.sourcePayment.id);
  assert.equal(first.checkoutAttemptId, input.checkoutAttempt.id);
  assert.equal(first.status, 'CREATING');
  assert.match(first.providerIdempotencyKey, /^[A-Za-z0-9_-]{10,}$/);
  assert.equal(audits.length, 1, 'a replay must not reserve or audit a second provider refund');

  saved = null;
  const belowMinimum = await service.reserveAutomaticSurplusRefund(tx, { ...input, amountPaise: 99n });
  assert.equal(belowMinimum.status, 'REVIEW');
  assert.equal(belowMinimum.failureCode, 'REFUND_BELOW_PROVIDER_MINIMUM');
  assert.equal(audits.at(-1).action, 'RAZORPAY_AUTOMATIC_REFUND_MINIMUM_EXCEPTION');
});
