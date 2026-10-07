const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const express = require('express');
const prisma = require('../src/config/database');
const { createInvoiceCheckout, reconcileAmbiguousOrderCreation, settleCapturedPayment } = require('../src/services/razorpay-invoice-checkout.service');
const { getOrderPayments, previewReceivablesReminder } = require('../src/controllers/payments.controller');
const { createPublicRazorpayOrder, getPublicInvoice, getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');
const { createPublicShareToken } = require('../src/services/publicShare.service');
const { createRazorpayRefund, processAutomaticRazorpayRefundBatch, reconcileRazorpayRefundWebhook } = require('../src/services/razorpay-refund.service');
const { recordInvoiceSettlement } = require('../src/services/payment.service');
const { processOutboxBatch } = require('../src/services/outbox.service');
const { processWebhook } = require('../src/services/razorpay-webhook-worker.service');
const { LEGAL_TERMS } = require('../src/config/master-data');
const publicRoutes = require('../src/routes/public.routes');

after(() => prisma.$disconnect());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('historical unpaid invoices prepare and reuse checkout across every billing source', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  const suffix = crypto.randomUUID();
  let customer;
  let customerCreated = false;
  let subscription;
  let subscriptionCreated = false;
  const sourceRecords = [];
  const invoiceIds = [];
  try {
    customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
    if (!customer) {
      customer = await prisma.customer.create({ data: { name: `Home QA ${suffix}`, phone: '9930367267', notifWhatsApp: false } });
      customerCreated = true;
    }
    for (const sourceType of ['ORDER', 'DAILY_IRON', 'FIELD_SERVICE']) {
      let source;
      if (sourceType === 'ORDER') {
        const order = await prisma.order.create({ data: { orderNumber: `SOURCE-${suffix}`, customerId: customer.id, source: 'COUNTER', status: 'PICKED_UP', subtotal: 10, totalAmount: 10 } });
        sourceRecords.push(['order', order.id]);
        source = { orderId: order.id };
      } else if (sourceType === 'DAILY_IRON') {
        subscription = await prisma.ironSubscription.create({ data: { customerId: customer.id } });
        subscriptionCreated = true;
        const bill = await prisma.ironBill.create({ data: { billNumber: `SOURCE-${suffix}`, customerId: customer.id, subscriptionId: subscription.id, billingPeriodStart: new Date('2023-01-01'), billingPeriodEnd: new Date('2023-01-31'), totalPieces: 1, totalAmount: 10 } });
        sourceRecords.push(['ironBill', bill.id]);
        source = { ironBillId: bill.id };
      } else {
        const appointment = await prisma.serviceAppointment.create({ data: { appointmentNumber: `SOURCE-${suffix}`, customerId: customer.id, serviceName: 'Curtain cleaning CI', scheduledAt: new Date('2023-01-01'), totalAmount: 10 } });
        sourceRecords.push(['serviceAppointment', appointment.id]);
        source = { serviceAppointmentId: appointment.id };
      }
      const invoice = await prisma.invoice.create({ data: {
        invoiceNumber: `SOURCE-${sourceType}-${suffix}`, customerId: customer.id, sourceType, ...source,
        status: 'OPEN', currency: 'INR', subtotal: 10, totalAmount: 10, balanceDue: 10,
        issueDate: new Date('2023-01-01T00:00:00Z'), dueDate: new Date('2023-01-02T00:00:00Z'),
      } });
      invoiceIds.push(invoice.id);
      let calls = 0;
      let providerOrder;
      const provider = { orders: {
        create: async (payload) => {
          calls += 1;
          const sourceCode = { ORDER: 'o', DAILY_IRON: 'd', FIELD_SERVICE: 'f' }[sourceType];
          providerOrder = { ...payload, id: `order_${sourceCode}${suffix.replaceAll('-', '')}`, status: 'created', amount_paid: 0, amount_due: payload.amount, attempts: 0 };
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
      assert.match(providerOrder.id, /^order_[A-Za-z0-9]{6,40}$/);
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
      assert.match(prepared.attempt.paymentJourneyId, /^pj_[0-9a-f-]{36}$/i);
      const journeyEvents = await prisma.razorpayPaymentJourneyEvent.findMany({
        where: { checkoutAttemptId: prepared.attempt.id },
        orderBy: { occurredAt: 'asc' },
      });
      assert.deepEqual(journeyEvents.map((event) => event.eventName).sort(), [
        'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED', 'RAZORPAY_PROVIDER_ORDER_CREATED',
      ].sort());
      assert.ok(journeyEvents.every((event) => event.paymentJourneyId === prepared.attempt.paymentJourneyId));
      assert.equal(journeyEvents.find((event) => event.eventName === 'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED').razorpayOrderId, null);
      assert.equal(journeyEvents.find((event) => event.eventName === 'RAZORPAY_PROVIDER_ORDER_CREATED').razorpayOrderId, providerOrder.id);
      assert.ok(journeyEvents.every((event) => event.requestId === null));
      assert.ok(journeyEvents.every((event) => /^[0-9a-f]{32}$/.test(event.traceId)));
      assert.ok(journeyEvents.every((event) => /^[0-9a-f]{16}$/.test(event.spanId)));
      const replay = await createInvoiceCheckout(args);
      assert.equal(replay.attempt.id, prepared.attempt.id);
      assert.equal(replay.order.id, providerOrder.id);
      assert.equal(calls, 1);
      const unchanged = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      assert.equal(Number(unchanged.paidAmount), 0);
      assert.equal(Number(unchanged.balanceDue), 10);
    }
  } finally {
    if (invoiceIds.length) {
      const attempts = await prisma.razorpayCheckoutAttempt.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { id: true } });
      if (attempts.length) await prisma.razorpayPaymentJourneyEvent.deleteMany({ where: { checkoutAttemptId: { in: attempts.map((attempt) => attempt.id) } } });
      await prisma.razorpayCheckoutAttempt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    for (const [model, id] of sourceRecords.reverse()) await prisma[model].delete({ where: { id } });
    if (subscriptionCreated && subscription) await prisma.ironSubscription.delete({ where: { id: subscription.id } });
    if (customerCreated && customer) await prisma.customer.delete({ where: { id: customer.id } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
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

    const previewRes = response();
    await previewReceivablesReminder({
      body: { customerId: customer.id, invoiceIds: [invoices[0].id, invoices[2].id] }, id: `${suffix}_preview`,
    }, previewRes);
    assert.equal(previewRes.statusCode, 200);
    const scopedToken = previewRes.body.data.paymentPath.split('/').pop();
    shareHashes.push(crypto.createHash('sha256').update(scopedToken).digest('hex'));
    const scopedRes = response();
    await getPublicInvoice({ params: { slug: scopedToken } }, scopedRes);
    assert.equal(scopedRes.statusCode, 200);
    assert.deepEqual(scopedRes.body.data.paymentSummary.receivables.map((invoice) => invoice.invoiceId).sort(), [invoices[0].id, invoices[2].id].sort());
    assert.equal(scopedRes.body.data.paymentSummary.totals.balanceDue, 40);

    const excludedStatusRes = response();
    await getPublicRazorpayCheckoutStatus({
      params: { slug: scopedToken }, query: { invoiceId: invoices[1].id }, id: `${suffix}_excluded`,
    }, excludedStatusRes);
    assert.equal(excludedStatusRes.statusCode, 404);
    assert.equal(excludedStatusRes.body.code, 'INVOICE_NOT_FOUND');

    await prisma.invoice.update({ where: { id: invoices[0].id }, data: { status: 'PAID', paidAmount: 10, balanceDue: 0 } });
    const updatedScopedRes = response();
    await getPublicInvoice({ params: { slug: scopedToken } }, updatedScopedRes);
    assert.equal(updatedScopedRes.statusCode, 200);
    assert.deepEqual(updatedScopedRes.body.data.paymentSummary.receivables.map((invoice) => invoice.invoiceId), [invoices[2].id]);
    assert.equal(updatedScopedRes.body.data.paymentSummary.totals.balanceDue, 30);

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
  let customer;
  let customerCreated = false;
  let order;
  let invoice;
  const shareHashes = [];
  const legalTermsKey = 'master.legalTerms';
  const hadLegalTerms = await prisma.setting.findUnique({ where: { key: legalTermsKey } });
  let createdLegalTerms = false;
  try {
    customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
    if (!customer) {
      customer = await prisma.customer.create({ data: { name: 'Home', phone: '9930367267', notifWhatsApp: false } });
      customerCreated = true;
    }
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
    if (customerCreated) await prisma.customer.delete({ where: { id: customer.id } });
    if (previousEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousEnv.keyId;
    if (previousEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousEnv.keySecret;
    if (previousEnv.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousEnv.testContact;
  }
});

test('returned orders and cancelled field-service appointments are not payable or included in customer totals', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
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
  let customer;
  let subscription;
  const invoiceIds = [];
  const shareHashes = [];
  const sourceRecords = [];
  let customerCreated = false;
  let subscriptionCreated = false;
  const legalTermsKey = 'master.legalTerms';
  const hadLegalTerms = await prisma.setting.findUnique({ where: { key: legalTermsKey } });
  let createdLegalTerms = false;
  try {
    customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } })
    if (!customer) {
      customer = await prisma.customer.create({ data: { name: 'Home', phone: '9930367267', notifWhatsApp: false } });
      customerCreated = true;
    }
    if (!hadLegalTerms) {
      await prisma.setting.create({ data: { key: legalTermsKey, value: JSON.stringify(LEGAL_TERMS) } });
      createdLegalTerms = true;
    }
    const sources = [
      {
        sourceType: 'ORDER',
        create: async () => {
          const source = await prisma.order.create({ data: {
            orderNumber: `RETURNED-SOURCE-${suffix}`, customerId: customer.id,
            source: 'COUNTER', status: 'RETURNED', subtotal: 10, totalAmount: 10,
          } });
          sourceRecords.push(['order', source.id]);
          return { orderId: source.id };
        },
        expectedCode: 'ORDER_CANCELLED',
      },
      {
        sourceType: 'FIELD_SERVICE',
        create: async () => {
          const source = await prisma.serviceAppointment.create({ data: {
            appointmentNumber: `CANCELLED-FIELD-${suffix}`, customerId: customer.id,
            serviceName: 'Field service CI', scheduledAt: new Date('2023-01-01'), totalAmount: 10,
            status: 'CANCELLED',
          } });
          sourceRecords.push(['serviceAppointment', source.id]);
          return { serviceAppointmentId: source.id };
        },
        expectedCode: 'APPOINTMENT_CANCELLED',
      },
      {
        sourceType: 'DAILY_IRON',
        create: async () => {
          subscription = await prisma.ironSubscription.findUnique({ where: { customerId: customer.id } });
          if (!subscription) {
            subscription = await prisma.ironSubscription.create({ data: { customerId: customer.id } });
            subscriptionCreated = true;
          }
          const source = await prisma.ironBill.create({ data: {
            billNumber: `VOID-IRON-SOURCE-${suffix}`, customerId: customer.id, subscriptionId: subscription.id,
            billingPeriodStart: new Date('2023-01-01'), billingPeriodEnd: new Date('2023-01-31'),
            totalPieces: 1, totalAmount: 10, status: 'VOID',
          } });
          sourceRecords.push(['ironBill', source.id]);
          return { ironBillId: source.id };
        },
        expectedCode: 'BILL_VOID',
      },
    ];

    for (const sourceCase of sources) {
      const source = await sourceCase.create();
      const invoice = await prisma.invoice.create({ data: {
        invoiceNumber: `${sourceCase.sourceType}-SOURCE-INV-${suffix}`,
        customerId: customer.id,
        sourceType: sourceCase.sourceType,
        ...source,
        status: 'OPEN',
        currency: 'INR',
        subtotal: 10,
        totalAmount: 10,
        balanceDue: 10,
        dueDate: new Date('2023-01-02'),
      } });
      invoiceIds.push(invoice.id);
      const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
      shareHashes.push(crypto.createHash('sha256').update(token).digest('hex'));

      let providerCalls = 0;
      const provider = { orders: { create: async () => { providerCalls += 1; throw new Error('ineligible source must not reach provider'); } } };
      await assert.rejects(createInvoiceCheckout({
        invoice,
        shareId: `share_${suffix}`,
        idempotencyKey: `ineligible_${invoice.id}`,
        customCheckout: true,
        provider,
      }), { code: sourceCase.expectedCode });
      assert.equal(providerCalls, 0);

      const createRes = response();
      await createPublicRazorpayOrder({ params: { slug: token }, body: {}, id: suffix, get: () => `ineligible_${invoice.id}` }, createRes, undefined, { logRazorpayAction: async () => {} });
      assert.equal(createRes.statusCode, 409);
      assert.equal(createRes.body.code, sourceCase.expectedCode);
      assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 0);
    }

    const customerToken = await createPublicShareToken({ resourceType: 'CUSTOMER', resourceId: customer.id, purpose: 'INVOICE_VIEW' });
    shareHashes.push(crypto.createHash('sha256').update(customerToken).digest('hex'));
    const customerRes = response();
    await getPublicInvoice({ params: { slug: customerToken } }, customerRes);
    assert.equal(customerRes.statusCode, 200);
    assert.equal(customerRes.body.data.paymentSummary.receivables.some((item) => invoiceIds.includes(item.invoiceId)), false);
  } finally {
    if (shareHashes.length) await prisma.publicShareToken.deleteMany({ where: { tokenHash: { in: shareHashes } } });
    if (invoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    for (const [model, id] of sourceRecords.reverse()) await prisma[model].delete({ where: { id } });
    if (subscriptionCreated && subscription) await prisma.ironSubscription.delete({ where: { id: subscription.id } });
    if (createdLegalTerms) await prisma.setting.delete({ where: { key: legalTermsKey } });
    if (customerCreated && customer) await prisma.customer.delete({ where: { id: customer.id } });
    if (previousEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousEnv.keyId;
    if (previousEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousEnv.keySecret;
    if (previousEnv.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousEnv.testContact;
  }
});

test('registered public create-order route prepares and reuses one provider order for active shares across billing sources', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
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
  let customer;
  let subscription;
  let customerCreated = false;
  let subscriptionCreated = false;
  const sources = [];
  const invoiceIds = [];
  const shareHashes = [];
  const providerOrders = new Map();
  let providerCreateCalls = 0;
  const provider = { orders: {
    create: async (payload) => {
      providerCreateCalls += 1;
      const order = {
        id: `order_ci${suffix.replaceAll('-', '')}${providerCreateCalls}`,
        amount: payload.amount,
        currency: payload.currency,
        status: 'created',
        amount_paid: 0,
        amount_due: payload.amount,
        attempts: 0,
        receipt: payload.receipt,
        notes: payload.notes,
      };
      providerOrders.set(order.id, order);
      return order;
    },
    fetch: async (id) => providerOrders.get(id),
    fetchPayments: async () => ({ items: [] }),
  } };
  const routeLayer = publicRoutes.stack.find((layer) => layer.route?.path === '/invoices/:slug/payment/create-order' && layer.route.methods.post);
  assert.ok(routeLayer, 'production public router must register the create-order endpoint');
  const endpoint = routeLayer.route.stack.at(-1);
  const originalHandler = endpoint.handle;
  const { createPublicRazorpayOrder: createOrderHandler } = require('../src/controllers/public.controller');
  endpoint.handle = (req, res, next) => createOrderHandler(req, res, next, {
    provider,
    logRazorpayAction: async () => {},
  });
  const app = express();
  app.use('/api/v1/public', publicRoutes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
    if (!customer) {
      customer = await prisma.customer.create({ data: { name: 'Home', phone: '9930367267', notifWhatsApp: false } });
      customerCreated = true;
    }
    subscription = await prisma.ironSubscription.findUnique({ where: { customerId: customer.id } });
    if (!subscription) {
      subscription = await prisma.ironSubscription.create({ data: { customerId: customer.id } });
      subscriptionCreated = true;
    }
    const sourceCases = [
      {
        sourceType: 'ORDER',
        create: async () => {
          const row = await prisma.order.create({ data: {
            orderNumber: `ACTIVE-SHARE-ORDER-${suffix}`, customerId: customer.id,
            source: 'COUNTER', status: 'PICKED_UP', subtotal: 10, totalAmount: 10,
          } });
          sources.push(['order', row.id]);
          return { orderId: row.id };
        },
        shareType: 'ORDER',
        shareKey: 'orderId',
      },
      {
        sourceType: 'DAILY_IRON',
        create: async () => {
          const row = await prisma.ironBill.create({ data: {
            billNumber: `ACTIVE-SHARE-IRON-${suffix}`, customerId: customer.id, subscriptionId: subscription.id,
            billingPeriodStart: new Date('2023-01-01'), billingPeriodEnd: new Date('2023-01-31'),
            totalPieces: 1, totalAmount: 10,
          } });
          sources.push(['ironBill', row.id]);
          return { ironBillId: row.id };
        },
        shareType: 'IRON_BILL',
        shareKey: 'ironBillId',
      },
      {
        sourceType: 'FIELD_SERVICE',
        create: async () => {
          const row = await prisma.serviceAppointment.create({ data: {
            appointmentNumber: `ACTIVE-SHARE-FIELD-${suffix}`, customerId: customer.id,
            serviceName: 'Field service CI', scheduledAt: new Date('2023-01-01'), totalAmount: 10,
          } });
          sources.push(['serviceAppointment', row.id]);
          return { serviceAppointmentId: row.id };
        },
        shareType: 'INVOICE',
        shareKey: 'invoiceId',
      },
    ];

    for (const sourceCase of sourceCases) {
      const source = await sourceCase.create();
      const invoice = await prisma.invoice.create({ data: {
        invoiceNumber: `ACTIVE-SHARE-${sourceCase.sourceType}-${suffix}`,
        customerId: customer.id,
        sourceType: sourceCase.sourceType,
        ...source,
        status: 'OPEN',
        currency: 'INR',
        subtotal: 10,
        totalAmount: 10,
        balanceDue: 10,
        issueDate: new Date('2023-01-01'),
        dueDate: new Date('2023-01-02'),
      } });
      invoiceIds.push(invoice.id);
      const token = await createPublicShareToken({ resourceType: sourceCase.shareType, resourceId: sourceCase.shareKey === 'invoiceId' ? invoice.id : source[sourceCase.shareKey], purpose: 'INVOICE_VIEW' });
      shareHashes.push(crypto.createHash('sha256').update(token).digest('hex'));
      const idempotencyKey = `public_active_${sourceCase.sourceType}_${suffix}`;
      const requestCheckout = () => fetch(`http://127.0.0.1:${server.address().port}/api/v1/public/invoices/${token}/payment/create-order`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json' },
        body: '{}',
      });

      const firstResponse = await requestCheckout();
      const first = await firstResponse.json();
      assert.equal(firstResponse.status, 200, `${sourceCase.sourceType} active share should prepare checkout: ${JSON.stringify(first)}`);
      assert.equal(first.data.amount, 1000);
      assert.equal(first.data.currency, 'INR');
      assert.equal(first.data.invoiceNumber, invoice.invoiceNumber);
      assert.match(first.data.razorpayOrderId, /^order_[a-z0-9]+$/i);
      assert.equal(first.data.mode, 'TEST');

      const replayResponse = await requestCheckout();
      const replay = await replayResponse.json();
      assert.equal(replayResponse.status, 200);
      assert.equal(replay.data.checkoutAttemptId, first.data.checkoutAttemptId);
      assert.equal(replay.data.razorpayOrderId, first.data.razorpayOrderId);
      assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 1);
      assert.equal(providerCreateCalls, sourceCases.indexOf(sourceCase) + 1);
      const unchanged = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      assert.equal(Number(unchanged.paidAmount), 0);
      assert.equal(Number(unchanged.balanceDue), 10);
    }
  } finally {
    endpoint.handle = originalHandler;
    await new Promise((resolve) => server.close(resolve));
    if (shareHashes.length) await prisma.publicShareToken.deleteMany({ where: { tokenHash: { in: shareHashes } } });
    if (invoiceIds.length) {
      const attempts = await prisma.razorpayCheckoutAttempt.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { id: true } });
      if (attempts.length) await prisma.razorpayPaymentJourneyEvent.deleteMany({ where: { checkoutAttemptId: { in: attempts.map((attempt) => attempt.id) } } });
      await prisma.razorpayCheckoutAttempt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    for (const [model, id] of sources.reverse()) await prisma[model].delete({ where: { id } });
    if (subscriptionCreated && subscription) await prisma.ironSubscription.delete({ where: { id: subscription.id } });
    if (customerCreated && customer) await prisma.customer.delete({ where: { id: customer.id } });
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
  for (const invoice of invoices) {
    const freshToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const freshHash = crypto.createHash('sha256').update(freshToken).digest('hex');
    try {
      const freshStatus = response();
      await getPublicRazorpayCheckoutStatus({
        params: { slug: freshToken }, query: { invoiceId: invoice.id, checkoutIntegration: 'CUSTOM' }, id: `${suffix}_${invoice.id}`,
      }, freshStatus);
      assert.equal(freshStatus.statusCode, 200);
      assert.equal(freshStatus.body.data.status, 'CAPTURED', 'a new share should resolve its invoice-scoped ledger capture');
      assert.equal(freshStatus.body.data.paymentId, providerPayment.id);
      assert.equal(freshStatus.body.data.razorpayOrderId, providerOrder.id);
      assert.deepEqual(freshStatus.body.data.allocations, [{
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountPaise: String(Math.round(Number(invoice.totalAmount) * 100)),
      }], 'a single-invoice share must not expose another invoice allocation');
    } finally {
      await prisma.publicShareToken.deleteMany({ where: { tokenHash: freshHash } });
    }
  }
  const replay = await settleCapturedPayment({ paymentId: providerPayment.id, providerOrderId: providerOrder.id, provider });
  assert.equal(replay.alreadyRecorded, true);
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id } }), 1);
  assert.equal(await prisma.receipt.count({ where: { paymentId: settled.payment.id } }), 1);
  let paymentNotification = await prisma.outboxEvent.findUnique({ where: { dedupeKey: `payment-received:${settled.payment.id}` } });
  assert.ok(paymentNotification);
  assert.equal(paymentNotification.payload.checkoutAttemptId, settled.attempt.id);
  assert.equal(paymentNotification.payload.paymentJourneyId, settled.attempt.paymentJourneyId);
  assert.equal(await processOutboxBatch({ onlyEventId: paymentNotification.id }), 1,
    'the Home QA fixture has WhatsApp disabled, so the targeted notification is safely recorded as skipped without a provider send');
  paymentNotification = await prisma.outboxEvent.findUnique({ where: { id: paymentNotification.id } });
  assert.equal(paymentNotification.status, 'PROCESSED');
  const notificationJourney = await prisma.razorpayPaymentJourneyEvent.findMany({
    where: { checkoutAttemptId: settled.attempt.id, eventName: { startsWith: 'RAZORPAY_NOTIFICATION_' } },
    orderBy: { occurredAt: 'asc' },
  });
  assert.deepEqual(notificationJourney.map(({ eventName, outcome }) => [eventName, outcome]), [
    ['RAZORPAY_NOTIFICATION_QUEUED', 'SUCCESS'],
    ['RAZORPAY_NOTIFICATION_SKIPPED', 'IGNORED'],
  ]);
  assert.equal(notificationJourney[0].diagnostics.sourceOutboxEventId, paymentNotification.id);
  assert.equal(notificationJourney[1].diagnostics.notificationProviderOutcome, 'SKIPPED');
  assert.equal(JSON.stringify(notificationJourney.map((item) => item.diagnostics)).includes('9930367267'), false);

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

test('A18 public retry preserves an ambiguous old order, frozen invoice split, and webhook settlement after share revocation', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');

  const previousEnv = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    testContact: process.env.RAZORPAY_TEST_CONTACT_NUMBER,
    customDisabled: process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_a18_local_acceptance';
  process.env.RAZORPAY_KEY_SECRET = 'local-injected-provider-only';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';
  process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED = 'false';

  const suffix = crypto.randomUUID();
  let customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  const customerCreated = !customer;
  if (!customer) customer = await prisma.customer.create({ data: { name: 'Home QA', phone: '9930367267', notifWhatsApp: false } });
  const invoiceIds = [];
  const orderIds = [];
  const shareHashes = [];
  const paymentIds = [];
  let checkoutAttemptIds = [];
  const providerOrders = new Map();
  const providerPaymentsByOrder = new Map();
  const providerPaymentsById = new Map();
  let providerCreateCalls = 0;
  let combinedAttemptId = null;
  let thirdInvoice;
  const legalTermsKey = 'master.legalTerms';
  let legalTermsCreated = false;

  const createInvoice = async (label, amount, dueOffset) => {
    const order = await prisma.order.create({ data: {
      orderNumber: `A18-${suffix}-${label}`, customerId: customer.id,
      source: 'COUNTER', status: 'PICKED_UP', subtotal: amount, totalAmount: amount,
    } });
    orderIds.push(order.id);
    const invoice = await prisma.invoice.create({ data: {
      invoiceNumber: `A18-${suffix}-${label}`, customerId: customer.id,
      orderId: order.id, sourceType: 'ORDER', status: 'OPEN', currency: 'INR',
      subtotal: amount, totalAmount: amount, paidAmount: 0, balanceDue: amount,
      issueDate: new Date(1700000000000 + dueOffset), dueDate: new Date(1700001000000 + dueOffset),
    } });
    invoiceIds.push(invoice.id);
    return invoice;
  };
  const addShareHash = (token) => {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    shareHashes.push(tokenHash);
    return tokenHash;
  };

  const provider = {
    orders: {
      create: async (payload) => {
        providerCreateCalls += 1;
        const order = {
          ...payload,
          id: `order_a18_${suffix.replaceAll('-', '')}_${providerCreateCalls}`,
          status: 'created', amount_paid: 0, amount_due: payload.amount, attempts: 0,
        };
        providerOrders.set(order.id, order);
        if (providerCreateCalls === 1) throw Object.assign(new Error('Injected lost order-create response'), { code: 'ETIMEDOUT' });
        return order;
      },
      all: async ({ receipt }) => ({ items: [...providerOrders.values()].filter((order) => order.receipt === receipt) }),
      fetch: async (id) => providerOrders.get(id),
      fetchPayments: async (id) => {
        const items = providerPaymentsByOrder.get(id) || [];
        return { count: items.length, items };
      },
    },
    payments: { fetch: async (id) => providerPaymentsById.get(id) },
  };
  const callPublicCreate = async (slug, body, idempotencyKey) => {
    const res = response();
    await createPublicRazorpayOrder({
      params: { slug }, body, headers: {}, id: `a18-${suffix}`,
      get: (header) => header === 'Idempotency-Key' ? idempotencyKey : undefined,
    }, res, null, { provider, logRazorpayAction: async () => {} });
    return res;
  };

  try {
    if (!await prisma.setting.findUnique({ where: { key: legalTermsKey } })) {
      await prisma.setting.create({ data: { key: legalTermsKey, value: JSON.stringify(LEGAL_TERMS) } });
      legalTermsCreated = true;
    }
    const firstInvoice = await createInvoice('A', 10, 1);
    const secondInvoice = await createInvoice('B', 20, 2);
    const customerToken = await createPublicShareToken({
      resourceType: 'CUSTOMER', resourceId: customer.id, purpose: 'INVOICE_VIEW',
      invoiceIds: [firstInvoice.id, secondInvoice.id],
    });
    const customerHash = addShareHash(customerToken);
    const customerShare = await prisma.publicShareToken.findUnique({ where: { tokenHash: customerHash } });
    const invoiceToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: firstInvoice.id, purpose: 'INVOICE_VIEW' });
    const invoiceHash = addShareHash(invoiceToken);
    const invoiceShare = await prisma.publicShareToken.findUnique({ where: { tokenHash: invoiceHash } });

    const individualStart = await callPublicCreate(invoiceToken, {
      checkoutIntegration: 'CUSTOM', invoiceId: firstInvoice.id, expectedAmountPaise: 1000,
    }, `a18-individual-${suffix}`);
    assert.equal(individualStart.statusCode, 503);
    assert.equal(individualStart.body.code, 'CHECKOUT_RESULT_UNKNOWN');
    let oldAttempt = await prisma.razorpayCheckoutAttempt.findFirst({ where: { invoiceId: firstInvoice.id } });
    assert.ok(oldAttempt);
    assert.equal(oldAttempt.status, 'REVIEW');
    assert.equal(oldAttempt.razorpayOrderId, null);
    assert.equal(providerCreateCalls, 1);

    const recovered = await reconcileAmbiguousOrderCreation({
      attemptId: oldAttempt.id, actor: { requestId: `a18-${suffix}` }, customCheckout: true, provider,
    });
    oldAttempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: oldAttempt.id } });
    assert.equal(recovered.reused, true);
    assert.equal(oldAttempt.status, 'CREATED');
    assert.ok(oldAttempt.razorpayOrderId);
    assert.equal(providerCreateCalls, 1, 'receipt recovery must not create a replacement order');

    const staleTotal = await callPublicCreate(customerToken, {
      checkoutIntegration: 'CUSTOM', invoiceId: firstInvoice.id, paymentScope: 'CUSTOMER_OUTSTANDING',
      supersedeAttemptId: oldAttempt.id, expectedAmountPaise: 2999,
    }, `a18-stale-${suffix}`);
    assert.equal(staleTotal.statusCode, 409);
    assert.equal(staleTotal.body.code, 'CHECKOUT_ATTEMPT_STALE');
    assert.equal(providerCreateCalls, 1, 'the stale amount must be rejected before another provider order is created');
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: oldAttempt.id } })).status, 'CREATED',
      'a stale confirmation must not supersede the previous checkout');

    const combined = await callPublicCreate(customerToken, {
      checkoutIntegration: 'CUSTOM', invoiceId: firstInvoice.id, paymentScope: 'CUSTOMER_OUTSTANDING',
      supersedeAttemptId: oldAttempt.id, expectedAmountPaise: 3000,
    }, `a18-combined-${suffix}`);
    assert.equal(combined.statusCode, 200, JSON.stringify(combined.body));
    assert.equal(combined.body.data.amount, 3000);
    combinedAttemptId = combined.body.data.checkoutAttemptId;
    assert.notEqual(combinedAttemptId, oldAttempt.id);
    assert.equal(providerCreateCalls, 2);
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: oldAttempt.id } })).status, 'SUPERSEDED');
    let combinedAttempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: combinedAttemptId } });
    assert.deepEqual(combinedAttempt.allocationPlan.map((item) => item.invoiceId), [firstInvoice.id, secondInvoice.id]);
    assert.equal(Number(combinedAttempt.amountPaise), 3000);
    assert.equal(combinedAttempt.publicShareId, customerShare.id);
    thirdInvoice = await createInvoice('C', 5, 3);

    const publicSummary = response();
    await getPublicInvoice({ params: { slug: customerToken } }, publicSummary);
    assert.equal(publicSummary.body.data.paymentSummary.invoiceCount, 2);
    assert.equal(publicSummary.body.data.paymentSummary.totals.balanceDue, 30);

    const orderFor = (attempt) => providerOrders.get(attempt.razorpayOrderId);
    const oldOrder = providerOrders.get(oldAttempt.razorpayOrderId);
    const oldPayment = {
      id: `pay_a18_old_${suffix.replaceAll('-', '')}`, order_id: oldOrder.id,
      amount: 1000, currency: 'INR', status: 'captured', captured: true, method: 'card',
    };
    oldOrder.status = 'paid'; oldOrder.amount_paid = 1000; oldOrder.amount_due = 0; oldOrder.attempts = 1;
    providerPaymentsById.set(oldPayment.id, oldPayment);
    providerPaymentsByOrder.set(oldOrder.id, [oldPayment]);
    const oldCapture = await settleCapturedPayment({ paymentId: oldPayment.id, providerOrderId: oldOrder.id, source: 'WEBHOOK', provider });
    paymentIds.push(oldCapture.payment.id);
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: oldAttempt.id } })).status, 'CAPTURED',
      'a late capture remains attributable even after its attempt was superseded');
    const summaryAfterAnchorPaid = response();
    await getPublicInvoice({ params: { slug: customerToken } }, summaryAfterAnchorPaid);
    assert.equal(summaryAfterAnchorPaid.body.data.paymentSummary.invoiceCount, 1,
      'the paid anchor invoice disappears from the current outstanding summary');
    assert.equal(summaryAfterAnchorPaid.body.data.paymentSummary.totals.balanceDue, 20);

    const resumedStatus = response();
    await getPublicRazorpayCheckoutStatus({
      params: { slug: customerToken }, query: { invoiceId: secondInvoice.id, checkoutIntegration: 'CUSTOM' }, headers: {}, id: `a18-status-${suffix}`,
    }, resumedStatus, null, { getRazorpay: () => provider });
    assert.equal(resumedStatus.statusCode, 200);
    assert.equal(resumedStatus.body.data.attemptId, combinedAttemptId,
      'the combined payment remains discoverable after its anchor invoice disappears from outstanding balances');
    assert.equal(resumedStatus.body.data.status, 'CREATED');
    assert.equal(providerCreateCalls, 2, 'status/reopen reads must never create another order');

    await prisma.publicShareToken.update({ where: { id: customerShare.id }, data: { revokedAt: new Date() } });
    const revokedStatus = response();
    await getPublicRazorpayCheckoutStatus({
      params: { slug: customerToken }, query: { invoiceId: secondInvoice.id, checkoutIntegration: 'CUSTOM' }, headers: {}, id: `a18-revoked-${suffix}`,
    }, revokedStatus, null, { getRazorpay: () => provider });
    assert.equal(revokedStatus.statusCode, 404, 'a revoked public link no longer exposes checkout status');

    const combinedOrder = orderFor(combinedAttempt);
    const combinedPayment = {
      id: `pay_a18_combined_${suffix.replaceAll('-', '')}`, order_id: combinedOrder.id,
      amount: 3000, currency: 'INR', status: 'captured', captured: true, method: 'card',
    };
    combinedOrder.status = 'paid'; combinedOrder.amount_paid = 3000; combinedOrder.amount_due = 0; combinedOrder.attempts = 1;
    providerPaymentsById.set(combinedPayment.id, combinedPayment);
    providerPaymentsByOrder.set(combinedOrder.id, [combinedPayment]);
    const webhook = await processWebhook({
      event: 'payment.captured', eventId: `a18-event-${suffix}`, paymentId: combinedPayment.id,
      orderId: combinedOrder.id, mode: 'TEST',
    }, { razorpayProvider: provider });
    assert.equal(webhook.state, 'PROCESSED', 'a signed-provider event can settle an existing attempt after its public share is revoked');
    paymentIds.push(await prisma.payment.findFirst({ where: { razorpayPaymentId: combinedPayment.id } }).then((payment) => payment.id));

    const allocations = await prisma.paymentAllocation.findMany({
      where: { payment: { razorpayPaymentId: combinedPayment.id }, status: 'POSTED' },
      orderBy: { invoiceId: 'asc' },
    });
    assert.deepEqual(allocations.map((item) => [item.invoiceId, Math.round(Number(item.amount) * 100)]), [[secondInvoice.id, 2000]]);
    const thirdAfter = await prisma.invoice.findUnique({ where: { id: thirdInvoice.id } });
    assert.equal(Number(thirdAfter.balanceDue), 5, 'an invoice created after the checkout snapshot is not swept into the old payment');
    assert.equal(Number((await prisma.payment.findFirst({ where: { razorpayPaymentId: combinedPayment.id } })).unallocatedAmount), 10);

    const refundProvider = async ({ paymentId, amountPaise, attempt }) => ({
      id: `rfnd_a18_${suffix.replaceAll('-', '')}`, payment_id: paymentId,
      amount: Number(amountPaise), currency: 'INR', status: 'processed',
      notes: { crm_refund_attempt_id: attempt.id },
    });
    const refundResult = await processAutomaticRazorpayRefundBatch({ provider: refundProvider });
    assert.deepEqual(refundResult, { claimed: 1, processed: 1 });
    const refundAttempt = await prisma.razorpayRefundAttempt.findFirst({ where: { checkoutAttemptId: combinedAttemptId, automatic: true } });
    assert.ok(refundAttempt);
    assert.equal(refundAttempt.status, 'PROCESSED');
    assert.equal(refundAttempt.amountPaise, 1000n);
    assert.equal(refundAttempt.sourcePaymentId, paymentIds.at(-1));
    paymentIds.push(refundAttempt.localRefundPaymentId);
    assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', razorpayRefundId: refundAttempt.razorpayRefundId } }), 1);
  } finally {
    const attempts = invoiceIds.length
      ? await prisma.razorpayCheckoutAttempt.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { id: true } })
      : [];
    checkoutAttemptIds = attempts.map((attempt) => attempt.id);
    const refundAttempts = checkoutAttemptIds.length
      ? await prisma.razorpayRefundAttempt.findMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } }, select: { id: true, localRefundPaymentId: true } })
      : [];
    paymentIds.push(...refundAttempts.map((attempt) => attempt.localRefundPaymentId).filter(Boolean));
    const refundAttemptIds = refundAttempts.map((attempt) => attempt.id);
    const resourceIds = [...checkoutAttemptIds, ...refundAttemptIds];
    if (resourceIds.length) await prisma.auditLog.deleteMany({ where: { resourceId: { in: resourceIds } } });
    if (checkoutAttemptIds.length) await prisma.razorpayPaymentJourneyEvent.deleteMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } } });
    if (refundAttemptIds.length) await prisma.razorpayRefundAttempt.deleteMany({ where: { id: { in: refundAttemptIds } } });
    if (orderIds.length) {
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
      await prisma.orderStage.deleteMany({ where: { orderId: { in: orderIds } } });
    }
    const uniquePaymentIds = [...new Set(paymentIds.filter(Boolean))];
    const allocations = uniquePaymentIds.length || invoiceIds.length
      ? await prisma.paymentAllocation.findMany({ where: { OR: [
        ...(uniquePaymentIds.length ? [{ paymentId: { in: uniquePaymentIds } }] : []),
        ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
      ] }, select: { id: true } })
      : [];
    const allocationIds = allocations.map((item) => item.id);
    const receipts = uniquePaymentIds.length
      ? await prisma.receipt.findMany({ where: { paymentId: { in: uniquePaymentIds } }, select: { id: true } })
      : [];
    const receiptIds = receipts.map((item) => item.id);
    if (allocationIds.length) await prisma.receiptAllocation.deleteMany({ where: { paymentAllocationId: { in: allocationIds } } });
    if (receiptIds.length) await prisma.receipt.deleteMany({ where: { id: { in: receiptIds } } });
    if (allocationIds.length) await prisma.paymentAllocation.deleteMany({ where: { id: { in: allocationIds } } });
    if (uniquePaymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: uniquePaymentIds } } });
    if (checkoutAttemptIds.length) await prisma.razorpayCheckoutAttempt.deleteMany({ where: { id: { in: checkoutAttemptIds } } });
    if (shareHashes.length) await prisma.publicShareToken.deleteMany({ where: { tokenHash: { in: shareHashes } } });
    if (invoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (customerCreated) await prisma.customer.delete({ where: { id: customer.id } });
    if (legalTermsCreated) await prisma.setting.delete({ where: { key: legalTermsKey } });
    if (previousEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = previousEnv.keyId;
    if (previousEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = previousEnv.keySecret;
    if (previousEnv.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER; else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousEnv.testContact;
    if (previousEnv.customDisabled === undefined) delete process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED; else process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED = previousEnv.customDisabled;
  }
});

test('A18 100-invoice settlement uses exact paise and a fresh refund worker process', {
  skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' || process.env.RUN_A18_SCALE_ACCEPTANCE !== '1',
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.CI, 'true');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/hangers_test');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_test');

  const previousKeys = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_a18_scale';
  process.env.RAZORPAY_KEY_SECRET = 'local-injected-provider-only';
  const suffix = crypto.randomUUID().replaceAll('-', '');
  let customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  const customerCreated = !customer;
  if (!customer) customer = await prisma.customer.create({ data: { name: `Home QA ${suffix}`, phone: '9930367267', notifWhatsApp: false } });
  const orderIds = [];
  const invoiceIds = [];
  const paymentIds = [];
  let checkoutAttemptId = null;
  try {
    const orderRows = Array.from({ length: 100 }, (_, index) => {
      const amountPaise = 101 + index;
      return {
        orderNumber: `A18-SCALE-${suffix}-${String(index).padStart(3, '0')}`,
        customerId: customer.id,
        source: 'COUNTER',
        status: 'PICKED_UP',
        subtotal: amountPaise / 100,
        totalAmount: amountPaise / 100,
      };
    });
    const invoiceRows = orderRows.map((order, index) => {
      const amountPaise = 101 + index;
      return {
        invoiceNumber: `A18-SCALE-${suffix}-${String(index).padStart(3, '0')}`,
        customerId: customer.id,
        sourceType: 'ORDER',
        status: 'OPEN',
        currency: 'INR',
        subtotal: amountPaise / 100,
        totalAmount: amountPaise / 100,
        paidAmount: 0,
        balanceDue: amountPaise / 100,
        issueDate: new Date(1700000000000 + index * 1000),
        dueDate: new Date(1700001000000 + index * 1000),
      };
    });
    await prisma.order.createMany({ data: orderRows });
    const orders = await prisma.order.findMany({
      where: { orderNumber: { startsWith: `A18-SCALE-${suffix}-` } },
      orderBy: { orderNumber: 'asc' },
    });
    orderIds.push(...orders.map((order) => order.id));
    assert.equal(orders.length, 100);
    await prisma.invoice.createMany({ data: invoiceRows.map((invoice, index) => ({ ...invoice, orderId: orders[index].id })) });
    const invoices = await prisma.invoice.findMany({
      where: { invoiceNumber: { startsWith: `A18-SCALE-${suffix}-` } },
      orderBy: { invoiceNumber: 'asc' },
    });
    invoiceIds.push(...invoices.map((invoice) => invoice.id));
    assert.equal(invoices.length, 100);

    const allocationPlan = invoices.map((invoice) => ({ invoiceId: invoice.id, amount: Number(invoice.balanceDue) }));
    const expectedTotalPaise = allocationPlan.reduce((sum, item) => sum + BigInt(Math.round(item.amount * 100)), 0n);
    assert.equal(expectedTotalPaise, 15050n);
    let providerOrder;
    const providerPayment = {
      id: `pay_a18_scale_${suffix}`,
      order_id: `order_a18_scale_${suffix}`,
      amount: Number(expectedTotalPaise),
      currency: 'INR',
      status: 'captured',
      captured: true,
      method: 'card',
    };
    const provider = {
      orders: {
        create: async (payload) => (providerOrder = {
          ...payload,
          id: providerPayment.order_id,
          status: 'created',
          amount_paid: 0,
          amount_due: payload.amount,
          attempts: 0,
        }),
        fetch: async () => providerOrder,
        fetchPayments: async () => ({ items: [] }),
      },
      payments: { fetch: async () => providerPayment },
    };
    const checkout = await createInvoiceCheckout({
      invoice: invoices[0], allocationPlan, shareId: `a18-scale-${suffix}`,
      idempotencyKey: `a18-scale-${suffix}`, customCheckout: true, provider,
    });
    checkoutAttemptId = checkout.attempt.id;
    assert.equal(checkout.order.amount, Number(expectedTotalPaise));
    assert.equal(checkout.attempt.allocationPlan.length, 100);

    const manual = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
      invoiceId: invoices[0].id,
      amount: 1,
      method: 'CASH',
      reference: `A18-SCALE-CASH-${suffix}`,
      idempotencyKey: `a18-scale-cash-${suffix}`,
      notes: 'A18 scale acceptance: invoice was partially paid before captured checkout settlement',
    }));
    paymentIds.push(...manual.payments.map((payment) => payment.id));

    providerOrder = { ...providerOrder, status: 'paid', amount_paid: Number(expectedTotalPaise), amount_due: 0, attempts: 1 };
    const captured = await settleCapturedPayment({
      paymentId: providerPayment.id,
      providerOrderId: providerOrder.id,
      source: 'WEBHOOK',
      provider,
    });
    paymentIds.push(captured.payment.id);
    assert.equal(captured.allocatedAmountPaise, expectedTotalPaise - 100n);
    assert.equal(captured.unallocatedAmountPaise, 100n);
    assert.equal(Number(captured.payment.amount), 150.5);
    assert.equal(Number(captured.payment.unallocatedAmount), 1);

    const allocations = await prisma.paymentAllocation.findMany({
      where: { paymentId: captured.payment.id, status: 'POSTED' },
      orderBy: { invoiceId: 'asc' },
    });
    assert.equal(allocations.length, 100);
    const allocatedPaise = allocations.reduce((sum, item) => sum + BigInt(Math.round(Number(item.amount) * 100)), 0n);
    assert.equal(allocatedPaise, expectedTotalPaise - 100n);
    const firstAllocation = allocations.find((item) => item.invoiceId === invoices[0].id);
    assert.equal(Math.round(Number(firstAllocation.amount) * 100), 1,
      'the previously paid ₹1 leaves exactly one paise due on the first invoice');
    const refreshedInvoices = await prisma.invoice.findMany({ where: { id: { in: invoiceIds } } });
    assert.equal(refreshedInvoices.length, 100);
    assert.ok(refreshedInvoices.every((invoice) => Number(invoice.balanceDue) === 0 && invoice.status === 'PAID'));

    const refundAttempt = await prisma.razorpayRefundAttempt.findFirst({
      where: { checkoutAttemptId, automatic: true },
    });
    assert.ok(refundAttempt);
    assert.equal(refundAttempt.status, 'CREATING');
    assert.equal(refundAttempt.amountPaise, 100n);
    assert.equal(refundAttempt.sourcePaymentId, captured.payment.id);
    const eligibleJobs = await prisma.razorpayRefundAttempt.count({
      where: {
        automatic: true,
        OR: [{ failureCode: null }, { failureCode: { not: 'REFUND_BELOW_PROVIDER_MINIMUM' } }],
        status: { in: ['CREATING', 'PENDING', 'REVIEW'] },
        nextAttemptAt: { lte: new Date() },
      },
    });
    assert.equal(eligibleJobs, 1, 'the disposable database contains only this worker job before process restart');

    const workerScript = `
      const prisma = require('./src/config/database');
      const { processAutomaticRazorpayRefundBatch } = require('./src/services/razorpay-refund.service');
      (async () => {
        try {
          const result = await processAutomaticRazorpayRefundBatch({ limit: 1, provider: async ({ paymentId, amountPaise, attempt }) => ({
            id: 'rfnd_a18_scale_' + attempt.id.slice(-16),
            payment_id: paymentId,
            amount: Number(amountPaise),
            currency: attempt.currency,
            status: 'processed',
            notes: { crm_refund_attempt_id: attempt.id },
          }) });
          process.stdout.write(JSON.stringify(result));
        } catch (error) {
          process.stderr.write(String(error.code || error.name || 'WORKER_FAILED'));
          process.exitCode = 1;
        } finally {
          await prisma.$disconnect();
        }
      })();
    `;
    const worker = spawnSync(process.execPath, ['-e', workerScript], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(worker.error, undefined, worker.error?.message);
    assert.equal(worker.status, 0, worker.stderr || 'fresh refund worker process failed');
    assert.deepEqual(JSON.parse(worker.stdout), { claimed: 1, processed: 1 });
    const finishedRefund = await prisma.razorpayRefundAttempt.findUnique({ where: { id: refundAttempt.id } });
    assert.equal(finishedRefund.status, 'PROCESSED');
    assert.ok(finishedRefund.razorpayRefundId);
    paymentIds.push(finishedRefund.localRefundPaymentId);
    assert.equal(await prisma.payment.count({
      where: { id: finishedRefund.localRefundPaymentId, kind: 'REFUND', razorpayRefundId: finishedRefund.razorpayRefundId },
    }), 1);
    assert.equal(Number((await prisma.payment.findUnique({ where: { id: captured.payment.id } })).unallocatedAmount), 0);
  } finally {
    const attempts = invoiceIds.length
      ? await prisma.razorpayCheckoutAttempt.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { id: true } })
      : [];
    const checkoutAttemptIds = attempts.map((attempt) => attempt.id);
    const refunds = checkoutAttemptIds.length
      ? await prisma.razorpayRefundAttempt.findMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } }, select: { id: true, localRefundPaymentId: true } })
      : [];
    paymentIds.push(...refunds.map((refund) => refund.localRefundPaymentId).filter(Boolean));
    const refundIds = refunds.map((refund) => refund.id);
    const resourceIds = [...checkoutAttemptIds, ...refundIds];
    if (resourceIds.length) await prisma.auditLog.deleteMany({ where: { resourceId: { in: resourceIds } } });
    if (checkoutAttemptIds.length) await prisma.razorpayPaymentJourneyEvent.deleteMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } } });
    if (refundIds.length) await prisma.razorpayRefundAttempt.deleteMany({ where: { id: { in: refundIds } } });
    const invoiceIdSet = [...new Set(invoiceIds)];
    const orderIdSet = [...new Set(orderIds)];
    const uniquePaymentIds = [...new Set(paymentIds.filter(Boolean))];
    if (orderIdSet.length || invoiceIdSet.length) {
      await prisma.outboxEvent.deleteMany({ where: { OR: [
        ...(orderIdSet.length ? [{ aggregateType: 'order', aggregateId: { in: orderIdSet } }] : []),
        ...(invoiceIdSet.length ? [{ aggregateType: 'invoice', aggregateId: { in: invoiceIdSet } }] : []),
      ] } });
    }
    if (orderIdSet.length) await prisma.orderStage.deleteMany({ where: { orderId: { in: orderIdSet } } });
    const allocations = uniquePaymentIds.length || invoiceIdSet.length
      ? await prisma.paymentAllocation.findMany({ where: { OR: [
        ...(uniquePaymentIds.length ? [{ paymentId: { in: uniquePaymentIds } }] : []),
        ...(invoiceIdSet.length ? [{ invoiceId: { in: invoiceIdSet } }] : []),
      ] }, select: { id: true } })
      : [];
    const allocationIds = allocations.map((item) => item.id);
    const receipts = uniquePaymentIds.length
      ? await prisma.receipt.findMany({ where: { paymentId: { in: uniquePaymentIds } }, select: { id: true } })
      : [];
    const receiptIds = receipts.map((item) => item.id);
    if (allocationIds.length) await prisma.receiptAllocation.deleteMany({ where: { paymentAllocationId: { in: allocationIds } } });
    if (receiptIds.length) await prisma.receipt.deleteMany({ where: { id: { in: receiptIds } } });
    if (allocationIds.length) await prisma.paymentAllocation.deleteMany({ where: { id: { in: allocationIds } } });
    if (uniquePaymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: uniquePaymentIds } } });
    if (checkoutAttemptIds.length) await prisma.razorpayCheckoutAttempt.deleteMany({ where: { id: { in: checkoutAttemptIds } } });
    if (invoiceIdSet.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIdSet } } });
    if (orderIdSet.length) await prisma.order.deleteMany({ where: { id: { in: orderIdSet } } });
    if (customerCreated && customer) await prisma.customer.delete({ where: { id: customer.id } });
    if (previousKeys.keyId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = previousKeys.keyId;
    if (previousKeys.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = previousKeys.keySecret;
  }
});

