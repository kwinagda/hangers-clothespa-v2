# Production Code Deployment

Production CRM deployments use one guarded command on EC2:

```bash
sudo /usr/local/sbin/hangers-deploy-code <full-git-commit-sha>
```

The command:

1. prevents concurrent deployments with `flock`;
2. refuses to deploy over tracked source edits on EC2;
3. fetches Git and permits fast-forward deployments only;
4. installs dependencies only when package manifests changed;
5. generates Prisma Client when required, but never changes the database;
6. builds Next.js before restarting any process;
7. restarts the API, worker, and CRM through the existing Ubuntu PM2 service;
8. verifies API liveness, API/database readiness, CRM login, and the deployed commit;
9. prints an explicit completion marker for SSM and CI logs.

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

## Database Releases

Schema changes are not automatically applied by code deployment. A database
release must have its own backup confirmation, migration review, migration lock,
`prisma migrate deploy`, and post-migration verification. Never use `prisma db
push`, seed scripts, local database copies, or imports against production as part
of routine deployment.
