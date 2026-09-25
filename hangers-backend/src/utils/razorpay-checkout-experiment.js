const crypto = require('crypto');

const EXPERIMENT_ID = 'invoice_checkout_presentation_v1';
const ALLOWED_EVENTS = new Set([
  'EXPOSURE',
  'CTA_CLICK',
  'CHECKOUT_OPEN_REQUESTED',
  'CHECKOUT_DISMISSED',
  'CHECKOUT_HANDLER_RETURNED',
  'PAYMENT_FAILED_CALLBACK',
  'CLIENT_ERROR',
  'CRM_CAPTURED',
]);

const getExperimentConfig = (env = process.env) => {
  const testMode = String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_');
  const enabled = env.RAZORPAY_CHECKOUT_AB_ENABLED === 'true';
  const hashSecret = env.RAZORPAY_AB_HASH_SECRET || '';
  return { enabled: enabled && testMode && hashSecret.length >= 32, mode: testMode ? 'TEST' : 'LIVE', hashSecret };
};

const normalizeVisitorId = (value) => {
  const id = String(value || '').toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
};

const hashVisitorId = (visitorId, secret) => crypto.createHmac('sha256', secret).update(visitorId).digest('hex');

const assignVariant = (visitorHash) => (parseInt(visitorHash.slice(0, 8), 16) % 2 === 0 ? 'A' : 'B');

module.exports = { ALLOWED_EVENTS, EXPERIMENT_ID, assignVariant, getExperimentConfig, hashVisitorId, normalizeVisitorId };
