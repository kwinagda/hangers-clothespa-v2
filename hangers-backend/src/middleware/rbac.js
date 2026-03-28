// ─────────────────────────────────────────────────────────────────────────────
// RBAC MIDDLEWARE — Role-Based Access Control for Staff
// Usage: router.get('/finance', staffAuth, requireRole('SUPER_ADMIN','MANAGER'), handler)
// Usage: router.post('/orders', staffAuth, requirePermission('orders.create'), handler)
// ─────────────────────────────────────────────────────────────────────────────

const { forbidden } = require('../utils/response');

// ── Default permissions per role ──────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],   // All permissions

  MANAGER: [
    'dashboard.view',
    'orders.view', 'orders.create', 'orders.edit', 'orders.update_status',
    'orders.delete',
    'customers.view', 'customers.edit',
    'pricing.view', 'pricing.edit', 'pricing.import',
    'finance.view',
    'reports.view',
    'staff.view',
    'plant.view', 'plant.create_challan',
    'delivery.view', 'delivery.assign',
    'whatsapp.send',
    'print.all',
  ],

  COUNTER_STAFF: [
    'dashboard.view',
    'orders.view', 'orders.create', 'orders.update_status',
    'customers.view', 'customers.edit',
    'pricing.view',
    'print.all',
    'plant.create_challan',
  ],

  ACCOUNTS: [
    'dashboard.view',
    'orders.view',
    'customers.view',
    'pricing.view',
    'finance.view', 'finance.edit',
    'reports.view',
  ],

  DELIVERY_MANAGER: [
    'dashboard.view',
    'orders.view', 'orders.update_status',
    'customers.view',
    'delivery.view', 'delivery.assign', 'delivery.edit',
    'reports.delivery',
  ],

  DELIVERY_RIDER: [
    'delivery.own_orders',
    'orders.update_status',
  ],

  PLANT_MANAGER: [
    'plant.view', 'plant.edit', 'plant.update_stage', 'plant.create_challan',
    'plant.reports',
    'orders.view', 'orders.update_status',
    'staff.plant_view',
  ],

  PLANT_STAFF: [
    'plant.view',
    'plant.scan',
    'plant.update_own_stage',
  ],

  PLANT_QC: [
    'plant.view',
    'plant.scan',
    'plant.quality_check',
    'plant.update_stage',
    'plant.reports_limited',
  ],
};

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
