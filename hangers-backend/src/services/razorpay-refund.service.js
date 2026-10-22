const axios = require('axios');
const crypto = require('crypto');
const prisma = require('../config/database');
const { recordOrderRefund, PaymentRuleError } = require('./payment.service');
const { writeAuditEvent } = require('./activity.service');
const { razorpayErrorSummary } = require('../utils/redact');

const ACTIVE_REFUND_STATES = ['CREATING', 'PROCESSING', 'PENDING', 'REVIEW'];
const providerErrorSummary = (error) => {
  const root = error?.response?.data?.error || error?.error;
  return root && typeof root === 'object' ? razorpayErrorSummary({ error: root }) : {};
};
const serializeRefundAttempt = (attempt) => {
  if (!attempt) return null;
  return {
    id: attempt.id,
    sourcePaymentId: attempt.sourcePaymentId,
    orderId: attempt.orderId,
    invoiceId: attempt.invoiceId,
    amount: Number(attempt.amountPaise) / 100,
    currency: attempt.currency,
    mode: attempt.mode,
    status: attempt.status,
    providerStatus: attempt.providerStatus,
    razorpayRefundId: attempt.razorpayRefundId,
    reasonCode: attempt.reasonCode,
    reason: attempt.reason,
    automatic: Boolean(attempt.automatic),
    failureCode: attempt.failureCode,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    completedAt: attempt.completedAt,
  };
};
const mode = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (typeof keyId === 'string' && keyId.startsWith('rzp_test_')) return 'TEST';
  if (typeof keyId === 'string' && keyId.startsWith('rzp_live_')) return 'LIVE';
  throw new PaymentRuleError('RAZORPAY_MODE_UNAVAILABLE', 'Razorpay mode cannot be verified from the configured API key', 503);
};
const assertProviderMode = (expectedMode) => {
  if (!['TEST', 'LIVE'].includes(expectedMode)) {
    throw new PaymentRuleError('RAZORPAY_MODE_UNAVAILABLE', 'Refund mode is not recorded; no provider request was made.', 503);
  }
  const activeMode = mode();
  if (expectedMode !== activeMode) {
    throw new PaymentRuleError('RAZORPAY_MODE_MISMATCH', 'Refund belongs to a different Razorpay mode; no provider request was made.', 409);
  }
  return activeMode;
};
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const paise = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new PaymentRuleError('INVALID_REFUND_AMOUNT', 'Refund amount must be a positive amount with at most two decimal places');
  }
  if (amount < 1) throw new PaymentRuleError('REFUND_BELOW_PROVIDER_MINIMUM', 'Razorpay refunds must be at least ₹1.00');
  return BigInt(Math.round(amount * 100));
};
const logRefund = (tx, attempt, action, description, status = 'SUCCESS', metadata = {}) => writeAuditEvent(tx, {
  actorType: 'system',
  actorName: 'Razorpay refund integration',
  action,
  status: ['FAILED', 'REVIEW'].includes(status) ? 'FAILURE' : 'SUCCESS',
  resource: 'razorpay_refund_attempt',
  resourceId: attempt.id,
  description,
  metadata: {
    provider: 'RAZORPAY',
    refundAttemptId: attempt.id,
    orderId: attempt.orderId,
    invoiceId: attempt.invoiceId,
    sourcePaymentId: attempt.sourcePaymentId,
    razorpayPaymentId: attempt.sourcePayment?.razorpayPaymentId || null,
    razorpayRefundId: attempt.razorpayRefundId || null,
    amountPaise: String(attempt.amountPaise),
    currency: attempt.currency,
    mode: attempt.mode,
    priorState: attempt.status,
    ...metadata,
  },
});

