const test = require('node:test');
const assert = require('node:assert/strict');

const { ACTIVE_IRON_SUB_STATUSES, IRON_SUBSCRIPTION_STATUSES } = require('../src/config/master-data');
const { isBillableDailyIronService } = require('../src/controllers/iron.controller');

test('only active Daily Iron subscriptions can accept new usage logs', () => {
  assert.deepEqual(ACTIVE_IRON_SUB_STATUSES, ['ACTIVE']);
  assert.ok(IRON_SUBSCRIPTION_STATUSES.includes('PAUSED'));
  assert.equal(ACTIVE_IRON_SUB_STATUSES.includes('PAUSED'), false);
});

test('Daily Iron logging requires active positive-priced service', () => {
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: true, basePrice: 0 }), false);
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: false, basePrice: 10 }), false);
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: true, basePrice: 10 }), true);
});
