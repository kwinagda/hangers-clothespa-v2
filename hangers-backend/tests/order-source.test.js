const test = require('node:test');
const assert = require('node:assert/strict');

const { ORDER_SOURCES } = require('../src/config/master-data');
const { normalizeOrderSource } = require('../src/utils/order-source');

test('counter source aliases normalize to store received status', () => {
  for (const raw of ['COUNTER', 'counter', 'walk-in', 'walk_in', 'CRM', 'store']) {
    const normalized = normalizeOrderSource(raw, ORDER_SOURCES);

    assert.equal(normalized.value, 'COUNTER');
    assert.equal(normalized.initialStatus, 'PICKED_UP');
  }
});

test('customer app source aliases normalize to pickup pending status', () => {
  for (const raw of ['CUSTOMER_APP', 'customer-app', 'app', 'mobile', 'online']) {
    const normalized = normalizeOrderSource(raw, ORDER_SOURCES);

    assert.equal(normalized.value, 'CUSTOMER_APP');
    assert.equal(normalized.initialStatus, 'PENDING');
  }
});

test('unknown order source fails closed', () => {
  assert.equal(normalizeOrderSource('random-channel', ORDER_SOURCES), null);
});

