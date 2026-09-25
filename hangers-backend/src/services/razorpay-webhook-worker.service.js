const prisma = require('../config/database');
const { log } = require('./activity.service');
const { auditAttemptTransition, getMode, getRazorpay, settleCapturedPayment } = require('./razorpay-invoice-checkout.service');
const { reconcileRazorpayRefundWebhook } = require('./razorpay-refund.service');
const { reconcileRazorpayDispute } = require('./razorpay-dispute.service');
const { razorpayErrorSummary } = require('../utils/redact');
const { getSafeRazorpayPaymentDiagnostics } = require('../utils/razorpay-payment-method');

const MAX_ATTEMPTS = 12;
const DEFAULT_WORKER_CONCURRENCY = 4;
const MAX_WORKER_CONCURRENCY = 20;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_MS = 60 * 1000;
const safeErrorCode = (error) => String(razorpayErrorSummary(error).code || 'PROCESSING_ERROR').slice(0, 80);
const retryDelayMs = (attempt) => Math.min(15 * 60 * 1000, 1000 * (2 ** Math.min(attempt, 10))) + Math.floor(Math.random() * 1000);

const claimWebhookBatch = async (limit, onlyEventId = null, leaseMs = DEFAULT_LEASE_MS, onlyEventIds = null) => prisma.$transaction((tx) => tx.$queryRaw`
  WITH candidates AS (
    SELECT "id"
    FROM "razorpay_webhook_events"
    WHERE (
      ("status" IN ('RECEIVED', 'RETRY') AND "nextAttemptAt" <= NOW())
      OR ("status" = 'PROCESSING' AND "lockedAt" < NOW() - (${leaseMs} * INTERVAL '1 millisecond'))
    )
    AND (${onlyEventId}::text IS NULL OR "id" = ${onlyEventId})
    AND (${onlyEventIds}::text[] IS NULL OR "id" = ANY(${onlyEventIds}::text[]))
    ORDER BY "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  )
  UPDATE "razorpay_webhook_events" AS events
  SET "status" = 'PROCESSING', "lockedAt" = NOW(), "attempts" = events."attempts" + 1, "updatedAt" = NOW()
  FROM candidates
  WHERE events."id" = candidates."id"
    RETURNING events."id", events."eventId", events."event", events."mode", events."paymentId", events."orderId", events."refundId", events."refundAttemptId", events."settlementId", events."disputeId", events."payload", events."attempts"
`);

const markWebhook = (event, data) => prisma.razorpayWebhookEvent.updateMany({
  where: { id: event.id, status: 'PROCESSING', attempts: event.attempts },
  data: { lockedAt: null, ...data },
});

const setAttemptState = async (orderId, state, paymentId, reasonCode = null, diagnostics = {}, providerPayment = null) => {
  if (!orderId) throw Object.assign(new Error('Payment event has no Razorpay order reference'), { code: 'MISSING_ORDER_REFERENCE', permanent: true });
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: orderId } });
    if (!attempt) throw Object.assign(new Error('Payment event does not match a CRM checkout attempt'), { code: 'CHECKOUT_ATTEMPT_NOT_FOUND', permanent: true });
    if (['CAPTURED', 'REVIEW'].includes(attempt.status)) return attempt;
    if (providerPayment) {
      const amount = Number(providerPayment.amount);
      if (!Number.isSafeInteger(amount) || amount < 1 || BigInt(amount) !== attempt.amountPaise) {
        throw Object.assign(new Error('Fetched Razorpay payment amount does not match the checkout attempt'), { code: 'PROVIDER_AMOUNT_MISMATCH', permanent: true });
      }
      if (String(providerPayment.currency || '').toUpperCase() !== String(attempt.currency || '').toUpperCase()) {
        throw Object.assign(new Error('Fetched Razorpay payment currency does not match the checkout attempt'), { code: 'PROVIDER_CURRENCY_MISMATCH', permanent: true });
      }
    }
    if (state === 'FAILED' && ['FAILED', 'CREATE_FAILED'].includes(attempt.status)) return attempt;
    const updated = await tx.razorpayCheckoutAttempt.update({
      where: { id: attempt.id },
      data: {
        status: state,
        ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
        failureCode: reasonCode,
        providerMethod: diagnostics.providerMethod || null,
        providerMethodDetail: diagnostics.providerMethodDetail || null,
        providerErrorCode: diagnostics.providerErrorCode || null,
        providerErrorSource: diagnostics.providerErrorSource || null,
        providerErrorStep: diagnostics.providerErrorStep || null,
        providerErrorReason: diagnostics.providerErrorReason || null,
        ...(state === 'FAILED' ? { completedAt: new Date() } : {}),
      },
    });
    await auditAttemptTransition(tx, updated, state === 'FAILED' ? 'RAZORPAY_PAYMENT_PROVIDER_FAILED' : 'RAZORPAY_PAYMENT_PROVIDER_AUTHORIZED', `Razorpay webhook changed checkout attempt state to ${state}`, {
      razorpayOrderId: orderId, razorpayPaymentId: paymentId || null,
      priorState: attempt.status, nextState: state, reasonCode,
      providerMethod: diagnostics.providerMethod || null,
      providerMethodDetail: diagnostics.providerMethodDetail || null,
      providerErrorCode: diagnostics.providerErrorCode || null,
      providerErrorSource: diagnostics.providerErrorSource || null,
      providerErrorStep: diagnostics.providerErrorStep || null,
      providerErrorReason: diagnostics.providerErrorReason || null,
    }, state === 'FAILED' ? 'FAILURE' : 'SUCCESS');
    return updated;
  });
};

