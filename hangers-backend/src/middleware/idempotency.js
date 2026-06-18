// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY MIDDLEWARE
//
// Clients include an X-Idempotency-Key header on payment / wallet mutation
// requests. If the server has seen this key before (within TTL), it returns
// the original cached response instead of re-executing the handler.
//
// Storage: in-process Map (suitable for single-node; swap for Redis when
// deploying multiple replicas).
//
// Usage — apply to payment-mutating routes only:
//   router.post('/payments', idempotent(), paymentsController.record);
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// { key -> { status, body, expiresAt } }
const cache = new Map();

// Evict expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}, 10 * 60 * 1000);

function idempotent() {
  return (req, res, next) => {
    const key = req.headers['x-idempotency-key'];
    if (!key) return next(); // header optional — skip if absent

    if (typeof key !== 'string' || key.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'X-Idempotency-Key must be a string ≤ 128 characters',
      });
    }

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      // Return original response, mark as replayed
      res.set('X-Idempotency-Replayed', 'true');
      return res.status(cached.status).json(cached.body);
    }

    // Intercept the outgoing response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Only cache successful mutations (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, {
          status:    res.statusCode,
          body,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { idempotent };