const providerCreateRefund = async ({ paymentId, amountPaise, attempt }) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new PaymentRuleError('RAZORPAY_NOT_CONFIGURED', 'Razorpay refunds are temporarily unavailable', 503);
  assertProviderMode(attempt?.mode);
  const response = await axios.post(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
    {
      amount: Number(amountPaise),
      speed: 'normal',
      receipt: `hcr-${attempt.id}`,
      notes: { crm_refund_attempt_id: attempt.id, ...(attempt.automatic ? { crm_refund_reason: attempt.reasonCode } : {}) },
    },
    {
      auth: { username: keyId, password: keySecret },
      headers: { 'X-Refund-Idempotency': attempt.providerIdempotencyKey },
      timeout: 15000,
    }
  );
  return response.data;
};

const reserveAutomaticSurplusRefund = async (tx, { sourcePayment, amountPaise, checkoutAttempt, requestId }) => {
  if (!sourcePayment?.id || !sourcePayment.razorpayPaymentId || !checkoutAttempt?.id || amountPaise <= 0n) return null;
  const idempotencyKey = hash(`razorpay-automatic-surplus:${sourcePayment.razorpayPaymentId}`);
  const providerIdempotencyKey = `hcrf_${idempotencyKey.slice(0, 48)}`;
  const requestHash = hash(JSON.stringify({ sourcePaymentId: sourcePayment.id, amountPaise: String(amountPaise), reasonCode: 'DUPLICATE_CAPTURE_SURPLUS' }));
  const existing = await tx.razorpayRefundAttempt.findUnique({ where: { idempotencyKey }, include: { sourcePayment: true } });
  if (existing) {
    if (!existing.automatic || existing.sourcePaymentId !== sourcePayment.id || existing.amountPaise !== amountPaise || existing.requestHash !== requestHash) {
      throw new PaymentRuleError('AUTOMATIC_REFUND_IDEMPOTENCY_CONFLICT', 'Automatic refund record does not match the captured surplus', 409);
    }
    return existing;
  }
  const belowMinimum = amountPaise < 100n;
  const attempt = await tx.razorpayRefundAttempt.create({
    data: {
      idempotencyKey,
      providerIdempotencyKey,
      requestHash,
      sourcePaymentId: sourcePayment.id,
      checkoutAttemptId: checkoutAttempt.id,
      customerId: sourcePayment.customerId,
      amountPaise,
      currency: 'INR',
      mode: checkoutAttempt.mode,
      status: belowMinimum ? 'REVIEW' : 'CREATING',
      automatic: true,
      reasonCode: 'DUPLICATE_CAPTURE_SURPLUS',
      reason: 'Captured Razorpay amount exceeded the currently due amounts in its frozen invoice allocation plan',
      requestId: requestId || null,
      ...(belowMinimum ? { failureCode: 'REFUND_BELOW_PROVIDER_MINIMUM' } : {}),
    },
    include: { sourcePayment: true },
  });
  await logRefund(tx, attempt, belowMinimum ? 'RAZORPAY_AUTOMATIC_REFUND_MINIMUM_EXCEPTION' : 'RAZORPAY_AUTOMATIC_REFUND_RESERVED',
    belowMinimum ? 'Captured surplus is below Razorpay normal-refund minimum and requires Finance handling' : 'Automatic refund job reserved for captured surplus',
    belowMinimum ? 'REVIEW' : 'SUCCESS', { checkoutAttemptId: checkoutAttempt.id, requestId: requestId || null });
  return attempt;
};

