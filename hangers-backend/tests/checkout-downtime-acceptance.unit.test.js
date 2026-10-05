const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/services/razorpay-downtime.service.js'), 'utf8');
const incident = (changes = {}) => ({
  id: 'down_acceptance', entity: 'payment.downtime', method: 'netbanking',
  begin: 1591946222, end: null, status: 'started', scheduled: false, severity: 'high',
  instrument: { bank: 'SBIN' }, created_at: 1591946223, updated_at: 1591946297,
  ...changes,
});

// Evaluate the real service with only explicit doubles; never load database/config/SDK modules.
const harness = () => {
  let now = 1700000000000;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class RazorpayCheckoutError extends Error {
    constructor(code, message, status) { super(message); this.code = code; this.status = status; }
  }
  const dependencies = {
    '../config/database': { $transaction: () => assert.fail('Unexpected database access') },
    './razorpay-invoice-checkout.service': { RazorpayCheckoutError },
    './razorpay-checkout-account.service': {
      getDowntimeApiContext: ({ provider }) => {
        assert.ok(provider, 'Only an injected provider is allowed');
        return { mode: 'TEST', cacheKey: 'isolated-downtime', provider };
      },
      providerId: (value, prefix) => typeof value === 'string' && value.startsWith(`${prefix}_`) ? value : null,
      requireWebhookContext: () => assert.fail('Unexpected webhook/account access'),
      persistWebhookEvidence: () => assert.fail('Unexpected persistence'),
    },
  };
  const sandbox = { module: { exports: {} }, Date: Clock, require: (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } };
  vm.runInNewContext(source, sandbox, { filename: 'razorpay-downtime.service.js', timeout: 1000 });
  return { service: sandbox.module.exports, advance: (ms) => { now += ms; } };
};

test('snapshot expires honestly after cached refresh failure and recovers on explicit refresh', async () => {
  const { service, advance } = harness();
  let calls = 0;
  let unavailable = false;
  const provider = { payments: {
    fetchPaymentDowntime: async () => {
      calls += 1;
      if (unavailable) throw new Error('private-provider-error');
      return { entity: 'collection', count: 1, items: [incident()] };
    },
  } };
  const initial = await service.getRazorpayDowntimeSnapshot({ provider });
  advance(29999);
  assert.equal((await service.getRazorpayDowntimeSnapshot({ provider })).fetchedAt, initial.fetchedAt);
  assert.equal(calls, 1);
  advance(1);
  unavailable = true;
  await service.getRazorpayDowntimeSnapshot({ provider });
  assert.equal(calls, 2, '30-second cache boundary must attempt refresh');
  advance(29999);
  await service.getRazorpayDowntimeSnapshot({ provider });
  assert.equal(calls, 2, 'Failed refresh must also be rate-bounded');
  advance(1);
  await service.getRazorpayDowntimeSnapshot({ provider });
  advance(1);
  const stale = await service.getRazorpayDowntimeSnapshot({ provider });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.fetchedAt, initial.fetchedAt);
  assert.equal(stale.incidents[0].status, 'started');
  assert.doesNotMatch(JSON.stringify(stale), /private-provider-error/);
  unavailable = false;
  const recovered = await service.getRazorpayDowntimeSnapshot({ provider, refresh: true });
  assert.equal(calls, 4, 'Manual refresh bypasses cached failed attempt');
  assert.equal(recovered.status, 'fresh');
  assert.equal(recovered.reasonCode, null);
  assert.notEqual(recovered.fetchedAt, initial.fetchedAt);
  assert.equal(recovered.policy, 'warning_only');
});

test('explicit refresh reconciles resolution and retains it when later absent from list', async () => {
  const { service } = harness();
  let items = [incident()];
  let fetchByIdCalls = 0;
  const provider = { payments: {
    fetchPaymentDowntime: async () => ({ entity: 'collection', count: items.length, items }),
    fetchPaymentDowntimeById: async () => { fetchByIdCalls += 1; return incident({ status: 'resolved', updated_at: 1591946400 }); },
  } };
  await service.getRazorpayDowntimeSnapshot({ provider });
  items = [];
  const resolved = await service.getRazorpayDowntimeSnapshot({ provider, refresh: true });
  assert.equal(resolved.status, 'fresh');
  assert.equal(resolved.incidents[0].status, 'resolved');
  assert.equal(fetchByIdCalls, 1);
  const retained = await service.getRazorpayDowntimeSnapshot({ provider, refresh: true });
  assert.equal(retained.incidents[0].status, 'resolved');
  assert.equal(fetchByIdCalls, 1, 'Known terminal evidence must not need another occurrence fetch');
});

test('simultaneous explicit refreshes coalesce into one bounded provider request', async () => {
  const { service } = harness();
  let release;
  let calls = 0;
  const response = new Promise((resolve) => { release = resolve; });
  const provider = { payments: { fetchPaymentDowntime: () => { calls += 1; return response; } } };
  const first = service.getRazorpayDowntimeSnapshot({ provider, refresh: true });
  const second = service.getRazorpayDowntimeSnapshot({ provider, refresh: true });
  assert.equal(calls, 1);
  release({ entity: 'collection', count: 1, items: [incident()] });
  const snapshots = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(snapshots[0].status, 'fresh');
  assert.equal(JSON.stringify(snapshots[0]), JSON.stringify(snapshots[1]));
});
