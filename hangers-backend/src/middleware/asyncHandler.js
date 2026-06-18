// ─────────────────────────────────────────────────────────────────────────────
// ASYNC HANDLER — wraps async route handlers so thrown errors reach
// Express's global errorHandler instead of causing unhandled rejections.
//
// Usage:
//   router.get('/path', asyncHandler(async (req, res) => { ... }))
// ─────────────────────────────────────────────────────────────────────────────

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
