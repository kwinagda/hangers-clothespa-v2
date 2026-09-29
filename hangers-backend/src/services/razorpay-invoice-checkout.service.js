const crypto = require('crypto');
const Razorpay = require('razorpay');
const prisma = require('../config/database');
const { PaymentRuleError, getLedgerState, recordInvoiceAllocationsSettlement, recordInvoiceSettlement } = require('./payment.service');
const { enqueueOutboxEvent, OUTBOX_EVENT } = require('./outbox.service');
const { writeAuditEvent } = require('./activity.service');
const { razorpayErrorSummary } = require('../utils/redact');
const { getSafeRazorpayPaymentMethod, getSafeRazorpayPaymentDiagnostics } = require('../utils/razorpay-payment-method');

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
const safeProviderCode = (error) => String(razorpayErrorSummary(error).code || 'PROVIDER_ERROR').slice(0, 80);
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
const getUnattemptedCheckoutResumeBlockReason = ({ attempt, providerOrder, providerPayments }) => {
  if (!attempt || attempt.status !== 'CREATED' || !attempt.razorpayOrderId) return 'CRM_ATTEMPT_NOT_RESUMABLE';
  if (!providerOrder) return 'PROVIDER_ORDER_MISSING';
  if (providerOrder.id !== attempt.razorpayOrderId) return 'PROVIDER_ORDER_ID_MISMATCH';
  if (String(providerOrder.status || '').toLowerCase() !== 'created') return 'PROVIDER_ORDER_NOT_CREATED';
  if (!Number.isSafeInteger(Number(providerOrder.attempts))) return 'PROVIDER_ATTEMPT_COUNT_INVALID';
  if (Number(providerOrder.attempts) !== 0) return 'PROVIDER_ATTEMPTS_EXIST';
  const amount = Number(providerOrder.amount);
  const amountDue = Number(providerOrder.amount_due);
  const amountPaid = Number(providerOrder.amount_paid);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(amountDue) || !Number.isSafeInteger(amountPaid)) return 'PROVIDER_AMOUNT_INVALID';
  if (BigInt(amount) !== attempt.amountPaise) return 'PROVIDER_AMOUNT_MISMATCH';
  if (BigInt(amountDue) !== attempt.amountPaise) return 'PROVIDER_AMOUNT_DUE_MISMATCH';
  if (amountPaid !== 0) return 'PROVIDER_AMOUNT_ALREADY_PAID';
  if (String(providerOrder.currency || '').toUpperCase() !== String(attempt.currency || '').toUpperCase()) return 'PROVIDER_CURRENCY_MISMATCH';
  if (providerOrder.notes?.crm_attempt_id !== attempt.id || providerOrder.notes?.invoice_id !== attempt.invoiceId) return 'PROVIDER_INVOICE_BINDING_MISMATCH';
  if (attempt.allocationPlan && providerOrder.notes?.allocation_plan_hash !== digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount }))))) return 'PROVIDER_ALLOCATION_BINDING_MISMATCH';
  if (!Array.isArray(providerPayments?.items)) return 'PROVIDER_PAYMENT_LIST_UNAVAILABLE';
  if (providerPayments.items.length !== 0) return 'PROVIDER_PAYMENT_ATTEMPTS_EXIST';
  return null;
};
const canResumeUnattemptedCheckout = (input) => getUnattemptedCheckoutResumeBlockReason(input) === null;
const auditAttemptTransition = (tx, attempt, action, description, metadata = {}, status = 'SUCCESS') => writeAuditEvent(tx, {
  actorType: 'system',
  actorName: 'Razorpay integration',
  action,
  status: status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
  resource: 'razorpay_checkout_attempt',
  resourceId: attempt.id,
  description,
  metadata: {
    provider: 'RAZORPAY',
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    invoiceNumber: attempt.invoiceNumber,
    amountPaise: String(attempt.amountPaise),
    currency: attempt.currency,
    mode: attempt.mode,
    priorState: attempt.status,
    ...metadata,
  },
});

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

