'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAYMENT_PROCESSES,
  SECRET_IDS,
  activateLiveCredentials,
  parseCredentials,
  parseProcessEnvironment,
  verifyPaymentProcesses,
} = require('../../scripts/deploy/load-live-razorpay-secrets');

const liveSecrets = {
  [SECRET_IDS.api]: JSON.stringify({ key_id: 'rzp_live_example123', key_secret: 'live-secret-value' }),
  [SECRET_IDS.webhook]: 'separate-webhook-secret',
};

function pm2List() {
  return [
    { name: 'hangers-backend', pid: 101, pm2_env: { status: 'online' } },
    { name: 'hangers-worker', pid: 102, pm2_env: { status: 'online' } },
    { name: 'hangers-razorpay-staging-api', pid: 103, pm2_env: { status: 'online' } },
  ];
}

function expectedProcEnvironment() {
  return Buffer.from([
    'RAZORPAY_KEY_ID=rzp_live_example123',
    'RAZORPAY_KEY_SECRET=live-secret-value',
    'RAZORPAY_WEBHOOK_SECRET_LIVE=separate-webhook-secret',
  ].join('\0') + '\0');
}

test('Live secret parser rejects Test, malformed, and incomplete credentials', () => {
  assert.throws(() => parseCredentials(JSON.stringify({
    key_id: 'rzp_test_not_live', key_secret: 'secret',
  }), 'webhook'), /not a Live key/);
  assert.throws(() => parseCredentials('not-json', 'webhook'), /JSON key pair/);
  assert.throws(() => parseCredentials(JSON.stringify({
    key_id: 'rzp_live_example123', key_secret: '',
  }), 'webhook'), /key secret is missing/);
  assert.throws(() => parseCredentials(JSON.stringify({
    key_id: 'rzp_live_example123', key_secret: 'secret',
  }), '  '), /webhook secret is missing/);
});

test('running process environment parser preserves values after the first equals sign', () => {
  const parsed = parseProcessEnvironment(Buffer.from('A=one\0B=two=three\0'));
  assert.deepEqual(parsed, { A: 'one', B: 'two=three' });
});

test('activation retrieves exact Live secret names and restarts only production backend and worker', async () => {
  const secretReads = [];
  const pm2Calls = [];
  const result = await activateLiveCredentials({
    region: 'ap-south-1',
    baseEnvironment: { PM2_HOME: '/home/ubuntu/.pm2', PATH: '/usr/bin' },
    getSecret: (secretId, region) => {
      secretReads.push({ secretId, region });
      return liveSecrets[secretId];
    },
    run: (args, environment) => {
      pm2Calls.push({ args, environment });
      if (args[0] === 'jlist') return JSON.stringify(pm2List());
      return '';
    },
    readProcessEnvironment: () => expectedProcEnvironment(),
    maxChecks: 1,
  });

  assert.equal(result.verified, true);
  assert.deepEqual(secretReads, [
    { secretId: SECRET_IDS.api, region: 'ap-south-1' },
    { secretId: SECRET_IDS.webhook, region: 'ap-south-1' },
  ]);
  assert.deepEqual(pm2Calls.filter(({ args }) => args[0] === 'restart').map(({ args }) => args), [
    ['restart', 'hangers-backend', '--update-env'],
    ['restart', 'hangers-worker', '--update-env'],
  ]);
  assert.ok(pm2Calls.every(({ args }) => !args.includes('hangers-razorpay-staging-api')));
  assert.equal(pm2Calls[0].environment.RAZORPAY_KEY_ID, 'rzp_live_example123');
  assert.equal(pm2Calls[0].environment.RAZORPAY_WEBHOOK_SECRET_LIVE, 'separate-webhook-secret');
  assert.deepEqual(PAYMENT_PROCESSES, ['hangers-backend', 'hangers-worker']);
});

test('activation refuses a Test key before invoking PM2', async () => {
  let pm2Invoked = false;
  await assert.rejects(activateLiveCredentials({
    getSecret: (secretId) => secretId === SECRET_IDS.api
      ? JSON.stringify({ key_id: 'rzp_test_wrong_mode', key_secret: 'secret' })
      : 'webhook',
    run: () => { pm2Invoked = true; },
    maxChecks: 1,
  }), /not a Live key/);
  assert.equal(pm2Invoked, false);
});

test('verification requires both production processes online with the exact runtime secrets', () => {
  const expected = parseCredentials(liveSecrets[SECRET_IDS.api], liveSecrets[SECRET_IDS.webhook]);
  const errors = verifyPaymentProcesses(pm2List(), expected, () => expectedProcEnvironment());
  assert.deepEqual(errors, []);

  const mismatch = verifyPaymentProcesses(pm2List(), expected, () => Buffer.from('RAZORPAY_KEY_ID=rzp_test_wrong\0'));
  assert.ok(mismatch.some((problem) => problem.includes('RAZORPAY_KEY_SECRET')));
  assert.ok(mismatch.some((problem) => problem.includes('RAZORPAY_WEBHOOK_SECRET_LIVE')));
});
