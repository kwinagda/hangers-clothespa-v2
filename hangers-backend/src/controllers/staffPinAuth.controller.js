// ─────────────────────────────────────────────────────────────────────────────
// STAFF PIN AUTH CONTROLLER — Phone + PIN login for Plant & Delivery app
// POST /api/v1/staff/auth/pin-login   → { phone, pin } → JWT token
// POST /api/v1/staff/auth/change-pin  → { currentPin, newPin }
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt  = require('bcryptjs');
const prisma  = require('../config/database');
const { generateStaffToken, getTokenExpiry } = require('../services/jwt.service');
const { log, getRequestMeta }                = require('../services/activity.service');
const { clearAuthThrottle, getAuthThrottleBlock, registerAuthThrottleFailure } = require('../services/authThrottle.service');
const { buildStaffSessionData, createSessionId } = require('../services/sessionToken.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');
const { DELIVERY_PIN_ROLES, PLANT_PIN_ROLES } = require('../config/master-data');
const { buildStaffAccessContext } = require('../services/accessControl.service');
const MAX_ACTIVE_STAFF_SESSIONS = 5;
const PIN_LOGIN_MAX_FAILURES = 5;
const PIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const ELEVATED_ROLES = new Set(['SUPER_ADMIN', 'MANAGER']);
const STAFF_PIN_EXPIRES_IN = process.env.JWT_STAFF_PIN_EXPIRES_IN || process.env.JWT_STAFF_EXPIRES_IN || '12h';

const canResetPinForStaff = (actor, target) => {
  if (!actor || !target) return false;
  if (actor.role === 'SUPER_ADMIN') return actor.id !== target.id;
  if (actor.role !== 'MANAGER') return false;
  return actor.id !== target.id && !ELEVATED_ROLES.has(target.role);
};

