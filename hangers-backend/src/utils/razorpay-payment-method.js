const PROVIDER_METHODS = new Set([
  'card',
  'netbanking',
  'wallet',
  'emi',
  'upi',
  'paylater',
  'cardless_emi',
  'nach',
  'emandate',
  'bank_transfer',
]);
const CARD_NETWORKS = new Set(['visa', 'mastercard', 'rupay', 'amex', 'diners', 'maestro', 'discover', 'jcb']);
const CARD_TYPES = new Set(['credit', 'debit', 'prepaid']);

const safeLabel = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,24}$/.test(normalized) ? normalized : null;
};

const getSafeRazorpayPaymentMethod = (payment) => {
  const method = safeLabel(payment?.method);
  if (!method || !PROVIDER_METHODS.has(method)) {
    return { providerMethod: null, providerMethodDetail: null };
  }

  if (method !== 'card') {
    return { providerMethod: method, providerMethodDetail: null };
  }

  const rawNetwork = safeLabel(payment?.card?.network);
  const rawType = safeLabel(payment?.card?.type);
  const network = CARD_NETWORKS.has(rawNetwork) ? rawNetwork : null;
  const type = CARD_TYPES.has(rawType) ? rawType : null;
  const detail = [network, type].filter(Boolean).join(':') || null;
  return { providerMethod: method, providerMethodDetail: detail };
};

const safeErrorCode = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{1,80}$/.test(normalized) ? normalized : null;
};

const getSafeRazorpayPaymentDiagnostics = (payment) => ({
  ...getSafeRazorpayPaymentMethod(payment),
  providerErrorCode: safeErrorCode(payment?.error_code),
  providerErrorSource: safeLabel(payment?.error_source),
  providerErrorStep: safeLabel(payment?.error_step),
  providerErrorReason: safeLabel(payment?.error_reason),
});

module.exports = { getSafeRazorpayPaymentMethod, getSafeRazorpayPaymentDiagnostics };
