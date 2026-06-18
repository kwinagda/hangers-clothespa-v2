// ─────────────────────────────────────────────────────────────────────────────
// STAFF MANAGEMENT CONTROLLER — CRM: list/update/deactivate staff
// GET  /api/v1/staff/list          → All staff (SUPER_ADMIN + MANAGER)
// PUT  /api/v1/staff/:id           → Update name/phone/email/role
// PUT  /api/v1/staff/:id/deactivate
// PUT  /api/v1/staff/:id/reactivate
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound } = require('../utils/response');
const { STAFF_ROLE_VALUES } = require('../config/master-data');
const { staffUpdateSchema } = require('../validation/auth.schemas');

const ELEVATED_ROLES = new Set(['SUPER_ADMIN', 'MANAGER']);

const canManageStaffRecord = (actor, target) => {
  if (!actor || !target) return false;
  if (actor.role === 'SUPER_ADMIN') return true;
  if (actor.role !== 'MANAGER') return false;
  return actor.id !== target.id && !ELEVATED_ROLES.has(target.role);
};

const canAssignRole = (actor, nextRole) => {
  if (!nextRole) return true;
  if (actor?.role === 'SUPER_ADMIN') return true;
  if (actor?.role !== 'MANAGER') return false;
  return !ELEVATED_ROLES.has(nextRole);
};

const listStaff = async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({
      where: req.staff.role === 'MANAGER'
        ? { role: { notIn: Array.from(ELEVATED_ROLES) } }
        : undefined,
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, isActive: true, lastLoginAt: true, createdAt: true,
        pin: true,  // just to check if set (boolean)
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });

    return success(res, {
      staff: staff.map(s => ({
        ...s,
        hasPin: !!s.pin,
        pin: undefined,
      })),
      total: staff.length,
    });
  } catch (err) {
    return error(res, 'Failed to fetch staff');
  }
};

const updateStaff = async (req, res) => {
  const { id } = req.params;
  const parsed = staffUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid staff update payload');
  const { name, phone, email, role } = parsed.data;

  const VALID_ROLES = STAFF_ROLE_VALUES;

  if (role && !VALID_ROLES.includes(role)) {
    return badRequest(res, `Invalid role: ${role}`);
  }
  if (!canAssignRole(req.staff, role)) {
    return badRequest(res, 'Managers cannot assign manager or super admin roles');
  }

  try {
    const existing = await prisma.staff.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!existing) return notFound(res, 'Staff not found');
    if (!canManageStaffRecord(req.staff, existing)) {
      return badRequest(res, 'You can only manage non-manager staff accounts');
    }

    const roleChanged = Boolean(role && role !== existing.role);
    const updated = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.update({
        where: { id },
        data: {
          ...(name  && { name }),
          ...(phone && { phone: phone.replace(/\s/g, '') }),
          ...(email !== undefined && { email: email?.toLowerCase() || null }),
          ...(role  && { role }),
          ...(roleChanged && { sessionVersion: { increment: 1 } }),
        },
        select: { id: true, name: true, phone: true, email: true, role: true, isActive: true, sessionVersion: true },
      });
      if (roleChanged) {
        await tx.staffSession.deleteMany({ where: { staffId: id } });
      }
      return staff;
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'STAFF_UPDATED', resource: 'staff', resourceId: id,
      description: `${req.staff.name} updated staff: ${updated.name}`,
      metadata: {
        changedFields: Object.keys(parsed.data),
        roleChanged,
      },
      ...getRequestMeta(req),
    });

    return success(res, { staff: updated }, 'Staff updated');
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Staff not found');
    if (err.code === 'P2002') return badRequest(res, 'Phone or email already in use');
    return error(res, 'Failed to update staff');
  }
};

const deactivateStaff = async (req, res) => {
  const { id } = req.params;
  if (id === req.staff.id) return badRequest(res, "You can't deactivate your own account");

  try {
    const existing = await prisma.staff.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!existing) return notFound(res, 'Staff not found');
    if (!canManageStaffRecord(req.staff, existing)) {
      return badRequest(res, 'You can only manage non-manager staff accounts');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.update({
        where: { id },
        data:  { isActive: false, sessionVersion: { increment: 1 } },
        select: { id: true, name: true, role: true, sessionVersion: true },
      });
      await tx.staffSession.deleteMany({ where: { staffId: id } });
      return staff;
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'STAFF_DEACTIVATED', resource: 'staff', resourceId: id,
      description: `${req.staff.name} deactivated ${updated.name}`,
      ...getRequestMeta(req),
    });

    return success(res, { staff: updated }, `${updated.name} has been deactivated`);
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Staff not found');
    return error(res, 'Failed to deactivate staff');
  }
};

const reactivateStaff = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await prisma.staff.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!existing) return notFound(res, 'Staff not found');
    if (!canManageStaffRecord(req.staff, existing)) {
      return badRequest(res, 'You can only manage non-manager staff accounts');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.update({
        where: { id },
        data:  { isActive: true, sessionVersion: { increment: 1 } },
        select: { id: true, name: true, role: true, sessionVersion: true },
      });
      await tx.staffSession.deleteMany({ where: { staffId: id } });
      return staff;
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'STAFF_REACTIVATED', resource: 'staff', resourceId: id,
      description: `${req.staff.name} reactivated ${updated.name}`,
      ...getRequestMeta(req),
    });

    return success(res, { staff: updated }, `${updated.name} has been reactivated`);
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Staff not found');
    return error(res, 'Failed to reactivate staff');
  }
};

module.exports = { listStaff, updateStaff, deactivateStaff, reactivateStaff };
