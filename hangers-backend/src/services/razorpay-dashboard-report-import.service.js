const { parse } = require('csv-parse/sync');
const prisma = require('../config/database');
const { getMode } = require('./razorpay-invoice-checkout.service');

const MAX_BYTES = 450_000;
const MAX_ROWS = 10_000;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]+$/;
const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]+$/;

// Published report schema plus the headers used by Razorpay's linked sample
// workbook. Sensitive columns are accepted but deliberately discarded.
const DOCUMENTED_PAYMENT_COLUMNS = new Set([
  'id', 'payment id', 'settled by', 'notes', 'payment method', 'method', 'captured at', 'captured',
  'customer email', 'customer contact', 'contact', 'email', 'currency', 'order id', 'created at',
  'status', 'amount', 'fee', 'tax', 'receiver id', 'error code', 'invoice id', 'vpa',
  'error description', 'receiver type', 'bank', 'wallet', 'card id', 'card', 'description',
  'international', 'refund status', 'amount refunded', 'amount transferred', 'primary transaction id',
  'retrieval reference number', 'auth code', 'updated at', 'card type', 'card network',
]);

const reportError = (code, message) => Object.assign(new Error(message), { code });
const normalizeHeader = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, ' ');
  return ({ id: 'payment id', method: 'payment method', contact: 'customer contact', email: 'customer email' })[normalized] || normalized;
};
const moneyToPaise = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) return null;
  return BigInt(Math.round(amount * 100));
};

const parseReportInrToPaise = (value, rowNumber, { allowZero = false } = {}) => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,13})(?:\.(\d{1,2}))?$/);
  if (!match) throw reportError('RAZORPAY_REPORT_AMOUNT_INVALID', `Report row ${rowNumber} has an invalid INR amount.`);
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if ((!allowZero && paise <= 0n) || paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw reportError('RAZORPAY_REPORT_AMOUNT_INVALID', `Report row ${rowNumber} has an unsupported amount.`);
  }
  return paise;
};

const parseRazorpayPaymentsReportCsv = (csvText) => {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw reportError('RAZORPAY_REPORT_EMPTY', 'Select a non-empty Razorpay Payments CSV report.');
  }
  if (Buffer.byteLength(csvText, 'utf8') > MAX_BYTES) {
    throw reportError('RAZORPAY_REPORT_TOO_LARGE', 'Razorpay CSV reports must be smaller than 450 KB.');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(csvText)) {
    throw reportError('RAZORPAY_REPORT_CONTROL_CHARS', 'The report contains unsupported control characters.');
  }

  let records;
  try {
    records = parse(csvText, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 16_384 });
  } catch {
    throw reportError('RAZORPAY_REPORT_CSV_INVALID', 'Razorpay CSV format is invalid. Check quoting and row structure.');
  }
  if (records.length < 2) throw reportError('RAZORPAY_REPORT_NO_ROWS', 'The report must contain a header and at least one payment row.');
  if (records.length - 1 > MAX_ROWS) throw reportError('RAZORPAY_REPORT_TOO_MANY_ROWS', `The report cannot exceed ${MAX_ROWS} rows.`);

  const headers = records[0].map(normalizeHeader);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw reportError('RAZORPAY_REPORT_HEADERS_INVALID', 'Report headers must be non-empty and unique.');
  }
  const unsupported = headers.filter((header) => !DOCUMENTED_PAYMENT_COLUMNS.has(header));
  if (unsupported.length) throw reportError('RAZORPAY_REPORT_COLUMNS_UNSUPPORTED', 'This is not a recognized Razorpay Payments report schema.');
  const paymentIdHeader = 'payment id';
  const required = [paymentIdHeader, 'currency', 'status', 'amount'];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw reportError('RAZORPAY_REPORT_COLUMNS_MISSING', `The report is missing required columns: ${missing.join(', ')}.`);

  const seenIds = new Set();
  return records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw reportError('RAZORPAY_REPORT_ROW_INVALID', `Report row ${index + 2} has an invalid number of columns.`);
    }
    const row = Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? '').trim()]));
    const paymentId = row[paymentIdHeader];
    const orderId = row['order id'] || null;
    const currency = row.currency.toUpperCase();
    const status = row.status.toLowerCase();
    if (!PAYMENT_ID_PATTERN.test(paymentId)) throw reportError('RAZORPAY_REPORT_PAYMENT_ID_INVALID', `Report row ${index + 2} has an invalid Payment ID.`);
    if (seenIds.has(paymentId)) throw reportError('RAZORPAY_REPORT_DUPLICATE_PAYMENT', `Payment ${paymentId} appears more than once in the report.`);
    seenIds.add(paymentId);
    if (orderId && !ORDER_ID_PATTERN.test(orderId)) throw reportError('RAZORPAY_REPORT_ORDER_ID_INVALID', `Report row ${index + 2} has an invalid Order ID.`);
    if (currency !== 'INR') throw reportError('RAZORPAY_REPORT_CURRENCY_UNSUPPORTED', `Report row ${index + 2} uses an unsupported currency; only INR reports can be matched to CRM invoices.`);
    if (!/^[a-z_]{1,32}$/.test(status)) throw reportError('RAZORPAY_REPORT_STATUS_INVALID', `Report row ${index + 2} has an invalid payment status.`);
    const amount = parseReportInrToPaise(row.amount, index + 2);
    return {
      rowNumber: index + 2,
      paymentId,
      orderId,
      status,
      amountPaise: amount.toString(),
      currency,
    };
  });
};

