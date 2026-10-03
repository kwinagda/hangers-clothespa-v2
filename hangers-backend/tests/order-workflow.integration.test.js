const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { writeAuditEvent } = require('../src/services/activity.service');
const { CommercialRuleError, resolveOrderPricing } = require('../src/services/pricing.service');
const { PaymentRuleError, recordInvoiceSettlement, recordOrderRefund, recordOrderSettlement } = require('../src/services/payment.service');
const { syncOrderGarmentUnits } = require('../src/services/garment-unit.service');
const { nextDocumentNumber } = require('../src/services/document-number.service');
const { createInvoiceCheckout, markAttemptFailed, reconcileAmbiguousOrderCreation, settleCapturedPayment } = require('../src/services/razorpay-invoice-checkout.service');
const { createPublicShareToken, resolvePublicShareToken } = require('../src/services/publicShare.service');
const { createRazorpayRefund, reconcileRazorpayRefundAttempt, reconcileRazorpayRefundWebhook, serializeRefundAttempt } = require('../src/services/razorpay-refund.service');
const crypto = require('node:crypto');
const { handleRazorpayWebhook } = require('../src/controllers/webhooks.controller');
const { listRazorpayWebhookEvents, listRazorpayCheckoutAttempts, getRazorpayCheckoutMethodOutcomes, getRazorpayCheckoutExperimentReport, replayRazorpayWebhookEvent } = require('../src/controllers/razorpayWebhookOps.controller');
const { currentBusinessDateKey } = require('../src/utils/business-time');
const { listRazorpaySettlementLines } = require('../src/controllers/reconciliation.controller');
const { processWebhook, processRazorpayWebhookBatch } = require('../src/services/razorpay-webhook-worker.service');
const { reconcileRazorpayDispute, syncRazorpayDisputePage } = require('../src/services/razorpay-dispute.service');
const { enqueueRazorpayPaymentReconciliation, enqueueRazorpaySettlementReconciliation, enqueueRazorpaySettlementSummaryReconciliation, enqueueScheduledRazorpaySettlementReconciliation, processQueuedRazorpayPaymentReconciliation, runRazorpayPaymentReconciliation } = require('../src/services/razorpay-payment-reconciliation.service');
const { importRazorpaySettlementRecon } = require('../src/services/razorpay-settlement-recon.service');
const { importRazorpaySettlementSummaries } = require('../src/services/razorpay-settlement-summary.service');
const { previewRazorpayOrderInventory } = require('../src/services/razorpay-order-inventory.service');
const { backfillCapturedRazorpayPayment } = require('../src/services/razorpay-historical-payment-backfill.service');
const { backfillUnusedRazorpayOrder } = require('../src/services/razorpay-historical-order-backfill.service');
const { importBankStatementCsv, parseBankStatementCsv, previewBankStatementCsv } = require('../src/services/bank-statement-import.service');
const { confirmBankSettlementMatch, getBankSettlementCandidates, reverseBankSettlementMatch } = require('../src/services/bank-settlement-match.service');
const { getRazorpaySettlementSummaryReport } = require('../src/services/razorpay-settlement-summary-report.service');
const { getOrderPayments, getDailySummary, getReceivables } = require('../src/controllers/payments.controller');
const { getOrder, updateOrderStatus } = require('../src/controllers/orders.controller');
const { listOrderTimelineLogs } = require('../src/controllers/logs.controller');
const { idempotent } = require('../src/middleware/idempotency');
const { generateStaffToken } = require('../src/services/jwt.service');
const { buildStaffSessionData, createSessionId } = require('../src/services/sessionToken.service');
const { getPublicInvoice, createPublicRazorpayOrder, getPublicRazorpayCheckoutStatus, receivePublicRazorpayCallback, recordPublicRazorpayClientEvent } = require('../src/controllers/public.controller');
const { EXPERIMENT_ID, assignVariant, hashVisitorId } = require('../src/utils/razorpay-checkout-experiment');
const { app } = require('../src/index');
const express = require('express');
const publicRouter = require('../src/routes/public.routes');
const axios = require('axios');
const { handleOutboxEvent, processOutboxBatch } = require('../src/services/outbox.service');
const { getCollectablePaymentMethods, getCorePaymentMethods, getMasterMetadata, syncMasterDataSettings } = require('../src/services/masterData.service');
const { syncPermissionCatalog } = require('../src/services/accessControl.service');

// Database integration tests use deterministic Test Mode semantics even when
// the runner has no local .env file. All provider calls in this suite are stubbed.
if (!process.env.RAZORPAY_KEY_ID) process.env.RAZORPAY_KEY_ID = 'rzp_test_integration_suite';

const dbIntegrationEnabled = process.env.RUN_DB_INTEGRATION === '1';
const integrationTest = dbIntegrationEnabled ? test : test.skip;
const runId = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bankImportLabel = `Integration QA ${runId.replace(/[0-9]/g, (digit) => String.fromCharCode(103 + Number(digit)))}`;
const state = {};

integrationTest('staff payment metadata exposes offline tenders but never provider Razorpay', async () => {
  const [coreMethods, collectableMethods, metadata] = await Promise.all([
    getCorePaymentMethods(), getCollectablePaymentMethods(), getMasterMetadata(),
  ]);
  for (const method of ['CASH', 'UPI', 'CARD', 'ONLINE']) {
    assert.ok(coreMethods.includes(method));
    assert.ok(collectableMethods.some((item) => item.value === method));
    assert.ok(metadata.corePaymentMethods.includes(method));
  }
  assert.equal(coreMethods.includes('RAZORPAY'), false);
  assert.equal(metadata.corePaymentMethods.includes('RAZORPAY'), false);
  assert.equal(collectableMethods.some((item) => item.value === 'RAZORPAY'), false);
  assert.equal(collectableMethods.find((item) => item.value === 'ONLINE')?.label, 'Bank transfer');
  assert.equal(metadata.paymentMethods.find((item) => item.value === 'ONLINE')?.label, 'Bank transfer');
});

integrationTest('manual bank transfer posts through the shared invoice ledger without Razorpay provider references', async () => {
  const invoice = await createInvoice(`MANUAL-BANK-TRANSFER-${runId}`, 25);
  const settlement = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
    invoiceId: invoice.id,
    amount: 25,
    method: 'BANK_TRANSFER',
    reference: `UTR${Date.now()}`,
    notes: 'Manually verified bank transfer',
    idempotencyKey: `manual-bank-transfer-${runId}`,
    staff: state.actor,
  }));
  const payment = settlement.payments[0];
  assert.equal(payment.method, 'ONLINE');
  assert.equal(payment.collectedBy, state.staff.id);
  assert.equal(payment.razorpayOrderId, null);
  assert.equal(payment.razorpayPaymentId, null);
  assert.equal(payment.mode, null);
  assert.equal(settlement.invoice.status, 'PAID');
  assert.equal(Number(settlement.balanceDue), 0);
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: payment.id, status: 'POSTED' } }), 1);
  assert.equal(await prisma.receipt.count({ where: { paymentId: payment.id } }), 1);
});

integrationTest('verified Test capture is visible in Finance daily register and removed from receivables', async () => {
  const invoice = await createInvoice(`FINANCE-PROJECTION-${runId}`, 10);
  const siblingInvoice = await createInvoice(`FINANCE-PROJECTION-SIBLING-${runId}`, 55, invoice.customerId);
  const summaryShareToken = await createPublicShareToken({ resourceType: 'CUSTOMER', resourceId: invoice.customerId, purpose: 'INVOICE_VIEW' });
  const order = await prisma.order.findUnique({ where: { id: invoice.orderId }, select: { orderNumber: true } });
  const paymentId = `pay_finance_projection_${runId}`;
  const orderId = `order_finance_projection_${runId}`;

  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const summaryBefore = response();
  await getPublicInvoice({ params: { slug: summaryShareToken } }, summaryBefore);
  assert.equal(summaryBefore.body.data.paymentSummary.invoiceCount, 2);
  assert.deepEqual(
    summaryBefore.body.data.paymentSummary.receivables.map((item) => item.invoiceId).sort(),
    [invoice.id, siblingInvoice.id].sort(),
    'the unpaid customer summary must initially include both positive-balance invoices',
  );
  assert.equal(summaryBefore.body.data.paymentSummary.totals.balanceDue, 65);

  const settlement = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
    invoiceId: invoice.id,
    amount: 10,
    method: 'RAZORPAY',
    reference: paymentId,
    idempotencyKey: `finance-projection-${runId}`,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    mode: 'TEST',
    providerCaptureVerified: true,
  }));
  assert.equal(settlement.invoice.status, 'PAID');
  assert.equal(Number(settlement.invoice.balanceDue), 0);

  const summaryAfter = response();
  await getPublicInvoice({ params: { slug: summaryShareToken } }, summaryAfter);
  const publicReceivables = summaryAfter.body.data.paymentSummary;
  assert.equal(publicReceivables.invoiceCount, 1);
  assert.deepEqual(publicReceivables.receivables.map((item) => item.invoiceId), [siblingInvoice.id],
    'a captured invoice must be removed from the public summary while unrelated unpaid invoices remain');
  assert.equal(publicReceivables.totals.totalAmount, 55);
  assert.equal(publicReceivables.totals.paidAmount, 0);
  assert.equal(publicReceivables.totals.balanceDue, 55);

  const daily = response();
  await getDailySummary({ query: {} }, daily);
  const registerRow = daily.body.data.payments.find((payment) => payment.razorpayPaymentId === paymentId);
  assert.ok(registerRow, 'captured Test payment must be present in the daily Finance register');
  assert.equal(registerRow.method, 'RAZORPAY');
  assert.equal(registerRow.mode, 'TEST');
  assert.equal(Number(registerRow.signedAmount), 10);
  assert.equal(registerRow.order.orderNumber, order.orderNumber);
  assert.equal(registerRow.allocations.length, 1);
  assert.equal(registerRow.allocations[0].invoice.invoiceNumber, invoice.invoiceNumber);

  const receivables = response();
  await getReceivables({}, receivables);
  assert.equal(receivables.body.data.receivables.some((item) => item.invoiceId === invoice.id), false,
    'paid invoice must no longer appear as an open Finance receivable');

  const orderDetail = response();
  await getOrder({ params: { id: invoice.orderId }, staff: state.actor }, orderDetail);
  const detailPayment = orderDetail.body.data.order.payments.find((item) => item.razorpayPaymentId === paymentId);
  assert.ok(detailPayment, 'Order Detail must show the same captured provider payment');
  assert.equal(detailPayment.razorpayOrderId, orderId);
  assert.equal(detailPayment.mode, 'TEST');
  assert.equal(detailPayment.status, 'CAPTURED');

  const orderPaymentHistory = response();
  await getOrderPayments({ params: { orderId: invoice.orderId } }, orderPaymentHistory);
  assert.equal(orderPaymentHistory.body.data.payments.filter((item) => item.razorpayPaymentId === paymentId).length, 1,
    'the order payment-history view must not duplicate the captured receipt');

  const shareToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const publicInvoice = response();
  await getPublicInvoice({ params: { slug: shareToken } }, publicInvoice);
  const publicInvoiceData = publicInvoice.body.data.invoice;
  assert.equal(publicInvoiceData.invoiceNumber, invoice.invoiceNumber);
  assert.equal(Number(publicInvoiceData.totalAmount), 10);
  assert.equal(Number(publicInvoiceData.paidAmount), 10);
  assert.equal(Number(publicInvoiceData.balanceDue), 0);
  assert.equal(publicInvoiceData.paymentStatus, 'PAID');

  const receipt = await prisma.receipt.findFirst({ where: { paymentId: detailPayment.id } });
  assert.ok(receipt, 'canonical settlement must issue a receipt for the payment shown in each surface');
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: detailPayment.id, invoiceId: invoice.id, status: 'POSTED' } }), 1);
});

integrationTest('legacy dry-cleaning Order invoice links resolve the canonical invoice and current balance', async () => {
  const invoice = await createInvoice('LEGACY-ORDER-SHARE', 73);
  const shareToken = await createPublicShareToken({
    resourceType: 'ORDER', resourceId: invoice.orderId, purpose: 'INVOICE_VIEW',
  });
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicInvoice({ params: { slug: shareToken } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.invoice.id, invoice.id);
  assert.equal(response.body.data.invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal(response.body.data.invoice.invoiceType, 'ORDER');
  assert.equal(Number(response.body.data.invoice.balanceDue), 73);
  assert.equal(response.body.data.invoice.paymentStatus, 'UNPAID');
});

integrationTest('public invoice checkout status returns NONE before the customer starts checkout', async () => {
  const invoice = await createInvoice('RZP-STATUS-NO-ATTEMPT', 73);
  const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await getPublicRazorpayCheckoutStatus({
    params: { slug: token }, query: {}, headers: {}, id: `request-${runId}`,
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, 'NONE');
  assert.equal(response.body.data.canResumeCheckout, false);
  assert.equal(Number(response.body.data.invoice.balanceDue), 73);
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 0);
});

integrationTest('cancelled dry-cleaning orders cannot start a new public Razorpay checkout', async () => {
  const invoice = await createInvoice('CANCELLED-CHECKOUT', 73);
  await prisma.order.update({ where: { id: invoice.orderId }, data: { status: 'CANCELLED' } });
  const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousTestContact = process.env.RAZORPAY_TEST_CONTACT_NUMBER;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';

  try {
    const invoiceResponse = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getPublicInvoice({ params: { slug: token } }, invoiceResponse);
    assert.equal(invoiceResponse.statusCode, 200);
    assert.equal(invoiceResponse.body.data.invoice.status, 'CANCELLED');

    const checkoutResponse = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await createPublicRazorpayOrder({
      params: { slug: token }, body: {}, id: `request-${runId}`,
      get: () => `cancelled-checkout-${runId}`,
    }, checkoutResponse);

    assert.equal(checkoutResponse.statusCode, 409);
    assert.equal(checkoutResponse.body.code, 'ORDER_CANCELLED');
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 0);

    let providerCreateCalls = 0;
    await assert.rejects(createInvoiceCheckout({
      invoice,
      shareId: `cancelled-checkout-${runId}`,
      idempotencyKey: `cancelled-checkout-${runId}`,
      provider: { orders: { create: async () => { providerCreateCalls += 1; } } },
    }), { code: 'ORDER_CANCELLED' });
    assert.equal(providerCreateCalls, 0, 'the transaction-level guard must reject before creating a provider Order');

    const activeInvoice = await createInvoice('CANCEL-ACTIVE-CHECKOUT', 19);
    await prisma.razorpayCheckoutAttempt.create({
      data: {
        idempotencyKey: `cancel-active-checkout-${runId}`,
        invoiceId: activeInvoice.id,
        invoiceNumber: activeInvoice.invoiceNumber,
        orderId: activeInvoice.orderId,
        customerId: activeInvoice.customerId,
        amountPaise: 1900n,
        currency: 'INR',
        mode: 'TEST',
        status: 'CREATED',
        razorpayOrderId: `order_cancel_active_${runId}`,
      },
    });
    const cancelResponse = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await updateOrderStatus({
      params: { id: activeInvoice.orderId },
      body: { status: 'CANCELLED', notes: 'Test cancellation guard', expectedVersion: 1 },
      staff: state.actor,
      id: `request-cancel-active-${runId}`,
      headers: {},
    }, cancelResponse);
    assert.equal(cancelResponse.statusCode, 409);
    assert.match(cancelResponse.body.message, /online payment is active or needs review/i);
    assert.equal((await prisma.order.findUnique({ where: { id: activeInvoice.orderId } })).status, 'PICKED_UP');
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousTestContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousTestContact;
  }
});

integrationTest('order notification timeline matches legacy outcome rows by payment ID across pages', async () => {
  const order = await createOrder('WHATSAPP-PAGINATION');
  const outboxEventId = `outbox_${runId}_payment_received`;
  const paymentId = `pay_${runId}_whatsapp_timeline`;
  await prisma.orderStage.create({
    data: {
      orderId: order.id,
      stage: 'WHATSAPP_PENDING',
      eventType: 'NOTIFICATION',
      reasonCode: 'WHATSAPP_PENDING',
      notes: 'WhatsApp queued: Payment received',
      metadata: {
        channel: 'WHATSAPP', provider: 'WHATOMATE', outboxEventId,
        outboxEventType: 'PAYMENT_RECEIVED', outcome: 'PENDING', payload: { paymentId },
      },
      createdAt: new Date(Date.now() - 60_000),
    },
  });
  await prisma.orderStage.create({
    data: {
      orderId: order.id,
      stage: 'WHATSAPP_SENT',
      eventType: 'NOTIFICATION',
      reasonCode: 'WHATSAPP_SENT',
      notes: 'WhatsApp sent: Payment received',
      metadata: {
        channel: 'WHATSAPP', provider: 'WHATOMATE',
        outboxEventType: 'PAYMENT_RECEIVED', outcome: 'SENT', payload: { paymentId },
      },
      createdAt: new Date(),
    },
  });

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await listOrderTimelineLogs({ query: { search: order.orderNumber, page: '1', limit: '1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.pagination.total, 2, 'pagination total should count immutable timeline rows only');
  assert.deepEqual(new Set(res.body.data.logs.map((log) => log.stage)), new Set(['WHATSAPP_PENDING', 'WHATSAPP_SENT']));
});

integrationTest('Razorpay historical Order preview identifies exact invoice matches without mutating CRM records', async () => {
  const invoice = await createInvoice('ORDER-INVENTORY', 25);
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `historical-order-inventory-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 2500n,
      currency: 'INR',
      mode: 'TEST',
      status: 'CREATE_FAILED',
    },
  });
  const providerOrderId = `order_${runId.replace(/[^A-Za-z0-9]/g, '')}`;
  const calls = [];
  const preview = await previewRazorpayOrderInventory({
    from: Math.floor(Date.now() / 1000) - 3600,
    to: Math.floor(Date.now() / 1000),
    provider: { orders: { all: async (params) => {
      calls.push(params);
      return { items: [{
        id: providerOrderId, status: 'paid', amount: 2500, amount_paid: 2500, amount_due: 0,
        currency: 'INR', attempts: 0, receipt: `hc-${attempt.id}`,
        notes: { invoice_id: invoice.id, crm_attempt_id: attempt.id }, created_at: Math.floor(Date.now() / 1000),
      }] };
    } }, payments: { all: async (params) => {
      calls.push(params);
      return { items: [
        { id: `pay_${runId.replace(/[^A-Za-z0-9]/g, '')}`, order_id: providerOrderId, amount: 2500, currency: 'INR', status: 'captured', captured: true, method: 'card', created_at: Math.floor(Date.now() / 1000) },
        { id: `pay_${runId.replace(/[^A-Za-z0-9]/g, '')}pending`, order_id: providerOrderId, amount: 2500, currency: 'INR', status: 'authorized', captured: false, method: 'card', created_at: Math.floor(Date.now() / 1000) },
      ] };
    } } },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].count, 100);
  assert.equal(calls[0].skip, 0);
  assert.equal(calls[1].count, 100);
  assert.equal(calls[1].skip, 0);
  assert.equal(preview.mode, 'TEST');
  assert.equal(preview.paginationComplete, true);
  assert.equal(preview.counts.EXACT_INVOICE_CANDIDATE, 1);
  assert.equal(preview.reviewItems[0].reasonCode, 'INVOICE_AND_ATTEMPT_NOTES_MATCH');
  assert.equal(preview.reviewItems[0].invoice.id, invoice.id);
  assert.equal(preview.paymentInventory.paginationComplete, true);
  assert.equal(preview.paymentInventory.counts.EXACT_CAPTURED_PAYMENT_CANDIDATE, 1, JSON.stringify(preview.paymentInventory));
  assert.equal(preview.paymentInventory.counts.NON_CAPTURED_PROVIDER_PAYMENT, 1);
  assert.equal(preview.paymentInventory.reviewItems[0].invoice.id, invoice.id);
  assert.equal(Object.hasOwn(preview.paymentInventory.reviewItems[0].providerPayment, 'contact'), false,
    'provider contact data must not be returned to Finance preview');
  assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } })).razorpayOrderId, null,
    'dry-run preview must not backfill an attempt');
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN',
    'dry-run preview must not change invoice state');
});

integrationTest('Razorpay payment inventory fetches a captured payment Order created before the selected window', async () => {
  const invoice = await createInvoice(`ORDER-INVENTORY-LATE-PAYMENT-${runId}`, 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}latepayment`;
  const paymentId = `pay_${suffix}latepayment`;
  const now = Math.floor(Date.now() / 1000);
  let fetchedOrderId = null;
  const preview = await previewRazorpayOrderInventory({
    from: now - 24 * 60 * 60,
    to: now,
    provider: {
      orders: {
        all: async () => ({ items: [] }),
        fetch: async (id) => {
          fetchedOrderId = id;
          return {
            id, status: 'paid', amount: 2500, amount_paid: 2500, amount_due: 0,
            currency: 'INR', attempts: 1, receipt: invoice.invoiceNumber,
            notes: {}, created_at: now - 7 * 24 * 60 * 60,
          };
        },
      },
      payments: { all: async () => ({ items: [{
        id: paymentId, order_id: orderId, amount: 2500, currency: 'INR',
        status: 'captured', captured: true, method: 'card', created_at: now - 3600,
      }] }) },
    },
  });

  assert.equal(fetchedOrderId, orderId);
  assert.equal(preview.listed, 0);
  assert.equal(preview.scanned, 1, 'the provider-linked Order is included in total inspected Orders');
  assert.deepEqual(preview.linkedOrderLookups, { requested: 1, fetched: 1, failed: 0, skippedByLimit: 0, complete: true, failureCodeCounts: {} });
  assert.equal(preview.counts.EXACT_INVOICE_CANDIDATE, 1);
  assert.equal(preview.paymentInventory.counts.EXACT_CAPTURED_PAYMENT_CANDIDATE, 1);
  assert.equal(preview.paymentInventory.reviewItems[0].invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0,
    'historical inventory remains a read-only preview and does not post a receipt');
});

integrationTest('Razorpay payment inventory reports incomplete Order-by-ID lookups without auto-matching', async () => {
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}lookupfailure`;
  const now = Math.floor(Date.now() / 1000);
  const preview = await previewRazorpayOrderInventory({
    from: now - 3600,
    to: now,
    provider: {
      orders: {
        all: async () => ({ items: [] }),
        fetch: async () => { throw Object.assign(new Error('not found'), { statusCode: 404, response: { status: 404, data: { error: { code: 'BAD_REQUEST_ERROR' } } } }); },
      },
      payments: { all: async () => ({ items: [{
        id: `pay_${suffix}lookupfailure`, order_id: orderId, amount: 1000, currency: 'INR',
        status: 'captured', captured: true, method: 'card', created_at: now - 60,
      }] }) },
    },
  });

  assert.deepEqual(preview.linkedOrderLookups, { requested: 1, fetched: 0, failed: 1, skippedByLimit: 0, complete: false, failureCodeCounts: { BAD_REQUEST_ERROR: 1 } });
  assert.equal(preview.paymentInventory.reviewItems[0].classification, 'UNMATCHED_PAYMENT_REVIEW');
  assert.equal(preview.paymentInventory.reviewItems[0].reasonCode, 'LINKED_ORDER_LOOKUP_FAILED');
  assert.equal(preview.paymentInventory.reviewItems[0].providerCode, 'BAD_REQUEST_ERROR');
  assert.equal(preview.paymentInventory.counts.EXACT_CAPTURED_PAYMENT_CANDIDATE || 0, 0);
});

integrationTest('Razorpay historical Order preview sends duplicate invoice candidates to review', async () => {
  const invoice = await createInvoice('ORDER-INVENTORY-DUPLICATE', 25);
  const prefix = `order_${runId.replace(/[^A-Za-z0-9]/g, '')}`;
  const now = Math.floor(Date.now() / 1000);
  const preview = await previewRazorpayOrderInventory({
    from: now - 3600,
    to: now,
    provider: { orders: { all: async () => ({ items: [1, 2].map((suffix) => ({
      id: `${prefix}${suffix}`, status: 'created', amount: 2500, amount_paid: 0, amount_due: 2500,
      currency: 'INR', attempts: 0, receipt: invoice.invoiceNumber,
      notes: {}, created_at: now,
    })) }) }, payments: { all: async () => ({ items: [] }) } },
  });

  assert.equal(preview.counts.REVIEW_REQUIRED, 2);
  assert.equal(preview.reviewItems.every((item) => item.reasonCode === 'MULTIPLE_PROVIDER_ORDERS_FOR_INVOICE'), true);
});

integrationTest('Razorpay inventory reports explicit mode mismatches without cross-mode linking', async () => {
  const invoice = await createInvoice('ORDER-INVENTORY-MODE-MISMATCH', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}mode`;
  const paymentId = `pay_${suffix}mode`;
  await prisma.payment.create({ data: {
    orderId: invoice.orderId, customerId: invoice.customerId, amount: 25, method: 'RAZORPAY',
    kind: 'RECEIPT', status: 'CAPTURED', mode: 'LIVE', razorpayPaymentId: paymentId, razorpayOrderId: orderId,
  } }).then((payment) => prisma.paymentAllocation.create({ data: {
    paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 25, status: 'POSTED',
  } }));
  const now = Math.floor(Date.now() / 1000);
  const preview = await previewRazorpayOrderInventory({
    from: now - 3600, to: now,
    provider: {
      orders: { all: async () => ({ items: [{
        id: orderId, status: 'paid', amount: 2500, amount_paid: 2500, amount_due: 0,
        currency: 'INR', attempts: 1, receipt: invoice.invoiceNumber, notes: {}, created_at: now,
      }] }) },
      payments: { all: async () => ({ items: [{
        id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true, created_at: now,
      }] }) },
    },
  });
  assert.equal(preview.mode, 'TEST');
  assert.equal(preview.reviewItems[0].reasonCode, 'RAZORPAY_MODE_MISMATCH');
  assert.equal(preview.paymentInventory.reviewItems[0].reasonCode, 'RAZORPAY_MODE_MISMATCH');
  assert.equal(preview.paymentInventory.counts.EXACT_CAPTURED_PAYMENT_CANDIDATE || 0, 0);
});

integrationTest('Razorpay historical payment preview blocks multiple captured payments for one invoice', async () => {
  const invoice = await createInvoice('PAYMENT-INVENTORY-DUPLICATE', 25);
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `payment-inventory-duplicate-${runId}`, invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber, orderId: invoice.orderId, customerId: invoice.customerId,
      amountPaise: 2500n, currency: 'INR', mode: 'TEST', status: 'CREATE_FAILED',
    },
  });
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}payduplicate`;
  const now = Math.floor(Date.now() / 1000);
  const preview = await previewRazorpayOrderInventory({
    from: now - 3600,
    to: now,
    provider: {
      orders: { all: async () => ({ items: [{
        id: orderId, status: 'paid', amount: 2500, amount_paid: 2500, amount_due: 0,
        currency: 'INR', attempts: 1, receipt: `hc-${attempt.id}`,
        notes: { invoice_id: invoice.id, crm_attempt_id: attempt.id }, created_at: now,
      }] }) },
      payments: { all: async () => ({ items: [1, 2].map((number) => ({
        id: `pay_${suffix}duplicate${number}`, order_id: orderId, amount: 2500, currency: 'INR',
        status: 'captured', captured: true, method: 'card', created_at: now,
      })) }) },
    },
  });
  assert.equal(preview.paymentInventory.counts.REVIEW_REQUIRED, 2);
  assert.equal(preview.paymentInventory.reviewItems.every((item) => item.reasonCode === 'MULTIPLE_CAPTURED_PAYMENTS_FOR_INVOICE'), true);
  assert.equal(preview.paymentInventory.reviewItems.some((item) => item.classification === 'EXACT_CAPTURED_PAYMENT_CANDIDATE'), false);
});

integrationTest('Finance historical payment backfill verifies and settles one exact captured provider payment idempotently', async () => {
  const invoice = await createInvoice('PAYMENT-BACKFILL', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const paymentId = `pay_${suffix}backfill`;
  const orderId = `order_${suffix}backfill`;
  const providerPayment = {
    id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true,
    method: 'card', amount_refunded: 0, refund_status: null,
  };
  let providerOrder = {
    id: orderId, amount: 2500, amount_paid: 2500, amount_due: 0, currency: 'INR', status: 'paid',
    attempts: 1, receipt: invoice.invoiceNumber, notes: { legacy_note: 'x'.repeat(512) },
  };
  const edits = [];
  const provider = {
    payments: { fetch: async (id) => { assert.equal(id, paymentId); return providerPayment; } },
    orders: {
      fetch: async (id) => { assert.equal(id, orderId); return providerOrder; },
      edit: async (id, payload) => { assert.equal(id, orderId); edits.push(payload); providerOrder = { ...providerOrder, notes: payload.notes }; return providerOrder; },
    },
  };
  const result = await backfillCapturedRazorpayPayment({
    paymentId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-backfill-${suffix}`, actor: { id: 'test-finance-actor' }, provider,
  });

  assert.equal(result.status, 'CAPTURED');
  assert.equal(result.invoiceId, invoice.id);
  assert.equal(result.razorpayOrderId, orderId);
  assert.equal(result.razorpayPaymentId, paymentId);
  assert.equal(result.alreadyRecorded, false);
  assert.equal(edits.length, 1);
  assert.equal(providerOrder.notes.invoice_id, invoice.id);
  assert.equal(providerOrder.notes.crm_attempt_id, result.attemptId);
  assert.equal(providerOrder.notes.legacy_note, 'x'.repeat(512), 'existing 512-character note must be preserved under Razorpay limits');
  assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: result.attemptId } })).status, 'CAPTURED');
  const ledger = await prisma.payment.findMany({ where: { razorpayPaymentId: paymentId }, include: { allocations: true } });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].allocations.some((allocation) => allocation.invoiceId === invoice.id), true);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'PAID');
  assert.equal(await prisma.auditLog.count({ where: { resourceId: result.attemptId, action: 'RAZORPAY_PAYMENT_CAPTURE_POSTED' } }), 1);

  const replay = await backfillCapturedRazorpayPayment({
    paymentId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-backfill-${suffix}`, actor: { id: 'test-finance-actor' }, provider,
  });
  assert.equal(replay.alreadyRecorded, true);
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 1);
  assert.equal(edits.length, 1, 'replay must not repeat the provider Order note update');
});

integrationTest('authorized Accounts backfill HTTP route records one verified payment and replays idempotently', async () => {
  const invoice = await createInvoice(`PAYMENT-BACKFILL-HTTP-${runId}`, 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const paymentId = `pay_${suffix}httpbackfill`;
  const orderId = `order_${suffix}httpbackfill`;
  const priorEnv = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  const priorAdapter = axios.defaults.adapter;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_http_backfill';
  process.env.RAZORPAY_KEY_SECRET = `http-backfill-secret-${runId}`;
  const paymentEntity = {
    id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true,
    method: 'card', amount_refunded: 0, refund_status: null,
  };
  let orderEntity = {
    id: orderId, amount: 2500, amount_paid: 2500, amount_due: 0, currency: 'INR', status: 'paid',
    attempts: 1, receipt: invoice.invoiceNumber, notes: {},
  };
  const providerRequests = [];
  axios.defaults.adapter = async (config) => {
    const method = String(config.method || 'get').toUpperCase();
    const path = new URL(config.url, config.baseURL).pathname;
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    providerRequests.push({ method, path });
    let data;
    if (method === 'GET' && path === `/v1/payments/${paymentId}`) data = paymentEntity;
    else if (method === 'GET' && path === `/v1/orders/${orderId}`) data = orderEntity;
    else if (method === 'PATCH' && path === `/v1/orders/${orderId}`) {
      orderEntity = { ...orderEntity, notes: payload.notes };
      data = orderEntity;
    } else {
      assert.fail(`Unexpected Razorpay SDK request: ${method} ${path}`);
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };

  const staff = await prisma.staff.create({
    data: {
      name: `Integration Accounts Backfill ${runId}`,
      phone: `6${String(Date.now()).slice(-9)}`,
      email: `accounts-backfill-${runId}@example.test`,
      passwordHash: 'integration-test-only', role: 'ACCOUNTS', isActive: true,
    },
  });
  const sessionId = createSessionId();
  const token = generateStaffToken({ ...staff, jti: sessionId }, '10m');
  await prisma.staffSession.create({
    data: buildStaffSessionData({
      staffId: staff.id, token, sessionId,
      req: { headers: { 'user-agent': 'integration-test' }, ip: '127.0.0.1' },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }),
  });

  const reconciliationRouter = require('../src/routes/reconciliation.routes');
  const routeApp = express();
  routeApp.use(express.json());
  routeApp.use('/api/v1/reconciliation', reconciliationRouter);
  const server = routeApp.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/api/v1/reconciliation/razorpay-payments/${paymentId}/backfill`;
    const requestOptions = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        origin: `http://127.0.0.1:${address.port}`,
        'content-type': 'application/json',
        'x-idempotency-key': `http-backfill-${suffix}`,
      },
      body: JSON.stringify({ invoiceId: invoice.id, mode: 'TEST' }),
    };
    const firstResponse = await fetch(url, requestOptions);
    const firstBody = await firstResponse.json();
    assert.equal(firstResponse.status, 200, JSON.stringify(firstBody));
    assert.equal(firstBody.data.backfill.status, 'CAPTURED');
    assert.equal(firstBody.data.backfill.razorpayPaymentId, paymentId);
    assert.equal(firstBody.data.backfill.razorpayOrderId, orderId);
    assert.equal(firstBody.data.backfill.invoiceId, invoice.id);
    assert.equal(orderEntity.notes.invoice_id, invoice.id);
    assert.equal(orderEntity.notes.crm_attempt_id, firstBody.data.backfill.attemptId);
    assert.deepEqual(providerRequests.map(({ method, path }) => `${method} ${path}`), [
      `GET /v1/payments/${paymentId}`,
      `GET /v1/orders/${orderId}`,
      `PATCH /v1/orders/${orderId}`,
      `GET /v1/orders/${orderId}`,
      `GET /v1/orders/${orderId}`,
      `GET /v1/payments/${paymentId}`,
    ]);

    const replayResponse = await fetch(url, requestOptions);
    const replayBody = await replayResponse.json();
    assert.equal(replayResponse.status, 200);
    assert.equal(replayResponse.headers.get('x-idempotency-replayed'), 'true');
    assert.deepEqual(replayBody, firstBody);
    assert.equal(providerRequests.length, 6, 'identical replay must not call Razorpay again');

    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 1);
    assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id, status: 'POSTED' } }), 1);
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'PAID');
    assert.equal(await prisma.auditLog.count({ where: { action: 'RAZORPAY_HISTORICAL_PAYMENT_BACKFILL', resourceId: paymentId, actorId: staff.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { action: 'RAZORPAY_PAYMENT_CAPTURE_POSTED', resourceId: firstBody.data.backfill.attemptId } }), 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.staffSession.deleteMany({ where: { staffId: staff.id } });
    await prisma.staff.delete({ where: { id: staff.id } });
    axios.defaults.adapter = priorAdapter;
    if (priorEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorEnv.keyId;
    if (priorEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = priorEnv.keySecret;
  }
});

integrationTest('Finance historical payment backfill refuses non-captured, refunded, and invoice-mismatched payments before local writes', async () => {
  const invoice = await createInvoice('PAYMENT-BACKFILL-REJECT', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}reject`;
  const paymentId = `pay_${suffix}reject`;
  const order = { id: orderId, amount: 2500, amount_paid: 2500, amount_due: 0, currency: 'INR', status: 'paid', receipt: invoice.invoiceNumber, notes: {} };
  let payment = { id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'authorized', captured: false, amount_refunded: 0 };
  const provider = { payments: { fetch: async () => payment }, orders: { fetch: async () => order, edit: async () => assert.fail('provider Order must not be mutated for rejected payments') } };
  const args = { paymentId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-backfill-reject-${suffix}`, provider };
  await assert.rejects(backfillCapturedRazorpayPayment({ ...args, expectedMode: 'LIVE', provider: { payments: { fetch: async () => assert.fail('must reject mode drift before provider access') } } }), { code: 'HISTORICAL_PAYMENT_MODE_CHANGED' });
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_NOT_CAPTURED' });
  payment = { ...payment, status: 'captured', captured: true, amount_refunded: 100 };
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_REFUND_REVIEW' });
  payment = { ...payment, amount_refunded: 0 };
  payment = { ...payment, amount_refunded: 'unknown' };
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_REFUND_REVIEW' });
  payment = { ...payment, amount_refunded: 0 };
  order.notes.invoice_id = invoice.id;
  order.receipt = 'receipt-not-in-crm';
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_INVOICE_REFERENCE_MISMATCH' });
  const conflictingReceipt = await createInvoice('PAYMENT-BACKFILL-CONFLICTING-RECEIPT', 25);
  order.notes.invoice_id = invoice.id;
  order.receipt = conflictingReceipt.invoiceNumber;
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_INVOICE_REFERENCE_MISMATCH' });
  order.receipt = invoice.invoiceNumber;
  order.notes.invoice_id = 'different-invoice';
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_INVOICE_REFERENCE_MISMATCH' });
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { razorpayOrderId: orderId } }), 0);
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
});

