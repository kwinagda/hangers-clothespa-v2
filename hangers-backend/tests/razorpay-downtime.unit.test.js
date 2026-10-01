const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const downtime = require('../src/services/razorpay-downtime.service');

const incident = (changes = {}) => ({
  id: 'down_contract', entity: 'payment.downtime', method: 'netbanking',
  begin: 1591946222, end: null, status: 'started', scheduled: false, severity: 'high',
  instrument: { bank: 'SBIN' }, created_at: 1591946223, updated_at: 1591946297,
  ...changes,
});

test('downtime matching uses exact documented instrument constraints', () => {
  const options = { now: 1600000000000 };
  assert.equal(downtime.matchRazorpayDowntime(incident(), { method: 'netbanking', bank: 'SBIN' }, options).action, 'warn');
  assert.equal(downtime.matchRazorpayDowntime(incident(), { method: 'netbanking', bank: 'HDFC' }, options).action, 'none');
  assert.equal(downtime.matchRazorpayDowntime(incident(), { method: 'netbanking' }, options).action, 'unknown');
  assert.equal(downtime.matchRazorpayDowntime(incident(), { method: 'netbanking', bank: 'SBIN' }, { ...options, stale: true }).action, 'unknown');
  assert.equal(downtime.matchRazorpayDowntime(incident(), { method: 'netbanking', bank: 'SBIN' }, options).disabled, false);
});

test('unknown constraints never expand matching and elapsed end is not resolution', () => {
  assert.equal(downtime.normalizeRazorpayDowntime(incident({ instrument: { bank: 'SBIN', unknown: 'constraint' } })).schemaKnown, false);
  assert.equal(downtime.matchRazorpayDowntime(incident({ end: 1591946300 }), { method: 'netbanking', bank: 'SBIN' }, { now: 1600000000000 }).action, 'warn');
  assert.equal(downtime.matchRazorpayDowntime(incident({ status: 'resolved' }), { method: 'netbanking', bank: 'SBIN' }, { now: 1600000000000 }).action, 'none');
});

test('UPI handle prefix is normalized without guessing app-to-PSP identifiers', () => {
  const upi = incident({ method: 'upi', instrument: { vpa_handle: 'oksbi' } });
  assert.equal(downtime.matchRazorpayDowntime(upi, { method: 'upi', vpa_handle: '@oksbi' }).action, 'warn');
  assert.equal(downtime.matchRazorpayDowntime(upi, { method: 'upi', app: 'gpay' }).action, 'unknown');
});

test('downtime snapshots and webhook reconciliation preserve durable evidence', async (t) => {
  const env = { ...process.env };
  const originalTransaction = prisma.$transaction;
  t.after(async () => {
    prisma.$transaction = originalTransaction;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await prisma.$disconnect();
  });
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_downtime_contract', RAZORPAY_KEY_SECRET: 'isolated-secret', RAZORPAY_ACCOUNT_ID_TEST: 'acc_contract' });
  delete process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED;
  let current = incident();
  let items = [current];
  let unavailable = false;
  let history = [];
  let lease = 1;
  let evidence;
  const provider = { payments: {
    fetchPaymentDowntime: async () => {
      if (unavailable) throw new Error('private-provider-error');
      return { entity: 'collection', count: items.length, items };
    },
    fetchPaymentDowntimeById: async () => current,
  } };
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback({ razorpayWebhookEvent: {
      findMany: async () => history,
      updateMany: async (args) => { evidence = args; return { count: lease }; },
    } });
  };
  const event = (status) => ({ id: 'event-fixture', mode: 'TEST', attempts: 2, event: `payment.downtime.${status}`, payload: { accountId: 'acc_contract', downtime: incident({ status }) } });

  await t.test('fresh snapshot becomes stale on outage without leaking raw error', async () => {
    assert.equal((await downtime.getRazorpayDowntimeSnapshot({ provider, refresh: true })).status, 'fresh');
    unavailable = true;
    const snapshot = await downtime.getRazorpayDowntimeSnapshot({ provider, refresh: true });
    assert.equal(snapshot.status, 'stale');
    assert.equal(snapshot.incidents.length, 1);
    assert.doesNotMatch(JSON.stringify(snapshot), /private-provider-error/);
    unavailable = false;
  });
  await t.test('absence from list re-fetches rather than inventing resolution', async () => {
    items = [];
    const snapshot = await downtime.getRazorpayDowntimeSnapshot({ provider, refresh: true });
    assert.equal(snapshot.incidents[0].status, 'started');
  });
  await t.test('resolved event writes evidence fenced to inbox lease', async () => {
    current = incident({ status: 'resolved', updated_at: 1591946400 });
    assert.equal((await downtime.reconcileRazorpayDowntimeWebhook(event('resolved'), { provider })).state, 'PROCESSED');
    assert.deepEqual(evidence.where, { id: 'event-fixture', status: 'PROCESSING', attempts: 2 });
    assert.equal(evidence.data.payload.downtimeReconciliation.downtime.status, 'resolved');
  });
  await t.test('prior resolved evidence cannot regress to started', async () => {
    history = [{ payload: { downtime: current } }];
    current = incident({ updated_at: 1591946500 });
    await assert.rejects(downtime.reconcileRazorpayDowntimeWebhook(event('started'), { provider }), { code: 'DOWNTIME_STATE_REGRESSION' });
    history = [];
  });
  await t.test('lost lease cannot claim processed success', async () => {
    lease = 0;
    await assert.rejects(downtime.reconcileRazorpayDowntimeWebhook(event('started'), { provider }), { code: 'RAZORPAY_WEBHOOK_LEASE_LOST' });
  });
  await t.test('wrong account is rejected before reconciliation', async () => {
    const wrong = event('started');
    wrong.payload.accountId = 'acc_other';
    await assert.rejects(downtime.reconcileRazorpayDowntimeWebhook(wrong, { provider }), { code: 'RAZORPAY_ACCOUNT_MISMATCH' });
  });
});
