const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const maskToken = (value) => {
  const text = String(value || '');
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const providerErrorSummary = (err) => {
  const status = err?.response?.status;
  const code = err?.response?.data?.code || err?.response?.data?.error || err?.code;
  const message = err?.response?.data?.message || err?.message;
  return {
    ...(status && { status }),
    ...(code && { code }),
    ...(message && { message: String(message).slice(0, 160) }),
  };
};

const safeText = (value, limit) => {
  if (typeof value !== 'string') return undefined;
  const text = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(?:cvv|cvc|otp|pin|password|key[_ -]?secret|api[_ -]?key|signature|authorization|access[_ -]?token|refresh[_ -]?token)\b["']?\s*[:=]?\s*["']?([A-Za-z0-9+/=_-]+)/gi, '[redacted-credential]')
    .replace(/\b(?:token|card|cust)_[A-Za-z0-9]+\b/gi, '[redacted-instrument]')
    .replace(/\brzp_(?:test|live)_[A-Za-z0-9]+\b/gi, '[redacted-credential]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-credential]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[redacted-number]')
    .replace(/\b\d{3,}\b/g, '[redacted-number]')
    .trim();
  return text ? text.slice(0, limit) : undefined;
};

const safeProviderId = (value, prefix) => (
  typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`).test(value)
    ? value
    : undefined
);

const sanitizeRazorpayErrorSummary = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const status = Number(value.httpStatus || value.status);
  const result = {
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
  };
  for (const [field, limit] of Object.entries({
    code: 80,
    description: 240,
    field: 80,
    source: 64,
    step: 80,
    reason: 120,
  })) {
    const raw = value[field];
    const sanitized = safeText(raw, limit);
    if (!sanitized) continue;
    if (field !== 'description' && sanitized !== raw) continue;
    result[field] = sanitized;
  }
  if (value.origin === 'razorpay') result.origin = 'razorpay';
  const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
    ? value.metadata
    : {};
  const paymentId = safeProviderId(value.payment_id || metadata.payment_id, 'pay');
  const orderId = safeProviderId(value.order_id || metadata.order_id, 'order');
  if (paymentId) result.payment_id = paymentId;
  if (orderId) result.order_id = orderId;
  return result;
};

// Razorpay's documented error envelope is nested under `error`. Keep this
// provider-specific so existing MSG91/WhatsApp summaries remain unchanged.
const razorpayErrorSummary = (err) => {
  const body = err?.response?.data;
  const root = body?.error && typeof body.error === 'object'
    ? body.error
    : (err?.error && typeof err.error === 'object' ? err.error : body || {});
  const metadata = root.metadata && typeof root.metadata === 'object' ? root.metadata : {};
  const status = Number(err?.response?.status || err?.statusCode);
  const summary = {
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
    ...(safeText(root.code || err?.code, 80) ? { code: safeText(root.code || err?.code, 80) } : {}),
    ...(safeText(root.description, 240) ? { description: safeText(root.description, 240) } : {}),
    ...(safeText(root.field, 80) ? { field: safeText(root.field, 80) } : {}),
    ...(safeText(root.source, 64) ? { source: safeText(root.source, 64) } : {}),
    ...(safeText(root.step, 80) ? { step: safeText(root.step, 80) } : {}),
    ...(safeText(root.reason, 120) ? { reason: safeText(root.reason, 120) } : {}),
    ...(safeProviderId(metadata.payment_id, 'pay') ? { payment_id: safeProviderId(metadata.payment_id, 'pay') } : {}),
    ...(safeProviderId(metadata.order_id, 'order') ? { order_id: safeProviderId(metadata.order_id, 'order') } : {}),
  };
  return sanitizeRazorpayErrorSummary(summary);
};

module.exports = {
  maskPhone,
  maskToken,
  providerErrorSummary,
  razorpayErrorSummary,
  safeText,
  sanitizeRazorpayErrorSummary,
};
