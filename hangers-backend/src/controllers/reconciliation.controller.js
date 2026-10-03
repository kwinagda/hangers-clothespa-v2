const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const { runFinancialReconciliation } = require('../services/reconciliation.service');
const { enqueueRazorpayPaymentReconciliation, enqueueRazorpaySettlementReconciliation, enqueueRazorpaySettlementSummaryReconciliation } = require('../services/razorpay-payment-reconciliation.service');
const { getBankStatementImport, importBankStatementCsv, listBankStatementImports, previewBankStatementCsv } = require('../services/bank-statement-import.service');
const { confirmBankSettlementMatch, getBankSettlementCandidates, reverseBankSettlementMatch } = require('../services/bank-settlement-match.service');
const { getRazorpaySettlementSummaryReport } = require('../services/razorpay-settlement-summary-report.service');
const { previewRazorpayOrderInventory } = require('../services/razorpay-order-inventory.service');
const { previewRazorpayDashboardPaymentsReport: buildRazorpayDashboardPaymentsReportPreview } = require('../services/razorpay-dashboard-report-import.service');
const { previewRazorpayDashboardOrdersReport: buildRazorpayDashboardOrdersReportPreview } = require('../services/razorpay-dashboard-report-import.service');
const { previewRazorpayHistoricalPaymentReports: buildRazorpayHistoricalPaymentReportsPreview } = require('../services/razorpay-dashboard-report-import.service');
const { backfillCapturedRazorpayPayment } = require('../services/razorpay-historical-payment-backfill.service');
const { backfillUnusedRazorpayOrder } = require('../services/razorpay-historical-order-backfill.service');
const { log, getRequestMeta } = require('../services/activity.service');
const { paymentApiError } = require('../utils/payment-api-error');

const listRuns = async (_req, res) => {
  try {
    const runs = await prisma.reconciliationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 });
    return success(res, { runs, latest: runs[0] || null });
  } catch {
    return error(res, 'Failed to load reconciliation history');
  }
};

const runNow = async (req, res) => {
  try {
    const run = await runFinancialReconciliation({ initiatedBy: req.staff?.id });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'FINANCIAL_RECONCILIATION_RUN', resource: 'reconciliation', resourceId: run.id,
      description: `Financial reconciliation completed with status ${run.status}`,
      metadata: { status: run.status, summary: run.summary },
      ...getRequestMeta(req),
    });
    return success(res, { run }, `Reconciliation ${run.status.toLowerCase()}`);
  } catch (err) {
    console.error('run reconciliation:', err?.message || err);
    return error(res, 'Financial reconciliation failed to execute');
  }
};

const runRazorpayPaymentsNow = async (req, res) => {
  try {
    const run = await enqueueRazorpayPaymentReconciliation(req.staff?.id);
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_PAYMENT_RECONCILIATION_RUN', resource: 'reconciliation', resourceId: run.id,
      description: 'Razorpay provider payment reconciliation queued',
      metadata: { status: run.status, runType: run.runType },
      ...getRequestMeta(req),
    });
    return success(res, { run }, 'Razorpay reconciliation queued', 202);
  } catch (err) {
    console.error('Razorpay payment reconciliation:', err?.code || err?.message || '[no error code or message]');
    return error(res, 'Razorpay payment reconciliation failed to execute');
  }
};

