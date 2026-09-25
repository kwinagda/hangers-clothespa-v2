const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkProcesses, versionSupported } = require('../../scripts/deploy/check-pm2-node-runtime');

const deployScript = path.resolve(__dirname, '../../scripts/deploy/deploy-ec2-code.sh');

const checkVersion = (version) => spawnSync('bash', [deployScript, '--check-node-version', version], {
  encoding: 'utf8',
});

test('production deployment accepts only stable Node.js >=22.2.0', () => {
  for (const version of ['v22.2.0', '22.2.1', 'v23.0.0', 'v24.14.0']) {
    const result = checkVersion(version);
    assert.equal(result.status, 0, `${version}: ${result.stderr}`);
  }

  for (const version of ['v20.20.2', 'v22.1.99', 'v22.2.0-rc.1', 'unknown']) {
    const result = checkVersion(version);
    assert.equal(result.status, 1, `${version} must fail the production runtime gate`);
    assert.match(result.stderr, /requires >=22\.2\.0/);
  }
});

test('PM2 runtime gate requires both payment processes on supported Node binaries', () => {
  assert.equal(versionSupported('v22.2.0'), true);
  assert.equal(versionSupported('v22.1.99'), false);
  assert.equal(versionSupported('v20.20.2'), false);
  assert.equal(versionSupported('v22.2.0-rc.1'), false);

  const problems = checkProcesses([], '/proc');
  assert.match(problems.join('\n'), /hangers-backend is missing/);
  assert.match(problems.join('\n'), /hangers-worker is missing/);
});

test('PM2 runtime gate executes each online payment process binary', (t) => {
  const procRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-pm2-runtime-'));
  t.after(() => fs.rmSync(procRoot, { recursive: true, force: true }));

  for (const pid of [101, 102]) {
    const processDir = path.join(procRoot, String(pid));
    fs.mkdirSync(processDir);
    fs.symlinkSync(process.execPath, path.join(processDir, 'exe'));
  }

  const processes = [
    { name: 'hangers-backend', pid: 101, pm2_env: { status: 'online' } },
    { name: 'hangers-worker', pid: 102, pm2_env: { status: 'online' } },
    { name: 'hangers-crm', pid: 103, pm2_env: { status: 'online' } },
  ];
  const output = [];
  assert.deepEqual(checkProcesses(processes, procRoot, (line) => output.push(line)), []);
  assert.equal(output.length, 2);
  assert.ok(output.every((line) => line.includes(process.version)));

  processes[1].pm2_env.status = 'stopped';
  assert.match(checkProcesses(processes, procRoot).join('\n'), /hangers-worker is not online/);
});
