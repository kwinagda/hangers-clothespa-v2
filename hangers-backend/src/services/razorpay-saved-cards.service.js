const crypto = require('crypto');
const prisma = require('../config/database');
const { getRazorpay, getMode } = require('./razorpay-invoice-checkout.service');

// Official contracts reviewed 2026-09-30:
// https://razorpay.com/docs/api/customers/create
// https://razorpay.com/docs/api/customers/fetch-with-id
// https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-1
// https://razorpay.com/docs/payments/payment-methods/cards/token-hq/merchant-requestor/token-lifecycle
const CONSENT = Object.freeze({
  version: 'hangers-save-card-v1',
  text: 'I consent to saving this card as a network token through Razorpay for future payments with Hangers. I can remove it from my saved cards at any time.',
});
const CONSENT_TTL_MS = 10 * 60 * 1000;
// Hangers browser preparation lifetime, not the provider token's expiry.
const SELECTION_TTL_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 15000;
const CUSTOMER_ID = /^cust_[A-Za-z0-9]{1,64}$/;
const TOKEN_ID = /^token_[A-Za-z0-9]{1,64}$/;
const TOKEN_STATES = new Set(['initiated', 'active', 'suspended', 'failed', 'deactivated']);
const NETWORKS = new Set(['Visa', 'RuPay', 'MasterCard', 'American Express', 'Diners Club', 'Maestro', 'JCB', 'Union Pay']);
const CARD_TYPES = new Set(['credit', 'debit', 'prepaid']);
// Operator attestations, not provider response fields. RuPay needs activation
// and verified issuer coverage; never infer either from tokenisation activation.
const cvvLessCapability = (mode, keyId) => {
  const verified = process.env[`RAZORPAY_SAVED_CARDS_${mode}_CVVLESS_VERIFIED_KEY_ID`] === keyId;
  const networks = (process.env[`RAZORPAY_SAVED_CARDS_${mode}_CVVLESS_NETWORKS`] || '')
    .split(',').map((value) => value.trim()).filter((value) => ['Visa', 'MasterCard', 'American Express', 'Diners Club', 'RuPay'].includes(value));
  const rupayIssuers = (process.env[`RAZORPAY_SAVED_CARDS_${mode}_CVVLESS_RUPAY_ISSUERS`] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return { verified, networks: verified ? networks : [], rupayIssuers: verified ? rupayIssuers : [] };
};
const fingerprint = (value) => crypto.createHash('sha256').update(value).digest('hex');

class SavedCardError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'SavedCardError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const providerInvalid = () => new SavedCardError('SAVED_CARD_PROVIDER_RESPONSE_INVALID', 'Saved cards could not be confirmed. Please refresh before continuing.', 502);
const mappingReview = () => new SavedCardError('SAVED_CARD_MAPPING_REVIEW_REQUIRED', 'Saved-card account setup needs reconciliation. Contact Hangers before trying setup again.', 409);
const cardNotFound = () => new SavedCardError('SAVED_CARD_NOT_FOUND', 'This saved card is no longer available. Refresh saved cards.', 404);
const consentUnavailable = () => new SavedCardError('SAVED_CARD_CONSENT_UNAVAILABLE', 'Confirm your save-card choice again before continuing.', 409);

const getConfiguration = () => {
  let mode;
  try {
    mode = getMode();
  } catch {
    return { mode: null, keyId: null, available: false, reason: 'RAZORPAY_NOT_CONFIGURED', consent: CONSENT };
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  // These are operator attestations, not Razorpay API activation fields. Leave
  // unset until activation and this integration are verified for this exact key.
  const enabled = process.env.RAZORPAY_SAVED_CARDS_ENABLED === 'true';
  const verifiedKey = process.env[`RAZORPAY_SAVED_CARDS_${mode}_VERIFIED_KEY_ID`] === keyId;
  const configured = Boolean(process.env.RAZORPAY_KEY_SECRET);
  const released = mode !== 'LIVE' || process.env.RAZORPAY_CUSTOM_CHECKOUT_LIVE_ENABLED === 'true';
  return {
    mode,
    keyId,
    available: configured && released && enabled && verifiedKey,
    reason: !configured ? 'RAZORPAY_NOT_CONFIGURED'
      : !released ? 'CUSTOM_CHECKOUT_NOT_RELEASED'
        : enabled && verifiedKey ? null : 'SAVED_CARDS_NOT_ENABLED',
    consent: CONSENT,
    cvvLess: cvvLessCapability(mode, keyId),
  };
};

const getContext = (expectedMode, expectedKeyId) => {
  const configuration = getConfiguration();
  if (expectedMode && expectedMode !== configuration.mode) {
    throw new SavedCardError('SAVED_CARD_MODE_CHANGED', 'Payment mode changed. Reload checkout before continuing.', 409);
  }
  if (expectedKeyId && expectedKeyId !== configuration.keyId) {
    throw new SavedCardError('SAVED_CARD_KEY_CHANGED', 'Payment configuration changed. Reload checkout before continuing.', 409);
  }
  if (!configuration.available) {
    throw new SavedCardError('SAVED_CARDS_UNAVAILABLE', 'Saved cards are not enabled for this payment configuration.', 503);
  }
  const provider = getRazorpay();
  const keyId = provider.key_id;
  return {
    provider,
    keyId,
    mode: configuration.mode,
    credentialFingerprint: fingerprint(keyId),
    selectorKey: crypto.createHmac('sha256', provider.key_secret).update('hangers-saved-card-selector-v1').digest(),
  };
};

// No raw SDK errors escape this boundary: they may contain provider identifiers
// or request data. A timed-out mutation has an unknown outcome, never success.
const providerRequest = async (operation) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('provider timeout')), PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    throw new SavedCardError('SAVED_CARD_PROVIDER_UNAVAILABLE', 'The saved-card request could not be confirmed. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timer);
  }
};

