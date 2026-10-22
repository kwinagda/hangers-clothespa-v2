const crypto = require('crypto');
const { getMode, getRazorpay, RazorpayCheckoutError } = require('./razorpay-invoice-checkout.service');
const { assertCustomMode, getCustomConfiguration } = require('./razorpay-custom-capabilities.service');

const providerId = (value, prefix) => typeof value === 'string'
  && new RegExp(`^${prefix}_[A-Za-z0-9]{1,100}$`).test(value) ? value : null;

const getDowntimeApiContext = ({ mode, provider } = {}) => {
  const activeMode = assertCustomMode();
  if (mode !== undefined && mode !== activeMode) {
    throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Checkout feature belongs to a different payment mode', 409);
  }
  const client = provider || getRazorpay();
  if (!provider) {
    client.api.rq.interceptors.request.use((request) => {
      request.timeout = 10_000;
      request.signal = AbortSignal.timeout(15_000);
      return request;
    });
  }
  return {
    mode: activeMode,
    cacheKey: crypto.createHash('sha256').update(JSON.stringify([
      activeMode, process.env.RAZORPAY_KEY_ID,
    ])).digest('hex'),
    provider: client,
  };
};

// These are deployment gates, not claims that Razorpay has activated a feature.
// Configure each mode only after its account/feature prerequisites are verified.
const getCheckoutAccountContext = ({ feature, mode, accountId, provider, webhook = false } = {}) => {
  if (!['DOWNTIME', 'BANK_TRANSFER'].includes(feature)) {
    throw new RazorpayCheckoutError('RAZORPAY_FEATURE_INVALID', 'Unsupported checkout feature');
  }
  const activeMode = webhook ? getMode() : assertCustomMode();
  if (mode !== undefined && mode !== activeMode) {
    throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Checkout feature belongs to a different payment mode', 409);
  }
  const configuredAccountId = providerId(process.env[`RAZORPAY_ACCOUNT_ID_${activeMode}`], 'acc');
  if (!configuredAccountId) {
    throw new RazorpayCheckoutError('RAZORPAY_ACCOUNT_UNVERIFIED', 'Checkout account binding has not been configured', 503);
  }
  if (accountId !== undefined && accountId !== configuredAccountId) {
    throw new RazorpayCheckoutError('RAZORPAY_ACCOUNT_MISMATCH', 'Webhook does not belong to the configured checkout account', 409);
  }
  if (feature === 'BANK_TRANSFER' && !getCustomConfiguration().bankTransfer) {
    throw new RazorpayCheckoutError(`RAZORPAY_${feature}_NOT_ENABLED`, 'Checkout feature prerequisites have not been enabled for this account and mode', 503);
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw new RazorpayCheckoutError('RAZORPAY_NOT_CONFIGURED', 'Checkout API credentials are not configured', 503);
  }
  const client = provider || getRazorpay();
  // Bound these new reads without changing the shared checkout client's behavior.
  if (!provider) {
    client.api.rq.interceptors.request.use((request) => {
      request.timeout = 10_000;
      request.signal = AbortSignal.timeout(15_000);
      return request;
    });
  }
  return {
    mode: activeMode,
    accountId: configuredAccountId,
    cacheKey: crypto.createHash('sha256').update(JSON.stringify([
      configuredAccountId, activeMode, process.env.RAZORPAY_KEY_ID,
    ])).digest('hex'),
    provider: client,
  };
};

const requireWebhookContext = (event, feature, provider) => {
  if (!['TEST', 'LIVE'].includes(event?.mode) || !providerId(event?.payload?.accountId, 'acc')) {
    throw new RazorpayCheckoutError('RAZORPAY_WEBHOOK_SCOPE_MISSING', 'Webhook has no verified account and mode binding', 409);
  }
  return getCheckoutAccountContext({ feature, mode: event.mode, accountId: event.payload.accountId, provider, webhook: true });
};

// Fence reconciliation evidence with the same lease as the inbox worker.
const persistWebhookEvidence = async (tx, event, evidence, references = {}) => {
  const result = await tx.razorpayWebhookEvent.updateMany({
    where: { id: event.id, status: 'PROCESSING', attempts: event.attempts },
    data: { ...references, payload: { ...event.payload, ...evidence } },
  });
  if (result.count !== 1) {
    throw new RazorpayCheckoutError('RAZORPAY_WEBHOOK_LEASE_LOST', 'Webhook processing lease is no longer owned', 503);
  }
};

module.exports = { getCheckoutAccountContext, getDowntimeApiContext, persistWebhookEvidence, providerId, requireWebhookContext };