const parseRazorpayOrdersReportCsv = (csvText) => {
  if (typeof csvText !== 'string' || !csvText.trim()) throw reportError('RAZORPAY_REPORT_EMPTY', 'Select a non-empty Razorpay Orders CSV report.');
  if (Buffer.byteLength(csvText, 'utf8') > MAX_BYTES) throw reportError('RAZORPAY_REPORT_TOO_LARGE', 'Razorpay CSV reports must be smaller than 450 KB.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(csvText)) throw reportError('RAZORPAY_REPORT_CONTROL_CHARS', 'The report contains unsupported control characters.');
  let records;
  try { records = parse(csvText, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 16_384 }); }
  catch { throw reportError('RAZORPAY_REPORT_CSV_INVALID', 'Razorpay CSV format is invalid. Check quoting and row structure.'); }
  if (records.length < 2) throw reportError('RAZORPAY_REPORT_NO_ROWS', 'The report must contain a header and at least one Order row.');
  if (records.length - 1 > MAX_ROWS) throw reportError('RAZORPAY_REPORT_TOO_MANY_ROWS', `The report cannot exceed ${MAX_ROWS} rows.`);

  const headers = records[0].map((value) => String(value || '').trim().toLowerCase().replace(/_/g, ' '));
  if (headers.includes('id')) headers[headers.indexOf('id')] = 'order id';
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw reportError('RAZORPAY_REPORT_HEADERS_INVALID', 'Report headers must be non-empty and unique.');
  const allowed = new Set(['order id', 'amount', 'amount paid', 'amount due', 'currency', 'receipt', 'offer id', 'status', 'attempts', 'notes', 'created at', 'updated at']);
  if (headers.some((header) => !allowed.has(header))) throw reportError('RAZORPAY_REPORT_COLUMNS_UNSUPPORTED', 'This is not a recognized Razorpay Orders report schema.');
  const missing = ['order id', 'amount', 'currency', 'status'].filter((header) => !headers.includes(header));
  if (missing.length) throw reportError('RAZORPAY_REPORT_COLUMNS_MISSING', `The report is missing required columns: ${missing.join(', ')}.`);
  const seenIds = new Set();
  return records.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) throw reportError('RAZORPAY_REPORT_CSV_INVALID', `Report row ${rowNumber} has an invalid number of columns.`);
    const row = Object.fromEntries(headers.map((header, column) => [header, String(values[column] ?? '').trim()]));
    const orderId = row['order id'];
    if (!ORDER_ID_PATTERN.test(orderId)) throw reportError('RAZORPAY_REPORT_ORDER_ID_INVALID', `Report row ${rowNumber} has an invalid Order ID.`);
    if (seenIds.has(orderId)) throw reportError('RAZORPAY_REPORT_DUPLICATE_ORDER', `Order ${orderId} appears more than once in the report.`);
    seenIds.add(orderId);
    if (row.currency.toUpperCase() !== 'INR') throw reportError('RAZORPAY_REPORT_CURRENCY_UNSUPPORTED', `Report row ${rowNumber} uses an unsupported currency; only INR reports can be matched to CRM invoices.`);
    if (!/^[a-z_]{1,32}$/.test(row.status.toLowerCase())) throw reportError('RAZORPAY_REPORT_STATUS_INVALID', `Report row ${rowNumber} has an invalid Order status.`);
    const amountPaise = parseReportInrToPaise(row.amount, rowNumber);
    const amountPaidPaise = row['amount paid'] !== undefined && row['amount paid'] !== '' ? parseReportInrToPaise(row['amount paid'], rowNumber, { allowZero: true }) : null;
    const amountDuePaise = row['amount due'] !== undefined && row['amount due'] !== '' ? parseReportInrToPaise(row['amount due'], rowNumber, { allowZero: true }) : null;
    const attempts = row.attempts === undefined || row.attempts === '' ? null : Number(row.attempts);
    if (attempts !== null && (!Number.isSafeInteger(attempts) || attempts < 0)) {
      throw reportError('RAZORPAY_REPORT_ATTEMPTS_INVALID', `Report row ${rowNumber} has an invalid attempt count.`);
    }
    let noteInvoiceId = null;
    let noteAttemptId = null;
    if (row.notes) {
      try {
        const notes = JSON.parse(row.notes);
        if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
          noteInvoiceId = typeof notes.invoice_id === 'string' && notes.invoice_id.length <= 64 ? notes.invoice_id : null;
          noteAttemptId = typeof notes.crm_attempt_id === 'string' && notes.crm_attempt_id.length <= 64 ? notes.crm_attempt_id : null;
        }
      } catch {
        // Notes are optional provider metadata; malformed/free-text Notes cannot establish a CRM match.
      }
    }
    const receipt = row.receipt && row.receipt.length <= 40 ? row.receipt : null;
    return {
      rowNumber,
      orderId,
      status: row.status.toLowerCase(),
      amountPaise: amountPaise.toString(),
      amountPaidPaise: amountPaidPaise?.toString() ?? null,
      amountDuePaise: amountDuePaise?.toString() ?? null,
      attempts,
      currency: 'INR',
      receipt,
      noteInvoiceId,
      noteAttemptId,
    };
  });
};

