const test = require('node:test');
const assert = require('node:assert/strict');

const { hasValidSameOrigin, requireTrustedWrite } = require('../src/middleware/origin');
const { privateNoStore } = require('../src/middleware/privateCache');

test('trusted origin middleware allows configured CRM origin', () => {
  process.env.CRM_URL = 'http://localhost:5002';
  const req = {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5002',
      host: 'localhost:5001',
      'x-forwarded-proto': 'http',
      'sec-fetch-site': 'same-site',
    },
  };
  assert.equal(hasValidSameOrigin(req), true);
});

test('trusted origin middleware rejects unexpected browser origin', () => {
  process.env.CRM_URL = 'http://localhost:5002';
  const req = {
    method: 'PATCH',
    headers: {
      origin: 'http://evil.example.com',
      host: 'localhost:5001',
      'x-forwarded-proto': 'http',
      'sec-fetch-site': 'cross-site',
    },
  };
  assert.equal(hasValidSameOrigin(req), false);
});

test('requireTrustedWrite skips non-mutating methods', () => {
  let called = false;
  requireTrustedWrite({ method: 'GET', headers: {} }, {}, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('privateNoStore sets private cache headers', () => {
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };
  privateNoStore({}, res, () => {});
  assert.equal(headers['Cache-Control'], 'private, no-store, max-age=0, must-revalidate');
  assert.equal(headers.Vary, 'Cookie');
});
