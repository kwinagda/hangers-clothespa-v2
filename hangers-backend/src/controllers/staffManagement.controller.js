// ─────────────────────────────────────────────────────────────────────────────
// STAFF MANAGEMENT CONTROLLER — CRM: list/update/deactivate staff
// GET  /api/v1/staff/list          → All staff (SUPER_ADMIN + MANAGER)
// PUT  /api/v1/staff/:id           → Update name/phone/email/role
// PUT  /api/v1/staff/:id/deactivate
// PUT  /api/v1/staff/:id/reactivate
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound } = require('../utils/response');
const { STAFF_ROLE_VALUES } = require('../config/master-data');

const listStaff = async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({
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
  const { name, phone, email, role } = req.body;

  const VALID_ROLES = STAFF_ROLE_VALUES;

  if (role && !VALID_ROLES.includes(role)) {
    return badRequest(res, `Invalid role: ${role}`);
  }

  try {
    const updated = await prisma.staff.update({
      where: { id },
      data: {
        ...(name  && { name }),
        ...(phone && { phone: phone.replace(/\s/g, '') }),
        ...(email !== undefined && { email: email?.toLowerCase() || null }),
        ...(role  && { role }),
      },
      select: { id: true, name: true, phone: true, email: true, role: true, isActive: true },
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'STAFF_UPDATED', resource: 'staff', resourceId: id,
      description: `${req.staff.name} updated staff: ${updated.name}`,
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
    const updated = await prisma.staff.update({
      where: { id },
      data:  { isActive: false },
      select: { id: true, name: true, role: true },
    });

    // Invalidate all their sessions
    await prisma.staffSession.deleteMany({ where: { staffId: id } });

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
    const updated = await prisma.staff.update({
      where: { id },
      data:  { isActive: true },
      select: { id: true, name: true, role: true },
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
