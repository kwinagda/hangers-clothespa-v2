# Deploying Hangers ClotheSpa

Plain-English guide to how deploys actually work today (verified against the live server
and the real GitHub Actions workflow on 2026-10-01 — not the generic version of this
process, the real one).

## One-time admin tasks (run these yourself — need your own login/permissions)

These three were deliberately not run by the AI agent that wrote this doc: each one needs
either your GitHub admin permission, your AWS credentials after you've generated new keys
in the Razorpay dashboard, or is a local git operation that's safer coming from you.

- `scripts/admin/rotate-razorpay-live-secret.sh` — run after generating new live keys in
  the Razorpay dashboard; updates AWS Secrets Manager and reloads the live server.
- `scripts/admin/enable-branch-protection.sh` — protects `main` (PR + passing CI required).
- `scripts/admin/post-audit-git-cleanup.sh` — fixes the stale local `main` ref and removes
  2 already-merged stale remote branches.

## How a deploy works

Backend, worker, and CRM all deploy together as one commit — there's no "deploy just the
backend" option in the current pipeline. The deploy workflow (`Deploy Production CRM` in
GitHub Actions) only agrees to deploy a commit if **all** of these are true:

1. The commit is the exact current tip of `origin/main` (not an older or newer one).
2. That exact commit has a successful CI run already.
3. The server's live PM2 processes are already running a supported Node.js version.
4. You (the repo owner) approve the run in GitHub's "production" environment gate — every
   single time, no exceptions, by design.

If all of that holds, GitHub Actions uses AWS SSM (not SSH) to run
`scripts/deploy/deploy-ec2-code.sh` on the EC2 server, which fast-forwards `/opt/hangers` to
that commit, reinstalls dependencies only if `package.json`/lockfiles actually changed,
rebuilds the CRM, publishes its static assets to S3/CloudFront, reloads the live Razorpay
credentials from AWS Secrets Manager into the backend and worker PM2 processes
(`scripts/deploy/load-live-razorpay-secrets.js`), restarts the CRM process, and only
declares success once `/health`, `/ready`, and `/login` all respond correctly. Any failure
along the way stops the deploy and leaves the server on whatever it was running before.

## How to deploy

```
./deploy/ship.sh
```

Run this from your Mac, on `main`, with nothing uncommitted. It checks you're actually
ready (clean tree, main matches GitHub, CI already passed), then triggers the workflow and
gives you a command to watch it. **You still have to click Approve in GitHub** for the
"production" environment before anything touches the server — that's intentional.

## How to roll back

```
./deploy/rollback.sh <bad-commit-sha>
```

There is no "redeploy an older commit" button — the workflow refuses anything that isn't
`origin/main`'s current tip. So a rollback is really: revert the bad commit on top of
`main` (this script does that and opens a PR for you), get the revert through review and
CI like any normal change, then run `./deploy/ship.sh` again.

## How to read logs

```
aws ssm send-command --instance-ids i-05c749925b8391b99 --document-name AWS-RunShellScript \
  --parameters commands='["sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 logs --lines 100 --nostream"]'
```

(Or, if you ever do open a direct session on the box for read-only log-reading:
`pm2 logs hangers-backend`, `pm2 logs hangers-worker`, `pm2 logs hangers-crm`.) Never edit
files on the server directly — the deploy script will refuse to run if it finds any tracked
file edited outside of a real deploy.

## How to add or rotate an environment variable

- **Ordinary config** (not a live payment secret): edit `/opt/hangers/hangers-backend/.env`
  or `hangers-crm/.env.local` on the server by hand (this is one of the few things that's
  fine to touch directly, since `.env` files aren't tracked by git and the deploy script
  doesn't manage them), then restart the relevant PM2 process. Also update
  `hangers-backend/.env.example` in a PR so the next person knows the variable exists.
- **Live Razorpay credentials specifically** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET_LIVE`): these do **not** come from `.env` — they're pulled from
  AWS Secrets Manager (`hangers/production/razorpay/live-api`,
  `hangers/production/razorpay/live-webhook`) every time
  `load-live-razorpay-secrets.js` runs. Rotating the key in the Razorpay dashboard alone is
  **not enough** — you must also update those two Secrets Manager values, or the next
  deploy/restart will silently load the old key back in.

## Mobile apps (`hangers-app`, `hangers-staff-app`)

These are **not** deployed to EC2 — they build via Expo/EAS. Both already read their API
URL from the `EXPO_PUBLIC_API_URL` environment variable at build time
(`src/services/api.ts` in each app), falling back to a local-dev address — so the API URL
is not hardcoded, which is good.

**`hangers-app`:** added `eas.json` with `development`/`preview`/`production` profiles.
`production`'s `EXPO_PUBLIC_API_URL` is set to `https://api.hangers-cs.com/api/v1`,
verified against the live Caddy config on the EC2 server (that domain really does proxy to
the backend). `preview` deliberately has no API URL set — **there is no staging domain**
(checked the live Caddyfile: only `hangers-cs.com`, `api.hangers-cs.com`, and the server's
raw IP are configured) — it falls back to the app's local-dev address until a real staging
endpoint exists. You still need to run `eas init`/`eas build:configure` once yourself to
link this to your actual EAS project (that step needs your EAS login, not something I can
do), which will add a `projectId` to `app.json`.

**`hangers-staff-app`: bigger gap, left alone on purpose.** Its `app.json` is essentially
empty — no `expo.name`, `slug`, Android `package`, or iOS `bundleIdentifier` at all. That
means this app doesn't have a real buildable identity yet, and writing an `eas.json` on top
of it would be pointless (nothing to build against). This needs a decision from you — what
bundle ID / package name this should actually ship under (ideally matching whatever you've
already registered in Play Console / App Store Connect, if anything) — not a guess, since
getting it wrong after a real release would be hard to undo. Once that's decided, the fix is
two steps: fill in `app.json`'s `expo` block, then add `eas.json` following the same pattern
as `hangers-app`.
