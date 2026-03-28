// ─────────────────────────────────────────────────────────────────────────────
// STAFF PIN AUTH CONTROLLER — Phone + PIN login for Plant & Delivery app
// POST /api/v1/staff/auth/pin-login   → { phone, pin } → JWT token
// POST /api/v1/staff/auth/change-pin  → { currentPin, newPin }
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt  = require('bcryptjs');
const prisma  = require('../config/database');
const { generateStaffToken, getTokenExpiry } = require('../services/jwt.service');
const { log, getRequestMeta }                = require('../services/activity.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');

// ── PIN login — used by Plant App and Delivery App ───────────────────────────
const pinLoginController = async (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return badRequest(res, 'Phone and PIN are required');
  }

  const PLANT_ROLES    = ['PLANT_MANAGER','PLANT_STAFF','PLANT_QC'];
  const DELIVERY_ROLES = ['DELIVERY_MANAGER','DELIVERY_RIDER'];

  try {
    const normalised = phone.replace(/[\s\-\(\)\+]/g, '');
    const staff = await prisma.staff.findFirst({
      where: {
        phone:    { endsWith: normalised.slice(-10) },
        isActive: true,
      },
      include: { permissions: true },
    });

    if (!staff) return unauthorized(res, 'Phone number not found');
    if (!staff.pin) return unauthorized(res, 'PIN not set. Ask your manager to reset your PIN.');

    const pinMatch = await bcrypt.compare(pin, staff.pin);
    if (!pinMatch) {
      await log({
        actorType: 'staff', actorId: staff.id, actorName: staff.name,
        action: 'PIN_LOGIN_FAILED', resource: 'staff', resourceId: staff.id,
        description: `Failed PIN login for ${phone}`,
        ...getRequestMeta(req),
      });
      return unauthorized(res, 'Incorrect PIN');
    }

    // Only plant and delivery roles can use PIN login
    if (![...PLANT_ROLES, ...DELIVERY_ROLES].includes(staff.role)) {
      return unauthorized(res, 'PIN login is only available for Plant and Delivery staff. Use email + password.');
    }

    const token  = generateStaffToken(staff);
    const expiry = getTokenExpiry('24h');

    await prisma.staffSession.create({
      data: {
        staffId:    staff.id,
        token,
        deviceInfo: req.headers['user-agent'] || 'Staff App',
        ipAddress:  req.ip || null,
        expiresAt:  expiry,
      },
    });

    await prisma.staff.update({
      where: { id: staff.id },
      data:  { lastLoginAt: new Date() },
    });

    await log({
      actorType: 'staff', actorId: staff.id, actorName: staff.name,
      action: 'PIN_LOGIN', resource: 'staff', resourceId: staff.id,
      description: `${staff.name} (${staff.role}) logged in via PIN`,
      ...getRequestMeta(req),
    });

    const appType = PLANT_ROLES.includes(staff.role) ? 'plant' : 'delivery';

    return success(res, {
      token,
      appType,
      staff: {
        id:    staff.id,
        name:  staff.name,
        phone: staff.phone,
        role:  staff.role,
      },
    }, `Welcome, ${staff.name}!`);

  } catch (err) {
    console.error('pinLogin error:', err);
    return error(res, 'Login failed. Please try again.');
  }
};

// ── Change PIN ────────────────────────────────────────────────────────────────
const changePinController = async (req, res) => {
  const { currentPin, newPin } = req.body;

  if (!currentPin || !newPin) return badRequest(res, 'Current PIN and new PIN required');
  if (newPin.length < 4 || newPin.length > 6) return badRequest(res, 'PIN must be 4-6 digits');
  if (!/^\d+$/.test(newPin)) return badRequest(res, 'PIN must contain only digits');

  try {
    const staff = await prisma.staff.findUnique({ where: { id: req.staff.id } });
    if (!staff?.pin) return badRequest(res, 'No PIN set for this account');

    const match = await bcrypt.compare(currentPin, staff.pin);
    if (!match) return unauthorized(res, 'Current PIN is incorrect');

    const newHash = await bcrypt.hash(newPin, 10);
    await prisma.staff.update({ where: { id: staff.id }, data: { pin: newHash } });

    return success(res, {}, 'PIN changed successfully');
  } catch (err) {
    return error(res, 'Failed to change PIN');
  }
};

// ── Reset PIN (SUPER_ADMIN / MANAGER only — resets another staff's PIN) ───────
const resetPinController = async (req, res) => {
  const { id: staffId } = req.params;

  try {
    const newPin  = Math.floor(1000 + Math.random() * 9000).toString();
    const newHash = await bcrypt.hash(newPin, 10);

    const updated = await prisma.staff.update({
      where:  { id: staffId },
      data:   { pin: newHash },
      select: { id: true, name: true, phone: true, role: true },
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'PIN_RESET', resource: 'staff', resourceId: staffId,
      description: `${req.staff.name} reset PIN for ${updated.name}`,
      ...getRequestMeta(req),
    });

    return success(res, { staff: updated, newPin }, `New PIN for ${updated.name}: ${newPin}`);
  } catch (err) {
    if (err.code === 'P2025') return badRequest(res, 'Staff not found');
    return error(res, 'Failed to reset PIN');
  }
};

module.exports = { pinLoginController, changePinController, resetPinController };
