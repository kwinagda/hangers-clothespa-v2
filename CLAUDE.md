# Agent Rules — Hangers ClotheSpa

This file applies to every AI agent working in this repo (Claude Code, Copilot, Codex, or
anything else). If you're a different tool, read `AGENTS.md`, which points back here.

## Session start (every time)

1. `git fetch && git status && git log --oneline -5`.
2. If you're on `main`, create a branch before editing anything: `feat/…`, `fix/…`, `chore/…`.
3. If the working tree is already dirty from a previous session (yours or another agent's),
   **stop and ask the user** rather than guessing whether it's safe to build on top of or discard.
4. If you're running alongside another agent, use your own `git worktree` on your own branch.
   **Never share a working directory with another agent** — two agents editing the same
   checkout at once will stomp on each other's uncommitted work and confuse both of you.

## While working

- One task = one branch = one PR. Small, focused commits using Conventional Commits
  (`feat:`, `fix:`, `chore:`, `refactor:`).
- **Never edit code directly on the EC2 production server.** Never SSH/SSM into it except to
  run `deploy/rollback.sh`, read logs, or do genuinely read-only diagnostics. The production
  deploy script (`scripts/deploy/deploy-ec2-code.sh`) actively refuses to deploy if it finds
  tracked files edited directly on the server — don't be the reason it fails.
- **Never commit secrets, and never print secret values in chat** (tokens, passwords, API
  keys, DB URLs, webhook secrets). Diagnostic commands that dump full process environments
  (e.g. `pm2 jlist`, `pm2 env <id>`) will leak live secrets into your own output — avoid them;
  use `pm2 list`/`pm2 show` (status only) instead.
- **Zero hardcoded business data.** Order statuses, payment methods, staff roles, plant
  statuses, etc. come from `hangers-backend/src/config/master-data.js` and the `/metadata`
  API — not copy-pasted into each app. See `MASTER_DATA_AUDIT.md` for the current state of
  this effort across the 4 apps.
- **Database schema changes:** `prisma migrate dev --name <description>` locally, commit the
  generated migration folder, and let it ship to production only via
  `npx prisma migrate deploy` (already wired into the deploy pipeline). Never run
  `prisma migrate reset` or `db push` against the production database, ever.
- Inspect existing code before editing. Don't duplicate an existing source of truth. Don't
  silently delete another person's or agent's in-progress work — if something looks
  mid-flight (uncommitted changes, a stash, an odd branch), ask what it is before touching it.

## Before finishing

- Run type checks/tests for the components you touched (backend: `npm test`; CRM:
  `npx tsc --noEmit`, relevant Playwright specs). Show the results.
- Push your branch and open a PR with a plain-English description of what changed and why.
- If something important about the project's current state changed, update the "Current
  state" section below.
- Tell the user exactly what to test manually.

## Deploy

- Deploys only happen from `main`, only via the `Deploy Production CRM` GitHub Actions
  workflow (or `deploy/ship.sh` once it exists locally) — never by SSHing in and running
  commands by hand. An agent may suggest running a deploy; the user decides when.
- The production GitHub environment requires a manual approval from the repo owner before
  the workflow runs — this is intentional and should not be removed.

## Current state (keep this updated)

- **Repo:** single monorepo, GitHub `kwinagda/hangers-clothespa-v2` (the "-v2" repo is the
  only one that matters — an older `hangers-clothespa` repo/folder exists on disk but is
  retired; don't develop against it).
- **Production:** one EC2 instance (`i-05c749925b8391b99`, `ap-south-1`, Ubuntu, t3.small).
  App lives at `/opt/hangers`. PM2 runs `hangers-backend` (port 5001), `hangers-crm` (port
  5002, Next.js), and `hangers-worker` (BullMQ). Postgres and Redis are self-hosted on the
  same box (not RDS/ElastiCache) — this is a single point of failure to be aware of when
  planning risky changes. Caddy terminates TLS on 80/443 and proxies to the app ports.
  Static CRM assets are published to S3 and served via CloudFront
  (`hangers-cs.com` / `www.hangers-cs.com`).
- **Staging:** a second, intentional checkout at `/opt/hangers-razorpay-staging` runs on
  port 5101 (`hangers-razorpay-staging-api` PM2 process) for testing Razorpay changes before
  they reach `main`. This is expected to exist — don't treat it as drift.
- **Deploy:** `.github/workflows/deploy-production.yml` deploys via AWS SSM (no raw SSH),
  requires the exact commit to be `origin/main`'s current HEAD with a passing CI run, checks
  the live PM2 Node.js runtime first, then runs `scripts/deploy/deploy-ec2-code.sh` on the
  server, which refuses direct-edit drift, enforces fast-forward-only, and health-checks
  `/health`, `/ready`, and `/login` before declaring success.
- **Known open items (as of 2026-10-01):** PR #3 (GitHub Copilot, draft) targeted the CRM
  `npm ci` OOM during deploy, but PR #4 (merged) already fixed that a different way (bounded
  `--maxsockets=2`, capped Node heap, retry-safe install markers in
  `scripts/deploy/deploy-ec2-code.sh`) — PR #3 is superseded and can be closed, not merged.
  PR #10 (Razorpay Custom Checkout) is an open draft — do not merge or deploy it before
  real-provider acceptance. `main` has no GitHub branch protection yet
  (`scripts/admin/enable-branch-protection.sh` exists for the owner to run). The repo is
  currently public on GitHub. `hangers-staff-app` has no buildable Expo identity yet (see
  `DEPLOY.md`).
