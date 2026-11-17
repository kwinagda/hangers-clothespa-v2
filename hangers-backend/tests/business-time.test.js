const test = require('node:test');
const assert = require('node:assert/strict');
const { addBusinessDateDays, businessDateKey, parseBusinessDateBoundary, parseBusinessDateTime, parseBusinessMonthBoundary } = require('../src/utils/business-time');

test('business day uses the configured IST boundary', () => {
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'start').toISOString(), '2026-07-12T18:30:00.000Z');
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'end').toISOString(), '2026-07-13T18:29:59.999Z');
});

test('business date key does not group early IST hours into prior UTC day', () => {
  assert.equal(businessDateKey('2026-07-12T19:00:00.000Z'), '2026-07-13');
  assert.equal(businessDateKey('2026-02-30'), null);
});

test('business date boundaries are independent of the host process timezone', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'UTC';
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'start').toISOString(), '2026-07-12T18:30:00.000Z');
  process.env.TZ = 'America/Los_Angeles';
  assert.equal(parseBusinessDateBoundary('2026-07-13', 'end').toISOString(), '2026-07-13T18:29:59.999Z');
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

test('business date boundaries reject impossible calendar dates', () => {
  assert.equal(parseBusinessDateBoundary('2026-02-30', 'start'), null);
});

test('business month boundaries remain correct when the host process runs in UTC', () => {
  assert.equal(parseBusinessMonthBoundary(2026, 7, 'start').toISOString(), '2026-06-30T18:30:00.000Z');
  assert.equal(parseBusinessMonthBoundary(2026, 7, 'end').toISOString(), '2026-07-31T18:29:59.999Z');
});

test('business date-time conversion uses timezone rules and rejects invalid input', () => {
  const originalTimezone = process.env.BUSINESS_TIMEZONE;
  const originalOffset = process.env.BUSINESS_UTC_OFFSET;
  process.env.BUSINESS_TIMEZONE = 'Asia/Kolkata';
  delete process.env.BUSINESS_UTC_OFFSET;
  assert.equal(parseBusinessDateTime('2026-07-13', '12:00:00').toISOString(), '2026-07-13T06:30:00.000Z');
  assert.equal(parseBusinessDateTime('2026-02-30', '12:00:00'), null);
  assert.equal(parseBusinessDateTime('2026-07-13', '25:00'), null);
  if (originalTimezone === undefined) delete process.env.BUSINESS_TIMEZONE;
  else process.env.BUSINESS_TIMEZONE = originalTimezone;
  if (originalOffset === undefined) delete process.env.BUSINESS_UTC_OFFSET;
  else process.env.BUSINESS_UTC_OFFSET = originalOffset;
});

test('business calendar arithmetic does not depend on the process timezone', () => {
  assert.equal(addBusinessDateDays('2026-07-01', -1), '2026-06-30');
  assert.equal(addBusinessDateDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addBusinessDateDays('2026-02-30', 1), null);
});
