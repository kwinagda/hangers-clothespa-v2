# Deploying Hangers ClotheSpa

Plain-English guide to how deploys actually work today (verified against the live server
and the real GitHub Actions workflow on 2026-10-01 — not the generic version of this
process, the real one).

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

**Gap found, not yet fixed:** neither app has an `eas.json` in this repo, so there are no
committed `development`/`preview`/`production` build profiles yet. I didn't fabricate one —
EAS profile values (project ID, credential source, per-profile env) need to come from your
actual Expo/EAS project, not a guess. Next step: run `eas build:configure` in each app folder
and commit the resulting `eas.json`, then set `EXPO_PUBLIC_API_URL` per-profile via EAS
environment variables (not hardcoded in `app.json`). Build/submit once that exists:
`eas build --profile production --platform android`, then `eas submit`.
