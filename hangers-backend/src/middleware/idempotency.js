const crypto = require('crypto');
const prisma = require('../config/database');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
};

const requestFingerprint = (req) => crypto.createHash('sha256').update(JSON.stringify({
  method: req.method,
  path: String(req.originalUrl || req.path || '').split('?')[0],
  actorId: req.staff?.id || req.customer?.id || null,
  body: stableValue(req.body || {}),
})).digest('hex');

const conflict = (res, message) => res.status(409).json({ success: false, message });

const claimExistingRecord = async (record, now) => {
  if (record.state === 'COMPLETED' && record.responseBody && record.statusCode) return { replay: record };
  if (record.state === 'PROCESSING' && record.lockedUntil > now) return { processing: true };

  const result = await prisma.idempotencyRecord.updateMany({
    where: {
      id: record.id,
      OR: [
        { state: { not: 'PROCESSING' } },
        { lockedUntil: { lte: now } },
      ],
    },
    data: {
      state: 'PROCESSING',
      statusCode: null,
      responseBody: undefined,
      lockedUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
    },
  });
  return result.count === 1 ? { claimed: true } : { processing: true };
};

function idempotent(options = {}) {
  const { required = true, scope: configuredScope, ttlMs = DEFAULT_TTL_MS } = options;

  return async (req, res, next) => {
    const key = req.headers['x-idempotency-key'];
    if (!key) {
      if (!required) return next();
      return res.status(400).json({
        success: false,
        message: 'X-Idempotency-Key is required for this financial mutation',
      });
    }
    if (typeof key !== 'string' || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      return res.status(400).json({
        success: false,
        message: 'X-Idempotency-Key must be 8-128 URL-safe characters',
      });
    }

    const path = String(req.originalUrl || req.path || '').split('?')[0];
    const scope = configuredScope || `${req.method}:${path}`;
    const fingerprint = requestFingerprint(req);
    const now = new Date();
    let record;

    try {
      record = await prisma.idempotencyRecord.create({
        data: {
          scope,
          key,
          actorId: req.staff?.id || req.customer?.id || null,
          requestHash: fingerprint,
          state: 'PROCESSING',
          lockedUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
    } catch (error) {
      if (error?.code !== 'P2002') return next(error);
      record = await prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
      if (!record) return conflict(res, 'The idempotency request is being initialized; retry shortly');
      if (record.requestHash !== fingerprint) {
        return conflict(res, 'This idempotency key was already used with a different request');
      }
      const claim = await claimExistingRecord(record, now);
      if (claim.replay) {
        res.set('X-Idempotency-Replayed', 'true');
        return res.status(claim.replay.statusCode).json(claim.replay.responseBody);
      }
      if (claim.processing) return conflict(res, 'An identical request is still processing');
    }

    req.idempotencyKey = `${scope}:${key}`;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode;
      const persist = statusCode < 500
        ? prisma.idempotencyRecord.update({
            where: { id: record.id },
            data: {
              state: 'COMPLETED',
              statusCode,
              responseBody: body,
              lockedUntil: now,
            },
          })
        : prisma.idempotencyRecord.update({
            where: { id: record.id },
            data: { state: 'FAILED', statusCode, lockedUntil: now },
          });

      persist.catch((error) => {
        console.error('Idempotency result persistence failed:', error?.message || error);
      });
      return originalJson(body);
    };

    return next();
  };
}

module.exports = { idempotent, requestFingerprint, stableValue };