const reserveRefund = async ({ orderId, sourcePaymentId, amount, reasonCode, reason, staff, idempotencyKey, requestId }) => {
  if (!idempotencyKey || String(idempotencyKey).length > 200) throw new PaymentRuleError('IDEMPOTENCY_KEY_REQUIRED', 'A valid refund idempotency key is required');
  if (!staff?.id || (!staff.effectivePermissions?.includes('*') && !staff.effectivePermissions?.includes('finance.refund'))) {
    throw new PaymentRuleError('REFUND_APPROVAL_REQUIRED', 'Refunds require finance.refund authority', 403);
  }
  const amountPaise = paise(amount);
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length < 3) throw new PaymentRuleError('REFUND_REASON_REQUIRED', 'A refund reason is required');
  const localKey = hash(`razorpay-refund:${idempotencyKey}`);
  const providerKey = `hcrf_${localKey.slice(0, 48)}`;
  const requestHash = hash(JSON.stringify({ orderId, sourcePaymentId, amountPaise: String(amountPaise), reasonCode, reason: normalizedReason }));

  return prisma.$transaction(async (tx) => {
    const lockedOrder = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} AND "documentType" = 'ORDER' FOR UPDATE`;
    if (!lockedOrder.length) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
    const prior = await tx.razorpayRefundAttempt.findUnique({ where: { idempotencyKey: localKey }, include: { sourcePayment: true } });
    if (prior) {
      if (prior.requestHash !== requestHash || prior.orderId !== orderId || prior.sourcePaymentId !== sourcePaymentId) {
        throw new PaymentRuleError('REFUND_IDEMPOTENCY_CONFLICT', 'This refund idempotency key was already used with a different request', 409);
      }
      if (['PENDING', 'PROCESSED', 'FAILED'].includes(prior.status)) return { attempt: prior, shouldCallProvider: false };
      return { attempt: prior, shouldCallProvider: true };
    }

    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${sourcePaymentId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { orderId }, select: { id: true, currency: true } });
    const source = await tx.payment.findFirst({
      where: {
        id: sourcePaymentId,
        kind: 'RECEIPT',
        status: { in: ['CAPTURED', 'SUCCESS'] },
        razorpayPaymentId: { not: null },
        allocations: { some: { orderId, status: 'POSTED', ...(invoice ? { invoiceId: invoice.id } : {}) } },
      },
      include: {
        allocations: { where: { orderId, status: 'POSTED', ...(invoice ? { invoiceId: invoice.id } : {}) } },
        razorpayRefundAttemptsFromPayment: { where: { orderId, status: { in: ACTIVE_REFUND_STATES } }, select: { amountPaise: true } },
      },
    });
    if (!source || !invoice) throw new PaymentRuleError('RAZORPAY_SOURCE_PAYMENT_NOT_FOUND', 'Captured Razorpay payment was not found for this order invoice', 404);
    const configuredMode = mode();
    if (!source.mode) throw new PaymentRuleError('RAZORPAY_MODE_UNAVAILABLE', 'The captured payment has no recorded Razorpay mode; Finance must verify it before refunding.', 409);
    if (source.mode !== configuredMode) throw new PaymentRuleError('RAZORPAY_MODE_MISMATCH', 'The captured payment belongs to a different Razorpay mode; no refund request was made.', 409);
    const currency = String(invoice.currency || 'INR').toUpperCase();
    if (currency !== 'INR') throw new PaymentRuleError('UNSUPPORTED_RAZORPAY_REFUND_CURRENCY', 'Razorpay refunds are only configured for INR invoices', 409);

    const allocationIds = source.allocations.map((allocation) => allocation.id);
    const postedRefunds = allocationIds.length ? await tx.refundAllocation.groupBy({
      by: ['sourceAllocationId'],
      where: { sourceAllocationId: { in: allocationIds }, status: 'POSTED' },
      _sum: { amount: true },
    }) : [];
    const allocatedPaise = source.allocations.reduce((sum, allocation) => sum + BigInt(Math.round(Number(allocation.amount) * 100)), 0n);
    const postedPaise = postedRefunds.reduce((sum, row) => sum + BigInt(Math.round(Number(row._sum.amount || 0) * 100)), 0n);
    const activePaise = source.razorpayRefundAttemptsFromPayment.reduce((sum, row) => sum + row.amountPaise, 0n);
    if (amountPaise > allocatedPaise - postedPaise - activePaise) {
      throw new PaymentRuleError('REFUND_EXCEEDS_AVAILABLE', 'Refund exceeds the remaining allocated balance after posted and pending refunds');
    }

    const attempt = await tx.razorpayRefundAttempt.create({
      data: {
        idempotencyKey: localKey,
        providerIdempotencyKey: providerKey,
        requestHash,
        sourcePaymentId,
        orderId,
        invoiceId: invoice.id,
        customerId: source.customerId,
        createdById: staff.id,
        amountPaise,
        currency,
        mode: configuredMode,
        status: 'CREATING',
        reasonCode: reasonCode || 'CUSTOMER_REFUND',
        reason: normalizedReason,
        requestId: requestId || null,
      },
      include: { sourcePayment: true },
    });
    await logRefund(tx, attempt, 'RAZORPAY_REFUND_RESERVED', 'Razorpay refund request reserved against the remaining refundable invoice allocation', 'SUCCESS', {
      requestId: requestId || null,
      providerIdempotencyKey: providerKey,
      availableBeforePaise: String(allocatedPaise - postedPaise - activePaise),
    });
    return { attempt, shouldCallProvider: true };
  }, { isolationLevel: 'Serializable' });
};

const updateRefundState = async ({ attemptId, refund, state, failureCode = null, providerError = null }) => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`SELECT "id" FROM "razorpay_refund_attempts" WHERE "id" = ${attemptId} FOR UPDATE`;
  if (!rows.length) throw new PaymentRuleError('RAZORPAY_REFUND_ATTEMPT_NOT_FOUND', 'Refund attempt not found', 404);
  const current = await tx.razorpayRefundAttempt.findUnique({ where: { id: attemptId }, include: { sourcePayment: true } });
  if (current.status === 'PROCESSED' || current.status === 'FAILED') return current;
  const updated = await tx.razorpayRefundAttempt.update({
    where: { id: attemptId },
    data: {
      status: state,
      providerStatus: refund?.status || null,
      ...(refund?.id ? { razorpayRefundId: refund.id } : {}),
      failureCode,
      lockedAt: null,
      nextAttemptAt: state === 'PENDING' ? new Date(Date.now() + 60_000)
        : state === 'REVIEW' ? new Date(Date.now() + Math.min(15 * 60_000, 2 ** Math.min(current.attemptCount || 0, 9) * 1000))
          : new Date(),
      ...(state === 'FAILED' ? { completedAt: new Date() } : {}),
    },
    include: { sourcePayment: true },
  });
  await logRefund(tx, updated, `RAZORPAY_REFUND_${state}`, `Razorpay refund provider state is ${String(refund?.status || state).toLowerCase()}`, state === 'FAILED' ? 'FAILED' : 'SUCCESS', {
    providerStatus: refund?.status || null,
    failureCode,
    ...(providerError ? { providerError } : {}),
    acquirerReferencePresent: Boolean(refund?.acquirer_data?.arn || refund?.acquirer_data?.rrn || refund?.acquirer_data?.utr),
  });
  return updated;
});

const finalizeProcessedRefund = async ({ attemptId, refund }) => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`SELECT "id" FROM "razorpay_refund_attempts" WHERE "id" = ${attemptId} FOR UPDATE`;
  if (!rows.length) throw new PaymentRuleError('RAZORPAY_REFUND_ATTEMPT_NOT_FOUND', 'Refund attempt not found', 404);
  const attempt = await tx.razorpayRefundAttempt.findUnique({
    where: { id: attemptId },
    include: { sourcePayment: true, localRefundPayment: true },
  });
  if (attempt.status === 'PROCESSED' && attempt.localRefundPayment) return { attempt, refundPayment: attempt.localRefundPayment, alreadyRecorded: true };
  if (refund.status !== 'processed' || refund.payment_id !== attempt.sourcePayment.razorpayPaymentId || Number(refund.amount) !== Number(attempt.amountPaise) || String(refund.currency || '').toUpperCase() !== attempt.currency) {
    throw new PaymentRuleError('RAZORPAY_REFUND_PROVIDER_MISMATCH', 'Provider refund does not match its reserved Razorpay request', 409);
  }
  if (refund.notes?.crm_refund_attempt_id && refund.notes.crm_refund_attempt_id !== attempt.id) {
    throw new PaymentRuleError('RAZORPAY_REFUND_BINDING_MISMATCH', 'Provider refund is bound to a different CRM refund attempt', 409);
  }
  if (attempt.automatic) {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${attempt.sourcePaymentId} FOR UPDATE`;
    const source = await tx.payment.findUnique({ where: { id: attempt.sourcePaymentId } });
    if (!source || BigInt(Math.round(Number(source.unallocatedAmount || 0) * 100)) < attempt.amountPaise) {
      throw new PaymentRuleError('AUTOMATIC_REFUND_SURPLUS_MISMATCH', 'The captured payment no longer has enough unallocated surplus for this refund', 409);
    }
    let refundPayment = attempt.localRefundPayment;
    if (!refundPayment) {
      refundPayment = await tx.payment.create({
        data: {
          customerId: attempt.customerId,
          amount: Number(attempt.amountPaise) / 100,
          kind: 'REFUND',
          method: 'RAZORPAY',
          status: 'CAPTURED',
          reference: refund.id,
          razorpayRefundId: refund.id,
          idempotencyKey: `razorpay-automatic-refund:${attempt.id}`,
          mode: attempt.mode,
          notes: 'Automatic refund of captured checkout surplus',
        },
      });
    }
    await tx.payment.update({
      where: { id: source.id },
      data: { unallocatedAmount: Number(BigInt(Math.round(Number(source.unallocatedAmount || 0) * 100)) - attempt.amountPaise) / 100 },
    });
    const updated = await tx.razorpayRefundAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'PROCESSED', providerStatus: refund.status, razorpayRefundId: refund.id,
        localRefundPaymentId: refundPayment.id, completedAt: new Date(), failureCode: null, lockedAt: null,
      },
      include: { sourcePayment: true, localRefundPayment: true },
    });
    await logRefund(tx, updated, 'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED', 'Provider-processed surplus refund was posted to the CRM payment ledger', 'SUCCESS', {
      localRefundPaymentId: refundPayment.id,
      checkoutAttemptId: attempt.checkoutAttemptId || null,
    });
    return { attempt: updated, refundPayment, alreadyRecorded: false };
  }
  const result = await recordOrderRefund(tx, {
    orderId: attempt.orderId,
    sourcePaymentId: attempt.sourcePaymentId,
    amount: Number(attempt.amountPaise) / 100,
    method: attempt.sourcePayment.method,
    reference: refund.id,
    reasonCode: attempt.reasonCode,
    reason: attempt.reason,
    staff: { id: attempt.createdById, effectivePermissions: ['finance.refund'] },
    idempotencyKey: `razorpay-refund-${attempt.id}`,
    providerRefundId: refund.id,
    mode: attempt.mode,
  });
  const updated = await tx.razorpayRefundAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'PROCESSED',
      providerStatus: refund.status,
      razorpayRefundId: refund.id,
      localRefundPaymentId: result.refundPayment.id,
      creditNoteId: result.creditNote.id,
      completedAt: new Date(),
      failureCode: null,
    },
    include: { sourcePayment: true, localRefundPayment: true },
  });
  await logRefund(tx, updated, 'RAZORPAY_REFUND_LEDGER_POSTED', 'Provider-processed Razorpay refund was posted to CRM refund allocation and credit note', 'SUCCESS', {
    localRefundPaymentId: result.refundPayment.id,
    creditNoteId: result.creditNote.id,
    creditNoteNumber: result.creditNote.creditNoteNumber,
    invoiceBalanceDue: result.invoice?.balanceDue ?? null,
  });
  return { ...result, attempt: updated, alreadyRecorded: false };
}, { isolationLevel: 'Serializable' });

