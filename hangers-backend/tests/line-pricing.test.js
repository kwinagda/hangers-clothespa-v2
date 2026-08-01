const test = require('node:test');
const assert = require('node:assert/strict');
const { roundCashAmount } = require('../src/utils/line-pricing');

test('roundCashAmount rounds to nearest rupee with 50 paise going down', () => {
  assert.equal(roundCashAmount(100), 100);
  assert.equal(roundCashAmount(100.01), 100);
  assert.equal(roundCashAmount(100.49), 100);
  assert.equal(roundCashAmount(100.5), 100);
  assert.equal(roundCashAmount(100.51), 101);
  assert.equal(roundCashAmount(100.99), 101);
});

