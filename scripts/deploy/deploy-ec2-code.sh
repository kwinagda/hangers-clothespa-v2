#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${HANGERS_REPO_ROOT:-/opt/hangers}"
DEPLOY_USER="${HANGERS_DEPLOY_USER:-ubuntu}"
PM2_HOME="${HANGERS_PM2_HOME:-/home/ubuntu/.pm2}"
STATIC_BUCKET="${HANGERS_STATIC_BUCKET:-hangers-cs-website-977714654070-ap-south-1-v2}"
TARGET_REVISION="${1:-origin/main}"
LOCK_FILE="/var/lock/hangers-code-deploy.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another Hangers deployment is already running." >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this command as root so it can manage ownership and PM2 safely." >&2
  exit 1
fi

run_as_deploy_user() {
  runuser -u "$DEPLOY_USER" -- "$@"
}

fail() {
  echo "DEPLOYMENT_FAILED: $*" >&2
  exit 1
}

[[ -d "$REPO_ROOT/.git" ]] || fail "$REPO_ROOT is not a Git checkout"

cd "$REPO_ROOT"

# Only Git metadata and generated Next.js output are normalized. Environment,
# uploads, logs, PostgreSQL, and all other runtime data are deliberately excluded.
chown -R "$DEPLOY_USER:$DEPLOY_USER" .git
if [[ -d hangers-crm/.next ]]; then
  chown -R "$DEPLOY_USER:$DEPLOY_USER" hangers-crm/.next
fi

tracked_changes="$(run_as_deploy_user git status --porcelain --untracked-files=no)"
if [[ -n "$tracked_changes" ]]; then
  echo "$tracked_changes" >&2
  fail "tracked production files were edited directly; commit or reconcile them before deploying"
fi

echo "Fetching origin/main..."
run_as_deploy_user git fetch --prune origin main

if [[ "$TARGET_REVISION" == "origin/main" ]]; then
  target_commit="$(run_as_deploy_user git rev-parse origin/main)"
else
  target_commit="$(run_as_deploy_user git rev-parse "${TARGET_REVISION}^{commit}")"
fi

run_as_deploy_user git merge-base --is-ancestor "$target_commit" origin/main \
  || fail "target $target_commit is not part of origin/main"
run_as_deploy_user git merge-base --is-ancestor HEAD "$target_commit" \
  || fail "target $target_commit is not a fast-forward from $(git rev-parse HEAD)"

previous_commit="$(run_as_deploy_user git rev-parse HEAD)"
echo "Deploying $previous_commit -> $target_commit"
run_as_deploy_user git merge --ff-only "$target_commit"

changed_files="$(run_as_deploy_user git diff --name-only "$previous_commit" "$target_commit")"

if grep -Eq '^hangers-backend/(package(-lock)?\.json|prisma/schema\.prisma)$' <<<"$changed_files"; then
  echo "Refreshing backend dependencies and generated Prisma client (no database migration)..."
  run_as_deploy_user npm ci --prefix hangers-backend
fi

if grep -Eq '^hangers-crm/package(-lock)?\.json$' <<<"$changed_files"; then
  echo "Refreshing CRM dependencies..."
  run_as_deploy_user npm ci --prefix hangers-crm
fi

echo "Building CRM..."
run_as_deploy_user npm run build --prefix hangers-crm

# CloudFront serves /_next/static from S3, while CRM HTML comes from EC2. Publish
# the complete new immutable build before exposing its HTML. Never delete older
# hashed chunks here: already-open browser tabs may still need them.
echo "Publishing Next.js static assets..."
run_as_deploy_user aws s3 sync \
  "$REPO_ROOT/hangers-crm/.next/static" \
  "s3://$STATIC_BUCKET/_next/static" \
  --cache-control "public,max-age=31536000,immutable"

echo "Restarting application processes..."
run_as_deploy_user env PM2_HOME="$PM2_HOME" pm2 restart \
  hangers-backend hangers-worker hangers-crm --update-env
run_as_deploy_user env PM2_HOME="$PM2_HOME" pm2 save

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 5 "$url" >/dev/null 2>&1; then
      echo "$name is healthy."
      return 0
    fi
    sleep 2
  done
  fail "$name did not become healthy at $url"
}

wait_for_url "Backend liveness" "http://127.0.0.1:5001/health"
wait_for_url "Backend readiness" "http://127.0.0.1:5001/ready"
wait_for_url "CRM login" "http://127.0.0.1:5002/login"

deployed_commit="$(run_as_deploy_user git rev-parse HEAD)"
[[ "$deployed_commit" == "$target_commit" ]] \
  || fail "deployed commit $deployed_commit does not match target $target_commit"

install -m 0755 "$REPO_ROOT/scripts/deploy/deploy-ec2-code.sh" \
  /usr/local/sbin/hangers-deploy-code

echo "DEPLOYMENT_COMPLETE commit=$deployed_commit"
echo "No database migration, seed, restore, or data sync was run."
