const prisma = require('../config/database');
const { getRazorpay, settleCapturedPayment } = require('./razorpay-invoice-checkout.service');
const { importRazorpaySettlementRecon } = require('./razorpay-settlement-recon.service');
const { importRazorpaySettlementSummaries, validateWindow: validateSettlementSummaryWindow } = require('./razorpay-settlement-summary.service');
const { razorpayErrorSummary } = require('../utils/redact');

const PAGE_SIZE = 100;
const DEFAULT_OVERLAP_SECONDS = 10 * 60;
const FIRST_SCAN_LOOKBACK_SECONDS = 60 * 60;
const MAX_PAGES = 1000;
const PENDING_ATTEMPT_BATCH_SIZE = 50;
const PENDING_ATTEMPT_RECHECK_MINUTES = 30;
const PENDING_ATTEMPT_ERROR_RETRY_MINUTES = 5;
const SETTLEMENT_RECON_LOOKBACK_MONTHS_DEFAULT = 2;
const SETTLEMENT_SUMMARY_LOOKBACK_DAYS_DEFAULT = 30;
const getMode = () => String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
const runTypeForMode = (mode) => `RAZORPAY_PAYMENTS_${mode}`;
const settlementRunTypeForMode = (mode) => `RAZORPAY_SETTLEMENTS_${mode}`;
const settlementSummaryRunTypeForMode = (mode) => `RAZORPAY_SETTLEMENT_SUMMARIES_${mode}`;
const safeCode = (error) => String(razorpayErrorSummary(error).code || 'PROVIDER_ERROR').slice(0, 80);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const businessDateKey = require('../utils/business-time').businessDateKey;

const providerCall = async (fn) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = Number(error?.statusCode || error?.response?.status || error?.status);
      if (attempt === 2 || (status && status < 500 && status !== 429)) throw error;
      await delay(200 * (2 ** attempt));
    }
  }
  throw lastError;
};

const getInitialFrom = async (mode, nowSeconds) => {
  const oldestAttempt = await prisma.razorpayCheckoutAttempt.findFirst({
    where: { mode },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!oldestAttempt) return Math.max(0, nowSeconds - FIRST_SCAN_LOOKBACK_SECONDS);
  return Math.max(0, Math.floor(oldestAttempt.createdAt.getTime() / 1000) - DEFAULT_OVERLAP_SECONDS);
};

const getScanWindow = async ({ mode, nowSeconds, from, to, overlapSeconds }) => {
  if (Number.isInteger(from) || Number.isInteger(to)) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > nowSeconds + 60) {
      throw Object.assign(new Error('Invalid Razorpay reconciliation time window'), { code: 'INVALID_RECONCILIATION_WINDOW' });
    }
    return { from, to };
  }
  const runType = runTypeForMode(mode);
  const previous = await prisma.reconciliationRun.findFirst({
    where: { runType, status: 'PASSED' },
    orderBy: { startedAt: 'desc' },
    select: { summary: true },
  });
  const persistedTo = Number(previous?.summary?.windowTo);
  const start = Number.isInteger(persistedTo)
    ? Math.max(0, persistedTo - overlapSeconds)
    : await getInitialFrom(mode, nowSeconds);
  return { from: start, to: nowSeconds };
};

const enqueueRazorpayPaymentReconciliation = async (initiatedBy) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Razorpay credentials are not configured'), { code: 'RAZORPAY_NOT_CONFIGURED' });
  }
  const mode = getMode();
  return prisma.reconciliationRun.create({
    data: { runType: runTypeForMode(mode), status: 'QUEUED', initiatedBy },
  });
};

