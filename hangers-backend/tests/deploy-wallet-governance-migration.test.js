const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261117123000_wallet_adjustment_origin/migration.sql'), 'utf8');
const deployScript = fs.readFileSync(path.join(__dirname, '../../scripts/deploy/migrate-wallet-governance.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-production.yml'), 'utf8');

test('wallet governance migration is narrowly deploy-gated with backup and exact allowlist', () => {
  assert.match(migration, /ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'SYSTEM'/);
  assert.match(migration, /CREATE UNIQUE INDEX "wallet_transactions_reversalOfId_key"/);
  assert.doesNotMatch(migration, /DROP |DELETE /i);
  assert.match(deployScript, /const migration = '20261117123000_wallet_adjustment_origin'/);
  assert.match(deployScript, /pending\.some\(\(name\) => name !== migration\)/);
  assert.match(deployScript, /pg_dump/);
  assert.match(deployScript, /pg_restore.*--list/);
  assert.match(deployScript, /Unexpected production database target/);
  assert.match(workflow, /migrate_wallet_governance:/);
  assert.match(workflow, /git show '\$COMMIT:scripts\/deploy\/migrate-wallet-governance\.cjs'/);
});
