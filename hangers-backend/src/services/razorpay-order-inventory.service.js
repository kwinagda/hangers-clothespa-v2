const prisma = require('../config/database');
const { getMode, getRazorpay } = require('./razorpay-invoice-checkout.service');
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_WINDOW_SECONDS = 31 * 24 * 60 * 60;
const ORDER_API_RETENTION_SECONDS = 180 * 24 * 60 * 60;
const MAX_REVIEW_ITEMS = 250;
const MAX_LINKED_ORDER_LOOKUPS = 100;
const LINKED_ORDER_LOOKUP_CONCURRENCY = 5;
const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]+$/;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]+$/;

const safeCode = (error) => {
  const root = error?.response?.data?.error || error?.error;
  const code = root && typeof root === 'object' ? root.code : null;
  return typeof code === 'string' && code.length ? code : null;
};

const validateWindow = ({ from, to, now = new Date() }) => {
  const start = Number(from);
  const end = Number(to);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 946684800 || end <= start || end > nowSeconds + 60
    || end - start > MAX_WINDOW_SECONDS) {
    throw Object.assign(new Error('Choose a valid provider date window of 31 days or less.'), { code: 'INVALID_ORDER_INVENTORY_WINDOW' });
  }
  if (start < nowSeconds - ORDER_API_RETENTION_SECONDS) {
    throw Object.assign(new Error('Orders older than 180 days must be reconciled from Razorpay Dashboard Reports.'), { code: 'ORDER_INVENTORY_RETENTION_WINDOW' });
  }
  return { from: start, to: end };
};

const safeString = (value, limit = 160) => typeof value === 'string' && value.length <= limit ? value : null;
const safePaise = (value) => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? BigInt(amount) : null;
};
const moneyToPaise = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(Math.round(amount * 100))
    ? BigInt(Math.round(amount * 100))
    : null;
};

const providerOrderForReview = (order) => ({
  id: order.id,
  status: safeString(order.status, 32) || 'unknown',
  amountPaise: Number.isSafeInteger(Number(order.amount)) ? String(order.amount) : null,
  amountPaidPaise: Number.isSafeInteger(Number(order.amount_paid)) ? String(order.amount_paid) : null,
  amountDuePaise: Number.isSafeInteger(Number(order.amount_due)) ? String(order.amount_due) : null,
  currency: safeString(order.currency, 3)?.toUpperCase() || null,
  attempts: Number.isSafeInteger(Number(order.attempts)) ? Number(order.attempts) : null,
  createdAt: Number.isSafeInteger(Number(order.created_at)) ? Number(order.created_at) : null,
});