const validateProviderRefund = (attempt, refund) => {
  if (!refund || typeof refund.id !== 'string' || refund.payment_id !== attempt.sourcePayment.razorpayPaymentId || Number(refund.amount) !== Number(attempt.amountPaise) || String(refund.currency || '').toUpperCase() !== attempt.currency) {
    throw new PaymentRuleError('RAZORPAY_REFUND_PROVIDER_MISMATCH', 'Razorpay refund did not match the reserved payment, amount, and currency', 409);
  }
  if (refund.notes?.crm_refund_attempt_id && refund.notes.crm_refund_attempt_id !== attempt.id) {
    throw new PaymentRuleError('RAZORPAY_REFUND_BINDING_MISMATCH', 'Razorpay refund metadata does not match this CRM refund attempt', 409);
  }
  if (attempt.razorpayRefundId && attempt.razorpayRefundId !== refund.id) {
    throw new PaymentRuleError('RAZORPAY_REFUND_ID_MISMATCH', 'Razorpay returned a different refund ID than the one already bound to this CRM attempt', 409);
  }
  if (!['pending', 'processed', 'failed'].includes(String(refund.status || '').toLowerCase())) {
    throw new PaymentRuleError('RAZORPAY_REFUND_STATE_UNSUPPORTED', 'Razorpay returned an unknown refund state; finance review is required', 409);
  }
};