const previewRazorpayOrders = async (req, res) => {
  try {
    const preview = await previewRazorpayOrderInventory({ from: req.query.from, to: req.query.to });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_ORDER_INVENTORY_PREVIEW', resource: 'razorpay_order_inventory',
      description: 'Razorpay historical Order and Payment inventory preview completed without changing CRM payment records',
      metadata: {
        mode: preview.mode, window: preview.window, pages: preview.pages, scanned: preview.scanned,
        counts: preview.counts, reviewItemsTruncated: preview.reviewItemsTruncated,
        linkedOrderLookups: preview.linkedOrderLookups,
        paymentInventory: {
          pages: preview.paymentInventory.pages, scanned: preview.paymentInventory.scanned,
          counts: preview.paymentInventory.counts, reviewItemsTruncated: preview.paymentInventory.reviewItemsTruncated,
        },
      },
      ...getRequestMeta(req),
    });
    return success(res, { preview }, 'Razorpay Order inventory preview completed');
  } catch (err) {
    const statusCode = ['INVALID_ORDER_INVENTORY_WINDOW', 'ORDER_INVENTORY_RETENTION_WINDOW'].includes(err?.code) ? 400
      : err?.code === 'RAZORPAY_MODE_UNAVAILABLE' ? 503
      : err?.code === 'RAZORPAY_NOT_CONFIGURED' ? 503
        : ['ORDER_INVENTORY_PROVIDER_FAILED', 'PAYMENT_INVENTORY_PROVIDER_FAILED'].includes(err?.code) ? 502
          : ['ORDER_INVENTORY_UNAVAILABLE', 'PAYMENT_INVENTORY_UNAVAILABLE'].includes(err?.code) ? 503 : 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_ORDER_PAYMENT_INVENTORY_PREVIEW_FAILED', resource: 'razorpay_order_inventory',
      description: 'Razorpay historical Order inventory preview did not complete',
      metadata: { errorCode: err?.code || 'ORDER_INVENTORY_FAILED', providerCode: err?.providerCode || null },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'ORDER_PAYMENT_INVENTORY_FAILED',
      message: err?.code === 'ORDER_INVENTORY_RETENTION_WINDOW' ? 'Orders older than 180 days are not available through direct Order fetch. Use Razorpay Dashboard Reports.'
        : err?.code === 'RAZORPAY_MODE_UNAVAILABLE' ? 'Razorpay mode cannot be verified from the configured API key. No CRM payment records were changed.'
        : statusCode === 400 ? 'Choose a valid date window of 31 days or less.'
        : statusCode === 502 ? 'Razorpay Orders or Payments could not be loaded. No CRM payment records were changed.'
          : 'Razorpay Order and Payment inventory preview could not be completed. No CRM payment records were changed.',
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const previewRazorpayDashboardPaymentsReport = async (req, res) => {
  try {
    const report = await buildRazorpayDashboardPaymentsReportPreview({ csvText: req.body?.csvText });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_DASHBOARD_PAYMENTS_REPORT_PREVIEW', resource: 'razorpay_dashboard_report',
      description: 'Finance previewed a Razorpay Dashboard Payments CSV without changing CRM payment records',
      metadata: { reportType: 'PAYMENTS', configuredMode: report.configuredMode, totalRows: report.totalRows, capturedRows: report.capturedRows, otherStatusRows: report.otherStatusRows, exactCandidateRows: report.exactCandidateRows, previewTruncated: report.truncated },
      ...getRequestMeta(req),
    });
    return success(res, { report }, 'Razorpay Payments report preview completed');
  } catch (err) {
    const statusCode = String(err?.code || '').startsWith('RAZORPAY_REPORT_') ? 400
      : ['RAZORPAY_MODE_UNAVAILABLE', 'RAZORPAY_NOT_CONFIGURED'].includes(err?.code) ? 503 : 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_DASHBOARD_PAYMENTS_REPORT_PREVIEW_FAILED', resource: 'razorpay_dashboard_report',
      description: 'Finance Razorpay Dashboard Payments report preview did not complete',
      metadata: { reportType: 'PAYMENTS', errorCode: err?.code || 'RAZORPAY_REPORT_PREVIEW_FAILED' },
      ...getRequestMeta(req), status: 'FAILED',
    });
    const messages = {
      RAZORPAY_REPORT_EMPTY: 'Select a non-empty Razorpay Payments CSV report.',
      RAZORPAY_REPORT_TOO_LARGE: 'Razorpay CSV reports must be smaller than 450 KB.',
      RAZORPAY_REPORT_COLUMNS_UNSUPPORTED: 'This is not a recognized Razorpay Payments report schema.',
      RAZORPAY_REPORT_COLUMNS_MISSING: 'The Razorpay Payments report is missing required columns.',
      RAZORPAY_MODE_UNAVAILABLE: 'Razorpay mode cannot be verified from the configured API key. No CRM payment records were changed.',
    };
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'RAZORPAY_REPORT_PREVIEW_FAILED',
      message: messages[err?.code] || (statusCode === 400 ? err.message : 'Razorpay Payments report preview failed.'),
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const previewRazorpayDashboardOrdersReport = async (req, res) => {
  try {
    const report = await buildRazorpayDashboardOrdersReportPreview({ csvText: req.body?.csvText });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_DASHBOARD_ORDERS_REPORT_PREVIEW', resource: 'razorpay_dashboard_report',
      description: 'Finance previewed a Razorpay Dashboard Orders CSV without changing CRM payment records',
      metadata: { reportType: 'ORDERS', configuredMode: report.configuredMode, totalRows: report.totalRows, paidOrders: report.paidOrders, unpaidOrders: report.unpaidOrders, exactAttemptCandidates: report.exactAttemptCandidates, invoiceReferenceCandidates: report.invoiceReferenceCandidates, previewTruncated: report.truncated },
      ...getRequestMeta(req),
    });
    return success(res, { report }, 'Razorpay Orders report preview completed');
  } catch (err) {
    const statusCode = String(err?.code || '').startsWith('RAZORPAY_REPORT_') ? 400
      : ['RAZORPAY_MODE_UNAVAILABLE', 'RAZORPAY_NOT_CONFIGURED'].includes(err?.code) ? 503 : 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_DASHBOARD_ORDERS_REPORT_PREVIEW_FAILED', resource: 'razorpay_dashboard_report',
      description: 'Finance Razorpay Dashboard Orders report preview did not complete',
      metadata: { reportType: 'ORDERS', errorCode: err?.code || 'RAZORPAY_REPORT_PREVIEW_FAILED' },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'RAZORPAY_REPORT_PREVIEW_FAILED',
      message: statusCode === 400 ? err.message : 'Razorpay Orders report preview failed. No CRM payment records were changed.',
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const previewRazorpayHistoricalPaymentReports = async (req, res) => {
  try {
    const report = await buildRazorpayHistoricalPaymentReportsPreview({
      paymentsCsvText: req.body?.paymentsCsvText,
      ordersCsvText: req.body?.ordersCsvText,
    });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_REPORT_PAIR_PREVIEW', resource: 'razorpay_dashboard_report',
      description: 'Finance previewed paired Razorpay Payments and Orders reports for historical invoice reconciliation',
      metadata: { mode: report.configuredMode, totalRows: report.totalRows, candidateRows: report.candidateRows, alreadyRecordedRows: report.alreadyRecordedRows, reviewRows: report.reviewRows, previewTruncated: report.truncated },
      ...getRequestMeta(req),
    });
    return success(res, { report }, 'Paired Razorpay Dashboard report preview completed');
  } catch (err) {
    const statusCode = String(err?.code || '').startsWith('RAZORPAY_REPORT_') ? 400
      : ['RAZORPAY_MODE_UNAVAILABLE', 'RAZORPAY_NOT_CONFIGURED'].includes(err?.code) ? 503 : 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_REPORT_PAIR_PREVIEW_FAILED', resource: 'razorpay_dashboard_report',
      description: 'Finance paired Razorpay Dashboard report preview did not complete',
      metadata: { errorCode: err?.code || 'RAZORPAY_REPORT_PAIR_PREVIEW_FAILED' },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'RAZORPAY_REPORT_PAIR_PREVIEW_FAILED',
      message: statusCode === 400 ? err.message : 'Paired Razorpay Dashboard report preview failed. No CRM payment records were changed.',
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const backfillHistoricalRazorpayPayment = async (req, res) => {
  try {
    const result = await backfillCapturedRazorpayPayment({
      paymentId: req.params.paymentId,
      invoiceId: req.body?.invoiceId,
      expectedMode: req.body?.mode,
      idempotencyKey: req.idempotencyKey,
      actor: req.staff,
      paymentsCsvText: req.body?.paymentsCsvText,
      ordersCsvText: req.body?.ordersCsvText,
    });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_PAYMENT_BACKFILL', resource: 'payment', resourceId: result.razorpayPaymentId,
      description: result.alreadyRecorded ? 'Finance verified an already-posted Razorpay historical payment' : 'Finance verified and posted a captured historical Razorpay payment through canonical invoice settlement',
      metadata: {
        mode: String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE',
        invoiceId: result.invoiceId, razorpayOrderId: result.razorpayOrderId, attemptId: result.attemptId,
        crmPaymentId: result.crmPaymentId, alreadyRecorded: result.alreadyRecorded, status: result.status,
        verificationSource: result.verificationSource || 'LIVE_ORDER_API',
      },
      ...getRequestMeta(req),
    });
    return success(res, { backfill: result }, result.alreadyRecorded ? 'Razorpay payment is already recorded in this invoice' : 'Captured Razorpay payment recorded in CRM');
  } catch (err) {
    const statusCode = Number(err?.statusCode) || 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_PAYMENT_BACKFILL_FAILED', resource: 'payment', resourceId: req.params.paymentId,
      description: 'Finance historical Razorpay payment verification or settlement did not complete',
      metadata: { errorCode: err?.code || 'HISTORICAL_PAYMENT_BACKFILL_FAILED', providerCode: err?.details?.providerCode || null },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'HISTORICAL_PAYMENT_BACKFILL_FAILED',
      message: err?.message || 'Historical Razorpay payment could not be reconciled. No unverified receipt was posted.',
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const backfillHistoricalRazorpayOrder = async (req, res) => {
  try {
    const result = await backfillUnusedRazorpayOrder({
      orderId: req.params.orderId,
      invoiceId: req.body?.invoiceId,
      expectedMode: req.body?.mode,
      idempotencyKey: req.idempotencyKey,
      actor: req.staff,
    });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_ORDER_BACKFILL', resource: 'razorpay_checkout_attempt', resourceId: result.attemptId,
      description: 'Finance verified and bound an unused Razorpay Order to an exact unpaid CRM invoice',
      metadata: { mode: result.mode, invoiceId: result.invoiceId, razorpayOrderId: result.razorpayOrderId, attemptId: result.attemptId, status: result.status },
      ...getRequestMeta(req),
    });
    return success(res, { backfill: result }, 'Unused Razorpay Order linked to the unpaid invoice');
  } catch (err) {
    const statusCode = Number(err?.statusCode) || 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_HISTORICAL_ORDER_BACKFILL_FAILED', resource: 'razorpay_order', resourceId: req.params.orderId,
      description: 'Finance historical Razorpay Order verification or binding did not complete',
      metadata: { errorCode: err?.code || 'HISTORICAL_ORDER_BACKFILL_FAILED', providerCode: err?.details?.providerCode || null },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return paymentApiError(res, {
      statusCode,
      code: err?.code || 'HISTORICAL_ORDER_BACKFILL_FAILED',
      message: err?.message || 'Historical Razorpay Order could not be verified and linked. No unverified Order was made payable.',
      requestId: req.id,
      retryable: statusCode >= 500,
    });
  }
};

