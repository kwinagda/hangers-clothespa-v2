const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cashEntrySchema,
  couponCreateSchema,
  recurringPickupSchema,
  reportQuerySchema,
  advancedSearchQuerySchema,
  automationSchema,
} = require('../src/validation/phaseA.schemas');

test('cashEntrySchema rejects negative amount', () => {
  const parsed = cashEntrySchema.safeParse({ type: 'IN', amount: -10, description: 'Bad' });
  assert.equal(parsed.success, false);
});

test('couponCreateSchema accepts valid coupon payload', () => {
  const parsed = couponCreateSchema.safeParse({ code: 'SAVE10', type: 'PERCENT', value: 10, minOrderValue: 0 });
  assert.equal(parsed.success, true);
});

test('recurringPickupSchema requires dayOfWeek/dayOfMonth only by downstream business rule, but base payload stays valid', () => {
  const parsed = recurringPickupSchema.safeParse({ customerId: 'c1', frequency: 'WEEKLY', address: 'Addr', dayOfWeek: 2 });
  assert.equal(parsed.success, true);
});

test('reportQuerySchema rejects unsupported report type', () => {
  const parsed = reportQuerySchema.safeParse({ type: 'foobar' });
  assert.equal(parsed.success, false);
});

test('advancedSearchQuerySchema enforces positive page and limit max 100', () => {
  const parsed = advancedSearchQuerySchema.safeParse({ type: 'orders', page: 0, limit: 101 });
  assert.equal(parsed.success, false);
});

test('automationSchema rejects negative delay hours', () => {
  const parsed = automationSchema.safeParse({ name: 'A', trigger: 'T', message: 'M', delayHours: -1, channel: 'WHATSAPP' });
  assert.equal(parsed.success, false);
});
