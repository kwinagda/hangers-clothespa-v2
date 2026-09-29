# Production Code Deployment

Production CRM deployments use the GitHub Actions `Deploy Production CRM`
workflow and one guarded command on EC2:

```bash
sudo /usr/local/sbin/hangers-deploy-code <full-git-commit-sha>
```

The backend, worker, and CRM require maintained **Node.js 24 >=24.11.0**. Keep
CI, the EC2 login-shell runtime, and the actual PM2 backend/worker executables on
the same supported major. The GitHub deployment workflow checks both the EC2 `ubuntu` runtime
and the actual executables of the running PM2 backend and worker processes
before deployment. The EC2 deploy command repeats those checks before changing
source or restarting services. A compatible login-shell or GitHub runner
runtime does not substitute for the PM2 process check.

The command:

1. prevents concurrent deployments with `flock`;
2. refuses to deploy over tracked source edits on EC2;
3. fetches Git and permits fast-forward deployments only;
4. installs dependencies only when package manifests changed;
5. generates Prisma Client when required, but never changes the database;
6. builds Next.js and uploads its immutable `/_next/static` files to S3 before restart;
7. retains older hashed chunks so already-open CRM tabs continue working;
8. restarts the API, worker, and CRM through the existing Ubuntu PM2 service,
   then waits for the backend and worker to report online on Node.js 24 before
   saving the PM2 process list;
9. verifies API liveness, API/database readiness, local CRM login, public CRM pages,
   public Next.js asset availability, and the deployed commit;
10. prints an explicit completion marker for SSM and CI logs.

## Git-to-Deployment Contract

1. Develop and review changes locally; do not deploy an uncommitted worktree.
2. Commit the reviewed changes and push/merge them to `origin/main` through the
   repository's normal protected-branch process. Do not use `git push --force`.
3. Wait for the `CI` workflow's push run for that exact commit to complete
   successfully.
4. Dispatch `Deploy Production CRM` for the exact full commit SHA. The workflow
   rejects a SHA that is not the current `origin/main` tip and rejects it unless
   that exact SHA has a successful push-triggered `CI` run. It checks that
   `main` has not advanced again immediately before requesting deployment.
5. On EC2, the guarded deploy command fetches `origin/main`, requires the
   selected SHA to belong to it and to be a fast-forward from the installed
   commit, and uses `git merge --ff-only`. It then verifies the deployed HEAD
   exactly equals the requested SHA.

If `main` advances between preflight and deploy, the workflow stops before
issuing the deployment command; rerun CI/deployment using the new exact SHA.
Never manually pull or edit production source, and never bypass the workflow's
CI/SHA checks with an SSM command. Record the source commit, CI run, deployment
workflow run, and EC2 completion SHA together in the release record.

Untracked production files such as `.env` remain untouched. Database migrations,
seeding, restores, imports, and data synchronization are intentionally outside this
code deployment command and require a separate reviewed release procedure.

## Failed Release Recovery

The deploy command is forward-only and does not automatically roll back after a
post-merge build, restart, or health-check failure. A failed SSM command is not a
successful release even if the source fast-forward already occurred. Before a
production release, record the current production commit and prepare the exact
rollback commit procedure:

1. Read the deployment log/SSM output to identify `previous` and `target` commits;
   confirm the live PM2 state and `/health`, `/ready`, and `/login` before deciding
   whether rollback is required.
2. If rollback is required, create a reviewed forward revert commit for the failed
   release commit(s) on the protected main branch. Do not force-push, reset the EC2
   checkout, or run `git reset --hard` as an emergency shortcut.
3. Run the full required CI checks on that revert commit and deploy its exact SHA
   through the same approved production workflow. The revert commit must remain a
   descendant of the currently deployed target because the EC2 command accepts
   fast-forward releases only.
4. Verify backend liveness/readiness, CRM login/public assets, payment/webhook mode
   isolation, and Finance/log pages. Keep the failed and revert commit IDs and the
   health evidence in the release record. Retained immutable S3 chunks make code
   rollback compatible with already-open tabs.

