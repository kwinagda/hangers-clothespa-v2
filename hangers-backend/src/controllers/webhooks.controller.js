const crypto = require('crypto');
const prisma = require('../config/database');
const { log } = require('../services/activity.service');
const { paymentApiError } = require('../utils/payment-api-error');
const { getSafeRazorpayPaymentDiagnostics } = require('../utils/razorpay-payment-method');
const { getMode } = require('../services/razorpay-invoice-checkout.service');

const safeId = (value) => typeof value === 'string' && value.length <= 100 ? value : null;
const eventReferences = (body) => {
  const payment = body?.payload?.payment?.entity;
  const order = body?.payload?.order?.entity;
  const refund = body?.payload?.refund?.entity;
  const settlement = body?.payload?.settlement?.entity;
  const dispute = body?.payload?.dispute?.entity;
  return {
    paymentId: safeId(payment?.id || refund?.payment_id || dispute?.payment_id),
    orderId: safeId(payment?.order_id || order?.id),
    refundId: safeId(refund?.id),
    refundAttemptId: safeId(refund?.notes?.crm_refund_attempt_id),
    settlementId: safeId(settlement?.id),
    disputeId: safeId(dispute?.id),
    paymentDiagnostics: payment ? getSafeRazorpayPaymentDiagnostics(payment) : null,
  };
};

const logWebhook = (action, event, eventId, status = 'SUCCESS', metadata = {}) => log({
  actorType: 'system',
  actorName: 'Razorpay webhook',
  action,
  status: status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
  resource: 'razorpay_webhook',
  resourceId: eventId || null,
  description: `Razorpay webhook ${event || 'unknown'} ${status === 'FAILED' ? 'rejected' : 'accepted'}`,
  metadata: { provider: 'RAZORPAY', eventId: eventId || null, event: event || null, ...metadata },
});

const logWebhookAsync = (...args) => {
  void logWebhook(...args).catch((err) => console.error('[razorpay-webhook] audit write failed:', err?.code || 'AUDIT_ERROR'));
};