const runRazorpaySettlementsNow = async (req, res) => {
  try {
    const run = await enqueueRazorpaySettlementReconciliation({
      initiatedBy: req.staff?.id,
      year: req.body?.year,
      month: req.body?.month,
      day: req.body?.day,
    });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_SETTLEMENT_RECONCILIATION_QUEUED', resource: 'reconciliation', resourceId: run.id,
      description: 'Razorpay settlement reconciliation queued',
      metadata: { status: run.status, runType: run.runType, year: req.body.year, month: req.body.month, day: req.body.day },
      ...getRequestMeta(req),
    });
    return success(res, { run }, 'Razorpay settlement reconciliation queued', 202);
  } catch (err) {
    const statusCode = err?.code === 'INVALID_SETTLEMENT_RECON_DATE' ? 400 : err?.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 500;
    return res.status(statusCode).json({ success: false, code: err?.code || 'SETTLEMENT_RECON_QUEUE_FAILED', message: statusCode === 400 ? 'Enter a valid settlement-received date.' : 'Razorpay settlement reconciliation could not be queued.' });
  }
};

const runRazorpaySettlementSummariesNow = async (req, res) => {
  try {
    const run = await enqueueRazorpaySettlementSummaryReconciliation({
      initiatedBy: req.staff?.id,
      from: req.body?.from,
      to: req.body?.to,
    });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'RAZORPAY_SETTLEMENT_SUMMARY_RECONCILIATION_QUEUED', resource: 'reconciliation', resourceId: run.id,
      description: 'Razorpay settlement summary reconciliation queued',
      metadata: { status: run.status, runType: run.runType, from: req.body.from, to: req.body.to },
      ...getRequestMeta(req),
    });
    return success(res, { run }, 'Razorpay settlement summary reconciliation queued', 202);
  } catch (err) {
    const statusCode = err?.code === 'INVALID_SETTLEMENT_SUMMARY_WINDOW' ? 400 : err?.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 500;
    return res.status(statusCode).json({ success: false, code: err?.code || 'SETTLEMENT_SUMMARY_QUEUE_FAILED', message: statusCode === 400 ? 'Choose a valid settlement date range.' : 'Settlement summary sync could not be queued.' });
  }
};

