const crypto = require('node:crypto');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const prisma = require('../config/database');
const { writeAuditEvent } = require('./activity.service');

const MAX_BYTES = 450_000;
const MAX_ROWS = 10_000;
const INSERT_BATCH_SIZE = 1_000;
const REQUIRED_COLUMNS = ['transaction_date', 'reference', 'debit', 'credit', 'currency'];
const OPTIONAL_COLUMNS = ['description', 'balance'];

const importError = (message, code) => Object.assign(new Error(message), { code });

const parseDate = (value) => {
  const raw = String(value || '').trim();
  let year; let month; let day;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date;
};

const parseMoneyPaise = (value) => {
  const raw = String(value ?? '').trim().replace(/[₹\s]/g, '');
  if (!raw) return 0n;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null;
  const normalized = raw.replace(/,/g, '');
  const [whole, fraction = ''] = normalized.split('.');
  if (whole.length > 15) return null;
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

const safeMemo = (value) => {
  const memo = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\b\d{6,}\b/g, '[REDACTED]').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[REDACTED]').trim();
  return memo ? memo.slice(0, 240) : null;
};

const parseBankStatementCsv = (csvText) => {
  if (typeof csvText !== 'string' || !csvText.trim()) throw importError('Select a non-empty CSV statement.', 'BANK_STATEMENT_EMPTY');
  if (Buffer.byteLength(csvText, 'utf8') > MAX_BYTES) throw importError('CSV must be smaller than 450 KB.', 'BANK_STATEMENT_TOO_LARGE');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(csvText)) throw importError('CSV contains unsupported control characters.', 'BANK_STATEMENT_CONTROL_CHARS');

  let records;
  try {
    records = parse(csvText, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 16_384,
    });
  } catch {
    throw importError('CSV format is invalid. Check quoting and row structure.', 'BANK_STATEMENT_CSV_INVALID');
  }
  if (records.length < 2) throw importError('CSV must contain a header and at least one statement row.', 'BANK_STATEMENT_NO_ROWS');
  if (records.length - 1 > MAX_ROWS) throw importError(`CSV cannot exceed ${MAX_ROWS} rows.`, 'BANK_STATEMENT_TOO_MANY_ROWS');

  const headers = records[0].map((header) => String(header || '').trim().toLowerCase());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw importError('CSV headers must be non-empty and unique.', 'BANK_STATEMENT_HEADERS_INVALID');
  }
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw importError(`CSV is missing required columns: ${missing.join(', ')}.`, 'BANK_STATEMENT_COLUMNS_MISSING');
  const allowed = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const unsupported = headers.filter((header) => !allowed.has(header));
  if (unsupported.length) throw importError('CSV has an unsupported column. Use the documented statement format.', 'BANK_STATEMENT_COLUMNS_UNSUPPORTED');

  const rows = records.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    const errors = [];
    if (values.length !== headers.length) return { rowNumber, status: 'REJECTED', errorCode: 'INVALID_COLUMN_COUNT' };
    const row = Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? '').trim()]));
    const transactionDate = parseDate(row.transaction_date);
    if (!transactionDate) errors.push('INVALID_DATE');
    const reference = row.reference.slice(0, 128);
    if (!reference || row.reference.length > 128) errors.push('INVALID_REFERENCE');
    const debit = parseMoneyPaise(row.debit);
    const credit = parseMoneyPaise(row.credit);
    if (debit === null || credit === null) errors.push('INVALID_AMOUNT');
    else if ((debit === 0n) === (credit === 0n)) errors.push('INVALID_DIRECTION');
    const currency = String(row.currency || '').toUpperCase();
    if (currency !== 'INR') errors.push('UNSUPPORTED_CURRENCY');
    const balance = row.balance ? parseMoneyPaise(row.balance) : null;
    if (row.balance && balance === null) errors.push('INVALID_BALANCE');
    return {
      rowNumber,
      transactionDate,
      reference: reference || null,
      direction: debit > 0n ? 'DEBIT' : 'CREDIT',
      amountPaise: debit > 0n ? debit : credit,
      balancePaise: balance,
      currency,
      memo: safeMemo(row.description),
      status: errors.length ? 'REJECTED' : 'ACCEPTED',
      errorCode: errors.length ? errors.join(',') : null,
    };
  });
  return rows;
};