This is an application-code rollback only. The code deploy does not migrate or
restore PostgreSQL. If a separate migration was run, follow its separately reviewed
database rollback/restore plan; never infer that reverting application code reverses
database state. Do not claim automatic rollback until it is implemented and tested.

## GitHub Actions Setup

The `Deploy Production CRM` workflow uses GitHub OIDC and AWS Systems Manager.
Configure these GitHub Environment variables under the protected `production`
environment:

- `AWS_PRODUCTION_DEPLOY_ROLE_ARN`
- `AWS_PRODUCTION_INSTANCE_ID` (`i-05c749925b8391b99`)
- `AWS_REGION` (`ap-south-1`)

The AWS identity provider and least-privilege role are managed by
`infra/deployment/github-actions-oidc.yaml`.

The AWS role should trust only this repository's protected `production`
environment and should have only the SSM permissions needed to send and inspect
commands for the production instance. Do not store long-lived AWS access keys in
GitHub.

Require approval on the GitHub `production` environment. Deploy an exact commit
from **Actions > Deploy Production CRM > Run workflow** after CI passes.

## Production Ownership

- `/opt/hangers` source and generated files are owned by `ubuntu:ubuntu`.
- PM2 runs as `ubuntu` with `PM2_HOME=/home/ubuntu/.pm2`.
- SSM invokes the deploy command as root only for the narrow ownership and service
  orchestration steps; Git, npm, builds, and PM2 commands run as `ubuntu`.
- Never edit tracked source directly on EC2. Commit to Git first, then deploy that
  commit.
- CloudFront serves CRM `/_next/static` files from S3, so deployment always uploads
  the new build assets before restarting the CRM. The deploy command intentionally
  does not delete older hashed chunks during release, because open browser tabs may
  still reference them.

## Database Releases

Schema changes are not automatically applied by code deployment. A database
release must have its own backup confirmation, migration review, migration lock,
`prisma migrate deploy`, and post-migration verification. Never use `prisma db
push`, seed scripts, local database copies, or imports against production as part
of routine deployment.

## Runtime Upgrade Gate

The production runtime was upgraded on 2026-09-26 from NodeSource 22.x to the
signed NodeSource 24.x package `24.21.0-1nodesource1` on EC2
`i-05c749925b8391b99` (`Hangers-CRM-Prod`, `ap-south-1`). Package maintenance
restarted PM2. At that time, the backend, CRM, worker, and isolated Test API
were verified online on Node `v24.21.0`; production API `/health` and `/ready`,
CRM `/login`, and Test API `/health` and `/ready` returned HTTP 200. The
isolated Test API was restored from its existing Test-only environment and
saved in PM2's process list.

**Latest host check (2026-09-29):** after the user's explicit authorization to
start EC2, instance `i-05c749925b8391b99` in `ap-south-1` was started and passed
both EC2 status checks. SSM reported Online. The Ubuntu PM2 processes
`hangers-backend`, `hangers-crm`, `hangers-worker`, and
`hangers-razorpay-staging-api` were Online; each actual `/proc/<pid>/exe`
resolved to `/usr/bin/node` and reported `v24.21.0`. Backend `/health`, the
existing Test API `/health`, and CRM `/login` returned HTTP 200. This was a
runtime/liveness preflight only: no production `/ready`, database, payment,
secret, or deployment operation was performed. The host remains running after
this check and may incur normal instance charges. Recheck host state and health
immediately before a future guarded deployment; this snapshot is not a
deployment or Live-configuration approval. The AWS CLI identity used for the
authorized start was the account root principal; do not use it for deployment
or secret provisioning. Use the documented least-privilege GitHub OIDC role.