const persistProviderRefund = async ({ attempt, refund }) => {
  validateProviderRefund(attempt, refund);
  const state = String(refund.status).toLowerCase();
  if (state === 'processed') return finalizeProcessedRefund({ attemptId: attempt.id, refund });
  const updated = await updateRefundState({ attemptId: attempt.id, refund, state: state === 'pending' ? 'PENDING' : 'FAILED' });
  return { attempt: updated };
};

const createRazorpayRefund = async ({ orderId, sourcePaymentId, amount, reasonCode, reason, staff, idempotencyKey, requestId, provider = providerCreateRefund }) => {
  const reservation = await reserveRefund({ orderId, sourcePaymentId, amount, reasonCode, reason, staff, idempotencyKey, requestId });
  if (!reservation.shouldCallProvider) return { attempt: reservation.attempt, pending: reservation.attempt.status === 'PENDING', alreadyRecorded: reservation.attempt.status === 'PROCESSED' };
  const attempt = reservation.attempt;
  try {
    const refund = await provider({
      paymentId: attempt.sourcePayment.razorpayPaymentId,
      amountPaise: attempt.amountPaise,
      attempt,
    });
    const result = await persistProviderRefund({ attempt, refund });
    return {
      ...result,
      pending: result.attempt?.status === 'PENDING',
      failed: result.attempt?.status === 'FAILED',
    };
  } catch (error) {
    const statusCode = Number(error?.response?.status || error?.statusCode || 0);
    if (error instanceof PaymentRuleError && error.code.startsWith('RAZORPAY_REFUND_')) {
      await updateRefundState({ attemptId: attempt.id, refund: null, state: 'REVIEW', failureCode: error.code }).catch(() => {});
      throw error;
    }
    const definitiveProviderRejection = statusCode >= 400 && statusCode < 500 && statusCode !== 409;
    const providerError = providerErrorSummary(error);
    const failureCode = providerError.code || null;
    const failed = await updateRefundState({ attemptId: attempt.id, refund: null, state: definitiveProviderRejection ? 'FAILED' : 'REVIEW', failureCode, providerError });
    if (!definitiveProviderRejection) return { attempt: failed, pending: true, review: true };
    throw new PaymentRuleError(failureCode || 'RAZORPAY_REFUND_REJECTED', 'Razorpay rejected the refund request. No CRM refund was posted.', 400);
  }
};