integrationTest('Finance uses paired Dashboard reports only after documented Order retention and live-verifies Payment twice', async () => {
  const invoice = await createInvoice('PAYMENT-BACKFILL-REPORT', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}reportfallback`;
  const paymentId = `pay_${suffix}reportfallback`;
  const providerPayment = {
    id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true,
    amount_refunded: 0, refund_status: null, method: 'card',
  };
  const paymentsCsvText = `id,order_id,status,amount,currency\n${paymentId},${orderId},captured,25.00,INR`;
  const ordersCsvText = `id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\n${orderId},25.00,25.00,0,INR,${invoice.invoiceNumber},paid,1,"{""invoice_id"":""${invoice.id}""}"`;
  let paymentFetches = 0;
  let orderFetches = 0;
  let orderEdits = 0;
  const provider = {
    payments: { fetch: async (id) => { assert.equal(id, paymentId); paymentFetches += 1; return providerPayment; } },
    orders: {
      fetch: async (id) => {
        assert.equal(id, orderId);
        orderFetches += 1;
        const error = new Error('Order older than 180 days, please use reports');
        error.error = { code: 'BAD_REQUEST_ERROR', description: 'Order older than 180 days, please use reports' };
        throw error;
      },
      edit: async () => { orderEdits += 1; throw new Error('A retained Order must not be edited'); },
    },
  };
  const suffixKey = `finance-report-backfill-${suffix}`;
  const priorKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_report_fallback';
  try {
    const result = await backfillCapturedRazorpayPayment({
      paymentId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: suffixKey,
      actor: { id: 'test-finance-actor' }, paymentsCsvText, ordersCsvText, provider,
    });
    assert.equal(result.status, 'CAPTURED');
    assert.equal(result.invoiceId, invoice.id);
    assert.equal(result.razorpayOrderId, orderId);
    assert.equal(paymentFetches, 2, 'the final ledger settlement must fetch authoritative Payment state again');
    assert.equal(orderFetches, 1);
    assert.equal(orderEdits, 0, 'an Order past API retention must never be edited through this fallback');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'PAID');
  } finally {
    if (priorKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorKeyId;
  }
});

integrationTest('Finance historical report fallback refuses a non-retention Order API error without creating a local attempt', async () => {
  const invoice = await createInvoice('PAYMENT-BACKFILL-NON-RETENTION', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}reporterror`;
  const paymentId = `pay_${suffix}reporterror`;
  const provider = {
    payments: { fetch: async () => ({ id: paymentId, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 }) },
    orders: { fetch: async () => { const error = new Error('provider unavailable'); error.code = 'ETIMEDOUT'; throw error; } },
  };
  const args = {
    paymentId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-report-error-${suffix}`,
    paymentsCsvText: `id,order_id,status,amount,currency\n${paymentId},${orderId},captured,25.00,INR`,
    ordersCsvText: `id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\n${orderId},25.00,25.00,0,INR,${invoice.invoiceNumber},paid,1,"{""invoice_id"":""${invoice.id}""}"`,
    provider,
  };
  await assert.rejects(backfillCapturedRazorpayPayment(args), { code: 'HISTORICAL_PAYMENT_PROVIDER_FAILED' });
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { razorpayOrderId: orderId } }), 0);
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
});

integrationTest('canonical capture settlement rejects a newly refunded live Payment before CRM ledger writes', async () => {
  const invoice = await createInvoice('CAPTURE-REFUND-RACE', 10);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  let order;
  let payment;
  const provider = {
    orders: { create: async (payload) => (order = { id: `order_${suffix}refundrace`, amount: payload.amount, currency: payload.currency, notes: payload.notes }), fetch: async () => order },
    payments: { fetch: async () => payment },
  };
  const checkout = await createInvoiceCheckout({ invoice, shareId: `share-refund-race-${suffix}`, idempotencyKey: `refund-race-${suffix}`, provider });
  order = { ...order, status: 'paid', amount_paid: 1000, amount_due: 0, attempts: 1 };
  payment = { id: `pay_${suffix}refundrace`, order_id: order.id, amount: 1000, currency: 'INR', status: 'captured', captured: true, amount_refunded: 100, refund_status: 'partial' };
  await assert.rejects(settleCapturedPayment({ paymentId: payment.id, providerOrderId: order.id, provider }), { code: 'PROVIDER_PAYMENT_REFUND_REVIEW' });
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: payment.id } }), 0);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
});

integrationTest('Finance links an exact unused historical Razorpay Order only after provider notes and checkout state are re-verified', async () => {
  const invoice = await createInvoice('ORDER-BACKFILL', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}unused`;
  let providerOrder = {
    id: orderId, amount: 2500, amount_paid: 0, amount_due: 2500, currency: 'INR', status: 'created', attempts: 0,
    receipt: invoice.invoiceNumber, notes: { legacy_note: 'preserve' },
  };
  let providerPayments = { items: [] };
  const edits = [];
  const provider = { orders: {
    fetch: async (id) => { assert.equal(id, orderId); return providerOrder; },
    fetchPayments: async (id) => { assert.equal(id, orderId); return providerPayments; },
    edit: async (id, payload) => { assert.equal(id, orderId); edits.push(payload); providerOrder = { ...providerOrder, notes: payload.notes }; return providerOrder; },
  } };
  let capturedPayment = null;
  provider.payments = { fetch: async (id) => { assert.equal(id, capturedPayment?.id); return capturedPayment; } };
  const args = { orderId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-order-backfill-${suffix}`, actor: { id: 'test-finance-actor' }, provider };
  const result = await backfillUnusedRazorpayOrder(args);
  assert.equal(result.invoiceId, invoice.id);
  assert.equal(result.razorpayOrderId, orderId);
  assert.equal(result.status, 'CREATED');
  assert.equal(providerOrder.notes.invoice_id, invoice.id);
  assert.equal(providerOrder.notes.crm_attempt_id, result.attemptId);
  assert.equal(providerOrder.notes.legacy_note, 'preserve');
  assert.equal(edits.length, 1);
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: result.attemptId } });
  assert.equal(attempt.status, 'CREATED');
  assert.equal(attempt.requestId, 'FINANCE_HISTORICAL_ORDER_BIND');
  assert.equal(attempt.publicShareId, null);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
  assert.equal(await prisma.payment.count({ where: { razorpayOrderId: orderId } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { resourceId: result.attemptId, action: 'RAZORPAY_HISTORICAL_ORDER_BOUND' } }), 1);

  const replay = await backfillUnusedRazorpayOrder(args);
  assert.equal(replay.attemptId, result.attemptId);
  assert.equal(edits.length, 1, 'an idempotent replay must not repeat the provider note update');
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { razorpayOrderId: orderId } }), 1);

  const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const share = await resolvePublicShareToken({ token, purpose: 'INVOICE_VIEW' });
  const checkout = await createInvoiceCheckout({
    invoice, shareId: share.id, idempotencyKey: `resume-historical-order-${suffix}`, requestId: 'public-checkout-test',
    provider: { orders: { create: async () => assert.fail('verified historical Order must be resumed, not replaced with a new Order') } },
  });
  assert.equal(checkout.reused, true);
  assert.equal(checkout.attempt.id, result.attemptId);
  assert.equal(checkout.order.id, orderId);

  capturedPayment = { id: `pay_${suffix}orderbackfill`, order_id: orderId, amount: 2500, currency: 'INR', status: 'captured', captured: true, method: 'card' };
  providerOrder = { ...providerOrder, amount_paid: 2500, amount_due: 0, status: 'paid', attempts: 1 };
  const settled = await settleCapturedPayment({
    paymentId: capturedPayment.id,
    providerOrderId: orderId,
    expectedInvoiceId: invoice.id,
    provider,
  });
  assert.equal(settled.attempt.id, result.attemptId);
  assert.equal(settled.attempt.status, 'CAPTURED');
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'PAID');
  assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: capturedPayment.id, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
});

integrationTest('Finance historical Order binding refuses mode drift, attempted Orders, payments, and conflicting invoice references', async () => {
  const invoice = await createInvoice('ORDER-BACKFILL-REJECT', 25);
  const suffix = runId.replace(/[^A-Za-z0-9]/g, '');
  const orderId = `order_${suffix}rejectunused`;
  let providerOrder = { id: orderId, amount: 2500, amount_paid: 0, amount_due: 2500, currency: 'INR', status: 'created', attempts: 0, receipt: invoice.invoiceNumber, notes: {} };
  let providerPayments = { items: [] };
  const provider = { orders: {
    fetch: async () => providerOrder,
    fetchPayments: async () => providerPayments,
    edit: async () => assert.fail('rejected Order must not be modified'),
  } };
  const args = { orderId, invoiceId: invoice.id, expectedMode: 'TEST', idempotencyKey: `finance-order-reject-${suffix}`, provider };
  await assert.rejects(backfillUnusedRazorpayOrder({ ...args, expectedMode: 'LIVE', provider: { orders: { fetch: async () => assert.fail('mode drift must reject before provider access') } } }), { code: 'HISTORICAL_ORDER_MODE_CHANGED' });
  providerOrder = { ...providerOrder, attempts: 1 };
  await assert.rejects(backfillUnusedRazorpayOrder(args), { code: 'HISTORICAL_ORDER_NOT_UNUSED' });
  providerOrder = { ...providerOrder, attempts: 0 };
  providerPayments = { items: [{ id: `pay_${suffix}attempt`, status: 'failed' }] };
  await assert.rejects(backfillUnusedRazorpayOrder(args), { code: 'HISTORICAL_ORDER_NOT_UNUSED' });
  providerPayments = { items: [] };
  const otherInvoice = await createInvoice('ORDER-BACKFILL-OTHER', 25);
  providerOrder = { ...providerOrder, receipt: otherInvoice.invoiceNumber };
  await assert.rejects(backfillUnusedRazorpayOrder(args), { code: 'HISTORICAL_ORDER_INVOICE_REFERENCE_MISMATCH' });
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { razorpayOrderId: orderId } }), 0);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, 'OPEN');
});

before(async () => {
  if (!dbIntegrationEnabled) return;
  let databaseUrl;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('Refusing mutating integration suite unless DATABASE_URL is a valid local URL');
  }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error('Refusing mutating integration suite unless DATABASE_URL points to loopback');
  }
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  const isExistingLocalDatabase = database === 'hangers_db';
  const isDisposableGitHubDatabase = process.env.GITHUB_ACTIONS === 'true'
    && process.env.CI === 'true'
    && database === 'hangers_test'
    && databaseUrl.pathname === '/hangers_test';
  if (!isExistingLocalDatabase && !isDisposableGitHubDatabase) {
    throw new Error('Refusing mutating integration suite unless current database is the existing local hangers_db or the disposable GitHub Actions hangers_test database');
  }
  if (!String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')) {
    throw new Error('Refusing integration suite unless Razorpay configuration is Test Mode');
  }
  state.testDatabaseVerified = true;
  await syncMasterDataSettings();
  await syncPermissionCatalog();

  state.staff = await prisma.staff.create({
    data: {
      name: `Integration Admin ${runId}`,
      phone: `9${String(Date.now()).slice(-9)}`,
      email: `${runId}@example.test`,
      passwordHash: 'integration-test-only',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });
  state.actor = { ...state.staff, effectivePermissions: ['*'] };
  state.customer = await prisma.customer.create({
    data: { name: `Integration Customer ${runId}`, phone: `9${String(Date.now()).slice(-9)}` },
  });
  state.service = await prisma.service.create({
    data: { name: `Integration Service ${runId}`, category: 'INTEGRATION', basePrice: 100, isActive: true },
  });
});

after(async () => {
  if (!dbIntegrationEnabled) return;
  if (!state.testDatabaseVerified) {
    await prisma.$disconnect();
    return;
  }

  const bankImports = await prisma.bankStatementImport.findMany({ where: { accountLabel: bankImportLabel }, select: { id: true } });
  if (bankImports.length) {
    const ids = bankImports.map(({ id }) => id);
    const matches = await prisma.bankSettlementMatch.findMany({ where: { bankStatementRow: { importId: { in: ids } } }, select: { id: true } });
    const matchIds = matches.map(({ id }) => id);
    if (matchIds.length) {
      await prisma.activityLog.deleteMany({ where: { resourceId: { in: matchIds } } });
      await prisma.auditLog.deleteMany({ where: { resourceId: { in: matchIds } } });
      await prisma.bankSettlementMatch.deleteMany({ where: { id: { in: matchIds } } });
    }
    await prisma.activityLog.deleteMany({ where: { resourceId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: ids } } });
    await prisma.bankStatementImport.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.razorpaySettlementReconLine.deleteMany({ where: { providerSettlementId: { startsWith: `setl_bank_${runId}` } } });
  await prisma.razorpaySettlementReconLine.deleteMany({ where: { providerEntityId: { startsWith: `pay_${runId}_` } } });
  await prisma.razorpaySettlementSummary.deleteMany({ where: { providerSettlementId: { startsWith: `setl_bank_${runId}` } } });
  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: `IT-${runId}` } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const fixtureInvoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { invoiceNumber: { startsWith: `IT-${runId}` } },
      ],
    },
    select: { id: true },
  });
  const fixtureInvoiceIds = fixtureInvoices.map((invoice) => invoice.id);
  await prisma.outboxEvent.deleteMany({
    where: {
      OR: [
        ...(orderIds.length ? [{ aggregateType: 'order', aggregateId: { in: orderIds } }] : []),
        ...(fixtureInvoiceIds.length ? [{ aggregateType: 'invoice', aggregateId: { in: fixtureInvoiceIds } }] : []),
      ],
    },
  });
  if (orderIds.length) {
    await prisma.razorpayRefundAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoiceId: { in: fixtureInvoiceIds } } });
    await prisma.refundAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.creditNoteLine.deleteMany({ where: { creditNote: { orderId: { in: orderIds } } } });
    await prisma.creditNote.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.paymentAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.financialAdjustment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.invoiceRevision.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoice: { customerId: state.customer.id } } });
    await prisma.refundAllocation.deleteMany({ where: { invoice: { customerId: state.customer.id } } });
    await prisma.paymentAllocation.deleteMany({ where: { invoice: { customerId: state.customer.id } } });
    await prisma.receipt.deleteMany({ where: { customerId: state.customer.id } });
    await prisma.payment.deleteMany({ where: { customerId: state.customer.id } });
    await prisma.receipt.deleteMany({ where: { invoiceId: { in: fixtureInvoiceIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStage.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.activityLog.deleteMany({ where: { resourceId: { in: orderIds } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  const testInvoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { startsWith: `IT-${runId}` } },
    select: { id: true },
  });
  const testInvoiceIds = testInvoices.map((invoice) => invoice.id);
  if (testInvoiceIds.length) {
    const [allocations, invoiceReceipts] = await Promise.all([
      prisma.paymentAllocation.findMany({ where: { invoiceId: { in: testInvoiceIds } }, select: { paymentId: true } }),
      prisma.receipt.findMany({ where: { invoiceId: { in: testInvoiceIds } }, select: { paymentId: true } }),
    ]);
    const paymentIds = [...new Set([...allocations, ...invoiceReceipts].map((row) => row.paymentId))];
    await prisma.publicShareToken.deleteMany({ where: { resourceId: { in: testInvoiceIds } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.receipt.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.refundAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.financialAdjustment.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.invoiceRevision.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
  }
  const testAttempts = await prisma.razorpayCheckoutAttempt.findMany({
    where: { invoiceNumber: { startsWith: `IT-${runId}` } },
    select: { id: true },
  });
  if (testAttempts.length) {
    await prisma.razorpayPaymentJourneyEvent.deleteMany({
      where: { checkoutAttemptId: { in: testAttempts.map(({ id }) => id) } },
    });
  }
  await prisma.razorpayCheckoutAttempt.deleteMany({ where: { invoiceNumber: { startsWith: `IT-${runId}` } } });
  if (state.experimentVisitorHashes?.length) {
    await prisma.razorpayCheckoutExperimentEvent.deleteMany({ where: { visitorHash: { in: state.experimentVisitorHashes } } });
  }
  const webhookAuditFilter = { resource: 'razorpay_webhook', resourceId: { startsWith: `IT-${runId}` } };
  await prisma.activityLog.deleteMany({ where: webhookAuditFilter });
  await prisma.auditLog.deleteMany({ where: webhookAuditFilter });
  await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId: { startsWith: `IT-${runId}` } } });
  await prisma.reconciliationRun.deleteMany({ where: { scheduleKey: { startsWith: `IT-${runId}` } } });
  await prisma.idempotencyRecord.deleteMany({ where: { scope: 'razorpay.webhook.replay', key: { contains: runId } } });
  await prisma.publicShareToken.deleteMany({ where: { resourceId: { in: [state.customer?.id, state.foreignCustomer?.id].filter(Boolean) }, purpose: 'INVOICE_VIEW' } });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `IT-${runId}` } } });
  await prisma.serviceAppointment.deleteMany({ where: { appointmentNumber: { startsWith: `IT-${runId}` } } });
  await prisma.payment.deleteMany({ where: { razorpayPaymentId: { startsWith: `pay_${runId}_` } } });
  if (state.service?.id) await prisma.service.deleteMany({ where: { id: state.service.id } });
  if (state.customer?.id) await prisma.customer.deleteMany({ where: { id: state.customer.id } });
  if (state.foreignCustomer?.id) await prisma.customer.deleteMany({ where: { id: state.foreignCustomer.id } });
  if (state.staff?.id) await prisma.staff.deleteMany({ where: { id: state.staff.id } });
  await prisma.$disconnect();
});

const createOrder = async (suffix, totalAmount = 100, customerId = state.customer.id) => prisma.order.create({
  data: {
    orderNumber: `IT-${runId}-${suffix}`,
    customerId,
    documentType: 'ORDER',
    source: 'COUNTER',
    status: 'PICKED_UP',
    subtotal: totalAmount,
    totalAmount,
    assignedToId: state.staff.id,
  },
});

const createInvoice = async (suffix, balanceDue = 100, customerId = state.customer.id) => {
  const order = await createOrder(`INVOICE-${suffix}`, balanceDue, customerId);
  return prisma.invoice.create({
    data: {
    invoiceNumber: `IT-${runId}-${suffix}`,
    customerId,
    orderId: order.id,
    sourceType: 'ORDER',
    status: 'OPEN',
    currency: 'INR',
    dueDate: new Date(Date.now() + 86400000),
    subtotal: balanceDue,
    totalAmount: balanceDue,
    balanceDue,
    },
  });
};

integrationTest('Razorpay-collected payment cannot be marked refunded by the manual CRM refund flow', async () => {
  const invoice = await createInvoice('RZP-REFUND-GUARD', 100);
  const payment = await prisma.payment.create({
    data: {
      orderId: invoice.orderId,
      customerId: state.customer.id,
      amount: 100,
      kind: 'RECEIPT',
      method: 'RAZORPAY',
      status: 'CAPTURED',
      razorpayPaymentId: `pay_refund_guard_${runId}`,
    },
  });
  const allocation = await prisma.paymentAllocation.create({
    data: { paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 100, status: 'POSTED' },
  });
  await assert.rejects(
    prisma.$transaction((tx) => recordOrderRefund(tx, {
      orderId: invoice.orderId,
      sourcePaymentId: payment.id,
      amount: 100,
      reason: 'Provider refund guard test',
      staff: state.actor,
      idempotencyKey: `razorpay-refund-guard-${runId}`,
    })),
    (error) => error instanceof PaymentRuleError && error.code === 'RAZORPAY_REFUND_WORKFLOW_REQUIRED' && error.statusCode === 409
  );
  assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', reversalOfId: payment.id } }), 0);
  assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id } }), 0);
});

integrationTest('customer summary payment scope rejects invoices belonging to a different customer', async () => {
  const ownInvoice = await createInvoice('SUMMARY-OWN', 42);
  state.foreignCustomer = await prisma.customer.create({
    data: { name: `Foreign Summary Customer ${runId}`, phone: `6${String(Date.now() + 2).slice(-9)}` },
  });
  const foreignInvoice = await createInvoice('SUMMARY-FOREIGN', 55, state.foreignCustomer.id);
  const summaryToken = await createPublicShareToken({
    resourceType: 'CUSTOMER', resourceId: state.customer.id, purpose: 'INVOICE_VIEW',
  });
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const own = response();
  await getPublicRazorpayCheckoutStatus({
    params: { slug: summaryToken }, query: { invoiceId: ownInvoice.id }, headers: {}, id: `request-${runId}`,
  }, own);
  assert.equal(own.statusCode, 200);
  assert.equal(own.body.data.status, 'NONE');
  assert.equal(own.body.data.invoice.balanceDue, 42);

  const crossCustomer = response();
  await getPublicRazorpayCheckoutStatus({
    params: { slug: summaryToken }, query: { invoiceId: foreignInvoice.id }, headers: {}, id: `request-${runId}`,
  }, crossCustomer);
  assert.equal(crossCustomer.statusCode, 404);
  assert.equal(crossCustomer.body.code, 'INVOICE_NOT_FOUND');

  const missingSelection = response();
  await getPublicRazorpayCheckoutStatus({
    params: { slug: summaryToken }, query: {}, headers: {}, id: `request-${runId}`,
  }, missingSelection);
  assert.equal(missingSelection.statusCode, 404);

  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousTestContact = process.env.RAZORPAY_TEST_CONTACT_NUMBER;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_customer_summary_scope';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';
  const foreignCheckout = response();
  try {
    await createPublicRazorpayOrder({
      params: { slug: summaryToken }, body: { invoiceId: foreignInvoice.id }, headers: {}, id: `request-${runId}`,
      get: () => `customer-summary-scope-${runId}`,
    }, foreignCheckout);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousTestContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previousTestContact;
  }
  assert.equal(foreignCheckout.statusCode, 404);
  assert.equal(foreignCheckout.body.code, 'INVOICE_NOT_PAYABLE');
  assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: foreignInvoice.id } }), 0);
});

integrationTest('public status polling releases checkout only for a complete, invoice-bound failed payment list', async () => {
  const cases = [
    { suffix: 'INCOMPLETE', count: 2, payment: (orderId) => ({ id: `pay_incomplete_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'failed', captured: false }) },
    { suffix: 'WRONG_ORDER', count: 1, payment: () => ({ id: `pay_wrong_order_${runId}`, order_id: `order_other_${runId}`, amount: 1000, currency: 'INR', status: 'failed', captured: false }) },
    { suffix: 'WRONG_AMOUNT', count: 1, payment: (orderId) => ({ id: `pay_wrong_amount_${runId}`, order_id: orderId, amount: 999, currency: 'INR', status: 'failed', captured: false }) },
    { suffix: 'COMPLETE', count: 1, payment: (orderId) => ({ id: `pay_complete_failed_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'failed', captured: false, error_code: 'BAD_REQUEST_ERROR' }) },
  ];
  for (const scenario of cases) {
    const invoice = await createInvoice(`PUBLIC-FAILED-STATUS-${scenario.suffix}`, 10);
    const orderId = `order_public_failed_${scenario.suffix.toLowerCase()}_${runId}`;
    const attempt = await prisma.razorpayCheckoutAttempt.create({
      data: {
        idempotencyKey: `public-failed-status-${scenario.suffix.toLowerCase()}-${runId}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        customerId: invoice.customerId,
        amountPaise: 1000n,
        currency: 'INR',
        mode: 'TEST',
        status: 'CREATED',
        razorpayOrderId: orderId,
      },
    });
    const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getPublicRazorpayCheckoutStatus({
      params: { slug: token }, query: {}, headers: {}, id: `request-${runId}`,
    }, res, null, {
      getRazorpay: () => ({ orders: { fetchPayments: async (requestedOrderId) => {
        assert.equal(requestedOrderId, orderId);
        return { count: scenario.count, items: [scenario.payment(orderId)] };
      } } }),
    });
    const updated = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    assert.equal(res.statusCode, 200);
    assert.equal(updated.status, scenario.suffix === 'COMPLETE' ? 'FAILED' : 'CREATED', scenario.suffix);
    assert.equal(updated.razorpayPaymentId, scenario.suffix === 'COMPLETE' ? `pay_complete_failed_${runId}` : null, scenario.suffix);
  }
});

integrationTest('redirect checkout availability is opt-in and follows the server callback-route setting', async () => {
  const invoice = await createInvoice('RZP-REDIRECT-AVAILABILITY', 44);
  const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const previous = process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED;
  const status = async () => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getPublicRazorpayCheckoutStatus({ params: { slug: token }, query: {}, headers: {}, id: `request-${runId}` }, res);
    return res;
  };
  try {
    delete process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED;
    const disabled = await status();
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.body.data.redirectCheckoutAvailable, false);

    process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED = 'true';
    const enabled = await status();
    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.body.data.redirectCheckoutAvailable, true);
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED;
    else process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED = previous;
  }
});

