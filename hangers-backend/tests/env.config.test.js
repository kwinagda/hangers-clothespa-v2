const test = require('node:test');
const assert = require('node:assert/strict');

const { getAllowedOrigins, validateEnvironment } = require('../src/config/env');

const snapshotEnv = () => ({ ...process.env });
const restoreEnv = (snapshot) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
};

test('development environment keeps localhost origins available', () => {
  const env = snapshotEnv();
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CRM_URL;

    assert.ok(getAllowedOrigins().includes('http://localhost:5002'));
  } finally {
    restoreEnv(env);
  }
});

test('production environment rejects localhost and missing Redis', () => {
  const env = snapshotEnv();
  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://example';
    process.env.JWT_SECRET = 'x'.repeat(64);
    process.env.CRM_URL = 'http://localhost:5002';
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.REDIS_URL;

    assert.throws(
      () => validateEnvironment(),
      /Production allowed origins cannot include localhost|REDIS_URL is required/
    );
  } finally {
    restoreEnv(env);
  }
});

test('production environment accepts explicit HTTPS origins and Redis', () => {
  const env = snapshotEnv();
  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://example';
    process.env.JWT_SECRET = 'x'.repeat(64);
    process.env.ALLOWED_ORIGINS = 'https://crm.example.com';
    delete process.env.CRM_URL;
    delete process.env.CUSTOMER_APP_URL;
    delete process.env.STAFF_APP_URL;
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DEV_MODE = 'false';

    assert.deepEqual(validateEnvironment().allowedOrigins, ['https://crm.example.com']);
  } finally {
    restoreEnv(env);
  }
});