const assertMappingBinding = (mapping, context, customerId) => {
  if (mapping.customerId !== customerId || mapping.mode !== context.mode
    || mapping.credentialFingerprint !== context.credentialFingerprint) throw mappingReview();
};

const assertMapping = (mapping, context, customerId) => {
  assertMappingBinding(mapping, context, customerId);
  if (mapping.status !== 'READY' || !mapping.verifiedAt || !CUSTOMER_ID.test(mapping.razorpayCustomerId || '')) throw mappingReview();
  return mapping;
};

const reconcileMapping = async (mapping, context, customerId) => {
  assertMappingBinding(mapping, context, customerId);
  if (!['CREATING', 'REVIEW'].includes(mapping.status)
    || !CUSTOMER_ID.test(mapping.razorpayCustomerId || '')) throw mappingReview();
  // Fetch only the persisted ID with the reserved key/mode. Server-issued
  // mapping notes bind this provider customer to the authenticated local payer;
  // contact similarity and reservation age are never ownership evidence.
  const fetched = await providerRequest(() => context.provider.customers.fetch(mapping.razorpayCustomerId));
  if (fetched?.id !== mapping.razorpayCustomerId || fetched.entity !== 'customer'
    || fetched.notes?.hangers_saved_card_mapping !== mapping.id
    || fetched.notes?.hangers_saved_card_mode !== context.mode) throw mappingReview();
  const promoted = await prisma.razorpaySavedCardCustomer.updateMany({
    where: {
      id: mapping.id,
      customerId,
      mode: context.mode,
      credentialFingerprint: context.credentialFingerprint,
      razorpayCustomerId: mapping.razorpayCustomerId,
      status: mapping.status,
    },
    data: { status: 'READY', verifiedAt: new Date() },
  });
  const current = await prisma.razorpaySavedCardCustomer.findUnique({ where: { id: mapping.id } });
  if (!current || current.razorpayCustomerId !== mapping.razorpayCustomerId
    || (promoted.count !== 1 && current.status !== 'READY')) throw mappingReview();
  return assertMapping(current, context, customerId);
};

const findMapping = async (context, customerId) => {
  const mapping = await prisma.razorpaySavedCardCustomer.findUnique({
    where: { customerId_mode: { customerId, mode: context.mode } },
  });
  if (!mapping) return null;
  return mapping.status === 'READY'
    ? assertMapping(mapping, context, customerId)
    : reconcileMapping(mapping, context, customerId);
};