const previewRazorpayDashboardPaymentsReport = async ({ csvText, keyId = process.env.RAZORPAY_KEY_ID, db = prisma }) => {
  const rows = parseRazorpayPaymentsReportCsv(csvText);
  const configuredMode = getMode(keyId);
  const paymentIds = rows.map((row) => row.paymentId);
  const orderIds = [...new Set(rows.map((row) => row.orderId).filter(Boolean))];
  const [localPayments, attempts] = await Promise.all([
    db.payment.findMany({
      where: { razorpayPaymentId: { in: paymentIds } },
      select: { id: true, razorpayPaymentId: true, razorpayOrderId: true, amount: true, mode: true, status: true, kind: true,
        allocations: { where: { status: 'POSTED', reversedAt: null }, select: { invoiceId: true, invoice: { select: { currency: true } } } } },
    }),
    orderIds.length ? db.razorpayCheckoutAttempt.findMany({
      where: { razorpayOrderId: { in: orderIds } },
      select: { id: true, invoiceId: true, amountPaise: true, currency: true, mode: true, status: true, razorpayOrderId: true },
    }) : [],
  ]);
  const attemptInvoiceIds = [...new Set(attempts.map((attempt) => attempt.invoiceId))];
  const invoices = attemptInvoiceIds.length ? await db.invoice.findMany({
    where: { id: { in: attemptInvoiceIds } },
    select: { id: true, invoiceNumber: true, currency: true, balanceDue: true, status: true, voidedAt: true },
  }) : [];
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paymentsById = new Map();
  for (const payment of localPayments) paymentsById.set(payment.razorpayPaymentId, [...(paymentsById.get(payment.razorpayPaymentId) || []), payment]);
  const attemptsByOrderId = new Map();
  for (const attempt of attempts) attemptsByOrderId.set(attempt.razorpayOrderId, [...(attemptsByOrderId.get(attempt.razorpayOrderId) || []), attempt]);

  const reviewed = rows.map((row) => {
    const candidates = paymentsById.get(row.paymentId) || [];
    const linkedAttempts = row.orderId ? attemptsByOrderId.get(row.orderId) || [] : [];
    const amountPaise = BigInt(row.amountPaise);
    let classification = 'UNMATCHED_REVIEW';
    let reasonCode = 'NO_EXACT_CRM_REFERENCE';
    let invoice = null;
    let attempt = null;
    if (candidates.length > 1) {
      reasonCode = 'MULTIPLE_LOCAL_PAYMENT_LINKS';
    } else if (candidates.length === 1) {
      const payment = candidates[0];
      const amountMatches = moneyToPaise(payment.amount) === amountPaise;
      const currencyMatches = payment.allocations?.length > 0
        && payment.allocations.every((allocation) => String(allocation.invoice?.currency || '').toUpperCase() === row.currency);
      if (payment.mode === configuredMode && payment.kind === 'RECEIPT' && payment.status === 'CAPTURED'
        && payment.razorpayOrderId === row.orderId && amountMatches && currencyMatches) {
        classification = 'ALREADY_RECORDED';
        reasonCode = 'EXACT_PROVIDER_PAYMENT_ID';
      } else {
        reasonCode = 'LOCAL_PAYMENT_PROVIDER_MISMATCH';
      }
    } else if (row.status !== 'captured') {
      classification = 'NOT_CAPTURED_IN_REPORT';
      reasonCode = 'REPORT_STATUS_NOT_CAPTURED';
    } else if (!row.orderId) {
      reasonCode = 'REPORT_ORDER_ID_MISSING';
    } else if (linkedAttempts.length > 1) {
      reasonCode = 'MULTIPLE_LOCAL_ATTEMPT_LINKS';
    } else if (linkedAttempts.length === 1) {
      attempt = linkedAttempts[0];
      invoice = invoicesById.get(attempt.invoiceId) || null;
      const attemptAmount = BigInt(attempt.amountPaise);
      const invoiceBalancePaise = invoice ? moneyToPaise(invoice.balanceDue) : null;
      if (attempt.mode !== configuredMode) reasonCode = 'RAZORPAY_MODE_MISMATCH';
      else if (attemptAmount !== amountPaise) reasonCode = 'PROVIDER_AMOUNT_MISMATCH';
      else if (String(attempt.currency).toUpperCase() !== row.currency || String(invoice?.currency || '').toUpperCase() !== row.currency) reasonCode = 'PROVIDER_CURRENCY_MISMATCH';
      else if (!invoice || invoice.voidedAt || invoice.status === 'VOID') reasonCode = 'INVOICE_NOT_PAYABLE';
      else if (invoiceBalancePaise !== amountPaise) reasonCode = 'INVOICE_BALANCE_MISMATCH';
      else {
        classification = 'EXACT_CAPTURED_PAYMENT_CANDIDATE';
        reasonCode = 'REPORT_IDS_AND_CRM_ATTEMPT_MATCH_PROVIDER_VERIFICATION_REQUIRED';
      }
    }
    return {
      rowNumber: row.rowNumber,
      providerPayment: { id: row.paymentId, orderId: row.orderId, status: row.status, amountPaise: row.amountPaise, currency: row.currency },
      classification,
      reasonCode,
      ...(invoice && attempt ? {
        invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, balanceDuePaise: moneyToPaise(invoice.balanceDue)?.toString() ?? null },
        checkoutAttemptId: attempt.id,
      } : {}),
    };
  });
  const candidateCount = reviewed.filter((row) => row.classification === 'EXACT_CAPTURED_PAYMENT_CANDIDATE').length;
  const capturedRows = reviewed.filter((row) => row.providerPayment.status === 'captured').length;
  return {
    configuredMode,
    totalRows: reviewed.length,
    capturedRows,
    otherStatusRows: reviewed.length - capturedRows,
    exactCandidateRows: candidateCount,
    preview: reviewed.slice(0, 100),
    truncated: reviewed.length > 100,
  };
};