const diagnosticsFromPayment = (payment) => {
  const [network, type] = String(payment?.card ? `${payment.card.network || ''}:${payment.card.type || ''}` : '').split(':');
  return getSafeRazorpayPaymentDiagnostics({
    method: payment?.method,
    card: { network, type },
    error_code: payment?.error_code,
    error_source: payment?.error_source,
    error_step: payment?.error_step,
    error_reason: payment?.error_reason,
  });
};

const reconcilePaymentState = async (event, provider) => {
  if (!event.paymentId || !event.orderId) {
    throw Object.assign(new Error('Payment event is missing provider references'), { code: 'MISSING_PROVIDER_REFERENCE', permanent: true });
  }
  const payment = await provider.payments.fetch(event.paymentId);
  if (!payment || payment.id !== event.paymentId || payment.order_id !== event.orderId) {
    throw Object.assign(new Error('Fetched payment does not match the signed webhook references'), { code: 'PROVIDER_PAYMENT_REFERENCE_MISMATCH', permanent: true });
  }
  const status = String(payment.status || '').toLowerCase();
  if (status === 'captured') {
    const result = await settleCapturedPayment({ paymentId: payment.id, providerOrderId: event.orderId, source: 'WEBHOOK_PAYMENT_STATE_RECONCILIATION', provider });
    if (result.pending) throw Object.assign(new Error('Razorpay has not yet exposed a captured payment state'), { code: 'PROVIDER_STATE_PENDING' });
    return { state: 'PROCESSED', paymentId: payment.id, invoiceId: result.attempt?.invoiceId || null };
  }
  if (status === 'authorized') {
    await setAttemptState(event.orderId, 'AUTHORIZED', payment.id, null, diagnosticsFromPayment(payment), payment);
    return { state: 'PROCESSED', paymentId: payment.id, providerStatus: status };
  }
  if (status === 'failed') {
    const attempt = await setAttemptState(event.orderId, 'FAILED', payment.id, 'PAYMENT_FAILED', diagnosticsFromPayment(payment), payment);
    return { state: 'PROCESSED', paymentId: payment.id, attemptId: attempt?.id || null, providerStatus: status };
  }
  if (['created', 'pending'].includes(status)) {
    throw Object.assign(new Error('Razorpay payment has not reached a reconciliable state'), { code: 'PROVIDER_STATE_PENDING' });
  }
  throw Object.assign(new Error('Razorpay payment state requires Finance review'), { code: 'PROVIDER_PAYMENT_STATE_REVIEW', permanent: true });
};

