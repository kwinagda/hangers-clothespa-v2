const prisma = require('../config/database');
const { writeAuditEvent } = require('./activity.service');
const { safeText } = require('../utils/redact');

const fail = (code, message) => Object.assign(new Error(message), { code });
const MANAGER_ROLES = new Set(['MANAGER', 'SUPER_ADMIN']);

const computeEvidence = (summary, lines) => {
  if (summary.mode !== 'LIVE') return { eligible: false, reason: 'Only LIVE settlements can be matched to bank credits.' };
  if (summary.status !== 'processed') return { eligible: false, reason: 'Razorpay has not marked this settlement processed.' };
  if (!lines.length) return { eligible: false, reason: 'Settlement report lines have not been imported.' };
  const wrongCurrency = lines.find((line) => line.currency !== 'INR');
  if (wrongCurrency) return { eligible: false, reason: `Settlement report contains unsupported ${wrongCurrency.currency} currency.` };
  const unsettled = lines.find((line) => !line.settled || line.onHold);
  if (unsettled) return { eligible: false, reason: 'Settlement report includes pending or on-hold lines.' };
  const reportNetPaise = lines.reduce((total, line) => total + line.creditPaise - line.debitPaise, 0n);
  if (reportNetPaise !== summary.amountPaise) {
    return { eligible: false, reportNetPaise, reason: 'Provider settlement summary amount does not equal the imported report net.' };
  }
  const utrs = new Set(lines.map((line) => line.settlementUtr).filter(Boolean));
  if (summary.settlementUtr) utrs.add(summary.settlementUtr);
  return { eligible: true, reportNetPaise, utrs };
};

const getBankSettlementCandidates = async (statementImportId) => {
  const statement = await prisma.bankStatementImport.findUnique({
    where: { id: statementImportId },
    include: { rows: { where: { status: 'ACCEPTED' }, orderBy: { rowNumber: 'asc' }, include: { settlementMatches: { where: { status: 'MATCHED' }, include: { settlementSummary: true } } } } },
  });
  if (!statement) throw fail('BANK_STATEMENT_NOT_FOUND', 'Bank statement import was not found.');
  const credits = statement.rows.filter((row) => row.direction === 'CREDIT' && row.currency === 'INR' && row.amountPaise != null);
  const minDate = credits.reduce((date, row) => row.transactionDate && row.transactionDate < date ? row.transactionDate : date, credits[0]?.transactionDate || new Date(0));
  const maxDate = credits.reduce((date, row) => row.transactionDate && row.transactionDate > date ? row.transactionDate : date, credits[0]?.transactionDate || new Date(8640000000000000));
  const from = new Date(minDate.getTime() - 14 * 86400000);
  const to = new Date(maxDate.getTime() + 14 * 86400000);
  const summaries = credits.length ? await prisma.razorpaySettlementSummary.findMany({
    where: { mode: 'LIVE', status: 'processed', OR: [{ providerCreatedAt: { gte: from, lte: to } }, { settlementUtr: { in: credits.map((row) => row.reference).filter(Boolean) } }] },
    orderBy: { providerCreatedAt: 'desc' }, take: 200,
    include: { bankMatches: { where: { status: 'MATCHED' }, select: { id: true, bankStatementRowId: true } } },
  }) : [];
  const linesBySettlement = new Map();
  if (summaries.length) {
    const allLines = await prisma.razorpaySettlementReconLine.findMany({ where: { mode: 'LIVE', providerSettlementId: { in: summaries.map((item) => item.providerSettlementId) } } });
    for (const line of allLines) linesBySettlement.set(line.providerSettlementId, [...(linesBySettlement.get(line.providerSettlementId) || []), line]);
  }
  return {
    statement: { id: statement.id, accountLabel: statement.accountLabel, fileName: statement.fileName, status: statement.status },
    rows: credits.map((row) => {
      const existing = row.settlementMatches[0];
      const candidates = summaries.map((summary) => {
        const evidence = computeEvidence(summary, linesBySettlement.get(summary.providerSettlementId) || []);
        const activeMatch = summary.bankMatches.find((match) => match.bankStatementRowId !== row.id);
        const amountMatch = summary.amountPaise === row.amountPaise && evidence.reportNetPaise === row.amountPaise;
        const utrMatch = Boolean(row.reference && (summary.settlementUtr === row.reference || evidence.utrs?.has(row.reference)));
        const providerReferenceMatch = evidence.utrs?.has(row.reference);
        const exact = evidence.eligible && !activeMatch && utrMatch && amountMatch && providerReferenceMatch;
        return {
          id: summary.id,
          providerSettlementId: summary.providerSettlementId,
          status: summary.status,
          mode: summary.mode,
          settlementUtr: summary.settlementUtr,
          providerCreatedAt: summary.providerCreatedAt,
          amountPaise: summary.amountPaise.toString(),
          reportNetPaise: evidence.reportNetPaise?.toString() ?? null,
          variancePaise: (row.amountPaise - summary.amountPaise).toString(),
          utrMatch,
          amountMatch,
          exact,
          eligible: evidence.eligible && !activeMatch,
          reason: activeMatch ? 'This settlement is already matched to another bank statement credit.' : evidence.reason || (exact ? 'Exact UTR, bank credit and provider report net match.' : 'Candidate requires authorized review and a reason.'),
        };
      }).filter((candidate) => candidate.utrMatch || candidate.amountMatch);
      return {
        id: row.id,
        rowNumber: row.rowNumber,
        transactionDate: row.transactionDate,
        reference: row.reference,
        amountPaise: row.amountPaise.toString(),
        currency: row.currency,
        matched: Boolean(existing),
        activeMatch: existing ? {
          id: existing.id,
          matchType: existing.matchType,
          settlementId: existing.settlementSummary.providerSettlementId,
          settlementUtr: existing.settlementSummary.settlementUtr,
          variancePaise: existing.variancePaise.toString(),
          reason: existing.reason,
          confirmedAt: existing.confirmedAt,
        } : null,
        candidates,
      };
    }),
  };
};