const listRazorpaySettlementSummaries = async (req, res) => {
  const take = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const mode = ['TEST', 'LIVE'].includes(String(req.query.mode || '').toUpperCase()) ? String(req.query.mode).toUpperCase() : undefined;
  try {
    const summaries = await prisma.razorpaySettlementSummary.findMany({
      where: { ...(mode ? { mode } : {}) },
      orderBy: [{ providerCreatedAt: 'desc' }, { lastSyncedAt: 'desc' }],
      take,
    });
    return success(res, { settlements: summaries.map((item) => ({
      ...item,
      amountPaise: item.amountPaise.toString(),
      feesPaise: item.feesPaise.toString(),
      taxPaise: item.taxPaise.toString(),
    })) });
  } catch {
    return res.status(500).json({ success: false, code: 'SETTLEMENT_SUMMARY_READ_FAILED', message: 'Razorpay settlement summaries could not be loaded.' });
  }
};

const getRazorpaySettlementSummaryReportController = async (req, res) => {
  try {
    const report = await getRazorpaySettlementSummaryReport({
      from: req.query.from,
      to: req.query.to,
      mode: String(req.query.mode || '').toUpperCase(),
    });
    return success(res, { report });
  } catch (err) {
    const statusCode = err?.code === 'INVALID_SETTLEMENT_REPORT_WINDOW' || err?.code === 'INVALID_SETTLEMENT_REPORT_MODE' ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      code: err?.code || 'SETTLEMENT_SUMMARY_REPORT_FAILED',
      message: statusCode === 400 ? err.message : 'Settlement summary report could not be loaded.',
    });
  }
};

