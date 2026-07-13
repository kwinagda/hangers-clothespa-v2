// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CLIENT — Prisma singleton (reuse connection across requests)
// ─────────────────────────────────────────────────────────────────────────────

const { Prisma, PrismaClient } = require('@prisma/client');

const normalizeDatabaseValue = (value) => {
  if (Prisma.Decimal.isDecimal(value)) {
    const normalized = value.toNumber();
    if (!Number.isSafeInteger(Math.round(normalized * 10000))) {
      throw new RangeError('A database decimal exceeds the safe CRM numeric range');
    }
    return normalized;
  }
  if (Array.isArray(value)) return value.map(normalizeDatabaseValue);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;

  for (const key of Object.keys(value)) {
    value[key] = normalizeDatabaseValue(value[key]);
  }
  return value;
};

const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (!global.prismaDecimalNormalizationInstalled) {
  prisma.$use(async (params, next) => normalizeDatabaseValue(await next(params)));
  if (process.env.NODE_ENV !== 'production') global.prismaDecimalNormalizationInstalled = true;
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

module.exports = prisma;
