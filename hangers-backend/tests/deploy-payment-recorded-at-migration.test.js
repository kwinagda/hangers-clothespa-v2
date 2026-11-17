const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertReleaseScope, migration, reviewedChecksum, verifyReviewedSql } = require('../../scripts/deploy/migrate-payment-recorded-at.cjs');

const root = path.join(__dirname, '../..');
const revision = 'a'.repeat(40);
const migrationNames = fs.readdirSync(path.join(__dirname, '../prisma/migrations')).filter(name => /^\d{14}_/.test(name));
const migrationBytes = fs.readFileSync(path.join(__dirname, '../prisma/migrations', migration, 'migration.sql'));
const baseHistory = migrationNames.filter(name => name !== migration).map(migration_name => ({
  migration_name,
  checksum: 'b'.repeat(64),
  finished_at: new Date(),
  rolled_back_at: null,
}));

test('only the exact reviewed SQL bytes can be released', () => {
  assert.equal(crypto.createHash('sha256').update(migrationBytes).digest('hex'), reviewedChecksum);
  assert.doesNotThrow(() => verifyReviewedSql(migrationBytes));
  assert.throws(() => verifyReviewedSql(Buffer.from(`${migrationBytes}\n-- unreviewed`)));
});

test('release policy allows only this migration on the exact main production target', () => {
  assert.deepEqual(
    assertReleaseScope(revision, revision, 'postgresql://localhost/hangers_prod', baseHistory, migrationNames),
    [migration],
  );
  assert.deepEqual(
    assertReleaseScope(revision, revision, 'postgresql://localhost/hangers_prod', [
      ...baseHistory,
      { migration_name: migration, checksum: reviewedChecksum, finished_at: new Date(), rolled_back_at: null },
    ], migrationNames),
    [],
  );

  for (const [main, url, history, expected] of [
    ['b'.repeat(40), 'postgresql://localhost/hangers_prod', baseHistory, migrationNames],
    [revision, 'postgresql://localhost/hangers_db', baseHistory, migrationNames],
    [revision, 'postgresql://remote/hangers_prod', baseHistory, migrationNames],
    [revision, 'mysql://localhost/hangers_prod', baseHistory, migrationNames],
    [revision, 'postgresql://localhost/hangers_prod', [{ migration_name: 'failed' }], migrationNames],
    [revision, 'postgresql://localhost/hangers_prod', baseHistory, [...migrationNames, 'unreviewed_migration']],
    [revision, 'postgresql://localhost/hangers_prod', [...baseHistory, { migration_name: 'unreviewed_migration' }], migrationNames],
    [revision, 'postgresql://localhost/hangers_prod', [...baseHistory, { migration_name: migration, checksum: 'c'.repeat(64), finished_at: new Date(), rolled_back_at: null }], migrationNames],
    [revision, 'postgresql://localhost/hangers_prod', baseHistory, migrationNames.filter(name => name !== migration)],
  ]) assert.throws(() => assertReleaseScope(revision, main, url, history, expected));

  assert.throws(
    () => assertReleaseScope(revision, revision, 'postgresql://localhost/hangers_prod', baseHistory.slice(1), migrationNames),
    (error) => {
      assert.equal(error.code, 'OTHER_MIGRATIONS_PENDING');
      assert.equal(error.safeContext, `count=1;names=${migrationNames[0]}`);
      return true;
    },
  );
  assert.throws(
    () => assertReleaseScope(revision, revision, 'postgresql://localhost/hangers_prod', [
      ...baseHistory,
      { migration_name: '20261117100000_untracked_applied_migration', checksum: 'd'.repeat(64), finished_at: new Date(), rolled_back_at: null },
    ], migrationNames),
    (error) => {
      assert.equal(error.code, 'DATABASE_HAS_UNEXPECTED_APPLIED_MIGRATION');
      assert.equal(error.safeContext, 'count=1;names=20261117100000_untracked_applied_migration');
      return true;
    },
  );
  assert.throws(
    () => assertReleaseScope(revision, revision, 'postgresql://remote/hangers_prod', baseHistory, migrationNames),
    { code: 'DATABASE_TARGET_NOT_EXPECTED' },
  );
});

test('data SQL preserves effective dates and leaves non-unique audit evidence unknown', () => {
  const sql = migrationBytes.toString('utf8');
  assert.match(sql, /COUNT\(DISTINCT audit_id\) = 1/);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /audit\.status = 'SUCCESS'/);
  assert.match(sql, /payment\."recordedAt" IS NULL/);
  assert.match(sql, /'PAYMENT_RECORDED'/);
  assert.match(sql, /'DELIVERY_CASH_COLLECTED'/);
  assert.match(sql, /'WALLET_APPLIED_TO_ORDER'/);
  assert.match(sql, /'ORDER_REFUND_ISSUED'/);
  assert.match(sql, /'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED'/);
  assert.doesNotMatch(sql, /SET\s+"createdAt"|AT\s+TIME\s+ZONE|INTERVAL/i);
  assert.doesNotMatch(sql, /ALTER COLUMN "recordedAt" SET NOT NULL/i);
});

test('production workflow keeps the payment data migration explicitly gated and backed up', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-production.yml'), 'utf8');
  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy/migrate-payment-recorded-at.cjs'), 'utf8');
  assert.match(workflow, /migrate_payment_recorded_at:[\s\S]*default: false[\s\S]*type: boolean/);
  assert.match(workflow, /Require the payment timestamp migration gate[\s\S]*MIGRATE_PAYMENT_RECORDED_AT[\s\S]*Refusing deployment:[\s\S]*migrate_payment_recorded_at/);
  assert.match(workflow, /migrate-payment-recorded-at\.cjs/);
  assert.match(workflow, /--approved-payment-recorded-at/);
  assert.match(workflow, /trap 'rm -f "\\\$migration_script" "\\\$payment_migration_script" "\\\$deploy_script"' EXIT/);
  assert.match(deployScript, /pg_dump/);
  assert.match(deployScript, /pg_restore.*--list/);
  assert.match(deployScript, /Payment recorded-time migration failed during \$\{phase\}/);
  assert.doesNotMatch(deployScript, /error\.message/);
  assert.match(deployScript, /assertReleaseScope\(revision, currentMain, process\.env\.DATABASE_URL/);
});
