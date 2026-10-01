const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const prisma = require('../src/config/database');
const checkout = require('../src/services/razorpay-invoice-checkout.service');
const originalProvider = checkout.getRazorpay;
let tokens;
let deleted;
const provider = {
  key_id: 'rzp_test_saved_contract', key_secret: 'isolated-fixture-secret',
  customers: {
    fetchTokens: async () => ({ entity: 'collection', count: tokens.length, items: tokens }),
    fetchToken: async (customerId, tokenId) => {
      assert.equal(customerId, 'cust_fixture');
      return tokens.find((token) => token.id === tokenId);
    },
    deleteToken: async () => ({ deleted }),
  },
};
checkout.getRazorpay = () => provider;
const service = require('../src/services/razorpay-saved-cards.service');
checkout.getRazorpay = originalProvider;

test('saved-card ownership and lifecycle fail closed without provider or database access', async (t) => {
  const environment = { ...process.env };
  const originalFind = prisma.razorpaySavedCardCustomer.findUnique;
  t.after(async () => {
    prisma.razorpaySavedCardCustomer.findUnique = originalFind;
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    await prisma.$disconnect();
  });
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: provider.key_id, RAZORPAY_KEY_SECRET: provider.key_secret,
    RAZORPAY_SAVED_CARDS_ENABLED: 'true', RAZORPAY_SAVED_CARDS_TEST_VERIFIED_KEY_ID: provider.key_id,
  });
  delete process.env.RAZORPAY_SAVED_CARDS_TEST_CVVLESS_VERIFIED_KEY_ID;
  const mapping = (customerId) => ({
    id: `mapping-${customerId}`, customerId, mode: 'TEST', status: 'READY', verifiedAt: new Date(),
    razorpayCustomerId: 'cust_fixture', credentialFingerprint: crypto.createHash('sha256').update(provider.key_id).digest('hex'),
  });
  prisma.razorpaySavedCardCustomer.findUnique = async ({ where }) => mapping(where.customerId_mode.customerId);
  const customer = { id: 'payer-a' };
  tokens = [{ id: 'token_fixture', entity: 'token', method: 'card', status: 'active',
    compliant_with_tokenisation_guidelines: true,
    card: { entity: 'card', last4: '1007', network: 'Visa', type: 'credit', number: 'never-expose', cvv: 'never-expose' } }];
  const listing = await service.listSavedCards(customer);
  const selector = listing.cards[0].selector;

  await t.test('listing exposes masked metadata and opaque selector, never provider token or card credentials', () => {
    assert.equal(listing.cards[0].last4, '1007');
    assert.equal(listing.cards[0].selectable, true);
    assert.match(selector, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(listing), /token_fixture|cust_fixture|never-expose/);
  });
  await t.test('another authenticated payer cannot reuse the selector', async () => {
    await assert.rejects(service.selectSavedCard({ id: 'payer-b' }, { selector }), { code: 'SAVED_CARD_NOT_FOUND' });
  });
  await t.test('mode and key changes reject preparation before token selection', async () => {
    await assert.rejects(service.selectSavedCard(customer, { selector, mode: 'LIVE' }), { code: 'SAVED_CARD_MODE_CHANGED' });
    await assert.rejects(service.selectSavedCard(customer, { selector, keyId: 'rzp_test_other' }), { code: 'SAVED_CARD_KEY_CHANGED' });
  });
  await t.test('active token requires CVV without exact verified CVV-less capability', async () => {
    const selected = await service.selectSavedCard(customer, { selector });
    assert.equal(selected.cvvRequired, true);
    assert.deepEqual(selected.sdk, { method: 'card', customer_id: 'cust_fixture', token: 'token_fixture' });
  });
  await t.test('deactivated token cannot be paid but remains removable only on confirmed deletion', async () => {
    tokens[0].status = 'deactivated';
    await assert.rejects(service.selectSavedCard(customer, { selector }), { code: 'SAVED_CARD_NOT_USABLE' });
    deleted = false;
    await assert.rejects(service.deleteSavedCard(customer, { selector }), { code: 'SAVED_CARD_PROVIDER_RESPONSE_INVALID' });
    deleted = true;
    assert.equal((await service.deleteSavedCard(customer, { selector })).deleted, true);
    tokens[0].status = 'active';
  });
  await t.test('credential fingerprint mismatch refuses mapping reuse', async () => {
    prisma.razorpaySavedCardCustomer.findUnique = async () => ({ ...mapping(customer.id), credentialFingerprint: 'wrong-key' });
    await assert.rejects(service.listSavedCards(customer), { code: 'SAVED_CARD_MAPPING_REVIEW_REQUIRED' });
    prisma.razorpaySavedCardCustomer.findUnique = async ({ where }) => mapping(where.customerId_mode.customerId);
  });
  await t.test('incomplete token collection cannot become a successful empty list', async () => {
    provider.customers.fetchTokens = async () => ({ entity: 'collection', count: 2, items: tokens });
    await assert.rejects(service.listSavedCards(customer), { code: 'SAVED_CARD_PROVIDER_RESPONSE_INVALID' });
  });
});
