const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const prisma = require('../src/config/database');
const { createInvoiceCheckout, reconcileAmbiguousOrderCreation, settleCapturedPayment } = require('../src/services/razorpay-invoice-checkout.service');
const { getOrderPayments } = require('../src/controllers/payments.controller');
const { getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');
const { createPublicShareToken } = require('../src/services/publicShare.service');
const { createRazorpayRefund, reconcileRazorpayRefundWebhook } = require('../src/services/razorpay-refund.service');

after(() => prisma.$disconnect());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('combined checkout atomically settles two invoices and refuses overlap, stale balances and foreign links', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  const suffix = crypto.randomUUID();
  const customer = await prisma.customer.create({ data: { name: `Combined CI ${suffix}`, phone: '9930367267', notifWhatsApp: false } });
  const invoices = [];
  for (const [index, amount] of [2680, 3200].entries()) {
    const order = await prisma.order.create({ data: { orderNumber: `COMBINED-${suffix}-${index}`, customerId: customer.id, source: 'COUNTER', status: 'PICKED_UP', subtotal: amount, totalAmount: amount } });
    invoices.push(await prisma.invoice.create({ data: { invoiceNumber: `COMBINED-${suffix}-${index}`, customerId: customer.id, orderId: order.id, sourceType: 'ORDER', status: 'OPEN', currency: 'INR', subtotal: amount, totalAmount: amount, balanceDue: amount, dueDate: new Date(1700000000000 + index * 1000) } }));
  }
  const allocationPlan = invoices.map((invoice) => ({ invoiceId: invoice.id, amount: Number(invoice.balanceDue) }));
  let providerOrder;
  let providerPayment;
  let created = 0;
  const provider = {
    orders: {
      create: async (payload) => { created += 1; return (providerOrder = { ...payload, id: `order_${suffix}`, status: 'created', amount_paid: 0, amount_due: payload.amount, attempts: 0 }); },
      fetch: async () => providerOrder,
      fetchPayments: async () => ({ items: providerPayment ? [providerPayment] : [] }),
    },
    payments: { fetch: async () => providerPayment },
  };
  const args = { invoice: invoices[0], allocationPlan, shareId: `share_${suffix}`, idempotencyKey: suffix, provider };
  await assert.rejects(createInvoiceCheckout({ ...args, allocationPlan: [{ ...allocationPlan[0], amount: 1 }, allocationPlan[1]] }), { code: 'CHECKOUT_ATTEMPT_STALE' });
  assert.equal(created, 0);
  const checkout = await createInvoiceCheckout(args);
  assert.equal(checkout.order.amount, 588000);
  assert.equal(checkout.attempt.allocationPlan.length, 2);
  assert.equal((await createInvoiceCheckout(args)).attempt.id, checkout.attempt.id);
  assert.equal(created, 1);
  await prisma.razorpayCheckoutAttempt.update({ where: { id: checkout.attempt.id }, data: { status: 'REVIEW', failureCode: 'ETIMEDOUT' } });
  const reconciled = await reconcileAmbiguousOrderCreation({ attemptId: checkout.attempt.id, actor: { requestId: suffix }, provider });
  assert.equal(reconciled.reused, true, 'only the matching zero-attempt provider order is made resumable');
  assert.equal(reconciled.attempt.status, 'CREATED');
  assert.equal(reconciled.attempt.razorpayOrderId, providerOrder.id);
  await assert.rejects(createInvoiceCheckout({ invoice: invoices[1], shareId: `single_${suffix}`, idempotencyKey: `single_${suffix}`, provider }), { code: 'CHECKOUT_ALREADY_IN_PROGRESS' });

  const singleToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoices[0].id, purpose: 'INVOICE_VIEW' });
  const denied = response();
  await getPublicRazorpayCheckoutStatus({ params: { slug: singleToken }, query: { invoiceId: invoices[1].id }, id: suffix }, denied);
  assert.equal(denied.statusCode, 404, 'an invoice link cannot be swapped to another invoice');

  providerPayment = { id: `pay_${suffix}`, order_id: providerOrder.id, amount: 588000, currency: 'INR', status: 'captured', captured: true, method: 'card' };
  const verificationArgs = { paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider };
  const assertNoSettlement = async () => {
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id } }), 0);
    for (const invoice of invoices) {
      const unchanged = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      assert.equal(Number(unchanged.paidAmount), 0);
      assert.equal(Number(unchanged.balanceDue), Number(invoice.totalAmount));
    }
  };
  for (const [extra, code] of [
    [{ signature: 'forged' }, 'INVALID_CHECKOUT_SIGNATURE'],
    [{ expectedInvoiceId: 'foreign-invoice' }, 'CHECKOUT_ATTEMPT_BINDING_MISMATCH'],
    [{ expectedShareId: 'foreign-share' }, 'CHECKOUT_ATTEMPT_BINDING_MISMATCH'],
    [{ providerOrderId: `unknown_${suffix}` }, 'CHECKOUT_ATTEMPT_NOT_FOUND'],
  ]) {
    await assert.rejects(settleCapturedPayment({ ...verificationArgs, ...extra }), { code });
    await assertNoSettlement();
  }
  for (const [entity, field, value, code] of [
    [providerPayment, 'order_id', 'foreign-order', 'PROVIDER_PAYMENT_BINDING_MISMATCH'],
    [providerPayment, 'id', 'foreign-payment', 'PROVIDER_PAYMENT_BINDING_MISMATCH'],
    [providerPayment, 'amount', 588001, 'PROVIDER_AMOUNT_MISMATCH'],
    [providerOrder, 'amount', 588001, 'PROVIDER_AMOUNT_MISMATCH'],
    [providerPayment, 'currency', 'USD', 'PROVIDER_CURRENCY_MISMATCH'],
    [providerOrder, 'currency', 'USD', 'PROVIDER_CURRENCY_MISMATCH'],
    [providerOrder.notes, 'invoice_id', 'foreign-invoice', 'PROVIDER_ORDER_BINDING_MISMATCH'],
    [providerOrder.notes, 'share_id', 'foreign-share', 'PROVIDER_ORDER_BINDING_MISMATCH'],
  ]) {
    const original = entity[field];
    try {
      entity[field] = value;
      await assert.rejects(settleCapturedPayment(verificationArgs), { code });
      await assertNoSettlement();
    } finally {
      entity[field] = original;
    }
  }
  const originalHash = providerOrder.notes.allocation_plan_hash;
  providerOrder.notes.allocation_plan_hash = 'invalid';
  await assert.rejects(settleCapturedPayment({ paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider }), { code: 'PROVIDER_ORDER_BINDING_MISMATCH' });
  providerOrder.notes.allocation_plan_hash = originalHash;
  await prisma.invoice.update({ where: { id: invoices[1].id }, data: { balanceDue: 3199 } });
  await assert.rejects(settleCapturedPayment({ paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider }), { code: 'SETTLEMENT_REQUIRES_REVIEW' });
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id } }), 0);
  assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } })).status, 'REVIEW');
  await prisma.invoice.update({ where: { id: invoices[1].id }, data: { balanceDue: 3200 } });
  const settlementArgs = { paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider };
  const simultaneous = await Promise.allSettled([
    settleCapturedPayment(settlementArgs),
    settleCapturedPayment(settlementArgs),
  ]);
  const successful = simultaneous.filter((result) => result.status === 'fulfilled');
  assert.ok(successful.length >= 1, 'at least one concurrent capture must settle');
  for (const result of simultaneous) {
    if (result.status === 'rejected') {
      const conflict = result.reason.code === 'P2034'
        || (result.reason.code === 'P2010' && result.reason.meta?.code === '40001');
      assert.equal(conflict, true, `only a verified serialization conflict may defer this replay (${result.reason.code}/${result.reason.meta?.code || 'none'})`);
      const recovered = await settleCapturedPayment(settlementArgs);
      assert.equal(recovered.alreadyRecorded, true, 'the deferred concurrent request must recover the existing payment');
    }
  }
  const settled = successful[0].value;
  for (const result of successful) assert.equal(result.value.payment.id, settled.payment.id);
  assert.equal(Number(settled.payment.amount), 5880);
  assert.equal(settled.payment.orderId, null);
  const allocations = await prisma.paymentAllocation.findMany({ where: { paymentId: settled.payment.id }, orderBy: { amount: 'asc' } });
  assert.deepEqual(allocations.map((item) => Number(item.amount)), [2680, 3200]);
  for (const invoice of invoices) {
    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    assert.equal(Number(updated.balanceDue), 0);
    assert.equal(updated.status, 'PAID');
    const history = response();
    await getOrderPayments({ params: { orderId: invoice.orderId } }, history);
    assert.equal(history.statusCode, 200);
    assert.equal(history.body.data.payments.length, 1);
    assert.equal(Number(history.body.data.payments[0].amount), Number(invoice.totalAmount));
  }
  const replay = await settleCapturedPayment({ paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider });
  assert.equal(replay.alreadyRecorded, true);
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id } }), 1);
  assert.equal(await prisma.receipt.count({ where: { paymentId: settled.payment.id } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment-received:${settled.payment.id}` } }), 1);

  const staff = await prisma.staff.create({ data: {
    name: `Refund CI ${suffix}`, phone: `ci-refund-${suffix}`, passwordHash: 'integration-test-only', role: 'ACCOUNTS',
  } });
  let refundCalls = 0;
  let providerRefund;
  const refundArgs = {
    orderId: invoices[0].orderId, sourcePaymentId: settled.payment.id, amount: 100,
    reasonCode: 'CUSTOMER_REFUND', reason: 'Combined allocation CI refund',
    staff: { id: staff.id, effectivePermissions: ['finance.refund'] }, idempotencyKey: `refund-${suffix}`,
    provider: async ({ paymentId, amountPaise, attempt }) => {
      refundCalls += 1;
      assert.equal(paymentId, providerPayment.id);
      assert.equal(amountPaise, 10000n);
      return (providerRefund = { id: `rfnd_${suffix}`, payment_id: paymentId, amount: Number(amountPaise),
        currency: 'INR', status: 'processed', notes: { crm_refund_attempt_id: attempt.id } });
    },
  };
  await assert.rejects(createRazorpayRefund({ ...refundArgs, amount: 2681, idempotencyKey: `excess-${suffix}` }), { code: 'REFUND_EXCEEDS_AVAILABLE' });
  assert.equal(refundCalls, 0, 'refund cannot consume another invoice allocation');
  const refunded = await createRazorpayRefund(refundArgs);
  assert.equal(refunded.attempt.status, 'PROCESSED');
  assert.equal(Number(refunded.refundPayment.amount), 100);
  assert.equal(refunded.creditNote.orderId, invoices[0].orderId);
  assert.equal((await createRazorpayRefund(refundArgs)).alreadyRecorded, true);
  assert.equal(refundCalls, 1, 'idempotent replay must not call provider again');
  await reconcileRazorpayRefundWebhook({ refundId: providerRefund.id }, async () => providerRefund);
  assert.equal(await prisma.payment.count({ where: { id: refunded.refundPayment.id, kind: 'REFUND' } }), 1);
  assert.equal(await prisma.creditNote.count({ where: { id: refunded.creditNote.id } }), 1);
  assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoices[1].id } })).balanceDue), 0);
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: settled.payment.id } }), 2);
});
