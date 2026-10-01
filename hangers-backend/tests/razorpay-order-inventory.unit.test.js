const test = require('node:test');
const assert = require('node:assert/strict');
const { getMode } = require('../src/services/razorpay-invoice-checkout.service');
const { previewRazorpayOrderInventory, validateWindow } = require('../src/services/razorpay-order-inventory.service');

test('Razorpay checkout identifies only explicit Test or Live key modes', () => {
  assert.equal(getMode('rzp_test_fixture'), 'TEST');
  assert.equal(getMode('rzp_live_fixture'), 'LIVE');
  for (const keyId of [null, '', 'malformed', 'rzp_other_fixture']) {
    assert.throws(() => getMode(keyId), { code: 'RAZORPAY_MODE_UNAVAILABLE', statusCode: 503 });
  }
});

test('inventory fails closed before provider access when key mode is unknown', async () => {
  const now = new Date('2026-09-26T00:00:00Z');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  let providerCalled = false;
  await assert.rejects(previewRazorpayOrderInventory({
    from: nowSeconds - 60,
    to: nowSeconds,
    now,
    keyId: 'malformed',
    provider: { orders: { all: async () => { providerCalled = true; } }, payments: { all: async () => { providerCalled = true; } } },
  }), { code: 'RAZORPAY_MODE_UNAVAILABLE', statusCode: 503 });
  assert.equal(providerCalled, false);
});

test('inventory preserves Razorpay response codes but not local transport codes', async (t) => {
  const now = new Date('2026-09-26T00:00:00Z');
  const from = Math.floor(now.getTime() / 1000) - 60;
  const to = Math.floor(now.getTime() / 1000);
  for (const [providerError, expected] of [
    [{ response: { data: { error: { code: 'BAD_REQUEST_ERROR' } } } }, 'BAD_REQUEST_ERROR'],
    [Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' }), null],
    [new Error('provider failure without code'), null],
  ]) {
    await t.test(expected || 'missing code stays missing', async () => {
      await assert.rejects(previewRazorpayOrderInventory({
        from,
        to,
        now,
        keyId: 'rzp_test_inventory',
        provider: { orders: { all: async () => { throw providerError; } }, payments: { all: async () => ({ items: [] }) } },
      }), (error) => {
        assert.equal(error.providerCode, expected);
        assert.equal(error.code, 'ORDER_INVENTORY_PROVIDER_FAILED');
        return true;
      });
    });
  }
});

test('Razorpay Order inventory enforces the documented 180-day direct-fetch retention', () => {
  const now = new Date('2026-09-26T00:00:00Z');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const oldStart = nowSeconds - 181 * 24 * 60 * 60;
  assert.throws(
    () => validateWindow({ from: oldStart, to: oldStart + 24 * 60 * 60, now }),
    (error) => error.code === 'ORDER_INVENTORY_RETENTION_WINDOW',
  );
  assert.deepEqual(
    validateWindow({ from: nowSeconds - 30 * 24 * 60 * 60, to: nowSeconds, now }),
    { from: nowSeconds - 30 * 24 * 60 * 60, to: nowSeconds },
  );
});