integrationTest('Razorpay refund rejects amounts below the documented INR 1 minimum before reserving an attempt', async () => {
  const invoice = await createInvoice('RZP-REFUND-MINIMUM', 100);
  const payment = await prisma.payment.create({
    data: {
      orderId: invoice.orderId, customerId: state.customer.id, amount: 100,
      kind: 'RECEIPT', method: 'RAZORPAY', status: 'CAPTURED',
      razorpayPaymentId: `pay_refund_minimum_${runId}`,
    },
  });
  const allocation = await prisma.paymentAllocation.create({
    data: { paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 100, status: 'POSTED' },
  });
  await assert.rejects(
    createRazorpayRefund({
      orderId: invoice.orderId, sourcePaymentId: payment.id, amount: 0.5,
      reason: 'Below minimum refund test', staff: state.actor, idempotencyKey: `${runId}:refund-minimum`,
      provider: async () => { throw new Error('Provider should not be called'); },
    }),
    (error) => error instanceof PaymentRuleError && error.code === 'REFUND_BELOW_PROVIDER_MINIMUM'
  );
  assert.equal(await prisma.razorpayRefundAttempt.count({ where: { sourcePaymentId: payment.id } }), 0);
  assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id } }), 0);
});

integrationTest('Razorpay refund HTTP adapter matches the documented idempotent normal-refund request', async () => {
  const invoice = await createInvoice('RZP-REFUND-HTTP-CONTRACT', 10);
  const payment = await prisma.payment.create({
    data: {
      orderId: invoice.orderId, customerId: state.customer.id, amount: 10,
      kind: 'RECEIPT', method: 'RAZORPAY', status: 'CAPTURED',
      razorpayPaymentId: `pay_refund_http_${runId}`,
    },
  });
  const allocation = await prisma.paymentAllocation.create({
    data: { paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 10, status: 'POSTED' },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 10, balanceDue: 0, status: 'PAID' } });

  const originalPost = axios.post;
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const testKeyId = `rzp_test_refund_adapter_${runId}`;
  const testKeySecret = `integration-only-${runId}`;
  let request;
  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  axios.post = async (url, body, config) => {
    request = { url, body, config };
    return {
      data: {
        id: `rfnd_http_contract_${runId}`,
        payment_id: payment.razorpayPaymentId,
        amount: 1000,
        currency: 'INR',
        status: 'processed',
        notes: { crm_refund_attempt_id: request.body.notes.crm_refund_attempt_id },
      },
    };
  };

  try {
    const result = await createRazorpayRefund({
      orderId: invoice.orderId,
      sourcePaymentId: payment.id,
      amount: 10,
      reasonCode: 'CUSTOMER_REFUND',
      reason: 'Documented refund adapter contract test',
      staff: state.actor,
      idempotencyKey: `${runId}:refund-http-contract`,
    });

    assert.equal(request.url, `https://api.razorpay.com/v1/payments/${payment.razorpayPaymentId}/refund`);
    assert.deepEqual(request.body, {
      amount: 1000,
      receipt: `hcr-${result.attempt.id}`,
      notes: { crm_refund_attempt_id: result.attempt.id },
    });
    assert.equal(request.config.auth.username, testKeyId);
    assert.equal(request.config.auth.password, testKeySecret);
    assert.equal(request.config.headers['X-Refund-Idempotency'], result.attempt.providerIdempotencyKey);
    assert.match(request.config.headers['X-Refund-Idempotency'], /^[A-Za-z0-9_-]{10,}$/);
    assert.equal(request.config.timeout, 15000);
    assert.equal(result.attempt.status, 'PROCESSED');
    assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id, status: 'POSTED' } }), 1);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).paidAmount), 0);
  } finally {
    axios.post = originalPost;
    if (originalKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = originalKeyId;
    if (originalKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  }
});

integrationTest('Razorpay refund posts to CRM only after provider confirms processed, and duplicate webhook reconciliation is idempotent', async () => {
  const invoice = await createInvoice('RZP-REFUND-LIFECYCLE', 100);
  const payment = await prisma.payment.create({
    data: {
      orderId: invoice.orderId,
      customerId: state.customer.id,
      amount: 100,
      kind: 'RECEIPT',
      method: 'RAZORPAY',
      status: 'CAPTURED',
      razorpayPaymentId: `pay_refund_lifecycle_${runId}`,
    },
  });
  const allocation = await prisma.paymentAllocation.create({
    data: { paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 100, status: 'POSTED' },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 100, balanceDue: 0, status: 'PAID' } });
  const idempotencyKey = `${runId}:refund-lifecycle`;
  const pendingResult = await createRazorpayRefund({
    orderId: invoice.orderId,
    sourcePaymentId: payment.id,
    amount: 40,
    reasonCode: 'CUSTOMER_REFUND',
    reason: 'Integration refund lifecycle test',
    staff: state.actor,
    idempotencyKey,
    provider: async ({ paymentId, amountPaise, attempt }) => ({
      id: `rfnd_lifecycle_${runId}`,
      payment_id: paymentId,
      amount: Number(amountPaise),
      currency: 'INR',
      status: 'pending',
      notes: { crm_refund_attempt_id: attempt.id },
    }),
  });
  assert.equal(pendingResult.pending, true);
  assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', reversalOfId: payment.id } }), 0);
  assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id } }), 0);
  assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 0);

  const providerRefund = {
    id: pendingResult.attempt.razorpayRefundId,
    payment_id: payment.razorpayPaymentId,
    amount: 4000,
    currency: 'INR',
    status: 'processed',
    notes: { crm_refund_attempt_id: pendingResult.attempt.id },
  };
  const event = {
    refundId: providerRefund.id,
    refundAttemptId: pendingResult.attempt.id,
    eventId: `IT-${runId}:refund-processed`,
    eventType: 'refund.processed',
  };
  const fetcher = async (refundId) => {
    assert.equal(refundId, providerRefund.id);
    return providerRefund;
  };
  const first = await reconcileRazorpayRefundWebhook(event, fetcher);
  const duplicate = await reconcileRazorpayRefundWebhook(event, fetcher);
  assert.equal(first.providerStatus, 'processed');
  assert.equal(duplicate.providerStatus, 'processed');
  assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', reversalOfId: payment.id } }), 1);
  assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id, status: 'POSTED' } }), 1);
  const [updatedInvoice, attempt] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoice.id } }),
    prisma.razorpayRefundAttempt.findUnique({ where: { id: pendingResult.attempt.id } }),
  ]);
  assert.equal(Number(updatedInvoice.balanceDue), 0);
  assert.equal(Number(updatedInvoice.paidAmount), 60);
  assert.equal(Number(updatedInvoice.creditAmount), 40);
  assert.equal(attempt.status, 'PROCESSED');
  assert.equal(attempt.razorpayRefundId, providerRefund.id);
  assert.equal(serializeRefundAttempt(attempt).amount, 40);
  assert.equal(Object.hasOwn(serializeRefundAttempt(attempt), 'amountPaise'), false);
});

integrationTest('ambiguous Razorpay refund recovery reuses the same provider idempotency identity', async () => {
  const invoice = await createInvoice('RZP-REFUND-RECOVERY', 100);
  const payment = await prisma.payment.create({
    data: {
      orderId: invoice.orderId, customerId: state.customer.id, amount: 100,
      kind: 'RECEIPT', method: 'RAZORPAY', status: 'CAPTURED',
      razorpayPaymentId: `pay_refund_recovery_${runId}`,
    },
  });
  const allocation = await prisma.paymentAllocation.create({
    data: { paymentId: payment.id, orderId: invoice.orderId, invoiceId: invoice.id, amount: 100, status: 'POSTED' },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 100, balanceDue: 0, status: 'PAID' } });

  const providerRequests = [];
  const initial = await createRazorpayRefund({
    orderId: invoice.orderId, sourcePaymentId: payment.id, amount: 25,
    reasonCode: 'CUSTOMER_REFUND', reason: 'Recover ambiguous integration request',
    staff: state.actor, idempotencyKey: `${runId}:refund-recovery`,
    provider: async (request) => {
      providerRequests.push(request);
      throw Object.assign(new Error('Connection closed after request dispatch'), { code: 'ECONNRESET' });
    },
  });
  assert.equal(initial.review, true);
  const recovered = await reconcileRazorpayRefundAttempt({
    orderId: invoice.orderId,
    attemptId: initial.attempt.id,
    staff: state.actor,
    provider: async (request) => {
      providerRequests.push(request);
      return {
        id: `rfnd_recovery_${runId}`,
        payment_id: payment.razorpayPaymentId,
        amount: 2500,
        currency: 'INR',
        status: 'pending',
        notes: { crm_refund_attempt_id: initial.attempt.id },
      };
    },
  });
  assert.equal(providerRequests.length, 2);
  assert.equal(providerRequests[0].attempt.providerIdempotencyKey, providerRequests[1].attempt.providerIdempotencyKey);
  assert.equal(providerRequests[0].attempt.id, providerRequests[1].attempt.id);
  assert.equal(recovered.pending, true);
  assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', reversalOfId: payment.id } }), 0);

  const lookupFailure = await reconcileRazorpayRefundAttempt({
    orderId: invoice.orderId,
    attemptId: initial.attempt.id,
    staff: state.actor,
    fetcher: async () => { throw {
      response: { status: 502, data: { error: {
        code: 'GATEWAY_ERROR', description: 'Refund status unavailable for OTP 765432',
        field: 'refund_id', source: 'gateway', step: 'refund_status', reason: 'upstream_timeout',
        metadata: { payment_id: 'pay_ABC12345678901', order_id: 'order_XYZ1234567890' },
      } } },
    }; },
  });
  assert.equal(lookupFailure.review, true);
  assert.equal(lookupFailure.attempt.failureCode, 'GATEWAY_ERROR');
  const refundReviewAudit = await prisma.auditLog.findFirst({
    where: { action: 'RAZORPAY_REFUND_REVIEW', resourceId: initial.attempt.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(refundReviewAudit.metadata.providerError.httpStatus, 502);
  assert.equal(refundReviewAudit.metadata.providerError.description.includes('765432'), false);
  assert.equal(refundReviewAudit.metadata.providerError.payment_id, 'pay_ABC12345678901');

  const processed = await reconcileRazorpayRefundAttempt({
    orderId: invoice.orderId,
    attemptId: initial.attempt.id,
    staff: state.actor,
    fetcher: async (refundId) => ({
      id: refundId,
      payment_id: payment.razorpayPaymentId,
      amount: 2500,
      currency: 'INR',
      status: 'processed',
      notes: { crm_refund_attempt_id: initial.attempt.id },
    }),
  });
  assert.equal(processed.attempt.status, 'PROCESSED');
  assert.equal(await prisma.payment.count({ where: { kind: 'REFUND', reversalOfId: payment.id } }), 1);
  assert.equal(await prisma.refundAllocation.count({ where: { sourceAllocationId: allocation.id, status: 'POSTED' } }), 1);
});

integrationTest('server pricing owns catalog identity and price', async () => {
  const priced = await prisma.$transaction((tx) => resolveOrderPricing(tx, {
    customerId: state.customer.id,
    staff: state.actor,
    items: [{
      serviceId: state.service.id,
      serviceName: 'Tampered name',
      garmentType: 'Tampered category',
      quantity: 2,
    }],
  }));

  assert.equal(priced.items[0].serviceName, state.service.name);
  assert.equal(priced.items[0].garmentType, state.service.category);
  assert.equal(priced.items[0].unitPrice, 100);
  assert.equal(priced.totalAmount, 200);

  await assert.rejects(
    prisma.$transaction((tx) => resolveOrderPricing(tx, {
      customerId: state.customer.id,
      staff: { ...state.actor, effectivePermissions: ['orders.create'] },
      commercialReason: 'Unauthorized price change',
      items: [{ serviceId: state.service.id, quantity: 1, unitPrice: 1 }],
    })),
    (error) => error instanceof CommercialRuleError && error.code === 'COMMERCIAL_APPROVAL_REQUIRED'
  );
});

integrationTest('captured receipts allocate exactly once and drive cached order balance', async () => {
  const order = await createOrder('SETTLEMENT');
  const result = await prisma.$transaction(async (tx) => {
    const settlement = await recordOrderSettlement(tx, {
      orderId: order.id,
      amount: 100,
      method: 'CASH',
      staff: state.actor,
      idempotencyKey: `${runId}:settlement`,
    });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: state.staff.id, actorName: state.staff.name,
      action: 'PAYMENT_RECORDED', resource: 'order', resourceId: order.id,
      description: 'Integration settlement', metadata: { paymentIds: settlement.payments.map((payment) => payment.id) },
    });
    return settlement;
  }, { isolationLevel: 'Serializable' });

  assert.equal(result.paidAmount, 100);
  assert.equal(result.paymentStatus, 'PAID');
  const [storedOrder, allocation, audit] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id } }),
    prisma.paymentAllocation.aggregate({ where: { orderId: order.id, status: 'POSTED' }, _sum: { amount: true } }),
    prisma.auditLog.findFirst({ where: { resourceId: order.id, action: 'PAYMENT_RECORDED' } }),
  ]);
  assert.equal(storedOrder.paidAmount, 100);
  assert.equal(allocation._sum.amount, 100);
  assert.ok(audit);

  await assert.rejects(
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id,
      amount: 1,
      method: 'CASH',
      staff: state.actor,
      idempotencyKey: `${runId}:second-settlement`,
    }), { isolationLevel: 'Serializable' }),
    (error) => error instanceof PaymentRuleError && error.code === 'OVERPAYMENT_NOT_ALLOWED'
  );
});

integrationTest('row locking prevents concurrent over-collection', async () => {
  const order = await createOrder('CONCURRENCY');
  const attempts = await Promise.allSettled([
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id, amount: 70, method: 'CASH', staff: state.actor, idempotencyKey: `${runId}:concurrent-a`,
    }), { isolationLevel: 'Serializable' }),
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id, amount: 70, method: 'CASH', staff: state.actor, idempotencyKey: `${runId}:concurrent-b`,
    }), { isolationLevel: 'Serializable' }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);

  const [orderAfter, allocation] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id } }),
    prisma.paymentAllocation.aggregate({ where: { orderId: order.id, status: 'POSTED' }, _sum: { amount: true } }),
  ]);
  assert.equal(orderAfter.paidAmount, 70);
  assert.equal(allocation._sum.amount, 70);
});

integrationTest('business write and audit evidence roll back together', async () => {
  const orderNumber = `IT-${runId}-ROLLBACK`;
  await assert.rejects(prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: state.customer.id,
        documentType: 'ORDER',
        source: 'COUNTER',
        status: 'PICKED_UP',
        subtotal: 25,
        totalAmount: 25,
        assignedToId: state.staff.id,
      },
    });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: state.staff.id, actorName: state.staff.name,
      action: 'ORDER_CREATED', resource: 'order', resourceId: order.id,
      description: 'Rollback integration event',
    });
    throw new Error('ROLLBACK_TEST');
  }), /ROLLBACK_TEST/);

  assert.equal(await prisma.order.count({ where: { orderNumber } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { description: 'Rollback integration event' } }), 0);
});

integrationTest('physical garment quantity has one immutable unique unit tag per piece', async () => {
  const order = await createOrder('GARMENT-UNITS', 300);
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id, serviceId: state.service.id, serviceName: state.service.name,
      garmentType: state.service.category, quantity: 3, unitPrice: 100, subtotal: 300,
    },
  });
  const initial = await prisma.$transaction((tx) => syncOrderGarmentUnits(tx, order.id));
  assert.equal(initial.length, 3);
  assert.equal(new Set(initial.map((unit) => unit.tagNumber)).size, 3);

  await prisma.orderItem.update({ where: { id: item.id }, data: { quantity: 2, subtotal: 200 } });
  await prisma.$transaction((tx) => syncOrderGarmentUnits(tx, order.id, { voidReason: 'INTEGRATION_REDUCTION' }));
  const units = await prisma.garmentUnit.findMany({ where: { orderItemId: item.id } });
  assert.equal(units.filter((unit) => unit.status !== 'VOID').length, 2);
  assert.equal(units.filter((unit) => unit.status === 'VOID').length, 1);
});

integrationTest('database permits only one default address per customer under concurrency', async () => {
  const attempts = await Promise.allSettled([
    prisma.address.create({ data: { customerId: state.customer.id, label: 'HOME', addressLine1: 'Integration A', city: 'Mumbai', pincode: '400001', isDefault: true } }),
    prisma.address.create({ data: { customerId: state.customer.id, label: 'WORK', addressLine1: 'Integration B', city: 'Mumbai', pincode: '400001', isDefault: true } }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(await prisma.address.count({ where: { customerId: state.customer.id, isDefault: true } }), 1);
});

integrationTest('document sequence remains unique under concurrent generation', async () => {
  const values = await Promise.all(Array.from({ length: 12 }, () =>
    prisma.$transaction((tx) => nextDocumentNumber({
      tx, documentType: `INTEGRATION_${runId}`, prefix: 'ITSEQ-', padding: 6,
    }))
  ));
  assert.equal(new Set(values).size, values.length);
});

integrationTest('Razorpay checkout replays the same active order for repeated requests', async () => {
  const invoice = await createInvoice('RZP-REUSE');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerCalls = 0;
  const provider = { orders: { create: async (payload) => {
    providerCalls += 1;
    assert.equal(payload.amount, 10000);
    return { id: `order_${runId}`, amount: payload.amount, currency: payload.currency };
  } } };
  try {
    const first = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `first-${runId}`, provider });
    const retry = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `retry-${runId}`, provider });
    const sameRequestReplay = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `first-${runId}`, provider });
    assert.equal(retry.reused, true);
    assert.equal(sameRequestReplay.reused, true);
    assert.equal(sameRequestReplay.attempt.id, first.attempt.id);
    assert.equal(sameRequestReplay.order.id, first.order.id);
    assert.equal(retry.attempt.id, first.attempt.id);
    assert.equal(retry.order.id, first.order.id);
    assert.equal(providerCalls, 1);
    assert.equal(await prisma.auditLog.count({ where: { resource: 'razorpay_checkout_attempt', resourceId: first.attempt.id, action: { in: ['RAZORPAY_CHECKOUT_ATTEMPT_RESERVED', 'RAZORPAY_PROVIDER_ORDER_CREATED'] } } }), 2);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('concurrent duplicate checkout submissions reserve one attempt and create at most one provider order', async () => {
  const invoice = await createInvoice('RZP-CONCURRENT-DUPLICATE', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerCalls = 0;
  const provider = { orders: { create: async (payload) => {
    providerCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { id: `order_concurrent_${runId}`, amount: payload.amount, currency: payload.currency };
  } } };

  try {
    const results = await Promise.allSettled(Array.from({ length: 24 }, () =>
      createInvoiceCheckout({
        invoice,
        shareId: `share-concurrent-${runId}`,
        idempotencyKey: `concurrent-${runId}`,
        provider,
      })
    ));
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.ok(fulfilled.length >= 1);
    assert.equal(fulfilled.length + rejected.length, 24);
    assert.ok(
      rejected.every(({ reason }) => reason.code === 'CHECKOUT_ATTEMPT_UNRESOLVED'),
      `Unexpected concurrent checkout errors: ${JSON.stringify(rejected.map(({ reason }) => reason.code || reason.name))}`
    );
    assert.equal(providerCalls, 1);
    assert.ok(fulfilled.every(({ value }) =>
      value.attempt.id === fulfilled[0].value.attempt.id
      && value.order.id === fulfilled[0].value.order.id
    ));

    const attempts = await prisma.razorpayCheckoutAttempt.findMany({ where: { invoiceId: invoice.id } });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].status, 'CREATED');
    assert.equal(attempts[0].razorpayOrderId, fulfilled[0].value.order.id);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('a confirmed failed payment retry reserves a new attempt and Razorpay order', async () => {
  const invoice = await createInvoice('RZP-RETRY', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const providerOrders = [];
  const provider = { orders: { create: async (payload) => {
    const order = { id: `order_retry_${providerOrders.length}_${runId}`, amount: payload.amount, currency: payload.currency };
    providerOrders.push(order);
    return order;
  } } };
  try {
    const first = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `retry-first-${runId}`, provider });
    const failed = await markAttemptFailed({ attemptId: first.attempt.id, paymentId: `pay_failed_${runId}`, source: 'INTEGRATION_TEST' });
    assert.equal(failed.status, 'FAILED');
    const next = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `retry-second-${runId}`, provider });
    assert.notEqual(next.attempt.id, first.attempt.id);
    assert.notEqual(next.order.id, first.order.id);
    assert.equal(next.attempt.paymentJourneyId, first.attempt.paymentJourneyId,
      'a provider-confirmed retry of the unchanged invoice continues the same payment journey');
    assert.equal(next.attempt.status, 'CREATED');
    assert.equal(providerOrders.length, 2);
    const reservationAudit = await prisma.auditLog.findFirst({
      where: { resource: 'razorpay_checkout_attempt', resourceId: next.attempt.id, action: 'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED' },
    });
    assert.equal(reservationAudit.metadata.supersedesAttemptId, first.attempt.id);
    assert.equal(reservationAudit.metadata.retryReason, 'PROVIDER_CONFIRMED_FAILURE');
    await markAttemptFailed({ attemptId: next.attempt.id, paymentId: `pay_failed_second_${runId}`, source: 'INTEGRATION_TEST' });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { subtotal: 12, totalAmount: 12, balanceDue: 12 },
    });
    const changedBalance = await createInvoiceCheckout({
      invoice, shareId: `share-${runId}`, idempotencyKey: `retry-changed-balance-${runId}`, provider,
    });
    assert.equal(changedBalance.attempt.amountPaise, 1200n);
    assert.notEqual(changedBalance.attempt.paymentJourneyId, first.attempt.paymentJourneyId,
      'a changed payable snapshot starts a new payment journey');
    assert.equal(providerOrders.length, 3);
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `retry-first-${runId}`, provider }),
      (error) => error.code === 'CHECKOUT_ATTEMPT_TERMINAL'
    );
    assert.equal(await prisma.auditLog.count({ where: { resourceId: first.attempt.id, action: 'RAZORPAY_PAYMENT_PROVIDER_FAILED' } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('public invoice checkout status enables resume only for the same never-attempted Razorpay order', async () => {
  const invoice = await createInvoice('RZP-RESUME-STATUS', 159);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerPayments = { items: [] };
  let providerOrder;
  let providerOrderCreateCalls = 0;
  const provider = {
    orders: {
      create: async (payload) => {
        providerOrderCreateCalls += 1;
        providerOrder = {
          id: `order_resume_${runId}`,
          amount: payload.amount,
          amount_due: payload.amount,
          amount_paid: 0,
          currency: payload.currency,
          notes: payload.notes,
          status: 'created',
          attempts: 0,
        };
        return providerOrder;
      },
      fetch: async (orderId) => {
        assert.equal(orderId, providerOrder.id);
        return providerOrder;
      },
      fetchPayments: async (orderId) => {
        assert.equal(orderId, providerOrder.id);
        return providerPayments;
      },
    },
    payments: {
      fetch: async (paymentId) => ({
        id: paymentId,
        order_id: providerOrder.id,
        amount: 15900,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        card: { network: 'Visa', type: 'debit' },
      }),
    },
  };
  try {
    const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const share = await resolvePublicShareToken({ token, purpose: 'INVOICE_VIEW' });
    const refreshedToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: share.id,
      idempotencyKey: `resume-status-${runId}`,
      provider,
    });
    const makeRequest = async (includeAttemptId = true, useRefreshedToken = false) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await getPublicRazorpayCheckoutStatus({
        params: { slug: useRefreshedToken ? refreshedToken : token },
        query: includeAttemptId ? { attemptId: checkout.attempt.id } : {},
        headers: {},
        id: `request-${runId}`,
      }, res, undefined, { getRazorpay: () => provider });
      return res;
    };

    const resumable = await makeRequest(false);
    assert.equal(resumable.statusCode, 200);
    assert.equal(resumable.body.data.status, 'CREATED');
    assert.equal(resumable.body.data.attemptId, checkout.attempt.id);
    assert.equal(resumable.body.data.canResumeCheckout, true);
    assert.equal(resumable.body.data.paymentId, null);

    providerOrder = { ...providerOrder, status: 'attempted', attempts: 1 };
    providerPayments = { items: [{
      id: `pay_created_${runId}`, order_id: providerOrder.id, amount: 15900, currency: 'INR',
      status: 'created', created_at: Math.floor(Date.now() / 1000) - 900,
    }] };
    const refreshed = await makeRequest(false, true);
    assert.equal(refreshed.statusCode, 200);
    assert.equal(refreshed.body.data.status, 'CREATED');
    assert.equal(refreshed.body.data.attemptId, checkout.attempt.id);
    assert.equal(refreshed.body.data.canResumeCheckout, false);
    const nonterminalAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'RAZORPAY_PAYMENT_STATUS_NONTERMINAL_PROVIDER_PAYMENT',
        resourceId: checkout.order.id,
        metadata: { path: ['checkoutAttemptId'], equals: checkout.attempt.id },
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(nonterminalAudit, 'nonterminal provider status must leave durable audit evidence');
    assert.deepEqual(nonterminalAudit.metadata.providerPaymentStatuses, [{
      paymentId: `pay_created_${runId}`,
      status: 'created',
      method: 'unknown',
      amountPaise: 15900,
      currency: 'INR',
      captured: false,
    }]);
    assert.equal(JSON.stringify(nonterminalAudit).includes(token), false, 'audit must not contain public share tokens');

    const blocked = await makeRequest(true, true);
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.body.data.canResumeCheckout, false);
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } })).status, 'CREATED');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: `pay_created_${runId}` } }), 0);

    const paymentId = `pay_captured_after_tab_close_${runId}`;
    providerPayments = { items: [{ id: paymentId, status: 'captured' }] };
    const recovered = await makeRequest(false, true);
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.body.data.status, 'CAPTURED');
    assert.equal(recovered.body.data.paymentId, paymentId);
    assert.equal(recovered.body.data.invoice.status, 'PAID');
    assert.equal(Number(recovered.body.data.invoice.balanceDue), 0);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, status: 'CAPTURED' } }), 1);

    const reopened = await makeRequest(false, true);
    assert.equal(reopened.statusCode, 200);
    assert.equal(reopened.body.data.status, 'CAPTURED');
    assert.equal(reopened.body.data.paymentId, paymentId);
    assert.equal(reopened.body.data.invoice.status, 'PAID');
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay late authorization recovers a failed attempt and a stale failure cannot regress it', async () => {
  const invoice = await createInvoice('RZP-LATE-AUTH', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const provider = {
    orders: { create: async (payload) => ({ id: `order_late_${runId}`, amount: payload.amount, currency: payload.currency }) },
    payments: { fetch: async (paymentId) => ({ id: paymentId, order_id: `order_late_${runId}`, amount: 1000, currency: 'INR', status: 'authorized' }) },
  };
  try {
    const checkout = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `late-auth-${runId}`, provider });
    await markAttemptFailed({ attemptId: checkout.attempt.id, paymentId: `pay_late_${runId}`, source: 'INTEGRATION_TEST' });
    await processWebhook({ event: 'payment.authorized', paymentId: `pay_late_${runId}`, orderId: checkout.order.id }, { razorpayProvider: provider });
    let attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(attempt.status, 'AUTHORIZED');
    await processWebhook({ event: 'payment.failed', paymentId: `pay_late_${runId}`, orderId: checkout.order.id }, { razorpayProvider: provider });
    attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(attempt.status, 'AUTHORIZED');
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('captured Razorpay payment after invoice balance changes is quarantined without a duplicate receipt', async () => {
  const invoice = await createInvoice('RZP-CAPTURE-AFTER-BALANCE-CHANGE', 10);
  const previousKeys = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `balance-change-${runId}`;
  let providerOrder;
  const paymentId = `pay_balance_changed_${runId}`;
  const providerPayment = {
    id: paymentId,
    order_id: `order_balance_changed_${runId}`,
    amount: 1000,
    currency: 'INR',
    status: 'captured',
    captured: true,
    method: 'upi',
  };
  const provider = {
    orders: {
      create: async (payload) => (providerOrder = {
        id: providerPayment.order_id,
        amount: payload.amount,
        currency: payload.currency,
        notes: payload.notes,
      }),
      fetch: async () => providerOrder,
    },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-balance-change-${runId}`,
      idempotencyKey: `balance-change-${runId}`,
      provider,
    });

    const manualSettlement = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
      invoiceId: invoice.id,
      amount: 10,
      method: 'CASH',
      notes: 'Integration test: invoice paid before delayed provider confirmation',
      idempotencyKey: `balance-change-manual-${runId}`,
      staff: state.actor,
    }));
    assert.equal(manualSettlement.balanceDue, 0);

    await assert.rejects(
      settleCapturedPayment({ paymentId, providerOrderId: checkout.order.id, provider }),
      (error) => error.code === 'SETTLEMENT_REQUIRES_REVIEW' && /do not pay again/i.test(error.message),
    );

    const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    const refreshedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    assert.equal(attempt.status, 'REVIEW');
    assert.equal(attempt.failureCode, 'OVERPAYMENT_NOT_ALLOWED');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
    assert.equal(await prisma.payment.count({ where: { orderId: invoice.orderId, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
    assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id, status: 'POSTED' } }), 1);
    assert.equal(Number(refreshedInvoice.balanceDue), 0);
    assert.equal(Number(refreshedInvoice.paidAmount), 10);
    assert.equal(await prisma.auditLog.count({
      where: { resource: 'razorpay_checkout_attempt', resourceId: attempt.id, action: 'RAZORPAY_CAPTURE_REQUIRES_FINANCE_REVIEW', status: 'FAILURE' },
    }), 1);
  } finally {
    if (previousKeys.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeys.keyId;
    if (previousKeys.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeys.keySecret;
  }
});

integrationTest('Razorpay payment webhooks follow fetched provider state and reject a mismatched payment order', async () => {
  const invoice = await createInvoice('RZP-WEBHOOK-AUTHORITY', 25);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerPayment;
  const provider = {
    orders: { create: async (payload) => ({ id: `order_webhook_authority_${runId}`, amount: payload.amount, currency: payload.currency }) },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-webhook-authority-${runId}`,
      idempotencyKey: `webhook-authority-${runId}`,
      provider,
    });
    providerPayment = { id: `pay_webhook_authority_${runId}`, order_id: checkout.order.id, amount: 2500, currency: 'INR', status: 'authorized' };
    await processWebhook({ event: 'payment.failed', paymentId: providerPayment.id, orderId: checkout.order.id }, { razorpayProvider: provider });
    let attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(attempt.status, 'AUTHORIZED', 'a stale failed webhook must not override the fetched current provider state');

    providerPayment = { ...providerPayment, amount: 2501 };
    await assert.rejects(
      processWebhook({ event: 'payment.authorized', paymentId: providerPayment.id, orderId: checkout.order.id }, { razorpayProvider: provider }),
      (error) => error.code === 'PROVIDER_AMOUNT_MISMATCH' && error.permanent === true,
    );
    providerPayment = { ...providerPayment, amount: 2500, currency: 'USD' };
    await assert.rejects(
      processWebhook({ event: 'payment.authorized', paymentId: providerPayment.id, orderId: checkout.order.id }, { razorpayProvider: provider }),
      (error) => error.code === 'PROVIDER_CURRENCY_MISMATCH' && error.permanent === true,
    );
    providerPayment = { ...providerPayment, currency: 'INR' };
    providerPayment = { ...providerPayment, order_id: `order_mismatch_${runId}` };
    await assert.rejects(
      processWebhook({ event: 'payment.authorized', paymentId: providerPayment.id, orderId: checkout.order.id }, { razorpayProvider: provider }),
      (error) => error.code === 'PROVIDER_PAYMENT_REFERENCE_MISMATCH' && error.permanent === true,
    );
    attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(attempt.status, 'AUTHORIZED', 'mismatched provider data must not mutate the CRM attempt');
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('order.paid fetches captured provider payments and settles each into CRM exactly once', async () => {
  const invoice = await createInvoice('RZP-ORDER-PAID', 25);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let order;
  let fetchPaymentsCalls = 0;
  const payment = {
    id: `pay_order_paid_${runId}`,
    order_id: `order_order_paid_${runId}`,
    amount: 2500,
    currency: 'INR',
    status: 'captured',
  };
  const provider = {
    orders: {
      create: async (payload) => {
        order = { id: `order_order_paid_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes };
        return order;
      },
      fetchPayments: async (orderId) => {
        fetchPaymentsCalls += 1;
        assert.equal(orderId, order.id);
        return { items: [{ ...payment, status: 'failed', id: `pay_failed_before_success_${runId}` }, payment] };
      },
      fetch: async (orderId) => {
        assert.equal(orderId, order.id);
        return order;
      },
    },
    payments: { fetch: async (paymentId) => {
      assert.equal(paymentId, payment.id);
      return payment;
    } },
  };
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-${runId}`,
      idempotencyKey: `order-paid-${runId}`,
      provider,
    });
    const eventId = `IT-${runId}-ORDER-PAID`;
    const event = { event: 'order.paid', eventId, orderId: checkout.order.id };
    const inboxEvent = await prisma.razorpayWebhookEvent.create({
      data: {
        eventId,
        event: event.event,
        orderId: event.orderId,
        payload: {},
        payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
        status: 'RECEIVED',
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    assert.equal(await processRazorpayWebhookBatch({
      onlyEventId: inboxEvent.id,
      processor: (inboxRecord) => processWebhook(inboxRecord, { razorpayProvider: provider }),
    }), 1);
    const replay = await processWebhook(event, { razorpayProvider: provider });

    assert.equal((await prisma.razorpayWebhookEvent.findUnique({ where: { id: inboxEvent.id } })).status, 'PROCESSED');
    assert.equal(replay.state, 'PROCESSED');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: payment.id, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
    assert.equal(await prisma.receipt.count({ where: { customerId: state.customer.id, allocations: { some: { invoiceId: invoice.id } } } }), 1);
    assert.equal(await prisma.invoice.findUnique({ where: { id: invoice.id } }).then((row) => Number(row.balanceDue)), 0);
    assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment-received:${(await prisma.payment.findFirst({ where: { razorpayPaymentId: payment.id } })).id}` } }), 1);
    assert.equal(fetchPaymentsCalls, 2);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('order.paid stays retryable when captured-payment listing races the authoritative payment fetch', async () => {
  const invoice = await createInvoice('RZP-ORDER-PAID-PENDING', 25);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let order;
  const listedPayment = {
    id: `pay_order_paid_stale_${runId}`,
    order_id: `order_order_paid_stale_${runId}`,
    amount: 2500,
    currency: 'INR',
    status: 'captured',
  };
  const provider = {
    orders: {
      create: async (payload) => {
        order = { id: listedPayment.order_id, amount: payload.amount, currency: payload.currency, notes: payload.notes };
        return order;
      },
      fetchPayments: async () => ({ items: [listedPayment] }),
      fetch: async () => order,
    },
    payments: { fetch: async () => ({ ...listedPayment, status: 'authorized' }) },
  };
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-${runId}`,
      idempotencyKey: `order-paid-pending-${runId}`,
      provider,
    });
    const eventId = `IT-${runId}-ORDER-PAID-PENDING`;
    const inboxEvent = await prisma.razorpayWebhookEvent.create({
      data: {
        eventId,
        event: 'order.paid',
        orderId: checkout.order.id,
        payload: {},
        payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
        status: 'RECEIVED',
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    await processRazorpayWebhookBatch({
      onlyEventId: inboxEvent.id,
      processor: (record) => processWebhook(record, { razorpayProvider: provider }),
    });

    const storedEvent = await prisma.razorpayWebhookEvent.findUnique({ where: { id: inboxEvent.id } });
    const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    const freshInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    assert.equal(storedEvent.status, 'RETRY');
    assert.equal(storedEvent.error, 'PROVIDER_STATE_PENDING');
    assert.equal(attempt.status, 'PENDING');
    assert.equal(Number(freshInvoice.balanceDue), 25);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: listedPayment.id } }), 0);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay checkout blocks a second order while the first create is unresolved', async () => {
  const invoice = await createInvoice('RZP-RACE');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerCalls = 0;
  let finishProvider;
  const provider = { orders: { create: async (payload) => {
    providerCalls += 1;
    await new Promise((resolve) => { finishProvider = resolve; });
    return { id: `order_race_${runId}`, amount: payload.amount, currency: payload.currency };
  } } };
  try {
    const firstPromise = createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `race-a-${runId}`, provider });
    while (!finishProvider) await new Promise((resolve) => setTimeout(resolve, 2));
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `race-b-${runId}`, provider }),
      (error) => error.code === 'CHECKOUT_ALREADY_IN_PROGRESS'
    );
    finishProvider();
    await firstPromise;
    assert.equal(providerCalls, 1);
  } finally {
    finishProvider?.();
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay checkout resumes the same unpaid Order from a refreshed valid invoice link', async () => {
  const invoice = await createInvoice('RZP-REFRESHED-LINK', 25);
  const firstToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const refreshedToken = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerOrder;
  let providerPayment;
  let createCalls = 0;
  const provider = {
    orders: {
      create: async (payload) => {
        createCalls += 1;
        providerOrder = {
          id: `order_refresh_${runId}`, amount: payload.amount, currency: payload.currency,
          status: 'created', attempts: 0, amount_due: payload.amount, amount_paid: 0,
          receipt: payload.receipt, notes: payload.notes,
        };
        return providerOrder;
      },
      fetch: async () => providerOrder,
      fetchPayments: async () => ({ count: 0, items: [] }),
    },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const original = await createInvoiceCheckout({
      invoice, shareId: firstToken, idempotencyKey: `refresh-original-${runId}`, provider, customCheckout: true,
    });
    const resumed = await createInvoiceCheckout({
      invoice, shareId: refreshedToken, idempotencyKey: `refresh-resumed-${runId}`, provider, customCheckout: true,
    });
    assert.equal(resumed.reused, true);
    assert.equal(resumed.attempt.id, original.attempt.id);
    assert.equal(resumed.order.id, original.order.id);
    assert.equal(createCalls, 1, 'a refreshed invoice link must not create a second provider Order');

    providerPayment = {
      id: `pay_refresh_${runId}`, order_id: original.order.id, amount: 2500,
      currency: 'INR', status: 'captured', captured: true, method: 'card',
    };
    const otherInvoice = await createInvoice('RZP-REFRESHED-LINK-OTHER', 25);
    await assert.rejects(
      settleCapturedPayment({
        paymentId: providerPayment.id,
        providerOrderId: original.order.id,
        expectedInvoiceId: otherInvoice.id,
        provider,
      }),
      (error) => error.code === 'CHECKOUT_ATTEMPT_BINDING_MISMATCH',
      'a valid second invoice link must not permit settling the attempt to a different invoice',
    );
    const settled = await settleCapturedPayment({
      paymentId: providerPayment.id,
      providerOrderId: original.order.id,
      expectedInvoiceId: invoice.id,
      provider,
    });
    assert.equal(settled.attempt.id, original.attempt.id);
    assert.equal(settled.attempt.status, 'CAPTURED');
    assert.equal(Number(settled.invoice.balanceDue), 0);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id, status: 'CAPTURED', kind: 'RECEIPT' } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('ambiguous Razorpay order-create failure is held for review and cannot be retried into a second order', async () => {
  const invoice = await createInvoice('RZP-AMBIGUOUS');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let providerCalls = 0;
  const provider = { orders: { create: async () => {
    providerCalls += 1;
    throw Object.assign(new Error('socket hang up after remote acceptance'), { code: 'ECONNRESET' });
  } } };
  try {
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `ambiguous-a-${runId}`, provider }),
      (error) => error.code === 'CHECKOUT_RESULT_UNKNOWN' && Boolean(error.details?.checkoutAttemptId)
    );
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id, status: 'REVIEW' } }), 1);
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `ambiguous-b-${runId}`, provider }),
      (error) => error.code === 'CHECKOUT_ALREADY_IN_PROGRESS'
    );
    assert.equal(providerCalls, 1);
    const reviewAttempt = await prisma.razorpayCheckoutAttempt.findFirst({ where: { invoiceId: invoice.id } });
    assert.equal(await prisma.auditLog.count({ where: { resourceId: reviewAttempt.id, action: 'RAZORPAY_ORDER_CREATE_OUTCOME_UNKNOWN', status: 'FAILURE' } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Finance reconciles an ambiguous order create by unique receipt and resumes only an untouched matching order', async () => {
  const invoice = await createInvoice('RZP-AMBIGUOUS-RECOVERY');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let createCalls = 0;
  const providerOrder = {
    id: `order_recovered_${runId}`,
    receipt: '',
    status: 'created',
    attempts: 0,
    amount: 10000,
    amount_paid: 0,
    amount_due: 10000,
    currency: 'INR',
    notes: {},
  };
  const provider = { orders: {
    create: async () => { createCalls += 1; throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }); },
    all: async (query) => {
      assert.equal(query.receipt, providerOrder.receipt);
      return { items: [{ ...providerOrder, receipt: query.receipt, notes: { crm_attempt_id: attempt.id, invoice_id: invoice.id } }] };
    },
  } };
  let attempt;
  try {
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `recover-${runId}`, provider }),
      (error) => error.code === 'CHECKOUT_RESULT_UNKNOWN'
    );
    attempt = await prisma.razorpayCheckoutAttempt.findFirst({ where: { invoiceId: invoice.id } });
    providerOrder.receipt = `hc-${attempt.id}`;
    providerOrder.notes = { crm_attempt_id: attempt.id, invoice_id: invoice.id };
    const recovered = await reconcileAmbiguousOrderCreation({ attemptId: attempt.id, actor: { id: state.staff.id }, provider });
    assert.equal(recovered.attempt.status, 'CREATED');
    assert.equal(recovered.attempt.razorpayOrderId, providerOrder.id);
    assert.equal(recovered.order.id, providerOrder.id);
    assert.equal(createCalls, 1, 'reconciliation must never call order creation again');
    assert.equal(await prisma.auditLog.count({ where: { resourceId: attempt.id, action: 'RAZORPAY_ORDER_CREATE_RECONCILED' } }), 1);
    const resumed = await createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `recover-resume-${runId}`, provider });
    assert.equal(resumed.reused, true);
    assert.equal(resumed.order.id, providerOrder.id);
    assert.equal(createCalls, 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('ambiguous order recovery leaves attempted or mismatched provider orders blocked', async () => {
  const invoice = await createInvoice('RZP-AMBIGUOUS-REVIEW');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  let attempt;
  const provider = { orders: {
    create: async () => { throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }); },
    all: async ({ receipt }) => ({ items: [{
      id: `order_attempted_${runId}`, receipt, status: 'attempted', attempts: 1,
      amount: 10000, amount_paid: 0, amount_due: 10000, currency: 'INR',
      notes: { crm_attempt_id: attempt.id, invoice_id: invoice.id },
    }] }),
  } };
  try {
    await assert.rejects(createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `attempted-${runId}`, provider }), (error) => error.code === 'CHECKOUT_RESULT_UNKNOWN');
    attempt = await prisma.razorpayCheckoutAttempt.findFirst({ where: { invoiceId: invoice.id } });
    await assert.rejects(
      reconcileAmbiguousOrderCreation({ attemptId: attempt.id, actor: { id: state.staff.id }, provider }),
      (error) => error.code === 'CHECKOUT_RECONCILIATION_REQUIRES_REVIEW'
    );
    const stillBlocked = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    assert.equal(stillBlocked.status, 'REVIEW');
    assert.equal(stillBlocked.razorpayOrderId, `order_attempted_${runId}`);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: attempt.id, action: 'RAZORPAY_ORDER_CREATE_RECONCILIATION_REQUIRES_REVIEW', status: 'FAILURE' } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('missing Razorpay credentials fail before reserving a checkout attempt', async () => {
  const invoice = await createInvoice('RZP-MISSING-CONFIG');
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  try {
    await assert.rejects(
      createInvoiceCheckout({ invoice, shareId: `share-${runId}`, idempotencyKey: `missing-config-${runId}` }),
      (error) => error.code === 'RAZORPAY_NOT_CONFIGURED' && error.statusCode === 503
    );
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { invoiceId: invoice.id } }), 0);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
});

