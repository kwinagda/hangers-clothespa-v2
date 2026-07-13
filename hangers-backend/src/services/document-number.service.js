const prisma = require('../config/database');
const { randomUUID } = require('crypto');

const nextSequenceValue = async (tx, { documentType, scope = 'DEFAULT', period = 'ALL' }) => {
  const sequenceKey = `${scope}:${documentType}:${period}`;
  const rows = await tx.$queryRaw`
    INSERT INTO "document_sequences" (
      "id", "sequenceKey", "scope", "documentType", "period", "nextValue", "createdAt", "updatedAt"
    )
    VALUES (
      ${`sequence-${randomUUID()}`}, ${sequenceKey}, ${scope}, ${documentType}, ${period}, 2, NOW(), NOW()
    )
    ON CONFLICT ("sequenceKey") DO UPDATE
      SET "nextValue" = "document_sequences"."nextValue" + 1,
          "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS value
  `;
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${documentType} sequence value`);
  return value;
};

const nextDocumentNumber = async ({
  tx = prisma,
  documentType,
  scope = 'DEFAULT',
  period = 'ALL',
  prefix,
  padding = 3,
  suffix = '',
}) => {
  const value = await nextSequenceValue(tx, { documentType, scope, period });
  return `${prefix}${String(value).padStart(padding, '0')}${suffix}`;
};

module.exports = { nextDocumentNumber, nextSequenceValue };
