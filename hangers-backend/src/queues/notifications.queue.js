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

const { Queue, Worker, UnrecoverableError } = require('bullmq');
const { getConnection, isRedisAvailable } = require('./connection');

const QUEUE_NAME = 'notifications';
const DLQ_NAME = 'notifications:dead-letter';

const JOB_TYPE = Object.freeze({
  ORDER_STATUS:  'ORDER_STATUS',
  DELIVERY_OTP:  'DELIVERY_OTP',
  PUSH:          'PUSH',
});

// ── Lazy-initialised queue instance ──────────────────────────────────────────
let queue = null;
let deadLetterQueue = null;
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

function getDeadLetterQueue() {
  if (deadLetterQueue) return deadLetterQueue;
  const conn = getConnection();
  if (!conn) return null;
  deadLetterQueue = new Queue(DLQ_NAME, {
    connection: conn,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  });
  return deadLetterQueue;
}

const classifyError = (err) => {
  const unrecoverable = err instanceof UnrecoverableError || err?.name === 'UnrecoverableError';
  return {
    retryable: unrecoverable ? false : err?.retryable !== false,
    code: err?.code || err?.name || 'NOTIFICATION_FAILURE',
  };
};

async function performNotification(type, data, options = {}) {
  if (type === JOB_TYPE.ORDER_STATUS) {
    const { sendOrderStatusMessage } = require('../services/whatomate.service');
    const sent = await sendOrderStatusMessage(data.order, data.status, options);
    if (!sent && options.throwOnFailure) throw new Error(`Order status notification was not sent for ${data?.order?.orderNumber || 'order'}`);
    return sent;
  }
  if (type === JOB_TYPE.DELIVERY_OTP) {
    const { sendDeliveryOtp } = require('../services/whatsapp-otp.service');
    const sent = await sendDeliveryOtp(data.phone, data.name, data.orderNumber, data.otp);
    if (!sent && options.throwOnFailure) throw new Error(`Delivery OTP was not sent for ${data?.orderNumber || 'order'}`);
    return sent;
  }
  if (type === JOB_TYPE.PUSH) {
    const { sendPushNotification } = require('../services/push.service');
    const sent = await sendPushNotification(data.token, data.title, data.body, data.payload, options);
    if (!sent && options.throwOnFailure) throw new Error('Push notification was not sent');
    return sent;
  }
  const error = new Error(`Unknown notification job type: ${type}`);
  error.retryable = false;
  error.code = 'UNKNOWN_NOTIFICATION_JOB';
  throw error;
}

// ── Direct (synchronous) fallback — used only when Redis is unavailable ───────
async function directFallback(type, data) {
  try {
    return await performNotification(type, data, { throwOnFailure: false });
  } catch (err) {
    console.error(`[notifications] directFallback error for ${type}:`, err.message);
    return false;
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

async function moveToDeadLetter(job, err) {
  const dlq = getDeadLetterQueue();
  if (!dlq || !job) return;
  const classification = classifyError(err);
  await dlq.add(job.name, {
    originalQueue: QUEUE_NAME,
    originalJobId: job.id,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts || 1,
    error: {
      name: err?.name || 'Error',
      message: err?.message || 'Notification job failed',
      code: classification.code,
      retryable: classification.retryable,
    },
    data: job.data,
  });
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
      try {
        await performNotification(job.name, job.data, { throwOnFailure: true });
      } catch (err) {
        const classification = classifyError(err);
        if (!classification.retryable) {
          throw new UnrecoverableError(err.message || 'Permanent notification failure');
        }
        throw err;
      }
    },
    {
      connection: conn,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[notifications-worker] job ${job?.id} failed:`, err.message);
    const attempts = job?.opts?.attempts || 1;
    if (job && (err instanceof UnrecoverableError || job.attemptsMade >= attempts)) {
      moveToDeadLetter(job, err).catch((dlqErr) => {
        console.error(`[notifications-worker] failed to move job ${job.id} to DLQ:`, dlqErr.message);
      });
    }
  });

  worker.on('completed', (job) => {
    console.info(`[notifications-worker] job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

module.exports = {
  enqueueNotification,
  startNotificationsWorker,
  JOB_TYPE,
  _internals: {
    classifyError,
    directFallback,
    performNotification,
    moveToDeadLetter,
  },
};
