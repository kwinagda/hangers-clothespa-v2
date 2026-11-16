const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath = require.resolve('../src/config/database');
const servicePath = require.resolve('../src/services/publicShare.service');

const loadService = (prisma) => {
  delete require.cache[servicePath];
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: prisma };
  return require(servicePath);
};

test('durable document reads ignore legacy expiry while payment lookup remains time-bound', async () => {
  const queries = [];
  const prisma = {
    publicShareToken: {
      findFirst: async ({ where }) => { queries.push(where); return { id: 'share-1' }; },
      update: async () => ({}),
    },
  };
  const { findPublicShareToken } = loadService(prisma);

  await findPublicShareToken({ token: 'a'.repeat(32), purpose: 'INVOICE_VIEW', allowExpiredDocument: true });
  await findPublicShareToken({ token: 'a'.repeat(32), purpose: 'INVOICE_VIEW' });
  await findPublicShareToken({ token: 'a'.repeat(32), purpose: 'QUOTATION_VIEW', allowExpiredDocument: true });

  assert.equal(queries[0].expiresAt, undefined);
  assert.ok(queries[1].expiresAt.gt instanceof Date);
  assert.equal(queries[2].expiresAt, undefined);
  assert.equal(queries[0].revokedAt, null);
});

test('new share records retain actor and channel provenance', async () => {
  let created;
  const prisma = {
    publicShareToken: {
      findFirst: async () => null,
      create: async ({ data }) => { created = data; return data; },
    },
  };
  const { createPublicShareToken } = loadService(prisma);
  await createPublicShareToken({
    resourceType: 'INVOICE', resourceId: 'invoice-1', purpose: 'INVOICE_VIEW',
    createdByType: 'STAFF', createdById: 'staff-1', creationSource: 'CRM_FINANCE', creationReason: 'INVOICE_SHARE',
  });
  assert.equal(created.createdByType, 'STAFF');
  assert.equal(created.createdById, 'staff-1');
  assert.equal(created.creationSource, 'CRM_FINANCE');
  assert.equal(created.creationReason, 'INVOICE_SHARE');
});

test.after(() => {
  delete require.cache[servicePath];
  delete require.cache[databasePath];
});
