const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const { runFinancialReconciliation } = require('../services/reconciliation.service');
const { enqueueRazorpayPaymentReconciliation, enqueueRazorpaySettlementReconciliation, enqueueRazorpaySettlementSummaryReconciliation } = require('../services/razorpay-payment-reconciliation.service');
const { getBankStatementImport, importBankStatementCsv, listBankStatementImports, previewBankStatementCsv } = require('../services/bank-statement-import.service');
const { confirmBankSettlementMatch, getBankSettlementCandidates, reverseBankSettlementMatch } = require('../services/bank-settlement-match.service');
const { getRazorpaySettlementSummaryReport } = require('../services/razorpay-settlement-summary-report.service');
const { log, getRequestMeta } = require('../services/activity.service');

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
    console.error('Razorpay payment reconciliation:', err?.code || err?.message || 'PROVIDER_ERROR');
    return error(res, 'Razorpay payment reconciliation failed to execute');
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

module.exports = { createBankSettlementMatch, getBankStatement, getRazorpaySettlementSummaryReportController, importBankStatement, listBankSettlementCandidates, listBankStatements, listRuns, previewBankStatement, reverseBankSettlement, runNow, runRazorpayPaymentsNow, runRazorpaySettlementsNow, runRazorpaySettlementSummariesNow, listRazorpaySettlementSummaries, listRazorpaySettlementLines };
