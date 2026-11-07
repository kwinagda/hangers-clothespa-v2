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
const migration = '20261107120000_service_categories';
const revision = process.argv[2];
const expectedSql = `CREATE TABLE "ServiceCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceCategory_normalizedName_key" ON "ServiceCategory"("normalizedName");`;
const run = (bin, args, options = {}) => execFileSync(bin, args, {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 300000,
  ...options,
});

async function main() {
  process.umask(0o077);
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('An exact reviewed revision is required');
  if (run('git', ['rev-parse', 'origin/main']).toString().trim() !== revision) throw new Error('Revision is not origin/main');

  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hangers_prod') {
    throw new Error('Unexpected production database target');
  }
  const identity = await db.$queryRaw`SELECT current_database() AS name`;
  if (identity[0]?.name !== 'hangers_prod') throw new Error('Connected database is not production');

  const applied = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  if (applied.some((row) => !row.finished_at && !row.rolled_back_at)) throw new Error('Resolve existing failed migration first');
  const completed = new Set(applied.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const expected = run('git', ['ls-tree', '--name-only', `${revision}:hangers-backend/prisma/migrations`])
    .toString().trim().split('\n').filter((name) => /^\d{14}_/.test(name));
  const pending = expected.filter((name) => !completed.has(name));
  if (pending.some((name) => name !== migration)) throw new Error('Other pending migrations require a separate review');

  if (!pending.length) {
    const table = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ServiceCategory'`;
    const columns = new Set(table.map((column) => column.column_name));
    if (!['id', 'name', 'normalizedName', 'createdAt'].every((column) => columns.has(column))) {
      throw new Error('Migration history does not match the ServiceCategory table');
    }
    console.log('SERVICE_CATEGORIES_MIGRATION_ALREADY_APPLIED');
    return;
  }

  const backup = path.join('/var/backups/hangers', `before-service-categories-${Date.now()}.dump`);
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

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-service-categories-'));
  try {
    const archive = run('git', ['archive', revision, 'hangers-backend/prisma']);
    run('tar', ['-x', '-C', temp], { input: archive, stdio: ['pipe', 'pipe', 'pipe'] });
    const sql = fs.readFileSync(path.join(temp, 'hangers-backend/prisma/migrations', migration, 'migration.sql'), 'utf8').trim();
    if (sql !== expectedSql) throw new Error('Migration differs from the reviewed additive category table');

    run(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(temp, 'hangers-backend/prisma/schema.prisma')], {
      env: { ...process.env, PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000' },
    });

    const table = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ServiceCategory'`;
    const columns = new Set(table.map((column) => column.column_name));
    if (!['id', 'name', 'normalizedName', 'createdAt'].every((column) => columns.has(column))) {
      throw new Error('ServiceCategory table verification failed');
    }
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ServiceCategory'`;
    if (!indexes.some((index) => index.indexname === 'ServiceCategory_normalizedName_key')) {
      throw new Error('ServiceCategory uniqueness verification failed');
    }
    console.log('SERVICE_CATEGORIES_MIGRATION_COMPLETE');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Service category migration failed:', error.status !== undefined ? `command exited ${error.status}` : error.message);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
