'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrationName, migrationHash, requiredColumns, assertReleaseScope, isMigrationSchemaComplete } = require('../../scripts/deploy/migrate-duplicate-capture-refunds.cjs');

const revision = '3cd0e9843a91a912220ab419bb0b59ebb8c6489d';
const databaseUrl = 'postgresql://deploy:secret@localhost:5432/hangers_prod';
const migrationNames = [
  '20260929000000_razorpay_checkout_allocation_plan',
  '20260930160000_razorpay_saved_cards',
  '20260930170000_razorpay_virtual_account_bindings',
  '20261002120000_razorpay_payment_journey_events',
  migrationName,
  '20261006090000_customer_share_invoice_scope',
];
const history = migrationNames
  .filter((name) => name !== migrationName)
  .map((migration_name) => ({ migration_name, checksum: 'previously-reviewed', finished_at: new Date(), rolled_back_at: null }));

test('allows only the reviewed duplicate-capture migration to be pending on production', () => {
  assert.equal(assertReleaseScope(revision, revision, databaseUrl, history, migrationNames), true);
});

test('accepts an already-applied migration only with its reviewed checksum', () => {
  const applied = [...history, {
    migration_name: migrationName,
    checksum: migrationHash,
    finished_at: new Date(),
    rolled_back_at: null,
  }];
  assert.equal(assertReleaseScope(revision, revision, databaseUrl, applied, migrationNames), false);
});

test('leaves unrelated pending migrations alone while applying only the reviewed migration', () => {
  assert.equal(assertReleaseScope(revision, revision, databaseUrl, history, migrationNames), true);
});

test('rejects an unreviewed checksum, non-production target, and stale deployment SHA', () => {
  const altered = [...history, {
    migration_name: migrationName,
    checksum: 'not-the-reviewed-checksum',
    finished_at: new Date(),
    rolled_back_at: null,
  }];
  assert.throws(() => assertReleaseScope(revision, revision, databaseUrl, altered, migrationNames), /checksum differs/);
  assert.throws(() => assertReleaseScope(revision, revision, 'postgresql://deploy:secret@localhost:5432/hangers_db', history, migrationNames), /Unexpected production database/);
  assert.throws(() => assertReleaseScope(revision, 'a'.repeat(40), databaseUrl, history, migrationNames), /Exact current-main revision/);
});

test('deployment workflow exposes and invokes only the gated migration input', () => {
  const fs = require('node:fs');
  const workflow = fs.readFileSync(require.resolve('../../.github/workflows/deploy-production.yml'), 'utf8');
  assert.match(workflow, /migrate_duplicate_capture_refunds:/);
  assert.match(workflow, /inputs\.migrate_duplicate_capture_refunds }}' == 'true'/);
  assert.match(workflow, /--approved-duplicate-capture-schema/);
});

test('migration runner uses one transactional SQL file and records it without applying every pending migration', () => {
  const fs = require('node:fs');
  const runner = fs.readFileSync(require.resolve('../../scripts/deploy/migrate-duplicate-capture-refunds.cjs'), 'utf8');
  assert.match(runner, /--single-transaction/);
  assert.match(runner, /migrate', 'resolve', '--applied'/);
  assert.doesNotMatch(runner, /'migrate', 'deploy'/);
  assert.match(runner, /pg_dump/);
  assert.match(runner, /pg_restore/);
});

test('reviewed migration SQL checksum remains exact', () => {
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const sql = fs.readFileSync(require.resolve('../prisma/migrations/20261005120000_razorpay_duplicate_capture_refunds/migration.sql'));
  assert.equal(crypto.createHash('sha256').update(sql).digest('hex'), migrationHash);
});

test('migration reconciliation accepts only all expected columns with matching types and nullability', () => {
  const columns = requiredColumns.map(([table_name, column_name, data_type, is_nullable]) => ({ table_name, column_name, data_type, is_nullable }));
  const index = [{ indexname: 'razorpay_refund_attempts_automatic_status_nextAttemptAt_idx' }];
  assert.equal(isMigrationSchemaComplete(columns, index), true);
  assert.equal(isMigrationSchemaComplete(columns.slice(1), index), false);
  assert.equal(isMigrationSchemaComplete(columns.map((column, i) => i ? column : { ...column, is_nullable: 'YES' }), index), false);
  assert.equal(isMigrationSchemaComplete(columns, []), false);
});
