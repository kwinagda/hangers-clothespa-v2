// ─────────────────────────────────────────────────────────────────────────────
// RBAC MIDDLEWARE — Role-Based Access Control for Staff
// Usage: router.get('/finance', staffAuth, requireRole('SUPER_ADMIN','MANAGER'), handler)
// Usage: router.post('/orders', staffAuth, requirePermission('orders.create'), handler)
// ─────────────────────────────────────────────────────────────────────────────

const { forbidden } = require('../utils/response');
const { log, getRequestMeta } = require('../services/activity.service');
const { buildStaffAccessContext, hasResolvedPermission, hasResolvedServiceAccess } = require('../services/accessControl.service');

/**
 * Check if a staff member has a specific permission
 * Checks: 1. Wildcard (*), 2. Custom overrides, 3. Role defaults
 */
const hasPermission = (staff, permission) => {
  if (staff?.effectivePermissions) {
    return hasResolvedPermission(staff, permission);
  }

  const customPerms  = (staff.permissions || []).map(p => ({ perm: p.permission, granted: p.granted }));

  // Check custom overrides first (per-staff grants/revocations)
  const customOverride = customPerms.find(p => p.perm === permission);
  if (customOverride) return customOverride.granted;

  return false;
};

const logAccessDenied = (req, description, metadata = {}) => {
  const { auditStatus, ...restMetadata } = metadata;
  log({
    actorType: req.staff ? 'staff' : 'system',
    actorId: req.staff?.id,
    actorName: req.staff?.name,
    action: 'ACCESS_DENIED',
    status: auditStatus || 'DENIED',
    resource: req.originalUrl || req.path || 'route',
    resourceId: req.params?.id || null,
    description,
    metadata: {
      method: req.method,
      path: req.originalUrl || req.path,
      role: req.staff?.role || null,
      ...restMetadata,
    },
    ...getRequestMeta(req),
  }).catch(() => {});
};

/**
 * Middleware: require one of the specified roles
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.staff) {
      logAccessDenied(req, 'Role-protected route hit without staff authentication', { requiredRoles: roles });
      return forbidden(res, 'Staff authentication required');
    }
    if (roles.includes(req.staff.role)) return next();
    logAccessDenied(req, `Role check failed for ${req.staff.role}`, { requiredRoles: roles });
    return forbidden(res, `This action requires one of these roles: ${roles.join(', ')}`);
  };
};

/**
 * Middleware: require a specific permission
 * @param {string} permission - Required permission string
 */
const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.staff) {
      logAccessDenied(req, 'Permission-protected route hit without staff authentication', { requiredPermission: permission, auditStatus: 'DENIED' });
      return forbidden(res, 'Staff authentication required');
    }
    if (!req.staff.effectivePermissions) {
      const access = await buildStaffAccessContext(req.staff);
      req.staff.effectivePermissions = access.permissions;
      req.staff.serviceAccess = access.services;
    }
    if (hasResolvedPermission(req.staff, permission)) return next();
    logAccessDenied(req, `Permission check failed for ${permission}`, { requiredPermission: permission, auditStatus: 'DENIED' });
    return forbidden(res, `Missing permission: ${permission}`);
  };
};

const requireServiceAccess = (serviceCode) => {
  return async (req, res, next) => {
    if (!req.staff) {
      logAccessDenied(req, 'Service-protected route hit without staff authentication', { requiredService: serviceCode, auditStatus: 'DENIED' });
      return forbidden(res, 'Staff authentication required');
    }
    if (!req.staff.serviceAccess) {
      const access = await buildStaffAccessContext(req.staff);
      req.staff.effectivePermissions = access.permissions;
      req.staff.serviceAccess = access.services;
    }
    if (hasResolvedServiceAccess(req.staff, serviceCode) || hasResolvedPermission(req.staff, '*')) return next();
    logAccessDenied(req, `Service access check failed for ${serviceCode}`, { requiredService: serviceCode, auditStatus: 'DENIED' });
    return forbidden(res, `Missing service access: ${serviceCode}`);
  };
};

/**
 * Middleware: require SUPER_ADMIN role
 */
const superAdminOnly = requireRole('SUPER_ADMIN');

module.exports = { requireRole, requirePermission, requireServiceAccess, hasPermission, superAdminOnly };
