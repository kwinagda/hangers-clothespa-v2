// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY LOG SERVICE — Log every action for full audit trail
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');

const buildEventData = ({
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
}) => ({
  activity: {
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
  },
  audit: {
    actorType,
    actorId: actorId || null,
    actorName: actorName || null,
    action,
    status,
    resource: resource || null,
    resourceId: resourceId || null,
    description,
    metadata: metadata || null,
    route: route || null,
    method: method || null,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  },
});

/**
 * Writes the operational activity row and canonical audit row through an
 * existing Prisma transaction. Critical mutations must use this function so
 * the business write cannot commit without its audit evidence.
 */
const writeAuditEvent = async (tx, event) => {
  if (!tx) throw new Error('writeAuditEvent requires a Prisma transaction client');
  const data = buildEventData(event);
  const activity = await tx.activityLog.create({ data: data.activity });
  const audit = await tx.auditLog.create({ data: data.audit });
  return { activity, audit };
};

/**
 * Best-effort logging remains available for non-mutating events such as access
 * denials. Business mutations must call writeAuditEvent inside their own tx.
 */
const log = async (event) => {
  try {
    await prisma.$transaction((tx) => writeAuditEvent(tx, event));
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
  requestId: req.id || req.headers['x-request-id'] || null,
});

module.exports = { buildEventData, log, writeAuditEvent, getRequestMeta };