const ensureMapping = async (context, customer) => {
  const existing = await findMapping(context, customer.id);
  if (existing) return existing;
  const phone = String(customer.phone || '').replace(/^\+91/, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new SavedCardError('SAVED_CARD_CUSTOMER_CONTACT_INVALID', 'A valid authenticated customer contact is required.', 409);
  }

  let mapping;
  try {
    // Commit the unique reservation before any provider call. A concurrent
    // request, process crash or lost response must never create another payer.
    mapping = await prisma.razorpaySavedCardCustomer.create({
      data: { customerId: customer.id, mode: context.mode, credentialFingerprint: context.credentialFingerprint },
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const winner = await findMapping(context, customer.id);
    if (!winner) throw mappingReview();
    return winner;
  }

  try {
    const created = await providerRequest(() => context.provider.customers.create({
      contact: `+91${phone}`,
      fail_existing: '1',
      notes: { hangers_saved_card_mapping: mapping.id, hangers_saved_card_mode: context.mode },
    }));
    if (created?.entity !== 'customer' || !CUSTOMER_ID.test(created.id || '')) throw providerInvalid();
    mapping = await prisma.razorpaySavedCardCustomer.update({
      where: { id: mapping.id },
      data: { razorpayCustomerId: created.id },
    });
    return await reconcileMapping(mapping, context, customer.id);
  } catch {
    // Includes duplicate-contact errors. Never use fail_existing: "0", look up
    // by phone/email, auto-link an old customer, or retry ambiguous creation.
    await prisma.razorpaySavedCardCustomer.updateMany({
      where: { id: mapping.id, status: 'CREATING' },
      data: { status: 'REVIEW' },
    }).catch(() => {});
    throw mappingReview();
  }
};

const recordConsent = async (customer, input) => {
  const context = getContext(input.mode, input.keyId);
  if (input.wordingVersion !== CONSENT.version || typeof input.granted !== 'boolean') {
    throw new SavedCardError('SAVED_CARD_CONSENT_INVALID', 'An explicit choice using the current consent wording is required.', 400);
  }
  const where = { customerId_mode_requestId: { customerId: customer.id, mode: context.mode, requestId: input.requestId } };
  let consent = await prisma.razorpaySavedCardConsent.findUnique({ where });
  if (!consent) {
    try {
      consent = await prisma.razorpaySavedCardConsent.create({
        data: {
          customerId: customer.id,
          mode: context.mode,
          credentialFingerprint: context.credentialFingerprint,
          requestId: input.requestId,
          granted: input.granted,
          wordingVersion: CONSENT.version,
          wording: CONSENT.text,
        },
      });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      consent = await prisma.razorpaySavedCardConsent.findUnique({ where });
    }
  }
  if (!consent || consent.granted !== input.granted || consent.wordingVersion !== CONSENT.version
    || consent.credentialFingerprint !== context.credentialFingerprint) {
    throw new SavedCardError('SAVED_CARD_CONSENT_CONFLICT', 'This request already records a different save-card choice. Use a new request ID.', 409);
  }
  return {
    consentId: consent.id,
    mode: consent.mode,
    keyId: context.keyId,
    granted: consent.granted,
    wordingVersion: consent.wordingVersion,
    recordedAt: consent.createdAt,
    expiresAt: new Date(consent.createdAt.getTime() + CONSENT_TTL_MS),
    consumed: Boolean(consent.consumedAt),
  };
};

const prepareNewCard = async (customer, input) => {
  const context = getContext(input.mode, input.keyId);
  const consent = await prisma.razorpaySavedCardConsent.findFirst({
    where: {
      id: input.consentId,
      customerId: customer.id,
      mode: context.mode,
      credentialFingerprint: context.credentialFingerprint,
      wordingVersion: CONSENT.version,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - CONSENT_TTL_MS) },
    },
  });
  if (!consent) throw consentUnavailable();
  const mapping = consent.granted ? await ensureMapping(context, customer) : null;
  const claimed = await prisma.razorpaySavedCardConsent.updateMany({
    where: { id: consent.id, consumedAt: null, createdAt: { gt: new Date(Date.now() - CONSENT_TTL_MS) } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) throw consentUnavailable();
  return {
    mode: context.mode,
    keyId: context.keyId,
    consentId: consent.id,
    expiresAt: new Date(consent.createdAt.getTime() + CONSENT_TTL_MS),
    // SDK-only fields: merge with the existing bound order, never persist them
    // or attach them to public invoice responses. This does not submit payment.
    sdk: { method: 'card', save: consent.granted ? 1 : 0, ...(mapping ? { customer_id: mapping.razorpayCustomerId } : {}) },
  };
};

const fetchTokens = async (context, mapping) => {
  const result = await providerRequest(() => context.provider.customers.fetchTokens(mapping.razorpayCustomerId));
  // Scenario 1 has no pagination contract. Reject incomplete/unknown responses;
  // do not guess cursors or turn an outage into an empty saved-card collection.
  if (result?.entity !== 'collection' || !Array.isArray(result.items)
    || !Number.isSafeInteger(result.count) || result.count !== result.items.length) throw providerInvalid();
  const ids = new Set();
  for (const token of result.items) {
    if (token?.entity !== 'token' || !TOKEN_ID.test(token.id || '') || ids.has(token.id)) throw providerInvalid();
    ids.add(token.id);
  }
  return result.items.filter((token) => token.method === 'card');
};

const selectorFor = (context, mapping, tokenId) => crypto.createHmac('sha256', context.selectorKey)
  .update(JSON.stringify([mapping.customerId, mapping.id, context.mode, context.credentialFingerprint, tokenId]))
  .digest('hex');

const displayCard = (token) => {
  const card = token.card;
  const last4 = typeof card?.last4 === 'string' && /^\d{4}$/.test(card.last4)
    ? card.last4
    : Number.isInteger(card?.last4) && card.last4 >= 0 && card.last4 <= 9999
      ? String(card.last4).padStart(4, '0') : null;
  return {
    last4,
    network: NETWORKS.has(card?.network) ? card.network : null,
    type: CARD_TYPES.has(card?.type) ? card.type : null,
  };
};

// This is token usability, not merchant/network payment eligibility. The checkout
// must still honour its current Razorpay methods response and bound order.
// No expiry field is invented: the documented expired-token state is deactivated.
const isSelectable = (token) => token.method === 'card' && token.card?.entity === 'card'
  && token.status === 'active' && token.compliant_with_tokenisation_guidelines === true
  && displayCard(token).last4 !== null;

const listSavedCards = async (customer) => {
  const context = getContext();
  const mapping = await findMapping(context, customer.id);
  if (!mapping) return { mode: context.mode, keyId: context.keyId, mapped: false, cards: [] };
  const tokens = await fetchTokens(context, mapping);
  return {
    mode: context.mode,
    keyId: context.keyId,
    mapped: true,
    cards: tokens.map((token) => ({
      selector: selectorFor(context, mapping, token.id),
      ...displayCard(token),
      status: TOKEN_STATES.has(token.status) ? token.status : 'unknown',
      selectable: isSelectable(token),
    })),
  };
};

const resolveToken = async (context, customer, selector) => {
  if (typeof selector !== 'string' || !/^[a-f0-9]{64}$/.test(selector)) throw cardNotFound();
  const mapping = await findMapping(context, customer.id);
  if (!mapping) throw cardNotFound();
  const tokens = await fetchTokens(context, mapping);
  const target = Buffer.from(selector, 'hex');
  const listed = tokens.find((token) => crypto.timingSafeEqual(Buffer.from(selectorFor(context, mapping, token.id), 'hex'), target));
  if (!listed) throw cardNotFound();
  // Resolve only from this payer's current customer list, then independently
  // re-fetch the selected customer-scoped token. Never accept a provider ID.
  const token = await providerRequest(() => context.provider.customers.fetchToken(mapping.razorpayCustomerId, listed.id));
  if (token?.id !== listed.id || token.entity !== 'token' || token.method !== 'card') throw providerInvalid();
  return { mapping, token };
};

const selectSavedCard = async (customer, input) => {
  const context = getContext(input.mode, input.keyId);
  const { mapping, token } = await resolveToken(context, customer, input.selector);
  if (!isSelectable(token)) {
    throw new SavedCardError('SAVED_CARD_NOT_USABLE', 'This saved card is not currently active and compliant. Choose another payment method.', 409);
  }
  const capability = cvvLessCapability(context.mode, context.keyId);
  const network = displayCard(token).network;
  const cvvRequired = !capability.networks.includes(network)
    || (network === 'RuPay' && (typeof token.card?.issuer !== 'string'
      || !capability.rupayIssuers.includes(token.card.issuer)));
  return {
    mode: context.mode,
    keyId: context.keyId,
    selector: input.selector,
    ...displayCard(token),
    cvvRequired,
    expiresAt: new Date(Date.now() + SELECTION_TTL_MS),
    sdk: { method: 'card', customer_id: mapping.razorpayCustomerId, token: token.id },
  };
};

const deleteSavedCard = async (customer, input) => {
  const context = getContext(input.mode, input.keyId);
  const { mapping, token } = await resolveToken(context, customer, input.selector);
  // Inactive and noncompliant cards remain removable. A missing token or a
  // failed deletion is not treated as documented idempotent deletion success.
  const result = await providerRequest(() => context.provider.customers.deleteToken(mapping.razorpayCustomerId, token.id));
  if (result?.deleted !== true) throw providerInvalid();
  return { mode: context.mode, keyId: context.keyId, deleted: true, refreshRequired: true };
};

module.exports = { SavedCardError, getConfiguration, recordConsent, prepareNewCard, listSavedCards, selectSavedCard, deleteSavedCard };
