#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const REQUIRED_APPS = ['hangers-backend', 'hangers-worker'];
const MIN_NODE_VERSION = [22, 2, 0];

function versionSupported(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  for (let index = 0; index < MIN_NODE_VERSION.length; index += 1) {
    if (actual[index] > MIN_NODE_VERSION[index]) return true;
    if (actual[index] < MIN_NODE_VERSION[index]) return false;
  }
  return true;
}

function checkProcesses(processes, procRoot = '/proc', report = () => {}) {
  const problems = [];
  const found = new Map();

  for (const process of processes) {
    if (!REQUIRED_APPS.includes(process.name)) continue;
    if (found.has(process.name)) problems.push(`${process.name} has multiple PM2 entries`);
    else found.set(process.name, process);
  }

  for (const name of REQUIRED_APPS) {
    const process = found.get(name);
    if (!process) {
      problems.push(`${name} is missing from PM2`);
      continue;
    }
    if (process.pm2_env?.status !== 'online') {
      problems.push(`${name} is not online (status: ${process.pm2_env?.status || 'unknown'})`);
      continue;
    }
    if (!Number.isSafeInteger(process.pid) || process.pid <= 0) {
      problems.push(`${name} has an invalid PID`);
      continue;
    }

    let version;
    try {
      version = execFileSync(`${procRoot}/${process.pid}/exe`, ['-v'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch {
      problems.push(`${name} runtime could not be read from ${procRoot}/${process.pid}/exe`);
      continue;
    }
    if (!versionSupported(version)) {
      problems.push(`${name} is running unsupported Node.js ${version}; requires >=22.2.0`);
      continue;
    }
    report(`${name}: Node.js ${version}`);
  }

  return problems;
}

if (require.main === module) {
  try {
    const processes = JSON.parse(execFileSync('pm2', ['jlist'], {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    }));
    const problems = checkProcesses(processes, '/proc', (message) => process.stdout.write(`${message}\n`));
    if (problems.length) {
      for (const problem of problems) process.stderr.write(`PM2 runtime preflight: ${problem}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`PM2 runtime preflight failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkProcesses, versionSupported };
