const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { writeAuditEvent } = require('../src/services/activity.service');
const { CommercialRuleError, resolveOrderPricing } = require('../src/services/pricing.service');
const { PaymentRuleError, recordInvoiceSettlement, recordOrderRefund, recordOrderSettlement } = require('../src/services/payment.service');
const { syncOrderGarmentUnits } = require('../src/services/garment-unit.service');
const { nextDocumentNumber } = require('../src/services/document-number.service');
const { createInvoiceCheckout, markAttemptFailed, settleCapturedPayment } = require('../src/services/razorpay-invoice-checkout.service');
const { createPublicShareToken, resolvePublicShareToken } = require('../src/services/publicShare.service');
const { createRazorpayRefund, reconcileRazorpayRefundAttempt, reconcileRazorpayRefundWebhook, serializeRefundAttempt } = require('../src/services/razorpay-refund.service');
const crypto = require('node:crypto');
const { handleRazorpayWebhook } = require('../src/controllers/webhooks.controller');
const { listRazorpayWebhookEvents, listRazorpayCheckoutAttempts, getRazorpayCheckoutMethodOutcomes, getRazorpayCheckoutExperimentReport, replayRazorpayWebhookEvent } = require('../src/controllers/razorpayWebhookOps.controller');
const { currentBusinessDateKey } = require('../src/utils/business-time');
const { listRazorpaySettlementLines } = require('../src/controllers/reconciliation.controller');
const { processWebhook, processRazorpayWebhookBatch } = require('../src/services/razorpay-webhook-worker.service');
const { reconcileRazorpayDispute } = require('../src/services/razorpay-dispute.service');
const { enqueueRazorpayPaymentReconciliation, enqueueRazorpaySettlementReconciliation, enqueueRazorpaySettlementSummaryReconciliation, enqueueScheduledRazorpaySettlementReconciliation, processQueuedRazorpayPaymentReconciliation, runRazorpayPaymentReconciliation } = require('../src/services/razorpay-payment-reconciliation.service');
const { importRazorpaySettlementRecon } = require('../src/services/razorpay-settlement-recon.service');
const { importRazorpaySettlementSummaries } = require('../src/services/razorpay-settlement-summary.service');
const { importBankStatementCsv, parseBankStatementCsv, previewBankStatementCsv } = require('../src/services/bank-statement-import.service');
const { confirmBankSettlementMatch, getBankSettlementCandidates, reverseBankSettlementMatch } = require('../src/services/bank-settlement-match.service');
const { getRazorpaySettlementSummaryReport } = require('../src/services/razorpay-settlement-summary-report.service');
const { idempotent } = require('../src/middleware/idempotency');
const { generateStaffToken } = require('../src/services/jwt.service');
const { buildStaffSessionData, createSessionId } = require('../src/services/sessionToken.service');
const { getPublicRazorpayCheckoutStatus } = require('../src/controllers/public.controller');
const { EXPERIMENT_ID, assignVariant, hashVisitorId } = require('../src/utils/razorpay-checkout-experiment');
const { app } = require('../src/index');
const express = require('express');
const publicRouter = require('../src/routes/public.routes');
const axios = require('axios');
const { handleOutboxEvent } = require('../src/services/outbox.service');

// Database integration tests use deterministic Test Mode semantics even when
// the runner has no local .env file. All provider calls in this suite are stubbed.
if (!process.env.RAZORPAY_KEY_ID) process.env.RAZORPAY_KEY_ID = 'rzp_test_integration_suite';

const integrationTest = test;
const runId = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bankImportLabel = 'Integration bank test';
const state = {};

before(async () => {
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
    data: { name: `Integration Customer ${runId}`, phone: `8${String(Date.now() + 1).slice(-9)}` },
  });
  state.service = await prisma.service.create({
    data: { name: `Integration Service ${runId}`, category: 'INTEGRATION', basePrice: 100, isActive: true },
  });
});

