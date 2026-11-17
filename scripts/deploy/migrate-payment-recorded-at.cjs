#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const root = '/opt/hangers';
const migration = '20261117130000_payment_recorded_at';
const reviewedChecksum = '375de262288c132bae0b4538e41945e62d6e33289af7d2cbe9e2855211ef85d1';

function assertReleaseScope(revision, currentMain, databaseUrl, history, expected) {
  if (!/^[a-f0-9]{40}$/.test(revision || '') || revision !== currentMain) throw new Error('Exact current-main revision required');
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== 'localhost' || url.pathname !== '/hangers_prod') {
    throw new Error('Unexpected production database target');
  }
  if (history.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Resolve existing failed migration first');
  if (!expected.includes(migration)) throw new Error('Reviewed migration absent from revision');
  const expectedNames = new Set(expected);
  if (history.some(row => row.finished_at && !row.rolled_back_at && !expectedNames.has(row.migration_name))) {
    throw new Error('Database contains a migration absent from this revision');
  }

  const completed = new Map(history
    .filter(row => row.finished_at && !row.rolled_back_at)
    .map(row => [row.migration_name, row.checksum]));
  if (completed.has(migration) && completed.get(migration) !== reviewedChecksum) {
    throw new Error('Applied migration checksum differs from review');
  }
  const pending = expected.filter(name => !completed.has(name));
  if (pending.some(name => name !== migration)) throw new Error('Other pending migrations require separate approval');
  return pending;
}

function verifyReviewedSql(sql) {
  const actual = crypto.createHash('sha256').update(sql).digest('hex');
  if (actual !== reviewedChecksum) throw new Error('Migration SQL differs from the reviewed payment recorded-time change');
}

async function verifySchema(db) {
  const columns = await db.$queryRaw`SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'recordedAt'`;
  if (columns.length !== 1 || columns[0].data_type !== 'timestamp without time zone'
    || columns[0].is_nullable !== 'YES' || !String(columns[0].column_default || '').toUpperCase().includes('CURRENT_TIMESTAMP')) {
    throw new Error('Payment recordedAt column verification failed');
  }
}

async function main() {
  process.umask(0o077);
  if (process.argv[3] !== '--approved-payment-recorded-at') throw new Error('Explicit payment recorded-time migration approval required');
  const revision = process.argv[2];
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('An exact reviewed revision is required');

  const backendRequire = createRequire(`${root}/hangers-backend/package.json`);
  backendRequire('dotenv').config({ path: `${root}/hangers-backend/.env` });
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.protocol !== 'postgresql:' || url.hostname !== 'localhost' || url.pathname !== '/hangers_prod') {
    throw new Error('Unexpected production database target');
  }
  const { PrismaClient } = backendRequire('@prisma/client');
  const db = new PrismaClient();
  const run = (bin, args, options = {}) => execFileSync(bin, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
    ...options,
  });

  let temp;
  try {
    const currentMain = run('git', ['rev-parse', 'origin/main']).toString().trim();
    if (currentMain !== revision) throw new Error('Revision is not origin/main');
    const identity = await db.$queryRaw`SELECT current_database() AS name`;
    if (identity[0]?.name !== 'hangers_prod') throw new Error('Connected database is not production');

    const history = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const expected = run('git', ['ls-tree', '--name-only', `${revision}:hangers-backend/prisma/migrations`])
      .toString().trim().split('\n').filter(name => /^\d{14}_/.test(name));
    const pending = assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, history, expected);
    if (!pending.length) {
      await verifySchema(db);
      console.log('PAYMENT_RECORDED_AT_MIGRATION_ALREADY_APPLIED');
      return;
    }

    const existingColumn = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'recordedAt'`;
    if (existingColumn.length) throw new Error('Payment recordedAt exists while the migration is pending');

    const backupDir = '/var/backups/hangers';
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDir, `before-payment-recorded-at-${Date.now()}.dump`);
    const pgEnv = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGCONNECT_TIMEOUT: '10',
    };
    run('pg_dump', ['--format=custom', '--file', backup], { env: pgEnv });
    fs.chmodSync(backup, 0o600);
    if (fs.statSync(backup).size < 100) throw new Error('Backup is empty');
    run('pg_restore', ['--list', backup]);
    console.log(`Verified pre-migration backup: ${backup}`);

    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-payment-recorded-at-'));
    const archive = run('git', ['archive', revision, 'hangers-backend/prisma']);
    run('tar', ['-x', '-C', temp], { input: archive, stdio: ['pipe', 'pipe', 'pipe'] });
    const prismaDir = path.join(temp, 'hangers-backend/prisma');
    const sqlPath = path.join(prismaDir, 'migrations', migration, 'migration.sql');
    verifyReviewedSql(fs.readFileSync(sqlPath));
    run(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(prismaDir, 'schema.prisma')], {
      env: { ...process.env, PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' },
    });

    await verifySchema(db);
    const afterHistory = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    if (assertReleaseScope(revision, currentMain, process.env.DATABASE_URL, afterHistory, expected).length) {
      throw new Error('Payment recorded-time migration remains pending');
    }
    console.log('PAYMENT_RECORDED_AT_MIGRATION_COMPLETE');
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    await db.$disconnect();
  }
}

module.exports = { assertReleaseScope, migration, reviewedChecksum, verifyReviewedSql };

if (require.main === module) main().catch(error => {
  const safeDetail = error.status !== undefined ? `command exited ${error.status}` : error.code || error.name || 'unexpected error';
  console.error('Payment recorded-time migration failed:', safeDetail);
  process.exitCode = 1;
});