const enqueueRazorpaySettlementReconciliation = async ({ initiatedBy, year, month, day }) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Razorpay credentials are not configured'), { code: 'RAZORPAY_NOT_CONFIGURED' });
  }
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (!Number.isInteger(y) || y < 2000 || y > 9999 || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > maxDay) {
    throw Object.assign(new Error('A valid settlement-received date is required'), { code: 'INVALID_SETTLEMENT_RECON_DATE' });
  }
  const mode = getMode();
  return prisma.reconciliationRun.create({
    data: {
      runType: settlementRunTypeForMode(mode),
      status: 'QUEUED',
      initiatedBy,
      summary: { mode, year: y, month: m, day: d },
    },
  });
};

const enqueueRazorpaySettlementSummaryReconciliation = async ({ initiatedBy, from, to }) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Razorpay credentials are not configured'), { code: 'RAZORPAY_NOT_CONFIGURED' });
  }
  const start = Number(from);
  const end = Number(to);
  validateSettlementSummaryWindow(start, end);
  const mode = getMode();
  return prisma.reconciliationRun.create({
    data: {
      runType: settlementSummaryRunTypeForMode(mode),
      status: 'QUEUED',
      initiatedBy,
      summary: { mode, from: start, to: end },
    },
  });
};

const enqueueScheduledRazorpaySettlementReconciliation = async ({ now = new Date() } = {}) => {
  if (process.env.ENABLE_RAZORPAY_SETTLEMENT_RECONCILIATION !== 'true') return [];
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return [];
  const configuredLookback = Number(process.env.RAZORPAY_SETTLEMENT_RECON_LOOKBACK_MONTHS || SETTLEMENT_RECON_LOOKBACK_MONTHS_DEFAULT);
  if (!Number.isInteger(configuredLookback) || configuredLookback < 1 || configuredLookback > 3) {
    throw Object.assign(new Error('Settlement reconciliation lookback must be between 1 and 3 months'), { code: 'INVALID_SETTLEMENT_RECON_LOOKBACK' });
  }
  const summaryLookbackDays = Number(process.env.RAZORPAY_SETTLEMENT_SUMMARY_LOOKBACK_DAYS || SETTLEMENT_SUMMARY_LOOKBACK_DAYS_DEFAULT);
  if (!Number.isInteger(summaryLookbackDays) || summaryLookbackDays < 7 || summaryLookbackDays > 90) {
    throw Object.assign(new Error('Settlement summary lookback must be between 7 and 90 days'), { code: 'INVALID_SETTLEMENT_SUMMARY_LOOKBACK' });
  }
  const mode = getMode();
  const dateKey = businessDateKey(now);
  if (!dateKey) throw Object.assign(new Error('Settlement reconciliation schedule time is invalid'), { code: 'INVALID_SETTLEMENT_RECON_DATE' });
  const [yearPart, monthPart] = dateKey.split('-').map(Number);
  const scheduledRuns = [];
  for (let offset = 0; offset < configuredLookback; offset += 1) {
    const monthDate = new Date(Date.UTC(yearPart, monthPart - 1 - offset, 1));
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth() + 1;
    const scheduleKey = `RAZORPAY_SETTLEMENTS:${mode}:${year}-${String(month).padStart(2, '0')}:${dateKey}`;
    const run = await prisma.reconciliationRun.create({
      data: {
        runType: settlementRunTypeForMode(mode),
        status: 'QUEUED',
        scheduleKey,
        summary: { mode, year, month, scheduled: true, businessDate: dateKey },
      },
    }).catch(async (error) => {
      if (error?.code === 'P2002') return prisma.reconciliationRun.findUnique({ where: { scheduleKey } });
      throw error;
    });
    if (run) scheduledRuns.push(run);
  }
  const to = Math.floor(now.getTime() / 1000);
  const from = to - summaryLookbackDays * 86400;
  const summaryScheduleKey = `RAZORPAY_SETTLEMENT_SUMMARIES:${mode}:${dateKey}`;
  const summaryRun = await prisma.reconciliationRun.create({
    data: {
      runType: settlementSummaryRunTypeForMode(mode),
      status: 'QUEUED',
      scheduleKey: summaryScheduleKey,
      summary: { mode, from, to, scheduled: true, businessDate: dateKey, lookbackDays: summaryLookbackDays },
    },
  }).catch(async (error) => {
    if (error?.code === 'P2002') return prisma.reconciliationRun.findUnique({ where: { scheduleKey: summaryScheduleKey } });
    throw error;
  });
  if (summaryRun) scheduledRuns.push(summaryRun);
  return scheduledRuns;
};

