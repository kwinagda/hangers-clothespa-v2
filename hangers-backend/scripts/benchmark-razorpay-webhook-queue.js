const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
require('dotenv').config();

const parsePositiveInteger = (value, fallback, max) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`Expected an integer from 1 to ${max}`);
  return parsed;
};

const assertLocalBenchmarkTarget = () => {
  if (process.env.RAZORPAY_WEBHOOK_BENCH_CONFIRM !== 'local-only') {
    throw new Error('Set RAZORPAY_WEBHOOK_BENCH_CONFIRM=local-only to authorize this synthetic local benchmark');
  }
  if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL) {
    throw new Error('Benchmark requires a configured non-production database');
  }
  const url = new URL(process.env.DATABASE_URL);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(url.hostname)) throw new Error('Benchmark refuses non-local database hosts');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database !== process.env.RAZORPAY_WEBHOOK_BENCH_DATABASE) {
    throw new Error('Set RAZORPAY_WEBHOOK_BENCH_DATABASE to the exact local database name');
  }
  return { host: url.hostname, database };
};

const percentile = (sortedValues, fraction) => {
  if (!sortedValues.length) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];
};

const main = async () => {
  const target = assertLocalBenchmarkTarget();
  const count = parsePositiveInteger(process.env.RAZORPAY_WEBHOOK_BENCH_EVENTS, 1000, 5000);
  const concurrency = parsePositiveInteger(process.env.RAZORPAY_WEBHOOK_CONCURRENCY, 4, 20);
  const syntheticDelayMs = parsePositiveInteger(process.env.RAZORPAY_WEBHOOK_BENCH_DELAY_MS, 15, 1000);
  process.env.NODE_ENV = 'test';
  const prisma = require('../src/config/database');
  const { processRazorpayWebhookBatch } = require('../src/services/razorpay-webhook-worker.service');
  const runId = crypto.randomUUID();
  const eventIds = Array.from({ length: count }, (_, index) => `BENCH-RZP-${runId}-${index}`);
  const startedAt = performance.now();

  try {
    await prisma.razorpayWebhookEvent.createMany({
      data: eventIds.map((eventId) => ({
        eventId,
        event: 'benchmark.synthetic',
        payloadHash: crypto.createHash('sha256').update(eventId).digest('hex'),
        payload: {},
        status: 'RECEIVED',
        nextAttemptAt: new Date(),
      })),
    });
    const records = await prisma.razorpayWebhookEvent.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, eventId: true },
      orderBy: { eventId: 'asc' },
    });

    for (let offset = 0; offset < records.length; offset += 20) {
      const batch = records.slice(offset, offset + 20);
      await processRazorpayWebhookBatch({
        limit: batch.length,
        concurrency,
        onlyEventIds: batch.map((record) => record.id),
        processor: async (record) => {
          await new Promise((resolve) => setTimeout(resolve, syntheticDelayMs));
          return { state: 'PROCESSED', paymentId: null, benchmarkEventId: record.eventId };
        },
      });
    }

    const finishedAt = performance.now();
    const results = await prisma.razorpayWebhookEvent.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, status: true, attempts: true, createdAt: true, processedAt: true },
    });
    const agesMs = results
      .filter((record) => record.processedAt)
      .map((record) => record.processedAt.getTime() - record.createdAt.getTime())
      .sort((a, b) => a - b);
    const elapsedSeconds = (finishedAt - startedAt) / 1000;
    const processed = results.filter((record) => record.status === 'PROCESSED' && record.attempts === 1).length;
    const report = {
      scope: 'synthetic local database queue/worker benchmark; no Razorpay API, payment, customer, invoice, or WhatsApp calls',
      target,
      queuedEvents: count,
      processedOnce: processed,
      failedOrUnexpected: count - processed,
      workerConcurrency: concurrency,
      syntheticHandlerDelayMs: syntheticDelayMs,
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      throughputEventsPerSecond: Number((processed / elapsedSeconds).toFixed(2)),
      queueAgeMs: {
        p50: percentile(agesMs, 0.50),
        p95: percentile(agesMs, 0.95),
        max: agesMs.at(-1) || 0,
      },
    };
    console.log(JSON.stringify(report, null, 2));
    if (processed !== count) process.exitCode = 1;
  } finally {
    const stored = await prisma.razorpayWebhookEvent.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true },
    }).catch(() => []);
    const storedIds = stored.map((event) => event.eventId);
    if (storedIds.length) {
      await prisma.activityLog.deleteMany({ where: { resource: 'razorpay_webhook', resourceId: { in: storedIds } } });
      await prisma.auditLog.deleteMany({ where: { resource: 'razorpay_webhook', resourceId: { in: storedIds } } });
      await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId: { in: storedIds } } });
    }
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(`Webhook benchmark stopped safely: ${error.message}`);
  process.exitCode = 1;
});
