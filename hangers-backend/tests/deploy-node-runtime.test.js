const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPm2Daemon, checkProcesses, versionSupported } = require('../../scripts/deploy/check-pm2-node-runtime');

const deployScript = path.resolve(__dirname, '../../scripts/deploy/deploy-ec2-code.sh');

const checkVersion = (version) => spawnSync('bash', [deployScript, '--check-node-version', version], {
  encoding: 'utf8',
});

test('production deployment accepts only stable Node.js 24 >=24.11.0', () => {
  for (const version of ['v24.11.0', '24.11.1', 'v24.14.0']) {
    const result = checkVersion(version);
    assert.equal(result.status, 0, `${version}: ${result.stderr}`);
  }

  for (const version of ['v20.20.2', 'v22.23.3', 'v24.10.99', 'v24.11.0-rc.1', 'v25.0.0', 'unknown']) {
    const result = checkVersion(version);
    assert.equal(result.status, 1, `${version} must fail the production runtime gate`);
    assert.match(result.stderr, /requires Node\.js 24 >=24\.11\.0/);
  }
});

test('production public-asset smoke checks stay within login and Finance scope', () => {
  const script = fs.readFileSync(deployScript, 'utf8');
  assert.match(script, /verify_public_next_assets "\/login"/);
  assert.match(script, /verify_public_next_assets "\/dashboard\/finance"/);
  assert.doesNotMatch(script, /verify_public_next_assets "\/dashboard\/iron\//);
});

test('production deployment revalidates backend and worker PM2 state after restart', () => {
  const script = fs.readFileSync(deployScript, 'utf8');
  const restartIndex = script.indexOf('run_as_deploy_user env PM2_HOME="$PM2_HOME" pm2 restart');
  const credentialActivationIndex = script.indexOf('load-live-razorpay-secrets.js');
  const postRestartCheckIndex = script.indexOf('check-pm2-node-runtime.js', restartIndex);
  const saveIndex = script.indexOf('pm2 save', restartIndex);
  assert.ok(credentialActivationIndex >= 0, 'deployment must activate validated Live credentials');
  assert.ok(restartIndex >= 0, 'deployment must restart the CRM separately');
  assert.ok(credentialActivationIndex < restartIndex, 'Live backend/worker must restart before the CRM');
  assert.match(script, /pm2 restart hangers-crm --update-env/);
  assert.doesNotMatch(script, /pm2 restart\s+hang ers-razorpay-staging-api/);
  assert.ok(postRestartCheckIndex > restartIndex, 'deployment must recheck both payment processes after restart');
  assert.ok(saveIndex > postRestartCheckIndex, 'deployment must not save PM2 state before the post-restart check passes');
});

test('production dependency installs are bounded and recover after an interrupted install', () => {
  const script = fs.readFileSync(deployScript, 'utf8');
  const installIndex = script.indexOf('npm ci --prefix "$name"');
  const markerWriteIndex = script.indexOf('mv "$2.tmp" "$2"', installIndex);
  const crmInstallIndex = script.indexOf('refresh_dependencies hangers-crm');

  assert.match(script, /NODE_OPTIONS=.*--max-old-space-size=640/);
  assert.match(script, /--foreground-scripts --maxsockets=2 --no-audit --no-fund/);
  assert.match(script, /\/var\/lib\/hangers-deploy\/dependencies/);
  assert.match(script, /if \[\[ -f "\$marker" \]\] && \[\[ "\$\(<"\$marker"\)" == "\$fingerprint" \]\]; then/);
  assert.ok(markerWriteIndex > installIndex, 'failed npm ci must not mark dependencies as installed');
  assert.ok(crmInstallIndex > markerWriteIndex, 'CRM dependency state must be checked on every deploy retry');
  assert.match(script, /hangers-backend\/prisma\/schema\.prisma/);
  assert.doesNotMatch(script, /if grep -Eq '\^hangers-crm\/package/);
});

test('production workflow checks out the exact resolved commit it will deploy', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/deploy-production.yml'), 'utf8');
  const deploy = fs.readFileSync(deployScript, 'utf8');
  assert.match(workflow, /ref: \$\{\{ steps\.revision\.outputs\.commit \}\}/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /Require current pushed main commit and successful CI/);
  assert.match(workflow, /workflows\/ci\.yml\/runs\?head_sha=\$COMMIT/);
  assert.match(workflow, /main advanced after preflight/);
  assert.ok(workflow.indexOf('Require current pushed main commit and successful CI')
    < workflow.indexOf('Configure AWS credentials'));
  assert.ok(workflow.indexOf('main advanced after preflight')
    < workflow.indexOf('aws ssm send-command', workflow.indexOf('Start SSM deployment')));
  assert.match(workflow, /git show '\$COMMIT:scripts\/deploy\/deploy-ec2-code\.sh'/);
  assert.match(workflow, /remote_command="printf '%s' '\$encoded_script' \| base64 -d \| sudo bash"/);
  assert.match(deploy, /target_commit" == "\$main_commit/);
  assert.ok(deploy.indexOf('target_commit" == "$main_commit"')
    < deploy.indexOf('git merge --ff-only "$target_commit"'));
});

test('PM2 runtime gate requires both payment processes on supported Node binaries', () => {
  assert.equal(versionSupported('v24.11.0'), true);
  assert.equal(versionSupported('v24.10.99'), false);
  assert.equal(versionSupported('v22.23.3'), false);
  assert.equal(versionSupported('v20.20.2'), false);
  assert.equal(versionSupported('v24.11.0-rc.1'), false);

  const problems = checkProcesses([], '/proc');
  assert.match(problems.join('\n'), /hangers-backend is missing/);
  assert.match(problems.join('\n'), /hangers-worker is missing/);
});

test('PM2 runtime preflight refuses to start a missing or stale daemon', (t) => {
  const pm2Home = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-pm2-home-'));
  t.after(() => fs.rmSync(pm2Home, { recursive: true, force: true }));

  assert.match(checkPm2Daemon(pm2Home), /PID file is unavailable/);

  fs.writeFileSync(path.join(pm2Home, 'pm2.pid'), '456\n');
  fs.writeFileSync(path.join(pm2Home, 'rpc.sock'), '');
  fs.writeFileSync(path.join(pm2Home, 'pub.sock'), '');
  assert.match(checkPm2Daemon(pm2Home, () => false), /PID 456 is not running/);
  assert.equal(checkPm2Daemon(pm2Home, () => true), null);

  fs.writeFileSync(path.join(pm2Home, 'pm2.pid'), 'not-a-pid\n');
  assert.match(checkPm2Daemon(pm2Home), /PID file is invalid/);
});

test('PM2 CLI preflight leaves PM2_HOME untouched when its daemon is absent', (t) => {
  const pm2Home = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-pm2-empty-'));
  t.after(() => fs.rmSync(pm2Home, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, '../../scripts/deploy/check-pm2-node-runtime.js'),
  ], { encoding: 'utf8', env: { ...process.env, PM2_HOME: pm2Home } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PM2 daemon PID file is unavailable/);
  assert.deepEqual(fs.readdirSync(pm2Home), []);
});

test('PM2 runtime gate executes each online payment process binary', (t) => {
  const procRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hangers-pm2-runtime-'));
  t.after(() => fs.rmSync(procRoot, { recursive: true, force: true }));

  for (const pid of [101, 102]) {
    const processDir = path.join(procRoot, String(pid));
    fs.mkdirSync(processDir);
    const executable = path.join(processDir, 'exe');
    fs.writeFileSync(executable, '#!/bin/sh\nprintf "v24.11.0\\n"\n');
    fs.chmodSync(executable, 0o755);
  }

  const processes = [
    { name: 'hangers-backend', pid: 101, pm2_env: { status: 'online' } },
    { name: 'hangers-worker', pid: 102, pm2_env: { status: 'online' } },
    { name: 'hangers-crm', pid: 103, pm2_env: { status: 'online' } },
  ];
  const output = [];
  assert.deepEqual(checkProcesses(processes, procRoot, (line) => output.push(line)), []);
  assert.equal(output.length, 2);
  assert.ok(output.every((line) => line.includes('Node.js v24.11.0')));

  processes[1].pm2_env.status = 'stopped';
  assert.match(checkProcesses(processes, procRoot).join('\n'), /hangers-worker is not online/);
});