const claimQueuedRazorpayPaymentReconciliation = async () => {
  const claimed = await prisma.$transaction((tx) => tx.$queryRaw`
    WITH candidate AS (
      SELECT id
      FROM reconciliation_runs
      WHERE "runType" IN ('RAZORPAY_PAYMENTS_TEST', 'RAZORPAY_PAYMENTS_LIVE', 'RAZORPAY_SETTLEMENTS_TEST', 'RAZORPAY_SETTLEMENTS_LIVE', 'RAZORPAY_SETTLEMENT_SUMMARIES_TEST', 'RAZORPAY_SETTLEMENT_SUMMARIES_LIVE')
        AND (status = 'QUEUED' OR (status = 'RUNNING' AND "startedAt" < NOW() - INTERVAL '30 minutes'))
      ORDER BY CASE WHEN status = 'QUEUED' THEN 0 ELSE 1 END, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE reconciliation_runs AS runs
    SET status = 'RUNNING', "startedAt" = NOW(), "finishedAt" = NULL
    FROM candidate
    WHERE runs.id = candidate.id
    RETURNING runs.id, runs."runType"
  `);
  return claimed[0] || null;
};

const processQueuedRazorpayPaymentReconciliation = async ({ provider } = {}) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  const claimed = await claimQueuedRazorpayPaymentReconciliation();
  if (!claimed) return null;
  const mode = getMode();
  const isSettlementRun = claimed.runType.startsWith('RAZORPAY_SETTLEMENTS_');
  const isSettlementSummaryRun = claimed.runType.startsWith('RAZORPAY_SETTLEMENT_SUMMARIES_');
  const expectedRunType = isSettlementSummaryRun
    ? settlementSummaryRunTypeForMode(mode)
    : isSettlementRun ? settlementRunTypeForMode(mode) : runTypeForMode(mode);
  if (claimed.runType !== expectedRunType) {
    return prisma.reconciliationRun.update({
      where: { id: claimed.id },
      data: { status: 'ERROR', finishedAt: new Date(), summary: { errorCode: 'RAZORPAY_MODE_CHANGED_WHILE_QUEUED', queuedMode: claimed.runType, workerMode: mode } },
    });
  }
  if (isSettlementRun) {
    const run = await prisma.reconciliationRun.findUnique({ where: { id: claimed.id } });
    const requested = run?.summary || {};
    try {
      const summary = await importRazorpaySettlementRecon({
        year: requested.year,
        month: requested.month,
        day: requested.day,
        mode,
        provider,
      });
      return prisma.reconciliationRun.update({
        where: { id: claimed.id },
        data: { status: 'PASSED', finishedAt: new Date(), summary: { ...summary, request: requested } },
      });
    } catch (error) {
      return prisma.reconciliationRun.update({
        where: { id: claimed.id },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          summary: { ...requested, errorCode: safeCode(error) },
          exceptions: { items: [{ code: safeCode(error) }], truncated: false },
        },
      });
    }
  }
  if (isSettlementSummaryRun) {
    const run = await prisma.reconciliationRun.findUnique({ where: { id: claimed.id } });
    const requested = run?.summary || {};
    try {
      const summary = await importRazorpaySettlementSummaries({ from: requested.from, to: requested.to, mode, provider });
      return prisma.reconciliationRun.update({
        where: { id: claimed.id },
        data: { status: 'PASSED', finishedAt: new Date(), summary: { ...summary, request: requested } },
      });
    } catch (error) {
      return prisma.reconciliationRun.update({
        where: { id: claimed.id },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          summary: { ...requested, errorCode: safeCode(error) },
          exceptions: { items: [{ code: safeCode(error) }], truncated: false },
        },
      });
    }
  }
  return runRazorpayPaymentReconciliation({ runId: claimed.id, provider });
};