const processWebhook = async (event, { refundReconciler = reconcileRazorpayRefundWebhook, disputeReconciler = reconcileRazorpayDispute, razorpayProvider = null } = {}) => {
  if (event.mode && !process.env.RAZORPAY_KEY_ID) {
    throw Object.assign(new Error('Razorpay API credentials are not configured for webhook processing'), { code: 'RAZORPAY_NOT_CONFIGURED' });
  }
  if (event.mode && event.mode !== getMode()) {
    throw Object.assign(new Error('Webhook mode does not match the active Razorpay API credentials'), { code: 'RAZORPAY_MODE_MISMATCH', permanent: true });
  }
  const type = String(event.event || '').toLowerCase();
  if (type === 'payment.captured') {
    if (!event.paymentId || !event.orderId) throw Object.assign(new Error('Captured event is missing provider references'), { code: 'MISSING_PROVIDER_REFERENCE', permanent: true });
    const result = await settleCapturedPayment({ paymentId: event.paymentId, providerOrderId: event.orderId, source: 'WEBHOOK', provider: razorpayProvider || undefined });
    if (result.pending) throw Object.assign(new Error('Razorpay has not yet exposed a captured payment state'), { code: 'PROVIDER_STATE_PENDING' });
    return { state: 'PROCESSED', paymentId: event.paymentId, invoiceId: result.attempt?.invoiceId || null };
  }

  if (type === 'payment.authorized') {
    return reconcilePaymentState(event, razorpayProvider || getRazorpay());
  }

  if (type === 'payment.failed') {
    return reconcilePaymentState(event, razorpayProvider || getRazorpay());
  }

  if (type === 'order.paid') {
    if (!event.orderId) throw Object.assign(new Error('Paid order event has no order reference'), { code: 'MISSING_ORDER_REFERENCE', permanent: true });
    const provider = razorpayProvider || getRazorpay();
    const response = await provider.orders.fetchPayments(event.orderId);
    const captured = (response?.items || []).filter((payment) => String(payment.status).toLowerCase() === 'captured');
    if (!captured.length) throw Object.assign(new Error('No captured payment is visible for the paid order yet'), { code: 'ORDER_PAYMENT_PENDING' });
    const results = [];
    for (const payment of captured) {
      results.push(await settleCapturedPayment({ paymentId: payment.id, providerOrderId: event.orderId, source: 'ORDER_PAID_WEBHOOK', provider }));
    }
    return { state: 'PROCESSED', paymentId: captured.map((payment) => payment.id).join(','), count: captured.length };
  }

  if (['refund.created', 'refund.processed', 'refund.failed', 'refund.speed_changed'].includes(type)) {
    const result = await refundReconciler({
      refundId: event.refundId,
      refundAttemptId: event.refundAttemptId,
      eventId: event.eventId,
      eventType: type,
    });
    return { state: 'PROCESSED', paymentId: result.refundId, count: 1, providerStatus: result.providerStatus };
  }

  if (type.startsWith('payment.dispute.')) {
    const result = await disputeReconciler({
      disputeId: event.disputeId,
      eventId: event.eventId,
      eventType: type,
      provider: razorpayProvider || undefined,
    });
    return { ...result, state: result.state || 'PROCESSED' };
  }

  // Preserve events outside this first payment-ledger slice for a finance operator.
  // They must not be silently treated as a successful ledger update.
  throw Object.assign(new Error('This signed Razorpay event type is not yet handled by the CRM ledger'), { code: 'EVENT_REQUIRES_FINANCE_HANDLING', permanent: true });
};

const auditOutcome = (event, action, status, metadata = {}) => log({
  actorType: 'system',
  actorName: 'Razorpay webhook worker',
  action,
  status,
  resource: 'razorpay_webhook',
  resourceId: event.eventId,
  description: `Razorpay ${event.event} event ${status.toLowerCase()}`,
  metadata: { provider: 'RAZORPAY', eventId: event.eventId, webhookRecordId: event.id, ...metadata },
});

const renewWebhookLease = (event) => prisma.$executeRaw`
  UPDATE "razorpay_webhook_events"
  SET "lockedAt" = NOW()
  WHERE "id" = ${event.id} AND "status" = 'PROCESSING' AND "attempts" = ${event.attempts}
`;

