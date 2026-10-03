const crypto = require('crypto');
const Razorpay = require('razorpay');
const prisma = require('../config/database');
const { PaymentRuleError, getLedgerState, recordInvoiceAllocationsSettlement, recordInvoiceSettlement } = require('./payment.service');
const { enqueueOutboxEvent, OUTBOX_EVENT } = require('./outbox.service');
const { writeAuditEvent } = require('./activity.service');
const { recordPaymentJourneyEvent } = require('./razorpay-payment-journey-logger');
const { safeText } = require('../utils/redact');
const { getSafeRazorpayPaymentMethod, getSafeRazorpayPaymentDiagnostics } = require('../utils/razorpay-payment-method');
const { openInvoiceWhere } = require('./receivables.service');

class RazorpayCheckoutError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = 'RazorpayCheckoutError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.permanent = [400, 404, 409].includes(statusCode);
  }
}

const getRazorpay = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new RazorpayCheckoutError('RAZORPAY_NOT_CONFIGURED', 'Online payment is temporarily unavailable', 503);
  return new Razorpay({ key_id, key_secret });
};

const getMode = (keyId = process.env.RAZORPAY_KEY_ID) => {
  if (typeof keyId === 'string' && keyId.startsWith('rzp_test_')) return 'TEST';
  if (typeof keyId === 'string' && keyId.startsWith('rzp_live_')) return 'LIVE';
  throw new RazorpayCheckoutError('RAZORPAY_MODE_UNAVAILABLE', 'Razorpay mode cannot be verified from the configured API key', 503);
};
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const isSerializationConflict = (error) => error?.code === 'P2034' || error?.meta?.code === '40001' || error?.meta?.code === '40P01';
const serializationConflictCode = (error) => error?.meta?.code === '40001' || error?.meta?.code === '40P01'
  ? error.meta.code : error?.code === 'P2034' ? 'P2034' : null;
