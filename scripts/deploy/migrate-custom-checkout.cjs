#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const reviewed = Object.freeze({
  '20260930160000_razorpay_saved_cards': '32ff94f560b1204d9bf9e886bb33257f2b07e5f003ed63adad3e2ea029a00754',
  '20260930170000_razorpay_virtual_account_bindings': 'd748327afd154fc36f5a5bdf1197cd75dd0208b2aa16eeaf43d6ff521bfa2f2f',
  '20261002120000_razorpay_payment_journey_events': '389bae9491c40f4e0fc3aa78641c86ad9049945aec4146582bec7a436d9bc22e',
});

function assertReleaseScope(revision, currentMain, databaseUrl, history, expected) {
  if (!/^[a-f0-9]{40}$/.test(revision || '') || revision !== currentMain) throw new Error('Exact current-main revision required');
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== 'localhost' || url.pathname !== '/hangers_prod') throw new Error('Unexpected production database target');
  if (history.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Resolve existing failed migration first');
  const completed = new Map(history.filter(row => row.finished_at && !row.rolled_back_at).map(row => [row.migration_name, row.checksum]));
  for (const [name, hash] of Object.entries(reviewed)) {
    if (!expected.includes(name)) throw new Error('Reviewed migration absent from revision');
    if (completed.has(name) && completed.get(name) !== hash) throw new Error('Applied migration checksum differs from review');
  }
  const pending = expected.filter(name => !completed.has(name));
  if (pending.some(name => !Object.hasOwn(reviewed, name))) throw new Error('Other pending migrations require separate approval');
  return pending;
}

async function main() {
  process.umask(0o077);
  if (process.argv[3] !== '--approved-custom-schema') throw new Error('Explicit Custom schema approval required');
  const root = '/opt/hangers';
  const revision = process.argv[2];
  const run = (bin, args, options = {}) => execFileSync(bin, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, ...options });
  const backendRequire = createRequire(`${root}/hangers-backend/package.json`);
  backendRequire('dotenv').config({ path: `${root}/hangers-backend/.env` });
  const db = new (backendRequire('@prisma/client').PrismaClient)();
  let temp;
  try {
    const currentMain = run('git', ['rev-parse', 'origin/main']).toString().trim();
    const expected = run('git', ['ls-tree', '--name-only', `${revision}:hangers-backend/prisma/migrations`]).toString().trim().split('\n').filter(name => /^\d{14}_/.test(name));
    const identity = await db.$queryRaw`SELECT current_database() AS name`;
    if (identity[0]?.name !== 'hangers_prod') throw new Error('Connected database is not production');
    const history = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const pending = assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, history, expected);
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-custom-migration-'));
    run('tar', ['-x', '-C', temp], { input: run('git', ['archive', revision, 'hangers-backend/prisma']), stdio: ['pipe', 'pipe', 'pipe'] });
    for (const [name, hash] of Object.entries(reviewed)) {
      const sql = fs.readFileSync(path.join(temp, 'hangers-backend/prisma/migrations', name, 'migration.sql'));
      if (crypto.createHash('sha256').update(sql).digest('hex') !== hash) throw new Error('Migration SQL differs from review');
    }
    if (pending.length) {
      const url = new URL(process.env.DATABASE_URL);
      const backup = path.join('/var/backups/hangers', `before-custom-checkout-${Date.now()}.dump`);
      const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: 'hangers_prod', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10' };
      run('pg_dump', ['--format=custom', '--file', backup], { env });
      fs.chmodSync(backup, 0o600);
      if (fs.statSync(backup).size < 100) throw new Error('Backup is empty');
      run('pg_restore', ['--list', backup]);
      console.log(`Verified Custom schema backup: ${backup}`);
      run(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(temp, 'hangers-backend/prisma/schema.prisma')], { env: { ...process.env, PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' } });
    }
    const after = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    if (assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, after, expected).length) throw new Error('Custom migrations remain pending');
    const columns = await db.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('razorpay_checkout_attempts', 'razorpay_saved_card_customers', 'razorpay_saved_card_consents', 'razorpay_virtual_account_bindings', 'razorpay_payment_journey_events')`;
    for (const [table, fields] of Object.entries({ razorpay_checkout_attempts: ['paymentJourneyId'], razorpay_saved_card_customers: ['customerId', 'mode', 'credentialFingerprint', 'razorpayCustomerId', 'verifiedAt'], razorpay_saved_card_consents: ['customerId', 'requestId', 'wordingVersion', 'granted', 'consumedAt'], razorpay_virtual_account_bindings: ['attemptId', 'virtualAccountId', 'providerOrderId', 'accountId', 'amountPaise'], razorpay_payment_journey_events: ['paymentJourneyId', 'checkoutAttemptId', 'requestId', 'traceId', 'spanId', 'eventName', 'outcome', 'razorpayOrderId', 'razorpayPaymentId', 'diagnostics'] })) {
      if (fields.some(field => !columns.some(row => row.table_name === table && row.column_name === field))) throw new Error('Custom schema column verification failed');
    }
    console.log('CUSTOM_CHECKOUT_MIGRATION_COMPLETE');
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    await db.$disconnect();
  }
}

module.exports = { reviewed, assertReleaseScope };
if (require.main === module) main().catch(error => {
  console.error('Custom checkout migration failed:', error.status !== undefined ? `command exited ${error.status}` : error.message);
  process.exitCode = 1;
});