const createInvoiceCheckout = async ({ invoice, shareId, idempotencyKey, requestId, experiment, allocationPlan: requestedPlan = null, provider: injectedProvider }) => {
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
    if (plan) {
      const linkedRows = await tx.invoice.findMany({ where: { id: { in: lockIds } }, select: { orderId: true } });
      for (const orderId of [...new Set(linkedRows.map((row) => row.orderId).filter(Boolean))].sort()) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      }
    }
    const locked = [];
    for (const id of lockIds) locked.push(...await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${id} FOR UPDATE`);
    if (locked.length !== lockIds.length || !locked.some((row) => row.id === invoice.id)) throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'Online payment is not available for this invoice', 404);
    const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!current || current.voidedAt || current.status === 'VOID') throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'This invoice cannot accept payments', 409);
    if (current.orderId) {
      const lockedOrder = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${current.orderId} FOR UPDATE`;
      const order = lockedOrder.length
        ? await tx.order.findUnique({ where: { id: current.orderId }, select: { status: true } })
        : null;
      if (!order || order.status === 'CANCELLED') {
        throw new RazorpayCheckoutError('ORDER_CANCELLED', 'A cancelled order cannot accept a new payment.', 409);
      }
    }
    let currentPlan = null;
    if (plan) {
      const receivables = await tx.invoice.findMany({ where: { customerId: current.customerId, status: { not: 'VOID' }, balanceDue: { gt: 0 } }, select: { id: true, invoiceNumber: true, customerId: true, orderId: true, currency: true, balanceDue: true, status: true, voidedAt: true }, orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { id: 'asc' }] });
      if (receivables.length !== plan.length || receivables.some((row, index) => row.id !== plan[index].invoiceId
        || Math.round(Number(row.balanceDue) * 100) !== Math.round(plan[index].amount * 100)
        || row.customerId !== current.customerId || String(row.currency || 'INR') !== String(current.currency || 'INR') || row.voidedAt)) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_STALE', 'The outstanding invoices changed. Refresh the payment link and try again.', 409);
      }
      currentPlan = receivables.map((row) => ({ invoiceId: row.id, invoiceNumber: row.invoiceNumber, amount: Number(row.balanceDue), orderId: row.orderId || null }));
      for (const orderId of [...new Set(currentPlan.map((item) => item.orderId).filter(Boolean))].sort()) {
        const lockedOrder = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
        const order = lockedOrder.length ? await tx.order.findUnique({ where: { id: orderId }, select: { status: true } }) : null;
        if (!order || order.status === 'CANCELLED') throw new RazorpayCheckoutError('ORDER_CANCELLED', 'A cancelled order cannot accept a new payment.', 409);
      }
    }
    const amountPaise = currentPlan
      ? currentPlan.reduce((sum, item) => sum + BigInt(Math.round(item.amount * 100)), 0n)
      : BigInt(Math.round(Number(current.balanceDue || 0) * 100));
    if (amountPaise < 100n) throw new RazorpayCheckoutError('INVALID_AMOUNT', 'The invoice has no payable balance');

    const reuseProviderOrder = async (prior) => {
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
      where: { invoiceId: current.id, status: 'FAILED', razorpayOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const attempt = await tx.razorpayCheckoutAttempt.create({
      data: {
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
      ...(priorFailed ? { supersedesAttemptId: priorFailed.id, retryReason: 'PROVIDER_CONFIRMED_FAILURE' } : {}),
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
        errorCode: error?.code === 'P2034' ? 'P2034' : '40001',
      }));
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  if (reservation.reused) return reservation;
  let attempt = reservation.attempt;
  const currentInvoice = reservation.current;

  try {
    const order = await razorpay.orders.create({
      amount: Number(attempt.amountPaise),
      currency: attempt.currency,
      receipt: `hc-${attempt.id}`.slice(0, 40),
      notes: {
        crm_attempt_id: attempt.id,
        invoice_id: currentInvoice.id,
        ...(planHash ? { allocation_plan_hash: planHash } : {}),
        ...(currentInvoice.orderId ? { crm_order_id: currentInvoice.orderId } : {}),
        ...(shareId ? { share_id: shareId } : {}),
      },
    });
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
    if (providerStatus >= 400 && providerStatus < 500) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.razorpayCheckoutAttempt.update({
          where: { id: attempt.id },
          data: { status: 'CREATE_FAILED', failureCode: providerCode, failureMessage: safeProviderMessage(error) },
        });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_REJECTED', 'Razorpay returned a definitive client error and rejected order creation; no payable order was created', {
          errorCode: providerCode,
          providerStatus,
          priorState: 'CREATING',
          nextState: 'CREATE_FAILED',
        }, 'FAILURE');
      });
      throw new RazorpayCheckoutError('CHECKOUT_ORDER_REJECTED', 'Razorpay rejected this checkout request. No payment was taken; you can try again.', 400, { checkoutAttemptId: attempt.id, providerCode });
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
        providerError: razorpayErrorSummary(error),
        priorState: 'CREATING',
        nextState: 'REVIEW',
      }, 'FAILURE');
    }).catch((auditError) => console.error('[razorpay-checkout] could not persist ambiguous attempt:', auditError?.code || 'DB_ERROR'));
    throw new RazorpayCheckoutError(
      'CHECKOUT_RESULT_UNKNOWN',
      'Razorpay could not confirm whether this order was created. Do not retry; this attempt must be checked first.',
      503,
      { checkoutAttemptId: attempt.id }
    );
  }
};

