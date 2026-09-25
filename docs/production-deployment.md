# Production Code Deployment

Production CRM deployments use one guarded command on EC2:

```bash
sudo /usr/local/sbin/hangers-deploy-code <full-git-commit-sha>
```

The backend and worker require **Node.js >=22.2.0** for the pinned Razorpay
Node SDK. The GitHub deployment workflow checks both the EC2 `ubuntu` runtime
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
8. restarts the API, worker, and CRM through the existing Ubuntu PM2 service;
9. verifies API liveness, API/database readiness, local CRM login, public CRM pages,
   public Next.js asset availability, and the deployed commit;
10. prints an explicit completion marker for SSM and CI logs.

Untracked production files such as `.env` remain untouched. Database migrations,
seeding, restores, imports, and data synchronization are intentionally outside this
code deployment command and require a separate reviewed release procedure.

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

The production runtime was read-only checked on 2026-09-25: EC2
`i-05c749925b8391b99` (`Hangers-CRM-Prod`, `ap-south-1`) reported Node.js
`v20.20.2`; backend, CRM, and worker PM2 processes were online. This version
does not meet the backend's declared `>=22.2.0` requirement, so a Razorpay SDK
deployment must not proceed. Upgrade Node through the approved host-maintenance
procedure, restart both payment processes using that runtime, verify their actual
process executables, then deploy a reviewed commit through the guarded command.
The deploy command refuses to proceed while PM2 still runs either payment
process on an older Node binary. Do not use an application deployment to perform
the Node upgrade or restart production services as part of a read-only
compatibility check.

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
