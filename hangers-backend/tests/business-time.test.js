const test = require('node:test');
const assert = require('node:assert/strict');
const { businessDateKey, parseBusinessDateBoundary } = require('../src/utils/business-time');

test('business day uses the configured IST boundary', () => {
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'start').toISOString(), '2026-07-12T18:30:00.000Z');
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'end').toISOString(), '2026-07-13T18:29:59.999Z');
});

test('business date key does not group early IST hours into prior UTC day', () => {
  assert.equal(businessDateKey('2026-07-12T19:00:00.000Z'), '2026-07-13');
});