const previewRazorpayDashboardOrdersReport = async ({ csvText, keyId = process.env.RAZORPAY_KEY_ID, db = prisma }) => {
  const rows = parseRazorpayOrdersReportCsv(csvText);
  const configuredMode = getMode(keyId);
  const orderIds = rows.map((row) => row.orderId);
  const invoiceIds = [...new Set(rows.map((row) => row.noteInvoiceId).filter(Boolean))];
  const invoiceNumbers = [...new Set(rows.map((row) => row.receipt).filter(Boolean))];
  const attemptIds = [...new Set(rows.map((row) => row.noteAttemptId).filter(Boolean))];
  const [attemptsByOrder, invoices] = await Promise.all([
    db.razorpayCheckoutAttempt.findMany({
      where: { OR: [
        { razorpayOrderId: { in: orderIds } },
        ...(attemptIds.length ? [{ id: { in: attemptIds } }] : []),
      ] },
      select: { id: true, invoiceId: true, amountPaise: true, currency: true, mode: true, status: true, razorpayOrderId: true },
    }),
    db.invoice.findMany({
      where: { OR: [
        ...(invoiceIds.length ? [{ id: { in: invoiceIds } }] : []),
        ...(invoiceNumbers.length ? [{ invoiceNumber: { in: invoiceNumbers } }] : []),
      ] },
      select: { id: true, invoiceNumber: true, currency: true, totalAmount: true, balanceDue: true, status: true, voidedAt: true },
    }),
  ]);
  const attemptsById = new Map(attemptsByOrder.map((attempt) => [attempt.id, attempt]));
  const attemptsByProviderOrder = new Map();
  for (const attempt of attemptsByOrder) if (attempt.razorpayOrderId) attemptsByProviderOrder.set(attempt.razorpayOrderId, [...(attemptsByProviderOrder.get(attempt.razorpayOrderId) || []), attempt]);
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const invoicesByNumber = new Map(invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
  const matches = rows.map((row) => {
    const localAttempts = attemptsByProviderOrder.get(row.orderId) || [];
    const attemptFromNotes = row.noteAttemptId ? attemptsById.get(row.noteAttemptId) || null : null;
    const candidates = new Map();
    const invoiceFromNotes = row.noteInvoiceId ? invoicesById.get(row.noteInvoiceId) : null;
    const invoiceFromReceipt = row.receipt ? invoicesByNumber.get(row.receipt) : null;
    for (const invoice of [invoiceFromNotes, invoiceFromReceipt, attemptFromNotes ? invoicesById.get(attemptFromNotes.invoiceId) : null, ...localAttempts.map((attempt) => invoicesById.get(attempt.invoiceId))].filter(Boolean)) candidates.set(invoice.id, invoice);
    let classification = 'UNMATCHED_REVIEW';
    let reasonCode = 'NO_EXACT_CRM_REFERENCE';
    let invoice = null;
    const attempt = localAttempts.length === 1 ? localAttempts[0] : attemptFromNotes;
    if (localAttempts.length > 1 || (attemptFromNotes && localAttempts.length === 1 && attemptFromNotes.id !== localAttempts[0].id)) reasonCode = 'CONFLICTING_LOCAL_ATTEMPTS';
    else if (candidates.size > 1) reasonCode = 'CONFLICTING_INVOICE_REFERENCES';
    else if (candidates.size === 1) {
      invoice = [...candidates.values()][0];
      const invoicePaise = moneyToPaise(invoice.balanceDue);
      const orderPaise = BigInt(row.amountPaise);
      const referencesAgree = (!row.noteInvoiceId || row.noteInvoiceId === invoice.id)
        && (!invoiceFromReceipt || invoiceFromReceipt.id === invoice.id)
        && (!attempt || (attempt.invoiceId === invoice.id && attempt.razorpayOrderId === row.orderId))
        && (!localAttempts.length || localAttempts[0].invoiceId === invoice.id);
      const modeMatches = (!attempt || attempt.mode === configuredMode);
      const amountMatches = invoicePaise === orderPaise
        && (!attempt || BigInt(attempt.amountPaise) === orderPaise);
      const currencyMatches = String(invoice.currency || '').toUpperCase() === row.currency
        && (!attempt || String(attempt.currency || '').toUpperCase() === row.currency);
      if (!referencesAgree) reasonCode = 'CONFLICTING_INVOICE_REFERENCES';
      else if (!modeMatches) reasonCode = 'RAZORPAY_MODE_MISMATCH';
      else if (!amountMatches) reasonCode = 'PROVIDER_AMOUNT_MISMATCH';
      else if (!currencyMatches) reasonCode = 'PROVIDER_CURRENCY_MISMATCH';
      else if (invoice.voidedAt || invoice.status === 'VOID') reasonCode = 'INVOICE_VOIDED';
      else if (row.status !== 'created' || row.attempts !== 0 || row.amountPaidPaise !== '0' || row.amountDuePaise !== row.amountPaise) reasonCode = 'ORDER_NOT_PROVEN_UNUSED';
      else {
        classification = attempt ? 'EXACT_ORDER_AND_ATTEMPT_CANDIDATE' : 'INVOICE_REFERENCE_CANDIDATE_REQUIRES_MODE_REVIEW';
        reasonCode = row.noteInvoiceId ? 'ORDER_NOTE_INVOICE_AMOUNT_MATCH' : row.receipt ? 'ORDER_RECEIPT_INVOICE_AMOUNT_MATCH' : 'LOCAL_ORDER_ATTEMPT_AMOUNT_MATCH';
      }
    }
    return {
      rowNumber: row.rowNumber,
      providerOrder: { id: row.orderId, status: row.status, amountPaise: row.amountPaise, amountPaidPaise: row.amountPaidPaise, amountDuePaise: row.amountDuePaise, attempts: row.attempts, currency: row.currency },
      classification,
      reasonCode,
      ...(invoice ? { invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, balanceDuePaise: moneyToPaise(invoice.balanceDue)?.toString() ?? null } } : {}),
      ...(attempt ? { checkoutAttemptId: attempt.id, checkoutAttemptStatus: attempt.status } : {}),
    };
  });
  return {
    configuredMode,
    totalRows: matches.length,
    paidOrders: matches.filter((row) => row.providerOrder.status === 'paid').length,
    unpaidOrders: matches.filter((row) => row.providerOrder.status !== 'paid').length,
    exactAttemptCandidates: matches.filter((row) => row.classification === 'EXACT_ORDER_AND_ATTEMPT_CANDIDATE').length,
    invoiceReferenceCandidates: matches.filter((row) => row.classification === 'INVOICE_REFERENCE_CANDIDATE_REQUIRES_MODE_REVIEW').length,
    preview: matches.slice(0, 100),
    truncated: matches.length > 100,
  };
};

