require('dotenv').config();

const { randomUUID } = require('crypto');
const { startWorkers } = require('./queues');
const { closeConnection } = require('./queues/connection');
const prisma = require('./config/database');
const { processOutboxBatch } = require('./services/outbox.service');
const { runScheduledFinancialReconciliation } = require('./services/reconciliation.service');
const { processRazorpayWebhookBatch } = require('./services/razorpay-webhook-worker.service');
const { processQueuedRazorpayPaymentReconciliation, runScheduledRazorpayPaymentReconciliation, enqueueScheduledRazorpaySettlementReconciliation } = require('./services/razorpay-payment-reconciliation.service');

const workers = startWorkers();
const instanceId = process.env.WORKER_INSTANCE_ID || randomUUID();
let outboxRunning = false;
let razorpayWebhooksRunning = false;
let razorpayPaymentReconciliationRunning = false;

const heartbeat = async (status = 'RUNNING') => prisma.workerHeartbeat.upsert({
  where: { workerName_instanceId: { workerName: 'crm-background-worker', instanceId } },
  update: {
    instanceId,
    status,
    lastSeenAt: new Date(),
    metadata: { pid: process.pid, hostname: process.env.HOSTNAME || null },
  },
  create: {
    workerName: 'crm-background-worker',
    instanceId,
    status,
    lastSeenAt: new Date(),
    metadata: { pid: process.pid, hostname: process.env.HOSTNAME || null },
  },
});

const drainOutbox = async () => {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    let processed;
    do {
      processed = await processOutboxBatch({ limit: 25 });
    } while (processed === 25);
  } catch (err) {
    console.error('[workers] outbox drain failed:', err?.message || err);
  } finally {
    outboxRunning = false;
  }
};

const drainRazorpayWebhooks = async () => {
  if (razorpayWebhooksRunning) return;
  razorpayWebhooksRunning = true;
  try {
    const configuredConcurrency = Number(process.env.RAZORPAY_WEBHOOK_CONCURRENCY || 4);
    await processRazorpayWebhookBatch({ limit: 20, concurrency: configuredConcurrency });
  } catch (err) {
    console.error('[workers] Razorpay webhook drain failed:', err?.code || 'PROCESSING_ERROR');
  } finally {
    razorpayWebhooksRunning = false;
  }
};

const drainRazorpayPaymentReconciliation = async () => {
  if (razorpayPaymentReconciliationRunning) return;
  razorpayPaymentReconciliationRunning = true;
  try {
    await processQueuedRazorpayPaymentReconciliation();
  } catch (err) {
    console.error('[workers] queued Razorpay reconciliation failed:', err?.code || 'PROVIDER_ERROR');
  } finally {
    razorpayPaymentReconciliationRunning = false;
  }
};

heartbeat().then(() => console.info(`[workers] heartbeat active for ${instanceId}`)).catch((err) => {
  console.error('[workers] initial heartbeat failed:', err?.message || err);
});
const heartbeatTimer = setInterval(() => heartbeat().catch((err) => {
  console.error('[workers] heartbeat failed:', err?.message || err);
}), 30_000);
const outboxTimer = setInterval(drainOutbox, 2_000);
const razorpayWebhookTimer = setInterval(drainRazorpayWebhooks, 1_000);
const razorpayPaymentReconciliationQueueTimer = setInterval(drainRazorpayPaymentReconciliation, 2_000);
const reconciliationTimer = setInterval(() => runScheduledFinancialReconciliation().catch((err) => {
  console.error('[workers] scheduled reconciliation failed:', err?.message || err);
}), 60 * 60 * 1000);
const razorpayPaymentReconciliationTimer = setInterval(() => runScheduledRazorpayPaymentReconciliation().catch((err) => {
  console.error('[workers] scheduled Razorpay reconciliation failed:', err?.code || 'PROVIDER_ERROR');
}), 60 * 60 * 1000);
const razorpaySettlementReconciliationTimer = setInterval(() => enqueueScheduledRazorpaySettlementReconciliation().catch((err) => {
  console.error('[workers] scheduled Razorpay settlement reconciliation failed:', err?.code || 'PROVIDER_ERROR');
}), 15 * 60 * 1000);
drainOutbox();
drainRazorpayWebhooks();
drainRazorpayPaymentReconciliation();
runScheduledFinancialReconciliation().catch((err) => {
  console.error('[workers] initial reconciliation failed:', err?.message || err);
});
runScheduledRazorpayPaymentReconciliation().catch((err) => {
  console.error('[workers] initial Razorpay reconciliation failed:', err?.code || 'PROVIDER_ERROR');
});
enqueueScheduledRazorpaySettlementReconciliation().catch((err) => {
  console.error('[workers] initial Razorpay settlement reconciliation failed:', err?.code || 'PROVIDER_ERROR');
});

const shutdown = async (signal) => {
  console.info(`[workers] ${signal} received, closing workers`);
  try {
    clearInterval(heartbeatTimer);
    clearInterval(outboxTimer);
    clearInterval(razorpayWebhookTimer);
    clearInterval(razorpayPaymentReconciliationQueueTimer);
    clearInterval(reconciliationTimer);
    clearInterval(razorpayPaymentReconciliationTimer);
    clearInterval(razorpaySettlementReconciliationTimer);
    await Promise.all(
      Object.values(workers)
        .filter(Boolean)
        .map((worker) => worker.close())
    );
    await heartbeat('STOPPED').catch(() => {});
    await closeConnection();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[workers] shutdown failed:', err?.message || err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
