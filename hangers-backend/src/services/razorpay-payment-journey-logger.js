const crypto = require('crypto');
const { createTraceContext, getTraceContext } = require('../utils/trace-context');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACE_ID = /^(?!0{32}$)[0-9a-f]{32}$/i;
const SPAN_ID = /^(?!0{16}$)[0-9a-f]{16}$/i;
const STATE = /^[A-Z][A-Z0-9_]{0,39}$/;
const PROVIDER_ID = /^(?:order|pay)_[A-Za-z0-9]{6,40}$/;
const SAFE_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const JOURNEY_OUTCOMES = new Set(['SUCCESS', 'FAILURE', 'REVIEW', 'RETRY', 'IGNORED']);

const safeLabel = (value) => typeof value === 'string' && SAFE_CODE.test(value) ? value : null;
const safeState = (value) => typeof value === 'string' && STATE.test(value) ? value : null;
const safeProviderId = (value) => typeof value === 'string' && PROVIDER_ID.test(value) ? value : null;

const buildJourneyEvent = ({ attempt, action, status, metadata = {} }) => {
  let amountPaise;
  try { amountPaise = BigInt(attempt?.amountPaise); } catch { return null; }
  if (!attempt?.id || !attempt?.paymentJourneyId || !attempt?.invoiceId || !['TEST', 'LIVE'].includes(attempt.mode)
    || amountPaise < 1n || !/^[A-Z]{3}$/.test(attempt.currency || '')) return null;
  if (typeof action !== 'string' || !/^RAZORPAY_[A-Z0-9_]{1,96}$/.test(action)) return null;

  const providerError = metadata.providerError && typeof metadata.providerError === 'object'
    ? metadata.providerError : {};
  const providerStatus = Number(metadata.providerStatus);
  const diagnostics = {
    ...(safeLabel(metadata.errorCode) ? { errorCode: safeLabel(metadata.errorCode) } : {}),
    ...(Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599 ? { providerStatus } : {}),
    ...(safeLabel(metadata.retryReason) ? { retryReason: safeLabel(metadata.retryReason) } : {}),
    ...(safeLabel(metadata.source) ? { source: safeLabel(metadata.source) } : {}),
    ...(safeLabel(metadata.providerMethod) ? { providerMethod: safeLabel(metadata.providerMethod) } : {}),
    ...(safeLabel(metadata.providerMethodDetail) ? { providerMethodDetail: safeLabel(metadata.providerMethodDetail) } : {}),
    ...(safeLabel(metadata.crmPaymentId) ? { crmPaymentId: safeLabel(metadata.crmPaymentId) } : {}),
    ...(safeLabel(metadata.sourceWebhookRecordId) ? { sourceWebhookRecordId: safeLabel(metadata.sourceWebhookRecordId) } : {}),
    ...(safeLabel(metadata.sourceWebhookEventType) ? { sourceWebhookEventType: safeLabel(metadata.sourceWebhookEventType) } : {}),
    ...(Number.isInteger(metadata.sourceWebhookAttempt) && metadata.sourceWebhookAttempt >= 1
      ? { sourceWebhookAttempt: metadata.sourceWebhookAttempt } : {}),
    ...(safeLabel(metadata.webhookErrorCode) ? { webhookErrorCode: safeLabel(metadata.webhookErrorCode) } : {}),
    ...(safeLabel(metadata.sourceOutboxEventId) ? { sourceOutboxEventId: safeLabel(metadata.sourceOutboxEventId) } : {}),
    ...(safeLabel(metadata.sourceOutboxEventType) ? { sourceOutboxEventType: safeLabel(metadata.sourceOutboxEventType) } : {}),
    ...(Number.isInteger(metadata.sourceOutboxAttempt) && metadata.sourceOutboxAttempt >= 1
      ? { sourceOutboxAttempt: metadata.sourceOutboxAttempt } : {}),
    ...(safeLabel(metadata.notificationProviderOutcome) ? { notificationProviderOutcome: safeLabel(metadata.notificationProviderOutcome) } : {}),
    ...(safeLabel(providerError.code) ? { providerErrorCode: safeLabel(providerError.code) } : {}),
    ...(safeLabel(providerError.source) ? { providerErrorSource: safeLabel(providerError.source) } : {}),
    ...(safeLabel(providerError.step) ? { providerErrorStep: safeLabel(providerError.step) } : {}),
    ...(safeLabel(providerError.reason) ? { providerErrorReason: safeLabel(providerError.reason) } : {}),
  };
  const requestId = typeof metadata.requestId === 'string' && UUID.test(metadata.requestId) ? metadata.requestId : null;
  const traceId = typeof metadata.traceId === 'string' && TRACE_ID.test(metadata.traceId) ? metadata.traceId : null;
  const spanId = typeof metadata.spanId === 'string' && SPAN_ID.test(metadata.spanId) ? metadata.spanId : null;

  return {
    paymentJourneyId: attempt.paymentJourneyId,
    checkoutAttemptId: attempt.id,
    requestId,
    traceId,
    spanId,
    eventName: action,
    outcome: JOURNEY_OUTCOMES.has(metadata.journeyOutcome)
      ? metadata.journeyOutcome
      : safeState(metadata.nextState || attempt.status) === 'REVIEW' ? 'REVIEW' : status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    priorState: safeState(metadata.priorState),
    nextState: safeState(metadata.nextState || attempt.status),
    invoiceId: attempt.invoiceId,
    mode: attempt.mode,
    amountPaise,
    currency: attempt.currency,
    razorpayOrderId: safeProviderId(metadata.razorpayOrderId || attempt.razorpayOrderId),
    razorpayPaymentId: safeProviderId(metadata.razorpayPaymentId || attempt.razorpayPaymentId),
    diagnostics: Object.keys(diagnostics).length ? diagnostics : undefined,
  };
};

const recordPaymentJourneyEvent = async (tx, { attempt, action, status, metadata }) => {
  if (!tx?.razorpayPaymentJourneyEvent?.create || !tx?.razorpayCheckoutAttempt?.updateMany
    || !tx?.razorpayCheckoutAttempt?.findUnique) {
    throw new Error('Payment journey event persistence is unavailable');
  }
  let currentAttempt = attempt;
  if (!currentAttempt.paymentJourneyId) {
    await tx.razorpayCheckoutAttempt.updateMany({
      where: { id: currentAttempt.id, paymentJourneyId: null },
      data: { paymentJourneyId: `pj_${crypto.randomUUID()}` },
    });
    currentAttempt = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: currentAttempt.id } });
  }
  if (!currentAttempt?.paymentJourneyId) throw new Error('Payment journey could not be assigned to the checkout attempt');
  const operationTrace = getTraceContext() || createTraceContext(null);
  const data = buildJourneyEvent({
    attempt: currentAttempt,
    action,
    status,
    metadata: {
      ...metadata,
      requestId: metadata?.requestId || operationTrace.requestId,
      traceId: metadata?.traceId || operationTrace.traceId,
      spanId: metadata?.spanId || operationTrace.spanId,
    },
  });
  if (!data) throw new Error('Payment journey event is invalid');
  await tx.razorpayPaymentJourneyEvent.create({ data });
};

module.exports = { buildJourneyEvent, recordPaymentJourneyEvent };
