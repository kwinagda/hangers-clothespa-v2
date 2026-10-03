const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openInvoiceWhere, groupReceivablesByCustomer, allocateReceivablePayment } = require('../src/services/receivables.service');
const { recordPaymentSchema, recordReceivablesPaymentSchema } = require('../src/validation/finance.schemas');
const { recordInvoiceAllocationsSettlement } = require('../src/services/payment.service');
const { ORDER_WORKFLOW } = require('../src/config/master-data');

test('receivables exclude closed sources while retaining standalone invoices', () => {
  assert.equal(openInvoiceWhere.status.not, 'VOID');
  assert.equal(openInvoiceWhere.balanceDue.gt, 0);
  const [orders, iron, field] = openInvoiceWhere.AND;
  assert.deepEqual(orders.OR, [{ orderId: null }, { order: { is: { status: { notIn: ['CANCELLED', 'RETURNED'] } } } }]);
  assert.equal(iron.OR[1].ironBill.is.status.not, 'VOID');
  assert.equal(field.OR[1].serviceAppointment.is.status.not, 'CANCELLED');
});

test('manual collection validates dates and retains the chosen effective date', () => {
  const input = { orderId: 'order-1', amount: 100, method: 'CASH' };
  assert.equal(recordPaymentSchema.safeParse(input).success, true);
  const result = recordPaymentSchema.parse({ ...input, effectiveAt: '2026-08-01T00:00:00+05:30' });
  assert.equal(result.effectiveAt.toISOString(), '2026-07-31T18:30:00.000Z');
  assert.equal(recordPaymentSchema.safeParse({ ...input, effectiveAt: 'invalid' }).success, false);
  assert.equal(recordPaymentSchema.safeParse({ ...input, effectiveAt: '2999-01-01' }).success, false);
});

test('selected invoice payments require one customer, unique invoice IDs and positive amounts', () => {
  const base = { customerId: 'customer-1', method: 'CASH', amount: 20, invoiceIds: ['invoice-1'] };
  assert.equal(recordReceivablesPaymentSchema.safeParse(base).success, true);
  assert.equal(recordReceivablesPaymentSchema.safeParse({ ...base, invoiceIds: ['invoice-1', 'invoice-1'] }).success, false);
  assert.equal(recordReceivablesPaymentSchema.safeParse({ ...base, invoiceIds: undefined, orderIds: ['order-1'] }).success, true);
  assert.equal(recordReceivablesPaymentSchema.safeParse({ ...base, orderIds: ['order-1'] }).success, false);
  assert.equal(recordReceivablesPaymentSchema.safeParse({ ...base, amount: 0 }).success, false);
});

test('FIFO allocations pay the oldest invoice first and leave later balances open', () => {
  const invoices = [
    { id: 'newer', issueDate: new Date('2026-09-03'), dueDate: new Date('2026-09-10'), balanceDue: 100 },
    { id: 'older', issueDate: new Date('2026-09-01'), dueDate: new Date('2026-09-08'), balanceDue: 80 },
    { id: 'last', issueDate: new Date('2026-09-04'), dueDate: new Date('2026-09-11'), balanceDue: 50 },
  ];
  assert.deepEqual(allocateReceivablePayment(invoices, 90), [
    { invoiceId: 'older', amount: 80 }, { invoiceId: 'newer', amount: 10 },
  ]);
  assert.deepEqual(allocateReceivablePayment(invoices, 20), [{ invoiceId: 'older', amount: 20 }]);
  assert.deepEqual(allocateReceivablePayment(invoices, 1.13), [{ invoiceId: 'older', amount: 1.13 }]);
  assert.deepEqual(allocateReceivablePayment(invoices, 230), [
    { invoiceId: 'older', amount: 80 }, { invoiceId: 'newer', amount: 100 }, { invoiceId: 'last', amount: 50 },
  ]);
  assert.throws(() => allocateReceivablePayment(invoices, 230.01), /exceeds/);
  assert.throws(() => allocateReceivablePayment(invoices, 20.001), /two decimal/);
});

