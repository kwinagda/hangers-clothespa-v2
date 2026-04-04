// ─────────────────────────────────────────────────────────────────────────────
// RBAC MIDDLEWARE — Role-Based Access Control for Staff
// Usage: router.get('/finance', staffAuth, requireRole('SUPER_ADMIN','MANAGER'), handler)
// Usage: router.post('/orders', staffAuth, requirePermission('orders.create'), handler)
// ─────────────────────────────────────────────────────────────────────────────

const { forbidden } = require('../utils/response');
const { ROLE_PERMISSIONS } = require('../config/master-data');

/**
 * Check if a staff member has a specific permission
 * Checks: 1. Wildcard (*), 2. Custom overrides, 3. Role defaults
 */
const hasPermission = (staff, permission) => {
  const rolePerms    = ROLE_PERMISSIONS[staff.role] || [];
  const customPerms  = (staff.permissions || []).map(p => ({ perm: p.permission, granted: p.granted }));

  // Super admin gets everything
  if (rolePerms.includes('*')) return true;

  // Check custom overrides first (per-staff grants/revocations)
  const customOverride = customPerms.find(p => p.perm === permission);
  if (customOverride) return customOverride.granted;

  // Fall back to role defaults
  return rolePerms.includes(permission);
};

/**
 * Middleware: require one of the specified roles
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.staff) return forbidden(res, 'Staff authentication required');
    if (roles.includes(req.staff.role)) return next();
    return forbidden(res, `This action requires one of these roles: ${roles.join(', ')}`);
  };
};

/**
 * Middleware: require a specific permission
 * @param {string} permission - Required permission string
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.staff) return forbidden(res, 'Staff authentication required');
    if (hasPermission(req.staff, permission)) return next();
    return forbidden(res, `Missing permission: ${permission}`);
  };
};

/**
 * Middleware: require SUPER_ADMIN role
 */
const superAdminOnly = requireRole('SUPER_ADMIN');

module.exports = { requireRole, requirePermission, hasPermission, superAdminOnly, ROLE_PERMISSIONS };
