#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const migrationName = '20261005120000_razorpay_duplicate_capture_refunds';
const migrationHash = '26bf1af423c1f43888dc0e8d502b200dfc6edd420e8c1a02fa7ce45ea952cbcc';
const requiredColumns = [
  ['Payment', 'unallocatedAmount', 'numeric', 'NO'],
  ['razorpay_checkout_attempts', 'supersedesAttemptId', 'text', 'YES'],
  ['razorpay_checkout_attempts', 'allocatedAmountPaise', 'bigint', 'YES'],
  ['razorpay_checkout_attempts', 'unallocatedAmountPaise', 'bigint', 'YES'],
  ['razorpay_refund_attempts', 'checkoutAttemptId', 'text', 'YES'],
  ['razorpay_refund_attempts', 'automatic', 'boolean', 'NO'],
  ['razorpay_refund_attempts', 'attemptCount', 'integer', 'NO'],
  ['razorpay_refund_attempts', 'nextAttemptAt', 'timestamp without time zone', 'NO'],
  ['razorpay_refund_attempts', 'lockedAt', 'timestamp without time zone', 'YES'],
  ['razorpay_refund_attempts', 'orderId', 'text', 'YES'],
  ['razorpay_refund_attempts', 'invoiceId', 'text', 'YES'],
  ['razorpay_refund_attempts', 'createdById', 'text', 'YES'],
];

function isMigrationSchemaComplete(columns, indexes) {
  if (columns.length !== requiredColumns.length || !indexes.some((row) => row.indexname === 'razorpay_refund_attempts_automatic_status_nextAttemptAt_idx')) return false;
  return requiredColumns.every(([table, column, dataType, nullable]) => columns.some((row) => (
    row.table_name === table && row.column_name === column && row.data_type === dataType && row.is_nullable === nullable
  )));
}

function assertReleaseScope(revision, currentMain, databaseUrl, history, expected) {
  if (!/^[a-f0-9]{40}$/.test(revision || '') || revision !== currentMain) {
    throw new Error('Exact current-main revision required');
  }
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== 'localhost' || url.pathname !== '/hangers_prod') {
    throw new Error('Unexpected production database target');
  }
  if (!expected.includes(migrationName)) throw new Error('Reviewed migration absent from revision');
  if (history.some((row) => !row.finished_at && !row.rolled_back_at)) {
    throw new Error('Resolve existing failed migration first');
  }
  const applied = history.find((row) => row.migration_name === migrationName && row.finished_at && !row.rolled_back_at);
  if (applied && applied.checksum !== migrationHash) throw new Error('Applied migration checksum differs from review');
  return !history.some((row) => row.migration_name === migrationName && row.finished_at && !row.rolled_back_at);
}