const previewRazorpayHistoricalPaymentReports = async ({ paymentsCsvText, ordersCsvText, keyId = process.env.RAZORPAY_KEY_ID, db = prisma, includeAllPreview = false }) => {
  if (Buffer.byteLength(String(paymentsCsvText || ''), 'utf8') + Buffer.byteLength(String(ordersCsvText || ''), 'utf8') > 850_000) {
    throw reportError('RAZORPAY_REPORT_PAIR_TOO_LARGE', 'The Payments and Orders reports together must be smaller than 850 KB.');
  }
  const paymentRows = parseRazorpayPaymentsReportCsv(paymentsCsvText);
  const orderRows = parseRazorpayOrdersReportCsv(ordersCsvText);
  const configuredMode = getMode(keyId);
  const ordersById = new Map(orderRows.map((row) => [row.orderId, row]));
  const paymentIds = paymentRows.map((row) => row.paymentId);
  const orderIds = [...new Set(paymentRows.map((row) => row.orderId).filter(Boolean))];
  const [localPayments, attempts, invoices] = await Promise.all([
    db.payment.findMany({
      where: { razorpayPaymentId: { in: paymentIds } },
      select: { id: true, razorpayPaymentId: true, razorpayOrderId: true, amount: true, mode: true, status: true, kind: true,
        allocations: { where: { status: 'POSTED', reversedAt: null }, select: { invoiceId: true, invoice: { select: { currency: true } } } } },
    }),
    db.razorpayCheckoutAttempt.findMany({
      where: { OR: [{ razorpayOrderId: { in: orderIds } }, { razorpayPaymentId: { in: paymentIds } }] },
      select: { id: true, invoiceId: true, amountPaise: true, currency: true, mode: true, status: true, razorpayOrderId: true, razorpayPaymentId: true },
    }),
    db.invoice.findMany({
      where: { OR: [
        ...[...new Set(orderRows.map((row) => row.noteInvoiceId).filter(Boolean))].map((id) => ({ id })),
        ...[...new Set(orderRows.map((row) => row.receipt).filter(Boolean))].map((invoiceNumber) => ({ invoiceNumber })),
      ] },
      select: { id: true, invoiceNumber: true, currency: true, balanceDue: true, status: true, voidedAt: true },
    }),
  ]);
  const paymentsById = new Map();
  for (const item of localPayments) paymentsById.set(item.razorpayPaymentId, [...(paymentsById.get(item.razorpayPaymentId) || []), item]);
  const attemptsByOrder = new Map();
  const attemptsByPayment = new Map();
  for (const attempt of attempts) {
    if (attempt.razorpayOrderId) attemptsByOrder.set(attempt.razorpayOrderId, [...(attemptsByOrder.get(attempt.razorpayOrderId) || []), attempt]);
    if (attempt.razorpayPaymentId) attemptsByPayment.set(attempt.razorpayPaymentId, [...(attemptsByPayment.get(attempt.razorpayPaymentId) || []), attempt]);
  }
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const invoicesByNumber = new Map(invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
  const paymentCountsByOrder = new Map();
  for (const row of paymentRows) {
    if (row.orderId && row.status === 'captured') paymentCountsByOrder.set(row.orderId, (paymentCountsByOrder.get(row.orderId) || 0) + 1);
  }

  const preview = paymentRows.map((row) => {
    const order = row.orderId ? ordersById.get(row.orderId) : null;
    const localLinks = paymentsById.get(row.paymentId) || [];
    const linkedAttempts = [...new Map([
      ...(row.orderId ? attemptsByOrder.get(row.orderId) || [] : []),
      ...(attemptsByPayment.get(row.paymentId) || []),
    ].map((attempt) => [attempt.id, attempt])).values()];
    const noteInvoice = order?.noteInvoiceId ? invoicesById.get(order.noteInvoiceId) : null;
    const receiptInvoice = order?.receipt ? invoicesByNumber.get(order.receipt) : null;
    const attemptInvoice = linkedAttempts.length === 1 ? invoicesById.get(linkedAttempts[0].invoiceId) : null;
    const invoiceCandidates = new Map([noteInvoice, receiptInvoice, attemptInvoice].filter(Boolean).map((invoice) => [invoice.id, invoice]));
    const invoice = invoiceCandidates.size === 1 ? [...invoiceCandidates.values()][0] : null;
    let classification = 'UNMATCHED_REVIEW';
    let reasonCode = 'NO_EXACT_REPORT_REFERENCE';
    if (localLinks.length === 1 && localLinks[0].kind === 'RECEIPT' && localLinks[0].status === 'CAPTURED'
      && localLinks[0].mode === configuredMode && localLinks[0].razorpayOrderId === row.orderId
      && moneyToPaise(localLinks[0].amount) === BigInt(row.amountPaise)
      && localLinks[0].allocations?.some((allocation) => invoice && allocation.invoiceId === invoice.id)) {
      classification = 'ALREADY_RECORDED';
      reasonCode = 'EXACT_PROVIDER_PAYMENT_ID';
    } else if (row.status !== 'captured') reasonCode = 'REPORT_PAYMENT_NOT_CAPTURED';
    else if (!row.orderId || !order) reasonCode = 'MATCHING_ORDER_REPORT_ROW_REQUIRED';
    else if (paymentCountsByOrder.get(row.orderId) !== 1) reasonCode = 'MULTIPLE_CAPTURED_PAYMENTS_FOR_ORDER';
    else if (invoiceCandidates.size !== 1) reasonCode = invoiceCandidates.size > 1 ? 'CONFLICTING_INVOICE_REFERENCES' : 'NO_EXACT_INVOICE_REFERENCE';
    else if (linkedAttempts.length > 1) reasonCode = 'MULTIPLE_LOCAL_ATTEMPT_LINKS';
    else if (order.noteAttemptId && (linkedAttempts.length !== 1 || linkedAttempts[0].id !== order.noteAttemptId)) reasonCode = 'REPORT_ATTEMPT_REFERENCE_MISMATCH';
    else if (linkedAttempts.length === 1 && (linkedAttempts[0].invoiceId !== invoice.id || linkedAttempts[0].mode !== configuredMode)) reasonCode = 'LOCAL_ATTEMPT_BINDING_MISMATCH';
    else if (localLinks.length > 0) reasonCode = 'LOCAL_PAYMENT_BINDING_MISMATCH';
    else if ((order.noteInvoiceId && order.noteInvoiceId !== invoice.id) || (order.receipt && order.receipt !== invoice.invoiceNumber)) reasonCode = 'CONFLICTING_INVOICE_REFERENCES';
    else if (order.status !== 'paid' || order.amountPaidPaise !== order.amountPaise || order.amountDuePaise !== '0' || !Number.isInteger(order.attempts) || order.attempts < 1) reasonCode = 'ORDER_REPORT_NOT_FULLY_PAID';
    else if (BigInt(row.amountPaise) !== BigInt(order.amountPaise)) reasonCode = 'PAYMENT_ORDER_AMOUNT_MISMATCH';
    else if (row.currency !== order.currency || String(invoice.currency || '').toUpperCase() !== row.currency) reasonCode = 'REPORT_CURRENCY_MISMATCH';
    else if (!invoice || invoice.voidedAt || invoice.status === 'VOID') reasonCode = 'INVOICE_NOT_PAYABLE';
    else if (moneyToPaise(invoice.balanceDue) !== BigInt(row.amountPaise)) reasonCode = 'INVOICE_BALANCE_MISMATCH';
    else {
      classification = 'HISTORICAL_PAYMENT_REPORT_CANDIDATE';
      reasonCode = 'EXACT_REPORT_BINDING_REQUIRES_LIVE_PAYMENT_VERIFICATION';
    }
    return {
      providerPayment: { id: row.paymentId, orderId: row.orderId, status: row.status, amountPaise: row.amountPaise, currency: row.currency },
      providerOrder: order ? { id: order.orderId, status: order.status, amountPaise: order.amountPaise, amountPaidPaise: order.amountPaidPaise, amountDuePaise: order.amountDuePaise, attempts: order.attempts, currency: order.currency } : null,
      classification,
      reasonCode,
      ...(invoice ? { invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, balanceDuePaise: moneyToPaise(invoice.balanceDue)?.toString() ?? null } } : {}),
      ...(linkedAttempts.length === 1 ? { checkoutAttemptId: linkedAttempts[0].id } : {}),
    };
  });
  return {
    configuredMode,
    totalRows: preview.length,
    candidateRows: preview.filter((row) => row.classification === 'HISTORICAL_PAYMENT_REPORT_CANDIDATE').length,
    alreadyRecordedRows: preview.filter((row) => row.classification === 'ALREADY_RECORDED').length,
    reviewRows: preview.filter((row) => row.classification === 'UNMATCHED_REVIEW').length,
    preview: includeAllPreview ? preview : preview.slice(0, 100),
    truncated: preview.length > 100,
  };
};