const reconcileAmbiguousOrderCreation = async ({ attemptId, actor, provider: injectedProvider }) => {
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_FOUND', 'Checkout attempt was not found.', 404);
  if (attempt.mode !== getMode()) throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Attempt belongs to a different Razorpay mode; no provider lookup was performed.', 409);
  if (attempt.status !== 'REVIEW' || attempt.razorpayOrderId || attempt.failureCode === 'OVERPAYMENT_NOT_ALLOWED') {
    throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_RECONCILABLE', 'This checkout attempt is not an ambiguous order-creation attempt.', 409);
  }

  // Older releases incorrectly recorded definitive Razorpay 4xx rejections as
  // ambiguous. BAD_REQUEST_ERROR is Razorpay's rejected-request code; no order
  // was created, so close this attempt and allow a fresh checkout.
  if (attempt.failureCode === 'BAD_REQUEST_ERROR') {
    const failed = await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_CHANGED', 'Checkout attempt changed during reconciliation. Refresh its status before continuing.', 409, { checkoutAttemptId: attempt.id });
      }
      const updated = await tx.razorpayCheckoutAttempt.update({
        where: { id: current.id },
        data: { status: 'CREATE_FAILED' },
      });
      await auditAttemptTransition(tx, updated, 'RAZORPAY_ORDER_CREATE_REJECTION_CONFIRMED', 'Previously misclassified BAD_REQUEST_ERROR was confirmed as a definitive Razorpay order-create rejection; no payment order exists', {
        actorId: actor?.id || null,
        errorCode: current.failureCode,
        priorState: 'REVIEW',
        nextState: 'CREATE_FAILED',
      }, 'FAILURE');
      return updated;
    });
    return { attempt: failed, order: null, reused: false, rejected: true };
  }

  const razorpay = injectedProvider || getRazorpay();
  const receipt = `hc-${attempt.id}`.slice(0, 40);
  let result;
  try {
    result = await razorpay.orders.all({ receipt, count: 100 });
  } catch (error) {
    throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_PROVIDER_FAILED', 'Could not verify the order with Razorpay. The attempt remains blocked; retry reconciliation later.', 502, { checkoutAttemptId: attempt.id, providerCode: safeProviderCode(error) });
  }
  const matches = (Array.isArray(result?.items) ? result.items : []).filter((order) => order?.receipt === receipt);
  if (matches.length !== 1) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (!current || current.status !== 'REVIEW' || current.razorpayOrderId) return;
      await auditAttemptTransition(tx, current, 'RAZORPAY_ORDER_CREATE_RECONCILIATION_NO_UNIQUE_MATCH', 'Receipt lookup did not return exactly one matching Razorpay order; attempt remains blocked', {
        requestId: actor?.requestId || null,
        providerReceipt: receipt,
        matchCount: matches.length,
        nextState: 'REVIEW',
      }, 'FAILURE');
    });
    throw new RazorpayCheckoutError('CHECKOUT_RECONCILIATION_NO_UNIQUE_ORDER', 'Razorpay did not return exactly one matching order. This attempt remains blocked for review.', 409, { checkoutAttemptId: attempt.id, matchCount: matches.length });
  }

  const order = matches[0];
  const safelyResumable = order.id && order.status === 'created'
    && Number(order.attempts) === 0
    && Number(order.amount) === Number(attempt.amountPaise)
    && Number(order.amount_paid) === 0
    && Number(order.amount_due) === Number(attempt.amountPaise)
    && String(order.currency || '').toUpperCase() === String(attempt.currency).toUpperCase()
    && order.notes?.crm_attempt_id === attempt.id
    && order.notes?.invoice_id === attempt.invoiceId
    && (!attempt.allocationPlan || order.notes?.allocation_plan_hash === digest(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))));

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