const reconcilePagePayment = async (payment, { mode, provider, counters, exceptions, attemptsByOrderId }) => {
  const paymentId = String(payment?.id || '');
  const orderId = String(payment?.order_id || '');
  if (!paymentId || !orderId) {
    counters.outOfScope += 1;
    return;
  }

  const attempt = attemptsByOrderId.get(orderId);
  if (!attempt) {
    counters.outOfScope += 1;
    return;
  }
  if (attempt.mode !== mode) {
    counters.reviewRequired += 1;
    if (exceptions.length < 250) exceptions.push({ code: 'RAZORPAY_MODE_MISMATCH', attemptId: attempt.id, paymentId, orderId });
    return;
  }
  if (Number(payment.amount) !== Number(attempt.amountPaise) || String(payment.currency || '').toUpperCase() !== String(attempt.currency).toUpperCase()) {
    counters.reviewRequired += 1;
    if (exceptions.length < 250) exceptions.push({ code: 'PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH', attemptId: attempt.id, paymentId, orderId });
    return;
  }

  const status = String(payment.status || '').toLowerCase();
  const captured = payment.captured === true || status === 'captured';
  if (!captured) {
    if (status === 'authorized') counters.authorized += 1;
    else if (status === 'failed') counters.failed += 1;
    else counters.nonCaptured += 1;
    return;
  }

  const webhook = await prisma.razorpayWebhookEvent.findFirst({
    where: {
      OR: [
        { paymentId, event: { in: ['payment.captured', 'order.paid'] } },
        { orderId, event: 'order.paid' },
      ],
    },
    select: { id: true, status: true },
  });
  const wasAlreadyCaptured = attempt.status === 'CAPTURED';
  try {
    const result = await settleCapturedPayment({
      paymentId,
      providerOrderId: orderId,
      source: 'PROVIDER_RECONCILIATION',
      provider,
    });
    if (result.pending) {
      counters.providerStatePending += 1;
      if (exceptions.length < 250) exceptions.push({ code: 'CAPTURE_NOT_CONFIRMED_BY_FETCH', attemptId: attempt.id, paymentId, orderId });
    } else if (wasAlreadyCaptured || result.alreadyRecorded) {
      counters.alreadySettled += 1;
    } else {
      counters.recoveredCaptures += 1;
    }
    if (!webhook || webhook.status !== 'PROCESSED') counters.captureWebhookNotProcessed += 1;
  } catch (error) {
    counters.reviewRequired += 1;
    if (exceptions.length < 250) exceptions.push({ code: safeCode(error), attemptId: attempt.id, paymentId, orderId });
  }
};

const claimDueCheckoutAttempts = async (mode, now) => prisma.$transaction((tx) => tx.$queryRaw`
  WITH due AS (
    SELECT id
    FROM razorpay_checkout_attempts
    WHERE mode = ${mode}
      AND status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'FAILED')
      AND "razorpayOrderId" IS NOT NULL
      AND ("nextProviderCheckAt" IS NULL OR "nextProviderCheckAt" <= ${now})
    ORDER BY "nextProviderCheckAt" ASC NULLS FIRST, "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT ${PENDING_ATTEMPT_BATCH_SIZE}
  )
  UPDATE razorpay_checkout_attempts AS attempts
  SET "nextProviderCheckAt" = ${new Date(now.getTime() + PENDING_ATTEMPT_RECHECK_MINUTES * 60_000)}
  FROM due
  WHERE attempts.id = due.id
  RETURNING attempts.id, attempts."razorpayOrderId", attempts."amountPaise", attempts.currency,
    attempts.mode, attempts.status, attempts."invoiceId", attempts."invoiceNumber",
    attempts."orderId", attempts."customerId", attempts."publicShareId"
`);

