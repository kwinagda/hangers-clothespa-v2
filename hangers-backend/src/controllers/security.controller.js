const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { SERVICE_CODES } = require('../config/master-data');
const { log, getRequestMeta } = require('../services/activity.service');

const listAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;
    const where = {};
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.status) where.status = String(req.query.status);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return success(res, {
      logs,
      pagination: { total, page, limit },
    });
  } catch (err) {
    return error(res, 'Failed to fetch audit logs');
  }
};

const listAuthThrottles = async (req, res) => {
  try {
    const where = {};
    if (req.query.scope) where.scope = String(req.query.scope);
    const throttles = await prisma.authThrottle.findMany({
      where,
      orderBy: [{ blockedUntil: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return success(res, { throttles });
  } catch (err) {
    return error(res, 'Failed to fetch auth throttles');
  }
};

const getAccessCatalog = async (req, res) => {
  try {
    const [permissions, serviceAllowances] = await Promise.all([
      prisma.permissionCatalog.findMany({
        include: { roleBindings: true },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      }),
      prisma.staffServiceAllowance.findMany({
        orderBy: [{ staffId: 'asc' }, { serviceCode: 'asc' }],
      }),
    ]);

    return success(res, {
      permissions,
      services: SERVICE_CODES,
      serviceAllowances,
    });
  } catch (err) {
    return error(res, 'Failed to fetch access catalog');
  }
};

const updateStaffServiceAccess = async (req, res) => {
  const { id: staffId } = req.params;
  const services = Array.isArray(req.body?.services) ? req.body.services : null;
  if (!services) return badRequest(res, 'services array is required');

  const invalid = services.find((entry) => !SERVICE_CODES.includes(String(entry?.serviceCode || '')) || typeof entry?.allowed !== 'boolean');
  if (invalid) return badRequest(res, 'Each service entry must include a valid serviceCode and boolean allowed value');

  try {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, name: true } });
    if (!staff) return badRequest(res, 'Staff not found');

    await prisma.$transaction(async (tx) => {
      for (const entry of services) {
        await tx.staffServiceAllowance.upsert({
          where: { staffId_serviceCode: { staffId, serviceCode: entry.serviceCode } },
          update: { allowed: entry.allowed },
          create: { staffId, serviceCode: entry.serviceCode, allowed: entry.allowed },
        });
      }
    });

    await log({
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'STAFF_SERVICE_ACCESS_UPDATED',
      resource: 'staff',
      resourceId: staffId,
      description: `Updated service access for ${staff.name}`,
      metadata: { services },
      ...getRequestMeta(req),
    });

    return success(res, { staffId, services }, 'Service access updated');
  } catch (err) {
    return error(res, 'Failed to update staff service access');
  }
};

module.exports = {
  getAccessCatalog,
  listAuditLogs,
  listAuthThrottles,
  updateStaffServiceAccess,
};
