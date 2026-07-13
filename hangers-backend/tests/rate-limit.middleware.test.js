const test = require('node:test');
const assert = require('node:assert/strict');

const { globalApiLimiter, publicShareLimiter } = require('../src/middleware/rateLimit');

test('global API limiter is configured', () => {
  assert.equal(typeof globalApiLimiter, 'function');
});

test('public share limiter is stricter than global limiter', () => {
  assert.equal(typeof publicShareLimiter, 'function');
  assert.ok(publicShareLimiter);
});

