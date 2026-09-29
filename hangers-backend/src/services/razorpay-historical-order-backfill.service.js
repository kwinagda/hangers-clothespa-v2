const prisma = require('../config/database');
const { RazorpayCheckoutError, auditAttemptTransition, getMode, getRazorpay, safeProviderCode } = require('./razorpay-invoice-checkout.service');

const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]+$/;
const HISTORICAL_ORDER_REQUEST = 'FINANCE_HISTORICAL_ORDER_BIND';
const paise = (value) => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? BigInt(amount) : null;
};
const toPaise = (value) => {
  const amount = Number(value);
  const converted = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(converted) ? BigInt(converted) : null;
};
const fail = (code, message, statusCode = 409) => new RazorpayCheckoutError(code, message, statusCode);

const backfillUnusedRazorpayOrder = async ({ orderId, invoiceId, expectedMode, idempotencyKey, actor, provider: injectedProvider }) => {
  if (!ORDER_ID_PATTERN.test(String(orderId || '')) || !invoiceId || !idempotencyKey) {
    throw fail('HISTORICAL_ORDER_REFERENCE_INVALID', 'A valid Razorpay Order, invoice, and idempotency reference are required.', 400);
  }
  const mode = getMode();
  if (!['TEST', 'LIVE'].includes(expectedMode) || expectedMode !== mode) {
    throw fail('HISTORICAL_ORDER_MODE_CHANGED', 'Razorpay mode changed since this preview. Run a new preview before linking an Order.');
  }
  const provider = injectedProvider || getRazorpay();
  if (typeof provider?.orders?.fetch !== 'function' || typeof provider?.orders?.fetchPayments !== 'function'
    || typeof provider?.orders?.edit !== 'function') {
    throw fail('HISTORICAL_ORDER_PROVIDER_UNAVAILABLE', 'Razorpay Order verification and note update operations are unavailable.', 503);
  }

  let order;
  let orderPayments;
  try {
    order = await provider.orders.fetch(orderId);
    orderPayments = await provider.orders.fetchPayments(orderId);
  } catch (error) {
    throw new RazorpayCheckoutError('HISTORICAL_ORDER_PROVIDER_FAILED', 'Razorpay could not verify this Order and its payment attempts. No CRM Order was linked.', 502, { providerCode: safeProviderCode(error) });
  }
  if (String(order?.id || '') !== orderId) throw fail('HISTORICAL_ORDER_PROVIDER_BINDING_MISMATCH', 'Razorpay returned a different Order reference.');
  if (!Array.isArray(orderPayments?.items)) throw fail('HISTORICAL_ORDER_PAYMENTS_INVALID', 'Razorpay returned an invalid payments-for-order response.', 502);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, invoiceNumber: true, customerId: true, orderId: true, currency: true, status: true, balanceDue: true, voidedAt: true },
  });
  if (!invoice) throw fail('HISTORICAL_ORDER_INVOICE_NOT_FOUND', 'The selected CRM invoice was not found.', 404);
  if (invoice.voidedAt || invoice.status === 'VOID') throw fail('HISTORICAL_ORDER_INVOICE_VOID', 'A voided invoice cannot be linked to a Razorpay Order.');
  const expectedAmount = toPaise(invoice.balanceDue);
  const orderAmount = paise(order.amount);
  if (expectedAmount === null || expectedAmount < 100n || orderAmount !== expectedAmount
    || paise(order.amount_due) !== expectedAmount || paise(order.amount_paid) !== 0n
    || String(order.status || '').toLowerCase() !== 'created' || Number(order.attempts) !== 0
    || orderPayments.items.length !== 0) {
    throw fail('HISTORICAL_ORDER_NOT_UNUSED', 'This Razorpay Order is not provably unused and payable for the invoice balance. Finance review is required.');
  }
  if (String(order.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase()) {
    throw fail('HISTORICAL_ORDER_CURRENCY_MISMATCH', 'Razorpay Order and invoice currencies do not match.');
  }
  const notes = order.notes && typeof order.notes === 'object' && !Array.isArray(order.notes) ? { ...order.notes } : {};
  const receipt = typeof order.receipt === 'string' ? order.receipt : null;
  const receiptInvoice = receipt ? await prisma.invoice.findUnique({ where: { invoiceNumber: receipt }, select: { id: true } }) : null;
  if ((receipt && receipt !== invoice.invoiceNumber) || (receiptInvoice && receiptInvoice.id !== invoice.id)
    || (notes.invoice_id && notes.invoice_id !== invoice.id) || (!receipt && notes.invoice_id !== invoice.id)) {
    throw fail('HISTORICAL_ORDER_INVOICE_REFERENCE_MISMATCH', 'Razorpay Order does not contain a unique exact reference to the selected CRM invoice.');
  }
  const entries = Object.entries(notes);
  if (entries.length > 15 || entries.some(([key, value]) => key.length > 255
    || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 512)) {
    throw fail('HISTORICAL_ORDER_NOTES_LIMIT', 'Razorpay Order notes cannot be safely updated within the documented field limits.');
  }
  if (entries.length + Number(!notes.invoice_id) + Number(!notes.crm_attempt_id) > 15) {
    throw fail('HISTORICAL_ORDER_NOTES_LIMIT', 'Razorpay Order has no room for the required CRM binding notes.');
  }

  const [attemptByOrder, paymentByOrder, noteAttempt] = await Promise.all([
    prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: orderId } }),
    prisma.payment.findMany({ where: { razorpayOrderId: orderId }, select: { id: true } }),
    notes.crm_attempt_id ? prisma.razorpayCheckoutAttempt.findUnique({ where: { id: String(notes.crm_attempt_id) } }) : null,
  ]);
  if (paymentByOrder.length) throw fail('HISTORICAL_ORDER_LOCAL_PAYMENT_EXISTS', 'A CRM payment already references this Razorpay Order; reconcile it instead of linking an unpaid Order.');
  if (notes.crm_attempt_id && (!noteAttempt || noteAttempt.invoiceId !== invoice.id || noteAttempt.mode !== mode
    || (noteAttempt.razorpayOrderId && noteAttempt.razorpayOrderId !== orderId))) {
    throw fail('HISTORICAL_ORDER_ATTEMPT_REFERENCE_MISMATCH', 'Razorpay Order references a missing or conflicting CRM checkout attempt.');
  }
  if (attemptByOrder && (attemptByOrder.invoiceId !== invoice.id || attemptByOrder.mode !== mode
    || attemptByOrder.amountPaise !== expectedAmount || String(attemptByOrder.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase())) {
    throw fail('HISTORICAL_ORDER_ALREADY_BOUND', 'This Razorpay Order is already bound to a different CRM invoice or checkout attempt.');
  }
  if (attemptByOrder && noteAttempt && attemptByOrder.id !== noteAttempt.id) {
    throw fail('HISTORICAL_ORDER_ATTEMPT_REFERENCE_MISMATCH', 'Razorpay Order notes and CRM Order binding refer to different checkout attempts.');
  }
  const existingAttempt = attemptByOrder || noteAttempt;
  if (existingAttempt && (existingAttempt.amountPaise !== expectedAmount
    || String(existingAttempt.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase()
    || existingAttempt.customerId !== invoice.customerId)) {
    throw fail('HISTORICAL_ORDER_ATTEMPT_DETAILS_MISMATCH', 'The existing CRM attempt does not match the invoice amount, currency, or customer.');
  }
  const activeAttempt = await prisma.razorpayCheckoutAttempt.findFirst({
    where: { invoiceId: invoice.id, status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] }, ...(existingAttempt ? { id: { not: existingAttempt.id } } : {}) },
    select: { id: true },
  });
  if (activeAttempt) throw fail('HISTORICAL_ORDER_INVOICE_ATTEMPT_ACTIVE', 'This invoice already has an active or unresolved checkout attempt. Reconcile it before linking another Order.');

  let attempt = existingAttempt;
  if (!attempt) {
    try {
      attempt = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoice.id} FOR UPDATE`;
        if (!locked.length) throw fail('HISTORICAL_ORDER_INVOICE_NOT_FOUND', 'The selected CRM invoice was not found.', 404);
        const currentInvoice = await tx.invoice.findUnique({ where: { id: invoice.id }, select: { status: true, voidedAt: true, balanceDue: true, currency: true } });
        if (!currentInvoice || currentInvoice.voidedAt || currentInvoice.status === 'VOID'
          || toPaise(currentInvoice.balanceDue) !== expectedAmount
          || String(currentInvoice.currency || '').toUpperCase() !== String(invoice.currency || '').toUpperCase()) {
          throw fail('HISTORICAL_ORDER_INVOICE_CHANGED', 'Invoice balance, currency, or status changed during Order binding. Run a fresh Finance preview.');
        }
        const concurrentActive = await tx.razorpayCheckoutAttempt.findFirst({
          where: { invoiceId: invoice.id, status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] } },
          select: { id: true },
        });
        if (concurrentActive) throw fail('HISTORICAL_ORDER_INVOICE_ATTEMPT_ACTIVE', 'This invoice already has an active or unresolved checkout attempt. Reconcile it before linking another Order.');
        const created = await tx.razorpayCheckoutAttempt.create({
          data: {
            idempotencyKey: `historical-order:${orderId}`,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            orderId: invoice.orderId,
            customerId: invoice.customerId,
            amountPaise: expectedAmount,
            currency: String(invoice.currency || 'INR').toUpperCase(),
            mode,
            status: 'REVIEW',
            razorpayOrderId: orderId,
            requestId: HISTORICAL_ORDER_REQUEST,
          },
        });
        await auditAttemptTransition(tx, created, 'RAZORPAY_HISTORICAL_ORDER_RESERVED', 'Finance reserved an exact, unused historical Razorpay Order for invoice binding; checkout remains blocked pending provider note verification', {
          actorId: actor?.id || null, source: HISTORICAL_ORDER_REQUEST, razorpayOrderId: orderId, nextState: 'REVIEW',
        });
        return created;
      });
    } catch (error) {
      if (error?.code === 'P2002') throw fail('HISTORICAL_ORDER_CONCURRENT_BINDING', 'Another Finance action linked this Razorpay Order. Refresh and review before retrying.');
      throw error;
    }
  } else if (attempt.status !== 'REVIEW' && attempt.status !== 'CREATED') {
    throw fail('HISTORICAL_ORDER_ATTEMPT_STATE_INVALID', 'The linked CRM checkout attempt is not in a state that can be safely resumed.');
  } else if (attempt.razorpayOrderId && attempt.razorpayOrderId !== orderId) {
    throw fail('HISTORICAL_ORDER_ATTEMPT_ORDER_MISMATCH', 'The CRM checkout attempt is already bound to a different Razorpay Order.');
  } else if (!attempt.razorpayOrderId) {
    const linked = await prisma.razorpayCheckoutAttempt.updateMany({
      where: { id: attempt.id, razorpayOrderId: null },
      data: { razorpayOrderId: orderId, status: 'REVIEW' },
    });
    attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    if (linked.count !== 1 && attempt?.razorpayOrderId !== orderId) {
      throw fail('HISTORICAL_ORDER_CONCURRENT_BINDING', 'Another Finance action bound this checkout attempt. Refresh and review before retrying.');
    }
  }

  const desiredNotes = { ...notes, invoice_id: invoice.id, crm_attempt_id: attempt.id };
  if ((notes.crm_attempt_id && notes.crm_attempt_id !== attempt.id) || desiredNotes.invoice_id !== invoice.id) {
    throw fail('HISTORICAL_ORDER_NOTE_BINDING_MISMATCH', 'Razorpay Order notes conflict with the selected invoice or CRM attempt.');
  }
  try {
    if (JSON.stringify(notes) !== JSON.stringify(desiredNotes)) await provider.orders.edit(orderId, { notes: desiredNotes });
    const [verifiedOrder, verifiedPayments] = await Promise.all([provider.orders.fetch(orderId), provider.orders.fetchPayments(orderId)]);
    if (verifiedOrder?.notes?.invoice_id !== invoice.id || verifiedOrder?.notes?.crm_attempt_id !== attempt.id
      || String(verifiedOrder?.status || '').toLowerCase() !== 'created' || Number(verifiedOrder?.attempts) !== 0
      || paise(verifiedOrder?.amount_due) !== expectedAmount || paise(verifiedOrder?.amount_paid) !== 0n
      || !Array.isArray(verifiedPayments?.items) || verifiedPayments.items.length !== 0) {
      throw new Error('Razorpay did not retain the exact binding or unused Order state');
    }
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
      if (current) await auditAttemptTransition(tx, current, 'RAZORPAY_HISTORICAL_ORDER_VERIFY_FAILED', 'Provider Order binding could not be verified; the invoice remains blocked pending Finance review', {
        actorId: actor?.id || null, source: HISTORICAL_ORDER_REQUEST, razorpayOrderId: orderId,
        providerCode: safeProviderCode(error), nextState: 'REVIEW',
      }, 'FAILURE');
    });
    throw new RazorpayCheckoutError('HISTORICAL_ORDER_BINDING_UNVERIFIED', 'Razorpay Order binding could not be confirmed. Checkout remains blocked; verify this item before retrying.', 502, { providerCode: safeProviderCode(error) });
  }

  attempt = await prisma.$transaction(async (tx) => {
    const updated = await tx.razorpayCheckoutAttempt.updateMany({
      where: { id: attempt.id, status: 'REVIEW', razorpayOrderId: orderId },
      data: { status: 'CREATED' },
    });
    const current = await tx.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    if (updated.count) await auditAttemptTransition(tx, current, 'RAZORPAY_HISTORICAL_ORDER_BOUND', 'Finance verified and bound an unused Razorpay Order to the exact CRM invoice; checkout can resume with this Order', {
      actorId: actor?.id || null, source: HISTORICAL_ORDER_REQUEST, razorpayOrderId: orderId, nextState: 'CREATED',
    });
    return current;
  });
  if (attempt.status !== 'CREATED' || attempt.razorpayOrderId !== orderId) throw fail('HISTORICAL_ORDER_CONCURRENT_BINDING', 'The checkout attempt changed during Order binding. Refresh Finance and review its current status.');
  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, razorpayOrderId: orderId, attemptId: attempt.id, mode, status: attempt.status };
};

module.exports = { HISTORICAL_ORDER_REQUEST, backfillUnusedRazorpayOrder };
