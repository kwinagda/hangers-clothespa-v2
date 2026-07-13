const crypto = require('crypto');

const createSessionId = () => crypto.randomUUID();

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

const buildStaffSessionData = ({ staffId, token, sessionId, req, expiresAt }) => ({
  staffId,
  token: null,
  tokenHash: hashToken(token),
  sessionId,
  deviceInfo: req?.headers?.['user-agent'] || null,
  ipAddress: req?.ip || null,
  expiresAt,
});

const staffSessionWhereForToken = (token, decoded = {}) => {
  const OR = [{ tokenHash: hashToken(token) }];
  if (decoded.jti) OR.push({ sessionId: decoded.jti });
  // Legacy transition only: old rows may still contain the full token until users re-login.
  OR.push({ token });
  return { OR, expiresAt: { gt: new Date() } };
};

module.exports = {
  buildStaffSessionData,
  createSessionId,
  hashToken,
  staffSessionWhereForToken,
};