const markAttemptFailed = async ({ attemptId, paymentId = null, providerPayment = null, source = 'STATUS_POLL' }) => prisma.$transaction(async (tx) => {
  const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!current || ['CAPTURED', 'REVIEW', 'CREATE_FAILED'].includes(current.status)) return current;
  const providerDiagnostics = getSafeRazorpayPaymentDiagnostics(providerPayment);
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
  const providerDiagnostics = getSafeRazorpayPaymentDiagnostics(providerPayment);
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

const findExistingSettlement = async (paymentId, invoiceId) => {
  const payment = await prisma.payment.findFirst({
    where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!payment) return null;
  if (!payment.allocations.some((allocation) => allocation.invoiceId === invoiceId)) {
    throw new RazorpayCheckoutError('PAYMENT_ALREADY_LINKED', 'This Razorpay payment is already linked to another invoice', 409);
  }
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, status: true, balanceDue: true, orderId: true } });
  const ledger = invoice?.orderId ? await getLedgerState(prisma, invoice.orderId) : null;
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

  const existing = await findExistingSettlement(paymentId, attempt.invoiceId);
  if (existing) {
    const completedAttempt = await prisma.$transaction(async (tx) => {
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
        razorpayOrderId: attempt.razorpayOrderId, razorpayPaymentId: paymentId, source, nextState: 'CAPTURED',
        priorState: attempt.status,
      });
      return current;
    });
    return { ...existing, attempt: completedAttempt, alreadyRecorded: true };
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
    const providerDiagnostics = getSafeRazorpayPaymentDiagnostics(providerPayment);
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
  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.payment.findFirst({
        where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' },
        include: { allocations: { where: { status: 'POSTED' }, select: { invoiceId: true, amount: true } } },
      });
      if (duplicate) {
        if (!duplicate.allocations.some((allocation) => allocation.invoiceId === attempt.invoiceId)) {
          throw new RazorpayCheckoutError('PAYMENT_ALREADY_LINKED', 'This Razorpay payment is already linked to another invoice', 409);
        }
        if (attempt.allocationPlan && (duplicate.customerId !== attempt.customerId
          || Math.round(Number(duplicate.amount) * 100) !== Number(attempt.amountPaise)
          || duplicate.allocations.length !== attempt.allocationPlan.length
          || attempt.allocationPlan.some((item) => !duplicate.allocations.some((allocation) => allocation.invoiceId === item.invoiceId
            && Math.round(Number(allocation.amount) * 100) === Math.round(Number(item.amount) * 100))))) {
          throw new RazorpayCheckoutError('PAYMENT_ALREADY_LINKED', 'The saved payment allocations do not match this checkout', 409);
        }
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
      const settlement = attempt.allocationPlan?.length > 1
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
          payload: { paymentId: settlement.payment.id, source: `RAZORPAY_${source}` },
          dedupeKey: `payment-received:${settlement.payment.id}`,
        });
      } else if (settlement.payment) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.INVOICE_PAYMENT_RECEIVED,
          aggregateType: 'invoice',
          aggregateId: attempt.invoiceId,
          payload: { paymentId: settlement.payment.id, source: `RAZORPAY_${source}` },
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
      const concurrent = await findExistingSettlement(paymentId, attempt.invoiceId);
      if (concurrent) return { ...concurrent, attempt, alreadyRecorded: true };
    }
    throw error;
  }
};

module.exports = { RazorpayCheckoutError, auditAttemptTransition, canResumeUnattemptedCheckout, createInvoiceCheckout, getMode, getRazorpay, getUnattemptedCheckoutResumeBlockReason, markAttemptFailed, markAttemptPending, matchesExpectedCheckoutBinding, reconcileAmbiguousOrderCreation, safeProviderCode, safeProviderMessage, settleCapturedPayment };