const listRazorpaySettlementLines = async (req, res) => {
  const take = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const mode = ['TEST', 'LIVE'].includes(String(req.query.mode || '').toUpperCase()) ? String(req.query.mode).toUpperCase() : undefined;
  const settlementId = typeof req.query.settlementId === 'string' ? req.query.settlementId.slice(0, 128) : undefined;
  try {
    const lines = await prisma.razorpaySettlementReconLine.findMany({
      where: { ...(mode ? { mode } : {}), ...(settlementId ? { providerSettlementId: settlementId } : {}) },
      orderBy: [{ providerSettledAt: 'desc' }, { lastSyncedAt: 'desc' }],
      take,
    });
    const paymentIds = [...new Set(lines.filter((line) => line.entityType === 'payment').map((line) => line.providerPaymentId).filter(Boolean))];
    const refundIds = [...new Set(lines.filter((line) => line.entityType === 'refund').map((line) => line.providerEntityId).filter(Boolean))];
    const [payments, refundAttempts] = await Promise.all([
      paymentIds.length ? prisma.payment.findMany({ where: { razorpayPaymentId: { in: paymentIds } }, select: { id: true, razorpayPaymentId: true, razorpayOrderId: true, amount: true, mode: true, method: true } }) : [],
      refundIds.length ? prisma.razorpayRefundAttempt.findMany({
        where: { razorpayRefundId: { in: refundIds } },
        select: { id: true, razorpayRefundId: true, amountPaise: true, currency: true, mode: true, status: true, localRefundPaymentId: true, localRefundPayment: { select: { id: true, amount: true, mode: true, razorpayRefundId: true } }, sourcePayment: { select: { razorpayPaymentId: true } } },
      }) : [],
    ]);
    const paymentsByProviderId = new Map();
    for (const payment of payments) paymentsByProviderId.set(payment.razorpayPaymentId, [...(paymentsByProviderId.get(payment.razorpayPaymentId) || []), payment]);
    const refundsByProviderId = new Map(refundAttempts.map((attempt) => [attempt.razorpayRefundId, attempt]));
    const toPaise = (value) => BigInt(String(typeof value?.toFixed === 'function' ? value.toFixed(2) : Number(value).toFixed(2)).replace('.', ''));
    const serializedLines = lines.map((line) => {
      let matchStatus = 'NOT_APPLICABLE';
      let matchDetail = null;
      let localPaymentId = null;
      let localRefundAttemptId = null;
      if (line.entityType === 'payment') {
      const matches = paymentsByProviderId.get(line.providerPaymentId) || [];
        const modeMatches = matches.filter((payment) => payment.mode === line.mode);
        matchStatus = !modeMatches.length
          ? matches.length === 1 && !matches[0].mode ? 'MODE_UNVERIFIED' : matches.length ? 'MODE_MISMATCH' : 'UNMATCHED'
          : modeMatches.length > 1 ? 'DUPLICATE' : 'MATCHED';
        if (matchStatus === 'UNMATCHED') matchDetail = 'No CRM receipt references this Razorpay payment.';
        else if (matchStatus === 'MODE_UNVERIFIED') matchDetail = 'A CRM payment exists, but its historical Test/Live mode was not recorded.';
        else if (matchStatus === 'MODE_MISMATCH') matchDetail = 'A CRM payment exists only in a different Razorpay mode.';
        else if (matchStatus === 'DUPLICATE') matchDetail = 'Multiple CRM receipts reference this Razorpay payment in the same mode.';
        if (modeMatches.length === 1) {
          const payment = modeMatches[0];
          localPaymentId = payment.id;
          if (line.currency !== 'INR') {
            matchStatus = 'CURRENCY_MISMATCH';
            matchDetail = `Provider currency ${line.currency} is not supported by the INR CRM ledger.`;
          } else if (toPaise(payment.amount) !== line.amountPaise) {
            matchStatus = 'AMOUNT_MISMATCH';
            matchDetail = `Provider amount ${line.amountPaise} paise differs from CRM receipt amount ${toPaise(payment.amount)} paise.`;
          } else if (line.providerOrderId && payment.razorpayOrderId && line.providerOrderId !== payment.razorpayOrderId) {
            matchStatus = 'ORDER_MISMATCH';
            matchDetail = 'The Razorpay order reference differs from the CRM receipt reference.';
          }
        }
      } else if (line.entityType === 'refund') {
        const attempt = refundsByProviderId.get(line.providerEntityId);
        matchStatus = !attempt ? 'UNMATCHED' : 'MATCHED';
        if (!attempt) matchDetail = 'No CRM refund attempt references this Razorpay refund.';
        if (attempt) {
          localRefundAttemptId = attempt.id;
          localPaymentId = attempt.localRefundPaymentId;
          if (attempt.mode !== line.mode) {
            matchStatus = 'MODE_MISMATCH';
            matchDetail = 'The CRM refund attempt was created in a different Razorpay mode.';
          } else if (attempt.status !== 'PROCESSED' || !attempt.localRefundPayment) {
            matchStatus = 'REFUND_NOT_POSTED';
            matchDetail = `CRM refund attempt is ${attempt.status.toLowerCase()} and has no posted refund ledger entry.`;
          } else if (attempt.currency !== line.currency || line.currency !== 'INR') {
            matchStatus = 'CURRENCY_MISMATCH';
            matchDetail = `Provider currency ${line.currency} does not match the INR CRM refund ledger.`;
          } else if (attempt.amountPaise !== line.amountPaise || toPaise(attempt.localRefundPayment.amount) !== line.amountPaise) {
            matchStatus = 'AMOUNT_MISMATCH';
            matchDetail = `Provider refund amount ${line.amountPaise} paise differs from CRM refund amount ${toPaise(attempt.localRefundPayment.amount)} paise.`;
          } else if (attempt.localRefundPayment.razorpayRefundId !== line.providerEntityId) {
            matchStatus = 'REFUND_REFERENCE_MISMATCH';
            matchDetail = 'The refund ledger reference differs from the provider refund ID.';
          } else if (line.providerPaymentId && attempt.sourcePayment.razorpayPaymentId !== line.providerPaymentId) {
            matchStatus = 'SOURCE_PAYMENT_MISMATCH';
            matchDetail = 'The CRM refund is linked to a different source Razorpay payment.';
          }
        }
      }
      return {
        ...line,
        amountPaise: line.amountPaise.toString(),
        debitPaise: line.debitPaise.toString(),
        creditPaise: line.creditPaise.toString(),
        feePaise: line.feePaise.toString(),
        taxPaise: line.taxPaise.toString(),
        matchStatus,
        matchDetail,
        localPaymentId,
        localRefundAttemptId,
      };
    });
    return success(res, { lines: serializedLines });
  } catch {
    return res.status(500).json({ success: false, code: 'SETTLEMENT_RECON_READ_FAILED', message: 'Settlement reconciliation rows could not be loaded.' });
  }
};