after(async () => {
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
  if (orderIds.length) {
    await prisma.razorpayRefundAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
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
    await prisma.publicShareToken.deleteMany({ where: { resourceId: { in: testInvoiceIds } } });
    await prisma.receiptAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.refundAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.financialAdjustment.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.invoiceRevision.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: testInvoiceIds } } });
  }
  await prisma.razorpayCheckoutAttempt.deleteMany({ where: { invoiceNumber: { startsWith: `IT-${runId}` } } });
  if (state.experimentVisitorHashes?.length) {
    await prisma.razorpayCheckoutExperimentEvent.deleteMany({ where: { visitorHash: { in: state.experimentVisitorHashes } } });
  }
  await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId: { startsWith: `IT-${runId}` } } });
  await prisma.reconciliationRun.deleteMany({ where: { scheduleKey: { startsWith: `IT-${runId}` } } });
  await prisma.idempotencyRecord.deleteMany({ where: { scope: 'razorpay.webhook.replay', key: { contains: runId } } });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `IT-${runId}` } } });
  await prisma.serviceAppointment.deleteMany({ where: { appointmentNumber: { startsWith: `IT-${runId}` } } });
  await prisma.payment.deleteMany({ where: { razorpayPaymentId: { startsWith: `pay_${runId}_` } } });
  await prisma.service.deleteMany({ where: { id: state.service?.id } });
  await prisma.customer.deleteMany({ where: { id: state.customer?.id } });
  await prisma.staff.deleteMany({ where: { id: state.staff?.id } });
  await prisma.$disconnect();
});

const createOrder = async (suffix, totalAmount = 100) => prisma.order.create({
  data: {
    orderNumber: `IT-${runId}-${suffix}`,
    customerId: state.customer.id,
    documentType: 'ORDER',
    source: 'COUNTER',
    status: 'PICKED_UP',
    subtotal: totalAmount,
    totalAmount,
    assignedToId: state.staff.id,
  },
});

