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
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[redacted-number]')
    .replace(/\b\d{4,16}\b/g, '[redacted-number]')
    .trim();
  return text ? text.slice(0, limit) : undefined;
};

const safeProviderId = (value, prefix) => (
  typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`).test(value)
    ? value
    : undefined
);

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
  return summary;
};

module.exports = { maskPhone, maskToken, providerErrorSummary, razorpayErrorSummary, safeText };
