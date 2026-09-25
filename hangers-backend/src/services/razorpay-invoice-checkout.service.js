const crypto = require('crypto');
const Razorpay = require('razorpay');
const prisma = require('../config/database');
const { PaymentRuleError, getLedgerState, recordInvoiceSettlement } = require('./payment.service');
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

const getMode = () => String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const isSerializationConflict = (error) => error?.code === 'P2034' || error?.meta?.code === '40001';
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
const canResumeUnattemptedCheckout = ({ attempt, providerOrder, providerPayments }) => {
  if (!attempt || attempt.status !== 'CREATED' || !attempt.razorpayOrderId) return false;
  if (!providerOrder || providerOrder.id !== attempt.razorpayOrderId || String(providerOrder.status || '').toLowerCase() !== 'created') return false;
  const amount = Number(providerOrder.amount);
  const amountDue = Number(providerOrder.amount_due);
  const amountPaid = Number(providerOrder.amount_paid);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(amountDue) || !Number.isSafeInteger(amountPaid)) return false;
  if (Number(providerOrder.attempts) !== 0 || BigInt(amount) !== attempt.amountPaise) return false;
  if (BigInt(amountDue) !== attempt.amountPaise || amountPaid !== 0) return false;
  if (String(providerOrder.currency || '').toUpperCase() !== String(attempt.currency || '').toUpperCase()) return false;
  if (providerOrder.notes?.crm_attempt_id !== attempt.id || providerOrder.notes?.invoice_id !== attempt.invoiceId) return false;
  return Array.isArray(providerPayments?.items) && providerPayments.items.length === 0;
};

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

