const getConfiguredOrigin = (value, fallback, label) => {
  let url;
  try {
    url = new URL(value || fallback);
  } catch {
    const error = new Error(`${label} must be a valid absolute URL`);
    error.code = 'PUBLIC_CALLBACK_URL_INVALID';
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    const error = new Error(`${label} must use HTTP or HTTPS without credentials`);
    error.code = 'PUBLIC_CALLBACK_URL_INVALID';
    throw error;
  }
  return url.origin;
};

const buildPublicRazorpayCallbackUrl = ({ slug, invoiceId, apiUrl = process.env.PUBLIC_API_URL }) => {
  if (!slug || String(slug).length > 256) throw new Error('Invoice share token is invalid');
  const origin = getConfiguredOrigin(apiUrl, 'http://localhost:5001', 'PUBLIC_API_URL');
  const callback = new URL(`/api/v1/public/invoices/${encodeURIComponent(String(slug))}/payment/callback`, origin);
  if (invoiceId) callback.searchParams.set('invoiceId', String(invoiceId));
  return callback.toString();
};

const buildPublicInvoiceReturnUrl = ({ slug, invoiceId, crmUrl = process.env.CRM_URL }) => {
  if (!slug || String(slug).length > 256) throw new Error('Invoice share token is invalid');
  const origin = getConfiguredOrigin(crmUrl, 'http://localhost:5002', 'CRM_URL');
  const invoiceUrl = new URL(`/invoice/${encodeURIComponent(String(slug))}`, origin);
  if (invoiceId) invoiceUrl.searchParams.set('invoiceId', String(invoiceId));
  return invoiceUrl.toString();
};

module.exports = { buildPublicRazorpayCallbackUrl, buildPublicInvoiceReturnUrl };
