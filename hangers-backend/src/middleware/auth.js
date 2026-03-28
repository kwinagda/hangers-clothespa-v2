// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Verify JWT tokens for customers and staff
// ─────────────────────────────────────────────────────────────────────────────

const { verifyToken }  = require('../services/jwt.service');
const { unauthorized } = require('../utils/response');
const prisma           = require('../config/database');

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

    // Verify customer still exists and is active
    const customer = await prisma.customer.findUnique({
      where: { id: decoded.id },
      select: { id: true, phone: true, name: true, isActive: true },
    });

    if (!customer)           return unauthorized(res, 'Account not found');
    if (!customer.isActive)  return unauthorized(res, 'Account has been deactivated');

    req.customer = customer;
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
        permissions: true,
      },
    });

    if (!staff)          return unauthorized(res, 'Staff account not found');
    if (!staff.isActive) return unauthorized(res, 'Account has been deactivated. Contact admin.');

    req.staff = staff;
    req.tokenData = decoded;
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
  return null;
};

module.exports = { customerAuth, staffAuth };
