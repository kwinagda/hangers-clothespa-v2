// ─────────────────────────────────────────────────────────────────────────────
// STAFF AUTH CONTROLLER
// POST /api/v1/staff/auth/login    → Staff login with email + password
// GET  /api/v1/staff/auth/me       → Get current staff profile + permissions
// POST /api/v1/staff/auth/logout   → Logout staff session
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt   = require('bcryptjs');
const prisma   = require('../config/database');
const { generateStaffToken, getTokenExpiry } = require('../services/jwt.service');
const { hasPermission, ROLE_PERMISSIONS }    = require('../middleware/rbac');
const { log, getRequestMeta }                = require('../services/activity.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/staff/auth/login
// Body: { email: "manager@hangers.in", password: "password123" }
// ─────────────────────────────────────────────────────────────────────────────
const staffLoginController = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return badRequest(res, 'Email and password are required');
  }

  try {
    const staff = await prisma.staff.findUnique({
      where:   { email: email.toLowerCase().trim() },
      include: { permissions: true },
    });

    if (!staff) return unauthorized(res, 'Invalid email or password');
    if (!staff.isActive) return unauthorized(res, 'Your account has been deactivated. Contact your manager.');

    const passwordMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!passwordMatch) {
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

    const rolePerms     = ROLE_PERMISSIONS[staff.role] || [];
    const customGrants  = staff.permissions.filter(p => p.granted).map(p => p.permission);
    const customRevokes = staff.permissions.filter(p => !p.granted).map(p => p.permission);

    let effectivePerms;
    if (rolePerms.includes('*')) {
      effectivePerms = ['*'];
    } else {
      effectivePerms = [...new Set([...rolePerms, ...customGrants])]
        .filter(p => !customRevokes.includes(p));
    }

    return success(res, {
      token,
      staff: {
        id:          staff.id,
        name:        staff.name,
        phone:       staff.phone,
        email:       staff.email,
        role:        staff.role,
        permissions: effectivePerms,
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

    const rolePerms     = ROLE_PERMISSIONS[staff.role] || [];
    const customGrants  = staff.permissions.filter(p => p.granted).map(p => p.permission);
    const customRevokes = staff.permissions.filter(p => !p.granted).map(p => p.permission);

    let effectivePerms;
    if (rolePerms.includes('*')) {
      effectivePerms = ['*'];
    } else {
      effectivePerms = [...new Set([...rolePerms, ...customGrants])]
        .filter(p => !customRevokes.includes(p));
    }

    return success(res, {
      staff: {
        id:                  staff.id,
        name:                staff.name,
        phone:               staff.phone,
        email:               staff.email,
        role:                staff.role,
        isActive:            staff.isActive,
        lastLoginAt:         staff.lastLoginAt,
        createdAt:           staff.createdAt,
        effectivePermissions: effectivePerms,
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
    const token = req.headers.authorization?.substring(7);
    if (token) {
      await prisma.staffSession.deleteMany({ where: { token } });
    }

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
  const { name, phone, email, password, role } = req.body;

  const validRoles = [
    'SUPER_ADMIN','MANAGER','COUNTER_STAFF','ACCOUNTS',
    'DELIVERY_MANAGER','DELIVERY_RIDER','PLANT_MANAGER','PLANT_STAFF','PLANT_QC'
  ];

  if (!name || !phone || !password || !role) {
    return badRequest(res, 'Name, phone, password and role are required');
  }
  if (!validRoles.includes(role)) {
    return badRequest(res, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }
  if (password.length < 8) {
    return badRequest(res, 'Password must be at least 8 characters');
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