integrationTest('Razorpay webhook acknowledges an already durable review event on duplicate delivery', async () => {
  const eventId = `IT-${runId}-WEBHOOK-REVIEW`;
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${runId}`, order_id: `order_${runId}` } } } }));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const invoke = async () => {
    const req = { headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature }, rawBody, body: JSON.parse(rawBody.toString()), id: `request-${runId}` };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handleRazorpayWebhook(req, res);
    return res;
  };
  try {
    const first = await invoke();
    assert.equal(first.statusCode, 200);
    await prisma.razorpayWebhookEvent.update({ where: { eventId }, data: { status: 'REVIEW' } });
    const duplicate = await invoke();
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body.duplicate, true);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

integrationTest('Razorpay webhook validates current and previous rotation secrets and fails closed on bad config', async () => {
  const previousCurrent = process.env.RAZORPAY_WEBHOOK_SECRET;
  const previousPrevious = process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-current-${runId}`;
  process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = `webhook-old-${runId}`;
  const invoke = async (eventId, signingSecret) => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: `pay_${eventId}`, order_id: `order_${eventId}` } } } }));
    const req = {
      headers: {
        'x-razorpay-event-id': eventId,
        'x-razorpay-signature': crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex'),
      },
      rawBody,
      body: JSON.parse(rawBody.toString()),
      id: `request-${eventId}`,
    };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handleRazorpayWebhook(req, res);
    return res;
  };

  try {
    const previousSecretEventId = `IT-${runId}-OLD-SECRET`;
    const currentSecretEventId = `IT-${runId}-CURRENT-SECRET`;
    assert.equal((await invoke(previousSecretEventId, process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS)).statusCode, 200);
    assert.equal((await invoke(currentSecretEventId, process.env.RAZORPAY_WEBHOOK_SECRET)).statusCode, 200);
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId: { in: [previousSecretEventId, currentSecretEventId] } } }), 2);

    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = process.env.RAZORPAY_WEBHOOK_SECRET;
    const misconfigured = await invoke(`IT-${runId}-DUPLICATE-SECRETS`, process.env.RAZORPAY_WEBHOOK_SECRET);
    assert.equal(misconfigured.statusCode, 503);
    assert.equal(misconfigured.body.code, 'WEBHOOK_VERIFIER_MISCONFIGURED');

    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = '';
    const retiredSecret = await invoke(`IT-${runId}-RETIRED-SECRET`, `webhook-old-${runId}`);
    assert.equal(retiredSecret.statusCode, 400);
    assert.equal(retiredSecret.body.code, 'WEBHOOK_SIGNATURE_INVALID');
    assert.equal(await prisma.razorpayWebhookEvent.count({
      where: { eventId: { in: [previousSecretEventId, currentSecretEventId, `IT-${runId}-DUPLICATE-SECRETS`, `IT-${runId}-RETIRED-SECRET`] } },
    }), 2);
  } finally {
    if (previousCurrent === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousCurrent;
    if (previousPrevious === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
    else process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = previousPrevious;
  }
});

