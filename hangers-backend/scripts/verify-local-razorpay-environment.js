#!/usr/bin/env node
'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { matchesLocalQaConfiguration } = require('../src/utils/local-qa-profile');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const expected = {
  crm: 'http://localhost:5002/login',
  api: 'http://localhost:5001/ready',
  database: 'hangers_db',
  databaseUser: 'postgres',
  databasePort: '5432',
};

function assertLocalConfiguration() {
  if (!matchesLocalQaConfiguration({
    databaseUrl: process.env.DATABASE_URL,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    outboxWorker: process.env.DEV_OUTBOX_WORKER,
    outboxHomeOnly: process.env.DEV_OUTBOX_HOME_ONLY,
    skipStartupSync: process.env.LOCAL_SKIP_STARTUP_SYNC,
  })) {
    throw new Error('Configuration must use postgres@localhost:5432/hangers_db, a Razorpay Test key, a disabled or explicitly Home-only outbox worker, and LOCAL_SKIP_STARTUP_SYNC=true');
  }
}

async function verifyHttp(url, label, validate) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (response.status >= 300 && response.status < 400) throw new Error(`${label} unexpectedly redirected`);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!validate(body)) throw new Error(`${label} did not report healthy`);
}

async function main() {
  assertLocalConfiguration();

  const prisma = new PrismaClient();
  try {
    const [database] = await prisma.$queryRaw`SELECT current_database() AS name, current_user AS username, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    if (database?.name !== expected.database
      || database?.username !== expected.databaseUser
      || !['127.0.0.1', '::1'].includes(database?.address)
      || Number(database?.port) !== Number(expected.databasePort)) {
      throw new Error('Connected database identity does not match postgres@localhost:5432/hangers_db');
    }

    await verifyHttp(expected.api, 'Local API readiness', (body) => (
      body?.success === true
      && body?.data?.ready === true
      && body?.data?.checks?.database === 'ok'
      && body?.data?.checks?.masterData === 'skipped-local-read-only'
      && body?.data?.checks?.permissions === 'skipped-local-read-only'
      && body?.data?.localQaProfileMatches === true
    ));
    await verifyHttp(expected.crm, 'Local CRM login', (body) => (
      typeof body === 'string'
      && body.includes('Hangers Clothes Spa')
      && /<form[^>]*>/i.test(body)
      && /type=["']password["']/i.test(body)
    ));

    process.stdout.write('Local QA target verified: CRM localhost:5002, API localhost:5001, PostgreSQL postgres@localhost:5432/hangers_db, Razorpay TEST.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`Local Razorpay environment verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