const reconcilePendingCheckoutAttempts = async ({ mode, provider, counters, exceptions, now }) => {
  if (typeof provider?.orders?.fetchPayments !== 'function') {
    const dueCount = await prisma.razorpayCheckoutAttempt.count({
      where: {
        mode,
        status: { in: ['CREATED', 'PENDING', 'AUTHORIZED', 'FAILED'] },
        razorpayOrderId: { not: null },
        OR: [{ nextProviderCheckAt: null }, { nextProviderCheckAt: { lte: now } }],
      },
    });
    if (dueCount) throw Object.assign(new Error('Razorpay Orders payment-list operation is unavailable'), { code: 'ORDER_PAYMENTS_FETCH_UNAVAILABLE' });
    return;
  }

  const attempts = await claimDueCheckoutAttempts(mode, now);
  counters.pendingAttemptsClaimed = attempts.length;
  counters.pendingAttemptBatchTruncated = attempts.length === PENDING_ATTEMPT_BATCH_SIZE;
  const attemptsByOrderId = new Map(attempts.map((attempt) => [attempt.razorpayOrderId, attempt]));
  for (const attempt of attempts) {
    try {
      const response = await providerCall(() => provider.orders.fetchPayments(attempt.razorpayOrderId));
      const items = Array.isArray(response?.items) ? response.items : null;
      if (!items) throw Object.assign(new Error('Razorpay order payment-list response has no items collection'), { code: 'INVALID_ORDER_PAYMENTS_RESPONSE' });
      counters.pendingAttemptsChecked += 1;
      for (const payment of items) {
        if (String(payment?.status || '').toLowerCase() === 'captured' || payment?.captured === true) {
          counters.pendingAttemptCaptures += 1;
          await reconcilePagePayment(payment, { mode, provider, counters, exceptions, attemptsByOrderId });
        }
      }
    } catch (error) {
      counters.pendingAttemptErrors += 1;
      if (exceptions.length < 250) exceptions.push({ code: safeCode(error), attemptId: attempt.id, orderId: attempt.razorpayOrderId });
      await prisma.razorpayCheckoutAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['CREATED', 'PENDING', 'AUTHORIZED', 'FAILED'] } },
        data: { nextProviderCheckAt: new Date(now.getTime() + PENDING_ATTEMPT_ERROR_RETRY_MINUTES * 60_000) },
      });
    }
  }
  if (counters.pendingAttemptBatchTruncated) {
    counters.pendingAttemptsStillDue = await prisma.razorpayCheckoutAttempt.count({
      where: {
        mode,
        status: { in: ['CREATED', 'PENDING', 'AUTHORIZED', 'FAILED'] },
        razorpayOrderId: { not: null },
        OR: [{ nextProviderCheckAt: null }, { nextProviderCheckAt: { lte: now } }],
      },
    });
  }
};