The guarded code deployment independently verifies the login-shell runtime and
actual PM2 payment processes satisfy Node 24 >=24.11.0. Do not use an application
deployment to perform an unreviewed runtime upgrade. Source:
[Node.js release schedule](https://nodejs.org/en/about/previous-releases).

## Razorpay Webhook Mode Separation and Secret Rotation

Razorpay configures separate Test and Live webhook URLs. This CRM runtime has one
active Razorpay API keypair, so Test and Live webhook traffic must terminate on
separate deployments/environments with matching Test or Live API keys and isolated
databases. The mode-scoped endpoints are:

- Test: `/api/v1/webhooks/razorpay/test` with `RAZORPAY_WEBHOOK_SECRET_TEST`
  and optional `RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS`.
- Live: `/api/v1/webhooks/razorpay/live` with `RAZORPAY_WEBHOOK_SECRET_LIVE`
  and optional `RAZORPAY_WEBHOOK_SECRET_LIVE_PREVIOUS`.

The API rejects a scoped endpoint if its URL mode does not match the configured
`RAZORPAY_KEY_ID` mode. The verified mode is stored with the durable inbox event;
the worker checks it again before calling provider APIs. Never point a Test
webhook at the Live deployment. Razorpay's Standard Checkout best-practices page
recommends subscribing to `payment.captured`, `payment.failed`, and `order.paid`.
Use settlement summary/reconciliation APIs for settlement accounting unless the
merchant account explicitly confirms other event support.

The legacy `/api/v1/webhooks/razorpay` route remains for the original
`RAZORPAY_WEBHOOK_SECRET` current/previous pair during migration. Move each
Dashboard configuration to its mode-scoped route and validate delivery before
retiring the legacy URL and secret pair.

`infra/caddy/Caddyfile` is the reviewed Caddy ingress configuration. It routes
only the exact `crm.hangers-cs.com/api/v1/webhooks/razorpay/test` path to the
isolated Test API on `127.0.0.1:5101`; all other `/api/*` traffic remains on the
existing API at `127.0.0.1:5001`. Do not broaden the Test matcher to a wildcard
or route Test webhook traffic through the Live API. Validate the complete
Caddyfile before reloading Caddy, retain a timestamped backup, and verify both
the exact Test route and ordinary Live API routes after reload.

The webhook endpoint accepts the configured current secret and, during rotation,
one explicitly configured previous secret. It verifies the Razorpay HMAC against
the raw request bytes and records only which slot matched (`CURRENT` or
`PREVIOUS`); it never logs either secret or the signature.

1. Generate the replacement webhook secret and store it in the correct
   environment's secret manager. Do not reuse a Razorpay API key secret.
2. For Live, set `RAZORPAY_WEBHOOK_SECRET_LIVE` to the replacement and
   `RAZORPAY_WEBHOOK_SECRET_LIVE_PREVIOUS` to the existing Live Dashboard secret
   on every Live API instance. Use the corresponding `_TEST` variables only in
   the isolated Test environment. Roll out/restart that environment and verify
   readiness before changing the matching Dashboard webhook. Keep values distinct.
3. Update the matching Razorpay Dashboard webhook secret. Continue returning
   2xx only after durable inbox persistence; verify deliveries and inspect
   `signatureSecretSlot` in safe audit metadata for failures or unexpected old
   secret use.
4. Keep that mode's previous secret configured for at least 24 hours after the Dashboard
   change. Razorpay documents exponential-backoff retries for 24 hours from
   event creation; verify old-secret retries have ceased and corresponding
   events are durably accepted before retirement.
5. Remove that mode's `*_PREVIOUS` secret, roll out/restart its API instances,
   and confirm current-secret events continue to be accepted. If rollback is
   needed, restore the old secret as current and the new secret as previous,
   then reconcile any webhook events during the transition.

Test and Live Dashboard configurations and signing secrets are separate. Verify
each against its corresponding isolated deployment before relying on either in
production. Continue to treat a Test delivery as no evidence that Live webhook
delivery is configured.
Never paste webhook secrets into tickets, source, shell history, UI, or logs.
