const prisma = require('../config/database');
const {
  RazorpayCheckoutError,
  auditAttemptTransition,
  getMode,
  getRazorpay,
  safeProviderCode,
  settleCapturedPayment,
} = require('./razorpay-invoice-checkout.service');
const { getHistoricalPaymentReportEvidence } = require('./razorpay-dashboard-report-import.service');

const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]+$/;
const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]+$/;
const providerPaise = (value) => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? BigInt(amount) : null;
};
const toPaise = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const paise = Math.round(amount * 100);
  return Number.isSafeInteger(paise) ? BigInt(paise) : null;
};
const providerFailure = (error) => new RazorpayCheckoutError(
  'HISTORICAL_PAYMENT_PROVIDER_FAILED',
  'Razorpay could not verify this historical payment. No CRM receipt was posted; retry reconciliation later.',
  502,
  { providerCode: safeProviderCode(error) },
);

const isDocumentedOrderRetentionError = (error) => {
  const code = String(error?.error?.code || error?.response?.data?.error?.code || error?.code || '').toUpperCase();
  const description = String(error?.error?.description || error?.response?.data?.error?.description || error?.message || '').toLowerCase();
  return code === 'BAD_REQUEST_ERROR' && /older than 180 days/.test(description) && /use reports/.test(description);
};