const runRazorpayPaymentReconciliation = async ({
  initiatedBy = null,
  provider: injectedProvider,
  from,
  to,
  overlapSeconds = DEFAULT_OVERLAP_SECONDS,
  scheduleKey = null,
  runId = null,
  now = new Date(),
} = {}) => {
  const mode = getMode();
  const runType = runTypeForMode(mode);
  let run;
  if (runId) {
    run = await prisma.reconciliationRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'RUNNING' || run.runType !== runType) return run;
  } else {
    run = await prisma.reconciliationRun.create({
      data: { runType, status: 'RUNNING', initiatedBy, scheduleKey },
    }).catch(async (error) => {
      if (error?.code === 'P2002' && scheduleKey) return null;
      throw error;
    });
    if (!run) return prisma.reconciliationRun.findUnique({ where: { scheduleKey } });
  }

  const counters = {
    pages: 0,
    scanned: 0,
    outOfScope: 0,
    authorized: 0,
    failed: 0,
    nonCaptured: 0,
    recoveredCaptures: 0,
    alreadySettled: 0,
    captureWebhookNotProcessed: 0,
    providerStatePending: 0,
    reviewRequired: 0,
    pendingAttemptsClaimed: 0,
    pendingAttemptsChecked: 0,
    pendingAttemptCaptures: 0,
    pendingAttemptErrors: 0,
    pendingAttemptBatchTruncated: false,
    pendingAttemptsStillDue: 0,
  };
  const exceptions = [];
  try {
    const window = await getScanWindow({
      mode,
      nowSeconds: Math.floor(now.getTime() / 1000),
      from,
      to,
      overlapSeconds,
    });
    const provider = injectedProvider || getRazorpay();
    const attempts = await prisma.razorpayCheckoutAttempt.findMany({
      where: { mode, razorpayOrderId: { not: null }, createdAt: { lte: new Date(window.to * 1000) } },
      select: { id: true, invoiceId: true, invoiceNumber: true, orderId: true, customerId: true, publicShareId: true, amountPaise: true, currency: true, mode: true, status: true, razorpayOrderId: true },
    });
    const attemptsByOrderId = new Map(attempts.map((attempt) => [attempt.razorpayOrderId, attempt]));
    let skip = 0;
    let paginationComplete = false;
    while (counters.pages < MAX_PAGES) {
      const response = await providerCall(() => provider.payments.all({
        from: window.from,
        to: window.to,
        count: PAGE_SIZE,
        skip,
      }));
      const items = Array.isArray(response?.items) ? response.items : null;
      if (!items) throw Object.assign(new Error('Razorpay payment list response has no items collection'), { code: 'INVALID_PROVIDER_RESPONSE' });
      counters.pages += 1;
      counters.scanned += items.length;
      for (const payment of items) await reconcilePagePayment(payment, { mode, provider, counters, exceptions, attemptsByOrderId });
      if (items.length < PAGE_SIZE) {
        paginationComplete = true;
        break;
      }
      skip += items.length;
    }
    if (!paginationComplete) throw Object.assign(new Error('Razorpay payment reconciliation reached its page safety limit'), { code: 'RECONCILIATION_PAGE_LIMIT' });
    await reconcilePendingCheckoutAttempts({ mode, provider, counters, exceptions, now });
    const summary = { mode, ...counters, windowFrom: window.from, windowTo: window.to, paginationComplete };
    return prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: counters.reviewRequired || counters.providerStatePending || counters.pendingAttemptErrors ? 'FAILED' : 'PASSED',
        finishedAt: new Date(),
        summary,
        exceptions: { items: exceptions, truncated: counters.reviewRequired + counters.pendingAttemptErrors > exceptions.length },
      },
    });
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'ERROR',
        finishedAt: new Date(),
        summary: { mode, ...counters, errorCode: safeCode(error) },
        exceptions: { items: exceptions, truncated: false },
      },
    }).catch(() => {});
    throw error;
  }
};

const runScheduledRazorpayPaymentReconciliation = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return Promise.resolve(null);
  const now = new Date();
  const hourBucket = new Date(now);
  hourBucket.setUTCMinutes(0, 0, 0);
  const scheduleKey = `RAZORPAY_PAYMENTS:${getMode()}:${hourBucket.toISOString()}`;
  return runRazorpayPaymentReconciliation({ scheduleKey, now });
};

module.exports = {
  enqueueRazorpayPaymentReconciliation,
  enqueueRazorpaySettlementReconciliation,
  enqueueRazorpaySettlementSummaryReconciliation,
  enqueueScheduledRazorpaySettlementReconciliation,
  processQueuedRazorpayPaymentReconciliation,
  runRazorpayPaymentReconciliation,
  runScheduledRazorpayPaymentReconciliation,
};