const trimStaffSessions = async (staffId) => {
  const sessions = await prisma.staffSession.findMany({
    where: { staffId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const staleSessionIds = sessions.slice(MAX_ACTIVE_STAFF_SESSIONS).map((session) => session.id);
  if (staleSessionIds.length) {
    await prisma.staffSession.deleteMany({ where: { id: { in: staleSessionIds } } });
  }
};

// ── PIN login — used by Plant App and Delivery App ───────────────────────────
const pinLoginController = async (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return badRequest(res, 'Phone and PIN are required');
  }

  try {
    const normalised = phone.replace(/[\s\-\(\)\+]/g, '');
    const ipScopeKey = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().slice(0, 64);
    const phoneScopeKey = normalised.slice(-10);
    const [phoneBlockedUntil, ipBlockedUntil] = await Promise.all([
      getAuthThrottleBlock({ scope: 'staff-pin:phone', scopeKey: phoneScopeKey }),
      getAuthThrottleBlock({ scope: 'staff-pin:ip', scopeKey: ipScopeKey }),
    ]);
    if (phoneBlockedUntil || ipBlockedUntil) {
      return unauthorized(res, 'Too many failed attempts. Please try again later.');
    }

    const staff = await prisma.staff.findFirst({
      where: {
        phone:    { endsWith: normalised.slice(-10) },
        isActive: true,
      },
      include: { permissions: true },
    });

    if (!staff) {
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'staff-pin:phone', scopeKey: phoneScopeKey, maxFailures: PIN_LOGIN_MAX_FAILURES, windowMs: PIN_LOGIN_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'staff-pin:ip', scopeKey: ipScopeKey, maxFailures: PIN_LOGIN_MAX_FAILURES, windowMs: PIN_LOGIN_WINDOW_MS }),
      ]);
      return unauthorized(res, 'Phone number not found');
    }
    if (!staff.pin) return unauthorized(res, 'PIN not set. Ask your manager to reset your PIN.');

    const pinMatch = await bcrypt.compare(pin, staff.pin);
    if (!pinMatch) {
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'staff-pin:phone', scopeKey: phoneScopeKey, maxFailures: PIN_LOGIN_MAX_FAILURES, windowMs: PIN_LOGIN_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'staff-pin:ip', scopeKey: ipScopeKey, maxFailures: PIN_LOGIN_MAX_FAILURES, windowMs: PIN_LOGIN_WINDOW_MS }),
      ]);
      await log({
        actorType: 'staff', actorId: staff.id, actorName: staff.name,
        action: 'PIN_LOGIN_FAILED', resource: 'staff', resourceId: staff.id,
        description: `Failed PIN login for ${phone}`,
        ...getRequestMeta(req),
      });
      return unauthorized(res, 'Incorrect PIN');
    }

    await Promise.all([
      clearAuthThrottle({ scope: 'staff-pin:phone', scopeKey: phoneScopeKey }),
      clearAuthThrottle({ scope: 'staff-pin:ip', scopeKey: ipScopeKey }),
    ]);

    // Only plant and delivery roles can use PIN login
    if (![...PLANT_PIN_ROLES, ...DELIVERY_PIN_ROLES].includes(staff.role)) {
      return unauthorized(res, 'PIN login is only available for Plant and Delivery staff. Use email + password.');
    }

    const sessionId = createSessionId();
    const token  = generateStaffToken({ ...staff, jti: sessionId }, STAFF_PIN_EXPIRES_IN);
    const expiry = getTokenExpiry(STAFF_PIN_EXPIRES_IN);

    await prisma.staffSession.create({
      data: buildStaffSessionData({ staffId: staff.id, token, sessionId, req, expiresAt: expiry }),
    });

    await prisma.staff.update({
      where: { id: staff.id },
      data:  { lastLoginAt: new Date() },
    });
    await trimStaffSessions(staff.id);

    await log({
      actorType: 'staff', actorId: staff.id, actorName: staff.name,
      action: 'PIN_LOGIN', resource: 'staff', resourceId: staff.id,
      description: `${staff.name} (${staff.role}) logged in via PIN`,
      ...getRequestMeta(req),
    });

    const appType = PLANT_PIN_ROLES.includes(staff.role) ? 'plant' : 'delivery';
    const access = await buildStaffAccessContext(staff);

    return success(res, {
      token,
      appType,
      staff: {
        id:    staff.id,
        name:  staff.name,
        phone: staff.phone,
        role:  staff.role,
        permissions: access.permissions,
        serviceAccess: access.services,
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
    await prisma.staff.update({
      where: { id: staff.id },
      data: { pin: newHash, sessionVersion: { increment: 1 } },
    });
    await prisma.staffSession.deleteMany({ where: { staffId: staff.id } });

    return success(res, {}, 'PIN changed successfully');
  } catch (err) {
    return error(res, 'Failed to change PIN');
  }
};

// ── Reset PIN (SUPER_ADMIN / MANAGER only — resets another staff's PIN) ───────
const resetPinController = async (req, res) => {
  const { id: staffId } = req.params;

  try {
    const target = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, name: true, phone: true, role: true },
    });
    if (!target) return badRequest(res, 'Staff not found');
    if (!canResetPinForStaff(req.staff, target)) {
      return badRequest(res, 'You can only reset PINs for non-manager staff accounts');
    }

    const newPin  = Math.floor(1000 + Math.random() * 9000).toString();
    const newHash = await bcrypt.hash(newPin, 10);

    const updated = await prisma.staff.update({
      where:  { id: staffId },
      data:   { pin: newHash, sessionVersion: { increment: 1 } },
      select: { id: true, name: true, phone: true, role: true },
    });
    await prisma.staffSession.deleteMany({ where: { staffId } });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'PIN_RESET', resource: 'staff', resourceId: staffId,
      description: `${req.staff.name} reset PIN for ${updated.name}`,
      ...getRequestMeta(req),
    });

    return success(res, { staff: updated, newPin }, `New PIN for ${updated.name}: ${newPin}`);
  } catch (err) {
    return error(res, 'Failed to reset PIN');
  }
};

module.exports = { pinLoginController, changePinController, resetPinController };
