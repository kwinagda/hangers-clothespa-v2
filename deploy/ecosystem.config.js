// PM2 process topology for the Hangers production EC2 host. Reference only - mirrors
// what is already running (confirmed via `pm2 jlist` during the 2026-10-01 audit). This
// file deliberately carries NO secrets: RAZORPAY_* live credentials are injected at
// deploy time by scripts/deploy/load-live-razorpay-secrets.js via `pm2 restart --update-env`,
// pulling from AWS Secrets Manager (hangers/production/razorpay/live-api,
// hangers/production/razorpay/live-webhook) - never from this file or any committed file.
//
// This is not yet wired into the deploy script; the server was set up by hand with
// equivalent `pm2 start` commands. Treat this as documentation of intended topology
// until someone deliberately switches the deploy script to `pm2 start ecosystem.config.js`.
module.exports = {
  apps: [
    {
      name: 'hangers-backend',
      script: './hangers-backend/src/index.js',
      cwd: '/opt/hangers',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'hangers-worker',
      script: './hangers-backend/src/workers.js',
      cwd: '/opt/hangers',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'hangers-crm',
      script: 'npm',
      args: 'start',
      cwd: '/opt/hangers/hangers-crm',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