const importBankStatement = async (req, res) => {
  try {
    const result = await importBankStatementCsv({
      csvText: req.body?.csvText,
      fileName: req.body?.fileName,
      accountLabel: req.body?.accountLabel,
      importedBy: req.staff?.id,
      actorName: req.staff?.name,
      requestMeta: getRequestMeta(req),
    });
    const { fileSha256, ...safeResult } = result;
    return success(res, { import: safeResult }, 'Bank statement import recorded', 201);
  } catch (err) {
    const statusCode = err?.code === 'BANK_STATEMENT_DUPLICATE_FILE' ? 409
      : String(err?.code || '').startsWith('BANK_STATEMENT_') ? 400 : 500;
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'BANK_STATEMENT_IMPORT_FAILED', resource: 'bank_statement_import',
      description: 'Bank statement import did not complete',
      metadata: { errorCode: err?.code || 'BANK_STATEMENT_IMPORT_FAILED' },
      ...getRequestMeta(req), status: 'FAILED',
    });
    return res.status(statusCode).json({
      success: false,
      code: err?.code || 'BANK_STATEMENT_IMPORT_FAILED',
      message: statusCode === 409 ? 'This statement file has already been imported.'
        : statusCode === 400 ? err.message : 'Bank statement could not be imported.',
    });
  }
};

