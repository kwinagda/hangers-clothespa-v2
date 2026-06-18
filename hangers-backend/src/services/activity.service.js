// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY LOG SERVICE — Log every action for full audit trail
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');

/**
 * Log an activity — fire and forget (never blocks the main request)
 */
const log = async ({
  actorType,     // 'customer' | 'staff' | 'system'
  actorId,
  actorName,
  action,        // e.g. 'LOGIN', 'ORDER_CREATED', 'OTP_SENT'
  resource,      // e.g. 'order', 'customer', 'staff'
  resourceId,
  description,
  metadata,
  ipAddress,
  userAgent,
  route,
  method,
  status = 'SUCCESS',
}) => {
  try {
    const data = {
      actorType,
      actorId: actorId || null,
      actorName: actorName || null,
      action,
      resource: resource || null,
      resourceId: resourceId || null,
      description,
      metadata: metadata || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    };

    await prisma.$transaction([
      prisma.activityLog.create({ data }),
      prisma.auditLog.create({
        data: {
          ...data,
          status,
          route: route || null,
          method: method || null,
        },
      }),
    ]);
  } catch (err) {
    // Never crash the main request because of a log failure
    console.error('ActivityLog write failed:', err.message);
  }
};

/**
 * Helper: extract IP and User-Agent from Express request
 */
const getRequestMeta = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
  userAgent: req.headers['user-agent'] || null,
  route: req.originalUrl || req.path || null,
  method: req.method || null,
});

module.exports = { log, getRequestMeta };
