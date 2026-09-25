const prisma = require('../config/database');

const fail = (code, message) => Object.assign(new Error(message), { code });
const DAY_MS = 86_400_000;
const toIsoDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};
const asPaise = (value) => BigInt(value ?? 0);
const sum = (rows, selector) => rows.reduce((total, row) => total + asPaise(selector(row)), 0n);
const netPaise = (line) => asPaise(line.creditPaise) - asPaise(line.debitPaise);
const serializeGroup = (group, paymentsByProviderId) => {
  const { lines, summary, activeMatches } = group;
  const inrLines = lines.filter((line) => line.currency === 'INR');
  const unsupportedCurrencies = [...new Set(lines.filter((line) => line.currency !== 'INR').map((line) => line.currency))];
  const providerGrossPaise = sum(inrLines.filter((line) => line.entityType === 'payment'), (line) => line.amountPaise);
  const refundsPaise = sum(inrLines.filter((line) => line.entityType === 'refund'), (line) => line.amountPaise);
  const feesPaise = sum(inrLines, (line) => line.feePaise);
  const taxPaise = sum(inrLines, (line) => line.taxPaise);
  const transferNetPaise = sum(inrLines.filter((line) => line.entityType === 'transfer'), netPaise);
  const adjustmentNetPaise = sum(inrLines.filter((line) => line.entityType === 'adjustment'), netPaise);
  const reportNetPaise = sum(inrLines, netPaise);
  const bankCreditedPaise = sum(activeMatches, (match) => match.statementAmountPaise);
  const settlementAmountPaise = summary?.amountPaise ?? null;
  const reportToSettlementVariancePaise = summary?.status !== 'processed' || settlementAmountPaise === null ? null : reportNetPaise - settlementAmountPaise;
  const bankToSettlementVariancePaise = settlementAmountPaise === null || !activeMatches.length ? null : bankCreditedPaise - settlementAmountPaise;
  const settledLines = lines.filter((line) => line.settled && !line.onHold);
  const pendingLines = lines.filter((line) => !line.settled && !line.onHold);
  const heldLines = lines.filter((line) => line.onHold);
  return {
    providerSettlementId: group.providerSettlementId,
    settlementSummaryStatus: summary?.status ?? null,
    settlementCreatedAt: summary?.providerCreatedAt ?? null,
    settlementUtr: summary?.settlementUtr ?? lines.find((line) => line.settlementUtr)?.settlementUtr ?? null,
    settlementAmountPaise: settlementAmountPaise?.toString() ?? null,
    providerGrossPaise: providerGrossPaise.toString(),
    refundsPaise: refundsPaise.toString(),
    feesPaise: feesPaise.toString(),
    taxPaise: taxPaise.toString(),
    transferNetPaise: transferNetPaise.toString(),
    adjustmentNetPaise: adjustmentNetPaise.toString(),
    reportNetPaise: reportNetPaise.toString(),
    reportToSettlementVariancePaise: reportToSettlementVariancePaise?.toString() ?? null,
    bankCreditedPaise: bankCreditedPaise.toString(),
    bankToSettlementVariancePaise: bankToSettlementVariancePaise?.toString() ?? null,
    activeBankMatchCount: activeMatches.length,
    unmatchedProcessedSettlement: summary?.status === 'processed' && activeMatches.length === 0,
    settledLineCount: settledLines.length,
    pendingLineCount: pendingLines.length,
    onHoldLineCount: heldLines.length,
    unsupportedCurrencyLineCount: unsupportedCurrencies.length ? lines.length - inrLines.length : 0,
    unsupportedCurrencies,
    currency: 'INR',
    lineCount: lines.length,
    lines: lines.map((line) => ({
      id: line.id,
      entityType: line.entityType,
      providerEntityId: line.providerEntityId,
      providerPaymentId: line.providerPaymentId,
      providerOrderId: line.providerOrderId,
      crmPayments: (paymentsByProviderId.get(line.providerPaymentId) || []).filter((payment) => payment.mode === line.mode).map((payment) => ({
        id: payment.id,
        mode: payment.mode,
        method: payment.method,
        amount: payment.amount.toFixed(2),
        orderId: payment.orderId,
        orderNumber: payment.order?.orderNumber ?? null,
        invoices: payment.allocations.map((allocation) => ({ id: allocation.invoice.id, invoiceNumber: allocation.invoice.invoiceNumber })),
      })),
      currency: line.currency,
      amountPaise: line.amountPaise.toString(),
      debitPaise: line.debitPaise.toString(),
      creditPaise: line.creditPaise.toString(),
      feePaise: line.feePaise.toString(),
      taxPaise: line.taxPaise.toString(),
      settled: line.settled,
      onHold: line.onHold,
      providerSettledAt: line.providerSettledAt,
    })),
    bankMatches: activeMatches.map((match) => ({
      id: match.id,
      matchType: match.matchType,
      statementReference: match.bankStatementRow.reference,
      statementDate: match.bankStatementRow.transactionDate,
      statementAmountPaise: match.statementAmountPaise.toString(),
      variancePaise: match.variancePaise.toString(),
      accountLabel: match.bankStatementRow.import.accountLabel,
    })),
  };
};

