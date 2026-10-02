const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const prisma = require('../src/config/database');
const { createInvoiceCheckout, reconcileAmbiguousOrderCreation, settleCapturedPayment } = require('../src/services/razorpay-invoice-checkout.service');
const { getOrderPayments } = require('../src/controllers/payments.controller');
const { createPublicRazorpayOrder, getPublicInvoice, getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');
const { createPublicShareToken } = require('../src/services/publicShare.service');
const { createRazorpayRefund, reconcileRazorpayRefundWebhook } = require('../src/services/razorpay-refund.service');
const { LEGAL_TERMS } = require('../src/config/master-data');

after(() => prisma.$disconnect());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('historical unpaid invoices prepare and reuse checkout across every billing source', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  const suffix = crypto.randomUUID();
  const customer = await prisma.customer.create({ data: { name: `Source CI ${suffix}`, phone: '9930367267', notifWhatsApp: false } });
  for (const sourceType of ['ORDER', 'DAILY_IRON', 'FIELD_SERVICE']) {
    let source;
    if (sourceType === 'ORDER') {
      const order = await prisma.order.create({ data: { orderNumber: `SOURCE-${suffix}`, customerId: customer.id, source: 'COUNTER', status: 'PICKED_UP', subtotal: 10, totalAmount: 10 } });
      source = { orderId: order.id };
    } else if (sourceType === 'DAILY_IRON') {
      const subscription = await prisma.ironSubscription.create({ data: { customerId: customer.id } });
      const bill = await prisma.ironBill.create({ data: { billNumber: `SOURCE-${suffix}`, customerId: customer.id, subscriptionId: subscription.id, billingPeriodStart: new Date('2023-01-01'), billingPeriodEnd: new Date('2023-01-31'), totalPieces: 1, totalAmount: 10 } });
      source = { ironBillId: bill.id };
    } else {
      const appointment = await prisma.serviceAppointment.create({ data: { appointmentNumber: `SOURCE-${suffix}`, customerId: customer.id, serviceName: 'Curtain cleaning CI', scheduledAt: new Date('2023-01-01'), totalAmount: 10 } });
      source = { serviceAppointmentId: appointment.id };
    }
    const invoice = await prisma.invoice.create({ data: {
      invoiceNumber: `SOURCE-${sourceType}-${suffix}`, customerId: customer.id, sourceType, ...source,
      status: 'OPEN', currency: 'INR', subtotal: 10, totalAmount: 10, balanceDue: 10,
      issueDate: new Date('2023-01-01T00:00:00Z'), dueDate: new Date('2023-01-02T00:00:00Z'),
    } });
    let calls = 0;
    let providerOrder;
    const provider = { orders: {
      create: async (payload) => {
        calls += 1;
        providerOrder = { ...payload, id: `order_${sourceType}_${suffix}`, status: 'created', amount_paid: 0, amount_due: payload.amount, attempts: 0 };
        return providerOrder;
      },
      fetch: async () => providerOrder,
      fetchPayments: async () => ({ items: [] }),
    } };
    const args = { invoice, shareId: `share_${sourceType}_${suffix}`, idempotencyKey: `${sourceType}_${suffix}`, customCheckout: true, provider };
    const simultaneous = await Promise.allSettled([
      createInvoiceCheckout(args),
      createInvoiceCheckout({ ...args, idempotencyKey: `parallel_${sourceType}_${suffix}` }),
    ]);
    const accepted = simultaneous.filter((result) => result.status === 'fulfilled');
    assert.ok(accepted.length >= 1, 'one simultaneous checkout must prepare');
    const prepared = accepted[0].value;
    for (const result of simultaneous) {
      if (result.status === 'fulfilled') {
        assert.equal(result.value.attempt.id, prepared.attempt.id);
        assert.equal(result.value.order.id, providerOrder.id);
      } else {
        assert.ok(['CHECKOUT_ALREADY_IN_PROGRESS', 'CHECKOUT_ATTEMPT_UNRESOLVED'].includes(result.reason.code), `unexpected concurrency error: ${result.reason.code}`);
      }
    }
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 1);
    assert.equal(prepared.order.amount, 1000);
    assert.equal(prepared.attempt.invoiceId, invoice.id);
    assert.equal(prepared.attempt.razorpayOrderId, providerOrder.id);
    const replay = await createInvoiceCheckout(args);
    assert.equal(replay.attempt.id, prepared.attempt.id);
    assert.equal(replay.order.id, providerOrder.id);
    assert.equal(calls, 1);
    const unchanged = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    assert.equal(Number(unchanged.paidAmount), 0);
    assert.equal(Number(unchanged.balanceDue), 10);
    // Keep these disposable fixtures out of the following outstanding-total case.
    await prisma.razorpayCheckoutAttempt.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', voidedAt: new Date() } });
  }
});