const fetchProviderRefund = async (refundId, expectedMode) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new PaymentRuleError('RAZORPAY_NOT_CONFIGURED', 'Razorpay refund status is temporarily unavailable', 503);
  assertProviderMode(expectedMode);
  const response = await axios.get(`https://api.razorpay.com/v1/refunds/${encodeURIComponent(refundId)}`, {
    auth: { username: keyId, password: keySecret },
    timeout: 10000,
  });
  return response.data;
};

const reconcileRazorpayRefundWebhook = async (event, fetcher = fetchProviderRefund) => {
  if (!event.refundId) throw Object.assign(new Error('Refund webhook has no refund ID'), { code: 'MISSING_REFUND_ID', permanent: true });
  const attempt = await prisma.razorpayRefundAttempt.findFirst({
    where: {
      OR: [
        { razorpayRefundId: event.refundId },
        ...(event.refundAttemptId ? [{ id: event.refundAttemptId }] : []),
      ],
    },
    include: { sourcePayment: true },
  });
  if (!attempt) throw Object.assign(new Error('Refund webhook has no matching CRM refund attempt'), { code: 'UNMATCHED_REFUND', permanent: true });
  if (event.mode && event.mode !== attempt.mode) {
    throw Object.assign(new Error('Refund webhook mode does not match its CRM refund attempt'), { code: 'RAZORPAY_MODE_MISMATCH', permanent: true });
  }
  const refund = await fetcher(event.refundId, attempt.mode);
  validateProviderRefund(attempt, refund);
  const status = String(refund.status).toLowerCase();
  const result = await persistProviderRefund({ attempt, refund });
  return { state: result.attempt?.status === 'REVIEW' ? 'REVIEW' : 'PROCESSED', attemptId: attempt.id, refundId: event.refundId, providerStatus: status };
};