integrationTest('Razorpay Test webhook route uses only the Test secret and records Test mode', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousTestSecret = process.env.RAZORPAY_WEBHOOK_SECRET_TEST;
  const previousLiveSecret = process.env.RAZORPAY_WEBHOOK_SECRET_LIVE;
  const eventId = `IT-${runId}-TEST-MODE-WEBHOOK`;
  const secret = `test-webhook-${runId}`;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_WEBHOOK_SECRET_TEST = secret;
  process.env.RAZORPAY_WEBHOOK_SECRET_LIVE = `live-webhook-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.failed',
    payload: { payment: { entity: { id: `pay_${runId}_testmode`, order_id: `order_${runId}_testmode` } } },
  }));
  const invoke = async ({ requestedMode = 'test', signingSecret = secret, id = eventId } = {}) => {
    const req = {
      params: { mode: requestedMode },
      headers: {
        'x-razorpay-event-id': id,
        'x-razorpay-signature': crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex'),
      },
      rawBody,
      body: JSON.parse(rawBody.toString()),
      id: `request-${id}`,
    };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handleRazorpayWebhook(req, res);
    return res;
  };

  try {
    const accepted = await invoke();
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.accepted, true);
    const stored = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(stored.mode, 'TEST');
    assert.equal(stored.event, 'payment.failed');
    assert.equal(stored.paymentId, `pay_${runId}_testmode`);
    assert.equal(stored.orderId, `order_${runId}_testmode`);

    const wrongSecret = await invoke({ id: `${eventId}-BAD-SIGNATURE`, signingSecret: 'not-the-test-secret' });
    assert.equal(wrongSecret.statusCode, 400);
    assert.equal(wrongSecret.body.code, 'WEBHOOK_SIGNATURE_INVALID');

    const wrongMode = await invoke({ id: `${eventId}-LIVE-ROUTE`, requestedMode: 'live' });
    assert.equal(wrongMode.statusCode, 503);
    assert.equal(wrongMode.body.code, 'WEBHOOK_MODE_MISMATCH');
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId: { in: [eventId, `${eventId}-BAD-SIGNATURE`, `${eventId}-LIVE-ROUTE`] } } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousTestSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET_TEST;
    else process.env.RAZORPAY_WEBHOOK_SECRET_TEST = previousTestSecret;
    if (previousLiveSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET_LIVE;
    else process.env.RAZORPAY_WEBHOOK_SECRET_LIVE = previousLiveSecret;
  }
});

integrationTest('Razorpay duplicate delivery requeues legacy failed inbox records for worker processing', async () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.authorized',
    payload: { payment: { entity: { id: `pay_requeue${runId.replace(/[^A-Za-z0-9]/g, '')}`, order_id: `order_requeue${runId.replace(/[^A-Za-z0-9]/g, '')}` } } },
  }));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const invoke = async (eventId) => {
    const req = {
      headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature },
      rawBody, body: JSON.parse(rawBody.toString()), id: `request-${eventId}`,
    };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handleRazorpayWebhook(req, res);
    return res;
  };

  try {
    for (const [index, staleStatus] of ['FAILED', 'RETRYABLE'].entries()) {
      const eventId = `IT-${runId}-WEBHOOK-REQUEUE-${index}`;
      const first = await invoke(eventId);
      assert.equal(first.statusCode, 200);
      const stored = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
      await prisma.razorpayWebhookEvent.update({ where: { id: stored.id }, data: { status: staleStatus, attempts: 3, error: 'STALE_FAILURE' } });

      const duplicate = await invoke(eventId);
      assert.equal(duplicate.statusCode, 200);
      assert.equal(duplicate.body.accepted, true);
      assert.equal(duplicate.body.replay, true);
      const requeued = await prisma.razorpayWebhookEvent.findUnique({ where: { id: stored.id } });
      assert.equal(requeued.status, 'RECEIVED');
      assert.equal(requeued.attempts, 0);
      assert.equal(requeued.error, null);

      const payload = JSON.parse(rawBody.toString()).payload.payment.entity;
      const provider = { payments: { fetch: async (paymentId) => ({ id: paymentId, order_id: payload.order_id, amount: 1000, currency: 'INR', status: 'authorized' }) } };
      assert.equal(await processRazorpayWebhookBatch({
        onlyEventId: stored.id,
        processor: (record) => processWebhook(record, { razorpayProvider: provider }),
      }), 1);
      const processed = await prisma.razorpayWebhookEvent.findUnique({ where: { id: stored.id } });
      assert.equal(processed.status, 'REVIEW', 'replayed but unlinked provider events must not be silently consumed');
      assert.equal(processed.error, 'CHECKOUT_ATTEMPT_NOT_FOUND');
      assert.equal(processed.attempts, 1);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

integrationTest('Razorpay refund webhook durably captures the CRM refund attempt reference', async () => {
  const eventId = `IT-${runId}-REFUND-WEBHOOK-REFERENCE`;
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({
    event: 'refund.created',
    payload: { refund: { entity: {
      id: `rfnd_${runId}`,
      payment_id: `pay_${runId}`,
      notes: { crm_refund_attempt_id: `attempt_${runId}` },
    } } },
  }));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const req = {
    headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature },
    rawBody,
    body: JSON.parse(rawBody.toString()),
    id: `request-${runId}`,
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handleRazorpayWebhook(req, res);
    assert.equal(res.statusCode, 200);
    const event = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(event.refundId, `rfnd_${runId}`);
    assert.equal(event.refundAttemptId, `attempt_${runId}`);
    assert.equal(event.payload.refundAttemptId, `attempt_${runId}`);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

integrationTest('Razorpay failed webhook preserves only bounded diagnostics and exposes unmatched events for review', async () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const invoice = await createInvoice(`RZP-FAILED-DIAGNOSTICS-${runId}`, 100);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const provider = {
    orders: { create: async (payload) => ({ id: `order_failed_diagnostics_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes }) },
    payments: { fetch: async (paymentId) => ({
      id: paymentId,
      order_id: paymentId === `pay_unlinked_${runId}`
        ? `order_unlinked_${runId}`
        : `order_failed_diagnostics_${runId}`,
      amount: 10000,
      currency: 'INR',
      status: 'failed',
      method: 'card',
      card: { network: 'Visa', type: 'credit' },
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_step: 'payment_authentication',
      error_reason: 'incorrect_otp',
    }) },
  };

  const createWebhook = async ({ eventId, orderId, paymentId }) => {
    const rawBody = Buffer.from(JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: {
        id: paymentId,
        order_id: orderId,
        amount: 10000,
        currency: 'INR',
        method: 'card',
        card: { name: 'Sensitive Cardholder', last4: '4242', network: 'Visa', type: 'credit' },
        email: 'private@example.test',
        contact: '+919930367267',
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Sensitive free text must never be persisted',
        error_source: 'customer',
        error_step: 'payment_authentication',
        error_reason: 'incorrect_otp',
      } } },
    }));
    const req = {
      headers: {
        'x-razorpay-event-id': eventId,
        'x-razorpay-signature': crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex'),
      },
      rawBody,
      body: JSON.parse(rawBody.toString()),
      id: `request-${eventId}`,
    };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handleRazorpayWebhook(req, res);
    assert.equal(res.statusCode, 200);
    return prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
  };

  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-failed-diagnostics-${runId}`,
      idempotencyKey: `failed-diagnostics-${runId}`,
      provider,
    });
    const eventId = `IT-${runId}-FAILED-DIAGNOSTICS`;
    const event = await createWebhook({ eventId, orderId: checkout.order.id, paymentId: `pay_failed_diagnostics_${runId}` });
    assert.deepEqual(event.payload, {
      paymentId: `pay_failed_diagnostics_${runId}`,
      orderId: checkout.order.id,
      providerMethod: 'card',
      providerMethodDetail: 'visa:credit',
      providerErrorCode: 'BAD_REQUEST_ERROR',
      providerErrorSource: 'customer',
      providerErrorStep: 'payment_authentication',
      providerErrorReason: 'incorrect_otp',
    });
    assert.equal(JSON.stringify(event.payload).includes('Sensitive'), false);
    assert.equal(JSON.stringify(event.payload).includes('private@example.test'), false);
    assert.equal(JSON.stringify(event.payload).includes('9930367267'), false);

    assert.equal(await processRazorpayWebhookBatch({
      onlyEventId: event.id,
      processor: (record) => processWebhook(record, { razorpayProvider: provider }),
    }), 1);
    const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(attempt.status, 'FAILED');
    assert.equal(attempt.failureCode, 'PAYMENT_FAILED');
    assert.equal(attempt.providerMethod, 'card');
    assert.equal(attempt.providerMethodDetail, 'visa:credit');
    assert.equal(attempt.providerErrorCode, 'BAD_REQUEST_ERROR');
    assert.equal(attempt.providerErrorSource, 'customer');
    assert.equal(attempt.providerErrorStep, 'payment_authentication');
    assert.equal(attempt.providerErrorReason, 'incorrect_otp');

    const unmatched = await createWebhook({
      eventId: `IT-${runId}-FAILED-UNMATCHED`,
      orderId: `order_unlinked_${runId}`,
      paymentId: `pay_unlinked_${runId}`,
    });
    assert.equal(await processRazorpayWebhookBatch({
      onlyEventId: unmatched.id,
      processor: (record) => processWebhook(record, { razorpayProvider: provider }),
    }), 1);
    const review = await prisma.razorpayWebhookEvent.findUnique({ where: { id: unmatched.id } });
    assert.equal(review.status, 'REVIEW');
    assert.equal(review.error, 'CHECKOUT_ATTEMPT_NOT_FOUND');

    const missingOrder = await createWebhook({
      eventId: `IT-${runId}-FAILED-MISSING-ORDER`,
      orderId: null,
      paymentId: `pay_missing_order_${runId}`,
    });
    assert.equal(await processRazorpayWebhookBatch({
      onlyEventId: missingOrder.id,
      processor: (record) => processWebhook(record, { razorpayProvider: provider }),
    }), 1);
    const missingOrderReview = await prisma.razorpayWebhookEvent.findUnique({ where: { id: missingOrder.id } });
    assert.equal(missingOrderReview.status, 'REVIEW');
    assert.equal(missingOrderReview.error, 'MISSING_PROVIDER_REFERENCE');
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay dispute webhook inbox preserves only dispute and linked payment references', async () => {
  const eventId = `IT-${runId}-DISPUTE-WEBHOOK-REFERENCE`;
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.dispute.created',
    payload: { dispute: { entity: {
      id: `disp_${runId}`,
      payment_id: `pay_dispute_${runId}`,
      amount: 12345,
      currency: 'INR',
      status: 'open',
      reason_description: 'fixture PII must not be persisted',
    } } },
  }));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const req = {
    headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature },
    rawBody,
    body: JSON.parse(rawBody.toString()),
    id: `request-${runId}`,
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handleRazorpayWebhook(req, res);
    assert.equal(res.statusCode, 200);
    const event = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(event.disputeId, `disp_${runId}`);
    assert.equal(event.paymentId, `pay_dispute_${runId}`);
    assert.deepEqual(event.payload, { paymentId: `pay_dispute_${runId}`, disputeId: `disp_${runId}` });
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

integrationTest('Razorpay dispute reconciliation fetches authority, links exact captured payment, and never rewrites receipt ledger', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_dispute_integration';
  const invoice = await createInvoice(`DISPUTE-${runId}`, 100);
  const paymentId = `pay_dispute_case_${runId.replace(/[^A-Za-z0-9]/g, '')}`;
  let payment;
  await prisma.$transaction(async (tx) => {
    const settlement = await recordInvoiceSettlement(tx, {
      invoiceId: invoice.id,
      amount: 100,
      method: 'RAZORPAY',
      reference: paymentId,
      notes: 'integration test captured payment',
      idempotencyKey: `dispute-payment-${runId}`,
      razorpayPaymentId: paymentId,
      razorpayOrderId: `order_dispute_case_${runId.replace(/[^A-Za-z0-9]/g, '')}`,
      providerCaptureVerified: true,
    });
    payment = settlement.payments[0];
  });

  const disputeId = `disp_${runId.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`;
  const providerDispute = {
    id: disputeId,
    payment_id: paymentId,
    amount: 10000,
    amount_deducted: 10000,
    currency: 'INR',
    status: 'lost',
    phase: 'chargeback',
    reason_code: 'fraud',
    respond_by: 1791000000,
    created_at: 1790000000,
    evidence: { summary: 'must never be persisted in CRM' },
  };
  const provider = { disputes: { fetch: async () => providerDispute } };

  try {
    const beforeInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id }, select: { balanceDue: true, status: true } });
    const synced = await reconcileRazorpayDispute({ disputeId, eventId: `evt_${runId}`, eventType: 'payment.dispute.lost', provider });
    assert.equal(synced.state, 'PROCESSED');
    assert.equal(synced.linkStatus, 'LINKED');
    assert.equal(synced.providerStatus, 'LOST');
    const stored = await prisma.razorpayDisputeCase.findUnique({ where: { providerDisputeId: disputeId } });
    assert.equal(stored.localPaymentId, payment.id);
    assert.equal(stored.providerPaymentId, paymentId);
    assert.equal(stored.amountDeductedPaise, 10000n);
    assert.equal(stored.reasonCode, 'fraud');
    assert.equal(stored.lastEventType, 'payment.dispute.lost');
    assert.equal('evidence' in stored, false);

    providerDispute.status = 'open';
    providerDispute.amount_deducted = 0;
    const stale = await reconcileRazorpayDispute({ disputeId, eventId: `evt_stale_${runId}`, eventType: 'payment.dispute.created', provider });
    assert.equal(stale.state, 'REVIEW');
    const protectedCase = await prisma.razorpayDisputeCase.findUnique({ where: { providerDisputeId: disputeId } });
    assert.equal(protectedCase.status, 'LOST');
    assert.equal(protectedCase.amountDeductedPaise, 10000n, 'stale snapshots must not overwrite the terminal financial facts');
    assert.equal(protectedCase.lastEventType, 'payment.dispute.created');
    const afterInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id }, select: { balanceDue: true, status: true } });
    assert.deepEqual(afterInvoice, beforeInvoice, 'dispute synchronization must not mutate collection balances/status');

    const unlinkedDisputeId = `disp_${runId.replace(/[^A-Za-z0-9]/g, '')}`;
    provider.disputes.fetch = async () => ({
      ...providerDispute,
      id: unlinkedDisputeId,
      payment_id: `pay_missing_${runId.replace(/[^A-Za-z0-9]/g, '')}`,
      status: 'open',
      amount_deducted: 0,
    });
    const unlinked = await reconcileRazorpayDispute({ disputeId: unlinkedDisputeId, eventId: `evt_unlinked_${runId}`, provider });
    assert.equal(unlinked.state, 'REVIEW');
    assert.equal(unlinked.linkStatus, 'UNLINKED');
    assert.equal((await prisma.razorpayDisputeCase.findUnique({ where: { providerDisputeId: unlinkedDisputeId } })).localPaymentId, null);
  } finally {
    const disputeIds = [disputeId, `disp_${runId.replace(/[^A-Za-z0-9]/g, '')}`];
    await prisma.activityLog.deleteMany({ where: { resource: 'razorpay_dispute', resourceId: { in: disputeIds } } });
    await prisma.auditLog.deleteMany({ where: { resource: 'razorpay_dispute', resourceId: { in: disputeIds } } });
    await prisma.razorpayDisputeCase.deleteMany({ where: { providerDisputeId: { in: disputeIds } } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay dispute page sync is bounded, provider-authoritative, item-audited, and balance-neutral', async () => {
  const disputeId = `disp_${runId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
  let requestedOptions;
  const provider = {
    disputes: {
      all: async (options) => {
        requestedOptions = options;
        return { count: 2, items: [
          { id: disputeId, payment_id: `pay_unlinked_${runId}`, amount: 10000, amount_deducted: 0, currency: 'INR', status: 'open', phase: 'chargeback', reason_code: 'fraud', created_at: 1790000000 },
          { id: 'invalid-id', payment_id: 'pay_invalid', amount: 10000, amount_deducted: 0, currency: 'INR', status: 'open' },
        ] };
      },
      fetch: async () => { throw new Error('list sync must not issue an N+1 detail request'); },
    },
  };
  try {
    const result = await syncRazorpayDisputePage({
      provider, count: 2, skip: 4, to: 1791000000, actor: state.staff,
      requestMeta: { route: '/api/v1/reconciliation/razorpay-disputes/sync', method: 'POST' },
    });
    assert.deepEqual(requestedOptions, { count: 2, skip: 4, to: 1791000000 });
    assert.deepEqual(result, { mode: 'TEST', received: 2, synced: 0, review: 1, failed: 1, nextSkip: 6, to: 1791000000, hasMore: true });
    const saved = await prisma.razorpayDisputeCase.findUnique({ where: { providerDisputeId: disputeId } });
    assert.equal(saved.linkStatus, 'UNLINKED');
    assert.equal(saved.lastEventType, 'RAZORPAY_DISPUTE_MANUAL_SYNC');
    assert.equal(await prisma.auditLog.count({ where: { action: 'RAZORPAY_DISPUTE_SYNC_ITEM_REJECTED', actorId: state.staff.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { action: 'RAZORPAY_DISPUTE_BATCH_SYNC_PARTIAL', actorId: state.staff.id } }), 1);
  } finally {
    await prisma.activityLog.deleteMany({ where: { resourceId: disputeId } });
    await prisma.auditLog.deleteMany({ where: { resourceId: disputeId } });
    await prisma.activityLog.deleteMany({ where: { action: { in: ['RAZORPAY_DISPUTE_SYNC_ITEM_REJECTED', 'RAZORPAY_DISPUTE_BATCH_SYNC_PARTIAL'] }, actorId: state.staff.id } });
    await prisma.auditLog.deleteMany({ where: { action: { in: ['RAZORPAY_DISPUTE_SYNC_ITEM_REJECTED', 'RAZORPAY_DISPUTE_BATCH_SYNC_PARTIAL'] }, actorId: state.staff.id } });
    await prisma.razorpayDisputeCase.deleteMany({ where: { providerDisputeId: disputeId } });
  }
});

integrationTest('Razorpay durable worker dispatches all refund webhook references to authoritative reconciliation', async () => {
  for (const [index, eventType] of ['refund.created', 'refund.processed', 'refund.failed', 'refund.speed_changed'].entries()) {
    let received;
    const result = await processWebhook({
      event: eventType,
      eventId: `IT-${runId}-WORKER-REFUND-${index}`,
      refundId: `rfnd_${runId}`,
      refundAttemptId: `attempt_${runId}`,
    }, {
      refundReconciler: async (event) => {
        received = event;
        return { refundId: event.refundId, providerStatus: 'processed', attemptId: event.refundAttemptId };
      },
    });
    assert.deepEqual(received, {
      refundId: `rfnd_${runId}`,
      refundAttemptId: `attempt_${runId}`,
      eventId: `IT-${runId}-WORKER-REFUND-${index}`,
      eventType,
    });
    assert.equal(result.state, 'PROCESSED');
    assert.equal(result.paymentId, `rfnd_${runId}`);
    assert.equal(result.providerStatus, 'processed');
  }
});

integrationTest('Razorpay durable webhook inbox retries a transient worker failure and then completes the event', async () => {
  const eventId = `IT-${runId}-WORKER-RETRY`;
  const providerRef = runId.replace(/[^A-Za-z0-9]/g, '');
  const invoice = await createInvoice(`WEBHOOK-JOURNEY-${runId}`, 73);
  const providerOrderId = `order_worker_retry_${providerRef}`;
  const providerPaymentId = `pay_worker_retry_${providerRef}`;
  const checkoutAttempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `webhook-journey-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 7300n,
      currency: 'INR',
      mode: 'TEST',
      status: 'PENDING',
      razorpayOrderId: providerOrderId,
      razorpayPaymentId: providerPaymentId,
      paymentJourneyId: `pj_${crypto.randomUUID()}`,
    },
  });
  const event = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.authorized',
      paymentId: providerPaymentId,
      orderId: providerOrderId,
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RECEIVED',
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });
  let deliveries = 0;
  const transientProcessor = async () => {
    deliveries += 1;
    throw {
      response: {
        status: 503,
        data: { error: {
          code: 'GATEWAY_ERROR',
          description: 'Temporary failure for +91 9930367267 user@example.com',
          field: 'order_id', source: 'gateway', step: 'payment_authentication', reason: 'provider_timeout',
          metadata: { payment_id: `pay_retry${providerRef}`, order_id: `order_retry${providerRef}`, otp: '654321' },
          card: { number: '4100280000001007' },
        } },
      },
    };
  };
  assert.equal(await processRazorpayWebhookBatch({ processor: transientProcessor, onlyEventId: event.id }), 1);
  let persisted = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(persisted.status, 'RETRY');
  assert.equal(persisted.attempts, 1);
  assert.equal(persisted.error, 'GATEWAY_ERROR');
  const retryAudit = await prisma.auditLog.findFirst({
    where: { action: 'RAZORPAY_WEBHOOK_RETRY_SCHEDULED', resourceId: eventId },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(retryAudit.metadata.providerError.httpStatus, 503);
  assert.equal(retryAudit.metadata.providerError.code, 'GATEWAY_ERROR');
  assert.equal(retryAudit.metadata.mode, event.mode || null);
  assert.equal(retryAudit.metadata.razorpayOrderId, event.orderId);
  assert.equal(retryAudit.metadata.razorpayPaymentId, event.paymentId);
  assert.equal(retryAudit.metadata.providerError.payment_id, `pay_retry${providerRef}`);
  assert.equal(retryAudit.metadata.providerError.order_id, `order_retry${providerRef}`);
  assert.equal(retryAudit.metadata.providerError.description.includes('9930367267'), false);
  assert.equal(JSON.stringify(retryAudit.metadata.providerError).includes('654321'), false);
  assert.equal(JSON.stringify(retryAudit.metadata.providerError).includes('4100280000001007'), false);
  let journeyEvents = await prisma.razorpayPaymentJourneyEvent.findMany({
    where: { checkoutAttemptId: checkoutAttempt.id }, orderBy: { occurredAt: 'asc' },
  });
  assert.equal(journeyEvents.length, 1);
  assert.equal(journeyEvents[0].eventName, 'RAZORPAY_WEBHOOK_RETRY_SCHEDULED');
  assert.equal(journeyEvents[0].outcome, 'RETRY');
  assert.equal(journeyEvents[0].diagnostics.sourceWebhookRecordId, event.id);
  assert.equal(journeyEvents[0].diagnostics.sourceWebhookAttempt, 1);
  assert.equal(journeyEvents[0].diagnostics.webhookErrorCode, 'GATEWAY_ERROR');
  assert.equal(JSON.stringify(journeyEvents[0].diagnostics).includes('9930367267'), false);
  assert.equal(JSON.stringify(journeyEvents[0].diagnostics).includes('654321'), false);
  assert.equal(JSON.stringify(journeyEvents[0].diagnostics).includes('4100280000001007'), false);

  await prisma.razorpayWebhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  assert.equal(await processRazorpayWebhookBatch({ processor: async () => {
    deliveries += 1;
    return { state: 'PROCESSED', paymentId: `pay_worker_retry_${runId}` };
  }, onlyEventId: event.id }), 1);
  persisted = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(persisted.status, 'PROCESSED');
  assert.equal(persisted.attempts, 2);
  assert.equal(persisted.error, null);
  assert.equal(deliveries, 2);
  journeyEvents = await prisma.razorpayPaymentJourneyEvent.findMany({
    where: { checkoutAttemptId: checkoutAttempt.id }, orderBy: { occurredAt: 'asc' },
  });
  assert.equal(journeyEvents.length, 2);
  assert.equal(journeyEvents[1].eventName, 'RAZORPAY_WEBHOOK_PROCESSED');
  assert.equal(journeyEvents[1].outcome, 'SUCCESS');
  assert.equal(journeyEvents[1].diagnostics.sourceWebhookRecordId, event.id);
  assert.equal(journeyEvents[1].diagnostics.sourceWebhookAttempt, 2);
});

integrationTest('Razorpay webhook worker respects a bounded parallelism limit and completes every claimed event once', async () => {
  const eventPrefix = `IT-${runId}-WEBHOOK-BOUNDED`;
  const eventIds = Array.from({ length: 7 }, (_, index) => `${eventPrefix}-${index}`);
  await prisma.razorpayWebhookEvent.createMany({
    data: eventIds.map((eventId) => ({
      eventId,
      event: 'payment.authorized',
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RECEIVED',
      nextAttemptAt: new Date(Date.now() - 1000),
    })),
  });
  const testEvents = await prisma.razorpayWebhookEvent.findMany({
    where: { eventId: { in: eventIds } },
    select: { id: true },
  });
  let inFlight = 0;
  let maxInFlight = 0;
  let processed = 0;
  const count = await processRazorpayWebhookBatch({
    limit: 10,
    concurrency: 2,
    onlyEventIds: testEvents.map((event) => event.id),
    processor: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      processed += 1;
      return { state: 'PROCESSED' };
    },
  });
  const rows = await prisma.razorpayWebhookEvent.findMany({
    where: { eventId: { in: eventIds } },
    select: { status: true, attempts: true },
  });
  assert.equal(count, eventIds.length);
  assert.equal(maxInFlight, 2);
  assert.equal(processed, eventIds.length);
  assert.equal(rows.length, eventIds.length);
  assert.ok(rows.every((row) => row.status === 'PROCESSED' && row.attempts === 1));
});

integrationTest('Razorpay webhook stale lease reclaim fences completion from the prior worker claim', async () => {
  const eventId = `IT-${runId}-WEBHOOK-FENCE`;
  const event = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.authorized',
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RECEIVED',
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });
  let releaseFirst;
  let announceFirst;
  const firstStarted = new Promise((resolve) => { announceFirst = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const processor = async (claimed) => {
    if (claimed.attempts === 1) {
      announceFirst();
      await firstGate;
      return { state: 'RETRY', paymentId: 'stale-worker-result' };
    }
    return { state: 'PROCESSED', paymentId: 'current-worker-result' };
  };

  const originalWorker = processRazorpayWebhookBatch({ processor, onlyEventId: event.id });
  await firstStarted;
  await prisma.razorpayWebhookEvent.update({
    where: { id: event.id },
    data: { lockedAt: new Date(Date.now() - 6 * 60 * 1000) },
  });
  assert.equal(await processRazorpayWebhookBatch({ processor, onlyEventId: event.id }), 1);
  const afterCurrentClaim = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(afterCurrentClaim.status, 'PROCESSED');
  assert.equal(afterCurrentClaim.attempts, 2);

  releaseFirst();
  assert.equal(await originalWorker, 1);
  const final = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(final.status, 'PROCESSED');
  assert.equal(final.attempts, 2);
  assert.equal(final.error, null);
});

integrationTest('Razorpay webhook worker renews leases for long-running event processing', async () => {
  const eventId = `IT-${runId}-WEBHOOK-HEARTBEAT`;
  const event = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.authorized',
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RECEIVED',
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });
  let releaseProcessor;
  let announceProcessor;
  const processorStarted = new Promise((resolve) => { announceProcessor = resolve; });
  const processorGate = new Promise((resolve) => { releaseProcessor = resolve; });
  const worker = processRazorpayWebhookBatch({
    onlyEventId: event.id,
    leaseMs: 100,
    heartbeatMs: 5,
    processor: async () => {
      announceProcessor();
      await processorGate;
      return { state: 'PROCESSED', paymentId: 'pay_heartbeat_test' };
    },
  });

  await processorStarted;
  const initial = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const renewed = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.ok(renewed.lockedAt > initial.lockedAt, `worker heartbeat should advance lockedAt during processing (initial=${initial.lockedAt?.toISOString()}, renewed=${renewed.lockedAt?.toISOString()}, attempts=${renewed.attempts}, status=${renewed.status})`);
  assert.equal(await processRazorpayWebhookBatch({ onlyEventId: event.id, leaseMs: 100, processor: async () => ({ state: 'PROCESSED' }) }), 0, 'another worker must not reclaim a renewed lease');

  releaseProcessor();
  assert.equal(await worker, 1);
  const final = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(final.status, 'PROCESSED');
  assert.equal(final.lockedAt, null);
});

integrationTest('Razorpay webhook reaches finance review at the configured maximum attempt count', async () => {
  const eventId = `IT-${runId}-WEBHOOK-MAX-ATTEMPTS`;
  const event = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.authorized',
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RETRY',
      attempts: 11,
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });

  assert.equal(await processRazorpayWebhookBatch({
    onlyEventId: event.id,
    processor: async () => { throw Object.assign(new Error('permanent test failure'), { code: 'TEST_TERMINAL_FAILURE', permanent: true }); },
  }), 1);
  const persisted = await prisma.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  assert.equal(persisted.status, 'REVIEW');
  assert.equal(persisted.attempts, 12);
  assert.equal(persisted.error, 'TEST_TERMINAL_FAILURE');
  assert.ok(persisted.nextAttemptAt.getUTCFullYear() >= 9999);
});

integrationTest('finance operator can list safe webhook failures and request an audited replay', async () => {
  const eventId = `IT-${runId}-WEBHOOK-OPS`;
  const stored = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.captured',
      paymentId: 'pay_ops1234567890',
      orderId: 'order_ops1234567890',
      payload: { customerPhone: '9930367267', card: { number: '4100280000001007' } },
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'REVIEW',
      attempts: 12,
      error: 'PROVIDER_RESULT_UNKNOWN',
      nextAttemptAt: new Date('9999-12-31T23:59:59.999Z'),
    },
  });
  const makeResponse = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, set(name, value) { this.headers[name] = value; return this; }, json(body) { this.body = body; return this; } });
  const req = {
    query: { status: 'REVIEW' },
    params: { id: stored.id },
    body: { reason: 'Provider status recovered for +91 9930367267 user@example.com' },
    staff: state.actor,
    id: `request-${runId}-webhook-ops`,
    originalUrl: '/api/v1/reconciliation/razorpay-webhooks',
    path: '/api/v1/reconciliation/razorpay-webhooks',
    method: 'POST',
    headers: {},
    ip: '127.0.0.1',
  };

  const listResponse = makeResponse();
  await listRazorpayWebhookEvents({ ...req, params: {}, body: {}, query: { status: 'REVIEW' } }, listResponse);
  assert.equal(listResponse.statusCode, 200);
  const listed = listResponse.body.data.events.find((event) => event.id === stored.id);
  assert.equal(listed.status, 'REVIEW');
  assert.equal(Object.hasOwn(listed, 'payload'), false);

  const replayResponse = makeResponse();
  const replayKey = `razorpay-webhook-replay:${eventId}`;
  const replayRequest = { ...req, originalUrl: `/api/v1/reconciliation/razorpay-webhooks/${stored.id}/replay`, headers: { 'x-idempotency-key': replayKey } };
  await idempotent({ scope: 'razorpay.webhook.replay' })(replayRequest, replayResponse, () => replayRazorpayWebhookEvent(replayRequest, replayResponse));
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(replayResponse.body.data.status, 'RECEIVED');
  const requeued = await prisma.razorpayWebhookEvent.findUnique({ where: { id: stored.id } });
  assert.equal(requeued.status, 'RECEIVED');
  assert.equal(requeued.attempts, 0);
  assert.equal(requeued.error, null);
  const audit = await prisma.auditLog.findFirst({
    where: { action: 'RAZORPAY_WEBHOOK_MANUAL_REPLAY_REQUESTED', resourceId: eventId },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(audit.actorId, state.staff.id);
  assert.equal(audit.metadata.priorStatus, 'REVIEW');
  assert.equal(audit.metadata.priorAttempts, 12);
  assert.equal(audit.metadata.replayReason.includes('9930367267'), false);
  assert.equal(audit.metadata.replayReason.includes('user@example.com'), false);

  let replayRecord;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    replayRecord = await prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope: 'razorpay.webhook.replay', key: replayKey } } });
    if (replayRecord?.state === 'COMPLETED') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(replayRecord, 'first replay request must persist its idempotency result');
  assert.equal(replayRecord.state, 'COMPLETED');
  const repeatedResponse = makeResponse();
  const repeatedRequest = { ...replayRequest, headers: { 'x-idempotency-key': replayKey } };
  let replayControllerCalled = false;
  await idempotent({ scope: 'razorpay.webhook.replay' })(repeatedRequest, repeatedResponse, () => {
    replayControllerCalled = true;
    return replayRazorpayWebhookEvent(repeatedRequest, repeatedResponse);
  });
  assert.equal(repeatedResponse.statusCode, 200);
  assert.equal(repeatedResponse.headers?.['X-Idempotency-Replayed'], 'true');
  assert.equal(replayControllerCalled, false);
  assert.equal(await prisma.auditLog.count({ where: { action: 'RAZORPAY_WEBHOOK_MANUAL_REPLAY_REQUESTED', resourceId: eventId } }), 1);

  const duplicateReplay = makeResponse();
  await replayRazorpayWebhookEvent(req, duplicateReplay);
  assert.equal(duplicateReplay.statusCode, 409);
  assert.equal(duplicateReplay.body.code, 'WEBHOOK_EVENT_NOT_REPLAYABLE');
  const missingReason = makeResponse();
  await replayRazorpayWebhookEvent({ ...req, body: { reason: 'retry' } }, missingReason);
  assert.equal(missingReason.statusCode, 400);
  assert.equal(missingReason.body.code, 'WEBHOOK_REPLAY_REASON_REQUIRED');
});

integrationTest('Finance checkout-attempt feed filters safely and excludes customer identifiers and free-text provider failures', async () => {
  const analyticsTestDate = '2001-02-03';
  const analyticsTestCreatedAt = new Date('2001-02-03T05:00:00.000Z');
  const baseline = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getRazorpayCheckoutMethodOutcomes({ query: { from: analyticsTestDate, to: analyticsTestDate, mode: 'TEST' }, id: `request-${runId}-attempt-outcomes-baseline` }, baseline);
  assert.equal(baseline.statusCode, 200);
  const baselineGroups = new Map(baseline.body.data.groups.map((group) => [`${group.providerMethod}:${group.status}`, group]));
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `attempt-feed-${runId}`,
      invoiceId: `invoice-${runId}`,
      invoiceNumber: `IT-${runId}-ATTEMPT-FEED`,
      customerId: `customer-${runId}`,
      publicShareId: `share-${runId}`,
      amountPaise: 12345n,
      currency: 'INR',
      mode: 'TEST',
      status: 'FAILED',
      razorpayOrderId: `order_attempt_${runId}`,
      requestId: `request_attempt_${runId}`,
      failureCode: 'PROVIDER_PAYMENT_FAILED',
      failureMessage: 'Sensitive detail 9930367267 and user@example.com',
      providerMethod: 'card',
      providerMethodDetail: 'visa:debit',
      providerErrorCode: 'BAD_REQUEST_ERROR',
      providerErrorSource: 'customer',
      providerErrorStep: 'payment_authentication',
      providerErrorReason: 'payment_failed',
      createdAt: analyticsTestCreatedAt,
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await listRazorpayCheckoutAttempts({ query: { mode: 'test', status: 'failed', limit: '10' }, id: `request-${runId}-attempt-feed` }, res);
  assert.equal(res.statusCode, 200);
  const listed = res.body.data.attempts.find((item) => item.id === attempt.id);
  assert.ok(listed);
  assert.equal(listed.amountPaise, '12345');
  assert.equal(listed.providerMethod, 'card');
  assert.equal(listed.failureCode, 'PROVIDER_PAYMENT_FAILED');
  assert.equal(listed.providerErrorReason, 'payment_failed');
  assert.deepEqual(listed.providerErrorClassification, {
    category: 'CUSTOMER_OR_INSTRUMENT',
    operatorAction: 'CONFIRM_TERMINAL_FAILURE_BEFORE_CUSTOMER_RETRY',
    automaticRetry: false,
  });
  for (const privateField of ['customerId', 'publicShareId', 'failureMessage']) assert.equal(Object.hasOwn(listed, privateField), false);
  assert.equal(JSON.stringify(listed).includes('9930367267'), false);
  assert.equal(JSON.stringify(listed).includes('user@example.com'), false);

  const invalid = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await listRazorpayCheckoutAttempts({ query: { status: 'FAILED,UNKNOWN' }, id: `request-${runId}-attempt-filter` }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.code, 'CHECKOUT_ATTEMPT_FILTER_INVALID');

  const capturedAttempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `attempt-feed-captured-${runId}`,
      invoiceId: `invoice-captured-${runId}`,
      invoiceNumber: `IT-${runId}-ATTEMPT-FEED-CAPTURED`,
      customerId: `customer-captured-${runId}`,
      amountPaise: 2500n,
      currency: 'INR',
      mode: 'TEST',
      status: 'CAPTURED',
      providerMethod: 'upi',
      completedAt: new Date(),
      createdAt: analyticsTestCreatedAt,
    },
  });
  const outcomes = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getRazorpayCheckoutMethodOutcomes({ query: { from: analyticsTestDate, to: analyticsTestDate, mode: 'TEST' }, id: `request-${runId}-attempt-outcomes` }, outcomes);
  assert.equal(outcomes.statusCode, 200);
  const failedCard = outcomes.body.data.groups.find((group) => group.providerMethod === 'card' && group.mode === 'TEST' && group.status === 'FAILED');
  const capturedUpi = outcomes.body.data.groups.find((group) => group.providerMethod === 'upi' && group.mode === 'TEST' && group.status === 'CAPTURED');
  const baselineFailedCard = baselineGroups.get('card:FAILED') || { count: 0, amountPaise: '0' };
  const baselineCapturedUpi = baselineGroups.get('upi:CAPTURED') || { count: 0, amountPaise: '0' };
  assert.equal(failedCard.count, baselineFailedCard.count + 1);
  assert.equal(BigInt(failedCard.amountPaise) - BigInt(baselineFailedCard.amountPaise), 12345n);
  assert.equal(capturedUpi.count, baselineCapturedUpi.count + 1);
  assert.equal(BigInt(capturedUpi.amountPaise) - BigInt(baselineCapturedUpi.amountPaise), 2500n);
  const invalidRange = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getRazorpayCheckoutMethodOutcomes({ query: { from: '2026-02-31', to: '2026-03-01' }, id: `request-${runId}-attempt-date` }, invalidRange);
  assert.equal(invalidRange.statusCode, 400);
  assert.equal(invalidRange.body.code, 'CHECKOUT_ANALYTICS_FILTER_INVALID');
  assert.ok(capturedAttempt.id);
});

integrationTest('reconciliation webhook and dispute routes deny an authenticated Accounts user without reconcile permission', async () => {
  const express = require('express');
  const reconciliationRouter = require('../src/routes/reconciliation.routes');
  const staff = await prisma.staff.create({
    data: {
      name: `Integration Limited Finance ${runId}`,
      phone: `7${String(Date.now()).slice(-9)}`,
      email: `limited-${runId}@example.test`,
      passwordHash: 'integration-test-only',
      role: 'ACCOUNTS',
      isActive: true,
      permissions: { create: [{ permission: 'finance.reconcile', granted: false }] },
    },
  });
  const sessionId = createSessionId();
  const token = generateStaffToken({ ...staff, jti: sessionId }, '10m');
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.staffSession.create({
    data: buildStaffSessionData({
      staffId: staff.id,
      token,
      sessionId,
      req: { headers: { 'user-agent': 'integration-test' }, ip: '127.0.0.1' },
      expiresAt: expiry,
    }),
  });

  const app = express();
  app.use('/api/v1/reconciliation', reconciliationRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    for (const request of [
      { route: 'razorpay-webhooks', method: 'GET' },
      { route: 'razorpay-disputes', method: 'GET' },
      { route: 'razorpay-disputes/sync', method: 'POST', body: { count: 1, skip: 0 } },
      { route: 'razorpay-payments/pay_route_denied/backfill', method: 'POST', body: { invoiceId: 'invoice-route-denied', mode: 'TEST' } },
      { route: 'razorpay-orders/order_route_denied/backfill', method: 'POST', body: { invoiceId: 'invoice-route-denied', mode: 'TEST' } },
      { route: 'razorpay-checkout-attempts?limit=10', method: 'GET' },
      { route: 'razorpay-checkout-method-outcomes?from=2026-09-01&to=2026-09-24', method: 'GET' },
      { route: 'razorpay-payments/run', method: 'POST' },
      { route: 'razorpay-dashboard-reports/payments/preview', method: 'POST', body: { csvText: 'not-authorized' } },
      { route: 'razorpay-dashboard-reports/orders/preview', method: 'POST', body: { csvText: 'not-authorized' } },
      { route: 'razorpay-settlements', method: 'GET' },
      { route: 'razorpay-settlement-summary-report?from=2026-09-01&to=2026-09-24&mode=LIVE', method: 'GET' },
      { route: 'razorpay-settlements/run', method: 'POST' },
      { route: 'bank-statements/example-import/match-candidates', method: 'GET' },
      { route: 'bank-statements/rows/example-row/matches', method: 'POST', body: { settlementSummaryId: 'example-summary', reason: 'not allowed' } },
      { route: 'bank-statements/matches/example-match/reverse', method: 'POST', body: { reason: 'not allowed' } },
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/reconciliation/${request.route}`, {
        method: request.method,
        headers: {
          authorization: `Bearer ${token}`,
          origin: `http://127.0.0.1:${address.port}`,
          ...(request.body ? { 'content-type': 'application/json' } : {}),
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.match(body.message, /finance\.reconcile/);
    }
    let denialAuditCount = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      denialAuditCount = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: staff.id } });
      if (denialAuditCount) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(denialAuditCount >= 1, 'permission denial must be written to the audit trail');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.staffSession.deleteMany({ where: { staffId: staff.id } });
    await prisma.staff.delete({ where: { id: staff.id } });
  }
});

