const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
  isDevPhoneAllowed,
  isEnabled,
  normalizePhone,
  postTemplate,
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

const withEnvAsync = async (patch, fn) => {
  const previous = {};
  for (const key of Object.keys(patch)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
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
    NODE_ENV: 'development',
    DEV_MODE: 'true',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), false);
    assert.equal(isEnabled('9930367267'), false);
  });
});

test('Whatomate dev gate permits allowlisted localhost test phone only', () => {
  withEnv({
    NODE_ENV: 'development',
    DEV_MODE: 'true',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isEnabled('9930367267'), true);
  });
});

test('Whatomate dev gate never lets the send switch bypass the phone allowlist', () => {
  withEnv({
    NODE_ENV: 'development',
    DEV_MODE: 'true',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_SEND_IN_DEV: 'true',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267,919876543210',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isEnabled('+91 99303 67267'), true);
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('Whatomate dev gate keeps the Home-only boundary when DEV_MODE is not enabled', () => {
  withEnv({
    NODE_ENV: 'development',
    DEV_MODE: 'false',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('local DEV_MODE remains Home-only even if a Live key is accidentally configured', () => {
  withEnv({
    NODE_ENV: 'development',
    DEV_MODE: 'true',
    RAZORPAY_KEY_ID: 'rzp_live_unit_test',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267,919876543210',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('a conflicting configured Test contact blocks all development sends', () => {
  withEnv({
    NODE_ENV: 'development',
    DEV_MODE: 'true',
    RAZORPAY_TEST_CONTACT_NUMBER: '919876543210',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267,919876543210',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), false);
    assert.equal(isEnabled('9930367267'), false);
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('non-Home payment notification is blocked before any Whatomate HTTP request in development', async () => {
  const previousAdapter = axios.defaults.adapter;
  let outboundRequests = 0;
  axios.defaults.adapter = async (config) => {
    outboundRequests += 1;
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };

  try {
    await withEnvAsync({
      DEV_MODE: 'true',
      RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
      WHATOMATE_SEND_IN_DEV: 'true',
      WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
      WHATOMATE_API_KEY: 'whm_valid_local_test_key',
    }, async () => {
      await assert.rejects(
        postTemplate({
          phone: '919876543210',
          templateName: 'hangers_crm_payment_received',
          throwOnFailure: true,
        }),
        (error) => error?.code === 'DEV_SEND_BLOCKED' && error?.retryable === false,
      );
    });
    assert.equal(outboundRequests, 0);
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test('misconfigured Test contact blocks the Home template send before any Whatomate HTTP request', async () => {
  const previousAdapter = axios.defaults.adapter;
  let outboundRequests = 0;
  axios.defaults.adapter = async (config) => {
    outboundRequests += 1;
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };

  try {
    await withEnvAsync({
      NODE_ENV: 'development',
      DEV_MODE: 'true',
      RAZORPAY_TEST_CONTACT_NUMBER: '919876543210',
      WHATOMATE_SEND_IN_DEV: 'true',
      WHATOMATE_DEV_ALLOWED_PHONES: '919930367267,919876543210',
      WHATOMATE_API_KEY: 'whm_valid_local_test_key',
    }, async () => {
      await assert.rejects(
        postTemplate({
          phone: '9930367267',
          templateName: 'hangers_crm_payment_received',
          throwOnFailure: true,
        }),
        (error) => error?.code === 'DEV_SEND_BLOCKED' && error?.retryable === false,
      );
    });
    assert.equal(outboundRequests, 0);
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test('lost template response remains uncertain and retry preserves the payment idempotency key', async () => {
  const previousAdapter = axios.defaults.adapter;
  const requests = [];
  axios.defaults.adapter = async (config) => {
    requests.push({ key: config.headers.get('X-Idempotency-Key'), body: JSON.parse(config.data) });
    if (requests.length === 1) throw Object.assign(new Error('Injected lost response'), { code: 'ECONNABORTED' });
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    await withEnvAsync({
      NODE_ENV: 'development', DEV_MODE: 'true', RAZORPAY_KEY_ID: 'rzp_test_unit_test',
      RAZORPAY_TEST_CONTACT_NUMBER: '9930367267', WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
      WHATOMATE_API_KEY: 'whm_valid_local_test_key',
    }, async () => {
      const input = {
        phone: '9930367267', templateName: 'hangers_crm_payment_received',
        templateParams: { amount: '10' }, idempotencyKey: 'payment-received:local-unit-payment', throwOnFailure: true,
      };
      await assert.rejects(postTemplate(input), (error) => error.code === 'PROVIDER_RETRYABLE_FAILURE'
        && error.retryable === true && error.statusCode === null);
      assert.equal(await postTemplate(input), true);
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].key, 'payment-received:local-unit-payment');
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(requests[0].body.phone_number, '919930367267');
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test('Whatomate dev gate does not restrict production sends', () => {
  withEnv({
    NODE_ENV: 'production',
    DEV_MODE: 'false',
    RAZORPAY_KEY_ID: 'rzp_live_unit_test',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isDevPhoneAllowed('919876543210'), true);
    assert.equal(isEnabled('9930367267'), true);
  });
});

test('production-configured Test mode remains restricted to the approved Home number', () => {
  withEnv({
    NODE_ENV: 'production',
    DEV_MODE: 'false',
    RAZORPAY_KEY_ID: 'rzp_test_unit_test',
    RAZORPAY_TEST_CONTACT_NUMBER: '9930367267',
    WHATOMATE_DEV_ALLOWED_PHONES: '919930367267',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, () => {
    assert.equal(isDevPhoneAllowed('9930367267'), true);
    assert.equal(isEnabled('9930367267'), true);
    assert.equal(isDevPhoneAllowed('919876543210'), false);
    assert.equal(isEnabled('919876543210'), false);
  });
});

test('blocked local sends cannot be reported as successful delivery', async () => {
  await withEnvAsync({
    DEV_MODE: 'true',
    WHATOMATE_SEND_IN_DEV: 'false',
    WHATOMATE_DEV_ALLOWED_PHONES: '',
    WHATOMATE_API_KEY: 'whm_valid_local_test_key',
  }, async () => {
    const result = await postTemplate({
      phone: '9930367267',
      templateName: 'test_template',
    });
    assert.equal(result, false);
    await assert.rejects(
      postTemplate({ phone: '9930367267', templateName: 'test_template', throwOnFailure: true }),
      (error) => error?.code === 'DEV_SEND_BLOCKED' && error?.retryable === false,
    );
  });
});
