const { getMode, getRazorpay, RazorpayCheckoutError } = require('./razorpay-invoice-checkout.service');
const { razorpayErrorSummary } = require('../utils/redact');
const brandAssets = require('./razorpay-brand-assets');

const enabled = (value) => value === true || value === 1 || value === '1';
const assertCustomMode = () => {
  const mode = getMode();
  if (process.env.RAZORPAY_CUSTOM_CHECKOUT_DISABLED === 'true') {
    throw new RazorpayCheckoutError('CUSTOM_CHECKOUT_DISABLED', 'Custom checkout is temporarily unavailable. Check any existing payment before trying again.', 503);
  }
  if (mode === 'LIVE' && process.env.RAZORPAY_CUSTOM_CHECKOUT_LIVE_ENABLED !== 'true') {
    throw new RazorpayCheckoutError('CUSTOM_CHECKOUT_NOT_RELEASED', 'Custom checkout is not enabled in this payment mode.', 403);
  }
  return mode;
};

// Methods API is the documented Key-ID-only exception; never send the secret.
// https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/methods-api
const fetchCustomMethods = async () => {
  const mode = assertCustomMode();
  const response = await fetch('https://api.razorpay.com/v1/methods', {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:`).toString('base64')}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const provider = razorpayErrorSummary({ error: body?.error, statusCode: response.status });
    throw new RazorpayCheckoutError('CUSTOM_METHODS_UNAVAILABLE', provider.description || 'Payment methods could not be loaded.', response.status === 429 ? 429 : 503, {
      origin: 'razorpay', provider, retryAfter: response.headers.get('Retry-After'),
    });
  }
  if (!body || body.entity !== 'methods') throw new RazorpayCheckoutError('CUSTOM_METHODS_SCHEMA_UNKNOWN', 'Payment availability could not be verified.', 503);
  const methods = {};
  for (const key of ['card', 'debit_card', 'credit_card', 'prepaid_card', 'amex', 'upi', 'upi_intent', 'emi', 'card_networks', 'netbanking', 'wallet', 'cardless_emi', 'paylater', 'app', 'emi_options', 'emi_plans', 'emi_types']) {
    if (Object.hasOwn(body, key)) methods[key] = body[key];
  }
  return { mode, key: process.env.RAZORPAY_KEY_ID, methods, observedAt: new Date().toISOString() };
};

const approvedArtwork = () => {
  let entries;
  try { entries = JSON.parse(process.env.RAZORPAY_CUSTOM_APPROVED_ARTWORK || '[]'); } catch { entries = []; }
  if (!Array.isArray(entries)) return [];
  const overrides = entries.flatMap((entry) => {
    try {
      const asset = new URL(entry.url);
      const source = new URL(entry.source);
      if (asset.protocol !== 'https:' || source.protocol !== 'https:' || !/(^|\.)razorpay\.com$/.test(source.hostname)
        || !/(^|\.)razorpay\.com$/.test(asset.hostname)
        || asset.username || asset.password || source.username || source.password
        || !['network', 'upi', 'wallet'].includes(entry.kind) || !/^[A-Za-z0-9 _-]{1,40}$/.test(entry.code)
        || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 80) return [];
      return [{ kind: entry.kind, code: entry.code, label: entry.label, url: asset.href, source: source.href }];
    } catch { return []; }
  });
  const byIdentity = new Map(brandAssets.map((entry) => [`${entry.kind}:${entry.code}`, { ...entry }]));
  for (const entry of overrides) byIdentity.set(`${entry.kind}:${entry.code}`, entry);
  return [...byIdentity.values()];
};

const getCustomConfiguration = () => ({
  feeBearer: ['MERCHANT', 'CUSTOMER'].includes(process.env.RAZORPAY_CUSTOM_FEE_BEARER)
    ? process.env.RAZORPAY_CUSTOM_FEE_BEARER : 'UNVERIFIED',
  savedCards: process.env.RAZORPAY_SAVED_CARDS_ENABLED === 'true',
  bankTransfer: process.env.RAZORPAY_CUSTOM_BANK_TRANSFER_ENABLED === 'true',
  artwork: approvedArtwork(),
  // Merchant instruction: Diners remains unavailable; AmEx follows provider availability.
  excludedCardNetworks: ['DICL'],
});

// Non-tokenised IINs support 6-8 digits. Full PANs never cross this route.
// https://razorpay.com/docs/api/payments/cards/iin-api
const fetchCustomCardEligibility = async (iin) => {
  assertCustomMode();
  if (typeof iin !== 'string' || !/^\d{6,8}$/.test(iin)) throw new RazorpayCheckoutError('CUSTOM_IIN_INVALID', 'Enter a valid card number before checking eligibility.', 400);
  try {
    const result = await getRazorpay().iins.fetch(iin);
    if (result?.entity !== 'iin' || result.iin !== iin || result.tokenised_iin === true) {
      throw new RazorpayCheckoutError('CUSTOM_IIN_SCHEMA_UNKNOWN', 'Card eligibility could not be verified.', 503);
    }
    return {
      network: typeof result.network === 'string' ? result.network : null,
      type: typeof result.type === 'string' ? result.type : null,
      issuerCode: typeof result.issuer_code === 'string' ? result.issuer_code : null,
      issuerName: typeof result.issuer_name === 'string' ? result.issuer_name : null,
      emiAvailable: typeof result.emi?.available === 'boolean' ? result.emi.available : null,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof RazorpayCheckoutError) throw error;
    const provider = razorpayErrorSummary(error);
    throw new RazorpayCheckoutError('CUSTOM_IIN_UNAVAILABLE', provider.description || 'Card eligibility could not be verified.', Number(error?.statusCode) === 429 ? 429 : 503, {
      origin: 'razorpay', provider,
      retryAfter: error?.response?.headers?.['retry-after'] || error?.headers?.['retry-after'],
    });
  }
};

module.exports = { assertCustomMode, enabled, fetchCustomMethods, fetchCustomCardEligibility, getCustomConfiguration };
