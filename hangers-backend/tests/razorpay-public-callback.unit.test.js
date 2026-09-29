const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicInvoiceReturnUrl, buildPublicRazorpayCallbackUrl } = require('../src/utils/razorpay-public-callback');

test('Razorpay redirect callback URL is built from the configured API origin and invoice binding', () => {
  const callback = new URL(buildPublicRazorpayCallbackUrl({
    slug: 'opaque/share-token', invoiceId: 'invoice_123', apiUrl: 'https://api.example.test/base',
  }));
  assert.equal(callback.origin, 'https://api.example.test');
  assert.equal(callback.pathname, '/api/v1/public/invoices/opaque%2Fshare-token/payment/callback');
  assert.equal(callback.searchParams.get('invoiceId'), 'invoice_123');
});

test('Razorpay redirect return URL stays on the configured CRM origin and preserves invoice selection', () => {
  const destination = new URL(buildPublicInvoiceReturnUrl({
    slug: 'share-token', invoiceId: 'invoice_123', crmUrl: 'https://crm.example.test/subpath',
  }));
  assert.equal(destination.origin, 'https://crm.example.test');
  assert.equal(destination.pathname, '/invoice/share-token');
  assert.equal(destination.searchParams.get('invoiceId'), 'invoice_123');
});

test('Razorpay redirect URLs reject unsafe schemes, URL credentials, and invalid configuration', () => {
  assert.throws(() => buildPublicRazorpayCallbackUrl({ slug: 'share', apiUrl: 'javascript:alert(1)' }), { code: 'PUBLIC_CALLBACK_URL_INVALID' });
  assert.throws(() => buildPublicInvoiceReturnUrl({ slug: 'share', crmUrl: 'https://user:pass@crm.example.test' }), { code: 'PUBLIC_CALLBACK_URL_INVALID' });
  assert.throws(() => buildPublicInvoiceReturnUrl({ slug: 'share', crmUrl: 'not a URL' }), { code: 'PUBLIC_CALLBACK_URL_INVALID' });
});
