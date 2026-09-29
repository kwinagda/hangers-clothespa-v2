#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');

const SECRET_IDS = Object.freeze({
  api: 'hangers/production/razorpay/live-api',
  webhook: 'hangers/production/razorpay/live-webhook',
});
const PAYMENT_PROCESSES = Object.freeze(['hangers-backend', 'hangers-worker']);

function parseCredentials(apiSecretString, webhookSecretString) {
  let credentials;
  try {
    credentials = JSON.parse(apiSecretString);
  } catch {
    throw new Error('Live Razorpay API secret must contain a JSON key pair.');
  }

  const keyId = credentials.key_id || credentials.keyId;
  const keySecret = credentials.key_secret || credentials.keySecret;
  if (typeof keyId !== 'string' || !/^rzp_live_[A-Za-z0-9]+$/.test(keyId)) {
    throw new Error('Live Razorpay API key ID is missing or is not a Live key.');
  }
  if (typeof keySecret !== 'string' || !keySecret.trim() || keySecret !== keySecret.trim()) {
    throw new Error('Live Razorpay API key secret is missing or malformed.');
  }
  if (typeof webhookSecretString !== 'string' || !webhookSecretString.trim()
    || webhookSecretString !== webhookSecretString.trim()) {
    throw new Error('Live Razorpay webhook secret is missing or malformed.');
  }

  return {
    RAZORPAY_KEY_ID: keyId,
    RAZORPAY_KEY_SECRET: keySecret,
    RAZORPAY_WEBHOOK_SECRET_LIVE: webhookSecretString,
  };
}

function getSecretString(secretId, region) {
  try {
    return execFileSync('aws', [
      'secretsmanager', 'get-secret-value',
      '--region', region,
      '--secret-id', secretId,
      '--query', 'SecretString',
      '--output', 'text',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r?\n$/, '');
  } catch {
    throw new Error(`Unable to retrieve required Live Razorpay secret: ${secretId}.`);
  }
}

function commandSucceeded(result) {
  return result && result.status === 0 && !result.error;
}

function parseProcessEnvironment(buffer) {
  const environment = {};
  for (const entry of buffer.toString('utf8').split('\0')) {
    const separator = entry.indexOf('=');
    if (separator > 0) environment[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return environment;
}

function verifyPaymentProcesses(processes, expectedEnvironment, readProcessEnvironment = fs.readFileSync) {
  const problems = [];
  for (const name of PAYMENT_PROCESSES) {
    const matches = processes.filter((process) => process.name === name);
    if (matches.length !== 1) {
      problems.push(`${name} is missing or duplicated in PM2`);
      continue;
    }
    const process = matches[0];
    if (process.pm2_env?.status !== 'online' || !Number.isSafeInteger(process.pid) || process.pid <= 0) {
      problems.push(`${name} is not online with a valid PID`);
      continue;
    }
    let environment;
    try {
      environment = parseProcessEnvironment(readProcessEnvironment(`/proc/${process.pid}/environ`));
    } catch {
      problems.push(`${name} runtime environment could not be verified`);
      continue;
    }
    for (const key of Object.keys(expectedEnvironment)) {
      if (environment[key] !== expectedEnvironment[key]) {
        problems.push(`${name} does not have the expected ${key}`);
      }
    }
  }
  return problems;
}

function runPm2(args, environment) {
  const result = spawnSync('pm2', args, {
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  if (!commandSucceeded(result)) throw new Error('PM2 command failed during Live credential activation.');
  return result.stdout;
}

function activateLiveCredentials({
  getSecret = getSecretString,
  run = runPm2,
  readProcessEnvironment = fs.readFileSync,
  region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1',
  baseEnvironment = process.env,
  maxChecks = 30,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  return (async () => {
    const expectedEnvironment = parseCredentials(
      getSecret(SECRET_IDS.api, region),
      getSecret(SECRET_IDS.webhook, region),
    );
    const runtimeEnvironment = { ...baseEnvironment, ...expectedEnvironment };

    for (const name of PAYMENT_PROCESSES) {
      run(['restart', name, '--update-env'], runtimeEnvironment);
    }

    let lastProblems = [];
    for (let attempt = 0; attempt < maxChecks; attempt += 1) {
      try {
        const processes = JSON.parse(run(['jlist'], runtimeEnvironment));
        lastProblems = verifyPaymentProcesses(processes, expectedEnvironment, readProcessEnvironment);
        if (lastProblems.length === 0) return { verified: true, processes: PAYMENT_PROCESSES };
      } catch {
        lastProblems = ['PM2 process state could not be verified'];
      }
      if (attempt + 1 < maxChecks) await wait(1000);
    }
    throw new Error(`Live credential activation failed verification: ${lastProblems.join('; ')}`);
  })();
}

if (require.main === module) {
  activateLiveCredentials().then((result) => {
    process.stdout.write(`Live Razorpay credentials verified in ${result.processes.join(' and ')}. Secret values were not logged.\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  PAYMENT_PROCESSES,
  SECRET_IDS,
  activateLiveCredentials,
  parseCredentials,
  parseProcessEnvironment,
  verifyPaymentProcesses,
};
