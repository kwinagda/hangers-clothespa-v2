const crypto = require('crypto');
const prisma = require('../config/database');

const DEFAULT_TTL_DAYS = 30;
const MAX_PUBLIC_SHARE_INVOICES = 100;

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || DEFAULT_TTL_DAYS));
  return date;
};

const normalizeInvoiceScope = (invoiceIds, resourceType, purpose) => {
  if (invoiceIds === undefined || invoiceIds === null) return undefined;
  if (resourceType !== 'CUSTOMER' || purpose !== 'INVOICE_VIEW' || !Array.isArray(invoiceIds)
    || invoiceIds.length < 1 || invoiceIds.length > MAX_PUBLIC_SHARE_INVOICES) {
    throw new TypeError('A customer invoice share requires between 1 and 100 invoice IDs');
  }
  const normalized = invoiceIds.map((id) => String(id || '').trim());
  if (normalized.some((id) => !id) || new Set(normalized).size !== normalized.length) {
    throw new TypeError('Customer invoice share IDs must be non-empty and unique');
  }
  return normalized;
};

const createPublicShareToken = async ({ resourceType, resourceId, purpose, invoiceIds, ttlDays = DEFAULT_TTL_DAYS }) => {
  if (!resourceType || !resourceId || !purpose) return null;
  const scopedInvoiceIds = normalizeInvoiceScope(invoiceIds, resourceType, purpose);

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
      ...(scopedInvoiceIds ? { invoiceIds: scopedInvoiceIds } : {}),
      expiresAt: addDays(ttlDays),
    },
  });
  return token;
};

const resolvePublicShareToken = async ({ token, purpose }) => {
  const share = await findPublicShareToken({ token, purpose });
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

const findPublicShareToken = async ({ token, purpose }) => {
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
  return share;
};

module.exports = {
  MAX_PUBLIC_SHARE_INVOICES,
  createPublicShareToken,
  findPublicShareToken,
  resolvePublicShareToken,
};
