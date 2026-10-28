const prisma = require('../config/database');
const { getRazorpay } = require('./razorpay-invoice-checkout.service');
const { razorpayErrorSummary } = require('../utils/redact');

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const SUPPORTED_TYPES = new Set(['payment', 'refund', 'transfer', 'adjustment']);
const safeCode = (error) => String(razorpayErrorSummary(error).code || 'PROVIDER_ERROR').slice(0, 80);
const modeFromKey = () => String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const asMinorUnits = (value, field) => {
  const raw = value === null || value === undefined ? 0 : String(value);
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error(`Invalid settlement recon ${field}`), { code: 'INVALID_SETTLEMENT_RECON_AMOUNT' });
  return BigInt(raw);
};

const providerDate = (seconds) => {
  if (seconds === null || seconds === undefined) return null;
  const numeric = Number(seconds);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw Object.assign(new Error('Invalid settlement recon timestamp'), { code: 'INVALID_SETTLEMENT_RECON_TIMESTAMP' });
  return new Date(numeric * 1000);
};

const normalizeLine = (line, mode, syncedAt) => {
  const entityType = String(line?.type || '').toLowerCase();
  const providerEntityId = String(line?.entity_id || '');
  const currency = String(line?.currency || '').toUpperCase();
  if (!SUPPORTED_TYPES.has(entityType) || !providerEntityId || !/^[A-Z]{3}$/.test(currency)) {
    throw Object.assign(new Error('Settlement recon row is missing a supported type, entity ID, or currency'), { code: 'INVALID_SETTLEMENT_RECON_ROW' });
  }
  return {
    mode,
    providerEntityId,
    entityType,
    providerSettlementId: line.settlement_id ? String(line.settlement_id) : null,
    providerPaymentId: line.payment_id ? String(line.payment_id) : entityType === 'payment' ? providerEntityId : null,
    providerOrderId: line.order_id ? String(line.order_id) : null,
    providerDisputeId: line.dispute_id ? String(line.dispute_id) : null,
    currency,
    amountPaise: asMinorUnits(line.amount, 'amount'),
    debitPaise: asMinorUnits(line.debit, 'debit'),
    creditPaise: asMinorUnits(line.credit, 'credit'),
    feePaise: asMinorUnits(line.fee, 'fee'),
    taxPaise: asMinorUnits(line.tax, 'tax'),
    onHold: line.on_hold === true,
    settled: line.settled === true,
    providerCreatedAt: providerDate(line.created_at),
    providerSettledAt: providerDate(line.settled_at),
    settlementUtr: line.settlement_utr ? String(line.settlement_utr).slice(0, 128) : null,
    method: line.method ? String(line.method).slice(0, 40) : null,
    lastSyncedAt: syncedAt,
  };
};

const importRazorpaySettlementRecon = async ({ year, month, day, provider: injectedProvider, mode = modeFromKey() }) => {
  const y = Number(year);
  const m = Number(month);
  const d = day === undefined || day === null ? undefined : Number(day);
  if (!Number.isInteger(y) || y < 2000 || y > 9999 || !Number.isInteger(m) || m < 1 || m > 12 || (d !== undefined && (!Number.isInteger(d) || d < 1 || d > daysInMonth(y, m)))) {
    throw Object.assign(new Error('A valid settlement-received year/month and optional day are required'), { code: 'INVALID_SETTLEMENT_RECON_DATE' });
  }
  const provider = injectedProvider || getRazorpay();
  if (typeof provider?.settlements?.reports !== 'function') {
    throw Object.assign(new Error('Razorpay settlement reconciliation report operation is unavailable'), { code: 'SETTLEMENT_RECON_UNAVAILABLE' });
  }

  const summary = { mode, year: y, month: m, ...(d ? { day: d } : {}), pages: 0, rows: 0, inserted: 0, updated: 0, types: { payment: 0, refund: 0, transfer: 0, adjustment: 0 }, debitPaise: 0n, creditPaise: 0n, feePaise: 0n, taxPaise: 0n };
  const syncedAt = new Date();
  let skip = 0;
  let complete = false;
  while (summary.pages < MAX_PAGES) {
    const params = { year: y, month: m, ...(d ? { day: d } : {}), count: PAGE_SIZE, skip };
    let response;
    try {
      response = await provider.settlements.reports(params);
    } catch (error) {
      throw Object.assign(new Error('Razorpay settlement report fetch failed'), { code: safeCode(error), cause: error });
    }
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) throw Object.assign(new Error('Razorpay settlement report has no items collection'), { code: 'INVALID_SETTLEMENT_RECON_RESPONSE' });
    summary.pages += 1;
    const rows = items.map((item) => normalizeLine(item, mode, syncedAt));
    const prior = rows.length ? await prisma.razorpaySettlementReconLine.count({
      where: { mode, OR: rows.map(({ entityType, providerEntityId }) => ({ entityType, providerEntityId })) },
    }) : 0;
    await prisma.$transaction(rows.map((row) => prisma.razorpaySettlementReconLine.upsert({
      where: { mode_entityType_providerEntityId: { mode: row.mode, entityType: row.entityType, providerEntityId: row.providerEntityId } },
      create: row,
      update: row,
    })));
    summary.rows += rows.length;
    summary.updated += prior;
    summary.inserted += rows.length - prior;
    for (const row of rows) {
      summary.types[row.entityType] += 1;
      summary.debitPaise += row.debitPaise;
      summary.creditPaise += row.creditPaise;
      summary.feePaise += row.feePaise;
      summary.taxPaise += row.taxPaise;
    }
    if (items.length < PAGE_SIZE) {
      complete = true;
      break;
    }
    skip += items.length;
  }
  if (!complete) throw Object.assign(new Error('Razorpay settlement report reached its page safety limit'), { code: 'SETTLEMENT_RECON_PAGE_LIMIT' });
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value]));
};

module.exports = { importRazorpaySettlementRecon };
