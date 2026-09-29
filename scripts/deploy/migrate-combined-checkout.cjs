#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = '/opt/hangers';
const backendRequire = createRequire(`${root}/hangers-backend/package.json`);
backendRequire('dotenv').config({ path: `${root}/hangers-backend/.env` });
const { PrismaClient } = backendRequire('@prisma/client');
const db = new PrismaClient();
const migration = '20260929000000_razorpay_checkout_allocation_plan';
const revision = process.argv[2];
const run = (bin, args, options = {}) => execFileSync(bin, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, ...options });

async function main() {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('An exact reviewed revision is required');
  if (run('git', ['rev-parse', 'origin/main']).toString().trim() !== revision) throw new Error('Revision is not origin/main');
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hangers_db') throw new Error('Unexpected production database target');
  const applied = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  if (applied.some((row) => !row.finished_at && !row.rolled_back_at)) throw new Error('Resolve existing failed migration first');
  const completed = new Set(applied.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const expected = run('git', ['ls-tree', '--name-only', `${revision}:hangers-backend/prisma/migrations`]).toString().trim().split('\n').filter((name) => /^\d{14}_/.test(name));
  const pending = expected.filter((name) => !completed.has(name));
  if (pending.some((name) => name !== migration)) throw new Error('Other pending migrations require a separate review');
  if (!pending.length) {
    const columns = await db.$queryRaw`SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'razorpay_checkout_attempts' AND column_name = 'allocationPlan'`;
    if (columns[0]?.data_type !== 'jsonb') throw new Error('Migration history does not match allocation column');
    console.log('COMBINED_CHECKOUT_MIGRATION_ALREADY_APPLIED');
    return;
  }
  const backupDir = '/var/backups/hangers';
  const backup = path.join(backupDir, `before-combined-checkout-${Date.now()}.dump`);
  const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10' };
  run('pg_dump', ['--format=custom', '--file', backup], { env: pgEnv });
  fs.chmodSync(backup, 0o600);
  if (fs.statSync(backup).size < 100) throw new Error('Backup is empty');
  run('pg_restore', ['--list', backup]);
  console.log(`Verified pre-migration backup: ${backup}`);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-combined-migration-'));
  try {
    run('tar', ['-x', '-C', temp], { input: run('git', ['archive', revision, 'hangers-backend/prisma']), stdio: ['pipe', 'pipe', 'pipe'] });
    const sql = fs.readFileSync(path.join(temp, 'hangers-backend/prisma/migrations', migration, 'migration.sql'), 'utf8').trim();
    if (sql !== 'ALTER TABLE "razorpay_checkout_attempts"\nADD COLUMN "allocationPlan" JSONB;') throw new Error('Migration differs from the reviewed additive column');
    run(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(temp, 'hangers-backend/prisma/schema.prisma')], { env: { ...process.env, PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' } });
    const columns = await db.$queryRaw`SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'razorpay_checkout_attempts' AND column_name = 'allocationPlan'`;
    if (columns[0]?.data_type !== 'jsonb') throw new Error('Allocation column verification failed');
    console.log('COMBINED_CHECKOUT_MIGRATION_COMPLETE');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Child-process stderr can contain connection details; never echo it.
  console.error('Combined checkout migration failed:', error.status !== undefined ? `command exited ${error.status}` : error.message);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