const createInvoiceCheckout = async ({ invoice, shareId, idempotencyKey, requestId, experiment, provider: injectedProvider }) => {
  if (!invoice?.id || !invoice.customerId) throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'Online payment is not available for this invoice', 404);
  if (!idempotencyKey || String(idempotencyKey).length > 200) throw new RazorpayCheckoutError('IDEMPOTENCY_KEY_REQUIRED', 'A valid checkout request key is required', 400);
  if (experiment && (getMode() !== 'TEST' || experiment.id !== 'invoice_checkout_presentation_v1' || !['A', 'B'].includes(experiment.variant) || !/^[a-f0-9]{64}$/.test(experiment.visitorHash || ''))) {
    throw new RazorpayCheckoutError('CHECKOUT_EXPERIMENT_INVALID', 'Checkout experiment assignment is invalid', 400);
  }

  const localKey = digest(`${invoice.id}:${idempotencyKey}`);
  const reserveAttempt = () => prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoice.id} FOR UPDATE`;
    if (!locked.length) throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'Online payment is not available for this invoice', 404);
    const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!current || current.voidedAt || current.status === 'VOID') throw new RazorpayCheckoutError('INVOICE_NOT_PAYABLE', 'This invoice cannot accept payments', 409);
    const amountPaise = BigInt(Math.round(Number(current.balanceDue || 0) * 100));
    if (amountPaise < 100n) throw new RazorpayCheckoutError('INVALID_AMOUNT', 'The invoice has no payable balance');

    const reuseProviderOrder = async (prior) => {
      if ((prior.experimentId || null) !== (experiment?.id || null)
        || (prior.experimentVariant || null) !== (experiment?.variant || null)
        || (prior.experimentVisitorHash || null) !== (experiment?.visitorHash || null)) {
        throw new RazorpayCheckoutError('CHECKOUT_EXPERIMENT_ATTEMPT_MISMATCH', 'This payment attempt belongs to a different checkout presentation. Check its status before retrying.', 409, { checkoutAttemptId: prior.id });
      }
      if (prior.mode !== getMode() || prior.amountPaise !== amountPaise || prior.currency !== (current.currency || 'INR')) {
        throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_STALE', 'The invoice balance or payment mode changed after this checkout began. Contact the store before retrying.', 409);
      }
      if (prior.status === 'FAILED' && prior.razorpayOrderId) {
        const updated = await tx.razorpayCheckoutAttempt.update({
          where: { id: prior.id },
    data: {
      status: 'CREATED', razorpayPaymentId: null, failureCode: null, failureMessage: null, completedAt: null,
      providerMethod: null, providerMethodDetail: null, providerErrorCode: null,
      providerErrorSource: null, providerErrorStep: null, providerErrorReason: null,
    },
        });
        await auditAttemptTransition(tx, updated, 'RAZORPAY_CHECKOUT_REOPENED', 'A failed customer payment may be retried against the same Razorpay order to safely group late authorisations', {
          razorpayOrderId: prior.razorpayOrderId,
          requestId: requestId || null,
          priorState: 'FAILED',
          nextState: 'CREATED',
        });
        return { attempt: updated, order: { id: updated.razorpayOrderId, amount: Number(updated.amountPaise), currency: updated.currency }, reused: true };
      }
      return { attempt: prior, order: { id: prior.razorpayOrderId, amount: Number(prior.amountPaise), currency: prior.currency }, reused: true };
    };

    const keyed = await tx.razorpayCheckoutAttempt.findUnique({ where: { idempotencyKey: localKey } });
    if (keyed) {
      if (keyed.invoiceId !== current.id || keyed.publicShareId !== (shareId || null)) {
        throw new RazorpayCheckoutError('IDEMPOTENCY_KEY_CONFLICT', 'This checkout request key is already bound to a different invoice link', 409);
      }
      if (['CREATED', 'FAILED'].includes(keyed.status) && keyed.razorpayOrderId) return reuseProviderOrder(keyed);
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_UNRESOLVED', 'This checkout request is still being created or needs review. Do not start another payment yet.', 409, { checkoutAttemptId: keyed.id });
    }

    const active = await tx.razorpayCheckoutAttempt.findFirst({
      where: { invoiceId: current.id, status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      if (active.publicShareId !== (shareId || null)) {
        throw new RazorpayCheckoutError('CHECKOUT_ALREADY_IN_PROGRESS', 'A payment attempt is already active for this invoice. Refresh the invoice link before trying again.', 409);
      }
      if (['CREATED', 'FAILED'].includes(active.status) && active.razorpayOrderId) return reuseProviderOrder(active);
      throw new RazorpayCheckoutError('CHECKOUT_ALREADY_IN_PROGRESS', 'A payment attempt is already active or needs finance review. Do not start another payment.', 409, { checkoutAttemptId: active.id });
    }

    const attempt = await tx.razorpayCheckoutAttempt.create({
      data: {
        idempotencyKey: localKey,
        invoiceId: current.id,
        invoiceNumber: current.invoiceNumber,
        orderId: current.orderId || null,
        customerId: current.customerId,
        publicShareId: shareId || null,
        amountPaise,
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
    const order = await (injectedProvider || getRazorpay()).orders.create({
      amount: Number(attempt.amountPaise),
      currency: attempt.currency,
      receipt: `hc-${attempt.id}`.slice(0, 40),
      notes: {
        crm_attempt_id: attempt.id,
        invoice_id: currentInvoice.id,
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

const markAttemptFailed = async ({ attemptId, paymentId = null, providerPayment = null, source = 'STATUS_POLL' }) => prisma.$transaction(async (tx) => {
  const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!current || ['CAPTURED', 'REVIEW', 'FAILED', 'CREATE_FAILED'].includes(current.status)) return current;
  const providerDiagnostics = getSafeRazorpayPaymentDiagnostics(providerPayment);
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

const settleCapturedPayment = async ({ paymentId, providerOrderId, signature = null, source = 'CALLBACK', expectedInvoiceId = null, expectedShareId = null, provider: injectedProvider }) => {
  if (!paymentId || !providerOrderId) throw new RazorpayCheckoutError('PAYMENT_REFERENCE_REQUIRED', 'Razorpay payment and order references are required');
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: providerOrderId } });
  if (!attempt) throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_NOT_FOUND', 'No CRM checkout attempt matches this Razorpay order', 404);
  if ((expectedInvoiceId && attempt.invoiceId !== expectedInvoiceId) || (expectedShareId && attempt.publicShareId !== expectedShareId)) {
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
  const [providerOrder, providerPayment] = await Promise.all([
    razorpay.orders.fetch(providerOrderId),
    razorpay.payments.fetch(paymentId),
  ]);
  if (providerOrder.id !== attempt.razorpayOrderId || providerOrder.notes?.crm_attempt_id !== attempt.id || providerOrder.notes?.invoice_id !== attempt.invoiceId) {
    throw new RazorpayCheckoutError('PROVIDER_ORDER_BINDING_MISMATCH', 'Razorpay order does not match the saved CRM checkout attempt', 409);
  }
  if (String(providerPayment.order_id || '') !== attempt.razorpayOrderId || String(providerPayment.id || '') !== paymentId) {
    throw new RazorpayCheckoutError('PROVIDER_PAYMENT_BINDING_MISMATCH', 'Razorpay payment does not match the saved checkout order', 409);
  }
  if (Number(providerPayment.amount) !== Number(attempt.amountPaise) || Number(providerOrder.amount) !== Number(attempt.amountPaise)) {
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
  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.payment.findFirst({
        where: { razorpayPaymentId: paymentId, status: 'CAPTURED', kind: 'RECEIPT' },
        include: { allocations: { select: { invoiceId: true } } },
      });
      if (duplicate) {
        if (!duplicate.allocations.some((allocation) => allocation.invoiceId === attempt.invoiceId)) {
          throw new RazorpayCheckoutError('PAYMENT_ALREADY_LINKED', 'This Razorpay payment is already linked to another invoice', 409);
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

      const settlement = await recordInvoiceSettlement(tx, {
        invoiceId: attempt.invoiceId,
        amount: Number(providerPayment.amount) / 100,
        method: 'RAZORPAY',
        reference: paymentId,
        notes: `Razorpay invoice checkout (${source})`,
        idempotencyKey: `razorpay-captured:${paymentId}`,
        razorpayOrderId: attempt.razorpayOrderId,
        razorpayPaymentId: paymentId,
        ...getSafeRazorpayPaymentMethod(providerPayment),
        mode: attempt.mode,
      });

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
      return { ...settlement, attempt, alreadyRecorded: false };
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

module.exports = { RazorpayCheckoutError, auditAttemptTransition, canResumeUnattemptedCheckout, createInvoiceCheckout, getMode, getRazorpay, markAttemptFailed, safeProviderCode, safeProviderMessage, settleCapturedPayment };
