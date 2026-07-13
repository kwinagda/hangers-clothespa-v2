const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const { getAllowedOrigins } = require('../config/env');

const getTrustedOrigins = () =>
  new Set(getAllowedOrigins().map((origin) => origin.toLowerCase()));

const isAllowedFetchSite = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'same-origin' || normalized === 'same-site' || normalized === 'none') return true;
  return false;
};

const getExpectedOrigin = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  if (!host) return null;
  return `${proto}://${host}`.toLowerCase();
};

const getOriginFromReferer = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

const hasValidSameOrigin = (req) => {
  const expectedOrigin = getExpectedOrigin(req);
  const trustedOrigins = getTrustedOrigins();
  if (expectedOrigin) trustedOrigins.add(expectedOrigin);
  if (!trustedOrigins.size) return false;

  const fetchSiteAllowed = isAllowedFetchSite(req.headers['sec-fetch-site']);
  if (fetchSiteAllowed === false) return false;

  const origin = req.headers.origin;
  if (origin) return trustedOrigins.has(String(origin).toLowerCase());

  const refererOrigin = getOriginFromReferer(req.headers.referer);
  if (refererOrigin) return trustedOrigins.has(refererOrigin);

  return fetchSiteAllowed === true;
};

const requireSameOrigin = (req, res, next) => {
  if (!hasValidSameOrigin(req)) {
    return res.status(403).json({ success: false, message: 'Forbidden origin' });
  }
  return next();
};

const requireTrustedWrite = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  return requireSameOrigin(req, res, next);
};

module.exports = { getTrustedOrigins, hasValidSameOrigin, requireSameOrigin, requireTrustedWrite };
