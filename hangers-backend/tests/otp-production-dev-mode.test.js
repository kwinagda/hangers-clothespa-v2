const test = require('node:test');
const assert = require('node:assert/strict');
const customerOtp = require('../src/services/msg91.service');
const deliveryOtp = require('../src/services/whatsapp-otp.service');

const envSnapshot = () => ({ ...process.env });
const restoreEnv = (snapshot) => {
  for (const key of Object.keys(process.env)) if (!(key in snapshot)) delete process.env[key];
  Object.assign(process.env, snapshot);
};

test('customer and delivery OTP services never enter fixed-code dev mode in production', () => {
  const previous = envSnapshot();
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MSG91_AUTH_KEY;
    process.env.DEV_MODE = 'true';
    process.env.WA_DELIVERY_OTP_DEV = 'true';
    assert.equal(customerOtp.isDevMode(), false);
    assert.equal(deliveryOtp.isDevMode(), false);
  } finally {
    restoreEnv(previous);
  }
});

test('missing MSG91 credentials still select the development OTP only outside production', () => {
  const previous = envSnapshot();
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.MSG91_AUTH_KEY;
    process.env.DEV_MODE = 'false';
    process.env.WA_DELIVERY_OTP_DEV = 'false';
    assert.equal(customerOtp.isDevMode(), true);
    assert.equal(deliveryOtp.isDevMode(), true);
  } finally {
    restoreEnv(previous);
  }
});