integrationTest('Razorpay webhook rejects invalid raw-body signatures without persisting an event', async () => {
  const eventId = `IT-${runId}-WEBHOOK-BAD-SIGNATURE`;
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = `webhook-secret-${runId}`;
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_bad_${runId}`, order_id: `order_bad_${runId}` } } } }));
  const req = {
    headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': '0'.repeat(64) },
    rawBody,
    body: JSON.parse(rawBody.toString()),
    id: `request-bad-signature-${runId}`,
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handleRazorpayWebhook(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'WEBHOOK_SIGNATURE_INVALID');
    assert.equal(res.body.retryable, false);
    assert.equal(res.body.requestId, `request-bad-signature-${runId}`);
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId } }), 0);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

integrationTest('Razorpay webhook worker refuses to reconcile a verified event with the other mode keypair', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_worker_mode';
  try {
    await assert.rejects(
      processWebhook({ mode: 'LIVE', event: 'payment.captured', paymentId: 'pay_mode_mismatch', orderId: 'order_mode_mismatch' }, {
        razorpayProvider: { payments: { fetch: async () => { throw new Error('provider must not be called'); } } },
      }),
      (error) => error.code === 'RAZORPAY_MODE_MISMATCH' && error.permanent === true,
    );
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('mounted Razorpay webhook verifies the exact Express-parsed raw request bytes', async () => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    secret: process.env.RAZORPAY_WEBHOOK_SECRET_TEST,
    previousSecret: process.env.RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_webhook_integration';
  process.env.RAZORPAY_KEY_SECRET = `api-secret-${runId}`;
  process.env.RAZORPAY_WEBHOOK_SECRET_TEST = `webhook-secret-${runId}`;
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const malformed = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(malformed.status, 400);
    assert.ok(malformed.headers.get('x-request-id'));

    const oversized = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.alloc(1024 * 1024 + 1, 0x20),
    });
    assert.equal(oversized.status, 413);
    assert.ok(oversized.headers.get('x-request-id'));

    const eventId = `IT-${runId}-RAW-HTTP`;
    const rawBody = Buffer.from(`{\n  "event": "payment.failed",\n  "payload": { "payment": { "entity": { "id": "pay_http_${runId}", "order_id": "order_http_${runId}" } } }\n}`);
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET_TEST).update(rawBody).digest('hex');
    const accepted = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': eventId,
        'x-razorpay-signature': signature,
      },
      body: rawBody,
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).accepted, true);
    const stored = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(stored.status, 'RECEIVED');
    assert.equal(stored.mode, 'TEST');
    assert.equal(stored.payloadHash, crypto.createHash('sha256').update(rawBody).digest('hex'));

    const exactLimitPrefix = Buffer.from(JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: `pay_limit_${runId}`, order_id: `order_limit_${runId}` } } },
      padding: '',
    })).subarray(0, -2);
    const exactLimitBody = Buffer.concat([
      exactLimitPrefix,
      Buffer.alloc(1024 * 1024 - exactLimitPrefix.length - 2, 0x78),
      Buffer.from('"}'),
    ]);
    assert.equal(exactLimitBody.length, 1024 * 1024);
    const exactLimitEventId = `IT-${runId}-RAW-HTTP-EXACT-LIMIT`;
    const exactLimitSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET_TEST).update(exactLimitBody).digest('hex');
    const exactLimitResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': exactLimitEventId,
        'x-razorpay-signature': exactLimitSignature,
      },
      body: exactLimitBody,
    });
    assert.equal(exactLimitResponse.status, 200);
    assert.equal((await exactLimitResponse.json()).accepted, true);

    const persistFailureId = `IT-${runId}-RAW-HTTP-DB-FAIL`;
    const persist = prisma.razorpayWebhookEvent.create;
    const transaction = prisma.$transaction;
    prisma.razorpayWebhookEvent.create = async () => { throw Object.assign(new Error('Injected inbox outage'), { code: 'P1001' }); };
    prisma.$transaction = () => new Promise(() => {});
    try {
      const failedPersistence = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-event-id': persistFailureId,
          'x-razorpay-signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(1_000),
      });
      assert.equal(failedPersistence.status, 500);
      const failureBody = await failedPersistence.json();
      assert.equal(failureBody.code, 'WEBHOOK_PERSIST_FAILED');
      assert.equal(failureBody.retryable, true);
      assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId: persistFailureId } }), 0);
    } finally {
      prisma.razorpayWebhookEvent.create = persist;
      prisma.$transaction = transaction;
    }

    const wrongModeId = `IT-${runId}-RAW-HTTP-WRONG-MODE`;
    const wrongMode = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/live`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-event-id': wrongModeId, 'x-razorpay-signature': signature },
      body: rawBody,
    });
    assert.equal(wrongMode.status, 503);
    assert.equal((await wrongMode.json()).code, 'WEBHOOK_MODE_MISMATCH');
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId: wrongModeId } }), 0);

    const tamperedId = `IT-${runId}-RAW-HTTP-TAMPERED`;
    const tampered = await fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/razorpay/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': tamperedId,
        'x-razorpay-signature': signature,
      },
      body: Buffer.from(rawBody.toString().replace('payment.failed', 'payment.captured')),
    });
    assert.equal(tampered.status, 400);
    assert.equal((await tampered.json()).code, 'WEBHOOK_SIGNATURE_INVALID');
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId: tamperedId } }), 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries({
      RAZORPAY_KEY_ID: previous.keyId,
      RAZORPAY_KEY_SECRET: previous.keySecret,
      RAZORPAY_WEBHOOK_SECRET_TEST: previous.secret,
      RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS: previous.previousSecret,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

integrationTest('captured Razorpay settlement updates CRM ledger once and a repeated callback is idempotent', async () => {
  const invoice = await createInvoice('RZP-SETTLE', 10);
  const prior = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    experimentEnabled: process.env.RAZORPAY_CHECKOUT_AB_ENABLED,
    experimentSecret: process.env.RAZORPAY_AB_HASH_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `checkout-secret-${runId}`;
  process.env.RAZORPAY_CHECKOUT_AB_ENABLED = 'true';
  process.env.RAZORPAY_AB_HASH_SECRET = `capture-experiment-secret-${runId}-hash`;
  const experimentVisitorId = crypto.randomUUID();
  const experimentVisitorHash = hashVisitorId(experimentVisitorId, process.env.RAZORPAY_AB_HASH_SECRET);
  const experimentVariant = assignVariant(experimentVisitorHash);
  state.experimentVisitorHashes ||= [];
  state.experimentVisitorHashes.push(experimentVisitorHash);
  await prisma.razorpayCheckoutExperimentEvent.create({
    data: {
      eventId: crypto.randomUUID(), experimentId: EXPERIMENT_ID, visitorHash: experimentVisitorHash,
      variant: experimentVariant, eventType: 'EXPOSURE', mode: 'TEST',
    },
  });
  const shareId = `share-settle-${runId}`;
  let providerOrder;
  let providerPayment;
  const provider = {
    orders: {
      create: async (payload) => {
        providerOrder = { id: `order_settle_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes };
        return providerOrder;
      },
      fetch: async () => providerOrder,
    },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const checkout = await createInvoiceCheckout({
      invoice, shareId, idempotencyKey: `settle-${runId}`,
      experiment: { id: EXPERIMENT_ID, variant: experimentVariant, visitorHash: experimentVisitorHash }, provider,
    });
    providerPayment = {
      id: `pay_settle_${runId}`, order_id: checkout.order.id, amount: 1000,
      currency: 'INR', status: 'captured', method: 'card', captured: true,
      card: { network: 'VISA', type: 'debit', last4: '1234', issuer: 'BANK' },
    };
    await prisma.razorpayCheckoutAttempt.update({
      where: { id: checkout.attempt.id },
      data: {
        status: 'FAILED', failureCode: 'PAYMENT_FAILED', providerErrorCode: 'BAD_REQUEST_ERROR',
        providerErrorSource: 'customer', providerErrorStep: 'payment_authentication', providerErrorReason: 'payment_cancelled',
      },
    });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${checkout.order.id}|${providerPayment.id}`).digest('hex');
    const args = {
      paymentId: providerPayment.id,
      providerOrderId: checkout.order.id,
      signature,
      source: 'INTEGRATION_TEST',
      expectedInvoiceId: invoice.id,
      provider,
    };
    const first = await settleCapturedPayment(args);
    const replay = await settleCapturedPayment(args);
    assert.equal(first.alreadyRecorded, false);
    assert.equal(replay.alreadyRecorded, true);
    assert.equal(Number(first.invoice.balanceDue), 0);
    assert.equal(Number(replay.order.balanceDue), 0);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: providerPayment.id, status: 'CAPTURED', kind: 'RECEIPT' } }), 1);
    assert.equal(await prisma.paymentAllocation.count({ where: { payment: { razorpayPaymentId: providerPayment.id }, invoiceId: invoice.id, status: 'POSTED' } }), 1);
    const storedPayment = await prisma.payment.findFirst({ where: { razorpayPaymentId: providerPayment.id } });
    assert.equal(storedPayment.razorpaySignature, null);
    assert.equal(storedPayment.method, 'RAZORPAY');
    assert.equal(storedPayment.providerMethod, 'card');
    assert.equal(storedPayment.providerMethodDetail, 'visa:debit');
    const storedAttempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } });
    assert.equal(storedAttempt.status, 'CAPTURED');
    assert.equal(storedAttempt.providerErrorCode, null);
    assert.equal(storedAttempt.providerErrorSource, null);
    assert.equal(storedAttempt.providerErrorStep, null);
    assert.equal(storedAttempt.providerErrorReason, null);
    assert.equal(storedAttempt.providerMethod, 'card');
    assert.equal(await prisma.receipt.count({ where: { customerId: invoice.customerId, allocations: { some: { invoiceId: invoice.id } } } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment-received:${first.payment.id}` } }), 1);
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { id: checkout.attempt.id, status: 'CAPTURED' } }), 1);
    assert.equal(await prisma.razorpayCheckoutExperimentEvent.count({ where: { visitorHash: experimentVisitorHash, eventType: 'CRM_CAPTURED', attemptId: checkout.attempt.id } }), 1);
  } finally {
    if (prior.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prior.keyId;
    if (prior.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prior.keySecret;
    if (prior.experimentEnabled === undefined) delete process.env.RAZORPAY_CHECKOUT_AB_ENABLED;
    else process.env.RAZORPAY_CHECKOUT_AB_ENABLED = prior.experimentEnabled;
    if (prior.experimentSecret === undefined) delete process.env.RAZORPAY_AB_HASH_SECRET;
    else process.env.RAZORPAY_AB_HASH_SECRET = prior.experimentSecret;
  }
});

integrationTest('provider payment reconciliation recovers a missed capture once and ignores unrelated account payments', async () => {
  const invoice = await createInvoice('RZP-SCAN', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const orderId = `order_scan_${runId}`;
  const paymentId = `pay_scan_${runId}`;
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `scan-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'PENDING',
      razorpayOrderId: orderId,
    },
  });
  const providerPayment = {
    id: paymentId, order_id: orderId, amount: 1000, currency: 'INR',
    status: 'captured', captured: true, method: 'upi',
  };
  const providerOrder = {
    id: orderId, amount: 1000, currency: 'INR',
    notes: { crm_attempt_id: attempt.id, invoice_id: invoice.id },
  };
  let listCalls = 0;
  const provider = {
    payments: {
      all: async (params) => {
        listCalls += 1;
        assert.equal(params.from, window.from);
        assert.equal(params.to, window.to);
        assert.equal(params.count, 100);
        if (params.skip === 0) return { count: 100, items: Array.from({ length: 100 }, (_, index) => ({
          id: `pay_unrelated_${runId}_${index}`,
          order_id: `order_unrelated_${runId}_${index}`,
          amount: 500,
          currency: 'INR',
          status: 'captured',
          captured: true,
        })) };
        assert.equal(params.skip, 100);
        return { count: 1, items: [providerPayment] };
      },
      fetch: async (id) => {
        assert.equal(id, paymentId);
        return providerPayment;
      },
    },
    orders: {
      fetch: async (id) => { assert.equal(id, orderId); return providerOrder; },
      fetchPayments: async () => ({ items: [] }),
    },
  };
  const now = new Date();
  const window = { from: Math.floor(now.getTime() / 1000) - 60, to: Math.floor(now.getTime() / 1000) + 30 };
  const runKey = `IT-${runId}-RZP-SCAN`;
  try {
    const first = await runRazorpayPaymentReconciliation({
      provider, from: window.from, to: window.to, now, scheduleKey: runKey,
    });
    assert.equal(first.status, 'PASSED');
    assert.equal(first.summary.recoveredCaptures, 1);
    assert.equal(first.summary.outOfScope, 100);
    assert.equal(first.summary.captureWebhookNotProcessed, 1);
    assert.equal(listCalls, 2);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' } }), 1);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 0);

    const replay = await runRazorpayPaymentReconciliation({
      provider, from: window.from, to: window.to, now, scheduleKey: `${runKey}-replay`,
    });
    assert.equal(replay.status, 'PASSED');
    assert.equal(replay.summary.alreadySettled, 1);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' } }), 1);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('provider payment reconciliation sends known-order amount mismatches to review without ledger writes', async () => {
  const invoice = await createInvoice('RZP-SCAN-MISMATCH', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const orderId = `order_scan_mismatch_${runId}`;
  const paymentId = `pay_scan_mismatch_${runId}`;
  await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `scan-mismatch-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'PENDING',
      razorpayOrderId: orderId,
    },
  });
  const now = new Date();
  try {
    const run = await runRazorpayPaymentReconciliation({
      provider: {
        payments: { all: async () => ({ items: [{
        id: paymentId, order_id: orderId, amount: 999, currency: 'INR', status: 'captured', captured: true,
        }] }) },
        orders: { fetchPayments: async () => ({ items: [] }) },
      },
      from: Math.floor(now.getTime() / 1000) - 60,
      to: Math.floor(now.getTime() / 1000) + 30,
      now,
      scheduleKey: `IT-${runId}-RZP-SCAN-MISMATCH`,
    });
    assert.equal(run.status, 'FAILED');
    assert.equal(run.summary.reviewRequired, 1);
    assert.equal(run.exceptions.items[0].code, 'PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 10);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Finance provider reconciliation request is durable and completed by the queue worker', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `reconcile-secret-${runId}`;
  const queuedRunIds = [];
  try {
    const queued = await enqueueRazorpayPaymentReconciliation(state.staff.id);
    queuedRunIds.push(queued.id);
    assert.equal(queued.status, 'QUEUED');
    const completed = await processQueuedRazorpayPaymentReconciliation({
      provider: { payments: { all: async () => ({ count: 0, items: [] }) }, orders: { fetchPayments: async () => ({ items: [] }) } },
    });
    assert.equal(completed.id, queued.id);
    assert.equal(completed.status, 'PASSED');
    assert.equal(completed.runType, 'RAZORPAY_PAYMENTS_TEST');
    assert.equal(completed.summary.paginationComplete, true);
  } finally {
    if (queuedRunIds.length) await prisma.reconciliationRun.deleteMany({ where: { id: { in: queuedRunIds } } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
});

integrationTest('provider attempt sweep recovers a capture older than the payment-list window through the canonical ledger', async () => {
  const invoice = await createInvoice('RZP-LONG-TAIL', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const orderId = `order_long_tail_${runId}`;
  const paymentId = `pay_long_tail_${runId}`;
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `long-tail-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'PENDING',
      razorpayOrderId: orderId,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    },
  });
  const providerPayment = {
    id: paymentId, order_id: orderId, amount: 1000, currency: 'INR',
    status: 'captured', captured: true, method: 'card',
  };
  const providerOrder = {
    id: orderId, amount: 1000, currency: 'INR',
    notes: { crm_attempt_id: attempt.id, invoice_id: invoice.id },
  };
  const now = new Date();
  const window = { from: Math.floor(now.getTime() / 1000) - 60, to: Math.floor(now.getTime() / 1000) + 30 };
  const provider = {
    payments: { all: async () => ({ count: 0, items: [] }), fetch: async (id) => { assert.equal(id, paymentId); return providerPayment; } },
    orders: {
      fetchPayments: async (id) => { assert.equal(id, orderId); return { items: [providerPayment] }; },
      fetch: async (id) => { assert.equal(id, orderId); return providerOrder; },
    },
  };
  try {
    const run = await runRazorpayPaymentReconciliation({
      provider,
      from: window.from,
      to: window.to,
      now,
      scheduleKey: `IT-${runId}-RZP-LONG-TAIL`,
    });
    assert.equal(run.status, 'PASSED');
    assert.equal(run.summary.scanned, 0);
    assert.equal(run.summary.pendingAttemptsClaimed, 1);
    assert.equal(run.summary.pendingAttemptsChecked, 1);
    assert.equal(run.summary.pendingAttemptCaptures, 1);
    assert.equal(run.summary.recoveredCaptures, 1);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 0);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' } }), 1);
    assert.ok((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } })).nextProviderCheckAt);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('provider attempt sweep does not post an authorized payment and schedules a later recheck', async () => {
  const invoice = await createInvoice('RZP-PENDING-SWEEP', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const orderId = `order_pending_sweep_${runId}`;
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `pending-sweep-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'AUTHORIZED',
      razorpayOrderId: orderId,
    },
  });
  const before = new Date();
  const now = new Date(before.getTime() + 1_000);
  try {
    const run = await runRazorpayPaymentReconciliation({
      provider: {
        payments: { all: async () => ({ count: 0, items: [] }) },
        orders: { fetchPayments: async (id) => {
          assert.equal(id, orderId);
          return { items: [{ id: `pay_auth_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'authorized', captured: false }] };
        } },
      },
      from: Math.floor(now.getTime() / 1000) - 60,
      to: Math.floor(now.getTime() / 1000) + 30,
      now,
      scheduleKey: `IT-${runId}-RZP-PENDING-SWEEP`,
    });
    const updated = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    assert.equal(run.status, 'PASSED');
    assert.equal(run.summary.pendingAttemptsChecked, 1);
    assert.equal(run.summary.pendingAttemptCaptures, 0);
    assert.ok(updated.nextProviderCheckAt > now);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: `pay_auth_${runId}` } }), 0);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 10);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('provider attempt sweep marks an attempt failed only after the complete Order payment list is terminal', async () => {
  const invoice = await createInvoice('RZP-FAILED-SWEEP', 10);
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const orderId = `order_failed_sweep_${runId}`;
  const paymentId = `pay_failed_sweep_${runId}`;
  const attempt = await prisma.razorpayCheckoutAttempt.create({
    data: {
      idempotencyKey: `failed-sweep-${runId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'CREATED',
      razorpayOrderId: orderId,
    },
  });
  const failedPayment = {
    id: paymentId, order_id: orderId, amount: 1000, currency: 'INR',
    status: 'failed', captured: false, method: 'card', error_code: 'BAD_REQUEST_ERROR',
    error_source: 'customer', error_step: 'payment_authentication', error_reason: 'payment_failed', created_at: 10,
  };
  const now = new Date();
  try {
    const run = await runRazorpayPaymentReconciliation({
      provider: {
        payments: { all: async () => ({ count: 1, items: [failedPayment] }) },
        orders: { fetchPayments: async (id) => { assert.equal(id, orderId); return { count: 1, items: [failedPayment] }; } },
      },
      from: Math.floor(now.getTime() / 1000) - 60,
      to: Math.floor(now.getTime() / 1000) + 30,
      now,
      scheduleKey: `IT-${runId}-RZP-FAILED-SWEEP`,
    });
    const updated = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    assert.equal(run.status, 'PASSED');
    assert.equal(run.summary.pendingAttemptsChecked, 1);
    assert.equal(run.summary.pendingAttemptFailures, 1);
    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.razorpayPaymentId, paymentId);
    assert.equal(updated.failureCode, 'PAYMENT_FAILED');
    assert.ok(updated.completedAt);
    assert.equal(await prisma.auditLog.count({ where: { resource: 'razorpay_checkout_attempt', resourceId: attempt.id, action: 'RAZORPAY_PAYMENT_PROVIDER_FAILED' } }), 1);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 10);
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('provider attempt sweep keeps checkout blocked for mixed or incomplete Order payment lists', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  const now = new Date();
  const cases = [
    { suffix: 'MIXED', count: 2, items: (orderId) => [
      { id: `pay_failed_mixed_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'failed', captured: false, created_at: 10 },
      { id: `pay_pending_mixed_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'created', captured: false, created_at: 11 },
    ] },
    { suffix: 'INCOMPLETE', count: 2, items: (orderId) => [
      { id: `pay_failed_partial_${runId}`, order_id: orderId, amount: 1000, currency: 'INR', status: 'failed', captured: false, created_at: 10 },
    ] },
    { suffix: 'UNSAFE_AMOUNT', count: 1, amount: Number.MAX_SAFE_INTEGER + 1, items: (orderId, amount) => [
      { id: `pay_failed_unsafe_${runId}`, order_id: orderId, amount, currency: 'INR', status: 'failed', captured: false, created_at: 10 },
    ] },
    { suffix: 'STRING_AMOUNT', count: 1, amount: '1000', items: (orderId, amount) => [
      { id: `pay_failed_string_${runId}`, order_id: orderId, amount, currency: 'INR', status: 'failed', captured: false, created_at: 10 },
    ] },
  ];
  try {
    for (const scenario of cases) {
      const invoice = await createInvoice(`RZP-${scenario.suffix}-SWEEP`, 10);
      const orderId = `order_${scenario.suffix.toLowerCase()}_sweep_${runId}`;
      const attempt = await prisma.razorpayCheckoutAttempt.create({
        data: {
          idempotencyKey: `${scenario.suffix.toLowerCase()}-sweep-${runId}`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orderId: invoice.orderId,
          customerId: invoice.customerId,
          amountPaise: 1000n,
          currency: 'INR',
          mode: 'TEST',
          status: 'CREATED',
          razorpayOrderId: orderId,
        },
      });
      const items = scenario.items(orderId, scenario.amount);
      const run = await runRazorpayPaymentReconciliation({
        provider: {
          payments: { all: async () => ({ count: 0, items: [] }) },
          orders: { fetchPayments: async (id) => { assert.equal(id, orderId); return { count: scenario.count, items }; } },
        },
        from: Math.floor(now.getTime() / 1000) - 60,
        to: Math.floor(now.getTime() / 1000) + 30,
        now,
        scheduleKey: `IT-${runId}-RZP-${scenario.suffix}-SWEEP`,
      });
      const updated = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      assert.equal(run.status, 'PASSED');
      assert.equal(run.summary.pendingAttemptFailures, 0);
      assert.equal(updated.status, 'CREATED');
      assert.equal(updated.razorpayPaymentId, null);
      assert.equal(await prisma.payment.count({ where: { orderId: invoice.orderId, kind: 'RECEIPT' } }), 0);
      assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 10);
    }
  } finally {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Razorpay settlement recon imports payment and refund cash lines idempotently without changing invoice receipts', async () => {
  const invoice = await createInvoice('RZP-SETTLEMENT-RECON', 10);
  const receiptCountBefore = await prisma.payment.count({ where: { customerId: invoice.customerId, kind: 'RECEIPT' } });
  const paymentEntityId = `pay_settlement_recon_${runId}`;
  const refundEntityId = `rfnd_settlement_recon_${runId}`;
  const providerLines = [
    {
      entity_id: paymentEntityId, type: 'payment', debit: 0, credit: 971, amount: 1000, currency: 'INR',
      fee: 25, tax: 4, settled: true, on_hold: false, created_at: 1790000000,
      settled_at: 1790001000, settlement_id: `setl_${runId}`, settlement_utr: `utr_${runId}`, order_id: `order_${runId}`,
      payment_id: null, method: 'card', card_issuer: 'issuer-not-stored', notes: 'PII-not-stored',
    },
    {
      entity_id: refundEntityId, type: 'refund', debit: 500, credit: 0, amount: 500, currency: 'INR',
      fee: 0, tax: 0, settled: true, on_hold: false, created_at: 1790000100,
      settled_at: 1790001000, settlement_id: `setl_${runId}`, settlement_utr: `utr_${runId}`,
      payment_id: paymentEntityId, order_id: `order_${runId}`,
    },
  ];
  const provider = { settlements: { reports: async (params) => {
    assert.deepEqual(params, { year: 2026, month: 9, day: 24, count: 1000, skip: 0 });
    return { entity: 'collection', count: providerLines.length, items: providerLines };
  } } };
  try {
    const imported = await importRazorpaySettlementRecon({ year: 2026, month: 9, day: 24, mode: 'TEST', provider });
    const replay = await importRazorpaySettlementRecon({ year: 2026, month: 9, day: 24, mode: 'TEST', provider });
    assert.equal(imported.rows, 2);
    assert.equal(imported.inserted, 2);
    assert.equal(imported.updated, 0);
    assert.equal(imported.types.payment, 1);
    assert.equal(imported.types.refund, 1);
    assert.equal(imported.debitPaise, '500');
    assert.equal(imported.creditPaise, '971');
    assert.equal(imported.feePaise, '25');
    assert.equal(imported.taxPaise, '4');
    assert.equal(replay.inserted, 0);
    assert.equal(replay.updated, 2);
    assert.equal(await prisma.razorpaySettlementReconLine.count({ where: { mode: 'TEST', providerEntityId: { in: [paymentEntityId, refundEntityId] } } }), 2);
    const storedPaymentLine = await prisma.razorpaySettlementReconLine.findUnique({ where: { mode_entityType_providerEntityId: { mode: 'TEST', entityType: 'payment', providerEntityId: paymentEntityId } } });
    assert.equal(storedPaymentLine.providerPaymentId, paymentEntityId);
    assert.equal(storedPaymentLine.description, null);
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), 10);
    assert.equal(await prisma.payment.count({ where: { customerId: invoice.customerId, kind: 'RECEIPT' } }), receiptCountBefore);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await listRazorpaySettlementLines({ query: { mode: 'TEST', limit: '50' } }, response);
    const serializedLine = response.body.data.lines.find((line) => line.providerEntityId === paymentEntityId);
    assert.equal(serializedLine.amountPaise, '1000');
    assert.equal(serializedLine.feePaise, '25');
    assert.doesNotThrow(() => JSON.stringify(response.body));
  } finally {
    await prisma.razorpaySettlementReconLine.deleteMany({ where: { mode: 'TEST', providerEntityId: { in: [paymentEntityId, refundEntityId] } } });
  }
});

integrationTest('settlement report lines match only the exact mode-scoped CRM payment and expose ledger mismatches read-only', async () => {
  const invoice = await createInvoice('RZP-SETTLEMENT-MATCH', 10);
  const matchedProviderId = `pay_settlement_match_${runId}`;
  const modeMismatchProviderId = `pay_settlement_mode_${runId}`;
  const unmatchedProviderId = `pay_settlement_missing_${runId}`;
  const duplicateProviderId = `pay_settlement_duplicate_${runId}`;
  const storedLineIds = [
    { entityType: 'payment', providerEntityId: `line_${matchedProviderId}`, providerPaymentId: matchedProviderId },
    { entityType: 'payment', providerEntityId: `line_amount_${runId}`, providerPaymentId: matchedProviderId },
    { entityType: 'payment', providerEntityId: `line_order_${runId}`, providerPaymentId: matchedProviderId },
    { entityType: 'payment', providerEntityId: `line_currency_${runId}`, providerPaymentId: matchedProviderId },
    { entityType: 'payment', providerEntityId: `line_${modeMismatchProviderId}`, providerPaymentId: modeMismatchProviderId },
    { entityType: 'payment', providerEntityId: `line_${unmatchedProviderId}`, providerPaymentId: unmatchedProviderId },
    { entityType: 'payment', providerEntityId: `line_${duplicateProviderId}`, providerPaymentId: duplicateProviderId },
  ];
  let postedPayment;
  try {
    await prisma.$transaction(async (tx) => {
      const settlement = await recordInvoiceSettlement(tx, {
        invoiceId: invoice.id,
        amount: 8,
        method: 'RAZORPAY',
        reference: matchedProviderId,
        idempotencyKey: `settlement-match-${runId}`,
        razorpayOrderId: `order_settlement_match_${runId}`,
        razorpayPaymentId: matchedProviderId,
        mode: 'TEST',
        providerCaptureVerified: true,
      });
      postedPayment = settlement.payment;
    });
    await prisma.payment.create({
      data: { orderId: invoice.orderId, customerId: invoice.customerId, amount: 10, kind: 'RECEIPT', method: 'RAZORPAY', status: 'CAPTURED', razorpayPaymentId: modeMismatchProviderId, mode: 'LIVE' },
    });
    await prisma.payment.createMany({ data: [1, 2].map(() => ({
      orderId: invoice.orderId, customerId: invoice.customerId, amount: 5, kind: 'RECEIPT', method: 'RAZORPAY', status: 'CAPTURED', razorpayPaymentId: duplicateProviderId, mode: 'TEST',
    })) });
    const invoiceBefore = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    const receiptsBefore = await prisma.payment.count({ where: { customerId: invoice.customerId, kind: 'RECEIPT' } });
    const reportRows = [
      { entity_id: `line_${matchedProviderId}`, payment_id: matchedProviderId, type: 'payment', amount: 800, debit: 0, credit: 777, fee: 20, tax: 3, currency: 'INR', settled: true, order_id: `order_settlement_match_${runId}` },
      { entity_id: `line_amount_${runId}`, payment_id: matchedProviderId, type: 'payment', amount: 900, debit: 0, credit: 877, fee: 20, tax: 3, currency: 'INR', settled: true },
      { entity_id: `line_order_${runId}`, payment_id: matchedProviderId, type: 'payment', amount: 800, debit: 0, credit: 777, fee: 20, tax: 3, currency: 'INR', settled: true, order_id: 'order_wrong_reference' },
      { entity_id: `line_currency_${runId}`, payment_id: matchedProviderId, type: 'payment', amount: 800, debit: 0, credit: 777, fee: 20, tax: 3, currency: 'USD', settled: true },
      { entity_id: `line_${modeMismatchProviderId}`, payment_id: modeMismatchProviderId, type: 'payment', amount: 1000, debit: 0, credit: 977, fee: 20, tax: 3, currency: 'INR', settled: true },
      { entity_id: `line_${unmatchedProviderId}`, payment_id: unmatchedProviderId, type: 'payment', amount: 500, debit: 0, credit: 477, fee: 20, tax: 3, currency: 'INR', settled: true },
      { entity_id: `line_${duplicateProviderId}`, payment_id: duplicateProviderId, type: 'payment', amount: 500, debit: 0, credit: 477, fee: 20, tax: 3, currency: 'INR', settled: true },
    ];
    await importRazorpaySettlementRecon({ year: 2026, month: 9, day: 24, mode: 'TEST', provider: { settlements: { reports: async () => ({ items: reportRows }) } } });
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await listRazorpaySettlementLines({ query: { mode: 'TEST', limit: '50' } }, response);
    const byEntityId = new Map(response.body.data.lines.map((line) => [line.providerEntityId, line]));
    assert.equal(byEntityId.get(`line_${matchedProviderId}`).matchStatus, 'MATCHED');
    assert.equal(byEntityId.get(`line_${matchedProviderId}`).localPaymentId, postedPayment.id);
    assert.equal(byEntityId.get(`line_amount_${runId}`).matchStatus, 'AMOUNT_MISMATCH');
    assert.equal(byEntityId.get(`line_order_${runId}`).matchStatus, 'ORDER_MISMATCH');
    assert.equal(byEntityId.get(`line_currency_${runId}`).matchStatus, 'CURRENCY_MISMATCH');
    assert.equal(byEntityId.get(`line_${modeMismatchProviderId}`).matchStatus, 'MODE_MISMATCH');
    assert.equal(byEntityId.get(`line_${unmatchedProviderId}`).matchStatus, 'UNMATCHED');
    assert.equal(byEntityId.get(`line_${duplicateProviderId}`).matchStatus, 'DUPLICATE');
    assert.equal(Number((await prisma.invoice.findUnique({ where: { id: invoice.id } })).balanceDue), Number(invoiceBefore.balanceDue));
    assert.equal(await prisma.payment.count({ where: { customerId: invoice.customerId, kind: 'RECEIPT' } }), receiptsBefore);
  } finally {
    await prisma.razorpaySettlementReconLine.deleteMany({ where: { mode: 'TEST', providerEntityId: { in: storedLineIds.map((line) => line.providerEntityId) } } });
  }
});

integrationTest('processed Razorpay refund settlement lines match the mode-scoped refund ledger and source payment', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_settlement_refund';
  const invoice = await createInvoice('RZP-SETTLEMENT-REFUND', 10);
  const paymentId = `pay_settlement_refund_${runId}`;
  const lineId = `rfnd_settlement_refund_${runId}`;
  try {
    const captured = await prisma.$transaction((tx) => recordInvoiceSettlement(tx, {
      invoiceId: invoice.id, amount: 10, method: 'RAZORPAY', reference: paymentId,
      idempotencyKey: `settlement-refund-source-${runId}`, razorpayOrderId: `order_settlement_refund_${runId}`,
      razorpayPaymentId: paymentId, mode: 'TEST',
      providerCaptureVerified: true,
    }));
    const pending = await createRazorpayRefund({
      orderId: invoice.orderId, sourcePaymentId: captured.payment.id, amount: 4,
      reasonCode: 'CUSTOMER_REFUND', reason: 'Settlement report match test',
      staff: state.actor, idempotencyKey: `${runId}:settlement-refund-match`,
      provider: async ({ paymentId: sourceId, amountPaise, attempt }) => ({
        id: lineId, payment_id: sourceId, amount: Number(amountPaise), currency: 'INR', status: 'pending',
        notes: { crm_refund_attempt_id: attempt.id },
      }),
    });
    const providerRefund = {
      id: lineId, payment_id: paymentId, amount: 400, currency: 'INR', status: 'processed',
      notes: { crm_refund_attempt_id: pending.attempt.id },
    };
    await reconcileRazorpayRefundWebhook({
      refundId: lineId, refundAttemptId: pending.attempt.id, eventId: `IT-${runId}:settlement-refund`, eventType: 'refund.processed',
    }, async () => providerRefund);
    const refundPayment = await prisma.payment.findUnique({ where: { razorpayRefundId: lineId } });
    assert.equal(refundPayment.mode, 'TEST');
    const reportRow = {
      entity_id: lineId, payment_id: paymentId, type: 'refund', amount: 400, debit: 400, credit: 0,
      fee: 0, tax: 0, currency: 'INR', settled: true,
    };
    await importRazorpaySettlementRecon({
      year: 2026, month: 9, day: 24, mode: 'TEST',
      provider: { settlements: { reports: async () => ({ items: [reportRow] }) } },
    });
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await listRazorpaySettlementLines({ query: { mode: 'TEST', limit: '50' } }, response);
    const line = response.body.data.lines.find((entry) => entry.providerEntityId === lineId);
    assert.equal(line.matchStatus, 'MATCHED');
    assert.equal(line.localPaymentId, refundPayment.id);
    assert.equal(line.localRefundAttemptId, pending.attempt.id);
  } finally {
    await prisma.razorpaySettlementReconLine.deleteMany({ where: { mode: 'TEST', entityType: 'refund', providerEntityId: lineId } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
  }
});

integrationTest('Finance settlement reconciliation is durably queued and processed by the shared worker', async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `settlement-recon-secret-${runId}`;
  const queuedRunIds = [];
  try {
    await assert.rejects(
      enqueueRazorpaySettlementReconciliation({ initiatedBy: state.staff.id, year: 2026, month: 2, day: 29 }),
      (error) => error.code === 'INVALID_SETTLEMENT_RECON_DATE',
    );
    const queued = await enqueueRazorpaySettlementReconciliation({
      initiatedBy: state.staff.id,
      year: 2026,
      month: 9,
      day: 24,
    });
    queuedRunIds.push(queued.id);
    assert.equal(queued.status, 'QUEUED');
    assert.equal(queued.runType, 'RAZORPAY_SETTLEMENTS_TEST');
    assert.deepEqual(queued.summary, { mode: 'TEST', year: 2026, month: 9, day: 24 });
    const processed = await processQueuedRazorpayPaymentReconciliation({
      provider: { settlements: { reports: async (params) => {
        assert.deepEqual(params, { year: 2026, month: 9, day: 24, count: 1000, skip: 0 });
        return { entity: 'collection', count: 0, items: [] };
      } } },
    });
    assert.equal(processed.id, queued.id);
    assert.equal(processed.status, 'PASSED');
    assert.equal(processed.summary.rows, 0);
    assert.equal(processed.summary.request.day, 24);

    const from = 1790000000;
    const to = from + 86400;
    const summaryQueued = await enqueueRazorpaySettlementSummaryReconciliation({ initiatedBy: state.staff.id, from, to });
    queuedRunIds.push(summaryQueued.id);
    assert.equal(summaryQueued.runType, 'RAZORPAY_SETTLEMENT_SUMMARIES_TEST');
    const summaryProcessed = await processQueuedRazorpayPaymentReconciliation({
      provider: { settlements: { all: async (params) => {
        assert.deepEqual(params, { from, to, count: 100, skip: 0 });
        return { items: [{ id: `setl_summary_${runId}`, status: 'processed', amount: 971, fees: 25, tax: 4, utr: `utr_${runId}`, created_at: from + 10 }] };
      } } },
    });
    assert.equal(summaryProcessed.id, summaryQueued.id);
    assert.equal(summaryProcessed.status, 'PASSED');
    assert.equal(summaryProcessed.summary.byStatus.processed, 1);
    const storedSummary = await prisma.razorpaySettlementSummary.findUnique({ where: { mode_providerSettlementId: { mode: 'TEST', providerSettlementId: `setl_summary_${runId}` } } });
    assert.equal(storedSummary.amountPaise.toString(), '971');
    assert.equal(storedSummary.status, 'processed');
    await prisma.razorpaySettlementSummary.deleteMany({ where: { mode: 'TEST', providerSettlementId: `setl_summary_${runId}` } });
  } finally {
    if (queuedRunIds.length) await prisma.reconciliationRun.deleteMany({ where: { id: { in: queuedRunIds } } });
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
});

integrationTest('Razorpay settlement summaries import idempotently, preserve status/UTR and serialize minor units', async () => {
  const providerSettlementId = `setl_summary_idempotent_${runId}`;
  const from = 1790000000;
  const to = from + 86400;
  const providerRows = [
    { id: providerSettlementId, entity: 'settlement', amount: 997, status: 'processed', fees: 25, tax: 4, utr: `utr_summary_${runId}`, created_at: from + 5 },
    { id: `setl_failed_${runId}`, entity: 'settlement', amount: 0, status: 'failed', fees: 0, tax: 0, created_at: from + 20 },
  ];
  const provider = { settlements: { all: async (params) => {
    assert.deepEqual(params, { from, to, count: 100, skip: 0 });
    return { entity: 'collection', count: providerRows.length, items: providerRows };
  } } };
  try {
    const imported = await importRazorpaySettlementSummaries({ from, to, mode: 'TEST', provider });
    const replay = await importRazorpaySettlementSummaries({ from, to, mode: 'TEST', provider });
    assert.equal(imported.rows, 2);
    assert.equal(imported.inserted, 2);
    assert.equal(imported.byStatus.processed, 1);
    assert.equal(imported.byStatus.failed, 1);
    assert.equal(imported.amountPaise, '997');
    assert.equal(imported.feesPaise, '25');
    assert.equal(replay.inserted, 0);
    assert.equal(replay.updated, 2);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const { listRazorpaySettlementSummaries } = require('../src/controllers/reconciliation.controller');
    await listRazorpaySettlementSummaries({ query: { mode: 'TEST', limit: '50' } }, response);
    const line = response.body.data.settlements.find((item) => item.providerSettlementId === providerSettlementId);
    assert.equal(line.amountPaise, '997');
    assert.equal(line.feesPaise, '25');
    assert.equal(line.settlementUtr, `utr_summary_${runId}`);
    assert.doesNotThrow(() => JSON.stringify(response.body));
  } finally {
    await prisma.razorpaySettlementSummary.deleteMany({ where: { mode: 'TEST', providerSettlementId: { in: providerRows.map((row) => row.id) } } });
  }
});

integrationTest('bank statement CSV validates rows, masks memo data, and rejects duplicate file imports', async () => {
  const csvText = [
    'transaction_date,reference,debit,credit,currency,description,balance',
    '2026-09-01,UTR-12345,0,"1,234.50",INR,Transfer account 123456789012,"5,678.90"',
    '02/09/2026,UTR-SECOND,10.00,0,USD,"Invalid currency, debit",0',
    '2026-09-31,BAD-DATE,0,2.00,INR,Invalid date,2.00',
  ].join('\n');
  const rows = parseBankStatementCsv(csvText);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, 'ACCEPTED');
  assert.equal(rows[0].amountPaise.toString(), '123450');
  assert.equal(rows[0].memo, 'Transfer account [REDACTED]');
  assert.equal(rows[1].status, 'REJECTED');
  assert.match(rows[1].errorCode, /UNSUPPORTED_CURRENCY/);
  assert.equal(rows[2].errorCode, 'INVALID_DATE');
  const preview = previewBankStatementCsv({ csvText });
  assert.equal(preview.acceptedRows, 1);
  assert.equal(preview.rejectedRows, 2);
  assert.equal(preview.preview[0].balancePaise, '567890');
  assert.equal(await prisma.bankStatementImport.count({ where: { accountLabel: bankImportLabel } }), 0);

  const imported = await importBankStatementCsv({ csvText, fileName: '../bank.csv', accountLabel: bankImportLabel, importedBy: state.staff.id });
  assert.equal(imported.status, 'PARTIAL');
  assert.equal(imported.totalRows, 3);
  assert.equal(imported.acceptedRows, 1);
  assert.equal(imported.rejectedRows, 2);
  const stored = await prisma.bankStatementImport.findUnique({ where: { id: imported.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  assert.equal(stored.fileName, 'bank.csv');
  assert.equal(stored.rows[0].amountPaise.toString(), '123450');
  assert.equal(stored.rows[0].balancePaise.toString(), '567890');
  assert.equal(stored.rows[0].memo, 'Transfer account [REDACTED]');
  assert.equal(stored.rows[1].errorCode, 'UNSUPPORTED_CURRENCY');
  assert.equal(await prisma.auditLog.count({ where: { resourceId: imported.id, action: 'BANK_STATEMENT_IMPORTED' } }), 1);
  await assert.rejects(
    importBankStatementCsv({ csvText, fileName: 'bank.csv', accountLabel: bankImportLabel, importedBy: state.staff.id }),
    (error) => error.code === 'BANK_STATEMENT_DUPLICATE_FILE',
  );
});

integrationTest('bank settlement matching is LIVE-only, evidence checked, auditable, reversible and ledger-neutral', async () => {
  const exactUtr = `UTR-${runId}-EXACT`;
  const manualUtr = `UTR-${runId}-MANUAL`;
  const invalidUtr = `UTR-${runId}-INVALID`;
  const date = new Date();
  const dateText = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const csvText = [
    'transaction_date,reference,debit,credit,currency,description',
    `${dateText},${exactUtr},0,123.45,INR,exact settlement`,
    `${dateText},${manualUtr},0,124.00,INR,review settlement`,
    `${dateText},${invalidUtr},0,123.45,INR,invalid report`,
  ].join('\n');
  const imported = await importBankStatementCsv({ csvText, fileName: `settlement-${runId}.csv`, accountLabel: bankImportLabel, importedBy: state.staff.id });
  const statement = await prisma.bankStatementImport.findUnique({ where: { id: imported.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  const [exactRow, manualRow, invalidRow] = statement.rows;
  const base = {
    mode: 'LIVE', status: 'processed', feesPaise: 0n, taxPaise: 0n,
    providerCreatedAt: date, lastSyncedAt: date, updatedAt: date,
  };
  const summaries = [
    { id: `setl_bank_${runId}_exact`, utr: exactUtr, amount: 12345n },
    { id: `setl_bank_${runId}_manual`, utr: manualUtr, amount: 12345n },
    { id: `setl_bank_${runId}_invalid`, utr: invalidUtr, amount: 12345n },
  ];
  await prisma.razorpaySettlementSummary.createMany({ data: summaries.map((item) => ({ ...base, providerSettlementId: item.id, settlementUtr: item.utr, amountPaise: item.amount })) });
  const storedSummaries = await prisma.razorpaySettlementSummary.findMany({ where: { providerSettlementId: { in: summaries.map((item) => item.id) } } });
  const storedSummaryByProviderId = new Map(storedSummaries.map((item) => [item.providerSettlementId, item]));
  await prisma.razorpaySettlementReconLine.createMany({ data: [
    { mode: 'LIVE', providerEntityId: `pay_${runId}_exact`, entityType: 'payment', providerSettlementId: summaries[0].id, currency: 'INR', amountPaise: 10000n, debitPaise: 0n, creditPaise: 10000n, feePaise: 0n, taxPaise: 0n, settled: true, settlementUtr: exactUtr, updatedAt: date },
    { mode: 'LIVE', providerEntityId: `adj_${runId}_exact`, entityType: 'adjustment', providerSettlementId: summaries[0].id, currency: 'INR', amountPaise: 2345n, debitPaise: 0n, creditPaise: 2345n, feePaise: 0n, taxPaise: 0n, settled: true, settlementUtr: exactUtr, updatedAt: date },
    { mode: 'LIVE', providerEntityId: `pay_${runId}_manual`, entityType: 'payment', providerSettlementId: summaries[1].id, currency: 'INR', amountPaise: 12345n, debitPaise: 0n, creditPaise: 12345n, feePaise: 0n, taxPaise: 0n, settled: true, settlementUtr: manualUtr, updatedAt: date },
    { mode: 'LIVE', providerEntityId: `pay_${runId}_invalid`, entityType: 'payment', providerSettlementId: summaries[2].id, currency: 'INR', amountPaise: 12000n, debitPaise: 0n, creditPaise: 12000n, feePaise: 0n, taxPaise: 0n, settled: true, settlementUtr: invalidUtr, updatedAt: date },
  ] });
  const paymentCount = await prisma.payment.count();
  const receiptCount = await prisma.receipt.count();
  const candidateSet = await getBankSettlementCandidates(imported.id);
  const exactCandidate = candidateSet.rows.find((row) => row.id === exactRow.id).candidates.find((candidate) => candidate.providerSettlementId === summaries[0].id);
  assert.ok(exactCandidate, `Expected exact candidate, got ${JSON.stringify(candidateSet.rows.find((row) => row.id === exactRow.id))}`);
  assert.equal(exactCandidate.exact, true);
  const invalidEvidence = candidateSet.rows.find((row) => row.id === invalidRow.id).candidates.find((candidate) => candidate.providerSettlementId === summaries[2].id);
  assert.equal(invalidEvidence.eligible, false);
  assert.match(invalidEvidence.reason, /report net/);

  const exactMatch = await confirmBankSettlementMatch({ rowId: exactRow.id, settlementSummaryId: storedSummaryByProviderId.get(summaries[0].id).id, staff: state.staff, actorName: state.staff.name });
  assert.equal(exactMatch.matchType, 'EXACT_UTR_AMOUNT_REPORT');
  await assert.rejects(
    confirmBankSettlementMatch({ rowId: manualRow.id, settlementSummaryId: storedSummaryByProviderId.get(summaries[1].id).id, reason: 'Amount differs', staff: { ...state.staff, role: 'ACCOUNTS' }, actorName: state.staff.name }),
    (error) => error.code === 'BANK_SETTLEMENT_OVERRIDE_REQUIRES_MANAGER_REASON',
  );
  const manualMatch = await confirmBankSettlementMatch({ rowId: manualRow.id, settlementSummaryId: storedSummaryByProviderId.get(summaries[1].id).id, reason: 'Bank statement amount differs by bank fee timing', staff: state.staff, actorName: state.staff.name });
  assert.equal(manualMatch.matchType, 'MANUAL_REVIEW');
  assert.equal(manualMatch.variancePaise, '55');
  await assert.rejects(
    confirmBankSettlementMatch({ rowId: invalidRow.id, settlementSummaryId: storedSummaryByProviderId.get(summaries[2].id).id, reason: 'Please match the inconsistent provider report', staff: state.staff, actorName: state.staff.name }),
    (error) => error.code === 'BANK_SETTLEMENT_EVIDENCE_INELIGIBLE',
  );
  await assert.rejects(
    confirmBankSettlementMatch({ rowId: exactRow.id, settlementSummaryId: storedSummaryByProviderId.get(summaries[1].id).id, reason: '', staff: state.staff, actorName: state.staff.name }),
    (error) => error.code === 'BANK_SETTLEMENT_ROW_ALREADY_MATCHED',
  );
  const reversed = await reverseBankSettlementMatch({ matchId: exactMatch.id, reason: 'Incorrect bank row was selected', staff: state.staff, actorName: state.staff.name });
  assert.equal(reversed.status, 'REVERSED');
  assert.equal((await prisma.bankSettlementMatch.findUnique({ where: { id: exactMatch.id } })).status, 'REVERSED');
  assert.equal(await prisma.auditLog.count({ where: { resourceId: exactMatch.id, action: { in: ['BANK_SETTLEMENT_MATCH_CONFIRMED', 'BANK_SETTLEMENT_MATCH_REVERSED'] } } }), 2);
  const exactSummaryId = storedSummaryByProviderId.get(summaries[0].id).id;
  const concurrentMatches = await Promise.allSettled([
    confirmBankSettlementMatch({ rowId: exactRow.id, settlementSummaryId: exactSummaryId, staff: state.staff, actorName: state.staff.name }),
    confirmBankSettlementMatch({ rowId: invalidRow.id, settlementSummaryId: exactSummaryId, reason: 'Same amount but unrelated statement reference', staff: state.staff, actorName: state.staff.name }),
  ]);
  assert.equal(concurrentMatches.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentMatches.filter((result) => result.status === 'rejected').length, 1);
  const activeConcurrentMatch = await prisma.bankSettlementMatch.findFirst({ where: { settlementSummaryId: exactSummaryId, status: 'MATCHED' } });
  assert.ok(activeConcurrentMatch);
  await reverseBankSettlementMatch({ matchId: activeConcurrentMatch.id, reason: 'Concurrency test cleanup review', staff: state.staff, actorName: state.staff.name });
  assert.equal(await prisma.payment.count(), paymentCount);
  assert.equal(await prisma.receipt.count(), receiptCount);
});

integrationTest('settlement summary report reconciles INR batches to report lines and matched/unmatched bank credits without ledger writes', async () => {
  const dateText = '2001-01-01';
  const exactUtr = `UTR-${runId}-REPORT`;
  const importResult = await importBankStatementCsv({
    csvText: [
      'transaction_date,reference,debit,credit,currency,description',
      `${dateText},${exactUtr},0,931.00,INR,matched Razorpay settlement`,
      `${dateText},UNMATCHED-${runId},0,75.50,INR,unmatched bank credit`,
    ].join('\n'),
    fileName: `summary-report-${runId}.csv`,
    accountLabel: bankImportLabel,
    importedBy: state.staff.id,
  });
  const imported = await prisma.bankStatementImport.findUnique({ where: { id: importResult.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
  const [matchedRow] = imported.rows;
  const providerSettlementId = `setl_bank_${runId}_report`;
  const createdAt = new Date(`${dateText}T12:00:00.000Z`);
  const summary = await prisma.razorpaySettlementSummary.create({ data: {
    mode: 'LIVE', providerSettlementId, status: 'processed', amountPaise: 93100n, feesPaise: 0n, taxPaise: 0n,
    settlementUtr: exactUtr, providerCreatedAt: createdAt,
  } });
  await prisma.razorpaySettlementSummary.create({ data: {
    mode: 'LIVE', providerSettlementId: `setl_bank_${runId}_pending`, status: 'created', amountPaise: 5000n, feesPaise: 0n, taxPaise: 0n,
    settlementUtr: null, providerCreatedAt: createdAt,
  } });
  await prisma.razorpaySettlementSummary.create({ data: {
    mode: 'LIVE', providerSettlementId: `setl_bank_${runId}_unmatched`, status: 'processed', amountPaise: 6000n, feesPaise: 0n, taxPaise: 0n,
    settlementUtr: `UTR-${runId}-UNMATCHED`, providerCreatedAt: createdAt,
  } });
  await prisma.razorpaySettlementSummary.create({ data: {
    mode: 'TEST', providerSettlementId: `setl_bank_${runId}_test`, status: 'processed', amountPaise: 999999n, feesPaise: 0n, taxPaise: 0n,
    settlementUtr: `TEST-${runId}`, providerCreatedAt: createdAt,
  } });
  await prisma.razorpaySettlementReconLine.createMany({ data: [
    { mode: 'LIVE', providerEntityId: `pay_${runId}_report`, entityType: 'payment', providerSettlementId, providerPaymentId: `pay_${runId}_report`, currency: 'INR', amountPaise: 100000n, debitPaise: 0n, creditPaise: 97100n, feePaise: 2900n, taxPaise: 0n, settled: true, providerSettledAt: createdAt, settlementUtr: exactUtr },
    { mode: 'LIVE', providerEntityId: `rfnd_${runId}_report`, entityType: 'refund', providerSettlementId, currency: 'INR', amountPaise: 5000n, debitPaise: 5000n, creditPaise: 0n, feePaise: 0n, taxPaise: 0n, settled: true, providerSettledAt: createdAt, settlementUtr: exactUtr },
    { mode: 'LIVE', providerEntityId: `adj_${runId}_report`, entityType: 'adjustment', providerSettlementId, currency: 'INR', amountPaise: 1000n, debitPaise: 0n, creditPaise: 1000n, feePaise: 0n, taxPaise: 0n, settled: true, providerSettledAt: createdAt, settlementUtr: exactUtr },
    { mode: 'LIVE', providerEntityId: `pay_${runId}_unsupported`, entityType: 'payment', providerSettlementId: `setl_bank_${runId}_pending`, currency: 'USD', amountPaise: 2500n, debitPaise: 0n, creditPaise: 2500n, feePaise: 0n, taxPaise: 0n, settled: false, onHold: true, providerSettledAt: createdAt },
    { mode: 'LIVE', providerEntityId: `pay_${runId}_held_unassigned`, entityType: 'payment', providerPaymentId: `pay_${runId}_held_unassigned`, currency: 'INR', amountPaise: 12000n, debitPaise: 0n, creditPaise: 0n, feePaise: 0n, taxPaise: 0n, settled: false, onHold: true, providerCreatedAt: createdAt, providerSettledAt: null },
    { mode: 'LIVE', providerEntityId: `pay_${runId}_pending_unassigned`, entityType: 'payment', providerPaymentId: `pay_${runId}_pending_unassigned`, currency: 'INR', amountPaise: 8000n, debitPaise: 0n, creditPaise: 0n, feePaise: 0n, taxPaise: 0n, settled: false, onHold: false, providerCreatedAt: createdAt, providerSettledAt: null },
  ] });
  const crmPayment = await prisma.payment.create({ data: {
    customerId: state.customer.id, amount: 1000, method: 'RAZORPAY', status: 'CAPTURED', mode: 'LIVE',
    razorpayPaymentId: `pay_${runId}_report`, razorpayOrderId: `order_${runId}_report`,
  } });
  const paymentCount = await prisma.payment.count();
  const receiptCount = await prisma.receipt.count();
  const match = await confirmBankSettlementMatch({ rowId: matchedRow.id, settlementSummaryId: summary.id, staff: state.staff, actorName: state.staff.name });
  assert.equal(match.matchType, 'EXACT_UTR_AMOUNT_REPORT');
  assert.equal(await prisma.razorpaySettlementReconLine.count({ where: { mode: 'LIVE', providerEntityId: `pay_${runId}_held_unassigned` } }), 1);

  const report = await getRazorpaySettlementSummaryReport({ from: dateText, to: dateText, mode: 'LIVE' });
  assert.equal(report.totals.settlementBatchCount, 3);
  assert.equal(report.totals.providerGrossPaise, '100000');
  assert.equal(report.totals.refundsPaise, '5000');
  assert.equal(report.totals.feesPaise, '2900');
  assert.equal(report.totals.reportNetPaise, '93100');
  assert.equal(report.totals.processedSettlementAmountPaise, '99100');
  assert.equal(report.totals.pendingSettlementAmountPaise, '5000');
  assert.equal(report.totals.bankCreditedPaise, '93100');
  assert.equal(report.totals.bankVariancePaise, '0');
  assert.equal(report.totals.reportToSettlementVariancePaise, '-6000');
  assert.equal(report.totals.reportToSummaryFeeVariancePaise, '2900');
  assert.equal(report.totals.reportToSummaryTaxVariancePaise, '0');
  assert.equal(report.totals.unmatchedProcessedSettlementCount, 1);
  assert.equal(report.totals.unmatchedProcessedSettlementPaise, '6000');
  assert.equal(report.totals.unmatchedBankCreditCount, 1);
  assert.equal(report.totals.unmatchedBankCreditPaise, '7550');
  assert.equal(report.totals.unsupportedCurrencyLineCount, 1);
  assert.equal(report.totals.onHoldLineCount, 2);
  assert.equal(report.totals.pendingNotOnHoldLineCount, 1);
  assert.equal(report.totals.settledLineCount, 3);
  assert.equal(report.unassignedReport.lineCount, 2);
  assert.equal(report.unassignedReport.onHoldLineCount, 1);
  assert.equal(report.unassignedReport.pendingLineCount, 1);
  const detailedBatch = report.settlements.find((item) => item.providerSettlementId === providerSettlementId);
  assert.equal(detailedBatch.bankMatches.length, 1);
  assert.equal(detailedBatch.reportNetPaise, '93100');
  assert.equal(detailedBatch.settlementFeesPaise, '0');
  assert.equal(detailedBatch.feesPaise, '2900');
  assert.equal(detailedBatch.reportToSummaryFeeVariancePaise, '2900');
  assert.equal(detailedBatch.reportToSummaryTaxVariancePaise, '0');
  const matchedProviderLine = detailedBatch.lines.find((line) => line.providerPaymentId === `pay_${runId}_report`);
  assert.equal(matchedProviderLine.crmPayments[0].id, crmPayment.id);
  assert.equal(matchedProviderLine.crmPayments[0].mode, 'LIVE');
  assert.equal(report.settlements.flatMap((item) => item.lines).some((line) => line.currency === 'USD'), true);
  assert.equal(await prisma.payment.count(), paymentCount);
  assert.equal(await prisma.receipt.count(), receiptCount);
  await assert.rejects(getRazorpaySettlementSummaryReport({ from: '2026-02-30', to: '2026-03-01', mode: 'LIVE' }), (error) => error.code === 'INVALID_SETTLEMENT_REPORT_WINDOW');
  await assert.rejects(getRazorpaySettlementSummaryReport({ from: dateText, to: dateText, mode: 'ALL' }), (error) => error.code === 'INVALID_SETTLEMENT_REPORT_MODE');
});

integrationTest('Razorpay settlement summary importer rejects invalid windows before contacting the provider', async () => {
  let providerCalls = 0;
  const provider = { settlements: { all: async () => { providerCalls += 1; return { items: [] }; } } };
  await assert.rejects(
    importRazorpaySettlementSummaries({ from: 1790000000, to: 1790000000, mode: 'TEST', provider }),
    (error) => error.code === 'INVALID_SETTLEMENT_SUMMARY_WINDOW',
  );
  assert.equal(providerCalls, 0);
});

integrationTest('Settlement recon importer rejects impossible calendar dates before contacting Razorpay', async () => {
  let providerCalls = 0;
  const provider = { settlements: { reports: async () => { providerCalls += 1; return { items: [] }; } } };
  await assert.rejects(
    importRazorpaySettlementRecon({ year: 2026, month: 2, day: 29, mode: 'TEST', provider }),
    (error) => error.code === 'INVALID_SETTLEMENT_RECON_DATE',
  );
  assert.equal(providerCalls, 0);
});

integrationTest('scheduled settlement report sync queues current and prior months once per business day', async () => {
  const previous = {
    enabled: process.env.ENABLE_RAZORPAY_SETTLEMENT_RECONCILIATION,
    months: process.env.RAZORPAY_SETTLEMENT_RECON_LOOKBACK_MONTHS,
    summaryDays: process.env.RAZORPAY_SETTLEMENT_SUMMARY_LOOKBACK_DAYS,
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  };
  process.env.ENABLE_RAZORPAY_SETTLEMENT_RECONCILIATION = 'true';
  process.env.RAZORPAY_SETTLEMENT_RECON_LOOKBACK_MONTHS = '2';
  process.env.RAZORPAY_SETTLEMENT_SUMMARY_LOOKBACK_DAYS = '30';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `settlement-schedule-secret-${runId}`;
  const now = new Date('2098-01-15T04:30:00.000Z');
  const testScheduleFilter = { OR: [
    { scheduleKey: { startsWith: 'RAZORPAY_SETTLEMENTS:TEST:', contains: ':2098-01-15' } },
    { scheduleKey: { startsWith: 'RAZORPAY_SETTLEMENT_SUMMARIES:TEST:', contains: ':2098-01-15' } },
  ] };
  try {
    const first = await enqueueScheduledRazorpaySettlementReconciliation({ now });
    const repeated = await enqueueScheduledRazorpaySettlementReconciliation({ now });
    const monthRuns = first.filter((run) => run.runType === 'RAZORPAY_SETTLEMENTS_TEST');
    const summaryRun = first.find((run) => run.runType === 'RAZORPAY_SETTLEMENT_SUMMARIES_TEST');
    assert.deepEqual(monthRuns.map((run) => run.summary.month), [1, 12]);
    assert.equal(summaryRun.summary.lookbackDays, 30);
    assert.equal(summaryRun.summary.to, Math.floor(now.getTime() / 1000));
    assert.equal(summaryRun.summary.from, summaryRun.summary.to - 30 * 86400);
    assert.deepEqual(repeated.map((run) => run.id), first.map((run) => run.id));
    assert.ok(first.every((run) => run.status === 'QUEUED' && run.summary.scheduled));
    assert.equal(await prisma.reconciliationRun.count({ where: { id: { in: first.map((run) => run.id) } } }), 3);
  } finally {
    await prisma.reconciliationRun.deleteMany({ where: testScheduleFilter });
    if (previous.enabled === undefined) delete process.env.ENABLE_RAZORPAY_SETTLEMENT_RECONCILIATION;
    else process.env.ENABLE_RAZORPAY_SETTLEMENT_RECONCILIATION = previous.enabled;
    if (previous.months === undefined) delete process.env.RAZORPAY_SETTLEMENT_RECON_LOOKBACK_MONTHS;
    else process.env.RAZORPAY_SETTLEMENT_RECON_LOOKBACK_MONTHS = previous.months;
    if (previous.summaryDays === undefined) delete process.env.RAZORPAY_SETTLEMENT_SUMMARY_LOOKBACK_DAYS;
    else process.env.RAZORPAY_SETTLEMENT_SUMMARY_LOOKBACK_DAYS = previous.summaryDays;
    if (previous.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previous.keyId;
    if (previous.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previous.keySecret;
  }
});

integrationTest('Razorpay capture on an invoice without a linked order queues invoice WhatsApp confirmation', async () => {
  const homeCustomer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  assert.ok(homeCustomer, 'the existing approved Home test customer must exist');
  const appointment = await prisma.serviceAppointment.create({
    data: {
      appointmentNumber: `IT-${runId}-RZP-INVOICE-ONLY`,
      customerId: homeCustomer.id,
      serviceName: 'Integration service',
      scheduledAt: new Date(),
      subtotal: 10,
      totalAmount: 10,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `IT-${runId}-RZP-INVOICE-ONLY`,
      customerId: homeCustomer.id,
      serviceAppointmentId: appointment.id,
      sourceType: 'FIELD_SERVICE',
      status: 'OPEN',
      currency: 'INR',
      dueDate: new Date(Date.now() + 86400000),
      subtotal: 10,
      totalAmount: 10,
      balanceDue: 10,
    },
  });
  const prior = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `checkout-secret-${runId}`;
  const previous = {
    adapter: axios.defaults.adapter,
    devMode: process.env.DEV_MODE,
    apiKey: process.env.WHATOMATE_API_KEY,
    sendInDev: process.env.WHATOMATE_SEND_IN_DEV,
    allowedPhones: process.env.WHATOMATE_DEV_ALLOWED_PHONES,
    testContact: process.env.RAZORPAY_TEST_CONTACT_NUMBER,
  };
  const requests = [];
  axios.defaults.adapter = async (config) => {
    requests.push({ config, payload: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  process.env.DEV_MODE = 'false';
  process.env.WHATOMATE_API_KEY = `invoice-only-integration-${runId}`;
  process.env.WHATOMATE_SEND_IN_DEV = 'false';
  process.env.WHATOMATE_DEV_ALLOWED_PHONES = '919930367267';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';
  let providerOrder;
  let providerPayment;
  const provider = {
    orders: {
      create: async (payload) => (providerOrder = { id: `order_invoice_only_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes }),
      fetch: async () => providerOrder,
    },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const checkout = await createInvoiceCheckout({ invoice, shareId: `share-invoice-only-${runId}`, idempotencyKey: `invoice-only-${runId}`, provider });
    providerPayment = {
      id: `pay_${runId}_invoice_only`, order_id: checkout.order.id, amount: 1000,
      currency: 'INR', status: 'captured', method: 'upi', captured: true,
    };
    const result = await settleCapturedPayment({ paymentId: providerPayment.id, providerOrderId: checkout.order.id, provider });
    assert.equal(result.invoice.id, invoice.id);
    assert.equal(result.order, undefined);
    assert.equal(await prisma.outboxEvent.count({
      where: {
        dedupeKey: `payment-received:${result.payment.id}`,
        eventType: 'INVOICE_PAYMENT_RECEIVED', aggregateType: 'invoice', aggregateId: invoice.id,
      },
    }), 1);
    assert.equal(await prisma.auditLog.count({ where: { resource: 'invoice', resourceId: invoice.id, action: 'INVOICE_PAYMENT_WHATSAPP_PENDING' } }), 1);
    const outbox = await prisma.outboxEvent.findUnique({ where: { dedupeKey: `payment-received:${result.payment.id}` } });
    assert.equal(await processOutboxBatch({ limit: 1, onlyEventId: outbox.id }), 1);
    const processed = await prisma.outboxEvent.findUnique({ where: { id: outbox.id } });
    assert.equal(processed.status, 'PROCESSED');
    assert.equal(processed.attempts, 1);
    assert.equal(requests.length, 0, 'Razorpay Test payments must never call Whatomate');
    const skippedAudit = await prisma.auditLog.findFirst({
      where: { resource: 'invoice', resourceId: invoice.id, action: 'INVOICE_PAYMENT_WHATSAPP_SKIPPED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(skippedAudit?.metadata?.outboxEventId, outbox.id);
    assert.equal(skippedAudit?.metadata?.paymentId, result.payment.id);
    assert.equal(skippedAudit?.metadata?.outcome, 'SKIPPED');
  } finally {
    axios.defaults.adapter = previous.adapter;
    if (previous.devMode === undefined) delete process.env.DEV_MODE;
    else process.env.DEV_MODE = previous.devMode;
    if (previous.apiKey === undefined) delete process.env.WHATOMATE_API_KEY;
    else process.env.WHATOMATE_API_KEY = previous.apiKey;
    if (previous.sendInDev === undefined) delete process.env.WHATOMATE_SEND_IN_DEV;
    else process.env.WHATOMATE_SEND_IN_DEV = previous.sendInDev;
    if (previous.allowedPhones === undefined) delete process.env.WHATOMATE_DEV_ALLOWED_PHONES;
    else process.env.WHATOMATE_DEV_ALLOWED_PHONES = previous.allowedPhones;
    if (previous.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previous.testContact;
    if (prior.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prior.keyId;
    if (prior.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prior.keySecret;
  }
});

integrationTest('invoice payment notification with a missing ledger payment is dead-lettered and audited', async () => {
  const invoice = await createInvoice('RZP-WHATSAPP-MISSING-PAYMENT', 10);
  const dedupeKey = `invoice-notification-missing-payment:${runId}`;
  const event = await prisma.outboxEvent.create({
    data: {
      eventType: 'INVOICE_PAYMENT_RECEIVED',
      aggregateType: 'invoice',
      aggregateId: invoice.id,
      payload: { paymentId: `missing-payment-${runId}` },
      dedupeKey,
    },
  });
  try {
    assert.equal(await processOutboxBatch({ limit: 1, onlyEventId: event.id }), 1);
    const failed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    assert.equal(failed.status, 'DEAD');
    assert.equal(failed.attempts, 1);
    assert.match(failed.lastError, /^INVOICE_NOTIFICATION_PAYMENT_NOT_FOUND:/);
    const audit = await prisma.auditLog.findFirst({
      where: { resource: 'invoice', resourceId: invoice.id, action: 'INVOICE_PAYMENT_WHATSAPP_FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(audit?.status, 'FAILURE');
    assert.equal(audit?.metadata?.outboxEventId, event.id);
    assert.equal(audit?.metadata?.paymentId, `missing-payment-${runId}`);
    assert.equal(audit?.metadata?.errorCode, 'INVOICE_NOTIFICATION_PAYMENT_NOT_FOUND');
    assert.equal(audit?.metadata?.retryable, false);
  } finally {
    await prisma.auditLog.deleteMany({ where: { resource: 'invoice', resourceId: invoice.id, action: 'INVOICE_PAYMENT_WHATSAPP_FAILED' } });
    await prisma.outboxEvent.deleteMany({ where: { id: event.id } });
  }
});

integrationTest('order payment notification with a missing ledger payment is dead-lettered and audited', async () => {
  const order = await createOrder('RZP-WHATSAPP-MISSING-PAYMENT');
  const dedupeKey = `order-notification-missing-payment:${runId}`;
  const event = await prisma.outboxEvent.create({
    data: {
      eventType: 'PAYMENT_RECEIVED',
      aggregateType: 'order',
      aggregateId: order.id,
      payload: { paymentId: `missing-order-payment-${runId}` },
      dedupeKey,
    },
  });
  try {
    assert.equal(await processOutboxBatch({ limit: 1, onlyEventId: event.id }), 1);
    const failed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    assert.equal(failed.status, 'DEAD');
    assert.equal(failed.attempts, 1);
    assert.match(failed.lastError, /^PAYMENT_NOTIFICATION_PAYMENT_NOT_FOUND:/);
    const failureStage = await prisma.orderStage.findFirst({
      where: { orderId: order.id, stage: 'WHATSAPP_FAILED', metadata: { path: ['outboxEventId'], equals: event.id } },
    });
    assert.equal(failureStage?.metadata?.errorCode, 'PAYMENT_NOTIFICATION_PAYMENT_NOT_FOUND');
  } finally {
    await prisma.orderStage.deleteMany({ where: { orderId: order.id, metadata: { path: ['outboxEventId'], equals: event.id } } });
    await prisma.outboxEvent.deleteMany({ where: { id: event.id } });
  }
});

integrationTest('order payment notification with a missing order writes a durable failure audit', async () => {
  const dedupeKey = `order-notification-missing-order:${runId}`;
  const event = await prisma.outboxEvent.create({
    data: {
      eventType: 'PAYMENT_RECEIVED',
      aggregateType: 'order',
      aggregateId: `missing-order-${runId}`,
      payload: { paymentId: `missing-order-payment-${runId}` },
      dedupeKey,
    },
  });
  try {
    assert.equal(await processOutboxBatch({ limit: 1, onlyEventId: event.id }), 1);
    const failed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    assert.equal(failed.status, 'DEAD');
    assert.match(failed.lastError, /^PAYMENT_NOTIFICATION_ORDER_NOT_FOUND:/);
    const audit = await prisma.auditLog.findFirst({
      where: { resource: 'order', resourceId: event.aggregateId, action: 'PAYMENT_RECEIVED_WHATSAPP_FAILED' },
    });
    assert.equal(audit?.metadata?.outboxEventId, event.id);
    assert.equal(audit?.metadata?.errorCode, 'PAYMENT_NOTIFICATION_ORDER_NOT_FOUND');
    assert.equal(audit?.metadata?.retryable, false);
  } finally {
    await prisma.auditLog.deleteMany({ where: { resource: 'order', resourceId: event.aggregateId, action: 'PAYMENT_RECEIVED_WHATSAPP_FAILED' } });
    await prisma.outboxEvent.deleteMany({ where: { id: event.id } });
  }
});

integrationTest('captured Test invoice payment queues but suppresses the Whatomate template', async () => {
  const homeCustomer = await prisma.customer.findUnique({ where: { phone: '9930367267' } });
  assert.ok(homeCustomer, 'the existing approved Home test customer must exist');
  const invoice = await createInvoice('RZP-WHATSAPP-TEMPLATE', 10, homeCustomer.id);
  const previousKeys = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `whatsapp-template-${runId}`;
  let providerOrder;
  let providerPayment;
  const provider = {
    orders: {
      create: async (payload) => (providerOrder = {
        id: `order_whatsapp_template_${runId}`,
        amount: payload.amount,
        currency: payload.currency,
        notes: payload.notes,
      }),
      fetch: async () => providerOrder,
    },
    payments: { fetch: async () => providerPayment },
  };
  const previous = {
    adapter: axios.defaults.adapter,
    devMode: process.env.DEV_MODE,
    apiKey: process.env.WHATOMATE_API_KEY,
    sendInDev: process.env.WHATOMATE_SEND_IN_DEV,
    allowedPhones: process.env.WHATOMATE_DEV_ALLOWED_PHONES,
    testContact: process.env.RAZORPAY_TEST_CONTACT_NUMBER,
  };
  const requests = [];
  let unrelatedOutboxId = null;
  axios.defaults.adapter = async (config) => {
    requests.push({ config, payload: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  process.env.DEV_MODE = 'false';
  process.env.WHATOMATE_API_KEY = `integration-only-${runId}`;
  process.env.WHATOMATE_SEND_IN_DEV = 'false';
  process.env.WHATOMATE_DEV_ALLOWED_PHONES = '919930367267';
  process.env.RAZORPAY_TEST_CONTACT_NUMBER = '9930367267';
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-template-${runId}`,
      idempotencyKey: `template-${runId}`,
      provider,
    });
    providerPayment = {
      id: `pay_${runId}_whatsapp_template`,
      order_id: checkout.order.id,
      amount: 1000,
      currency: 'INR',
      status: 'captured',
      captured: true,
      method: 'upi',
    };
    const settlement = await settleCapturedPayment({
      paymentId: providerPayment.id,
      providerOrderId: checkout.order.id,
      provider,
    });
    const payment = settlement.payment;
    const outbox = await prisma.outboxEvent.findUnique({
      where: { dedupeKey: `payment-received:${payment.id}` },
    });
    assert.ok(outbox, 'Razorpay capture must durably enqueue its payment notification');
    assert.equal(outbox.eventType, 'PAYMENT_RECEIVED');
    const unrelated = await prisma.outboxEvent.create({
      data: {
        eventType: 'TEST_OUTBOX_SENTINEL',
        aggregateType: 'test',
        aggregateId: runId,
        payload: {},
        dedupeKey: `test-outbox-sentinel:${runId}`,
      },
    });
    unrelatedOutboxId = unrelated.id;
    assert.equal(await processOutboxBatch({ limit: 25, onlyEventId: outbox.id }), 1);
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: outbox.id } })).status, 'PROCESSED');
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: unrelated.id } })).status, 'PENDING');
    assert.equal(requests.length, 0, 'Razorpay Test payments must never call Whatomate');
    const skippedStage = await prisma.orderStage.findFirst({
      where: { orderId: invoice.orderId, stage: 'WHATSAPP_SKIPPED', metadata: { path: ['outboxEventId'], equals: outbox.id } },
      select: { metadata: true },
    });
    assert.equal(skippedStage?.metadata?.outboxEventId, outbox.id, 'Test suppression must correlate to its queued event');
  } finally {
    if (unrelatedOutboxId) await prisma.outboxEvent.delete({ where: { id: unrelatedOutboxId } }).catch(() => {});
    axios.defaults.adapter = previous.adapter;
    if (previous.devMode === undefined) delete process.env.DEV_MODE;
    else process.env.DEV_MODE = previous.devMode;
    if (previous.apiKey === undefined) delete process.env.WHATOMATE_API_KEY;
    else process.env.WHATOMATE_API_KEY = previous.apiKey;
    if (previous.sendInDev === undefined) delete process.env.WHATOMATE_SEND_IN_DEV;
    else process.env.WHATOMATE_SEND_IN_DEV = previous.sendInDev;
    if (previous.allowedPhones === undefined) delete process.env.WHATOMATE_DEV_ALLOWED_PHONES;
    else process.env.WHATOMATE_DEV_ALLOWED_PHONES = previous.allowedPhones;
    if (previous.testContact === undefined) delete process.env.RAZORPAY_TEST_CONTACT_NUMBER;
    else process.env.RAZORPAY_TEST_CONTACT_NUMBER = previous.testContact;
    if (previousKeys.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeys.keyId;
    if (previousKeys.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeys.keySecret;
  }
});

integrationTest('Razorpay settlement rejects an invalid checkout signature before provider fetch', async () => {
  const invoice = await createInvoice('RZP-SIGNATURE', 10);
  const prior = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `checkout-secret-${runId}`;
  let fetches = 0;
  let providerOrder;
  const provider = {
    orders: {
      fetch: async () => { fetches += 1; return providerOrder; },
      create: async (payload) => (providerOrder = { id: `order_signature_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes }),
    },
    payments: { fetch: async () => { fetches += 1; } },
  };
  try {
    const checkout = await createInvoiceCheckout({ invoice, shareId: `share-sign-${runId}`, idempotencyKey: `sign-${runId}`, provider });
    await assert.rejects(
      settleCapturedPayment({ paymentId: `pay_bad_${runId}`, providerOrderId: checkout.order.id, signature: '0'.repeat(64), provider }),
      (error) => error.code === 'INVALID_CHECKOUT_SIGNATURE'
    );
    assert.equal(fetches, 0);
    assert.equal(await prisma.payment.count({ where: { orderId: invoice.orderId, kind: 'RECEIPT' } }), 0);
  } finally {
    if (prior.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prior.keyId;
    if (prior.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prior.keySecret;
  }
});

integrationTest('documented redirect callback verifies the exact invoice/share binding and settles idempotently', async () => {
  const invoice = await createInvoice('RZP-REDIRECT-CALLBACK', 10);
  const shareId = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const share = await resolvePublicShareToken({ token: shareId, purpose: 'INVOICE_VIEW' });
  const priorEnv = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    crmUrl: process.env.CRM_URL,
    redirectEnabled: process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_redirect_callback';
  process.env.RAZORPAY_KEY_SECRET = `redirect-callback-secret-${runId}`;
  process.env.CRM_URL = 'https://crm.example.test';
  process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED = 'true';
  let providerOrder;
  const paymentId = `pay_redirect_callback_${runId}`;
  const provider = {
    orders: {
      create: async (payload) => (providerOrder = {
        id: `order_redirect_callback_${runId}`,
        amount: payload.amount,
        currency: payload.currency,
        notes: payload.notes,
      }),
      fetch: async () => providerOrder,
    },
    payments: {
      fetch: async () => ({
        id: paymentId,
        order_id: providerOrder.id,
        amount: 1000,
        currency: 'INR',
        status: 'captured',
        captured: true,
        method: 'card',
      }),
    },
  };
  const response = () => ({
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    type(value) { this.contentType = value; return this; },
    send(body) { this.body = body; return this; },
    redirect(code, destination) { this.statusCode = code; this.destination = destination; return this; },
  });
  try {
    const checkout = await createInvoiceCheckout({
      invoice, shareId: share.id, idempotencyKey: `redirect-callback-${runId}`, provider,
    });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${checkout.order.id}|${paymentId}`).digest('hex');
    const invoke = async (callbackSignature) => {
      const res = response();
      await receivePublicRazorpayCallback({
        params: { slug: shareId },
        query: { invoiceId: invoice.id },
        body: { razorpay_order_id: checkout.order.id, razorpay_payment_id: paymentId, razorpay_signature: callbackSignature },
        headers: {},
        id: `redirect-callback-${runId}`,
      }, res, { provider });
      return res;
    };

    const invalid = await invoke('0'.repeat(64));
    assert.equal(invalid.statusCode, 303);
    assert.equal(new URL(invalid.destination).origin, 'https://crm.example.test');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } })).status, 'CREATED');

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const address = server.address();
      const form = new URLSearchParams({
        razorpay_order_id: checkout.order.id,
        razorpay_payment_id: paymentId,
        razorpay_signature: '0'.repeat(64),
      });
      const httpResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/public/invoices/${encodeURIComponent(shareId)}/payment/callback?invoiceId=${encodeURIComponent(invoice.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        redirect: 'manual',
      });
      assert.equal(httpResponse.status, 303);
      assert.equal(new URL(httpResponse.headers.get('location')).origin, 'https://crm.example.test');
      assert.equal(httpResponse.headers.get('cache-control'), 'no-store');
      assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId } }), 0);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    const first = await invoke(signature);
    assert.equal(first.statusCode, 303);
    assert.equal(first.headers['Cache-Control'], 'no-store');
    assert.equal(new URL(first.destination).pathname, `/invoice/${shareId}`);
    assert.equal(new URL(first.destination).searchParams.get('invoiceId'), invoice.id);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
    assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id, status: 'POSTED' } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment-received:${(await prisma.payment.findFirst({ where: { razorpayPaymentId: paymentId } })).id}` } }), 1);

    const replay = await invoke(signature);
    assert.equal(replay.statusCode, 303);
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: paymentId, kind: 'RECEIPT', status: 'CAPTURED' } }), 1);
    assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id, status: 'POSTED' } }), 1);
  } finally {
    if (priorEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorEnv.keyId;
    if (priorEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = priorEnv.keySecret;
    if (priorEnv.crmUrl === undefined) delete process.env.CRM_URL;
    else process.env.CRM_URL = priorEnv.crmUrl;
    if (priorEnv.redirectEnabled === undefined) delete process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED;
    else process.env.RAZORPAY_REDIRECT_CHECKOUT_ENABLED = priorEnv.redirectEnabled;
  }
});