test('late combined capture caps invoice allocations and recovers one automatic surplus refund', { skip: process.env.RUN_COMBINED_CHECKOUT_INTEGRATION !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'localhost');
  const databaseName = url.pathname.slice(1);
  const isDisposableCi = process.env.GITHUB_ACTIONS === 'true' && process.env.CI === 'true' && databaseName === 'hangers_test';
  const isDisposableLocal = process.env.LOCAL_CHECKOUT_QA === '1' && /^hangers_checkout_qa_[a-z0-9_]+$/.test(databaseName);
  assert.ok(isDisposableCi || isDisposableLocal, 'integration must target the dedicated CI or explicitly named local checkout QA database');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, databaseName);

  const suffix = crypto.randomUUID();
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_combined_ci';
  delete process.env.RAZORPAY_KEY_SECRET;
  let customer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  const customerCreated = !customer;
  if (!customer) customer = await prisma.customer.create({ data: { name: 'Home QA', phone: '9930367267', notifWhatsApp: false } });
  const orders = [];
  const invoices = [];
  const paymentIds = [];
  let checkoutAttemptId = null;
  let providerOrder;
  const providerPayment = {
    id: `pay_late_${suffix.replaceAll('-', '')}`,
    order_id: `order_late_${suffix.replaceAll('-', '')}`,
    amount: 20000,
    currency: 'INR',
    status: 'captured',
    captured: true,
    method: 'card',
    amount_refunded: 0,
    refund_status: null,
  };

  try {
    for (const [index, invoiceAmount] of [100, 100].entries()) {
      const order = await prisma.order.create({ data: {
        orderNumber: `LATE-CAPTURE-${suffix}-${index}`, customerId: customer.id,
        source: 'COUNTER', status: 'PICKED_UP', subtotal: invoiceAmount, totalAmount: invoiceAmount,
      } });
      orders.push(order);
      invoices.push(await prisma.invoice.create({ data: {
        invoiceNumber: `LATE-CAPTURE-${suffix}-${index}`, customerId: customer.id,
        orderId: order.id, sourceType: 'ORDER', status: 'OPEN', currency: 'INR',
        subtotal: invoiceAmount, totalAmount: invoiceAmount, paidAmount: 0,
        balanceDue: invoiceAmount, dueDate: new Date(1700000000000 + index * 1000),
      } }));
    }

    const allocationPlan = invoices.map((invoice) => ({ invoiceId: invoice.id, amount: Number(invoice.balanceDue) }));
    const provider = {
      orders: {
        create: async (payload) => (providerOrder = {
          ...payload, id: providerPayment.order_id, status: 'created',
          amount_paid: 0, amount_due: payload.amount, attempts: 0,
        }),
        fetch: async () => providerOrder,
        fetchPayments: async () => ({ items: [] }),
      },
      payments: { fetch: async () => providerPayment },
    };
    const checkout = await createInvoiceCheckout({
      invoice: invoices[0], allocationPlan, shareId: `late_${suffix}`,
      idempotencyKey: `late-capture-${suffix}`, customCheckout: true, provider,
    });
    checkoutAttemptId = checkout.attempt.id;
    assert.equal(checkout.order.amount, 20000);

    const manual = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
      invoiceId: invoices[0].id, amount: 100, method: 'CASH',
      reference: `CASH-LATE-${suffix}`, idempotencyKey: `cash-late-${suffix}`,
      notes: 'Test fixture: another channel paid before the late capture',
    }));
    paymentIds.push(...manual.payments.map((payment) => payment.id));

    providerOrder = { ...providerOrder, status: 'paid', amount_paid: 20000, amount_due: 0, attempts: 1 };
    const capture = await settleCapturedPayment({
      paymentId: providerPayment.id, providerOrderId: providerOrder.id,
      source: 'WEBHOOK', provider,
    });
    paymentIds.push(capture.payment.id);
    assert.equal(Number(capture.payment.amount), 200);
    assert.equal(Number(capture.payment.unallocatedAmount), 100);
    const captureAllocations = await prisma.paymentAllocation.findMany({ where: { paymentId: capture.payment.id, status: 'POSTED' } });
    assert.deepEqual(captureAllocations.map((item) => [item.invoiceId, Number(item.amount)]), [[invoices[1].id, 100]]);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoices[0].id } })).balanceDue), 0);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoices[1].id } })).balanceDue), 0);

    let refundAttempt = await prisma.razorpayRefundAttempt.findFirst({ where: { checkoutAttemptId, automatic: true } });
    assert.ok(refundAttempt, 'capture must atomically reserve a refund for the unallocated surplus');
    assert.equal(refundAttempt.status, 'CREATING');
    assert.equal(refundAttempt.amountPaise, 10000n);
    assert.equal(refundAttempt.sourcePaymentId, capture.payment.id);

    const refundRequests = [];
    const refundProvider = async ({ paymentId, amountPaise, attempt }) => {
      refundRequests.push({ paymentId, amountPaise, attemptId: attempt.id, providerKey: attempt.providerIdempotencyKey });
      assert.equal(paymentId, providerPayment.id);
      assert.equal(amountPaise, 10000n);
      if (refundRequests.length === 1) throw Object.assign(new Error('Simulated response timeout after provider acceptance'), { code: 'ECONNRESET' });
      return {
        id: `rfnd_late_${suffix.replaceAll('-', '')}`, payment_id: paymentId,
        amount: Number(amountPaise), currency: 'INR', status: 'pending',
        notes: { crm_refund_attempt_id: attempt.id },
      };
    };
    const firstBatch = await processAutomaticRazorpayRefundBatch({ provider: refundProvider });
    assert.deepEqual(firstBatch, { claimed: 1, processed: 0 });
    refundAttempt = await prisma.razorpayRefundAttempt.findUnique({ where: { id: refundAttempt.id } });
    assert.equal(refundAttempt.status, 'REVIEW');
    assert.equal(refundAttempt.localRefundPaymentId, null, 'an ambiguous provider timeout must not post a local refund ledger row');

    await prisma.razorpayRefundAttempt.update({ where: { id: refundAttempt.id }, data: { nextAttemptAt: new Date(0) } });
    const retryBatch = await processAutomaticRazorpayRefundBatch({ provider: refundProvider });
    assert.deepEqual(retryBatch, { claimed: 1, processed: 1 });
    assert.equal(refundRequests.length, 2);
    assert.equal(refundRequests[0].attemptId, refundRequests[1].attemptId);
    assert.equal(refundRequests[0].providerKey, refundRequests[1].providerKey);
    assert.equal(refundRequests[0].paymentId, refundRequests[1].paymentId);
    assert.equal(refundRequests[0].amountPaise, refundRequests[1].amountPaise);
    refundAttempt = await prisma.razorpayRefundAttempt.findUnique({ where: { id: refundAttempt.id } });
    assert.equal(refundAttempt.status, 'PENDING');
    assert.ok(refundAttempt.razorpayRefundId);
    assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', razorpayRefundId: refundAttempt.razorpayRefundId } }), 0,
      'a pending Razorpay refund is not recorded as completed in the CRM ledger');

    let providerFetches = 0;
    const event = { refundId: refundAttempt.razorpayRefundId, refundAttemptId: refundAttempt.id, eventId: `late-${suffix}`, eventType: 'refund.processed', mode: 'TEST' };
    const fetchProcessedRefund = async (refundId, expectedMode) => {
      providerFetches += 1;
      assert.equal(refundId, refundAttempt.razorpayRefundId);
      assert.equal(expectedMode, 'TEST');
      return {
        id: refundId, payment_id: providerPayment.id, amount: 10000,
        currency: 'INR', status: 'processed',
        notes: { crm_refund_attempt_id: refundAttempt.id },
      };
    };
    await reconcileRazorpayRefundWebhook(event, fetchProcessedRefund);
    await reconcileRazorpayRefundWebhook(event, fetchProcessedRefund);
    assert.equal(providerFetches, 2, 'each webhook replay checks authoritative provider state');

    refundAttempt = await prisma.razorpayRefundAttempt.findUnique({ where: { id: refundAttempt.id } });
    assert.equal(refundAttempt.status, 'PROCESSED');
    assert.equal(await prisma.payment.count({ where: { id: refundAttempt.localRefundPaymentId, kind: 'REFUND', razorpayRefundId: refundAttempt.razorpayRefundId } }), 1);
    const refundPayment = await prisma.payment.findUnique({ where: { id: refundAttempt.localRefundPaymentId } });
    paymentIds.push(refundPayment.id);
    assert.equal(refundPayment.kind, 'REFUND');
    assert.equal(refundPayment.razorpayRefundId, refundAttempt.razorpayRefundId);
    assert.equal(Number(refundPayment.amount), 100);
    assert.equal(Number((await prisma.payment.findUnique({ where: { id: capture.payment.id } })).unallocatedAmount), 0);

    const captureAudit = await prisma.auditLog.findFirst({ where: { action: 'RAZORPAY_PAYMENT_CAPTURE_POSTED', resourceId: checkoutAttemptId } });
    assert.equal(captureAudit.metadata.razorpayPaymentId, providerPayment.id);
    assert.equal(captureAudit.metadata.automaticRefundAttemptId, refundAttempt.id);
    const refundAudit = await prisma.auditLog.findFirst({ where: { action: 'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED', resourceId: refundAttempt.id } });
    assert.equal(refundAudit.metadata.razorpayRefundId, refundAttempt.razorpayRefundId);
    assert.equal(refundAudit.metadata.sourcePaymentId, capture.payment.id);
    assert.equal(refundAudit.metadata.localRefundPaymentId, refundPayment.id);
  } finally {
    const checkoutAttempts = checkoutAttemptId
      ? await prisma.razorpayCheckoutAttempt.findMany({ where: { id: checkoutAttemptId }, select: { id: true } })
      : [];
    const checkoutAttemptIds = checkoutAttempts.map((attempt) => attempt.id);
    const refundAttempts = checkoutAttemptIds.length
      ? await prisma.razorpayRefundAttempt.findMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } }, select: { id: true, localRefundPaymentId: true } })
      : [];
    paymentIds.push(...refundAttempts.map((attempt) => attempt.localRefundPaymentId).filter(Boolean));
    const refundAttemptIds = refundAttempts.map((attempt) => attempt.id);
    const allResourceIds = [...checkoutAttemptIds, ...refundAttemptIds];
    if (allResourceIds.length) {
      await prisma.auditLog.deleteMany({ where: { resourceId: { in: allResourceIds } } });
      await prisma.razorpayPaymentJourneyEvent.deleteMany({ where: { checkoutAttemptId: { in: checkoutAttemptIds } } });
      await prisma.razorpayRefundAttempt.deleteMany({ where: { id: { in: refundAttemptIds } } });
    }
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
    if (orderIds.length) await prisma.orderStage.deleteMany({ where: { orderId: { in: orderIds } } });
    const allocations = paymentIds.length || invoiceIds.length
      ? await prisma.paymentAllocation.findMany({ where: { OR: [
        ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
        ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
      ] }, select: { id: true } })
      : [];
    const allocationIds = allocations.map((allocation) => allocation.id);
    const receipts = paymentIds.length
      ? await prisma.receipt.findMany({ where: { paymentId: { in: paymentIds } }, select: { id: true } })
      : [];
    const receiptIds = receipts.map((receipt) => receipt.id);
    if (allocationIds.length) await prisma.receiptAllocation.deleteMany({ where: { paymentAllocationId: { in: allocationIds } } });
    if (receiptIds.length) await prisma.receipt.deleteMany({ where: { id: { in: receiptIds } } });
    if (allocationIds.length) await prisma.paymentAllocation.deleteMany({ where: { id: { in: allocationIds } } });
    if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: [...new Set(paymentIds)] } } });
    if (checkoutAttemptIds.length) await prisma.razorpayCheckoutAttempt.deleteMany({ where: { id: { in: checkoutAttemptIds } } });
    if (invoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (customerCreated && customer) await prisma.customer.delete({ where: { id: customer.id } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
});