const previewBankStatement = async (req, res) => {
  try {
    return success(res, { preview: previewBankStatementCsv({ csvText: req.body?.csvText }) });
  } catch (err) {
    const statusCode = String(err?.code || '').startsWith('BANK_STATEMENT_') ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      code: err?.code || 'BANK_STATEMENT_PREVIEW_FAILED',
      message: statusCode === 400 ? err.message : 'Bank statement could not be previewed.',
    });
  }
};

const listBankStatements = async (req, res) => {
  try {
    const imports = await listBankStatementImports({ limit: req.query.limit });
    return success(res, { imports });
  } catch {
    return res.status(500).json({ success: false, code: 'BANK_STATEMENT_LIST_FAILED', message: 'Bank statement imports could not be loaded.' });
  }
};

const getBankStatement = async (req, res) => {
  try {
    const statement = await getBankStatementImport(req.params.id);
    if (!statement) return res.status(404).json({ success: false, code: 'BANK_STATEMENT_NOT_FOUND', message: 'Bank statement import was not found.' });
    return success(res, { import: { ...statement, rows: statement.rows.map((row) => ({
      ...row,
      amountPaise: row.amountPaise?.toString() ?? null,
      balancePaise: row.balancePaise?.toString() ?? null,
    })) } });
  } catch {
    return res.status(500).json({ success: false, code: 'BANK_STATEMENT_READ_FAILED', message: 'Bank statement details could not be loaded.' });
  }
};