const previewRazorpayOrderInventory = async ({ from, to, provider: injectedProvider, keyId = process.env.RAZORPAY_KEY_ID, now = new Date() }) => {
  const window = validateWindow({ from, to, now });
  const mode = getMode(keyId);
  const provider = injectedProvider || getRazorpay();
  if (typeof provider?.orders?.all !== 'function') {
    throw Object.assign(new Error('Razorpay Orders list operation is unavailable.'), { code: 'ORDER_INVENTORY_UNAVAILABLE' });
  }
  if (typeof provider?.payments?.all !== 'function') {
    throw Object.assign(new Error('Razorpay Payments list operation is unavailable.'), { code: 'PAYMENT_INVENTORY_UNAVAILABLE' });
  }

  const providerOrders = [];
  const seenOrderIds = new Set();
  let skip = 0;
  let pagesRead = 0;
  let paginationComplete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await provider.orders.all({ from: window.from, to: window.to, count: PAGE_SIZE, skip });
    } catch (error) {
      throw Object.assign(new Error('Razorpay Orders could not be listed for this window.'), {
        code: 'ORDER_INVENTORY_PROVIDER_FAILED', providerCode: safeCode(error),
      });
    }
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) throw Object.assign(new Error('Razorpay returned an invalid Orders collection.'), { code: 'INVALID_ORDER_INVENTORY_RESPONSE' });
    pagesRead += 1;
    for (const item of items) {
      if (typeof item?.id !== 'string' || !ORDER_ID_PATTERN.test(item.id) || safePaise(item.amount) === null) {
        throw Object.assign(new Error('Razorpay returned an invalid Order reference or amount.'), { code: 'INVALID_ORDER_INVENTORY_RESPONSE' });
      }
      if (seenOrderIds.has(item.id)) {
        throw Object.assign(new Error('The provider Orders page changed during the scan; retry with a narrower date window.'), { code: 'ORDER_INVENTORY_PAGINATION_CHANGED' });
      }
      seenOrderIds.add(item.id);
      providerOrders.push(item);
    }
    if (items.length < PAGE_SIZE) {
      paginationComplete = true;
      break;
    }
    skip += items.length;
  }
  if (!paginationComplete) {
    throw Object.assign(new Error('The Orders window exceeded the page safety limit; narrow the date range and retry.'), { code: 'ORDER_INVENTORY_PAGE_LIMIT' });
  }

  const providerPayments = [];
  const seenPaymentIds = new Set();
  let paymentSkip = 0;
  let paymentPages = 0;
  let paymentPaginationComplete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await provider.payments.all({ from: window.from, to: window.to, count: PAGE_SIZE, skip: paymentSkip });
    } catch (error) {
      throw Object.assign(new Error('Razorpay Payments could not be listed for this window.'), {
        code: 'PAYMENT_INVENTORY_PROVIDER_FAILED', providerCode: safeCode(error),
      });
    }
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) throw Object.assign(new Error('Razorpay returned an invalid Payments collection.'), { code: 'INVALID_PAYMENT_INVENTORY_RESPONSE' });
    paymentPages += 1;
    for (const item of items) {
      if (typeof item?.id !== 'string' || !PAYMENT_ID_PATTERN.test(item.id) || safePaise(item.amount) === null
        || (item.order_id != null && (typeof item.order_id !== 'string' || !ORDER_ID_PATTERN.test(item.order_id)))) {
        throw Object.assign(new Error('Razorpay returned an invalid Payment reference, Order reference, or amount.'), { code: 'INVALID_PAYMENT_INVENTORY_RESPONSE' });
      }
      if (seenPaymentIds.has(item.id)) {
        throw Object.assign(new Error('The provider Payments page changed during the scan; retry with a narrower date window.'), { code: 'PAYMENT_INVENTORY_PAGINATION_CHANGED' });
      }
      seenPaymentIds.add(item.id);
      providerPayments.push(item);
    }
    if (items.length < PAGE_SIZE) {
      paymentPaginationComplete = true;
      break;
    }
    paymentSkip += items.length;
  }
  if (!paymentPaginationComplete) {
    throw Object.assign(new Error('The Payments window exceeded the page safety limit; narrow the date range and retry.'), { code: 'PAYMENT_INVENTORY_PAGE_LIMIT' });
  }

  // A payment can be created later than its Order. Recover the documented
  // Order-by-ID representation for captured payments whose Order fell outside
  // the Orders list window, without widening the list scan or posting money.
  const listedOrderCount = providerOrders.length;
  const providerOrderById = new Map(providerOrders.map((order) => [order.id, order]));
  const missingCapturedOrderIds = [...new Set(providerPayments
    .filter((payment) => payment.status === 'captured' && payment.captured === true
      && typeof payment.order_id === 'string' && !providerOrderById.has(payment.order_id))
    .map((payment) => payment.order_id))];
  const lookupIds = missingCapturedOrderIds.slice(0, MAX_LINKED_ORDER_LOOKUPS);
  const skippedOrderIds = new Set(missingCapturedOrderIds.slice(MAX_LINKED_ORDER_LOOKUPS));
  const failedOrderIds = new Set();
  const failedOrderCodes = new Map();
  if (lookupIds.length && typeof provider.orders.fetch === 'function') {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(LINKED_ORDER_LOOKUP_CONCURRENCY, lookupIds.length) }, async () => {
      while (cursor < lookupIds.length) {
        const orderId = lookupIds[cursor++];
        try {
          const order = await provider.orders.fetch(orderId);
          if (order?.id !== orderId || safePaise(order.amount) === null) {
            failedOrderIds.add(orderId);
            failedOrderCodes.set(orderId, 'INVALID_ORDER_INVENTORY_RESPONSE');
            continue;
          }
          providerOrderById.set(orderId, order);
          providerOrders.push(order);
        } catch (error) {
          failedOrderIds.add(orderId);
          failedOrderCodes.set(orderId, safeCode(error));
        }
      }
    });
    await Promise.all(workers);
  } else {
    for (const orderId of lookupIds) {
      failedOrderIds.add(orderId);
      failedOrderCodes.set(orderId, 'ORDER_INVENTORY_UNAVAILABLE');
    }
  }

  const orderIds = [...new Set(providerOrders.map((order) => order.id))];
  const attemptIds = [...new Set(providerOrders.map((order) => safeString(order.notes?.crm_attempt_id)).filter(Boolean))];
  const invoiceIds = [...new Set(providerOrders.map((order) => safeString(order.notes?.invoice_id)).filter(Boolean))];
  const invoiceNumbers = [...new Set(providerOrders.map((order) => safeString(order.receipt)).filter(Boolean))];

  const [attempts, payments, invoices] = await Promise.all([
    prisma.razorpayCheckoutAttempt.findMany({
      where: { OR: [
        ...(orderIds.length ? [{ razorpayOrderId: { in: orderIds } }] : []),
        ...(attemptIds.length ? [{ id: { in: attemptIds } }] : []),
      ] },
      select: { id: true, invoiceId: true, invoiceNumber: true, customerId: true, amountPaise: true, currency: true, mode: true, status: true, razorpayOrderId: true },
    }),
    orderIds.length ? prisma.payment.findMany({
      where: { razorpayOrderId: { in: orderIds } },
      select: { id: true, razorpayOrderId: true, razorpayPaymentId: true, amount: true, mode: true, status: true, kind: true, allocations: { select: { invoice: { select: { currency: true } } } } },
    }) : [],
    invoiceIds.length || invoiceNumbers.length ? prisma.invoice.findMany({
      where: { OR: [
        ...(invoiceIds.length ? [{ id: { in: invoiceIds } }] : []),
        ...(invoiceNumbers.length ? [{ invoiceNumber: { in: invoiceNumbers } }] : []),
      ] },
      select: { id: true, invoiceNumber: true, customerId: true, currency: true, totalAmount: true, balanceDue: true, status: true, voidedAt: true },
    }) : [],
  ]);

  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const attemptsByOrderId = new Map();
  for (const attempt of attempts) {
    if (attempt.razorpayOrderId) attemptsByOrderId.set(attempt.razorpayOrderId, [...(attemptsByOrderId.get(attempt.razorpayOrderId) || []), attempt]);
  }
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const invoicesByNumber = new Map(invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
  const paymentsByOrderId = new Map();
  for (const payment of payments) paymentsByOrderId.set(payment.razorpayOrderId, [...(paymentsByOrderId.get(payment.razorpayOrderId) || []), payment]);
  const existingProviderPayments = providerPayments.length ? await prisma.payment.findMany({
    where: { razorpayPaymentId: { in: providerPayments.map((payment) => payment.id) } },
    select: { id: true, razorpayPaymentId: true, razorpayOrderId: true, amount: true, mode: true, status: true, kind: true,
      allocations: { where: { status: 'POSTED', reversedAt: null }, select: { invoice: { select: { id: true, invoiceNumber: true, currency: true } } } } },
  }) : [];
  const existingByProviderPaymentId = new Map();
  for (const payment of existingProviderPayments) {
    existingByProviderPaymentId.set(payment.razorpayPaymentId, [...(existingByProviderPaymentId.get(payment.razorpayPaymentId) || []), payment]);
  }
  const matches = providerOrders.map((order) => {
    const linkedAttempts = attemptsByOrderId.get(order.id) || [];
    const linkedPayments = paymentsByOrderId.get(order.id) || [];
    const noteAttemptId = safeString(order.notes?.crm_attempt_id);
    const noteInvoiceId = safeString(order.notes?.invoice_id);
    const noteAttempt = noteAttemptId ? attemptsById.get(noteAttemptId) : null;
    const invoiceByNote = noteInvoiceId ? invoicesById.get(noteInvoiceId) : null;
    const invoiceByReceipt = safeString(order.receipt) ? invoicesByNumber.get(order.receipt) : null;
    const invoiceCandidates = new Map();
    for (const invoice of [noteAttempt ? invoicesById.get(noteAttempt.invoiceId) : null, invoiceByNote, invoiceByReceipt].filter(Boolean)) {
      invoiceCandidates.set(invoice.id, invoice);
    }

    let classification = 'UNMATCHED_REVIEW';
    let reasonCode = 'NO_EXACT_CRM_REFERENCE';
    let candidateInvoice = null;
    let candidateAttempt = null;
    if (linkedAttempts.length > 1 || linkedPayments.length > 1) {
      reasonCode = 'MULTIPLE_LOCAL_PROVIDER_LINKS';
    } else if (linkedPayments.length === 1) {
      const payment = linkedPayments[0];
      const amountPaise = moneyToPaise(payment.amount);
      const invoiceCurrencies = [...new Set((payment.allocations || []).map((allocation) => String(allocation.invoice?.currency || '').toUpperCase()).filter(Boolean))];
      if (payment.mode !== mode) {
        reasonCode = 'RAZORPAY_MODE_MISMATCH';
      } else if (amountPaise === null || amountPaise !== safePaise(order.amount)
        || invoiceCurrencies.length !== 1 || invoiceCurrencies[0] !== String(order.currency || '').toUpperCase()) {
        reasonCode = 'LOCAL_PAYMENT_PROVIDER_MISMATCH';
      } else {
        classification = 'ALREADY_LINKED_PAYMENT';
        reasonCode = 'EXACT_PROVIDER_ORDER_ID';
      }
    } else if (linkedAttempts.length === 1) {
      candidateAttempt = linkedAttempts[0];
      const amountMatches = candidateAttempt.amountPaise === safePaise(order.amount);
      const invoiceMatches = !noteInvoiceId || noteInvoiceId === candidateAttempt.invoiceId;
      if (candidateAttempt.mode === mode && amountMatches && invoiceMatches && String(candidateAttempt.currency).toUpperCase() === String(order.currency || '').toUpperCase()) {
        classification = 'ALREADY_LINKED_ATTEMPT';
        reasonCode = 'EXACT_PROVIDER_ORDER_ID';
        candidateInvoice = invoicesById.get(candidateAttempt.invoiceId) || null;
      } else {
        reasonCode = 'LOCAL_ATTEMPT_PROVIDER_MISMATCH';
      }
    } else if (noteAttemptId && !noteAttempt) {
      reasonCode = 'CRM_ATTEMPT_REFERENCE_NOT_FOUND';
    } else if (invoiceCandidates.size > 1) {
      reasonCode = 'CONFLICTING_INVOICE_REFERENCES';
    } else if (invoiceCandidates.size === 1) {
      candidateInvoice = [...invoiceCandidates.values()][0];
      candidateAttempt = noteAttempt;
      const invoiceAmountCandidates = [candidateInvoice.balanceDue, candidateInvoice.totalAmount].map(moneyToPaise).filter((amount) => amount !== null);
      const amountMatches = candidateAttempt
        ? candidateAttempt.amountPaise === safePaise(order.amount)
        : invoiceAmountCandidates.includes(safePaise(order.amount));
      const currencyMatches = String(candidateAttempt?.currency || candidateInvoice.currency || '').toUpperCase() === String(order.currency || '').toUpperCase();
      const modeMatches = !candidateAttempt || candidateAttempt.mode === mode;
      const providerOrderMatchesAttempt = !candidateAttempt?.razorpayOrderId || candidateAttempt.razorpayOrderId === order.id;
      const referencesAgree = (!noteInvoiceId || noteInvoiceId === candidateInvoice.id)
        && (!invoiceByReceipt || invoiceByReceipt.id === candidateInvoice.id)
        && (!candidateAttempt || candidateAttempt.invoiceId === candidateInvoice.id);
      if (candidateInvoice.voidedAt || candidateInvoice.status === 'VOID') reasonCode = 'INVOICE_VOIDED';
      else if (!modeMatches) reasonCode = 'RAZORPAY_MODE_MISMATCH';
      else if (!providerOrderMatchesAttempt) reasonCode = 'CRM_ATTEMPT_ORDER_REFERENCE_MISMATCH';
      else if (!amountMatches) reasonCode = 'PROVIDER_AMOUNT_MISMATCH';
      else if (!currencyMatches) reasonCode = 'PROVIDER_CURRENCY_MISMATCH';
      else if (!referencesAgree) reasonCode = 'CONFLICTING_INVOICE_REFERENCES';
      else {
        classification = 'EXACT_INVOICE_CANDIDATE';
        reasonCode = noteAttempt ? 'INVOICE_AND_ATTEMPT_NOTES_MATCH' : noteInvoiceId ? 'INVOICE_NOTE_AND_AMOUNT_MATCH' : 'UNIQUE_INVOICE_RECEIPT_AND_AMOUNT_MATCH';
      }
    }

    return {
      providerOrder: providerOrderForReview(order),
      classification,
      reasonCode,
      ...(candidateInvoice ? { invoice: { id: candidateInvoice.id, invoiceNumber: candidateInvoice.invoiceNumber, status: candidateInvoice.status, currency: candidateInvoice.currency, balanceDuePaise: moneyToPaise(candidateInvoice.balanceDue)?.toString() ?? null } } : {}),
      ...(candidateAttempt ? { checkoutAttemptId: candidateAttempt.id, checkoutAttemptStatus: candidateAttempt.status } : {}),
      ...(linkedPayments.length === 1 ? { crmPaymentId: linkedPayments[0].id } : {}),
    };
  });

  const exactByInvoice = new Map();
  for (const item of matches) {
    if (item.classification !== 'EXACT_INVOICE_CANDIDATE' || !item.invoice?.id) continue;
    exactByInvoice.set(item.invoice.id, [...(exactByInvoice.get(item.invoice.id) || []), item]);
  }
  for (const items of exactByInvoice.values()) {
    if (items.length < 2) continue;
    for (const item of items) {
      item.classification = 'REVIEW_REQUIRED';
      item.reasonCode = 'MULTIPLE_PROVIDER_ORDERS_FOR_INVOICE';
    }
  }

  const orderMatchById = new Map(matches.map((match) => [match.providerOrder.id, match]));
  const paymentReviewItems = providerPayments.map((payment) => {
    const providerOrder = payment.order_id ? orderMatchById.get(payment.order_id) : null;
    const existingRows = existingByProviderPaymentId.get(payment.id) || [];
    const existing = existingRows.length === 1 ? existingRows[0] : null;
    const invoice = existing?.allocations?.length === 1 ? existing.allocations[0].invoice : providerOrder?.invoice || null;
    const orderReferenceIsExact = ['EXACT_INVOICE_CANDIDATE', 'ALREADY_LINKED_ATTEMPT', 'ALREADY_LINKED_PAYMENT'].includes(providerOrder?.classification);
    let classification = 'UNMATCHED_PAYMENT_REVIEW';
    let reasonCode = payment.order_id && !providerOrderById.has(payment.order_id)
      ? skippedOrderIds.has(payment.order_id)
        ? 'LINKED_ORDER_LOOKUP_LIMIT'
        : failedOrderIds.has(payment.order_id)
          ? 'LINKED_ORDER_LOOKUP_FAILED'
          : 'PROVIDER_ORDER_NOT_FOUND'
      : 'NO_EXACT_ORDER_INVOICE_REFERENCE';
    if (existingRows.length > 1) {
      reasonCode = 'MULTIPLE_LOCAL_PROVIDER_PAYMENT_LINKS';
    } else if (existing) {
      const localAmount = moneyToPaise(existing.amount);
      const allocationMatches = existing.allocations?.length === 1 && existing.allocations[0].invoice?.id === invoice?.id;
      if (existing.mode !== mode) {
        reasonCode = 'RAZORPAY_MODE_MISMATCH';
      } else if (existing.kind !== 'RECEIPT' || existing.status !== 'CAPTURED'
        || localAmount !== safePaise(payment.amount) || !allocationMatches
        || (payment.order_id && existing.razorpayOrderId !== payment.order_id)) {
        reasonCode = 'LOCAL_PAYMENT_PROVIDER_MISMATCH';
      } else {
        classification = 'ALREADY_LINKED_PAYMENT';
        reasonCode = 'EXACT_PROVIDER_PAYMENT_ID';
      }
    } else if (payment.status !== 'captured' || payment.captured !== true) {
      classification = 'NON_CAPTURED_PROVIDER_PAYMENT';
      reasonCode = 'PROVIDER_PAYMENT_NOT_CAPTURED';
    } else if (orderReferenceIsExact && invoice) {
      const orderAmount = providerOrder?.providerOrder?.amountPaise;
      const orderAmountPaid = providerOrder?.providerOrder?.amountPaidPaise;
      const orderCurrency = String(providerOrder?.providerOrder?.currency || '').toUpperCase();
      if (safePaise(payment.amount) !== safePaise(orderAmount)) reasonCode = 'PAYMENT_ORDER_AMOUNT_MISMATCH';
      else if (providerOrder?.providerOrder?.status !== 'paid' || safePaise(orderAmountPaid) !== safePaise(payment.amount)) reasonCode = 'PAYMENT_ORDER_CAPTURE_STATE_MISMATCH';
      else if (String(payment.currency || '').toUpperCase() !== orderCurrency || String(invoice.currency || '').toUpperCase() !== orderCurrency) reasonCode = 'PAYMENT_ORDER_CURRENCY_MISMATCH';
      else {
        classification = 'EXACT_CAPTURED_PAYMENT_CANDIDATE';
        reasonCode = 'CAPTURED_PAYMENT_AND_ORDER_REFERENCE_MATCH';
      }
    }
    return {
      providerPayment: {
        id: payment.id, orderId: payment.order_id || null, amountPaise: String(payment.amount),
        currency: safeString(payment.currency, 3)?.toUpperCase() || null,
        status: safeString(payment.status, 32) || 'unknown', captured: payment.captured === true,
        method: safeString(payment.method, 32), createdAt: Number.isSafeInteger(Number(payment.created_at)) ? Number(payment.created_at) : null,
      },
      classification, reasonCode,
      ...(payment.order_id && failedOrderCodes.has(payment.order_id) ? { providerCode: failedOrderCodes.get(payment.order_id) } : {}),
      ...(invoice ? { invoice: {
        id: invoice.id, invoiceNumber: invoice.invoiceNumber,
        ...(providerOrder?.invoice?.status ? { status: providerOrder.invoice.status } : {}),
        ...(providerOrder?.invoice?.balanceDuePaise ? { balanceDuePaise: providerOrder.invoice.balanceDuePaise } : {}),
      } } : {}),
      ...(existing ? { crmPaymentId: existing.id } : {}),
    };
  });
  const capturedByInvoice = new Map();
  for (const item of paymentReviewItems) {
    if (item.classification !== 'EXACT_CAPTURED_PAYMENT_CANDIDATE' || !item.invoice?.id) continue;
    capturedByInvoice.set(item.invoice.id, [...(capturedByInvoice.get(item.invoice.id) || []), item]);
  }
  for (const candidates of capturedByInvoice.values()) {
    if (candidates.length < 2) continue;
    for (const item of candidates) {
      item.classification = 'REVIEW_REQUIRED';
      item.reasonCode = 'MULTIPLE_CAPTURED_PAYMENTS_FOR_INVOICE';
    }
  }
  const paymentCounts = paymentReviewItems.reduce((summary, item) => {
    summary[item.classification] = (summary[item.classification] || 0) + 1;
    return summary;
  }, {});

  const counts = matches.reduce((summary, item) => {
    summary[item.classification] = (summary[item.classification] || 0) + 1;
    return summary;
  }, {});
  const reviewItems = matches.filter((item) => !['ALREADY_LINKED_PAYMENT', 'ALREADY_LINKED_ATTEMPT'].includes(item.classification));
  return {
    mode,
    window,
    paginationComplete,
    pages: pagesRead,
    scanned: providerOrders.length,
    listed: listedOrderCount,
    linkedOrderLookups: {
      requested: lookupIds.length,
      fetched: lookupIds.length - failedOrderIds.size,
      failed: failedOrderIds.size,
      skippedByLimit: skippedOrderIds.size,
      complete: failedOrderIds.size === 0 && skippedOrderIds.size === 0,
      failureCodeCounts: [...failedOrderCodes.values()].reduce((counts, code) => {
        if (typeof code !== 'string' || !code) return counts;
        counts[code] = (counts[code] || 0) + 1;
        return counts;
      }, {}),
    },
    counts,
    reviewItems: reviewItems.slice(0, MAX_REVIEW_ITEMS),
    reviewItemsTruncated: reviewItems.length > MAX_REVIEW_ITEMS,
    paymentInventory: {
      paginationComplete: paymentPaginationComplete,
      pages: paymentPages,
      scanned: providerPayments.length,
      counts: paymentCounts,
      reviewItems: paymentReviewItems.filter((item) => item.classification !== 'ALREADY_LINKED_PAYMENT').slice(0, MAX_REVIEW_ITEMS),
      reviewItemsTruncated: paymentReviewItems.filter((item) => item.classification !== 'ALREADY_LINKED_PAYMENT').length > MAX_REVIEW_ITEMS,
    },
  };
};

module.exports = { previewRazorpayOrderInventory, validateWindow };
