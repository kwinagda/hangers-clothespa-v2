const prisma = require('../config/database');
const { ROLE_PERMISSIONS, STAFF_ROLE_VALUES } = require('../config/master-data');
const { getRoleServiceAccess, getServiceCodes } = require('./masterData.service');

const unique = (values) => [...new Set(values.filter(Boolean))];

const syncPermissionCatalog = async () => {
  const permissionCodes = unique(
    STAFF_ROLE_VALUES.flatMap((role) => ROLE_PERMISSIONS[role] || [])
  );

  if (!permissionCodes.length) return;

  await prisma.$transaction(async (tx) => {
    for (const code of permissionCodes) {
      const category = code.includes('.') ? code.split('.')[0] : 'general';
      await tx.permissionCatalog.upsert({
        where: { code },
        update: { category },
        create: { code, category, description: `${code} access` },
      });
    }

    for (const role of STAFF_ROLE_VALUES) {
      const permissions = ROLE_PERMISSIONS[role] || [];
      for (const permissionCode of permissions) {
        await tx.staffRolePermission.upsert({
          where: { role_permissionCode: { role, permissionCode } },
          update: {},
          create: { role, permissionCode },
        });
      }
    }
  });
};

const getRolePermissions = async (role) => {
  if (!role) return [];

  const roleBindings = await prisma.staffRolePermission.findMany({
    where: { role },
    select: { permissionCode: true },
  });

  return unique(roleBindings.map((binding) => binding.permissionCode));
};

const getEffectivePermissions = async (staff) => {
  if (!staff) return [];

  const rolePermissions = await getRolePermissions(staff.role);
  if (rolePermissions.includes('*')) return ['*'];

  const customPermissions = Array.isArray(staff.permissions)
    ? staff.permissions
    : await prisma.staffPermission.findMany({
        where: { staffId: staff.id },
        select: { permission: true, granted: true },
      });

  const grants = customPermissions.filter((entry) => entry.granted).map((entry) => entry.permission);
  const revokes = customPermissions.filter((entry) => !entry.granted).map((entry) => entry.permission);

  return unique([...rolePermissions, ...grants]).filter((permission) => !revokes.includes(permission));
};

const getEffectiveServices = async (staff) => {
  if (!staff) return [];

  const [roleServiceAccess, serviceCodes, overrides] = await Promise.all([
    getRoleServiceAccess(),
    getServiceCodes(),
    prisma.staffServiceAllowance.findMany({
    where: { staffId: staff.id },
    select: { serviceCode: true, allowed: true },
    }),
  ]);
  const defaultServices = roleServiceAccess[staff.role] || [];

  const allowed = new Set(defaultServices);
  for (const override of overrides) {
    if (override.allowed) allowed.add(override.serviceCode);
    else allowed.delete(override.serviceCode);
  }

  return [...allowed].filter((serviceCode) => serviceCodes.includes(serviceCode));
};

const buildStaffAccessContext = async (staff) => {
  if (!staff) return { permissions: [], services: [] };

  const [permissions, services] = await Promise.all([
    getEffectivePermissions(staff),
    getEffectiveServices(staff),
  ]);

  return { permissions, services };
};

const hasResolvedPermission = (staff, permission) => {
  if (!staff) return false;
  const permissions = staff.effectivePermissions || [];
  return permissions.includes('*') || permissions.includes(permission);
};

const hasResolvedServiceAccess = (staff, serviceCode) => {
  if (!staff) return false;
  const services = staff.serviceAccess || [];
  return services.includes(serviceCode);
};

module.exports = {
  buildStaffAccessContext,
  getEffectivePermissions,
  getEffectiveServices,
  hasResolvedPermission,
  hasResolvedServiceAccess,
  syncPermissionCatalog,
};
