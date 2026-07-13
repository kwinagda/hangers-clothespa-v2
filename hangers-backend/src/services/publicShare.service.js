const crypto = require('crypto');
const prisma = require('../config/database');

const DEFAULT_TTL_DAYS = 30;

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || DEFAULT_TTL_DAYS));
  return date;
};

const createPublicShareToken = async ({ resourceType, resourceId, purpose, ttlDays = DEFAULT_TTL_DAYS }) => {
  if (!resourceType || !resourceId || !purpose) return null;

  const existing = await prisma.publicShareToken.findFirst({
    where: {
      resourceType,
      resourceId,
      purpose,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.tokenHash) {
    // Existing hashes cannot be converted back to tokens; create a fresh token for outbound links.
  }

  const token = crypto.randomBytes(24).toString('base64url');
  await prisma.publicShareToken.create({
    data: {
      tokenHash: hashToken(token),
      resourceType,
      resourceId,
      purpose,
      expiresAt: addDays(ttlDays),
    },
  });
  return token;
};

const resolvePublicShareToken = async ({ token, purpose }) => {
  const normalized = String(token || '').trim();
  if (!normalized || normalized.length < 24) return null;

  const share = await prisma.publicShareToken.findFirst({
    where: {
      tokenHash: hashToken(normalized),
      purpose,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!share) return null;

  await prisma.publicShareToken.update({
    where: { id: share.id },
    data: {
      accessCount: { increment: 1 },
      lastAccessAt: new Date(),
    },
  });

  return share;
};

module.exports = {
  createPublicShareToken,
  resolvePublicShareToken,
};