const processRazorpayWebhookBatch = async ({
  limit = 20,
  concurrency = DEFAULT_WORKER_CONCURRENCY,
  processor = processWebhook,
  onlyEventId = null,
  onlyEventIds = null,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  leaseMs = DEFAULT_LEASE_MS,
} = {}) => {
  const events = await claimWebhookBatch(limit, onlyEventId, leaseMs, Array.isArray(onlyEventIds) ? onlyEventIds.slice(0, 20) : null);
  const requestedConcurrency = Number(concurrency);
  const workerCount = Math.min(
    events.length,
    MAX_WORKER_CONCURRENCY,
    Number.isFinite(requestedConcurrency) ? Math.max(1, Math.floor(requestedConcurrency)) : DEFAULT_WORKER_CONCURRENCY,
  );
  const active = new Map(events.map((event) => [event.id, event]));
  let heartbeatInFlight = null;
  const heartbeat = () => {
    if (heartbeatInFlight || active.size === 0) return;
    heartbeatInFlight = Promise.all([...active.values()].map(async (event) => {
      const updated = await renewWebhookLease(event);
      if (updated !== 1) active.delete(event.id);
    })).catch((error) => {
      console.error('[razorpay-webhooks] lease renewal failed:', error?.code || 'DB_ERROR');
    }).finally(() => { heartbeatInFlight = null; });
  };
  const timer = events.length ? setInterval(heartbeat, Math.max(1, heartbeatMs)) : null;
  timer?.unref?.();
  let nextEventIndex = 0;
  const processClaimedEvent = async (event) => {
    if (!active.has(event.id)) return;
    try {
      const result = await processor(event);
      const marked = await markWebhook(event, { status: result.state, processedAt: new Date(), error: null });
      active.delete(event.id);
      if (marked.count !== 1) return;
      const requiresReview = result.state === 'REVIEW';
      await auditOutcome(event, requiresReview ? 'RAZORPAY_WEBHOOK_REVIEW_REQUIRED' : 'RAZORPAY_WEBHOOK_PROCESSED', requiresReview ? 'FAILURE' : 'SUCCESS', {
        paymentId: result.paymentId || null,
        disputeId: result.disputeId || null,
        providerStatus: result.providerStatus || null,
        linkStatus: result.linkStatus || null,
        count: result.count || 1,
      }).catch((error) => console.error('[razorpay-webhooks] outcome audit failed:', error?.code || 'AUDIT_ERROR'));
    } catch (error) {
      const code = safeErrorCode(error);
      const permanent = error?.permanent || event.attempts >= MAX_ATTEMPTS;
      const status = permanent ? 'REVIEW' : 'RETRY';
      const retryAt = permanent ? null : new Date(Date.now() + retryDelayMs(event.attempts));
      const marked = await markWebhook(event, {
        status,
        nextAttemptAt: retryAt || new Date('9999-12-31T23:59:59.999Z'),
        error: code,
      }).catch((markError) => console.error('[razorpay-webhooks] could not persist event outcome:', markError?.code || 'DB_ERROR'));
      active.delete(event.id);
      if (marked?.count !== 1) return;
      await auditOutcome(event, permanent ? 'RAZORPAY_WEBHOOK_REVIEW_REQUIRED' : 'RAZORPAY_WEBHOOK_RETRY_SCHEDULED', permanent ? 'FAILURE' : 'SUCCESS', {
        errorCode: code,
        providerError: razorpayErrorSummary(error),
        attempt: event.attempts,
        nextAttemptAt: retryAt?.toISOString() || null,
      }).catch((auditError) => console.error('[razorpay-webhooks] outcome audit failed:', auditError?.code || 'AUDIT_ERROR'));
    }
  };
  const runWorker = async () => {
    while (nextEventIndex < events.length) {
      const event = events[nextEventIndex];
      nextEventIndex += 1;
      await processClaimedEvent(event);
    }
  };

  try {
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  } finally {
    if (timer) clearInterval(timer);
    if (heartbeatInFlight) await heartbeatInFlight;
  }
  return events.length;
};

module.exports = { processWebhook, processRazorpayWebhookBatch };
