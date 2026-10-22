const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { reviewed, assertReleaseScope } = require('../../scripts/deploy/migrate-custom-checkout.cjs');
const sha = 'a'.repeat(40);
const names = Object.keys(reviewed);
const done = names.map(migration_name => ({ migration_name, checksum: reviewed[migration_name], finished_at: new Date(), rolled_back_at: null }));

test('only exact approved Custom SQL bytes match the migration manifest', () => {
  for (const name of names) {
    const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'));
    assert.equal(crypto.createHash('sha256').update(sql).digest('hex'), reviewed[name]);
  }
});
test('Custom migration policy refuses wrong targets, revisions and unrelated history', () => {
  assert.deepEqual(assertReleaseScope(sha, sha, 'postgresql://localhost/hangers_prod', [], names), names);
  assert.deepEqual(assertReleaseScope(sha, sha, 'postgresql://localhost/hangers_prod', done, names), []);
  for (const [revision, main, url, history, expected] of [
    ['bad', sha, 'postgresql://localhost/hangers_prod', [], names],
    [sha, 'b'.repeat(40), 'postgresql://localhost/hangers_prod', [], names],
    [sha, sha, 'postgresql://localhost/hangers_db', [], names],
    [sha, sha, 'postgresql://remote/hangers_prod', [], names],
    [sha, sha, 'postgresql://127.0.0.1/hangers_prod', [], names],
    [sha, sha, 'mysql://localhost/hangers_prod', [], names],
    [sha, sha, 'postgresql://localhost/hangers_prod', [{ migration_name: 'failed' }], names],
    [sha, sha, 'postgresql://localhost/hangers_prod', [], [...names, 'unreviewed']],
    [sha, sha, 'postgresql://localhost/hangers_prod', [{ ...done[0], checksum: 'changed' }], names],
    [sha, sha, 'postgresql://localhost/hangers_prod', [], names.slice(1)],
  ]) assert.throws(() => assertReleaseScope(revision, main, url, history, expected));
});

test('production migration dispatch preserves remote cleanup variables and requires explicit schema gate', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-production.yml'), 'utf8');
  assert.ok(workflow.includes(String.raw`trap 'rm -f "\$migration_script" "\$custom_script" "\$deploy_script"' EXIT`));
  assert.ok(workflow.includes("inputs.migrate_combined_checkout }}' == 'true' && '${{ inputs.migrate_custom_checkout }}' == 'true'"));
  assert.ok(workflow.includes("'$COMMIT' --approved-custom-schema"));
});
