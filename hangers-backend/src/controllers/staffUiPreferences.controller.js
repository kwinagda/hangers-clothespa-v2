const prisma = require('../config/database');
const { buildStaffAccessContext } = require('../services/accessControl.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error } = require('../utils/response');

const NAV_DESTINATIONS = Object.freeze({
  orders: { href: '/dashboard/orders', permission: null, service: 'CRM' },
  new_order: { href: '/dashboard/orders/new', permission: null, service: 'CRM' },
  customers: { href: '/dashboard/customers', permission: null, service: 'CRM' },
  daily_iron: { href: '/dashboard/iron/sheet', permission: null, service: 'CRM' },
  monthly_iron: { href: '/dashboard/iron/monthly', permission: null, service: 'CRM' },
  pickup_requests: { href: '/dashboard/pickup-requests', permission: 'pickup_requests.view', service: 'CRM' },
  field_service: { href: '/dashboard/service-appointments', permission: null, service: 'CRM' },
  plant_challans: { href: '/dashboard/plantchallans', permission: null, service: 'CRM' },
  finance: { href: '/dashboard/finance', permission: null, service: 'FINANCE' },
  reports: { href: '/dashboard/reports', permission: null, service: 'REPORTS' },
});

const DEFAULT_ITEMS = ['orders', 'daily_iron'];

const permittedDestinationIds = (access) => Object.entries(NAV_DESTINATIONS)
  .filter(([, destination]) => {
    const hasService = access.services.includes('*') || access.services.includes(destination.service);
    const hasPermission = !destination.permission || access.permissions.includes('*') || access.permissions.includes(destination.permission);
    return hasService && hasPermission;
  })
  .map(([id]) => id);

const normaliseItems = (items, permitted) => {
  const unique = [...new Set(Array.isArray(items) ? items : [])]
    .filter((item) => typeof item === 'string' && permitted.includes(item));
  const fallback = DEFAULT_ITEMS.filter((item) => permitted.includes(item));
  return [...unique, ...fallback.filter((item) => !unique.includes(item)), ...permitted]
    .slice(0, 2);
};

const preferenceResponse = (preference, access) => {
  const permitted = permittedDestinationIds(access);
  return {
    primaryNavItems: normaliseItems(preference?.primaryNavItems, permitted),
    availableNavItems: permitted.map((id) => ({ id, href: NAV_DESTINATIONS[id].href })),
    schemaVersion: 1,
  };
};

const getUiPreferences = async (req, res) => {
  try {
    const [staff, preference] = await Promise.all([
      prisma.staff.findUnique({ where: { id: req.staff.id }, include: { permissions: true } }),
      prisma.staffUiPreference.findUnique({ where: { staffId: req.staff.id } }),
    ]);
    if (!staff) return badRequest(res, 'Staff account not found');
    const access = await buildStaffAccessContext(staff);
    return success(res, preferenceResponse(preference, access));
  } catch (err) {
    console.error('getUiPreferences error:', err);
    return error(res, 'Could not load navigation preferences');
  }
};

const updateUiPreferences = async (req, res) => {
  try {
    if (!Array.isArray(req.body?.primaryNavItems) || req.body.primaryNavItems.length !== 2) {
      return badRequest(res, 'Choose exactly two navigation shortcuts');
    }
    const staff = await prisma.staff.findUnique({ where: { id: req.staff.id }, include: { permissions: true } });
    if (!staff) return badRequest(res, 'Staff account not found');
    const access = await buildStaffAccessContext(staff);
    const permitted = permittedDestinationIds(access);
    const items = normaliseItems(req.body.primaryNavItems, permitted);
    if (items.length !== 2 || items.some((item) => !req.body.primaryNavItems.includes(item))) {
      return badRequest(res, 'One or more shortcuts are not available for this account');
    }

    const preference = await prisma.$transaction(async (tx) => {
      const saved = await tx.staffUiPreference.upsert({
        where: { staffId: staff.id },
        update: { primaryNavItems: items, schemaVersion: 1 },
        create: { staffId: staff.id, primaryNavItems: items, schemaVersion: 1 },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: staff.id, actorName: staff.name,
        action: 'STAFF_UI_PREFERENCES_UPDATED', resource: 'staff', resourceId: staff.id,
        description: 'Updated mobile navigation shortcuts', metadata: { primaryNavItems: items },
        ...getRequestMeta(req),
      });
      return saved;
    });
    return success(res, preferenceResponse(preference, access), 'Navigation shortcuts updated');
  } catch (err) {
    console.error('updateUiPreferences error:', err);
    return error(res, 'Could not save navigation preferences');
  }
};

module.exports = { getUiPreferences, updateUiPreferences };
