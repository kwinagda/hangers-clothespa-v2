// ─────────────────────────────────────────────────────────────────────────────
// STAFF AUTH CONTROLLER
// POST /api/v1/staff/auth/login    → Staff login with email + password
// GET  /api/v1/staff/auth/me       → Get current staff profile + permissions
// POST /api/v1/staff/auth/logout   → Logout staff session
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt   = require('bcryptjs');
const prisma   = require('../config/database');
const { generateStaffToken, getTokenExpiry } = require('../services/jwt.service');
const { log, getRequestMeta }                = require('../services/activity.service');
const { clearAuthThrottle, getAuthThrottleBlock, registerAuthThrottleFailure } = require('../services/authThrottle.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');
const { PLANT_PIN_ROLES, STAFF_ROLE_VALUES } = require('../config/master-data');
const { staffCreateSchema, staffLoginSchema } = require('../validation/auth.schemas');
const { buildStaffAccessContext } = require('../services/accessControl.service');
const MAX_ACTIVE_STAFF_SESSIONS = 5;
const STAFF_LOGIN_MAX_FAILURES = 5;
const STAFF_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const setCrmAuthCookie = (res, token, maxAgeMs) => {
  res.cookie('crm_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs,
  });
};

const clearCrmAuthCookie = (res) => {
  res.clearCookie('crm_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/staff/auth/login
// Body: { email: "manager@hangers.in", password: "password123" }
// ─────────────────────────────────────────────────────────────────────────────
const staffLoginController = async (req, res) => {
  const parsed = staffLoginSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Email and password are required');
  const { email, password } = parsed.data;

  try {
    const ipScopeKey = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().slice(0, 64);
    const emailScopeKey = email;
    const [emailBlockedUntil, ipBlockedUntil] = await Promise.all([
      getAuthThrottleBlock({ scope: 'staff-login:email', scopeKey: emailScopeKey }),
      getAuthThrottleBlock({ scope: 'staff-login:ip', scopeKey: ipScopeKey }),
    ]);
    if (emailBlockedUntil || ipBlockedUntil) {
      return unauthorized(res, 'Too many failed attempts. Please try again later.');
    }

    const staff = await prisma.staff.findUnique({
      where:   { email },
      include: { permissions: true },
    });

    if (!staff) {
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'staff-login:email', scopeKey: emailScopeKey, maxFailures: STAFF_LOGIN_MAX_FAILURES, windowMs: STAFF_LOGIN_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'staff-login:ip', scopeKey: ipScopeKey, maxFailures: STAFF_LOGIN_MAX_FAILURES, windowMs: STAFF_LOGIN_WINDOW_MS }),
      ]);
      return unauthorized(res, 'Invalid email or password');
    }
    if (!staff.isActive) return unauthorized(res, 'Your account has been deactivated. Contact your manager.');

    const passwordMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!passwordMatch) {
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'staff-login:email', scopeKey: emailScopeKey, maxFailures: STAFF_LOGIN_MAX_FAILURES, windowMs: STAFF_LOGIN_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'staff-login:ip', scopeKey: ipScopeKey, maxFailures: STAFF_LOGIN_MAX_FAILURES, windowMs: STAFF_LOGIN_WINDOW_MS }),
      ]);
      await log({
        actorType:   'staff',
        actorId:     staff.id,
        actorName:   staff.name,
        action:      'STAFF_LOGIN_FAILED',
        resource:    'staff',
        resourceId:  staff.id,
        description: `Failed login attempt for ${email}`,
        ...getRequestMeta(req),
      });
      return unauthorized(res, 'Invalid email or password');
    }

    await Promise.all([
      clearAuthThrottle({ scope: 'staff-login:email', scopeKey: emailScopeKey }),
      clearAuthThrottle({ scope: 'staff-login:ip', scopeKey: ipScopeKey }),
    ]);

    const token  = generateStaffToken(staff);
    const expiry = getTokenExpiry(process.env.JWT_STAFF_EXPIRES_IN || '12h');

    await prisma.staffSession.create({
      data: {
        staffId:    staff.id,
        token,
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress:  req.ip || null,
        expiresAt:  expiry,
      },
    });
    await trimStaffSessions(staff.id);

    await prisma.staff.update({
      where: { id: staff.id },
      data:  { lastLoginAt: new Date() },
    });

    await log({
      actorType:   'staff',
      actorId:     staff.id,
      actorName:   staff.name,
      action:      'STAFF_LOGIN',
      resource:    'staff',
      resourceId:  staff.id,
      description: `${staff.name} (${staff.role}) logged in`,
      ...getRequestMeta(req),
    });

    const access = await buildStaffAccessContext(staff);

    setCrmAuthCookie(res, token, Math.max(0, expiry.getTime() - Date.now()));

    return success(res, {
      token,
      appType: PLANT_PIN_ROLES.includes(staff.role) ? 'plant' : 'delivery',
      staff: {
        id:          staff.id,
        name:        staff.name,
        phone:       staff.phone,
        email:       staff.email,
        role:        staff.role,
        mustChangePassword: staff.mustChangePassword,
        permissions: access.permissions,
        serviceAccess: access.services,
      },
    }, `Welcome back, ${staff.name}!`);

  } catch (err) {
    console.error('staffLogin error:', err);
    return error(res, 'Login failed. Please try again.');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/staff/auth/me
// ─────────────────────────────────────────────────────────────────────────────
const staffMeController = async (req, res) => {
  try {
    const staff = await prisma.staff.findUnique({
      where:   { id: req.staff.id },
      include: { permissions: true },
    });

    if (!staff) return unauthorized(res, 'Account not found');

    const access = await buildStaffAccessContext(staff);

    return success(res, {
      appType: PLANT_PIN_ROLES.includes(staff.role) ? 'plant' : 'delivery',
      staff: {
        id:                  staff.id,
        name:                staff.name,
        phone:               staff.phone,
        email:               staff.email,
        role:                staff.role,
        isActive:            staff.isActive,
        mustChangePassword:  staff.mustChangePassword,
        lastLoginAt:         staff.lastLoginAt,
        createdAt:           staff.createdAt,
        effectivePermissions: access.permissions,
        serviceAccess: access.services,
      },
    });
  } catch (err) {
    console.error('staffMe error:', err);
    return error(res, 'Failed to fetch profile');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/staff/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
const staffLogoutController = async (req, res) => {
  try {
    const token = req.authToken || req.headers.authorization?.substring(7);
    if (token) {
      await prisma.staffSession.deleteMany({ where: { token } });
    }
    clearCrmAuthCookie(res);

    await log({
      actorType:   'staff',
      actorId:     req.staff?.id,
      actorName:   req.staff?.name,
      action:      'STAFF_LOGOUT',
      resource:    'staff',
      resourceId:  req.staff?.id,
      description: `${req.staff?.name} logged out`,
      ...getRequestMeta(req),
    });

    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    return error(res, 'Logout failed');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/staff/auth/create
// Body: { name, phone, email, password, role }
// Only SUPER_ADMIN can create staff accounts
// ─────────────────────────────────────────────────────────────────────────────
const createStaffController = async (req, res) => {
  const parsed = staffCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid staff payload');
  const { name, phone, email, password, role } = parsed.data;

  const validRoles = STAFF_ROLE_VALUES;

  if (!validRoles.includes(role)) {
    return badRequest(res, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const pin          = Math.floor(1000 + Math.random() * 9000).toString();

    const staff = await prisma.staff.create({
      data: {
        name,
        phone:        phone.replace(/\s/g, ''),
        email:        email?.toLowerCase().trim() || null,
        passwordHash,
        mustChangePassword: true,
        role,
        pin:          await bcrypt.hash(pin, 10),
        createdBy:    req.staff.id,
      },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
    });

    await log({
      actorType:   'staff',
      actorId:     req.staff.id,
      actorName:   req.staff.name,
      action:      'STAFF_CREATED',
      resource:    'staff',
      resourceId:  staff.id,
      description: `${req.staff.name} created staff account: ${name} (${role})`,
      metadata:    { staffId: staff.id, role },
      ...getRequestMeta(req),
    });

    return success(res, {
      staff,
      tempPin: pin,
    }, `Staff account created. Temp PIN: ${pin}`);

  } catch (err) {
    if (err.code === 'P2002') {
      return badRequest(res, 'A staff account with this phone or email already exists');
    }
    console.error('createStaff error:', err);
    return error(res, 'Failed to create staff account');
  }
};

module.exports = {
  staffLoginController,
  staffMeController,
  staffLogoutController,
  createStaffController,
};