integrationTest('Razorpay settlement rejects provider amount and currency mismatches before ledger posting', async () => {
  const invoice = await createInvoice('RZP-MISMATCH', 10);
  const prior = { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
  process.env.RAZORPAY_KEY_SECRET = `checkout-secret-${runId}`;
  let providerOrder;
  let providerPayment;
  const provider = {
    orders: {
      create: async (payload) => (providerOrder = { id: `order_mismatch_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes }),
      fetch: async () => providerOrder,
    },
    payments: { fetch: async () => providerPayment },
  };
  try {
    const checkout = await createInvoiceCheckout({ invoice, shareId: `share-mismatch-${runId}`, idempotencyKey: `mismatch-${runId}`, provider });
    const base = {
      id: `pay_mismatch_${runId}`, order_id: checkout.order.id, amount: 1000,
      currency: 'INR', status: 'captured', method: 'card', captured: true,
    };
    providerPayment = { ...base, amount: 999 };
    await assert.rejects(
      settleCapturedPayment({ paymentId: base.id, providerOrderId: checkout.order.id, expectedInvoiceId: invoice.id, provider }),
      (error) => error.code === 'PROVIDER_AMOUNT_MISMATCH'
    );
    providerPayment = { ...base, currency: 'USD' };
    await assert.rejects(
      settleCapturedPayment({ paymentId: base.id, providerOrderId: checkout.order.id, expectedInvoiceId: invoice.id, provider }),
      (error) => error.code === 'PROVIDER_CURRENCY_MISMATCH'
    );
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: base.id } }), 0);
    assert.equal(await prisma.razorpayCheckoutAttempt.count({ where: { id: checkout.attempt.id, status: 'CREATED' } }), 1);
  } finally {
    if (prior.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prior.keyId;
    if (prior.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prior.keySecret;
  }
});

integrationTest('Test Mode checkout experiment uses anonymous stable assignment and records only allowlisted events', async () => {
  const invoice = await createInvoice('RZP-AB-ROUTE', 10);
  const shareId = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const shareBefore = await prisma.publicShareToken.findFirst({ where: { resourceId: invoice.id, purpose: 'INVOICE_VIEW' } });
  const accessCountBefore = shareBefore.accessCount;
  const priorEnv = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    enabled: process.env.RAZORPAY_CHECKOUT_AB_ENABLED,
    hashSecret: process.env.RAZORPAY_AB_HASH_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_experiment';
  process.env.RAZORPAY_KEY_SECRET = `integration-experiment-secret-${runId}`;
  process.env.RAZORPAY_CHECKOUT_AB_ENABLED = 'true';
  process.env.RAZORPAY_AB_HASH_SECRET = `integration-experiment-secret-${runId}-hash`;
  const visitorId = crypto.randomUUID();
  const visitorHash = hashVisitorId(visitorId, process.env.RAZORPAY_AB_HASH_SECRET);
  state.experimentVisitorHashes ||= [];
  state.experimentVisitorHashes.push(visitorHash);
  const readExperimentReport = async () => {
    let result;
    await getRazorpayCheckoutExperimentReport({
      query: { from: currentBusinessDateKey(), to: currentBusinessDateKey() },
      id: `test-${runId}`,
    }, {
      status(code) { assert.equal(code, 200); return this; },
      json(body) { result = body; return body; },
    });
    return result;
  };
  const baselineReport = await readExperimentReport();
  const exposureEventId = crypto.randomUUID();
  const experimentApp = express();
  experimentApp.use(express.json());
  experimentApp.use('/api/v1/public', publicRouter);
  const server = experimentApp.listen(0, '127.0.0.1');
  let checkout;
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/api/v1/public/invoices/${encodeURIComponent(shareId)}/payment/experiment`;
    const request = (path, body) => fetch(`${endpoint}/${path}`, {
      method: 'POST',
      headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const assignmentResponse = await request('assign', { visitorId, eventId: exposureEventId });
    assert.equal(assignmentResponse.status, 200);
    const assignment = (await assignmentResponse.json()).data;
    assert.equal(assignment.experimentId, EXPERIMENT_ID);
    assert.ok(['A', 'B'].includes(assignment.variant));
    const duplicateAssignment = await request('assign', { visitorId, eventId: exposureEventId });
    assert.equal(duplicateAssignment.status, 200);
    assert.equal((await duplicateAssignment.json()).data.variant, assignment.variant);

    const clickEventId = crypto.randomUUID();
    const clickResponse = await request('events', { visitorId, eventId: clickEventId, variant: assignment.variant, eventType: 'CTA_CLICK' });
    assert.equal(clickResponse.status, 200);
    assert.equal((await clickResponse.json()).data.duplicate, false);
    const duplicateClick = await request('events', { visitorId, eventId: clickEventId, variant: assignment.variant, eventType: 'CTA_CLICK' });
    assert.equal(duplicateClick.status, 200);
    assert.equal((await duplicateClick.json()).data.duplicate, true);

    let providerOrder;
    let providerPayment;
    const provider = {
      orders: {
        create: async (payload) => (providerOrder = {
          id: `order_ab_${runId}`, amount: payload.amount, currency: payload.currency, notes: payload.notes,
        }),
        fetch: async () => providerOrder,
      },
      payments: { fetch: async () => providerPayment },
    };
    checkout = await createInvoiceCheckout({
      invoice,
      shareId,
      idempotencyKey: `ab-checkout-${runId}`,
      experiment: { id: assignment.experimentId, variant: assignment.variant, visitorHash },
      provider,
    });
    const openEvent = await request('events', {
      visitorId, eventId: crypto.randomUUID(), variant: assignment.variant,
      eventType: 'CHECKOUT_OPEN_REQUESTED', attemptId: checkout.attempt.id,
    });
    const openEventResult = await openEvent.json();
    assert.equal(openEvent.status, 200, JSON.stringify(openEventResult));
    const wrongVariant = await request('events', {
      visitorId, eventId: crypto.randomUUID(), variant: assignment.variant === 'A' ? 'B' : 'A', eventType: 'CTA_CLICK',
    });
    assert.equal(wrongVariant.status, 400);
    const forgedCapture = await request('events', {
      visitorId, eventId: crypto.randomUUID(), variant: assignment.variant, eventType: 'CRM_CAPTURED', attemptId: checkout.attempt.id,
    });
    assert.equal(forgedCapture.status, 400);

    const stored = await prisma.razorpayCheckoutExperimentEvent.findMany({ where: { visitorHash }, orderBy: { createdAt: 'asc' } });
    assert.equal(stored.length, 3);
    assert.deepEqual(stored.map((event) => event.eventType).sort(), ['CHECKOUT_OPEN_REQUESTED', 'CTA_CLICK', 'EXPOSURE']);
    assert.ok(stored.every((event) => event.mode === 'TEST' && event.visitorHash !== visitorId));
    assert.equal(checkout.attempt.experimentId, EXPERIMENT_ID);
    assert.equal(checkout.attempt.experimentVariant, assignment.variant);
    assert.equal(checkout.attempt.experimentVisitorHash, visitorHash);
    const shareAfter = await prisma.publicShareToken.findUnique({ where: { id: shareBefore.id } });
    assert.equal(shareAfter.accessCount, accessCountBefore, 'analytics events must not inflate invoice link view counts');

    const report = await readExperimentReport();
    assert.equal(report.data.mode, 'TEST');
    assert.equal(report.data.variants[assignment.variant].exposedVisitors, baselineReport.data.variants[assignment.variant].exposedVisitors + 1);
    assert.equal(report.data.variants[assignment.variant].ctaVisitors, baselineReport.data.variants[assignment.variant].ctaVisitors + 1);
    assert.equal(report.data.variants[assignment.variant].checkoutRequestVisitors, baselineReport.data.variants[assignment.variant].checkoutRequestVisitors + 1);
    assert.equal(report.data.variants[assignment.variant].serverVerifiedCaptureVisitors, baselineReport.data.variants[assignment.variant].serverVerifiedCaptureVisitors);
    assert.equal(report.data.decision.winnerDeclared, false);
    assert.equal(JSON.stringify(report).includes(visitorId), false, 'aggregated report must not expose raw visitor IDs');
    assert.equal(JSON.stringify(report).includes(visitorHash), false, 'aggregated report must not expose visitor hashes');

    providerPayment = {
      id: `pay_ab_capture_${runId}`, order_id: checkout.order.id, amount: 1000,
      currency: 'INR', status: 'captured', captured: true, method: 'card',
    };
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${checkout.order.id}|${providerPayment.id}`).digest('hex');
    await settleCapturedPayment({
      paymentId: providerPayment.id,
      providerOrderId: checkout.order.id,
      signature,
      expectedInvoiceId: invoice.id,
      provider,
    });
    const capturedReport = await readExperimentReport();
    assert.equal(capturedReport.data.variants[assignment.variant].serverVerifiedCaptureAttempts, baselineReport.data.variants[assignment.variant].serverVerifiedCaptureAttempts + 1);
    assert.equal(capturedReport.data.variants[assignment.variant].serverVerifiedCaptureVisitors, baselineReport.data.variants[assignment.variant].serverVerifiedCaptureVisitors + 1);
    assert.equal(BigInt(capturedReport.data.variants[assignment.variant].capturedPaise), BigInt(baselineReport.data.variants[assignment.variant].capturedPaise) + 1000n);
  } finally {
    await prisma.razorpayCheckoutExperimentEvent.deleteMany({ where: { visitorHash } });
    await new Promise((resolve) => server.close(resolve));
    if (priorEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorEnv.keyId;
    if (priorEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = priorEnv.keySecret;
    if (priorEnv.enabled === undefined) delete process.env.RAZORPAY_CHECKOUT_AB_ENABLED;
    else process.env.RAZORPAY_CHECKOUT_AB_ENABLED = priorEnv.enabled;
    if (priorEnv.hashSecret === undefined) delete process.env.RAZORPAY_AB_HASH_SECRET;
    else process.env.RAZORPAY_AB_HASH_SECRET = priorEnv.hashSecret;
  }
});

integrationTest('public Razorpay client-event audit accepts allowlisted observations without logging share tokens or client payloads', async () => {
  const invoice = await createInvoice('RZP-CLIENT-EVENT', 10);
  const shareId = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
  const priorKeyId = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_client_events';
  const checkout = await createInvoiceCheckout({
    invoice, shareId, idempotencyKey: `client-event-${runId}`,
    provider: { orders: { create: async (payload) => ({ id: `order_client_${runId}`, amount: payload.amount, currency: payload.currency }) } },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/public', publicRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/api/v1/public/invoices/${encodeURIComponent(shareId)}/payment/client-events`;
    const clientEventId = crypto.randomUUID();
    const response = await fetch(endpoint, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'PAY_BUTTON_CLICKED', clientEventId, phone: '9930367267', arbitraryError: 'must-not-be-stored' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { accepted: true });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'RAZORPAY_CHECKOUT_CLIENT_PAY_BUTTON_CLICKED', resourceId: invoice.id } });
    assert.ok(audit);
    assert.equal(audit.route, 'public.invoice.payment.client-event');
    assert.equal(audit.metadata.source, 'BROWSER_REPORTED');
    assert.equal(audit.metadata.authoritative, false);
    assert.equal(audit.metadata.clientEventId, clientEventId);
    assert.equal(JSON.stringify(audit).includes(shareId), false);
    assert.equal(JSON.stringify(audit).includes('must-not-be-stored'), false);

    for (const eventType of [
      'CHECKOUT_SCRIPT_LOAD_STARTED', 'CHECKOUT_SCRIPT_LOAD_SUCCEEDED', 'CHECKOUT_SCRIPT_LOAD_FAILED',
      'REDIRECT_CHECKOUT_SELECTED', 'RESUME_CHECKOUT_CLICKED', 'CREATE_ORDER_REQUESTED', 'CREATE_ORDER_FAILED',
      'CREATE_ORDER_SUCCEEDED', 'VERIFY_REQUESTED', 'VERIFY_PENDING', 'VERIFY_SUCCEEDED', 'VERIFY_FAILED',
      'PAYMENT_FAILED_CALLBACK', 'CLIENT_ERROR', 'STATUS_CHECK_REQUESTED', 'STATUS_CHECK_CAPTURED',
      'STATUS_CHECK_FAILED', 'STATUS_CHECK_PENDING', 'STATUS_CHECK_REVIEW',
    ]) {
      const telemetry = await fetch(endpoint, {
        method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
        body: JSON.stringify({ eventType, clientEventId: crypto.randomUUID() }),
      });
      assert.equal(telemetry.status, 200, `${eventType} emitted by the invoice UI should be accepted`);
      assert.deepEqual((await telemetry.json()).data, { accepted: true });
    }

    const attemptEvent = await fetch(endpoint, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'CHECKOUT_OPEN_REQUESTED', clientEventId: crypto.randomUUID(), attemptId: checkout.attempt.id }),
    });
    assert.equal(attemptEvent.status, 200);
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'RAZORPAY_CHECKOUT_CLIENT_CHECKOUT_OPEN_REQUESTED', resourceId: checkout.attempt.id } }));

    for (const eventType of ['STATUS_RECOVERY_CAPTURED', 'STATUS_RECOVERY_FAILED', 'STATUS_RECOVERY_PENDING', 'STATUS_RECOVERY_REVIEW']) {
      const recoveryEvent = await fetch(endpoint, {
        method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
        body: JSON.stringify({ eventType, clientEventId: crypto.randomUUID(), attemptId: checkout.attempt.id }),
      });
      assert.equal(recoveryEvent.status, 200, `${eventType} should be accepted`);
      assert.ok(await prisma.auditLog.findFirst({
        where: { action: `RAZORPAY_CHECKOUT_CLIENT_${eventType}`, resourceId: checkout.attempt.id },
      }));
    }

    const otherInvoice = await createInvoice('RZP-CLIENT-EVENT-OTHER', 10);
    const otherCheckout = await createInvoiceCheckout({
      invoice: otherInvoice, shareId: `unrelated-share-${runId}`, idempotencyKey: `client-event-other-${runId}`,
      provider: { orders: { create: async (payload) => ({ id: `order_client_other_${runId}`, amount: payload.amount, currency: payload.currency }) } },
    });
    const mismatchedAttempt = await fetch(endpoint, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'CHECKOUT_OPEN_REQUESTED', clientEventId: crypto.randomUUID(), attemptId: otherCheckout.attempt.id }),
    });
    assert.equal(mismatchedAttempt.status, 400);

    const invalid = await fetch(endpoint, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'CRM_CAPTURED', clientEventId: crypto.randomUUID() }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await prisma.activityLog.deleteMany({ where: { resourceId: { in: [invoice.id, checkout.attempt.id] }, action: { startsWith: 'RAZORPAY_CHECKOUT_CLIENT_' } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: [invoice.id, checkout.attempt.id] }, action: { startsWith: 'RAZORPAY_CHECKOUT_CLIENT_' } } });
    await new Promise((resolve) => server.close(resolve));
    if (priorKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorKeyId;
  }
});