test('public invoice lookup resolves invoice, order, iron-bill and customer shares across billable services', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');

  const suffix = crypto.randomUUID();
  const invoiceIds = [];
  const shareHashes = [];
  const previousTestContact = process.env.RAZORPAY_TEST_CONTACT_NUMBER;
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';
  let order = null;
  let bill = null;
  let appointment = null;
  let subscription = null;
  let customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  const customerCreated = !customer;
  let subscriptionCreated = false;
  let legalTermsCreated = false;
  if (!customer) customer = await prisma.customer.create({ data: { name: 'Home', phone: '9930367267', notifWhatsApp: false } });
  const legalTermsKey = 'master.legalTerms';
  const existingLegalTerms = await prisma.setting.findUnique({ where: { key: legalTermsKey } });
  if (!existingLegalTerms) {
    await prisma.setting.create({ data: { key: legalTermsKey, value: JSON.stringify(LEGAL_TERMS) } });
    legalTermsCreated = true;
  }

  try {
    order = await prisma.order.create({ data: {
      orderNumber: `PUBLIC-ORDER-${suffix}`, customerId: customer.id, source: 'COUNTER', status: 'PICKED_UP',
      subtotal: 10, totalAmount: 10,
    } });
    subscription = await prisma.ironSubscription.findUnique({ where: { customerId: customer.id } });
    if (!subscription) {
      subscription = await prisma.ironSubscription.create({ data: { customerId: customer.id } });
      subscriptionCreated = true;
    }
    bill = await prisma.ironBill.create({ data: {
      billNumber: `PUBLIC-IRON-${suffix}`, customerId: customer.id, subscriptionId: subscription.id,
      billingPeriodStart: new Date('2023-01-01'), billingPeriodEnd: new Date('2023-01-31'),
      totalPieces: 1, totalAmount: 20,
    } });
    appointment = await prisma.serviceAppointment.create({ data: {
      appointmentNumber: `PUBLIC-FIELD-${suffix}`, customerId: customer.id,
      serviceName: 'Curtain cleaning CI', scheduledAt: new Date('2023-01-01'), totalAmount: 30,
    } });
    const dueDate = new Date('2023-01-02');
    const invoices = await Promise.all([
      prisma.invoice.create({ data: {
        invoiceNumber: `PUBLIC-ORDER-INV-${suffix}`, customerId: customer.id, orderId: order.id,
        sourceType: 'ORDER', status: 'OPEN', currency: 'INR', subtotal: 10, totalAmount: 10, balanceDue: 10, dueDate,
      } }),
      prisma.invoice.create({ data: {
        invoiceNumber: `PUBLIC-IRON-INV-${suffix}`, customerId: customer.id, ironBillId: bill.id,
        sourceType: 'DAILY_IRON', status: 'OPEN', currency: 'INR', subtotal: 20, totalAmount: 20, balanceDue: 20, dueDate,
      } }),
      prisma.invoice.create({ data: {
        invoiceNumber: `PUBLIC-FIELD-INV-${suffix}`, customerId: customer.id, serviceAppointmentId: appointment.id,
        sourceType: 'FIELD_SERVICE', status: 'OPEN', currency: 'INR', subtotal: 30, totalAmount: 30, balanceDue: 30, dueDate,
      } }),
    ]);
    invoiceIds.push(...invoices.map((invoice) => invoice.id));
    const shares = [
      ['INVOICE', invoices[0].id, invoices[0].invoiceNumber],
      ['ORDER', order.id, invoices[0].invoiceNumber],
      ['IRON_BILL', bill.id, invoices[1].invoiceNumber],
      ['INVOICE', invoices[2].id, invoices[2].invoiceNumber],
    ];
    for (const [resourceType, resourceId, expectedInvoiceNumber] of shares) {
      const token = await createPublicShareToken({ resourceType, resourceId, purpose: 'INVOICE_VIEW' });
      shareHashes.push(crypto.createHash('sha256').update(token).digest('hex'));
      const res = response();
      await getPublicInvoice({ params: { slug: token } }, res);
      assert.equal(res.statusCode, 200, `${resourceType} share must resolve`);
      assert.equal(res.body.data.invoice.invoiceNumber, expectedInvoiceNumber);
    }

    const customerToken = await createPublicShareToken({ resourceType: 'CUSTOMER', resourceId: customer.id, purpose: 'INVOICE_VIEW' });
    shareHashes.push(crypto.createHash('sha256').update(customerToken).digest('hex'));
    const customerRes = response();
    await getPublicInvoice({ params: { slug: customerToken } }, customerRes);
    assert.equal(customerRes.statusCode, 200);
    assert.equal(customerRes.body.data.paymentSummary.totals.balanceDue, 60);
    assert.deepEqual(
      customerRes.body.data.paymentSummary.receivables.map((invoice) => invoice.sourceType).sort(),
      ['DAILY_IRON', 'FIELD_SERVICE', 'ORDER'],
    );

    const expiredToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoices[0].id, purpose: 'INVOICE_VIEW' });
    const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
    shareHashes.push(expiredHash);
    await prisma.publicShareToken.updateMany({ where: { tokenHash: expiredHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const revokedToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoices[0].id, purpose: 'INVOICE_VIEW' });
    const revokedHash = crypto.createHash('sha256').update(revokedToken).digest('hex');
    shareHashes.push(revokedHash);
    await prisma.publicShareToken.updateMany({ where: { tokenHash: revokedHash }, data: { revokedAt: new Date() } });

    for (const [state, token] of [['expired', expiredToken], ['revoked', revokedToken]]) {
      const invoiceRes = response();
      await getPublicInvoice({ params: { slug: token } }, invoiceRes);
      assert.equal(invoiceRes.statusCode, 404, `${state} invoice share must not expose invoice details`);
      assert.equal(invoiceRes.body.success, false);

      const statusRes = response();
      await getPublicRazorpayCheckoutStatus({ params: { slug: token }, query: { invoiceId: invoices[0].id }, id: `${suffix}_${state}` }, statusRes);
      assert.equal(statusRes.statusCode, 404, `${state} invoice share must not expose payment status`);
      assert.equal(statusRes.body.success, false);

      const createRes = response();
      await createPublicRazorpayOrder({ params: { slug: token }, body: {}, id: `${suffix}_${state}`, get: () => `${suffix}_${state}` }, createRes);
      assert.equal(createRes.statusCode, 404, `${state} invoice share must not create a payable Razorpay order`);
      assert.equal(createRes.body.success, false);
    }
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoices[0].id } }), 0, 'expired/revoked links must not create checkout attempts');
  } finally {
    if (previousTestContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousTestContact;
    if (shareHashes.length) await prisma.publicShareToken.deleteMany({ where: { tokenHash: { in: shareHashes } } });
    if (invoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    if (order) await prisma.order.delete({ where: { id: order.id } });
    if (bill) await prisma.ironBill.delete({ where: { id: bill.id } });
    if (appointment) await prisma.serviceAppointment.delete({ where: { id: appointment.id } });
    if (subscriptionCreated && subscription) await prisma.ironSubscription.delete({ where: { id: subscription.id } });
    if (customerCreated) await prisma.customer.delete({ where: { id: customer.id } });
    if (legalTermsCreated) await prisma.setting.delete({ where: { key: legalTermsKey } });
  }
});