const backfillCapturedRazorpayPayment = async ({ paymentId, invoiceId, expectedMode, idempotencyKey, actor, paymentsCsvText, ordersCsvText, provider: injectedProvider }) => {
  if (!PAYMENT_ID_PATTERN.test(String(paymentId || '')) || !invoiceId || !idempotencyKey) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_REFERENCE_INVALID', 'A valid Razorpay payment, invoice, and idempotency reference are required.', 400);
  }
  const mode = getMode();
  if (!['TEST', 'LIVE'].includes(expectedMode) || expectedMode !== mode) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_MODE_CHANGED', 'Razorpay mode changed since this preview. Run a new preview before recording a payment.', 409);
  }
  const provider = injectedProvider || getRazorpay();
  if (typeof provider?.payments?.fetch !== 'function' || typeof provider?.orders?.fetch !== 'function') {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay payment verification is unavailable.', 503);
  }

  let providerPayment;
  let providerOrder;
  let historicalReportEvidence = null;
  try {
    providerPayment = await provider.payments.fetch(paymentId);
    if (!ORDER_ID_PATTERN.test(String(providerPayment?.order_id || ''))) {
      throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_REQUIRED', 'This payment has no valid Razorpay Order reference and cannot be auto-linked.', 409);
    }
    try {
      providerOrder = await provider.orders.fetch(providerPayment.order_id);
    } catch (error) {
      if (!isDocumentedOrderRetentionError(error)) throw error;
      if (!paymentsCsvText || !ordersCsvText) {
        throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_REPORTS_REQUIRED', 'This Order is older than Razorpay API retention. Upload matching Payments and Orders Dashboard reports, preview the exact invoice binding, then retry.', 409);
      }
      historicalReportEvidence = await getHistoricalPaymentReportEvidence({
        paymentId, invoiceId, paymentsCsvText, ordersCsvText,
      });
      const reportPayment = historicalReportEvidence.payment;
      const reportOrder = historicalReportEvidence.order;
      if (reportPayment.orderId !== providerPayment.order_id
        || reportPayment.status !== 'captured'
        || BigInt(reportPayment.amountPaise) !== BigInt(providerPayment.amount)
        || reportPayment.currency !== String(providerPayment.currency || '').toUpperCase()) {
        throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_REPORT_PROVIDER_MISMATCH', 'The live Razorpay Payment differs from the Dashboard report. No CRM receipt was posted.', 409);
      }
      providerOrder = {
        id: reportOrder.orderId,
        amount: BigInt(reportOrder.amountPaise),
        amountPaise: reportOrder.amountPaise,
        amount_paid: BigInt(reportOrder.amountPaidPaise),
        amountPaidPaise: reportOrder.amountPaidPaise,
        amount_due: BigInt(reportOrder.amountDuePaise),
        amountDuePaise: reportOrder.amountDuePaise,
        currency: reportOrder.currency,
        receipt: reportOrder.receipt,
        status: reportOrder.status,
        attempts: reportOrder.attempts,
        notes: reportOrder.noteInvoiceId ? { invoice_id: reportOrder.noteInvoiceId } : {},
      };
    }
  } catch (error) {
    if (error instanceof RazorpayCheckoutError) throw error;
    throw providerFailure(error);
  }

  const amountPaise = providerPaise(providerPayment?.amount);
  const orderAmountPaise = providerPaise(providerOrder?.amount);
  const paidPaise = providerPaise(providerOrder?.amount_paid);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, invoiceNumber: true, customerId: true, orderId: true, currency: true, status: true, totalAmount: true, balanceDue: true, voidedAt: true },
  });
  if (!invoice) throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_INVOICE_NOT_FOUND', 'The selected CRM invoice was not found.', 404);
  if (invoice.voidedAt || invoice.status === 'VOID') throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_INVOICE_VOID', 'A voided invoice cannot receive a Razorpay payment.', 409);
  if (String(providerPayment.id || '') !== paymentId || String(providerOrder.id || '') !== String(providerPayment.order_id || '')) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_PROVIDER_BINDING_MISMATCH', 'Razorpay returned a different payment or Order reference.', 409);
  }
  if (String(providerPayment.status || '').toLowerCase() !== 'captured' || providerPayment.captured !== true) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_NOT_CAPTURED', 'Razorpay does not confirm this payment as captured. No CRM receipt was posted.', 409);
  }
  const refundedPaise = providerPaise(providerPayment.amount_refunded ?? 0);
  const refundStatus = providerPayment.refund_status ?? null;
  if (refundedPaise === null || refundedPaise > 0n || ![null, 'partial', 'full'].includes(refundStatus)
    || refundStatus === 'partial' || refundStatus === 'full') {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_REFUND_REVIEW', 'This Razorpay payment has a refund state and requires separate Finance reconciliation.', 409);
  }
  if (amountPaise === null || amountPaise < 100n || amountPaise !== orderAmountPaise || amountPaise !== paidPaise
    || String(providerOrder.status || '').toLowerCase() !== 'paid' || providerPaise(providerOrder.amount_due) !== 0n) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_STATE_MISMATCH', 'Payment and Razorpay Order amounts or capture states do not match exactly.', 409);
  }
  if (String(providerPayment.currency || '').toUpperCase() !== String(providerOrder.currency || '').toUpperCase()
    || String(providerOrder.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase()) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_CURRENCY_MISMATCH', 'Payment, Order, and invoice currencies do not match.', 409);
  }

  const notes = providerOrder.notes && typeof providerOrder.notes === 'object' && !Array.isArray(providerOrder.notes)
    ? { ...providerOrder.notes }
    : {};
  const noteInvoiceId = typeof notes.invoice_id === 'string' ? notes.invoice_id : null;
  if (providerOrder.receipt != null && typeof providerOrder.receipt !== 'string') {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_RECEIPT_INVALID', 'Razorpay Order contains an invalid invoice receipt reference.', 409);
  }
  const receiptMatches = providerOrder.receipt === invoice.invoiceNumber;
  const receiptInvoice = providerOrder.receipt
    ? await prisma.invoice.findUnique({ where: { invoiceNumber: providerOrder.receipt }, select: { id: true } })
    : null;
  if ((providerOrder.receipt != null && !receiptMatches) || (receiptInvoice && receiptInvoice.id !== invoice.id)) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_INVOICE_REFERENCE_MISMATCH', 'Razorpay Order notes and receipt refer to different CRM invoices.', 409);
  }
  if ((noteInvoiceId && noteInvoiceId !== invoice.id) || (!noteInvoiceId && !receiptMatches)) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_INVOICE_REFERENCE_MISMATCH', 'Razorpay Order does not contain a unique exact reference to this invoice.', 409);
  }
  const noteEntries = Object.entries(notes);
  if (noteEntries.length > 15 || noteEntries.some(([key, value]) => key.length > 255
    || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 512)) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_NOTES_LIMIT', 'Razorpay Order notes cannot be safely updated within the documented field limits.', 409);
  }
  if (!historicalReportEvidence && noteEntries.length + Number(!notes.invoice_id) + Number(!notes.crm_attempt_id) > 15) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_NOTES_LIMIT', 'Razorpay Order has no room for the required CRM binding notes.', 409);
  }
  if (notes.crm_attempt_id && typeof notes.crm_attempt_id !== 'string') {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ATTEMPT_REFERENCE_INVALID', 'Razorpay Order contains an invalid CRM attempt reference.', 409);
  }

  const [existingLedger, attemptByOrder, attemptByNote] = await Promise.all([
    prisma.payment.findMany({
      where: { razorpayPaymentId: paymentId },
      select: { id: true, status: true, kind: true, mode: true, amount: true, allocations: { select: { invoiceId: true } } },
    }),
    prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: providerOrder.id } }),
    notes.crm_attempt_id ? prisma.razorpayCheckoutAttempt.findUnique({ where: { id: notes.crm_attempt_id } }) : null,
  ]);
  if (existingLedger.length > 1) throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_DUPLICATE_LOCAL_LINK', 'Multiple CRM payments already reference this Razorpay payment. Finance review is required.', 409);
  if (existingLedger.length === 1) {
    const linked = existingLedger[0];
    if (linked.kind !== 'RECEIPT' || linked.status !== 'CAPTURED' || linked.mode !== mode
      || toPaise(linked.amount) !== amountPaise || !linked.allocations.some((allocation) => allocation.invoiceId === invoice.id)) {
      throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_LOCAL_LINK_MISMATCH', 'This Razorpay payment is already linked to a different CRM record or amount.', 409);
    }
  } else if (toPaise(invoice.balanceDue) !== amountPaise) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_BALANCE_MISMATCH', 'The captured amount does not equal the current invoice balance; do not auto-post it.', 409);
  }
  if (attemptByNote && (attemptByNote.invoiceId !== invoice.id || attemptByNote.mode !== mode
    || (attemptByNote.razorpayOrderId && attemptByNote.razorpayOrderId !== providerOrder.id))) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ATTEMPT_BINDING_MISMATCH', 'The CRM attempt referenced by Razorpay belongs to a different invoice or mode.', 409);
  }
  if (notes.crm_attempt_id && !attemptByNote && !attemptByOrder) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ATTEMPT_NOT_FOUND', 'Razorpay Order references a CRM attempt that no longer exists. Finance review is required.', 409);
  }
  if (attemptByOrder && (attemptByOrder.invoiceId !== invoice.id || attemptByOrder.mode !== mode
    || (notes.crm_attempt_id && notes.crm_attempt_id !== attemptByOrder.id))) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_ALREADY_BOUND', 'This Razorpay Order is already bound to a different CRM checkout attempt.', 409);
  }
  if (attemptByOrder?.razorpayPaymentId && attemptByOrder.razorpayPaymentId !== paymentId) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ATTEMPT_PAYMENT_MISMATCH', 'This CRM attempt already references a different Razorpay payment.', 409);
  }
  const boundAttempt = attemptByOrder || attemptByNote;
  if (boundAttempt && (boundAttempt.customerId !== invoice.customerId || boundAttempt.amountPaise !== amountPaise
    || String(boundAttempt.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase())) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ATTEMPT_DETAILS_MISMATCH', 'The existing CRM attempt amount, currency, or customer does not match the provider payment.', 409);
  }
  if (!historicalReportEvidence && (!notes.invoice_id || !notes.crm_attempt_id) && typeof provider.orders.edit !== 'function') {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_UPDATE_UNAVAILABLE', 'Razorpay Order note linking is unavailable; no CRM receipt was posted.', 503);
  }

  let attempt = attemptByOrder || attemptByNote;
  if (!attempt) {
    const attemptData = {
      idempotencyKey: `historical-payment:${paymentId}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      amountPaise,
      currency: String(invoice.currency || 'INR').toUpperCase(),
      mode,
      status: 'REVIEW',
      razorpayOrderId: providerOrder.id,
    };
    try {
      attempt = await prisma.$transaction(async (tx) => {
        const created = await tx.razorpayCheckoutAttempt.create({ data: attemptData });
        await auditAttemptTransition(tx, created, 'RAZORPAY_HISTORICAL_ATTEMPT_RESERVED', 'A Finance-approved historical Razorpay payment backfill reserved its exact provider Order and invoice binding', {
          actorId: actor?.id || null, source: 'FINANCE_HISTORICAL_BACKFILL', razorpayOrderId: providerOrder.id,
          razorpayPaymentId: paymentId, nextState: 'REVIEW',
        });
        return created;
      });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: providerOrder.id } });
      if (!attempt || attempt.invoiceId !== invoice.id || attempt.mode !== mode) {
        throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_CONCURRENT_BINDING', 'Another Finance action bound this Order; refresh and review before retrying.', 409);
      }
    }
  }

  if (attempt && !attempt.razorpayOrderId) {
    const attached = await prisma.$transaction(async (tx) => {
      const changed = await tx.razorpayCheckoutAttempt.updateMany({
        where: { id: attempt.id, razorpayOrderId: null },
        data: { razorpayOrderId: providerOrder.id },
      });
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (changed.count === 1) await auditAttemptTransition(tx, current, 'RAZORPAY_HISTORICAL_ORDER_BOUND', 'Finance reconciliation attached the exact provider Order to an existing CRM attempt', {
        actorId: actor?.id || null, source: 'FINANCE_HISTORICAL_BACKFILL', razorpayOrderId: providerOrder.id,
        razorpayPaymentId: paymentId, nextState: current.status,
      });
      return { changed: changed.count, attempt: current };
    });
    if (attached.changed !== 1) {
      if (attached.attempt?.razorpayOrderId !== providerOrder.id) {
        throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_CONCURRENT_BINDING', 'Another Finance action bound this attempt; refresh and review before retrying.', 409);
      }
    }
    attempt = attached.attempt;
  }

  const desiredNotes = { ...notes };
  if (!desiredNotes.invoice_id) desiredNotes.invoice_id = invoice.id;
  if (!desiredNotes.crm_attempt_id) desiredNotes.crm_attempt_id = attempt.id;
  const noteKeys = Object.keys(desiredNotes);
  if (noteKeys.length > 15) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_NOTES_LIMIT', 'Razorpay Order notes cannot be safely updated within the documented field limits.', 409);
  }
  if (desiredNotes.invoice_id !== invoice.id || desiredNotes.crm_attempt_id !== attempt.id) {
    throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_NOTE_BINDING_MISMATCH', 'Razorpay Order notes conflict with the selected CRM invoice or attempt.', 409);
  }
  if (!historicalReportEvidence && JSON.stringify(notes) !== JSON.stringify(desiredNotes)) {
    if (typeof provider.orders.edit !== 'function') {
      throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_UPDATE_UNAVAILABLE', 'Razorpay Order note linking is unavailable; no CRM receipt was posted.', 503);
    }
    try {
      await provider.orders.edit(providerOrder.id, { notes: desiredNotes });
      const verifiedOrder = await provider.orders.fetch(providerOrder.id);
      if (verifiedOrder.notes?.invoice_id !== invoice.id || verifiedOrder.notes?.crm_attempt_id !== attempt.id) {
        throw new Error('Provider did not retain the requested note binding');
      }
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
        if (current) await auditAttemptTransition(tx, current, 'RAZORPAY_HISTORICAL_ORDER_LINK_FAILED', 'Razorpay Order notes could not be verified after the historical binding request; payment remains unposted for Finance review', {
          actorId: actor?.id || null, source: 'FINANCE_HISTORICAL_BACKFILL', razorpayOrderId: providerOrder.id,
          razorpayPaymentId: paymentId, providerCode: safeProviderCode(error), nextState: current.status,
        }, 'FAILURE');
      });
      throw new RazorpayCheckoutError('HISTORICAL_PAYMENT_ORDER_LINK_FAILED', 'Razorpay Order binding could not be confirmed. No CRM receipt was posted; verify this item before retrying.', 502, { providerCode: safeProviderCode(error) });
    }
  }

  const result = await settleCapturedPayment({
    paymentId,
    providerOrderId: providerOrder.id,
    source: historicalReportEvidence ? 'FINANCE_HISTORICAL_REPORT' : 'FINANCE_HISTORICAL_BACKFILL',
    expectedInvoiceId: invoice.id,
    provider,
    ...(historicalReportEvidence ? {
      historicalReportOrder: {
        id: providerOrder.id,
        invoiceId: invoice.id,
        amountPaise: String(providerOrder.amountPaise),
        amountPaidPaise: String(providerOrder.amountPaidPaise),
        amountDuePaise: String(providerOrder.amountDuePaise),
        currency: String(providerOrder.currency || '').toUpperCase(),
        status: String(providerOrder.status || '').toLowerCase(),
        attempts: providerOrder.attempts,
        receipt: providerOrder.receipt,
      },
    } : {}),
  });
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    razorpayOrderId: providerOrder.id,
    razorpayPaymentId: paymentId,
    attemptId: result.attempt?.id || attempt.id,
    crmPaymentId: result.payment?.id || null,
    alreadyRecorded: Boolean(result.alreadyRecorded),
    status: result.attempt?.status || attempt.status,
  };
};

module.exports = { backfillCapturedRazorpayPayment, isDocumentedOrderRetentionError };