const createInvoice = async (suffix, balanceDue = 100) => {
  const order = await createOrder(`INVOICE-${suffix}`, balanceDue);
  return prisma.invoice.create({
    data: {
    invoiceNumber: `IT-${runId}-${suffix}`,
    customerId: state.customer.id,
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

integrationTest('Razorpay checkout reuses one payable provider order per invoice', async () => {
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

integrationTest('a failed Razorpay payment retry reuses the original order to contain late authorization', async () => {
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
    assert.equal(next.attempt.id, first.attempt.id);
    assert.equal(next.order.id, first.order.id);
    assert.equal(next.attempt.status, 'CREATED');
    assert.equal(providerOrders.length, 1);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: first.attempt.id, action: 'RAZORPAY_CHECKOUT_REOPENED' } }), 1);
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
  const provider = {
    orders: {
      create: async (payload) => {
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
  };
  try {
    const token = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    const share = await resolvePublicShareToken({ token, purpose: 'INVOICE_VIEW' });
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: share.id,
      idempotencyKey: `resume-status-${runId}`,
      provider,
    });
    const makeRequest = async () => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await getPublicRazorpayCheckoutStatus({
        params: { slug: token },
        query: { attemptId: checkout.attempt.id },
        headers: {},
        id: `request-${runId}`,
      }, res, undefined, { getRazorpay: () => provider });
      return res;
    };

    const resumable = await makeRequest();
    assert.equal(resumable.statusCode, 200);
    assert.equal(resumable.body.data.status, 'CREATED');
    assert.equal(resumable.body.data.canResumeCheckout, true);
    assert.equal(resumable.body.data.paymentId, null);

    providerOrder = { ...providerOrder, status: 'attempted', attempts: 1 };
    providerPayments = { items: [{ id: `pay_authorized_${runId}`, status: 'authorized' }] };
    const blocked = await makeRequest();
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.body.data.canResumeCheckout, false);
    assert.equal((await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: checkout.attempt.id } })).status, 'CREATED');
    assert.equal(await prisma.payment.count({ where: { razorpayPaymentId: `pay_authorized_${runId}` } }), 0);
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
        contact: '+919999999999',
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
    assert.equal(JSON.stringify(event.payload).includes('9999999999'), false);

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
  const event = await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      event: 'payment.authorized',
      paymentId: `pay_worker_retry_${runId}`,
      orderId: `order_worker_retry_${runId}`,
      payload: {},
      payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
      status: 'RECEIVED',
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });
  let deliveries = 0;
  const providerRef = runId.replace(/[^A-Za-z0-9]/g, '');
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
          card: { number: '4111111111111111' },
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
  assert.equal(retryAudit.metadata.providerError.payment_id, `pay_retry${providerRef}`);
  assert.equal(retryAudit.metadata.providerError.order_id, `order_retry${providerRef}`);
  assert.equal(retryAudit.metadata.providerError.description.includes('9930367267'), false);
  assert.equal(JSON.stringify(retryAudit.metadata.providerError).includes('654321'), false);
  assert.equal(JSON.stringify(retryAudit.metadata.providerError).includes('4111111111111111'), false);

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
      payload: { customerPhone: '9930367267', card: { number: '4111111111111111' } },
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
  assert.equal(listed.providerErrorReason, 'payment_failed');
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
  assert.equal(failedCard.count, 1);
  assert.equal(failedCard.amountPaise, '12345');
  assert.equal(capturedUpi.count, 1);
  assert.equal(capturedUpi.amountPaise, '2500');
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
      { route: 'razorpay-checkout-attempts?limit=10', method: 'GET' },
      { route: 'razorpay-checkout-method-outcomes?from=2026-09-01&to=2026-09-24', method: 'GET' },
      { route: 'razorpay-payments/run', method: 'POST' },
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
      expectedShareId: shareId,
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
    mode: 'LIVE', providerSettlementId, status: 'processed', amountPaise: 93100n, feesPaise: 2900n, taxPaise: 0n,
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
  const appointment = await prisma.serviceAppointment.create({
    data: {
      appointmentNumber: `IT-${runId}-RZP-INVOICE-ONLY`,
      customerId: state.customer.id,
      serviceName: 'Integration service',
      scheduledAt: new Date(),
      subtotal: 10,
      totalAmount: 10,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `IT-${runId}-RZP-INVOICE-ONLY`,
      customerId: state.customer.id,
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
      id: `pay_invoice_only_${runId}`, order_id: checkout.order.id, amount: 1000,
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
  } finally {
    if (prior.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prior.keyId;
    if (prior.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prior.keySecret;
  }
});

integrationTest('captured invoice payment sends only the established payment-received Whatomate template', async () => {
  const invoice = await createInvoice('RZP-WHATSAPP-TEMPLATE', 10);
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
  };
  const requests = [];
  axios.defaults.adapter = async (config) => {
    requests.push({ config, payload: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  process.env.DEV_MODE = 'false';
  process.env.WHATOMATE_API_KEY = `integration-only-${runId}`;
  process.env.WHATOMATE_SEND_IN_DEV = 'false';
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      shareId: `share-template-${runId}`,
      idempotencyKey: `template-${runId}`,
      provider,
    });
    providerPayment = {
      id: `pay_whatsapp_template_${runId}`,
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
    await handleOutboxEvent(outbox);
    assert.equal(requests.length, 1, 'one captured invoice event must result in exactly one template request');
    assert.equal(requests[0].payload.template_name, 'hangers_crm_payment_received');
    assert.deepEqual(Object.keys(requests[0].payload.template_params).sort(), ['1', '2', '3', '4', '5']);
    assert.equal(requests[0].payload.template_params['2'], '10');
    assert.equal(requests[0].payload.template_params['3'], settlement.order.orderNumber);
    assert.equal(requests[0].payload.template_params['4'], 'UPI');
    assert.ok(requests[0].payload.button_params['0'], 'the approved template retains the invoice link button');
    assert.equal(await prisma.orderStage.count({
      where: { orderId: invoice.orderId, stage: 'WHATSAPP_SENT', metadata: { path: ['templateName'], equals: 'hangers_crm_payment_received' } },
    }), 1);
  } finally {
    axios.defaults.adapter = previous.adapter;
    if (previous.devMode === undefined) delete process.env.DEV_MODE;
    else process.env.DEV_MODE = previous.devMode;
    if (previous.apiKey === undefined) delete process.env.WHATOMATE_API_KEY;
    else process.env.WHATOMATE_API_KEY = previous.apiKey;
    if (previous.sendInDev === undefined) delete process.env.WHATOMATE_SEND_IN_DEV;
    else process.env.WHATOMATE_SEND_IN_DEV = previous.sendInDev;
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
    enabled: process.env.RAZORPAY_CHECKOUT_AB_ENABLED,
    hashSecret: process.env.RAZORPAY_AB_HASH_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_experiment';
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

    const provider = { orders: { create: async (payload) => ({ id: `order_ab_${runId}`, amount: payload.amount, currency: payload.currency }) } };
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
  } finally {
    await prisma.razorpayCheckoutExperimentEvent.deleteMany({ where: { visitorHash } });
    await new Promise((resolve) => server.close(resolve));
    if (priorEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = priorEnv.keyId;
    if (priorEnv.enabled === undefined) delete process.env.RAZORPAY_CHECKOUT_AB_ENABLED;
    else process.env.RAZORPAY_CHECKOUT_AB_ENABLED = priorEnv.enabled;
    if (priorEnv.hashSecret === undefined) delete process.env.RAZORPAY_AB_HASH_SECRET;
    else process.env.RAZORPAY_AB_HASH_SECRET = priorEnv.hashSecret;
  }
});
