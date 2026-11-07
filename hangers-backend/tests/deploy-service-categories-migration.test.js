const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261107120000_service_categories/migration.sql'), 'utf8');
const deployScript = fs.readFileSync(path.join(__dirname, '../../scripts/deploy/migrate-service-categories.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-production.yml'), 'utf8');

test('category migration is additive and deploy-gated with backup and exact allowlist', () => {
  assert.match(migration, /CREATE TABLE "ServiceCategory"/);
  assert.match(migration, /CREATE UNIQUE INDEX "ServiceCategory_normalizedName_key"/);
  assert.doesNotMatch(migration, /DROP |DELETE |UPDATE /i);
  assert.match(deployScript, /const migration = '20261107120000_service_categories'/);
  assert.match(deployScript, /pending\.some\(\(name\) => name !== migration\)/);
  assert.match(deployScript, /pg_dump/);
  assert.match(deployScript, /pg_restore.*--list/);
  assert.match(workflow, /migrate_service_categories/);
});