async function main() {
  process.umask(0o077);
  if (process.argv[3] !== '--approved-duplicate-capture-schema') {
    throw new Error('Explicit duplicate-capture schema approval required');
  }

  const root = '/opt/hangers';
  const revision = process.argv[2];
  const run = (bin, args, options = {}) => execFileSync(bin, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
    ...options,
  });
  const backendRequire = createRequire(`${root}/hangers-backend/package.json`);
  backendRequire('dotenv').config({ path: `${root}/hangers-backend/.env` });
  const db = new (backendRequire('@prisma/client').PrismaClient)();
  let temp;
  try {
    const currentMain = run('git', ['rev-parse', 'origin/main']).toString().trim();
    const expected = run('git', ['ls-tree', '--name-only', `${revision}:hangers-backend/prisma/migrations`])
      .toString().trim().split('\n').filter((name) => /^\d{14}_/.test(name));
    const identity = await db.$queryRaw`SELECT current_database() AS name`;
    if (identity[0]?.name !== 'hangers_prod') throw new Error('Connected database is not production');
    const history = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const migrationPending = assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, history, expected);

    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-duplicate-capture-migration-'));
    run('tar', ['-x', '-C', temp], {
      input: run('git', ['archive', revision, 'hangers-backend/prisma']),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const sqlPath = path.join(temp, 'hangers-backend/prisma/migrations', migrationName, 'migration.sql');
    const sql = fs.readFileSync(sqlPath);
    if (crypto.createHash('sha256').update(sql).digest('hex') !== migrationHash) {
      throw new Error('Migration SQL differs from the reviewed schema');
    }

    if (migrationPending) {
      const existingColumns = await db.$queryRaw`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'Payment' AND column_name = 'unallocatedAmount') OR (table_name = 'razorpay_checkout_attempts' AND column_name IN ('supersedesAttemptId', 'allocatedAmountPaise', 'unallocatedAmountPaise')) OR (table_name = 'razorpay_refund_attempts' AND column_name IN ('checkoutAttemptId', 'automatic', 'attemptCount', 'nextAttemptAt', 'lockedAt', 'orderId', 'invoiceId', 'createdById'))) `;
      const existingIndex = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'razorpay_refund_attempts_automatic_status_nextAttemptAt_idx'`;
      const completeSchema = isMigrationSchemaComplete(existingColumns, existingIndex);
      const preexistingFields = new Set(['orderId', 'invoiceId', 'createdById']);
      const migrationFieldsPresent = existingColumns.some((row) => !preexistingFields.has(row.column_name));
      if ((migrationFieldsPresent || existingIndex.length) && !completeSchema) {
        throw new Error('Part of the reviewed migration already exists without a completed migration record');
      }
      const url = new URL(process.env.DATABASE_URL);
      const backup = path.join('/var/backups/hangers', `before-duplicate-capture-refunds-${Date.now()}.dump`);
      const pgEnv = {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: 'hangers_prod',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGCONNECT_TIMEOUT: '10',
        PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000',
      };
      run('pg_dump', ['--format=custom', '--file', backup], { env: pgEnv });
      fs.chmodSync(backup, 0o600);
      if (fs.statSync(backup).size < 100) throw new Error('Backup is empty');
      run('pg_restore', ['--list', backup]);
      console.log(`Verified pre-migration backup: ${backup}`);

      if (!completeSchema) run('psql', ['--single-transaction', '--set', 'ON_ERROR_STOP=1', '--file', sqlPath], { env: pgEnv });
      run(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'resolve', '--applied', migrationName, '--schema', path.join(temp, 'hangers-backend/prisma/schema.prisma')], {
        env: { ...process.env, PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' },
      });
      console.log(`${completeSchema ? 'Reconciled the completed migration record' : 'Applied only the reviewed migration'}; unrelated pending migrations were left untouched.`);
    }

    const after = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    if (assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, after, expected)) {
      throw new Error('Reviewed migration remains pending');
    }
    const columns = await db.$queryRaw`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'Payment' AND column_name = 'unallocatedAmount') OR (table_name = 'razorpay_checkout_attempts' AND column_name IN ('supersedesAttemptId', 'allocatedAmountPaise', 'unallocatedAmountPaise')) OR (table_name = 'razorpay_refund_attempts' AND column_name IN ('checkoutAttemptId', 'automatic', 'attemptCount', 'nextAttemptAt', 'lockedAt', 'orderId', 'invoiceId', 'createdById'))) `;
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'razorpay_refund_attempts_automatic_status_nextAttemptAt_idx'`;
    if (!isMigrationSchemaComplete(columns, indexes)) {
      throw new Error('Duplicate-capture schema verification failed');
    }
    console.log('DUPLICATE_CAPTURE_REFUNDS_MIGRATION_COMPLETE');
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    await db.$disconnect();
  }
}

module.exports = { migrationName, migrationHash, requiredColumns, assertReleaseScope, isMigrationSchemaComplete };
if (require.main === module) main().catch((error) => {
  console.error('Duplicate-capture migration failed:', error.status !== undefined ? `command exited ${error.status}` : error.message);
  process.exitCode = 1;
});