const importBankStatementCsv = async ({ csvText, fileName, accountLabel, importedBy, actorName, requestMeta = {} }) => {
  const rows = parseBankStatementCsv(csvText);
  const safeLabel = String(accountLabel || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
  if (!safeLabel) throw importError('Enter a bank account label (not an account number).', 'BANK_STATEMENT_ACCOUNT_LABEL_REQUIRED');
  if (/\d{6,}/.test(safeLabel)) throw importError('Use a descriptive account label, not an account number.', 'BANK_STATEMENT_ACCOUNT_LABEL_INVALID');
  const safeFileName = path.basename(String(fileName || 'statement.csv').replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\d{6,}/g, '[REDACTED]').slice(0, 120) || 'statement.csv';
  const fileSha256 = crypto.createHash('sha256').update(csvText, 'utf8').digest('hex');
  const acceptedRows = rows.filter((row) => row.status === 'ACCEPTED').length;
  const rejectedRows = rows.length - acceptedRows;
  const status = acceptedRows && rejectedRows ? 'PARTIAL' : acceptedRows ? 'IMPORTED' : 'REJECTED';
  const duplicate = await prisma.bankStatementImport.findUnique({ where: { fileSha256 } });
  if (duplicate) throw importError('This statement file was already imported.', 'BANK_STATEMENT_DUPLICATE_FILE');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const imported = await tx.bankStatementImport.create({
        data: { accountLabel: safeLabel, fileName: safeFileName, fileSha256, status, totalRows: rows.length, acceptedRows, rejectedRows, importedBy },
      });
      for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
        await tx.bankStatementRow.createMany({
          data: rows.slice(offset, offset + INSERT_BATCH_SIZE).map((row) => ({ importId: imported.id, ...row })),
        });
      }
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: importedBy, actorName,
        action: 'BANK_STATEMENT_IMPORTED', resource: 'bank_statement_import', resourceId: imported.id,
        description: `Bank statement ${status.toLowerCase()} with ${acceptedRows} accepted and ${rejectedRows} rejected rows`,
        metadata: { status, accountLabel: safeLabel, fileName: safeFileName, totalRows: rows.length, acceptedRows, rejectedRows },
        ...requestMeta,
      });
      return imported;
    }, { maxWait: 5_000, timeout: 30_000 });
    return { ...result, acceptedRows, rejectedRows, totalRows: rows.length };
  } catch (error) {
    if (error?.code === 'P2002') {
      throw importError('This statement file was already imported.', 'BANK_STATEMENT_DUPLICATE_FILE');
    }
    throw error;
  }
};

const previewBankStatementCsv = ({ csvText }) => {
  const rows = parseBankStatementCsv(csvText);
  const acceptedRows = rows.filter((row) => row.status === 'ACCEPTED').length;
  const rejectedRows = rows.length - acceptedRows;
  return {
    totalRows: rows.length,
    acceptedRows,
    rejectedRows,
    errors: rows.filter((row) => row.status === 'REJECTED').slice(0, 100).map(({ rowNumber, errorCode }) => ({ rowNumber, errorCode })),
    preview: rows.filter((row) => row.status === 'ACCEPTED').slice(0, 10).map((row) => ({
      rowNumber: row.rowNumber,
      transactionDate: row.transactionDate,
      direction: row.direction,
      amountPaise: row.amountPaise.toString(),
      balancePaise: row.balancePaise?.toString() ?? null,
      reference: row.reference,
    })),
  };
};

const listBankStatementImports = async ({ limit = 50 } = {}) => prisma.bankStatementImport.findMany({
  orderBy: { importedAt: 'desc' },
  take: Math.max(1, Math.min(100, Number(limit) || 50)),
  select: { id: true, accountLabel: true, fileName: true, status: true, totalRows: true, acceptedRows: true, rejectedRows: true, importedBy: true, importedAt: true },
});

const getBankStatementImport = async (id) => prisma.bankStatementImport.findUnique({
  where: { id },
  include: { rows: { orderBy: { rowNumber: 'asc' }, take: MAX_ROWS } },
});

module.exports = { getBankStatementImport, importBankStatementCsv, listBankStatementImports, parseBankStatementCsv, previewBankStatementCsv };