const getHistoricalPaymentReportEvidence = async ({ paymentId, invoiceId, paymentsCsvText, ordersCsvText, keyId = process.env.RAZORPAY_KEY_ID, db = prisma }) => {
  const report = await previewRazorpayHistoricalPaymentReports({ paymentsCsvText, ordersCsvText, keyId, db, includeAllPreview: true });
  const candidate = report.preview.find((row) => row.providerPayment.id === paymentId
    && row.invoice?.id === invoiceId && row.classification === 'HISTORICAL_PAYMENT_REPORT_CANDIDATE');
  if (!candidate) throw reportError('RAZORPAY_REPORT_BINDING_NOT_EXACT', 'The Dashboard reports do not prove one exact captured Payment, paid Order, and current invoice-balance match. No CRM receipt was posted.');
  const payments = parseRazorpayPaymentsReportCsv(paymentsCsvText);
  const orders = parseRazorpayOrdersReportCsv(ordersCsvText);
  const payment = payments.find((row) => row.paymentId === paymentId);
  const order = orders.find((row) => row.orderId === payment?.orderId);
  if (!payment || !order) throw reportError('RAZORPAY_REPORT_BINDING_NOT_EXACT', 'Matching Dashboard report rows are required for this payment and Order.');
  return { payment, order, invoiceId, configuredMode: report.configuredMode };
};

module.exports = { getHistoricalPaymentReportEvidence, parseRazorpayOrdersReportCsv, parseRazorpayPaymentsReportCsv, previewRazorpayDashboardOrdersReport, previewRazorpayDashboardPaymentsReport, previewRazorpayHistoricalPaymentReports };
