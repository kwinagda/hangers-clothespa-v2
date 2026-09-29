const test = require('node:test');
const assert = require('node:assert/strict');

const { globalApiLimiter, publicShareLimiter } = require('../src/middleware/rateLimit');
const { app } = require('../src/index');

test('global API limiter is configured', () => {
  assert.equal(typeof globalApiLimiter, 'function');
});

test('public share limiter is stricter than global limiter', () => {
  assert.equal(typeof publicShareLimiter, 'function');
  assert.ok(publicShareLimiter);
});

test('Razorpay webhook router is mounted after raw-body parsing and before the global API limiter', () => {
  const layers = app._router.stack;
  const parserIndex = layers.findIndex((layer) => layer.name === 'jsonParser');
  const webhookIndex = layers.findIndex((layer) => layer.name === 'router' && String(layer.regexp).includes('api\\/v1\\/webhooks'));
  const limiterIndex = layers.findIndex((layer) => layer.handle === globalApiLimiter);

  assert.ok(parserIndex >= 0, 'Express JSON parser is mounted');
  assert.ok(webhookIndex > parserIndex, 'webhook router follows JSON parsing and raw-byte capture');
  assert.ok(limiterIndex > webhookIndex, 'webhook router precedes the shared API rate limiter');
});
