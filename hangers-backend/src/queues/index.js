// ─────────────────────────────────────────────────────────────────────────────
// QUEUE INDEX — re-exports all queue public APIs and starts workers.
//
// Call startWorkers() once in your worker process (not in the HTTP server).
// ─────────────────────────────────────────────────────────────────────────────

const { enqueueNotification, startNotificationsWorker, JOB_TYPE: NOTIFY_JOB } = require('./notifications.queue');
const { enqueuePdfJob,       startPdfWorker,           JOB_TYPE: PDF_JOB     } = require('./pdf.queue');

function startWorkers() {
  const nWorker = startNotificationsWorker();
  const pWorker = startPdfWorker();
  console.info('[queues] Workers started');
  return { nWorker, pWorker };
}

module.exports = {
  enqueueNotification,
  enqueuePdfJob,
  startWorkers,
  NOTIFY_JOB,
  PDF_JOB,
};