const getRazorpaySettlementSummaryReport = async ({ from, to, mode }) => {
  const start = toIsoDay(from);
  const endStart = toIsoDay(to);
  if (!start || !endStart || endStart < start || endStart.getTime() - start.getTime() > 366 * DAY_MS) {
    throw fail('INVALID_SETTLEMENT_REPORT_WINDOW', 'Choose a valid date range of no more than one year.');
  }
  if (!['LIVE', 'TEST'].includes(mode)) throw fail('INVALID_SETTLEMENT_REPORT_MODE', 'Choose Test or Live mode.');
  const end = new Date(endStart.getTime() + DAY_MS);
  const summariesInRange = await prisma.razorpaySettlementSummary.findMany({
    where: { mode, providerCreatedAt: { gte: start, lt: end } },
    orderBy: { providerCreatedAt: 'desc' },
  });
  const reportLinesInRange = await prisma.razorpaySettlementReconLine.findMany({
    where: {
      mode,
      OR: [
        { providerSettledAt: { gte: start, lt: end } },
        {
          providerCreatedAt: { gte: start, lt: end },
          OR: [{ settled: false }, { onHold: true }],
        },
      ],
    },
    orderBy: { providerSettledAt: 'desc' },
  });
  const settlementIds = [...new Set([
    ...summariesInRange.map((summary) => summary.providerSettlementId),
    ...reportLinesInRange.map((line) => line.providerSettlementId).filter(Boolean),
  ])];
  const summaries = settlementIds.length ? await prisma.razorpaySettlementSummary.findMany({ where: { mode, providerSettlementId: { in: settlementIds } } }) : [];
  const settlementLines = settlementIds.length ? await prisma.razorpaySettlementReconLine.findMany({
    where: { mode, providerSettlementId: { in: settlementIds } },
    orderBy: [{ providerSettledAt: 'desc' }, { providerCreatedAt: 'desc' }],
  }) : [];
  const lines = [...settlementLines, ...reportLinesInRange.filter((line) => !line.providerSettlementId)];
  const providerPaymentIds = [...new Set(lines.map((line) => line.providerPaymentId).filter(Boolean))];
  const crmPayments = providerPaymentIds.length ? await prisma.payment.findMany({
    where: { razorpayPaymentId: { in: providerPaymentIds } },
    select: {
      id: true,
      razorpayPaymentId: true,
      mode: true,
      method: true,
      amount: true,
      orderId: true,
      order: { select: { orderNumber: true } },
      allocations: { select: { invoice: { select: { id: true, invoiceNumber: true } } } },
    },
  }) : [];
  const paymentsByProviderId = new Map();
  for (const payment of crmPayments) paymentsByProviderId.set(payment.razorpayPaymentId, [...(paymentsByProviderId.get(payment.razorpayPaymentId) || []), payment]);
  const linesBySettlement = new Map();
  const unassignedLines = [];
  for (const line of lines) {
    if (!line.providerSettlementId) unassignedLines.push(line);
    else linesBySettlement.set(line.providerSettlementId, [...(linesBySettlement.get(line.providerSettlementId) || []), line]);
  }
  const summaryBySettlement = new Map(summaries.map((summary) => [summary.providerSettlementId, summary]));
  const activeMatches = summaries.length ? await prisma.bankSettlementMatch.findMany({
    where: { status: 'MATCHED', settlementSummaryId: { in: summaries.map((summary) => summary.id) } },
    include: { bankStatementRow: { include: { import: { select: { accountLabel: true } } } } },
    orderBy: { confirmedAt: 'desc' },
  }) : [];
  const matchesBySummary = new Map();
  for (const match of activeMatches) matchesBySummary.set(match.settlementSummaryId, [...(matchesBySummary.get(match.settlementSummaryId) || []), match]);
  const groups = settlementIds.map((providerSettlementId) => serializeGroup({
    providerSettlementId,
    summary: summaryBySettlement.get(providerSettlementId) || null,
    lines: linesBySettlement.get(providerSettlementId) || [],
    activeMatches: matchesBySummary.get(summaryBySettlement.get(providerSettlementId)?.id) || [],
  }, paymentsByProviderId)).sort((a, b) => String(b.settlementCreatedAt || '').localeCompare(String(a.settlementCreatedAt || '')));
  const unassigned = unassignedLines.length ? serializeGroup({ providerSettlementId: null, summary: null, lines: unassignedLines, activeMatches: [] }, paymentsByProviderId) : null;
  const selectedLines = groups.flatMap((group) => group.lines);
  const allReportLines = [...selectedLines, ...unassignedLines];
  const inrSelectedLines = selectedLines.filter((line) => line.currency === 'INR');
  const selectedSummaries = groups.filter((group) => group.settlementSummaryStatus).length;
  const matchedBankCreditedPaise = sum(groups, (group) => BigInt(group.bankCreditedPaise));
  const processedSummaries = summaries.filter((summary) => summary.status === 'processed');
  const pendingSummaries = summaries.filter((summary) => summary.status === 'created');
  const failedSummaries = summaries.filter((summary) => summary.status === 'failed');
  const processedSettlementAmountPaise = sum(processedSummaries, (summary) => summary.amountPaise);
  const processedReportNetPaise = sum(groups.filter((group) => group.settlementSummaryStatus === 'processed'), (group) => BigInt(group.reportNetPaise));
  const matchedProcessedSettlementAmountPaise = sum(groups.filter((group) => group.settlementSummaryStatus === 'processed' && group.activeBankMatchCount > 0), (group) => BigInt(group.settlementAmountPaise));
  const unmatchedProcessedSettlements = groups.filter((group) => group.unmatchedProcessedSettlement);
  const unmatchedBankRows = await prisma.bankStatementRow.findMany({
    where: {
      status: 'ACCEPTED', direction: 'CREDIT', currency: 'INR', transactionDate: { gte: start, lt: end },
      settlementMatches: { none: { status: 'MATCHED' } },
    },
    include: { import: { select: { id: true, accountLabel: true } } },
    orderBy: [{ transactionDate: 'desc' }, { id: 'asc' }], take: 500,
  });
  const unmatchedBankCreditPaise = sum(unmatchedBankRows, (row) => row.amountPaise || 0n);
  const totals = {
    settlementBatchCount: groups.filter((group) => group.settlementSummaryStatus).length,
    providerGrossPaise: sum(inrSelectedLines.filter((line) => line.entityType === 'payment'), (line) => line.amountPaise).toString(),
    refundsPaise: sum(inrSelectedLines.filter((line) => line.entityType === 'refund'), (line) => line.amountPaise).toString(),
    feesPaise: sum(inrSelectedLines, (line) => line.feePaise).toString(),
    taxPaise: sum(inrSelectedLines, (line) => line.taxPaise).toString(),
    transferNetPaise: sum(inrSelectedLines.filter((line) => line.entityType === 'transfer'), netPaise).toString(),
    adjustmentNetPaise: sum(inrSelectedLines.filter((line) => line.entityType === 'adjustment'), netPaise).toString(),
    reportNetPaise: sum(inrSelectedLines, netPaise).toString(),
    settlementAmountPaise: sum(summaries, (summary) => summary.amountPaise).toString(),
    processedSettlementAmountPaise: processedSettlementAmountPaise.toString(),
    processedReportNetPaise: processedReportNetPaise.toString(),
    matchedProcessedSettlementAmountPaise: matchedProcessedSettlementAmountPaise.toString(),
    pendingSettlementAmountPaise: sum(pendingSummaries, (summary) => summary.amountPaise).toString(),
    failedSettlementAmountPaise: sum(failedSummaries, (summary) => summary.amountPaise).toString(),
    bankCreditedPaise: matchedBankCreditedPaise.toString(),
    bankVariancePaise: (matchedBankCreditedPaise - matchedProcessedSettlementAmountPaise).toString(),
    reportToSettlementVariancePaise: (processedReportNetPaise - processedSettlementAmountPaise).toString(),
    unmatchedProcessedSettlementCount: unmatchedProcessedSettlements.length,
    unmatchedProcessedSettlementPaise: sum(unmatchedProcessedSettlements.filter((item) => item.settlementAmountPaise != null), (item) => BigInt(item.settlementAmountPaise)).toString(),
    pendingLineCount: allReportLines.filter((line) => !line.settled).length,
    pendingNotOnHoldLineCount: allReportLines.filter((line) => !line.settled && !line.onHold).length,
    settledLineCount: allReportLines.filter((line) => line.settled && !line.onHold).length,
    onHoldLineCount: allReportLines.filter((line) => line.onHold).length,
    missingSummaryCount: groups.filter((group) => !group.settlementSummaryStatus).length,
    unassignedReportLineCount: unassignedLines.length,
    unsupportedCurrencyLineCount: selectedLines.length - inrSelectedLines.length,
    unmatchedBankCreditCount: unmatchedBankRows.length,
    unmatchedBankCreditPaise: unmatchedBankCreditPaise.toString(),
    unmatchedBankRowsTruncated: unmatchedBankRows.length >= 500,
    bankImportStatementCount: new Set(unmatchedBankRows.map((row) => row.importId)).size,
    summaryRecordsWithoutReportLines: groups.filter((group) => group.settlementSummaryStatus && !group.lineCount).length,
    reportLineCount: selectedLines.length,
    selectedSummaryCount: selectedSummaries,
  };
  return {
    mode,
    period: { from, to },
    totals,
    settlements: groups,
    unassignedReport: unassigned,
    unmatchedBankRows: unmatchedBankRows.map((row) => ({
      id: row.id,
      importId: row.importId,
      accountLabel: row.import.accountLabel,
      rowNumber: row.rowNumber,
      transactionDate: row.transactionDate,
      reference: row.reference,
      amountPaise: row.amountPaise?.toString() ?? '0',
    })),
  };
};

module.exports = { getRazorpaySettlementSummaryReport };
