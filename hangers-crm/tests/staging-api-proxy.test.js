const test = require('node:test');
const assert = require('node:assert/strict');
const { stagingApiOrigin, proxyStagingApiRequest } = require('../src/lib/stagingApiProxy');

const configPath = require.resolve('../next.config.js');
const readRewrites = async (value) => {
  if (value === undefined) delete process.env.CRM_STAGING_API_PROXY_URL;
  else process.env.CRM_STAGING_API_PROXY_URL = value;
  delete require.cache[configPath];
  return require(configPath).rewrites();
};

test('staging API proxy is disabled by default', async () => {
  assert.deepEqual(await readRewrites(undefined), []);
});

test('saved-card proxy path gets no-referrer without changing the site-wide policy', async () => {
  const headers = await require('../next.config.js').headers();
  const sitePolicy = headers.find((rule) => rule.source === '/(.*)')
    .headers.find((header) => header.key === 'Referrer-Policy');
  const savedCardsRule = headers.find((rule) => rule.source === '/api/v1/customer/payments/razorpay/saved-cards/:path*');

  assert.equal(sitePolicy.value, 'strict-origin-when-cross-origin');
  assert.deepEqual(savedCardsRule.headers, [{ key: 'Referrer-Policy', value: 'no-referrer' }]);
});

test('staging API proxy only forwards to credential-free loopback origins', async () => {
  assert.deepEqual(await readRewrites('http://localhost:5001'), [
    { source: '/__staging_health', destination: 'http://localhost:5001/health' },
    { source: '/__staging_ready', destination: 'http://localhost:5001/ready' },
  ]);
  await assert.rejects(readRewrites('https://api.hangers-cs.com'), /loopback origin/);
  await assert.rejects(readRewrites('http://127.0.0.1:55101/api/v1'), /loopback origin/);
  await assert.rejects(readRewrites('http://user:pass@127.0.0.1:55101'), /loopback origin/);
});

test('staging API proxy removes browser Origin but preserves CRM cookies and API response cookies', async () => {
  let received;
  const previousOrigin = process.env.CRM_STAGING_API_PROXY_URL;
  const originalFetch = global.fetch;
  process.env.CRM_STAGING_API_PROXY_URL = 'http://localhost:5001';
  global.fetch = async (url, options) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.getSetCookie = () => ['crm_session=rotated; Path=/; HttpOnly', 'csrf=next; Path=/; SameSite=Lax'];
    received = {
      origin: options.headers.get('origin'),
      cookie: options.headers.get('cookie'),
      url: new URL(url).pathname + new URL(url).search,
      method: options.method,
    };
    return { status: 200, statusText: 'OK', headers, body: new Response(JSON.stringify({ ok: true })).body };
  };
  try {
    const request = new Request('http://localhost:5002/api/v1/staff/auth/me?scope=finance', {
      headers: { Origin: 'http://localhost:5002', Cookie: 'crm_session=existing', Accept: 'application/json' },
    });
    const response = await proxyStagingApiRequest(request, ['staff', 'auth', 'me']);
    assert.equal(response.status, 200);
    assert.deepEqual(received, { origin: null, cookie: 'crm_session=existing', url: '/api/v1/staff/auth/me?scope=finance', method: 'GET' });
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(response.headers.getSetCookie(), ['crm_session=rotated; Path=/; HttpOnly', 'csrf=next; Path=/; SameSite=Lax']);
  } finally {
    global.fetch = originalFetch;
    if (previousOrigin === undefined) delete process.env.CRM_STAGING_API_PROXY_URL;
    else process.env.CRM_STAGING_API_PROXY_URL = previousOrigin;
  }
});

test('staging API proxy never sends a request to a non-loopback target', async () => {
  assert.throws(() => stagingApiOrigin('https://api.hangers-cs.com'), /loopback origin/);
  process.env.CRM_STAGING_API_PROXY_URL = 'https://api.hangers-cs.com';
  const response = await proxyStagingApiRequest(new Request('http://127.0.0.1/api/v1/payments'), ['payments']);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'STAGING_API_PROXY_CONFIG_INVALID');
  delete process.env.CRM_STAGING_API_PROXY_URL;
});

test('local API connection failures return a direct diagnostic', async () => {
  const originalFetch = global.fetch;
  const previousOrigin = process.env.CRM_STAGING_API_PROXY_URL;
  process.env.CRM_STAGING_API_PROXY_URL = 'http://localhost:59999';
  global.fetch = async () => { throw new Error('connection refused'); };
  try {
    const response = await proxyStagingApiRequest(new Request('http://localhost/api/v1/staff/auth/me'), ['staff', 'auth', 'me']);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, 'LOCAL_API_UNAVAILABLE');
    assert.match(body.message, /local API.*database/i);
  } finally {
    global.fetch = originalFetch;
    if (previousOrigin === undefined) delete process.env.CRM_STAGING_API_PROXY_URL;
    else process.env.CRM_STAGING_API_PROXY_URL = previousOrigin;
  }
});
