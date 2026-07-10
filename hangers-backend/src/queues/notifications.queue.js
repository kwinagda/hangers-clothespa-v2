// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS QUEUE — WhatsApp OTP, order status messages, delivery OTP
//
// Usage:
//   const { enqueueNotification } = require('./queues/notifications.queue');
//   await enqueueNotification('ORDER_STATUS', { order, status });
//
// When Redis is unavailable (local dev without REDIS_URL), the job runs
// synchronously via directFallback so no behaviour is lost.
// ─────────────────────────────────────────────────────────────────────────────

const { Queue, Worker } = require('bullmq');
const { getConnection, isRedisAvailable } = require('./connection');

const QUEUE_NAME = 'notifications';

const JOB_TYPE = Object.freeze({
  ORDER_STATUS:  'ORDER_STATUS',
  DELIVERY_OTP:  'DELIVERY_OTP',
  PUSH:          'PUSH',
});

// ── Lazy-initialised queue instance ──────────────────────────────────────────
let queue = null;
function getQueue() {
  if (queue) return queue;
  const conn = getConnection();
  if (!conn) return null;
  queue = new Queue(QUEUE_NAME, {
    connection:    conn,
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 500 },
    },
  });
  return queue;
}

// ── Direct (synchronous) fallbacks — used when Redis is unavailable ───────────
async function directFallback(type, data) {
  try {
    if (type === JOB_TYPE.ORDER_STATUS) {
      const { sendOrderStatusMessage } = require('../services/whatomate.service');
      await sendOrderStatusMessage(data.order, data.status);
    } else if (type === JOB_TYPE.DELIVERY_OTP) {
      const { sendDeliveryOtp } = require('../services/whatsapp-otp.service');
      await sendDeliveryOtp(data.phone, data.name, data.orderNumber, data.otp);
    } else if (type === JOB_TYPE.PUSH) {
      const { sendPushNotification } = require('../services/push.service');
      await sendPushNotification(data.token, data.title, data.body, data.payload);
    }
  } catch (err) {
    console.error(`[notifications] directFallback error for ${type}:`, err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function enqueueNotification(type, data) {
  const q = getQueue();
  if (!q || !isRedisAvailable()) {
    return directFallback(type, data);
  }
  await q.add(type, data);
}

// ── Worker (started in worker process, not HTTP server) ──────────────────────
function startNotificationsWorker() {
  const conn = getConnection();
  if (!conn) {
    console.warn('[notifications-worker] No Redis — worker not started');
    return;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await directFallback(job.name, job.data);
    },
    {
      connection: conn,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[notifications-worker] job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[notifications-worker] job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

module.exports = { enqueueNotification, startNotificationsWorker, JOB_TYPE };