const safeProviderCode = (error) => {
  const root = error?.response?.data?.error || error?.error;
  const code = root && typeof root === 'object' ? root.code : null;
  return typeof code === 'string' && code.length ? code : null;
};
const safeProviderMessage = () => 'Provider request failed; use the request and attempt IDs for provider-side investigation.';
const clearProviderFailure = {
  failureCode: null,
  failureMessage: null,
  providerErrorCode: null,
  providerErrorSource: null,
  providerErrorStep: null,
  providerErrorReason: null,
};
const HISTORICAL_ORDER_REQUEST = 'FINANCE_HISTORICAL_ORDER_BIND';
// Return only documented provider diagnostics, never an SDK/transport Error or
// arbitrary metadata. Exact text is transient; logs retain redacted summaries.
const getProviderError = (value) => {
  const root = value?.response?.data?.error || value?.error;
  if (!root || typeof root !== 'object') return null;
  const fields = {};
  for (const field of ['code', 'description', 'source', 'step', 'reason', 'field']) {
    const text = safeText(root[field], field === 'description' ? 240 : 120);
    if (text) fields[field] = text;
  }
  const metadata = {};
  for (const [field, prefix] of [['order_id', 'order'], ['payment_id', 'pay']]) {
    if (typeof root.metadata?.[field] === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`).test(root.metadata[field])) metadata[field] = root.metadata[field];
  }
  return Object.keys(fields).length ? { origin: 'razorpay', ...fields, ...(Object.keys(metadata).length ? { metadata } : {}) } : null;
};
const getProviderPaymentError = (payment) => getProviderError({ error: {
  code: payment?.error_code, description: payment?.error_description,
  source: payment?.error_source, step: payment?.error_step, reason: payment?.error_reason,
  metadata: { order_id: payment?.order_id, payment_id: payment?.id },
} });
const getCheckoutPaymentDiagnostics = (payment) => {
  const error = getProviderPaymentError(payment);
  return {
    ...getSafeRazorpayPaymentDiagnostics(payment),
    providerErrorCode: error?.code ?? null,
    providerErrorSource: error?.source ?? null,
    providerErrorStep: error?.step ?? null,
    providerErrorReason: error?.reason ?? null,
    failureMessage: error?.description ?? null,
  };
};
const assertProviderCheckoutBinding = ({ attempt, providerOrder, providerPayments }) => {
  const hash = attempt.allocationPlan ? digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))) : null;
  if (providerOrder?.id !== attempt.razorpayOrderId
    || providerOrder.notes?.crm_attempt_id !== attempt.id || providerOrder.notes?.invoice_id !== attempt.invoiceId
    || (attempt.publicShareId && providerOrder.notes?.share_id !== attempt.publicShareId)
    || (hash && providerOrder.notes?.allocation_plan_hash !== hash)
    || Number(providerOrder.amount) !== Number(attempt.amountPaise)
    || String(providerOrder.currency || '').toUpperCase() !== String(attempt.currency).toUpperCase()
    || !Array.isArray(providerPayments?.items)
    || providerPayments.items.some((payment) => !payment.id || payment.order_id !== attempt.razorpayOrderId
      || Number(payment.amount) !== Number(attempt.amountPaise)
      || String(payment.currency || '').toUpperCase() !== String(attempt.currency).toUpperCase())) {
    throw new RazorpayCheckoutError('PROVIDER_CHECKOUT_BINDING_MISMATCH', 'Provider details could not be bound to this checkout. Do not pay again; request a status review.', 409, { checkoutAttemptId: attempt.id });
  }
};
const getUnattemptedCheckoutResumeBlockReason = ({ attempt, providerOrder, providerPayments }) => {
  if (!attempt || attempt.status !== 'CREATED' || !attempt.razorpayOrderId) return 'CRM_ATTEMPT_NOT_RESUMABLE';
  if (!providerOrder) return 'PROVIDER_ORDER_MISSING';
  if (providerOrder.id !== attempt.razorpayOrderId) return 'PROVIDER_ORDER_ID_MISMATCH';
  if (String(providerOrder.status || '').toLowerCase() !== 'created') return 'PROVIDER_ORDER_NOT_CREATED';
  if (!Number.isSafeInteger(providerOrder.attempts)) return 'PROVIDER_ATTEMPT_COUNT_INVALID';
  if (Number(providerOrder.attempts) !== 0) return 'PROVIDER_ATTEMPTS_EXIST';
  const amount = providerOrder.amount;
  const amountDue = providerOrder.amount_due;
  const amountPaid = providerOrder.amount_paid;
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(amountDue) || !Number.isSafeInteger(amountPaid)) return 'PROVIDER_AMOUNT_INVALID';
  if (BigInt(amount) !== attempt.amountPaise) return 'PROVIDER_AMOUNT_MISMATCH';
  if (BigInt(amountDue) !== attempt.amountPaise) return 'PROVIDER_AMOUNT_DUE_MISMATCH';
  if (amountPaid !== 0) return 'PROVIDER_AMOUNT_ALREADY_PAID';
  if (String(providerOrder.currency || '').toUpperCase() !== String(attempt.currency || '').toUpperCase()) return 'PROVIDER_CURRENCY_MISMATCH';
  if (providerOrder.notes?.crm_attempt_id !== attempt.id || providerOrder.notes?.invoice_id !== attempt.invoiceId) return 'PROVIDER_INVOICE_BINDING_MISMATCH';
  if (attempt.publicShareId && providerOrder.notes?.share_id !== attempt.publicShareId) return 'PROVIDER_SHARE_BINDING_MISMATCH';
  if (attempt.allocationPlan && providerOrder.notes?.allocation_plan_hash !== digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount }))))) return 'PROVIDER_ALLOCATION_BINDING_MISMATCH';
  if (!Array.isArray(providerPayments?.items)) return 'PROVIDER_PAYMENT_LIST_UNAVAILABLE';
  if (providerPayments.items.length !== 0) return 'PROVIDER_PAYMENT_ATTEMPTS_EXIST';
  return null;
};
const canResumeUnattemptedCheckout = (input) => getUnattemptedCheckoutResumeBlockReason(input) === null;
const canRetryFailedCheckout = ({ attempt, providerOrder, providerPayments }) => {
  if (!attempt || attempt.status !== 'FAILED' || !attempt.razorpayOrderId) return false;
  try { assertProviderCheckoutBinding({ attempt, providerOrder, providerPayments }); } catch { return false; }
  const payments = providerPayments.items;
  return String(providerOrder.status).toLowerCase() === 'attempted'
    && Number.isSafeInteger(providerOrder.attempts) && providerOrder.attempts > 0
    && providerOrder.attempts === payments.length
    && Number.isSafeInteger(providerOrder.amount_due) && BigInt(providerOrder.amount_due) === attempt.amountPaise
    && providerOrder.amount_paid === 0
    && new Set(payments.map((payment) => payment.id)).size === payments.length
    && payments.every((payment) => String(payment.status).toLowerCase() === 'failed');
};
const auditAttemptTransition = async (tx, attempt, action, description, metadata = {}, status = 'SUCCESS') => {
  const eventMetadata = {
    provider: 'RAZORPAY',
    paymentJourneyId: attempt.paymentJourneyId || null,
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    invoiceNumber: attempt.invoiceNumber,
    amountPaise: String(attempt.amountPaise),
    currency: attempt.currency,
    mode: attempt.mode,
    priorState: attempt.status,
    ...metadata,
  };
  const audit = await writeAuditEvent(tx, {
    actorType: 'system',
    actorName: 'Razorpay integration',
    action,
    status: status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    resource: 'razorpay_checkout_attempt',
    resourceId: attempt.id,
    description,
    metadata: eventMetadata,
  });
  await recordPaymentJourneyEvent(tx, { attempt, action, status, metadata: eventMetadata });
  return audit;
};

const recordExperimentCapture = async (tx, attempt) => {
  if (attempt?.mode !== 'TEST' || attempt.experimentId !== 'invoice_checkout_presentation_v1'
    || !['A', 'B'].includes(attempt.experimentVariant) || !/^[a-f0-9]{64}$/.test(attempt.experimentVisitorHash || '')) return;
  await tx.razorpayCheckoutExperimentEvent.upsert({
    where: { eventId: `crm-capture:${attempt.id}` },
    create: {
      eventId: `crm-capture:${attempt.id}`,
      experimentId: attempt.experimentId,
      visitorHash: attempt.experimentVisitorHash,
      variant: attempt.experimentVariant,
      eventType: 'CRM_CAPTURED',
      attemptId: attempt.id,
      mode: 'TEST',
    },
    update: {},
  });
};

const createInvoiceCheckout = async ({ invoice, shareId, idempotencyKey, requestId, experiment, allocationPlan: requestedPlan = null, customCheckout = false, provider: injectedProvider }) => {
  if (!invoice?.id || !invoice.customerId) throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'Online payment is not available for this invoice', 404);
  if (!idempotencyKey || String(idempotencyKey).length > 200) throw new RazorpayCheckoutError('IDEMPOTENCY_KEY_REQUIRED', 'A valid checkout request key is required', 400);
  if (experiment && (getMode() !== 'TEST' || experiment.id !== 'invoice_checkout_presentation_v1' || !['A', 'B'].includes(experiment.variant) || !/^[a-f0-9]{64}$/.test(experiment.visitorHash || ''))) {
    throw new RazorpayCheckoutError('CHECKOUT_EXPERIMENT_INVALID', 'Checkout experiment assignment is invalid', 400);
  }

  // Configuration failures happen before any provider request and must not
  // reserve an attempt that looks like an ambiguous remote order creation.
  const razorpay = injectedProvider || getRazorpay();

  if (requestedPlan !== null && !Array.isArray(requestedPlan)) throw new RazorpayCheckoutError('INVALID_ALLOCATION_PLAN', 'The customer outstanding payment plan is invalid', 400);
  const plan = requestedPlan ? requestedPlan.map((item) => ({ invoiceId: String(item?.invoiceId || ''), amount: Number(item?.amount) })) : null;
  if (plan && (!plan.length || plan[0]?.invoiceId !== invoice.id || new Set(plan.map((item) => item.invoiceId)).size !== plan.length
    || plan.some((item) => !item.invoiceId || !Number.isFinite(item.amount) || item.amount <= 0 || !Number.isSafeInteger(Math.round(item.amount * 100))))) {
    throw new RazorpayCheckoutError('INVALID_ALLOCATION_PLAN', 'The customer outstanding payment plan is invalid', 400);
  }
  const planHash = plan ? digest(JSON.stringify(plan)) : null;
  const localKey = digest(`${invoice.id}:${idempotencyKey}`);
  const reserveAttempt = () => prisma.$transaction(async (tx) => {
    const lockIds = (plan || [{ invoiceId: invoice.id }]).map((item) => item.invoiceId).sort();
    const initialSources = await tx.invoice.findMany({
      where: { id: { in: lockIds } },
      select: { orderId: true, ironBillId: true, serviceAppointmentId: true },
    });
    for (const sourceId of [...new Set(initialSources.map((row) => row.orderId).filter(Boolean))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${sourceId} FOR UPDATE`;
    }
    for (const sourceId of [...new Set(initialSources.map((row) => row.ironBillId).filter(Boolean))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "iron_bills" WHERE "id" = ${sourceId} FOR UPDATE`;
    }
    for (const sourceId of [...new Set(initialSources.map((row) => row.serviceAppointmentId).filter(Boolean))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "service_appointments" WHERE "id" = ${sourceId} FOR UPDATE`;
    }
    const locked = [];
    for (const id of lockIds) locked.push(...await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${id} FOR UPDATE`);
    if (locked.length !== lockIds.length || !locked.some((row) => row.id === invoice.id)) throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'Online payment is not available for this invoice', 404);
    const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!current || current.voidedAt || current.status === 'VOID') throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'This invoice cannot accept payments', 409);
    const assertSourcePayable = async (source) => {
      if (source.orderId) {
        const order = await tx.order.findUnique({ where: { id: source.orderId }, select: { status: true } });
        if (!order || ['CANCELLED', 'RETURNED'].includes(order.status)) {
          throw new RazorpayCheckoutError('ORDER_CANCELLED', 'A cancelled or returned order cannot accept a new payment.', 409);
        }
      } else if (source.ironBillId) {
        const bill = await tx.ironBill.findUnique({ where: { id: source.ironBillId }, select: { status: true } });
        if (!bill || bill.status === 'VOID') {
          throw new RazorpayCheckoutError('BILL_VOID', 'A voided bill cannot accept payment.', 409);
        }
      } else if (source.serviceAppointmentId) {
        const appointment = await tx.serviceAppointment.findUnique({ where: { id: source.serviceAppointmentId }, select: { status: true } });
        if (!appointment || appointment.status === 'CANCELLED') {
          throw new RazorpayCheckoutError('APPOINTMENT_CANCELLED', 'A cancelled appointment cannot accept payment.', 409);
        }
      }
    };
    await assertSourcePayable(current);
    let currentPlan = null;
    if (plan) {
      const receivables = await tx.invoice.findMany({ where: { customerId: current.customerId, ...openInvoiceWhere }, select: { id: true, invoiceNumber: true, customerId: true, orderId: true, ironBillId: true, serviceAppointmentId: true, currency: true, balanceDue: true, status: true, voidedAt: true }, orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { id: 'asc' }] });
      if (receivables.length !== plan.length || receivables.some((row, index) => row.id !== plan[index].invoiceId
        || Math.round(Number(row.balanceDue) * 100) !== Math.round(plan[index].amount * 100)
        || row.customerId !== current.customerId || String(row.currency || 'INR') !== String(current.currency || 'INR') || row.voidedAt)) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_STALE', 'The outstanding invoices changed. Refresh the payment link and try again.', 409);
      }
      currentPlan = receivables.map((row) => ({ invoiceId: row.id, invoiceNumber: row.invoiceNumber, amount: Number(row.balanceDue), orderId: row.orderId || null }));
      for (const receivable of receivables) await assertSourcePayable(receivable);
    }
    const amountPaise = currentPlan
      ? currentPlan.reduce((sum, item) => sum + BigInt(Math.round(item.amount * 100)), 0n)
      : BigInt(Math.round(Number(current.balanceDue || 0) * 100));
    if (amountPaise < 100n) throw new RazorpayCheckoutError('INVALID_AMOUNT', 'The invoice has no payable balance');

    const reuseProviderOrder = async (prior) => {
      if (customCheckout) {
        const overlapping = await tx.razorpayCheckoutAttempt.findFirst({
          where: {
            id: { not: prior.id },
            ...(currentPlan ? { customerId: current.customerId } : { OR: [{ invoiceId: current.id }, { allocationPlan: { array_contains: [{ invoiceId: current.id }] } }] }),
            status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] },
          },
          select: { id: true },
        });
        if (overlapping) throw new RazorpayCheckoutError('CHECKOUT_ALREADY_IN_PROGRESS', 'Another checkout is active or needs review. Check its status before continuing.', 409, { checkoutAttemptId: overlapping.id });
      }
      if (customCheckout && (prior.invoiceId !== current.id || prior.customerId !== current.customerId)) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_BINDING_MISMATCH', 'The existing checkout belongs to a different invoice scope. Check its status before continuing.', 409, { checkoutAttemptId: prior.id });
      }
      // Public invoice links can be rotated while an unpaid checkout attempt
      // remains valid. Reuse is safe only after the provider checks below prove
      // that the original bound order has no payment attempts; keep the
      // original share binding on the attempt/order for audit and settlement.
      if ((prior.experimentId || null) !== (experiment?.id || null)
        || (prior.experimentVariant || null) !== (experiment?.variant || null)
        || (prior.experimentVisitorHash || null) !== (experiment?.visitorHash || null)) {
        throw new RazorpayCheckoutError('CHECKOUT_EXPERIMENT_ATTEMPT_MISMATCH', 'This payment attempt belongs to a different checkout presentation. Check its status before retrying.', 409, { checkoutAttemptId: prior.id });
      }
      if (prior.mode !== getMode() || prior.amountPaise !== amountPaise || prior.currency !== (current.currency || 'INR')
        || JSON.stringify(prior.allocationPlan?.map(({ invoiceId, amount }) => ({ invoiceId, amount })) || null)
          !== JSON.stringify(currentPlan?.map(({ invoiceId, amount }) => ({ invoiceId, amount })) || null)) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_STALE', 'The invoice balance or payment mode changed after this checkout began. Contact the store before retrying.', 409);
      }
      return { attempt: prior, order: { id: prior.razorpayOrderId, amount: Number(prior.amountPaise), currency: prior.currency }, reused: true };
    };

    const keyed = await tx.razorpayCheckoutAttempt.findUnique({ where: { idempotencyKey: localKey } });
    if (keyed) {
      if (keyed.invoiceId !== current.id || (keyed.publicShareId !== (shareId || null) && keyed.requestId !== HISTORICAL_ORDER_REQUEST)) {
        throw new RazorpayCheckoutError('IDEMPOTENCY_KEY_CONFLICT', 'This checkout request key is already bound to a different invoice link', 409);
      }
      if (keyed.status === 'CREATED' && keyed.razorpayOrderId) return reuseProviderOrder(keyed);
      if (keyed.status === 'FAILED') {
        if (customCheckout && keyed.razorpayOrderId) return reuseProviderOrder(keyed);
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_TERMINAL', 'This payment attempt failed. Start a new attempt to continue.', 409, { checkoutAttemptId: keyed.id });
      }
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_UNRESOLVED', 'This checkout request is still being created or needs review. Do not start another payment yet.', 409, { checkoutAttemptId: keyed.id });
    }

    const active = await tx.razorpayCheckoutAttempt.findFirst({
      where: { ...(plan ? { customerId: current.customerId } : { OR: [{ invoiceId: current.id }, { allocationPlan: { array_contains: [{ invoiceId: current.id }] } }] }), status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      if (active.invoiceId === current.id && active.status === 'CREATED' && active.razorpayOrderId) return reuseProviderOrder(active);
      throw new RazorpayCheckoutError('CHECKOUT_ALREADY_IN_PROGRESS', 'A payment attempt is already active or needs finance review. Do not start another payment.', 409, { checkoutAttemptId: active.id });
    }

    const priorFailed = await tx.razorpayCheckoutAttempt.findFirst({
      where: { ...(customCheckout && plan ? { customerId: current.customerId } : { OR: [{ invoiceId: current.id }, { allocationPlan: { array_contains: [{ invoiceId: current.id }] } }] }), status: 'FAILED', razorpayOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (customCheckout && priorFailed) {
      return reuseProviderOrder(priorFailed);
    }

    const continuesPaymentJourney = Boolean(priorFailed
      && priorFailed.amountPaise === amountPaise
      && priorFailed.mode === getMode()
      && priorFailed.currency === (current.currency || 'INR')
      && JSON.stringify(priorFailed.allocationPlan?.map(({ invoiceId, amount }) => ({ invoiceId, amount })) || null)
        === JSON.stringify(currentPlan?.map(({ invoiceId, amount }) => ({ invoiceId, amount })) || null));
    const paymentJourneyId = continuesPaymentJourney && priorFailed.paymentJourneyId
      ? priorFailed.paymentJourneyId
      : `pj_${crypto.randomUUID()}`;
    if (continuesPaymentJourney && !priorFailed.paymentJourneyId) {
      await tx.razorpayCheckoutAttempt.updateMany({
        where: { id: priorFailed.id, paymentJourneyId: null },
        data: { paymentJourneyId },
      });
    }

    const attempt = await tx.razorpayCheckoutAttempt.create({
      data: {
        paymentJourneyId,
        idempotencyKey: localKey,
        invoiceId: current.id,
        invoiceNumber: current.invoiceNumber,
        orderId: current.orderId || null,
        customerId: current.customerId,
        publicShareId: shareId || null,
        amountPaise,
        ...(currentPlan ? { allocationPlan: currentPlan } : {}),
        currency: current.currency || 'INR',
        mode: getMode(),
        status: 'CREATING',
        requestId: requestId || null,
        experimentId: experiment?.id || null,
        experimentVariant: experiment?.variant || null,
        experimentVisitorHash: experiment?.visitorHash || null,
      },
    });
    await auditAttemptTransition(tx, attempt, 'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED', 'A Razorpay checkout attempt was reserved for the current invoice balance', {
      requestId: requestId || null,
      publicShareId: shareId || null,
      ...(continuesPaymentJourney ? { supersedesAttemptId: priorFailed.id, retryReason: 'PROVIDER_CONFIRMED_FAILURE' } : {}),
      nextState: 'CREATING',
    });
    return { attempt, current, reused: false };
  }, { isolationLevel: 'Serializable' });

  let reservation;
  for (let retry = 0; ; retry += 1) {
    try {
      reservation = await reserveAttempt();
      break;
    } catch (error) {
      if (!isSerializationConflict(error) || retry >= 4) throw error;
      const backoffMs = Math.min(120, 10 * (2 ** retry)) + Math.floor(Math.random() * 20);
      console.warn(JSON.stringify({
        event: 'RAZORPAY_CHECKOUT_RESERVATION_RETRY',
        invoiceId: invoice.id,
        retry: retry + 1,
        retryLimit: 4,
        backoffMs,
        errorCode: serializationConflictCode(error),
      }));
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  if (reservation.reused) {
    if (!customCheckout) return reservation;
    let providerOrder;
    let providerPayments;
    try {
      providerOrder = await razorpay.orders.fetch(reservation.attempt.razorpayOrderId);
      providerPayments = await razorpay.orders.fetchPayments(reservation.attempt.razorpayOrderId);
    } catch (error) {
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_UNRESOLVED', 'The existing checkout could not be checked. Do not start another payment.', 503, { checkoutAttemptId: reservation.attempt.id, provider: getProviderError(error), providerLookupUnavailable: true });
    }
    const evidence = { attempt: reservation.attempt, providerOrder, providerPayments };
    if (!canResumeUnattemptedCheckout(evidence) && !canRetryFailedCheckout(evidence)) {
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_UNRESOLVED', 'Check the existing payment before starting another payment.', 409, { checkoutAttemptId: reservation.attempt.id });
    }
    if (reservation.attempt.status === 'FAILED') await prisma.$transaction((tx) => auditAttemptTransition(
      tx, reservation.attempt, 'RAZORPAY_FAILED_CHECKOUT_SAME_ORDER_RETRY',
      'Provider confirms an unpaid order with failed attempts; retry reuses the same bound order',
      { razorpayOrderId: providerOrder.id, providerAttemptCount: providerOrder.attempts, nextState: reservation.attempt.status },
    ));
    return { ...reservation, order: providerOrder };
  }
  let attempt = reservation.attempt;
  const currentInvoice = reservation.current;
  let providerAccepted = false;

  try {
    const order = await razorpay.orders.create({
      amount: Number(attempt.amountPaise),
      currency: attempt.currency,
      receipt: `hc-${attempt.id}`.slice(0, 40),
      ...(customCheckout ? { app_offer: true } : {}),
      notes: {
        crm_attempt_id: attempt.id,
        invoice_id: currentInvoice.id,
        ...(customCheckout ? { custom_checkout: '1', cred_coins_disabled: '1' } : {}),
        ...(planHash ? { allocation_plan_hash: planHash } : {}),
        ...(currentInvoice.orderId ? { crm_order_id: currentInvoice.orderId } : {}),
        ...(shareId ? { share_id: shareId } : {}),
      },
    });
    providerAccepted = true;
    if (customCheckout && !canResumeUnattemptedCheckout({
      attempt: { ...attempt, status: 'CREATED', razorpayOrderId: order.id }, providerOrder: order,
      providerPayments: await razorpay.orders.fetchPayments(order.id),
    })) throw new RazorpayCheckoutError('PROVIDER_ORDER_BINDING_MISMATCH', 'The returned provider order could not be verified. Check this attempt before continuing.', 409);
    attempt = await prisma.$transaction(async (tx) => {
      const updated = await tx.razorpayCheckoutAttempt.update({
        where: { id: attempt.id },
        data: { status: 'CREATED', razorpayOrderId: order.id },
      });
      await auditAttemptTransition(tx, updated, 'RAZORPAY_PROVIDER_ORDER_CREATED', 'Razorpay accepted the server-created order', {
        razorpayOrderId: order.id,
        providerReceipt: `hc-${attempt.id}`.slice(0, 40),
        priorState: 'CREATING',
        nextState: 'CREATED',
      });
      return updated;
    });
    return { attempt, order, reused: false };
  } catch (error) {
    const providerStatus = Number(error?.statusCode || error?.response?.status);
    const providerCode = safeProviderCode(error);
    const providerError = getProviderError(error);
    // Create Order documents this input-validation rejection. A generic
    // BAD_REQUEST_ERROR or HTTP 4xx is not evidence that no order exists.
    const amountValidationRejected = !providerAccepted && providerStatus === 400
      && providerError?.code === 'BAD_REQUEST_ERROR'
      && providerError?.source === 'business'
      && providerError?.step === 'payment_initiation'
      && providerError?.reason === 'input_validation_failed'
      && providerError?.field === 'amount'
      && !providerError?.metadata?.order_id && !providerError?.metadata?.payment_id;
    if (amountValidationRejected) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.razorpayCheckoutAttempt.update({
          where: { id: attempt.id },
          data: { status: 'CREATE_FAILED', failureCode: providerCode, failureMessage: safeProviderMessage(error),
            ...(customCheckout ? {
              providerErrorCode: getProviderError(error)?.code ?? null,
              providerErrorSource: getProviderError(error)?.source ?? null,
              providerErrorStep: getProviderError(error)?.step ?? null,
              providerErrorReason: getProviderError(error)?.reason ?? null,
              failureMessage: getProviderError(error)?.description ?? null,
            } : {}),
          },
        });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_REJECTED', 'Razorpay returned a definitive client error and rejected order creation; no payable order was created', {
          errorCode: providerCode,
          providerStatus,
          ...(customCheckout ? { providerError: getProviderError(error) } : {}),
          priorState: 'CREATING',
          nextState: 'CREATE_FAILED',
        }, 'FAILURE');
      });
      throw new RazorpayCheckoutError('CHECKOUT_ORDER_REJECTED', customCheckout ? 'Razorpay did not accept this checkout request.' : 'Razorpay rejected this checkout request. No payment was taken; you can try again.', 400, { checkoutAttemptId: attempt.id, providerCode, ...(customCheckout ? { provider: getProviderError(error) } : {}) });
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.razorpayCheckoutAttempt.update({
        where: { id: attempt.id },
        data: {
        // A timeout/connection reset can occur after Razorpay accepted the
        // request. Keep the invoice blocked for reconciliation instead of
        // risking a second payable order.
          status: 'REVIEW',
          failureCode: safeProviderCode(error),
          failureMessage: safeProviderMessage(error),
        },
      });
      await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_OUTCOME_UNKNOWN', 'Order creation outcome is ambiguous and requires reconciliation before another attempt', {
        errorCode: safeProviderCode(error),
        providerError: getProviderError(error),
        priorState: 'CREATING',
        nextState: 'REVIEW',
      }, 'FAILURE');
    }).catch((auditError) => console.error('[razorpay-checkout] could not persist ambiguous attempt:', auditError?.code || 'DB_ERROR'));
    throw new RazorpayCheckoutError(
      'CHECKOUT_RESULT_UNKNOWN',
      'Razorpay could not confirm whether this order was created. Do not retry; this attempt must be checked first.',
      503,
      { checkoutAttemptId: attempt.id, ...(customCheckout ? { provider: getProviderError(error), providerLookupUnavailable: true } : {}) }
    );
  }
};

const reconcileAmbiguousOrderCreation = async ({ attemptId, actor, provider: injectedProvider, customCheckout = false }) => {
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_FOUND', 'Checkout attempt was not found.', 404);
  if (attempt.mode !== getMode()) throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Attempt belongs to a different Razorpay mode; no provider lookup was performed.', 409);
  if (attempt.status !== 'REVIEW' || attempt.failureCode === 'OVERPAYMENT_NOT_ALLOWED') {
    throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_RECONCILABLE', 'This checkout attempt is not an ambiguous order-creation attempt.', 409);
  }

  const razorpay = injectedProvider || getRazorpay();
  if (attempt.razorpayOrderId) {
    let providerOrder;
    let providerPayments;
    try {
      [providerOrder, providerPayments] = await Promise.all([
        razorpay.orders.fetch(attempt.razorpayOrderId),
        razorpay.orders.fetchPayments(attempt.razorpayOrderId),
      ]);
    } catch (error) {
      throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_PROVIDER_FAILED', 'Could not verify this Razorpay order. The attempt remains blocked; check again later.', 502, { checkoutAttemptId: attempt.id, razorpayOrderId: attempt.razorpayOrderId, providerCode: safeProviderCode(error), ...(customCheckout ? { provider: getProviderError(error), providerLookupUnavailable: true } : {}) });
    }
    if (customCheckout) assertProviderCheckoutBinding({ attempt, providerOrder, providerPayments });
    const allocationHash = attempt.allocationPlan?.length
      ? digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount }))))
      : null;
    const orderMatches = providerOrder?.id === attempt.razorpayOrderId
      && providerOrder.receipt === `hc-${attempt.id}`.slice(0, 40)
      && providerOrder.notes?.crm_attempt_id === attempt.id
      && providerOrder.notes?.invoice_id === attempt.invoiceId
      && (!allocationHash || providerOrder.notes?.allocation_plan_hash === allocationHash)
      && Number(providerOrder.amount) === Number(attempt.amountPaise)
      && String(providerOrder.currency || '').toUpperCase() === String(attempt.currency).toUpperCase();
    if (!orderMatches || !Array.isArray(providerPayments?.items)) {
      throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_REQUIRES_REVIEW', 'Razorpay could not verify that this order exactly matches the saved invoice. Finance review is required; do not pay again.', 409, { checkoutAttemptId: attempt.id, razorpayOrderId: attempt.razorpayOrderId });
    }
    const payments = providerPayments.items;
    if (payments.some((payment) => String(payment.order_id || '') !== attempt.razorpayOrderId
      || Number(payment.amount) !== Number(attempt.amountPaise)
      || String(payment.currency || '').toUpperCase() !== String(attempt.currency).toUpperCase())) {
      throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_REQUIRES_REVIEW', 'Razorpay payment details do not exactly match this checkout. Finance review is required; do not pay again.', 409, { checkoutAttemptId: attempt.id, razorpayOrderId: attempt.razorpayOrderId });
    }
    const captured = payments.find((payment) => String(payment.status || '').toLowerCase() === 'captured');
    if (captured) {
      const result = await settleCapturedPayment({
        paymentId: captured.id,
        providerOrderId: attempt.razorpayOrderId,
        source: 'STATUS_POLL',
        expectedInvoiceId: attempt.invoiceId,
        expectedShareId: attempt.publicShareId,
        provider: razorpay,
      });
      return { attempt: result.attempt || await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } }), order: providerOrder, reused: false, captured: true };
    }
    if (payments.length && payments.every((payment) => String(payment.status || '').toLowerCase() === 'failed')) {
      const latestPayment = payments.reduce((latest, payment) => Number(payment.created_at || 0) > Number(latest?.created_at || 0) ? payment : latest, null);
      const failed = await markAttemptFailed({ attemptId: attempt.id, paymentId: latestPayment?.id || null, providerPayment: latestPayment, source: 'STATUS_POLL', allowReview: true });
      return { attempt: failed, order: providerOrder, reused: false, failed: true };
    }
    if (payments.length === 0 && canResumeUnattemptedCheckout({ attempt: { ...attempt, status: 'CREATED' }, providerOrder, providerPayments })) {
      const resumed = await prisma.$transaction(async (tx) => {
        const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
        if (!current || current.status !== 'REVIEW' || current.razorpayOrderId !== attempt.razorpayOrderId) {
          throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_CHANGED', 'Checkout attempt changed during reconciliation. Refresh its status before continuing.', 409, { checkoutAttemptId: attempt.id });
        }
        const updated = await tx.razorpayCheckoutAttempt.update({ where: { id: current.id }, data: { status: 'CREATED', ...clearProviderFailure } });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_RECONCILED', 'Razorpay confirmed the saved order is an exact, unattempted match; the existing checkout can resume', {
          actorId: actor?.id || null, razorpayOrderId: providerOrder.id, providerAttempts: 0, priorState: 'REVIEW', nextState: 'CREATED',
        });
        return updated;
      });
      return { attempt: resumed, order: { id: providerOrder.id, amount: Number(providerOrder.amount), currency: providerOrder.currency }, reused: true };
    }
    const latestPayment = payments.reduce((latest, payment) => Number(payment.created_at || 0) > Number(latest?.created_at || 0) ? payment : latest, null);
    let refreshed = attempt;
    if (latestPayment?.id) {
      refreshed = await prisma.$transaction(async (tx) => {
        const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
        if (!current || current.status !== 'REVIEW') return current;
        const updated = await tx.razorpayCheckoutAttempt.update({ where: { id: current.id }, data: { razorpayPaymentId: latestPayment.id, ...getCheckoutPaymentDiagnostics(latestPayment) } });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_REVIEW_PAYMENT_REFERENCE_REFRESHED', 'Latest nonterminal Razorpay payment reference recorded; checkout remains blocked pending a final provider state', {
          razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: latestPayment.id, providerStatus: latestPayment.status || null, source: 'STATUS_POLL', nextState: 'REVIEW',
        }, 'FAILURE');
        return updated;
      });
    }
    return { attempt: refreshed, order: providerOrder, reused: false, pending: payments.length > 0 };
  }
  const receipt = `hc-${attempt.id}`.slice(0, 40);
  const matches = [];
  const seenOrderIds = new Set();
  let lookupComplete = false;
  try {
    // Receipt is a provider filter, not proof of an exact unique match.
    // Bound provider work and never resume from a truncated or repeated page.
    for (let page = 0; page < 100; page += 1) {
      const result = await razorpay.orders.all({ receipt, count: 100, skip: page * 100 });
      if (!Array.isArray(result?.items) || result.items.length > 100) break;
      let repeated = false;
      for (const order of result.items) {
        if (!order?.id || seenOrderIds.has(order.id)) {
          repeated = true;
          break;
        }
        seenOrderIds.add(order.id);
        if (order.receipt === receipt) matches.push(order);
      }
      if (repeated) break;
      if (result.items.length < 100) {
        lookupComplete = true;
        break;
      }
    }
  } catch (error) {
    throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_PROVIDER_FAILED', 'Could not verify the order with Razorpay. The attempt remains blocked; retry reconciliation later.', 502, { checkoutAttemptId: attempt.id, providerCode: safeProviderCode(error), ...(customCheckout ? { provider: getProviderError(error), providerLookupUnavailable: true } : {}) });
  }
  if (!lookupComplete || matches.length !== 1) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) return;
      await auditAttemptTransition(tx, current, 'RAZORPAY_ORDER_CREATE_RECONCILIATION_NO_UNIQUE_MATCH', 'Receipt lookup did not return exactly one matching Razorpay order; attempt remains blocked', {
        requestId: actor?.requestId || null,
        providerReceipt: receipt,
        matchCount: matches.length,
        lookupComplete,
        nextState: 'REVIEW',
      }, 'FAILURE');
    });
    throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_NO_UNIQUE_ORDER', 'Razorpay did not establish exactly one matching order across a complete lookup. This attempt remains blocked for review.', 409, { checkoutAttemptId: attempt.id, matchCount: matches.length, lookupComplete });
  }

  const order = matches[0];
  let customResumable = false;
  if (customCheckout && order.id) {
    const providerPayments = await razorpay.orders.fetchPayments(order.id);
    const boundAttempt = { ...attempt, status: 'CREATED', razorpayOrderId: order.id };
    assertProviderCheckoutBinding({ attempt: boundAttempt, providerOrder: order, providerPayments });
    customResumable = canResumeUnattemptedCheckout({ attempt: boundAttempt, providerOrder: order, providerPayments });
  }
  const safelyResumable = customCheckout ? customResumable : order.id && order.status === 'created'
    && Number(order.attempts) === 0
    && Number(order.amount) === Number(attempt.amountPaise)
    && Number(order.amount_paid) === 0
    && Number(order.amount_due) === Number(attempt.amountPaise)
    && String(order.currency || '').toUpperCase() === String(attempt.currency).toUpperCase()
    && order.notes?.crm_attempt_id === attempt.id
    && order.notes?.invoice_id === attempt.invoiceId
    && (!attempt.allocationPlan || order.notes?.allocation_plan_hash === digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))));

  if (customCheckout && !safelyResumable && order.id) {
    // Exact receipt/notes/amount binding was verified above. Attach the found
    // order before reconciling its payments; never create a replacement.
    await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_CHANGED', 'Checkout changed during reconciliation. Refresh its status.', 409, { checkoutAttemptId: attempt.id });
      }
      const linked = await tx.razorpayCheckoutAttempt.update({ where: { id: current.id }, data: { razorpayOrderId: order.id } });
      await auditAttemptTransition(tx, linked, 'RAZORPAY_ORDER_CREATE_RECONCILED', 'Receipt lookup bound the existing provider order; payment reconciliation remains required', {
        razorpayOrderId: order.id, providerReceipt: receipt, priorState: 'REVIEW', nextState: 'REVIEW',
      });
    });
    return reconcileAmbiguousOrderCreation({ attemptId, actor, provider: razorpay, customCheckout: true });
  }

  if (!safelyResumable) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) return;
      const linked = await tx.razorpayCheckoutAttempt.update({
        where: { id: current.id },
        data: { razorpayOrderId: order.id || null },
      });
      await auditAttemptTransition(tx, linked, 'RAZORPAY_ORDER_CREATE_RECONCILIATION_REQUIRES_REVIEW', 'Razorpay order was found but is not eligible for automatic checkout resume', {
        providerReceipt: receipt,
        razorpayOrderId: order.id || null,
        providerStatus: order.status || null,
        providerAttempts: Number(order.attempts) || 0,
        nextState: 'REVIEW',
      }, 'FAILURE');
    });
    throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_REQUIRES_REVIEW', 'Razorpay found an order that may have been attempted or does not match the saved invoice. Finance review is required; do not pay again.', 409, { checkoutAttemptId: attempt.id, razorpayOrderId: order.id || null });
  }

  const resumed = await prisma.$transaction(async (tx) => {
    const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) {
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_CHANGED', 'Checkout attempt changed during reconciliation. Refresh its status before continuing.', 409, { checkoutAttemptId: attempt.id });
    }
    const updated = await tx.razorpayCheckoutAttempt.update({
      where: { id: current.id },
      data: { status: 'CREATED', razorpayOrderId: order.id, ...clearProviderFailure },
    });
    await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_RECONCILED', 'Unique Razorpay receipt lookup verified an unattempted order and restored checkout availability', {
      actorId: actor?.id || null,
      providerReceipt: receipt,
      razorpayOrderId: order.id,
      providerStatus: order.status,
      providerAttempts: 0,
      priorState: 'REVIEW',
      nextState: 'CREATED',
    });
    return updated;
  });
  return { attempt: resumed, order: { id: order.id, amount: Number(order.amount), currency: order.currency }, reused: true };
};

const markAttemptFailed = async ({ attemptId, paymentId = null, providerPayment = null, source = 'STATUS_POLL', allowReview = false }) => prisma.$transaction(async (tx) => {
  const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!current || ['CAPTURED', 'CREATE_FAILED'].includes(current.status) || (current.status === 'REVIEW' && !allowReview)) return current;
  const providerDiagnostics = getCheckoutPaymentDiagnostics(providerPayment);
  if (current.status === 'FAILED') {
    if (!paymentId || current.razorpayPaymentId === paymentId || String(providerPayment?.status || '').toLowerCase() !== 'failed') return current;
    const changed = await tx.razorpayCheckoutAttempt.updateMany({
      where: { id: current.id, status: 'FAILED' },
      data: { razorpayPaymentId: paymentId, ...providerDiagnostics },
    });
    const refreshed = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: current.id } });
    if (changed.count) await auditAttemptTransition(tx, refreshed, 'RAZORPAY_PAYMENT_PROVIDER_FAILURE_REFRESHED', 'Razorpay confirmed a newer failed payment on the same checkout Order', {
      razorpayOrderId: current.razorpayOrderId,
      priorPaymentId: current.razorpayPaymentId,
      razorpayPaymentId: paymentId,
      source,
      priorState: 'FAILED',
      nextState: 'FAILED',
      providerDiagnostics,
    }, 'FAILURE');
    return refreshed;
  }
  const updated = await tx.razorpayCheckoutAttempt.update({
    where: { id: current.id },
    data: {
      status: 'FAILED',
      ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
      failureCode: 'PAYMENT_FAILED',
      completedAt: new Date(),
      ...providerDiagnostics,
    },
  });
  await auditAttemptTransition(tx, updated, 'RAZORPAY_PAYMENT_PROVIDER_FAILED', 'Razorpay confirmed that the checkout payment failed', {
    razorpayOrderId: current.razorpayOrderId,
    razorpayPaymentId: paymentId,
    source,
    priorState: current.status,
    nextState: 'FAILED',
    providerDiagnostics,
  }, 'FAILURE');
  return updated;
});

const markAttemptPending = async ({ attemptId, paymentId, providerPayment, source = 'STATUS_POLL' }) => prisma.$transaction(async (tx) => {
  const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!current || ['CAPTURED', 'REVIEW', 'CREATE_FAILED'].includes(current.status)) return current;
  const providerDiagnostics = getCheckoutPaymentDiagnostics(providerPayment);
  const updated = await tx.razorpayCheckoutAttempt.update({
    where: { id: current.id },
    data: {
      status: 'PENDING',
      ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
      failureCode: null,
      failureMessage: null,
      completedAt: null,
      ...providerDiagnostics,
    },
  });
  await auditAttemptTransition(tx, updated, 'RAZORPAY_PAYMENT_PROVIDER_PENDING', 'Razorpay reports a nonterminal retry on the checkout Order', {
    razorpayOrderId: current.razorpayOrderId,
    razorpayPaymentId: paymentId,
    source,
    priorState: current.status,
    nextState: 'PENDING',
    providerDiagnostics,
  });
  return updated;
});

const assertExistingSettlementBinding = (payment, attempt) => {
  const expected = attempt.allocationPlan || [{ invoiceId: attempt.invoiceId, amount: Number(attempt.amountPaise) / 100 }];
  const paise = (amount) => Math.round(Number(amount) * 100);
  if (!Array.isArray(expected) || !expected.length
    || new Set(expected.map((item) => item.invoiceId)).size !== expected.length
    || expected.some((item) => !Number.isSafeInteger(paise(item.amount)) || paise(item.amount) <= 0)
    || expected.reduce((sum, item) => sum + paise(item.amount), 0) !== Number(attempt.amountPaise)
    || !expected.some((item) => item.invoiceId === attempt.invoiceId)
    || payment.customerId !== attempt.customerId
    || payment.razorpayOrderId !== attempt.razorpayOrderId
    || payment.mode !== attempt.mode
    || paise(payment.amount) !== Number(attempt.amountPaise)
    || payment.allocations.length !== expected.length
    || new Set(payment.allocations.map((item) => item.invoiceId)).size !== payment.allocations.length
    || expected.some((item) => !payment.allocations.some((allocation) => allocation.invoiceId === item.invoiceId
      && paise(allocation.amount) === paise(item.amount)))) {
    throw new RazorpayCheckoutError('PAYMENT_ALREADY_LINKED', 'The saved payment binding and allocations do not match this checkout', 409);
  }
};

const findExistingSettlement = async (db, paymentId, attempt) => {
  const payment = await db.payment.findFirst({
    where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' },
    include: { allocations: { where: { status: 'POSTED' }, select: { invoiceId: true, amount: true } } },
  });
  if (!payment) return null;
  assertExistingSettlementBinding(payment, attempt);
  const invoice = await db.invoice.findUnique({ where: { id: attempt.invoiceId }, select: { id: true, invoiceNumber: true, status: true, balanceDue: true, orderId: true } });
  const ledger = invoice?.orderId ? await getLedgerState(db, invoice.orderId) : null;
  return {
    payment,
    invoice,
    order: ledger ? { ...ledger.order, paidAmount: ledger.paidAmount, writeOffAmount: ledger.writeOffAmount, balanceDue: ledger.balanceDue } : null,
    alreadyRecorded: true,
  };
};

const verifyProviderSignature = ({ orderId, paymentId, signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(String(signature || ''))) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(String(signature), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

const matchesExpectedCheckoutBinding = ({ attempt, expectedInvoiceId = null, expectedShareId = null }) => (
  Boolean(attempt)
  && (!expectedInvoiceId || attempt.invoiceId === expectedInvoiceId)
  && (!expectedShareId || attempt.publicShareId === expectedShareId)
);

const settleCapturedPayment = async ({ paymentId, providerOrderId, signature = null, source = 'CALLBACK', expectedInvoiceId = null, expectedShareId = null, provider: injectedProvider, historicalReportOrder = null }) => {
  if (!paymentId || !providerOrderId) throw new RazorpayCheckoutError('PAYMENT_REFERENCE_REQUIRED', 'Razorpay payment and order references are required');
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: providerOrderId } });
  if (!attempt) throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_FOUND', 'No CRM checkout attempt matches this Razorpay order', 404);
  if (!matchesExpectedCheckoutBinding({ attempt, expectedInvoiceId, expectedShareId })) {
    throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_BINDING_MISMATCH', 'This checkout attempt does not belong to the requested invoice link', 409);
  }
  if (attempt.mode !== getMode()) throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Payment was started in a different Razorpay mode. Contact support before retrying.', 409);

  if (signature && !verifyProviderSignature({ orderId: attempt.razorpayOrderId, paymentId, signature })) {
    throw new RazorpayCheckoutError('INVALID_CHECKOUT_SIGNATURE', 'Payment verification failed because the checkout signature is invalid', 400);
  }

  const razorpay = injectedProvider || getRazorpay();
  const usesHistoricalReport = source === 'FINANCE_HISTORICAL_REPORT' && historicalReportOrder;
  if (historicalReportOrder && !usesHistoricalReport) {
    throw new RazorpayCheckoutError('HISTORICAL_REPORT_SOURCE_INVALID', 'Dashboard report Order evidence is valid only for the historical Finance reconciliation flow.', 400);
  }
  const [providerOrder, providerPayment] = await Promise.all([
    usesHistoricalReport ? Promise.resolve(historicalReportOrder) : razorpay.orders.fetch(providerOrderId),
    razorpay.payments.fetch(paymentId),
  ]);
  const orderBoundToAttempt = usesHistoricalReport
    ? !attempt.allocationPlan && providerOrder.id === attempt.razorpayOrderId && providerOrder.invoiceId === attempt.invoiceId
      && providerOrder.status === 'paid' && Number(providerOrder.amountPaidPaise) === Number(attempt.amountPaise)
      && Number(providerOrder.amountDuePaise) === 0 && Number(providerOrder.attempts) >= 1
    : providerOrder.id === attempt.razorpayOrderId && providerOrder.notes?.crm_attempt_id === attempt.id && providerOrder.notes?.invoice_id === attempt.invoiceId
      && (!attempt.publicShareId || providerOrder.notes?.share_id === attempt.publicShareId)
      && (!attempt.allocationPlan || providerOrder.notes?.allocation_plan_hash === digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))));
  if (!orderBoundToAttempt) {
    throw new RazorpayCheckoutError('PROVIDER_ORDER_BINDING_MISMATCH', 'Razorpay order does not match the saved CRM checkout attempt', 409);
  }
  if (String(providerPayment.order_id || '') !== attempt.razorpayOrderId || String(providerPayment.id || '') !== paymentId) {
    throw new RazorpayCheckoutError('PROVIDER_PAYMENT_BINDING_MISMATCH', 'Razorpay payment does not match the saved checkout order', 409);
  }
  if (Number(providerPayment.amount) !== Number(attempt.amountPaise) || Number(providerOrder.amountPaise ?? providerOrder.amount) !== Number(attempt.amountPaise)) {
    throw new RazorpayCheckoutError('PROVIDER_AMOUNT_MISMATCH', 'Razorpay amount does not match the saved invoice balance', 409);
  }
  if (String(providerPayment.currency || '').toUpperCase() !== attempt.currency.toUpperCase() || String(providerOrder.currency || '').toUpperCase() !== attempt.currency.toUpperCase()) {
    throw new RazorpayCheckoutError('PROVIDER_CURRENCY_MISMATCH', 'Razorpay currency does not match the invoice', 409);
  }
  const state = String(providerPayment.status || '').toLowerCase();
  if (state !== 'captured') {
    const nextStatus = state === 'failed' ? 'FAILED' : 'PENDING';
    const providerDiagnostics = getCheckoutPaymentDiagnostics(providerPayment);
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (current.status === 'CAPTURED' || current.status === 'REVIEW') return current;
      const next = await tx.razorpayCheckoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: nextStatus,
          razorpayPaymentId: paymentId,
          failureCode: state === 'failed' ? 'PAYMENT_FAILED' : null,
          ...providerDiagnostics,
        },
      });
      await auditAttemptTransition(tx, next, nextStatus === 'FAILED' ? 'RAZORPAY_PAYMENT_PROVIDER_FAILED' : 'RAZORPAY_PAYMENT_PROVIDER_PENDING', `Razorpay payment state verified as ${state}`, {
        razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId, providerStatus: state, source, nextState: nextStatus,
        priorState: current.status, providerDiagnostics,
      }, nextStatus === 'FAILED' ? 'FAILURE' : 'SUCCESS');
      return next;
    });
    return { attempt: updated, pending: updated.status !== 'FAILED' && updated.status !== 'CAPTURED', failed: updated.status === 'FAILED', providerStatus: state };
  }
  const refundedAmount = Number(providerPayment.amount_refunded ?? 0);
  const refundStatus = providerPayment.refund_status ?? null;
  if (!Number.isSafeInteger(refundedAmount) || refundedAmount < 0 || refundedAmount > 0
    || ![null, 'partial', 'full'].includes(refundStatus) || refundStatus !== null) {
    throw new RazorpayCheckoutError('PROVIDER_PAYMENT_REFUND_REVIEW', 'Razorpay reports a refund or an unknown refund state for this payment. Finance review is required before recording it.', 409);
  }
  if (providerPayment.method === 'bank_transfer') {
    const { validateRazorpayBankTransferSettlement } = require('./razorpay-bank-transfer.service');
    await validateRazorpayBankTransferSettlement({ attempt, providerOrder, providerPayment, provider: razorpay });
  }
  const existingResult = await prisma.$transaction(async (tx) => {
    const existing = await findExistingSettlement(tx, paymentId, attempt);
    if (!existing) return null;
    const changed = await tx.razorpayCheckoutAttempt.updateMany({
      where: { id: attempt.id, status: { not: 'CAPTURED' } },
      data: {
        status: 'CAPTURED', razorpayPaymentId: paymentId, completedAt: new Date(),
        ...clearProviderFailure,
        providerMethod: existing.payment.providerMethod || null,
        providerMethodDetail: existing.payment.providerMethodDetail || null,
      },
    });
    const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    if (changed.count) await auditAttemptTransition(tx, current, 'RAZORPAY_ATTEMPT_CAPTURE_CONFIRMED', 'Previously posted Razorpay payment reconciled to its checkout attempt', {
      razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId, source, nextState: 'CAPTURED', priorState: attempt.status,
    });
    return { ...existing, attempt: current, alreadyRecorded: true };
  }, { isolationLevel: 'Serializable' });
  if (existingResult) return existingResult;
  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.payment.findFirst({
        where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' },
        include: { allocations: { where: { status: 'POSTED' }, select: { invoiceId: true, amount: true } } },
      });
      if (duplicate) {
        assertExistingSettlementBinding(duplicate, attempt);
        const currentInvoice = await tx.invoice.findUnique({ where: { id: attempt.invoiceId } });
        const completedAttempt = await tx.razorpayCheckoutAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'CAPTURED', razorpayPaymentId: paymentId, completedAt: new Date(),
            ...clearProviderFailure, ...getSafeRazorpayPaymentMethod(providerPayment),
          },
        });
        await auditAttemptTransition(tx, completedAttempt, 'RAZORPAY_DUPLICATE_CAPTURE_RECONCILED', 'Duplicate callback resolved to the existing CRM payment without a second ledger entry', {
          razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId, source, nextState: 'CAPTURED',
          priorState: attempt.status,
        });
        await recordExperimentCapture(tx, completedAttempt);
        return { payment: duplicate, invoice: currentInvoice, alreadyRecorded: true, attempt: completedAttempt };
      }

      const settlementArgs = {
        amount: Number(providerPayment.amount) / 100,
        method: 'RAZORPAY',
        reference: paymentId,
        notes: `Razorpay invoice checkout (${source})`,
        idempotencyKey: `razorpay-captured:${paymentId}`,
        razorpayOrderId: attempt.razorpayOrderId,
        razorpayPaymentId: paymentId,
        ...getSafeRazorpayPaymentMethod(providerPayment),
        mode: attempt.mode,
        providerCaptureVerified: true,
      };
      const settlement = attempt.allocationPlan
        ? await recordInvoiceAllocationsSettlement(tx, { ...settlementArgs, allocations: attempt.allocationPlan, expectedCustomerId: attempt.customerId, expectedCurrency: attempt.currency })
        : await recordInvoiceSettlement(tx, { ...settlementArgs, invoiceId: attempt.invoiceId });

      const completedAttempt = await tx.razorpayCheckoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CAPTURED', razorpayPaymentId: paymentId, completedAt: new Date(),
          ...clearProviderFailure, ...getSafeRazorpayPaymentMethod(providerPayment),
        },
      });
      await auditAttemptTransition(tx, completedAttempt, 'RAZORPAY_PAYMENT_CAPTURE_POSTED', 'Captured Razorpay payment posted to the canonical CRM invoice ledger', {
        razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId,
        crmPaymentId: settlement.payment?.id || null, source, nextState: 'CAPTURED',
        priorState: attempt.status,
      });
      await recordExperimentCapture(tx, completedAttempt);
      if (settlement.payment && settlement.order) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.PAYMENT_RECEIVED,
          aggregateType: 'order',
          aggregateId: settlement.order.id,
          payload: {
            paymentId: settlement.payment.id,
            source: `RAZORPAY_${source}`,
            checkoutAttemptId: completedAttempt.id,
            paymentJourneyId: completedAttempt.paymentJourneyId,
          },
          dedupeKey: `payment-received:${settlement.payment.id}`,
        });
      } else if (settlement.payment) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.INVOICE_PAYMENT_RECEIVED,
          aggregateType: 'invoice',
          aggregateId: attempt.invoiceId,
          payload: {
            paymentId: settlement.payment.id,
            source: `RAZORPAY_${source}`,
            checkoutAttemptId: completedAttempt.id,
            paymentJourneyId: completedAttempt.paymentJourneyId,
          },
          dedupeKey: `payment-received:${settlement.payment.id}`,
        });
      }
      return { ...settlement, attempt: completedAttempt, alreadyRecorded: false };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof PaymentRuleError) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.razorpayCheckoutAttempt.update({
          where: { id: attempt.id },
          data: { status: 'REVIEW', razorpayPaymentId: paymentId, failureCode: error.code || 'LEDGER_RULE_REJECTED', failureMessage: String(error.message || 'Settlement requires finance review').slice(0, 240) },
        });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_CAPTURE_REQUIRES_FINANCE_REVIEW', 'Razorpay reports a captured payment that did not pass CRM ledger rules', {
          razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId,
          errorCode: error.code || 'LEDGER_RULE_REJECTED', source, nextState: 'REVIEW',
          priorState: attempt.status,
        }, 'FAILURE');
      }).catch((auditError) => console.error('[razorpay-checkout] could not persist settlement review:', auditError?.code || 'DB_ERROR'));
      throw new RazorpayCheckoutError('SETTLEMENT_REQUIRES_REVIEW', 'Razorpay confirms payment, but CRM could not apply it automatically. Finance review is required; do not pay again.', 409);
    }
    if (error?.code === 'P2002') {
      const concurrent = await prisma.$transaction((tx) => findExistingSettlement(tx, paymentId, attempt), { isolationLevel: 'Serializable' });
      if (concurrent) return { ...concurrent, attempt, alreadyRecorded: true };
    }
    throw error;
  }
};

module.exports = { RazorpayCheckoutError, assertProviderCheckoutBinding, auditAttemptTransition, canResumeUnattemptedCheckout, canRetryFailedCheckout, createInvoiceCheckout, getMode, getProviderError, getProviderPaymentError, getRazorpay, getUnattemptedCheckoutResumeBlockReason, markAttemptFailed, markAttemptPending, matchesExpectedCheckoutBinding, reconcileAmbiguousOrderCreation, safeProviderCode, safeProviderMessage, settleCapturedPayment };
