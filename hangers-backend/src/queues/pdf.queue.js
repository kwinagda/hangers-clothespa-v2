// ─────────────────────────────────────────────────────────────────────────────
// PDF QUEUE — Quotation and challan PDF generation (Puppeteer is CPU-heavy
// and must not block the HTTP request thread in production).
//
// Each job returns { filePath } or { buffer } depending on the job type.
// ─────────────────────────────────────────────────────────────────────────────

const { Queue, Worker } = require('bullmq');
const { getConnection, isRedisAvailable } = require('./connection');

const QUEUE_NAME = 'pdf';

const JOB_TYPE = Object.freeze({
  QUOTATION: 'QUOTATION',
  CHALLAN:   'CHALLAN',
});

let queue = null;
function getQueue() {
  if (queue) return queue;
  const conn = getConnection();
  if (!conn) return null;
  queue = new Queue(QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 2,
      backoff:  { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 100 },
    },
  });
  return queue;
}

async function directFallback(type, data) {
  if (type === JOB_TYPE.QUOTATION) {
    const { generateQuotationPdf } = require('../services/quotation.pdf.service');
    return generateQuotationPdf(data);
  }
  if (type === JOB_TYPE.CHALLAN) {
    const { generateChallanPdf } = require('../services/challan.pdf.service');
    return generateChallanPdf(data);
  }
  throw new Error(`Unknown PDF job type: ${type}`);
}

async function enqueuePdfJob(type, data) {
  const q = getQueue();
  if (!q || !isRedisAvailable()) {
    return directFallback(type, data);
  }
  const job = await q.add(type, data, { priority: 10 });
  return job.waitUntilFinished(queue.opts.connection, 30_000); // 30s timeout
}

function startPdfWorker() {
  const conn = getConnection();
  if (!conn) {
    console.warn('[pdf-worker] No Redis — worker not started');
    return;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => directFallback(job.name, job.data),
    {
      connection:  conn,
      concurrency: 2, // Puppeteer is memory-heavy; keep concurrency low
    }
  );

  worker.on('failed',    (job, err)  => console.error(`[pdf-worker] job ${job?.id} failed:`, err.message));
  worker.on('completed', (job)       => console.info(`[pdf-worker] job ${job.id} done`));

  return worker;
}

module.exports = { enqueuePdfJob, startPdfWorker, JOB_TYPE };
