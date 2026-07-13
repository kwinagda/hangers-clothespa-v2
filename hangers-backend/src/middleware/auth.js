// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Verify JWT tokens for customers and staff
// ─────────────────────────────────────────────────────────────────────────────

const { verifyToken }  = require('../services/jwt.service');
const { unauthorized } = require('../utils/response');
const prisma           = require('../config/database');
const { buildStaffAccessContext } = require('../services/accessControl.service');
const { staffSessionWhereForToken } = require('../services/sessionToken.service');

const hasActiveSession = async (type, token, decoded = {}) => {
  if (type === 'customer') {
    const where = { token, expiresAt: { gt: new Date() } };
    const session = await prisma.customerSession.findFirst({ where, select: { id: true } });
    return Boolean(session);
  }
  const session = await prisma.staffSession.findFirst({
    where: staffSessionWhereForToken(token, decoded),
    select: { id: true },
  });
  return Boolean(session);
};

const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/v1/staff/auth/me',
  '/api/v1/staff/auth/logout',
  '/api/v1/staff/auth/change-password',
]);

/**
 * Protect customer routes
 * Attaches req.customer if token is valid
 */
const customerAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized(res, 'No auth token provided');

    const decoded = verifyToken(token);
    if (decoded.type !== 'customer') return unauthorized(res, 'Invalid token type');
    if (!(await hasActiveSession('customer', token, decoded))) {
      return unauthorized(res, 'Session expired — please login again');
    }

    // Verify customer still exists and is active
    const customer = await prisma.customer.findUnique({
      where: { id: decoded.id },
      select: { id: true, phone: true, name: true, isActive: true, sessionVersion: true },
    });

    if (!customer)           return unauthorized(res, 'Account not found');
    if (!customer.isActive)  return unauthorized(res, 'Account has been deactivated');
    if ((decoded.sessionVersion || 0) !== (customer.sessionVersion || 0)) {
      return unauthorized(res, 'Session expired — please login again');
    }

    req.customer = customer;
    req.authToken = token;
    req.tokenData = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Session expired — please login again');
    if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
    return unauthorized(res, 'Authentication failed');
  }
};

/**
 * Protect staff routes
 * Attaches req.staff if token is valid
 */
const staffAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized(res, 'No auth token provided');

    const decoded = verifyToken(token);
    if (decoded.type !== 'staff') return unauthorized(res, 'Invalid token type');
    if (!(await hasActiveSession('staff', token, decoded))) {
      return unauthorized(res, 'Session expired — please login again');
    }

    // Verify staff still exists and is active
    const staff = await prisma.staff.findUnique({
      where: { id: decoded.id },
      select: {
        id:          true,
        name:        true,
        phone:       true,
        email:       true,
        role:        true,
        isActive:    true,
        sessionVersion: true,
        mustChangePassword: true,
        permissions: true,
      },
    });

    if (!staff)          return unauthorized(res, 'Staff account not found');
    if (!staff.isActive) return unauthorized(res, 'Account has been deactivated. Contact admin.');
    if ((decoded.sessionVersion || 0) !== (staff.sessionVersion || 0)) {
      return unauthorized(res, 'Session expired — please login again');
    }

    const access = await buildStaffAccessContext(staff);

    req.staff = {
      ...staff,
      effectivePermissions: access.permissions,
      serviceAccess: access.services,
    };
    req.authToken = token;
    req.tokenData = decoded;
    if (staff.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PATHS.has(req.originalUrl?.split('?')[0])) {
      return res.status(428).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Password change required before continuing',
      });
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Session expired — please login again');
    if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
    return unauthorized(res, 'Authentication failed');
  }
};

/**
 * Extract Bearer token from Authorization header
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
  return cookies.crm_token || cookies.customer_token || null;
};

module.exports = { customerAuth, staffAuth };