const claimAutomaticRefundBatch = async (limit = 10, leaseMs = 5 * 60_000) => prisma.$transaction((tx) => tx.$queryRaw`
  WITH candidates AS (
    SELECT "id"
    FROM "razorpay_refund_attempts"
    WHERE "automatic" = TRUE
      AND "failureCode" IS DISTINCT FROM 'REFUND_BELOW_PROVIDER_MINIMUM'
      AND (
        ("status" IN ('CREATING', 'PENDING', 'REVIEW') AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC'))
        OR ("status" = 'PROCESSING' AND "lockedAt" < (NOW() AT TIME ZONE 'UTC') - (${leaseMs} * INTERVAL '1 millisecond'))
      )
    ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  )
  UPDATE "razorpay_refund_attempts" AS attempts
  SET "status" = 'PROCESSING', "lockedAt" = (NOW() AT TIME ZONE 'UTC'),
      "attemptCount" = attempts."attemptCount" + 1, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
  FROM candidates
  WHERE attempts."id" = candidates."id"
  RETURNING attempts."id"
`);

const processAutomaticRazorpayRefundBatch = async ({ limit = 10, fetcher = fetchProviderRefund, provider = providerCreateRefund } = {}) => {
  const claimed = await claimAutomaticRefundBatch(limit);
  let processed = 0;
  for (const row of claimed) {
    const attempt = await prisma.razorpayRefundAttempt.findUnique({ where: { id: row.id }, include: { sourcePayment: true } });
    if (!attempt || !attempt.automatic || !attempt.sourcePayment?.razorpayPaymentId) continue;
    try {
      const refund = attempt.razorpayRefundId
        ? await fetcher(attempt.razorpayRefundId, attempt.mode)
        : await provider({ paymentId: attempt.sourcePayment.razorpayPaymentId, amountPaise: attempt.amountPaise, attempt });
      await persistProviderRefund({ attempt, refund });
      processed += 1;
    } catch (error) {
      const statusCode = Number(error?.response?.status || error?.statusCode || 0);
      const definitiveProviderRejection = statusCode >= 400 && statusCode < 500 && statusCode !== 409;
      const providerError = providerErrorSummary(error);
      await updateRefundState({
        attemptId: attempt.id,
        refund: null,
        state: definitiveProviderRejection ? 'FAILED' : 'REVIEW',
        failureCode: providerError.code || error?.code || null,
        providerError: providerError.code ? providerError : undefined,
      }).catch((persistError) => console.error('[razorpay-refund] automatic refund state persistence failed:', persistError?.code || 'DB_ERROR'));
      console.error('[razorpay-refund] automatic refund processing failed:', providerError.code || error?.code || 'PROCESSING_ERROR');
    }
  }
  return { claimed: claimed.length, processed };
};