test('multi-invoice settlement rejects a newly cancelled order before creating payment', async () => {
  let created = false;
  const invoices = [
    { id: 'invoice-1', orderId: 'order-1', customerId: 'customer-1', currency: 'INR', status: 'OPEN', balanceDue: 80 },
    { id: 'invoice-2', orderId: null, customerId: 'customer-1', currency: 'INR', status: 'OPEN', balanceDue: 50 },
  ];
  const tx = {
    invoice: { findMany: async ({ select }) => select ? invoices.map(({ id, orderId }) => ({ id, orderId })) : invoices },
    order: { findUnique: async () => ({ status: 'CANCELLED' }) },
    payment: { create: async () => { created = true; throw new Error('Should not create payment'); } },
    $queryRaw: async () => [{ id: 'locked' }],
  };
  await assert.rejects(recordInvoiceAllocationsSettlement(tx, {
    allocations: [{ invoiceId: 'invoice-1', amount: 40 }, { invoiceId: 'invoice-2', amount: 50 }],
    expectedCustomerId: 'customer-1', expectedCurrency: 'INR', amount: 90, method: 'CASH', allowPartial: true,
  }), { code: 'ORDER_CANCELLED' });
  assert.equal(created, false);
});

test('verified Razorpay allocation refuses foreign customer and currency before any ledger write', async () => {
  for (const scenario of [
    { expectedCustomerId: 'foreign-customer', secondCustomer: 'customer-1', secondCurrency: 'INR', code: 'INVALID_ALLOCATION_PLAN' },
    { expectedCustomerId: 'customer-1', secondCustomer: 'foreign-customer', secondCurrency: 'INR', code: 'ALLOCATION_BALANCE_CHANGED' },
    { expectedCustomerId: 'customer-1', secondCustomer: 'customer-1', secondCurrency: 'USD', code: 'ALLOCATION_BALANCE_CHANGED' },
  ]) {
    const invoices = [
      { id: 'invoice-1', orderId: null, customerId: 'customer-1', currency: 'INR', status: 'OPEN', balanceDue: 80 },
      { id: 'invoice-2', orderId: null, customerId: scenario.secondCustomer, currency: scenario.secondCurrency, status: 'OPEN', balanceDue: 50 },
    ];
    const original = structuredClone(invoices);
    let writes = 0;
    const failWrite = async () => { writes += 1; throw new Error('Unexpected ledger write'); };
    const tx = {
      invoice: { findMany: async () => invoices, update: failWrite },
      payment: { create: failWrite },
      paymentAllocation: { create: failWrite, createMany: failWrite },
      receipt: { create: failWrite },
      outboxEvent: { create: failWrite },
      $queryRaw: async () => [{ id: 'locked' }],
    };
    await assert.rejects(recordInvoiceAllocationsSettlement(tx, {
      allocations: [{ invoiceId: 'invoice-1', amount: 80 }, { invoiceId: 'invoice-2', amount: 50 }],
      expectedCustomerId: scenario.expectedCustomerId, expectedCurrency: 'INR', amount: 130,
      method: 'RAZORPAY', providerCaptureVerified: true,
    }), { code: scenario.code });
    assert.equal(writes, 0);
    assert.deepEqual(invoices, original);
  }
});

test('operational queues separate received, processing, ironing and delivery stages', () => {
  const views = ORDER_WORKFLOW.views;
  for (const [key, status] of Object.entries({ received: 'PICKED_UP', in_process: 'PROCESSING', at_plant: 'SENT_TO_PLANT', pending_ironing: 'IRONING', out_for_delivery: 'OUT_FOR_DELIVERY', delivered: 'DELIVERED' })) {
    assert.deepEqual(views[key].statuses, [status]);
  }
});

test('AR groups retain invoice allocation identifiers and rounded balance', () => {
  const customer = { id: 'customer-1', name: 'Example' };
  const result = groupReceivablesByCustomer([{ invoiceId: 'one', customer, totalAmount: 100, paidAmount: 10, balanceDue: 90 }, { invoiceId: 'two', customer, totalAmount: 30.5, paidAmount: 0, balanceDue: 30.5 }]);
  assert.equal(result[0].balance, 120.5);
  assert.equal(result[0].invoiceCount, 2);
  assert.deepEqual(result[0].receivables.map((item) => item.invoiceId), ['one', 'two']);
});
