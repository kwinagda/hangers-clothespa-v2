// ─────────────────────────────────────────────────────────────────────────────
// JWT SERVICE — Create and verify tokens for customers and staff
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Generate a JWT token for a customer
 */
const resolveExpiryConfig = (value, fallback) => {
  const normalized = String(value || fallback || '').trim();
  if (!normalized) return fallback;
  return normalized;
};

const parseExpiryMs = (expiresIn) => {
  const normalized = resolveExpiryConfig(expiresIn, '1d');
  if (/^\d+$/.test(normalized)) return Number(normalized) * 1000;

  const match = normalized.match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    throw new Error(`Unsupported JWT expiry format: ${normalized}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
};

const generateCustomerToken = (customer, expiresIn = process.env.JWT_CUSTOMER_EXPIRES_IN || '30d') => {
  return jwt.sign(
    {
      id: customer.id,
      phone: customer.phone,
      sessionVersion: customer.sessionVersion || 0,
      type: 'customer',
    },
    SECRET,
    { expiresIn: resolveExpiryConfig(expiresIn, '30d') }
  );
};

/**
 * Generate a JWT token for a staff member
 */
const generateStaffToken = (staff, expiresIn = process.env.JWT_STAFF_EXPIRES_IN || '12h') => {
  if (!staff.jti) throw new Error('Staff token requires a unique jti');
  return jwt.sign(
    {
      id: staff.id,
      phone: staff.phone,
      email: staff.email,
      role: staff.role,
      sessionVersion: staff.sessionVersion || 0,
      type: 'staff',
      jti: staff.jti,
    },
    SECRET,
    { expiresIn: resolveExpiryConfig(expiresIn, '12h') }
  );
};

/**
 * Verify and decode a JWT token
 * Returns decoded payload or throws error
 */
const verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};

/**
 * Decode token without verifying (for debugging only)
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Calculate token expiry as a Date object
 */
const getTokenExpiry = (expiresIn) => {
  return new Date(Date.now() + parseExpiryMs(expiresIn));
};

module.exports = {
  generateCustomerToken,
  generateStaffToken,
  verifyToken,
  decodeToken,
  getTokenExpiry,
};