const reconcileRazorpayRefundAttempt = async ({ orderId, attemptId, staff, requestId, fetcher = fetchProviderRefund, provider = providerCreateRefund }) => {
  if (!staff?.id || (!staff.effectivePermissions?.includes('*') && !staff.effectivePermissions?.includes('finance.refund'))) {
    throw new PaymentRuleError('REFUND_APPROVAL_REQUIRED', 'Refunds require finance.refund authority', 403);
  }
  const attempt = await prisma.razorpayRefundAttempt.findFirst({
    where: { id: attemptId, orderId },
    include: { sourcePayment: true, localRefundPayment: { include: { creditNote: true } } },
  });
  if (!attempt) throw new PaymentRuleError('RAZORPAY_REFUND_ATTEMPT_NOT_FOUND', 'Refund attempt not found for this order', 404);
  if (['PROCESSED', 'FAILED'].includes(attempt.status)) {
    return {
      attempt,
      refundPayment: attempt.localRefundPayment || null,
      creditNote: attempt.localRefundPayment?.creditNote || null,
      pending: false,
      failed: attempt.status === 'FAILED',
      alreadyRecorded: attempt.status === 'PROCESSED',
    };
  }

  await prisma.$transaction((tx) => logRefund(tx, attempt, 'RAZORPAY_REFUND_RECOVERY_STARTED', 'Finance requested authoritative refund status recovery', 'SUCCESS', { requestId: requestId || null }));
  if (attempt.razorpayRefundId) {
    let refund;
    try {
      refund = await fetcher(attempt.razorpayRefundId, attempt.mode);
    } catch (error) {
      const providerError = providerErrorSummary(error);
      const failureCode = providerError.code || error?.code || null;
      const updated = await updateRefundState({ attemptId: attempt.id, refund: null, state: 'REVIEW', failureCode, providerError });
      return { attempt: updated, pending: true, review: true };
    }
    const result = await persistProviderRefund({ attempt, refund });
    return {
      ...result,
      pending: result.attempt?.status === 'PENDING',
      failed: result.attempt?.status === 'FAILED',
      review: result.attempt?.status === 'REVIEW',
      alreadyRecorded: Boolean(result.alreadyRecorded),
    };
  }

  if (!['CREATING', 'REVIEW'].includes(attempt.status)) {
    throw new PaymentRuleError('RAZORPAY_REFUND_REFERENCE_MISSING', 'Refund has no provider reference to reconcile; finance review is required', 409);
  }
  try {
    const refund = await provider({ paymentId: attempt.sourcePayment.razorpayPaymentId, amountPaise: attempt.amountPaise, attempt });
    const result = await persistProviderRefund({ attempt, refund });
    return {
      ...result,
      pending: result.attempt?.status === 'PENDING',
      failed: result.attempt?.status === 'FAILED',
      review: result.attempt?.status === 'REVIEW',
      alreadyRecorded: Boolean(result.alreadyRecorded),
    };
  } catch (error) {
    const statusCode = Number(error?.response?.status || error?.statusCode || 0);
    const definitiveProviderRejection = statusCode >= 400 && statusCode < 500 && statusCode !== 409;
    const providerError = providerErrorSummary(error);
    const failureCode = providerError.code || error?.code || null;
    const state = definitiveProviderRejection ? 'FAILED' : 'REVIEW';
    const updated = await updateRefundState({ attemptId: attempt.id, refund: null, state, failureCode, providerError });
    if (!definitiveProviderRejection) return { attempt: updated, pending: true, review: true };
    return { attempt: updated, pending: false, failed: true };
  }
};

module.exports = { createRazorpayRefund, fetchProviderRefund, processAutomaticRazorpayRefundBatch, reconcileRazorpayRefundAttempt, reconcileRazorpayRefundWebhook, reserveAutomaticSurplusRefund, serializeRefundAttempt };
