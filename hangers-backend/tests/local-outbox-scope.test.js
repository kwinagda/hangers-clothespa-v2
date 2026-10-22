const test = require('node:test');
const assert = require('node:assert/strict');
const { homeOutboxScope, localOutboxEnabled } = require('../src/utils/local-outbox-scope');

const mockDatabase = (businessPhone = '+919930367267', homeExists = true) => {
  const calls = [];
  const db = {
    customer: { findMany: async (query) => {
      calls.push(query);
      assert.deepEqual(query.where.phone.in, ['9930367267', '919930367267', '+919930367267']);
      return homeExists ? [{ id: 'home' }] : [];
    } },
    setting: { findUnique: async () => ({ value: JSON.stringify({ phone: businessPhone }) }) },
  };
  for (const model of ['order', 'invoice', 'ironBill', 'ironLog', 'ironSubscription']) {
    db[model] = { findMany: async (query) => {
      calls.push(query);
      assert.deepEqual(query.where.customerId.in, homeExists ? ['home'] : []);
      return homeExists ? [{ id: `${model}-home` }] : [];
    } };
  }
  db.websitePickupRequest = { findMany: async (query) => {
    calls.push(query);
    assert.deepEqual(query.where.phone.in, ['9930367267', '919930367267', '+919930367267']);
    return homeExists ? [{ id: 'pickup-home' }] : [];
  } };
  return { db, calls };
};

test('enabled local dispatch always requires the explicit Home-only flag', () => {
  assert.equal(localOutboxEnabled({ outboxWorker: 'false' }), true);
  assert.equal(localOutboxEnabled({ outboxWorker: 'true', outboxHomeOnly: 'true' }), true);
  assert.equal(localOutboxEnabled({ outboxWorker: 'true' }), false);
  assert.equal(localOutboxEnabled({ outboxWorker: 'true', outboxHomeOnly: 'false' }), false);
});

test('Home scope covers every customer WhatsApp outbox module without referral work', async () => {
  const { db } = mockDatabase();
  const scope = await homeOutboxScope(db);
  assert.deepEqual(scope.OR, [
    { eventType: { in: ['ORDER_STATUS', 'ORDER_UPDATED', 'PAYMENT_RECEIVED'] }, aggregateId: { in: ['order-home'] } },
    { eventType: { in: ['INVOICE_PAYMENT_RECEIVED'] }, aggregateId: { in: ['invoice-home'] } },
    { eventType: { in: ['DAILY_IRON_BILL', 'DAILY_IRON_PAYMENT'] }, aggregateId: { in: ['ironBill-home'] } },
    { eventType: { in: ['DAILY_IRON_LOG'] }, aggregateId: { in: ['ironLog-home'] } },
    { eventType: { in: ['DAILY_IRON_LOG_BATCH'] }, aggregateId: { in: ['ironSubscription-home'] } },
    { eventType: { in: ['PICKUP_REQUEST_CUSTOMER_CONFIRMATION', 'PICKUP_REQUEST_CREATED'] }, aggregateId: { in: ['pickup-home'] } },
  ]);
});

test('pickup business alerts are excluded when the destination is not Home', async () => {
  const { db } = mockDatabase('919876543210');
  const scope = await homeOutboxScope(db);
  assert.deepEqual(scope.OR.at(-1).eventType.in, ['PICKUP_REQUEST_CUSTOMER_CONFIRMATION']);
});

test('malformed business configuration never expands the Home scope', async () => {
  const { db } = mockDatabase();
  db.setting.findUnique = async () => ({ value: '{bad JSON' });
  const scope = await homeOutboxScope(db);
  assert.deepEqual(scope.OR.at(-1).eventType.in, ['PICKUP_REQUEST_CUSTOMER_CONFIRMATION']);
});

test('missing Home resources produces an empty, deny-all scope', async () => {
  const { db } = mockDatabase('', false);
  assert.deepEqual(await homeOutboxScope(db), { OR: [] });
});
