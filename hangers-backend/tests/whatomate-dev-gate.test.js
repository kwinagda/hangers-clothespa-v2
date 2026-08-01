const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isDevPhoneAllowed,
  isEnabled,
  normalizePhone,
} = require('../src/services/whatomate.service');

const withEnv = (patch, fn) => {
  const previous = {};
  for (const key of Object.keys(patch)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('Whatomate dev gate normalizes Indian phone numbers', () => {
  assert.equal(normalizePhone('9930367267'), '919930367267');
  assert.equal(normalizePhone('+91 99303 67267'), '919930367267');
});

test('Whatomate dev gate blocks non-allowlisted localhost sends', () => {
  withEnv({
    DEV_MODE: 'true',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('Whatomate dev gate permits allowlisted localhost test phone only', () => {
  withEnv({
    DEV_MODE: 'true',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isEnabled('9930367267'), true);
  });
});

test('Whatomate dev gate does not restrict production sends', () => {
  withEnv({
    DEV_MODE: 'false',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('919876543210'), true);
    assert.equal(isEnabled('919876543210'), true);
  });
});
