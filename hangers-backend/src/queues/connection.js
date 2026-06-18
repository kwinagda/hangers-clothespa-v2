// ─────────────────────────────────────────────────────────────────────────────
// QUEUE CONNECTION — shared Redis connection for all BullMQ queues.
//
// Graceful degradation: if REDIS_URL is not set (local dev without Redis),
// queue jobs fall back to synchronous, in-process execution via the
// directFallback exported from each queue module.
// ─────────────────────────────────────────────────────────────────────────────

const { Redis } = require('ioredis');

let connection = null;
let isAvailable = false;

function getConnection() {
  if (connection) return connection;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[queue] REDIS_URL not set — background jobs will run synchronously');
    return null;
  }

  connection = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck:     false,
    lazyConnect:          true,
  });

  connection.on('connect',        () => { isAvailable = true;  console.info('[queue] Redis connected'); });
  connection.on('close',          () => { isAvailable = false; console.warn('[queue] Redis disconnected'); });
  connection.on('error',          (err) => { console.error('[queue] Redis error:', err.message); });
  connection.on('reconnecting',   () => { console.info('[queue] Redis reconnecting...'); });

  connection.connect().catch(() => {}); // non-blocking
  return connection;
}

function isRedisAvailable() {
  return isAvailable;
}

module.exports = { getConnection, isRedisAvailable };
