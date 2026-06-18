const prisma = require('../config/database');

const buildBlockedUntil = (now, windowMs) => new Date(now.getTime() + windowMs);

const getAuthThrottleBlock = async ({ scope, scopeKey }) => {
  const row = await prisma.authThrottle.findUnique({
    where: { scope_scopeKey: { scope, scopeKey } },
  });
  if (!row?.blockedUntil) return null;
  return row.blockedUntil > new Date() ? row.blockedUntil : null;
};

const registerAuthThrottleFailure = async ({ scope, scopeKey, maxFailures, windowMs }) => {
  const now = new Date();
  const current = await prisma.authThrottle.findUnique({
    where: { scope_scopeKey: { scope, scopeKey } },
  });

  if (!current) {
    await prisma.authThrottle.create({
      data: { scope, scopeKey, failureCount: 1, lastFailedAt: now },
    });
    return null;
  }

  const withinWindow =
    current.lastFailedAt && now.getTime() - current.lastFailedAt.getTime() <= windowMs;
  const failureCount = withinWindow ? current.failureCount + 1 : 1;
  const blockedUntil = failureCount >= maxFailures ? buildBlockedUntil(now, windowMs) : null;

  const updated = await prisma.authThrottle.update({
    where: { scope_scopeKey: { scope, scopeKey } },
    data: {
      failureCount,
      lastFailedAt: now,
      blockedUntil,
    },
  });

  return updated.blockedUntil;
};

const clearAuthThrottle = async ({ scope, scopeKey }) => {
  await prisma.authThrottle.deleteMany({ where: { scope, scopeKey } });
};

module.exports = {
  getAuthThrottleBlock,
  registerAuthThrottleFailure,
  clearAuthThrottle,
};