const bankMatchErrorStatus = (code) => code === 'BANK_STATEMENT_NOT_FOUND' || code === 'BANK_SETTLEMENT_MATCH_NOT_FOUND' ? 404
  : code === 'BANK_SETTLEMENT_MATCH_CONFLICT' || code === 'BANK_SETTLEMENT_ROW_ALREADY_MATCHED' || code === 'BANK_SETTLEMENT_ALREADY_MATCHED' || code === 'BANK_SETTLEMENT_MATCH_NOT_ACTIVE' ? 409
    : code?.startsWith('BANK_SETTLEMENT_') ? 400 : 500;

const listBankSettlementCandidates = async (req, res) => {
  try {
    return success(res, { matching: await getBankSettlementCandidates(req.params.id) });
  } catch (err) {
    const statusCode = bankMatchErrorStatus(err?.code);
    return res.status(statusCode).json({ success: false, code: err?.code || 'BANK_SETTLEMENT_CANDIDATES_FAILED', message: statusCode === 500 ? 'Settlement match candidates could not be loaded.' : err.message });
  }
};

const createBankSettlementMatch = async (req, res) => {
  try {
    const match = await confirmBankSettlementMatch({
      rowId: req.params.rowId,
      settlementSummaryId: req.body?.settlementSummaryId,
      reason: req.body?.reason,
      staff: req.staff,
      actorName: req.staff?.name,
      requestMeta: getRequestMeta(req),
    });
    return success(res, { match }, 'Bank settlement match recorded');
  } catch (err) {
    const statusCode = bankMatchErrorStatus(err?.code);
    await log({ actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name, action: 'BANK_SETTLEMENT_MATCH_FAILED', resource: 'bank_settlement_match', resourceId: req.params.rowId, description: 'Bank settlement match was not recorded', metadata: { errorCode: err?.code || 'BANK_SETTLEMENT_MATCH_FAILED' }, ...getRequestMeta(req), status: 'FAILED' });
    return res.status(statusCode).json({ success: false, code: err?.code || 'BANK_SETTLEMENT_MATCH_FAILED', message: statusCode === 500 ? 'Bank settlement match could not be recorded.' : err.message });
  }
};

const reverseBankSettlement = async (req, res) => {
  try {
    const match = await reverseBankSettlementMatch({ matchId: req.params.matchId, reason: req.body?.reason, staff: req.staff, actorName: req.staff?.name, requestMeta: getRequestMeta(req) });
    return success(res, { match: { ...match, statementAmountPaise: match.statementAmountPaise.toString(), settlementAmountPaise: match.settlementAmountPaise.toString(), reportNetPaise: match.reportNetPaise.toString(), variancePaise: match.variancePaise.toString() } }, 'Bank settlement match reversed');
  } catch (err) {
    const statusCode = bankMatchErrorStatus(err?.code);
    await log({ actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name, action: 'BANK_SETTLEMENT_MATCH_REVERSAL_FAILED', resource: 'bank_settlement_match', resourceId: req.params.matchId, description: 'Bank settlement match reversal was not recorded', metadata: { errorCode: err?.code || 'BANK_SETTLEMENT_MATCH_REVERSAL_FAILED' }, ...getRequestMeta(req), status: 'FAILED' });
    return res.status(statusCode).json({ success: false, code: err?.code || 'BANK_SETTLEMENT_MATCH_REVERSAL_FAILED', message: statusCode === 500 ? 'Bank settlement match could not be reversed.' : err.message });
  }
};

module.exports = { backfillHistoricalRazorpayOrder, backfillHistoricalRazorpayPayment, createBankSettlementMatch, getBankStatement, getRazorpaySettlementSummaryReportController, importBankStatement, listBankSettlementCandidates, listBankStatements, listRuns, previewBankStatement, previewRazorpayDashboardOrdersReport, previewRazorpayDashboardPaymentsReport, previewRazorpayHistoricalPaymentReports, previewRazorpayOrders, reverseBankSettlement, runNow, runRazorpayPaymentsNow, runRazorpaySettlementsNow, runRazorpaySettlementSummariesNow, listRazorpaySettlementSummaries, listRazorpaySettlementLines };
