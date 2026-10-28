const prisma = require('../config/database');
const { getRazorpay } = require('./razorpay-invoice-checkout.service');
const { razorpayErrorSummary } = require('../utils/redact');

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const MIN_EPOCH_SECONDS = 946684800;
const MAX_EPOCH_SECONDS = 4765046400;
const SETTLEMENT_STATES = new Set(['created', 'processed', 'failed']);
const modeFromKey = () => String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
const safeCode = (error) => String(razorpayErrorSummary(error).code || 'PROVIDER_ERROR').slice(0, 80);

const validateWindow = (from, to) => {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < MIN_EPOCH_SECONDS || to > MAX_EPOCH_SECONDS || to <= from) {
    throw Object.assign(new Error('A valid Unix timestamp range is required'), { code: 'INVALID_SETTLEMENT_SUMMARY_WINDOW' });
  }
};

const integerPaise = (value, field) => {
  const raw = value === undefined || value === null ? '0' : String(value);
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error(`Invalid settlement ${field}`), { code: 'INVALID_SETTLEMENT_SUMMARY_AMOUNT' });
  return BigInt(raw);
};

const normalizeSummary = (row, mode, syncedAt) => {
  const id = String(row?.id || '');
  const status = String(row?.status || '').toLowerCase();
  const createdAtSeconds = Number(row?.created_at);
  if (!id || id.length > 128 || !SETTLEMENT_STATES.has(status)) {
    throw Object.assign(new Error('Razorpay settlement summary has an unsupported ID or state'), { code: 'INVALID_SETTLEMENT_SUMMARY' });
  }
  if (!Number.isSafeInteger(createdAtSeconds) || createdAtSeconds < MIN_EPOCH_SECONDS || createdAtSeconds > MAX_EPOCH_SECONDS) {
    throw Object.assign(new Error('Razorpay settlement summary has an invalid creation time'), { code: 'INVALID_SETTLEMENT_SUMMARY_TIMESTAMP' });
  }
  return {
    mode,
    providerSettlementId: id,
    status,
    amountPaise: integerPaise(row.amount, 'amount'),
    feesPaise: integerPaise(row.fees, 'fees'),
    taxPaise: integerPaise(row.tax, 'tax'),
    settlementUtr: row.utr ? String(row.utr).slice(0, 128) : null,
    providerCreatedAt: new Date(createdAtSeconds * 1000),
    lastSyncedAt: syncedAt,
  };
};

const importRazorpaySettlementSummaries = async ({ from, to, provider: injectedProvider, mode = modeFromKey() }) => {
  const start = Number(from);
  const end = Number(to);
  validateWindow(start, end);
  const provider = injectedProvider || getRazorpay();
  if (typeof provider?.settlements?.all !== 'function') {
    throw Object.assign(new Error('Razorpay settlement list operation is unavailable'), { code: 'SETTLEMENT_SUMMARY_UNAVAILABLE' });
  }
  const summary = { mode, from: start, to: end, pages: 0, rows: 0, inserted: 0, updated: 0, byStatus: { created: 0, processed: 0, failed: 0 }, amountPaise: 0n, feesPaise: 0n, taxPaise: 0n };
  const syncedAt = new Date();
  let skip = 0;
  let complete = false;
  while (summary.pages < MAX_PAGES) {
    let response;
    try {
      response = await provider.settlements.all({ from: start, to: end, count: PAGE_SIZE, skip });
    } catch (error) {
      throw Object.assign(new Error('Razorpay settlement summary fetch failed'), { code: safeCode(error), cause: error });
    }
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) throw Object.assign(new Error('Razorpay settlement summary has no items collection'), { code: 'INVALID_SETTLEMENT_SUMMARY_RESPONSE' });
    const rows = items.map((item) => normalizeSummary(item, mode, syncedAt));
    const existing = rows.length ? await prisma.razorpaySettlementSummary.count({
      where: { mode, providerSettlementId: { in: rows.map((row) => row.providerSettlementId) } },
    }) : 0;
    await prisma.$transaction(rows.map((row) => prisma.razorpaySettlementSummary.upsert({
      where: { mode_providerSettlementId: { mode: row.mode, providerSettlementId: row.providerSettlementId } },
      create: row,
      update: row,
    })));
    summary.pages += 1;
    summary.rows += rows.length;
    summary.updated += existing;
    summary.inserted += rows.length - existing;
    for (const row of rows) {
      summary.byStatus[row.status] += 1;
      summary.amountPaise += row.amountPaise;
      summary.feesPaise += row.feesPaise;
      summary.taxPaise += row.taxPaise;
    }
    if (items.length < PAGE_SIZE) {
      complete = true;
      break;
    }
    skip += items.length;
  }
  if (!complete) throw Object.assign(new Error('Razorpay settlement summary reached its page safety limit'), { code: 'SETTLEMENT_SUMMARY_PAGE_LIMIT' });
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value]));
};

module.exports = { importRazorpaySettlementSummaries, validateWindow };