test('a revoked share can be reissued, but a cancelled source order still cannot start checkout', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');

  const previousEnv = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    testContact: process.env.RAZORPAY_TEST_CONTACT_NUMBER,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  process.env.RAZORPAY_KEY_SECRET = 'ci-only-not-a-provider-credential';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';

  const suffix = crypto.randomUUID();
  const customer = await prisma.customer.upsert({
    where: { phone: '9930367267' },
    update: {},
    create: { name: `Cancelled source CI ${suffix}`, phone: '9930367267', notifWhatsApp: false },
  });
  let order;
  let invoice;
  const shareHashes = [];
  const legalTermsKey = 'master.legalTerms';
  const hadLegalTerms = await prisma.setting.findUnique({ where: { key: legalTermsKey } });
  let createdLegalTerms = false;
  try {
    if (!hadLegalTerms) {
      await prisma.setting.create({ data: { key: legalTermsKey, value: JSON.stringify(LEGAL_TERMS) } });
      createdLegalTerms = true;
    }
    order = await prisma.order.create({ data: {
      orderNumber: `CANCELLED-SOURCE-${suffix}`,
      customerId: customer.id,
      source: 'COUNTER',
      status: 'CANCELLED',
      subtotal: 10,
      totalAmount: 10,
    } });
    invoice = await prisma.invoice.create({ data: {
      invoiceNumber: `CANCELLED-SOURCE-INV-${suffix}`,
      customerId: customer.id,
      orderId: order.id,
      sourceType: 'ORDER',
      status: 'OPEN',
      currency: 'INR',
      subtotal: 10,
      totalAmount: 10,
      balanceDue: 10,
      dueDate: new Date('2023-01-02'),
    } });

    const revokedToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const revokedHash = crypto.createHash('sha256').update(revokedToken).digest('hex');
    shareHashes.push(revokedHash);
    await prisma.publicShareToken.updateMany({ where: { tokenHash: revokedHash }, data: { revokedAt: new Date() } });

    const activeToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const activeHash = crypto.createHash('sha256').update(activeToken).digest('hex');
    shareHashes.push(activeHash);
    const invoiceRes = response();
    await getPublicInvoice({ params: { slug: activeToken } }, invoiceRes);
    assert.equal(invoiceRes.statusCode, 200, 'a replacement share may resolve the still-existing invoice');
    assert.equal(invoiceRes.body.data.invoice.invoiceNumber, invoice.invoiceNumber);

    const revokedRes = response();
    await getPublicInvoice({ params: { slug: revokedToken } }, revokedRes);
    assert.equal(revokedRes.statusCode, 404, 'the revoked share remains disabled');

    let providerOrderCalls = 0;
    const provider = { orders: { create: async () => { providerOrderCalls += 1; throw new Error('provider must not be called'); } } };
    const fullInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    await assert.rejects(
      createInvoiceCheckout({
        invoice: fullInvoice,
        shareId: activeHash,
        idempotencyKey: `cancelled_${suffix}`,
        provider,
      }),
      { code: 'ORDER_CANCELLED' },
    );
    assert.equal(providerOrderCalls, 0, 'cancelled source must be rejected before provider order creation');

    const createRes = response();
    await createPublicRazorpayOrder({ params: { slug: activeToken }, body: {}, id: suffix, get: () => `cancelled_${suffix}` }, createRes);
    assert.equal(createRes.statusCode, 409);
    assert.equal(createRes.body.code, 'ORDER_CANCELLED');
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 0);
  } finally {
    if (shareHashes.length) await prisma.publicShareToken.deleteMany({ where: { tokenHash: { in: shareHashes } } });
    if (invoice) await prisma.invoice.delete({ where: { id: invoice.id } });
    if (order) await prisma.order.delete({ where: { id: order.id } });
    if (createdLegalTerms) await prisma.setting.delete({ where: { key: legalTermsKey } });
    if (previousEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousEnv.keyId;
    if (previousEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousEnv.keySecret;
    if (previousEnv.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousEnv.testContact;
  }
});

test('combined checkout atomically settles two invoices and refuses overlap, stale balances and foreign links', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  const suffix = crypto.randomUUID();
  const customer = await prisma.customer.upsert({ where: { phone: '9930367267' }, update: {}, create: { name: `Combined CI ${suffix}`, phone: '9930367267', notifWhatsApp: false } });
  const invoices = [];
  for (const [index, amount] of [2680, 3200].entries()) {
    const order = await prisma.order.create({ data: { orderNumber: `COMBINED-${suffix}-${index}`, customerId: customer.id, source: 'COUNTER', status: 'PICKED_UP', subtotal: amount, totalAmount: amount } });
    invoices.push(await prisma.invoice.create({ data: { invoiceNumber: `COMBINED-${suffix}-${index}`, customerId: customer.id, orderId: order.id, sourceType: 'ORDER', status: 'OPEN', currency: 'INR', subtotal: amount, totalAmount: amount, balanceDue: amount, dueDate: new Date(1700000000000 + index * 1000) } }));
  }
  const allocationPlan = invoices.map((invoice) => ({ invoiceId: invoice.id, amount: Number(invoice.balanceDue) }));
  let providerOrder;
  let providerPayment;
  let created = 0;
  let receiptMatches = [];
  const provider = {
    orders: {
      create: async (payload) => {
        created += 1;
        providerOrder = { ...payload, id: `order_${suffix}`, status: 'created', amount_paid: 0, amount_due: payload.amount, attempts: 0 };
        throw Object.assign(new Error('Injected lost provider create response'), { code: 'ETIMEDOUT' });
      },
      all: async ({ receipt, count, skip }) => {
        assert.equal(receipt, providerOrder.receipt);
        assert.equal(count, 100);
        assert.equal(skip, 0);
        return { items: receiptMatches };
      },
      fetch: async () => providerOrder,
      fetchPayments: async () => ({ items: providerPayment ? [providerPayment] : [] }),
    },
    payments: { fetch: async () => providerPayment },
  };
  const args = { invoice: invoices[0], allocationPlan, shareId: `share_${suffix}`, idempotencyKey: suffix, customCheckout: true, provider };
  await assert.rejects(createInvoiceCheckout({ ...args, allocationPlan: [{ ...allocationPlan[0], amount: 1 }, allocationPlan[1]] }), { code: 'CHECKOUT_ATTEMPT_STALE' });
  assert.equal(created, 0);
  await assert.rejects(createInvoiceCheckout(args), { code: 'CHECKOUT_RESULT_UNKNOWN' });
  const lost = await prisma.razorpayCheckoutAttempt.findFirst({ where: { invoiceId: invoices[0].id } });
  assert.equal(lost.status, 'REVIEW');
  assert.equal(lost.razorpayOrderId, null);
  assert.equal(created, 1);
  await assert.rejects(createInvoiceCheckout({ ...args, idempotencyKey: `retry_${suffix}` }), { code: 'CHECKOUT_ALREADY_IN_PROGRESS' });
  for (const matches of [[], [providerOrder, { ...providerOrder, id: `duplicate_${suffix}` }]]) {
    receiptMatches = matches;
    await assert.rejects(reconcileAmbiguousOrderCreation({ attemptId: lost.id, actor: { requestId: suffix }, customCheckout: true, provider }), { code: 'CHECKOUT_RECONCILIATION_NO_UNIQUE_ORDER' });
    const blocked = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: lost.id } });
    assert.equal(blocked.status, 'REVIEW');
    assert.equal(blocked.razorpayOrderId, null);
    assert.equal(created, 1);
  }
  receiptMatches = [providerOrder];
  const reconciled = await reconcileAmbiguousOrderCreation({ attemptId: lost.id, actor: { requestId: suffix }, customCheckout: true, provider });
  assert.equal(reconciled.reused, true, 'only the matching zero-attempt provider order is made resumable');
  assert.equal(reconciled.attempt.status, 'CREATED');
  assert.equal(reconciled.attempt.razorpayOrderId, providerOrder.id);
  const checkout = await createInvoiceCheckout(args);
  assert.equal(checkout.order.amount, 588000);
  assert.equal(checkout.attempt.allocationPlan.length, 2);
  assert.equal(checkout.attempt.id, lost.id);
  assert.equal(created, 1, 'lost response recovery must never create a replacement provider order');
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