const confirmBankSettlementMatch = async ({ rowId, settlementSummaryId, reason, staff, actorName, requestMeta = {} }) => {
  const safeReason = safeText(String(reason || '').replace(/[\u0000-\u001f\u007f]/g, ' '), 500) || '';
  return prisma.$transaction(async (tx) => {
    const row = await tx.bankStatementRow.findUnique({ where: { id: rowId }, include: { import: true, settlementMatches: { where: { status: 'MATCHED' } } } });
    const summary = await tx.razorpaySettlementSummary.findUnique({ where: { id: settlementSummaryId } });
    if (!row || !summary) throw fail('BANK_SETTLEMENT_MATCH_NOT_FOUND', 'Bank row or settlement batch was not found.');
    if (row.status !== 'ACCEPTED' || row.direction !== 'CREDIT' || row.currency !== 'INR' || row.amountPaise == null) throw fail('BANK_SETTLEMENT_ROW_INELIGIBLE', 'Only accepted INR bank credit rows can be matched.');
    if (row.settlementMatches.length) throw fail('BANK_SETTLEMENT_ROW_ALREADY_MATCHED', 'This bank credit already has an active settlement match.');
    const priorSettlementMatch = await tx.bankSettlementMatch.findFirst({ where: { settlementSummaryId, status: 'MATCHED' } });
    if (priorSettlementMatch) throw fail('BANK_SETTLEMENT_ALREADY_MATCHED', 'This settlement batch already has an active bank match.');
    const lines = await tx.razorpaySettlementReconLine.findMany({ where: { mode: summary.mode, providerSettlementId: summary.providerSettlementId } });
    const evidence = computeEvidence(summary, lines);
    if (!evidence.eligible) throw fail('BANK_SETTLEMENT_EVIDENCE_INELIGIBLE', evidence.reason);
    const utrMatch = Boolean(row.reference && (summary.settlementUtr === row.reference || evidence.utrs.has(row.reference)));
    const amountMatch = summary.amountPaise === row.amountPaise && evidence.reportNetPaise === row.amountPaise;
    if (!utrMatch && !amountMatch) throw fail('BANK_SETTLEMENT_NOT_A_CANDIDATE', 'The selected batch does not match this bank credit by UTR or amount.');
    const exact = utrMatch && amountMatch && evidence.utrs.has(row.reference);
    if (!exact && (!MANAGER_ROLES.has(staff?.role) || safeReason.length < 12)) {
      throw fail('BANK_SETTLEMENT_OVERRIDE_REQUIRES_MANAGER_REASON', 'A manager or super admin must provide a reason of at least 12 characters for a non-exact match.');
    }
    const variancePaise = row.amountPaise - summary.amountPaise;
    const match = await tx.bankSettlementMatch.create({ data: {
      bankStatementRowId: row.id,
      settlementSummaryId: summary.id,
      matchType: exact ? 'EXACT_UTR_AMOUNT_REPORT' : 'MANUAL_REVIEW',
      currency: row.currency,
      statementAmountPaise: row.amountPaise,
      settlementAmountPaise: summary.amountPaise,
      reportNetPaise: evidence.reportNetPaise,
      variancePaise,
      reason: exact ? (safeReason || 'Exact UTR, bank credit and provider report net match.') : safeReason,
      confirmedBy: staff.id,
    } });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: staff.id, actorName,
      action: exact ? 'BANK_SETTLEMENT_MATCH_CONFIRMED' : 'BANK_SETTLEMENT_MANUAL_MATCH_CONFIRMED',
      resource: 'bank_settlement_match', resourceId: match.id,
      description: exact ? 'Exact provider settlement matched to bank statement credit' : 'Manager-confirmed bank settlement match with recorded variance',
      metadata: { bankStatementRowId: row.id, settlementSummaryId: summary.id, matchType: match.matchType, currency: row.currency, statementAmountPaise: row.amountPaise.toString(), settlementAmountPaise: summary.amountPaise.toString(), reportNetPaise: evidence.reportNetPaise.toString(), variancePaise: variancePaise.toString(), reason: match.reason },
      ...requestMeta,
    });
    return { ...match, statementAmountPaise: match.statementAmountPaise.toString(), settlementAmountPaise: match.settlementAmountPaise.toString(), reportNetPaise: match.reportNetPaise.toString(), variancePaise: match.variancePaise.toString() };
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }).catch((error) => {
    if (error?.code === 'P2002' || error?.code === 'P2034') throw fail('BANK_SETTLEMENT_MATCH_CONFLICT', 'This bank row or settlement batch was matched concurrently. Refresh and review the current match.');
    throw error;
  });
};

