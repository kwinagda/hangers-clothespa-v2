const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicInvoiceReturnUrl, buildPublicRazorpayCallbackUrl } = require('../src/utils/razorpay-public-callback');
const { handlePublicRazorpayCallback } = require('../src/controllers/public.controller');

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

const invokeCallback = async (body, settlePayment = async () => ({}), target = { invoice: { id: 'invoice_123' }, share: { id: 'share_123' } }) => {
  const result = { logs: [], settlements: [] };
  const req = { params: { slug: 'share-token' }, query: { invoiceId: 'invoice_123', returnUrl: 'https://attacker.example' }, body };
  const res = {
    set() {},
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; },
    redirect(code, destination) { result.status = code; result.destination = destination; return this; },
  };
  await handlePublicRazorpayCallback(req, res, null, {
    getPublicInvoiceForPayment: async () => target,
    settleCapturedPayment: async (input) => { result.settlements.push(input); return settlePayment(input); },
    logRazorpayAction: async (_req, action) => { result.logs.push(action); },
  });
  return result;
};

const callbackFields = { razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_123', razorpay_signature: 'signature_123' };

test('redirect callback binds verification to the resolved invoice and share, then uses a fixed invoice return', async () => {
  const result = await invokeCallback(callbackFields);
  assert.deepEqual(result.settlements, [{ providerOrderId: 'order_123', paymentId: 'pay_123', signature: 'signature_123', source: 'PUBLIC_INVOICE', expectedInvoiceId: 'invoice_123', expectedShareId: 'share_123' }]);
  assert.equal(result.status, 303);
  const destination = new URL(result.destination);
  assert.equal(destination.pathname, '/invoice/share-token');
  assert.equal(destination.searchParams.get('invoiceId'), 'invoice_123');
  assert.notEqual(destination.hostname, 'attacker.example');
  assert.equal(destination.searchParams.has('paid'), false);
});

test('pending, duplicate and invalid-signature callbacks return for authoritative invoice recovery', async () => {
  for (const settle of [async () => ({ pending: true }), async () => ({ alreadyRecorded: true }), async () => { throw new Error('Invalid signature'); }]) {
    const result = await invokeCallback(callbackFields, settle);
    assert.equal(result.status, 303);
    assert.equal(result.settlements.length, 1);
    assert.equal(new URL(result.destination).searchParams.has('paid'), false);
  }
});

test('incomplete, failure and array callback fields cannot settle a payment', async () => {
  for (const body of [{}, { error: { description: 'Failed' } }, { ...callbackFields, razorpay_signature: ['forged'] }]) {
    const result = await invokeCallback(body);
    assert.equal(result.status, 303);
    assert.equal(result.settlements.length, 0);
    assert.ok(result.logs.includes(body.error ? 'RAZORPAY_REDIRECT_CALLBACK_FAILED' : 'RAZORPAY_CALLBACK_INVALID'));
  }
});

test('callback cannot verify against an unavailable invoice share', async () => {
  const result = await invokeCallback(callbackFields, undefined, null);
  assert.equal(result.status, 404);
  assert.equal(result.settlements.length, 0);
});
