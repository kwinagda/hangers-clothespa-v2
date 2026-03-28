// ─────────────────────────────────────────────────────────────────────────────
// JWT SERVICE — Create and verify tokens for customers and staff
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'hangers-dev-secret-change-in-production';

/**
 * Generate a JWT token for a customer
 */
const generateCustomerToken = (customer) => {
  return jwt.sign(
    {
      id:    customer.id,
      phone: customer.phone,
      type:  'customer',
    },
    SECRET,
    { expiresIn: process.env.JWT_CUSTOMER_EXPIRES_IN || '30d' }
  );
};

/**
 * Generate a JWT token for a staff member
 */
const generateStaffToken = (staff) => {
  return jwt.sign(
    {
      id:    staff.id,
      phone: staff.phone,
      email: staff.email,
      role:  staff.role,
      type:  'staff',
    },
    SECRET,
    { expiresIn: process.env.JWT_STAFF_EXPIRES_IN || '12h' }
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
  const now = Date.now();
  // Parse "30d", "12h", "60m" etc.
  const unit  = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1));
  const ms    = unit === 'd' ? value * 86400000
              : unit === 'h' ? value * 3600000
              : unit === 'm' ? value * 60000
              : 86400000;
  return new Date(now + ms);
};

module.exports = {
  generateCustomerToken,
  generateStaffToken,
  verifyToken,
  decodeToken,
  getTokenExpiry,
};
