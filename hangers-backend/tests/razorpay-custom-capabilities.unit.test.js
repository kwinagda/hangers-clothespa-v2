const test = require('node:test');
const assert = require('node:assert/strict');
const checkout = require('../src/services/razorpay-invoice-checkout.service');
const originalGetRazorpay = checkout.getRazorpay;
let provider;
checkout.getRazorpay = () => provider;
const capabilities = require('../src/services/razorpay-custom-capabilities.service');
checkout.getRazorpay = originalGetRazorpay;

test('Custom discovery preserves provider facts and rejects unverified contracts', async (t) => {
  const previousEnv = { ...process.env };
  const previousFetch = global.fetch;
  t.after(() => {
    global.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });
  process.env.RAZORPAY_KEY_ID = 'rzp_test_contract';
  process.env.RAZORPAY_KEY_SECRET = 'secret-must-not-be-sent';
  delete process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED;

  await t.test('Methods uses key ID without secret and preserves disabled flags', async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.razorpay.com/v1/methods');
      assert.equal(Buffer.from(options.headers.Authorization.slice(6), 'base64').toString(), 'rzp_test_contract:');
      return new Response(JSON.stringify({ entity: 'methods', card: true, emi: false, upi: 0, unknown: 'not-exposed' }));
    };
    const result = await capabilities.fetchCustomMethods();
    assert.deepEqual(result.methods, { card: true, upi: 0, emi: false });
    assert.equal(result.mode, 'TEST');
  });

  await t.test('Provider throttling retains description and Retry-After', async () => {
    global.fetch = async () => new Response(JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'Provider contract test description' } }), { status: 429, headers: { 'Retry-After': '10' } });
    await assert.rejects(capabilities.fetchCustomMethods(), (error) => {
      assert.equal(error.statusCode, 429);
      assert.equal(error.message, 'Provider contract test description');
      return true;
    });
  });

  await t.test('Unknown method entity fails closed', async () => {
    global.fetch = async () => new Response(JSON.stringify({ card: true }));
    await assert.rejects(capabilities.fetchCustomMethods(), { code: 'CUSTOM_METHODS_SCHEMA_UNKNOWN' });
  });

  await t.test('Only normal 6-8 digit IINs reach the provider; no PAN is accepted', async () => {
    const calls = [];
    provider = { iins: { fetch: async (iin) => {
      calls.push(iin);
      return { entity: 'iin', iin, network: 'Visa', type: 'credit', issuer_code: 'TEST', emi: { available: false }, card_number: 'must-not-return' };
    } } };
    for (const iin of ['123456', '1234567', '12345678']) {
      const result = await capabilities.fetchCustomCardEligibility(iin);
      assert.equal(result.network, 'Visa');
      assert.equal(result.emiAvailable, false);
      assert.equal(Object.hasOwn(result, 'card_number'), false);
    }
    for (const invalid of ['12345', '123456789', '4100280000001007', 123456, '12345x']) {
      await assert.rejects(capabilities.fetchCustomCardEligibility(invalid), { code: 'CUSTOM_IIN_INVALID' });
    }
    assert.deepEqual(calls, ['123456', '1234567', '12345678']);
  });

  await t.test('Mismatched, tokenised, and malformed tokenisation responses cannot become normal card eligibility', async () => {
    for (const response of [
      { entity: 'iin', iin: '999999' },
      { entity: 'iin', iin: '123456', tokenised_iin: true },
      { entity: 'iin', iin: '123456', tokenised_iin: 'false' },
      { entity: 'iin', iin: '123456', tokenised_iin: null },
    ]) {
      provider = { iins: { fetch: async () => response } };
      await assert.rejects(capabilities.fetchCustomCardEligibility('123456'), { code: 'CUSTOM_IIN_SCHEMA_UNKNOWN' });
    }
  });

  await t.test('Unreleased Live mode never fetches methods', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_contract';
    delete process.env.RAZORPAY_CUSTOM_CHECKOUT_LIVE_ENABLED;
    global.fetch = async () => { throw new Error('Provider must not be called'); };
    await assert.rejects(capabilities.fetchCustomMethods(), { code: 'CUSTOM_CHECKOUT_NOT_RELEASED' });
  });
});