const timingSafeEqualHex = (received, expected) => {
  if (!/^[a-f0-9]{64}$/i.test(String(received || ''))) return false;
  const a = Buffer.from(String(received), 'hex');
  const b = Buffer.from(String(expected), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const verifyWebhookSignature = (rawBody, signature, currentSecret, previousSecret) => {
  if (!currentSecret || (previousSecret && previousSecret === currentSecret)) return { configurationError: true, matchedSecretSlot: null };
  const currentExpected = crypto.createHmac('sha256', currentSecret).update(rawBody).digest('hex');
  const previousExpected = previousSecret ? crypto.createHmac('sha256', previousSecret).update(rawBody).digest('hex') : null;
  const matchesCurrent = timingSafeEqualHex(signature, currentExpected);
  const matchesPrevious = previousExpected ? timingSafeEqualHex(signature, previousExpected) : false;
  return {
    configurationError: false,
    matchedSecretSlot: matchesCurrent ? 'CURRENT' : matchesPrevious ? 'PREVIOUS' : null,
  };
};

const handleRazorpayWebhook = async (req, res) => {
  const requestedMode = req.params?.mode ? String(req.params.mode).toUpperCase() : null;
  const mode = requestedMode || getMode();
  const activeMode = getMode();
  if (!['TEST', 'LIVE'].includes(mode) || !process.env.RAZORPAY_KEY_ID || requestedMode && mode !== activeMode) {
    await logWebhook('RAZORPAY_WEBHOOK_MODE_MISMATCH', String(req.body?.event || '').toLowerCase(), req.headers['x-razorpay-event-id'], 'FAILED', {
      requestId: req.id,
      requestedMode: mode,
      activeMode,
    });
    return paymentApiError(res, { statusCode: 503, code: 'WEBHOOK_MODE_MISMATCH', message: 'Webhook mode does not match this payment environment', requestId: req.id, retryable: true, action: 'VERIFY_WEBHOOK_URL_AND_ENVIRONMENT' });
  }
  const eventId = String(req.headers['x-razorpay-event-id'] || '').trim();
  const signature = String(req.headers['x-razorpay-signature'] || '').trim();
  const currentSecret = requestedMode ? process.env[`RAZORPAY_WEBHOOK_SECRET_${mode}`] : process.env.RAZORPAY_WEBHOOK_SECRET;
  const previousSecret = requestedMode ? process.env[`RAZORPAY_WEBHOOK_SECRET_${mode}_PREVIOUS`] : process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS;
  const event = String(req.body?.event || '').toLowerCase().slice(0, 120);
  if (!req.rawBody || !eventId || eventId.length > 160 || !signature) {
    await logWebhook('RAZORPAY_WEBHOOK_REJECTED', event, eventId, 'FAILED', {
      requestId: req.id,
      missingRawBody: !req.rawBody,
      missingEventId: !eventId,
      missingSignature: !signature,
    });
    return paymentApiError(res, { statusCode: 400, code: 'WEBHOOK_REQUEST_INVALID', message: 'Invalid webhook request', requestId: req.id, retryable: false });
  }

  const verification = verifyWebhookSignature(req.rawBody, signature, currentSecret, previousSecret);
  if (verification.configurationError) {
    await logWebhook('RAZORPAY_WEBHOOK_VERIFIER_MISCONFIGURED', event, eventId, 'FAILED', { requestId: req.id });
    return paymentApiError(res, { statusCode: 503, code: 'WEBHOOK_VERIFIER_MISCONFIGURED', message: 'Webhook verification is temporarily unavailable', requestId: req.id, retryable: true, action: 'RETRY_PROVIDER_DELIVERY' });
  }
  if (!verification.matchedSecretSlot) {
    await logWebhook('RAZORPAY_WEBHOOK_SIGNATURE_INVALID', event, eventId, 'FAILED', { requestId: req.id });
    return paymentApiError(res, { statusCode: 400, code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Invalid webhook signature', requestId: req.id, retryable: false });
  }

  const { paymentDiagnostics, ...refs } = eventReferences(req.body);
  const payloadHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
  const minimalPayload = Object.fromEntries(
    [...Object.entries(refs), ...Object.entries(paymentDiagnostics || {})].filter(([, value]) => value),
  );
  try {
    const inserted = await prisma.razorpayWebhookEvent.create({
      data: {
        eventId,
        event,
        mode,
        ...refs,
        payload: minimalPayload,
        payloadHash,
        status: 'RECEIVED',
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });
    // The durable inbox insert is the acknowledgement boundary. Do not make
    // Razorpay's short webhook response window depend on a second audit write.
    logWebhookAsync('RAZORPAY_WEBHOOK_DURABLY_ACCEPTED', event, eventId, 'SUCCESS', {
      requestId: req.id,
      webhookRecordId: inserted.id,
      signatureSecretSlot: verification.matchedSecretSlot,
      paymentId: refs.paymentId,
      orderId: refs.orderId,
      payloadHash,
    });
    return res.status(200).json({ success: true, accepted: true });
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId }, select: { id: true, status: true, mode: true } });
      if (existing && (!existing.mode || existing.mode === mode) && ['RECEIVED', 'RETRY', 'PROCESSING', 'PROCESSED', 'IGNORED', 'REVIEW'].includes(existing.status)) {
        logWebhookAsync('RAZORPAY_WEBHOOK_DUPLICATE', event, eventId, 'SUCCESS', { requestId: req.id, status: existing.status, signatureSecretSlot: verification.matchedSecretSlot });
        return res.status(200).json({ success: true, duplicate: true });
      }
      if (existing && (!existing.mode || existing.mode === mode) && ['FAILED', 'RETRYABLE'].includes(existing.status)) {
        await prisma.razorpayWebhookEvent.update({
          where: { id: existing.id },
          data: { status: 'RECEIVED', attempts: 0, nextAttemptAt: new Date(), lockedAt: null, error: null, processedAt: null },
        });
        logWebhookAsync('RAZORPAY_WEBHOOK_REQUEUED', event, eventId, 'SUCCESS', { requestId: req.id, signatureSecretSlot: verification.matchedSecretSlot });
        return res.status(200).json({ success: true, accepted: true, replay: true });
      }
    }
    await logWebhook('RAZORPAY_WEBHOOK_PERSIST_FAILED', event, eventId, 'FAILED', {
      requestId: req.id,
      errorCode: String(error?.code || 'DATABASE_ERROR').slice(0, 80),
    });
    // Non-2xx lets Razorpay retry because the event was not durably accepted.
    return paymentApiError(res, { statusCode: 500, code: 'WEBHOOK_PERSIST_FAILED', message: 'Webhook could not be durably accepted', requestId: req.id, retryable: true, action: 'RETRY_PROVIDER_DELIVERY' });
  }
};

module.exports = { handleRazorpayWebhook };