const reverseBankSettlementMatch = async ({ matchId, reason, staff, actorName, requestMeta = {} }) => {
  const safeReason = safeText(String(reason || '').replace(/[\u0000-\u001f\u007f]/g, ' '), 500) || '';
  if (!MANAGER_ROLES.has(staff?.role) || safeReason.length < 12) throw fail('BANK_SETTLEMENT_REVERSAL_REQUIRES_MANAGER_REASON', 'A manager or super admin must provide a reason of at least 12 characters.');
  return prisma.$transaction(async (tx) => {
    const match = await tx.bankSettlementMatch.findUnique({ where: { id: matchId } });
    if (!match || match.status !== 'MATCHED') throw fail('BANK_SETTLEMENT_MATCH_NOT_ACTIVE', 'Active settlement match was not found.');
    const reversed = await tx.bankSettlementMatch.update({ where: { id: matchId }, data: { status: 'REVERSED', reversedBy: staff.id, reversedAt: new Date(), reverseReason: safeReason } });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: staff.id, actorName,
      action: 'BANK_SETTLEMENT_MATCH_REVERSED', resource: 'bank_settlement_match', resourceId: matchId,
      description: 'Bank settlement match reversed; original match retained for audit',
      metadata: { bankStatementRowId: match.bankStatementRowId, settlementSummaryId: match.settlementSummaryId, matchType: match.matchType, variancePaise: match.variancePaise.toString(), reason: safeReason },
      ...requestMeta,
    });
    return reversed;
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
};

module.exports = { confirmBankSettlementMatch, getBankSettlementCandidates, reverseBankSettlementMatch };
