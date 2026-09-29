const test = require('node:test');
const assert = require('node:assert/strict');

const { matchesLocalQaConfiguration, matchesLocalQaProfile } = require('../src/utils/local-qa-profile');

const validConfiguration = {
  databaseUrl: 'postgresql://postgres:qa-only@localhost:5432/hangers_db',
  razorpayKeyId: 'rzp_test_example',
  outboxWorker: 'false',
  skipStartupSync: 'true',
};

const validProfile = {
  isProduction: false,
  databaseName: 'hangers_db',
  databaseUser: 'postgres',
  databaseAddress: '::1',
  databasePort: 5432,
  razorpayKeyId: 'rzp_test_example',
  outboxWorker: 'false',
  skipStartupSync: 'true',
};

test('accepts only the expected loopback Test-mode QA runtime profile', () => {
  assert.equal(matchesLocalQaProfile(validProfile), true);
  assert.equal(matchesLocalQaProfile({ ...validProfile, databaseAddress: '127.0.0.1' }), true);
});

test('accepts the canonical local Test-mode connection configuration', () => {
  assert.equal(matchesLocalQaConfiguration(validConfiguration), true);
});

for (const [description, field, value] of [
  ['malformed URL', 'databaseUrl', 'not a URL'],
  ['non-local host', 'databaseUrl', 'postgresql://postgres:qa-only@127.0.0.1:5432/hangers_db'],
  ['wrong port', 'databaseUrl', 'postgresql://postgres:qa-only@localhost:5433/hangers_db'],
  ['wrong database', 'databaseUrl', 'postgresql://postgres:qa-only@localhost:5432/other_db'],
  ['wrong role', 'databaseUrl', 'postgresql://other:qa-only@localhost:5432/hangers_db'],
  ['Live key', 'razorpayKeyId', 'rzp_live_example'],
  ['enabled outbox worker', 'outboxWorker', 'true'],
  ['enabled startup sync', 'skipStartupSync', 'false'],
]) {
  test(`rejects local QA configuration with ${description}`, () => {
    assert.equal(matchesLocalQaConfiguration({ ...validConfiguration, [field]: value }), false);
  });
}

for (const [field, value] of [
  ['isProduction', true],
  ['databaseName', 'other_db'],
  ['databaseUser', 'other_user'],
  ['databaseAddress', '10.0.0.4'],
  ['databasePort', 5433],
  ['razorpayKeyId', 'rzp_live_example'],
  ['outboxWorker', 'true'],
  ['skipStartupSync', 'false'],
]) {
  test(`rejects a local QA profile with mismatched ${field}`, () => {
    assert.equal(matchesLocalQaProfile({ ...validProfile, [field]: value }), false);
  });
}
