#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${HANGERS_REPO_ROOT:-/opt/hangers}"
DEPLOY_USER="${HANGERS_DEPLOY_USER:-ubuntu}"
PM2_HOME="${HANGERS_PM2_HOME:-/home/ubuntu/.pm2}"
STATIC_BUCKET="${HANGERS_STATIC_BUCKET:-hangers-cs-website-977714654070-ap-south-1-v2}"
PUBLIC_CRM_URL="${HANGERS_PUBLIC_CRM_URL:-https://hangers-cs.com}"
TARGET_REVISION="${1:-origin/main}"
LOCK_FILE="/var/lock/hangers-code-deploy.lock"
DEPLOY_LOG="${HANGERS_DEPLOY_LOG:-/var/log/hangers-deployments.log}"

node_version_supported() {
  local version="$1"
  [[ "$version" =~ ^v?([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || return 1
  local major="${BASH_REMATCH[1]}"
  local minor="${BASH_REMATCH[2]}"
  (( major == 24 && minor >= 11 ))
}

if [[ "${1:-}" == "--check-node-version" ]]; then
  if node_version_supported "${2:-}"; then
    printf 'Node.js %s satisfies the backend runtime requirement (Node.js 24 >=24.11.0).\n' "${2#v}"
    exit 0
  fi
  echo "Node.js ${2:-unknown} is unsupported; Hangers backend requires Node.js 24 >=24.11.0." >&2
  exit 1
fi

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
  echo "$(date -Is) failed target=${TARGET_REVISION} reason=\"$*\"" >>"$DEPLOY_LOG" 2>/dev/null || true
  echo "DEPLOYMENT_FAILED: $*" >&2
  exit 1
}

[[ -d "$REPO_ROOT/.git" ]] || fail "$REPO_ROOT is not a Git checkout"

node_version="$(run_as_deploy_user node --version 2>/dev/null || true)"
if ! node_version_supported "$node_version"; then
  fail "Node.js runtime $node_version is unsupported; Hangers backend/worker require Node.js 24 >=24.11.0"
fi
echo "Deployment runtime: Node.js $node_version"
echo "Verifying Node.js binaries used by PM2 payment processes..."
if ! run_as_deploy_user env PM2_HOME="$PM2_HOME" node \
  "$REPO_ROOT/scripts/deploy/check-pm2-node-runtime.js"; then
  fail "PM2 backend/worker runtime preflight failed; host maintenance must restart them on Node.js 24 >=24.11.0 before deployment"
fi

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

main_commit="$(run_as_deploy_user git rev-parse origin/main)"
[[ "$target_commit" == "$main_commit" ]] \
  || fail "target $target_commit is not the current origin/main commit $main_commit"
run_as_deploy_user git merge-base --is-ancestor "$target_commit" origin/main \
  || fail "target $target_commit is not part of origin/main"
run_as_deploy_user git merge-base --is-ancestor HEAD "$target_commit" \
  || fail "target $target_commit is not a fast-forward from $(git rev-parse HEAD)"

previous_commit="$(run_as_deploy_user git rev-parse HEAD)"
echo "Deploying $previous_commit -> $target_commit"
echo "$(date -Is) started previous=${previous_commit} target=${target_commit}" >>"$DEPLOY_LOG" 2>/dev/null || true
run_as_deploy_user git merge --ff-only "$target_commit"

refresh_dependencies() {
  local name="$1"
  shift
  local marker_dir="/var/lib/hangers-deploy/dependencies"
  local marker="$marker_dir/$name.sha256"
  local fingerprint
  fingerprint="$(sha256sum "$@" | sha256sum | cut -d ' ' -f 1)"

  if [[ -f "$marker" ]] && [[ "$(<"$marker")" == "$fingerprint" ]]; then
    echo "$name dependencies already match the committed manifests."
    return
  fi

  echo "Installing $name dependencies (bounded npm concurrency and Node.js heap)..."
  run_as_deploy_user env \
    NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=640" \
    npm ci --prefix "$name" --foreground-scripts --maxsockets=2 --no-audit --no-fund

  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$marker_dir"
  run_as_deploy_user sh -c 'printf "%s\n" "$1" > "$2.tmp" && mv "$2.tmp" "$2"' \
    sh "$fingerprint" "$marker"
}

# A completed marker makes retries repair interrupted npm ci runs even when
# Git already advanced to the target commit before the previous run failed.
refresh_dependencies hangers-backend \
  hangers-backend/package.json hangers-backend/package-lock.json \
  hangers-backend/prisma/schema.prisma
refresh_dependencies hangers-crm \
  hangers-crm/package.json hangers-crm/package-lock.json

echo "Building CRM..."
# The 2 GiB EC2 host keeps the live services running during the Next.js build.
BUILD_SWAP="/var/lib/hangers-deploy/build.swap"
if ! swapon --show=NAME --noheadings | grep -Fxq "$BUILD_SWAP"; then
  install -d -m 700 /var/lib/hangers-deploy
  if [[ ! -f "$BUILD_SWAP" ]]; then
    available_kb="$(df -Pk /var/lib/hangers-deploy | awk 'NR == 2 { print $4 }')"
    (( available_kb >= 4 * 1024 * 1024 )) || fail "less than 4 GiB free for the CRM build swap cushion"
  fi
  fallocate -l 2G "$BUILD_SWAP"
  chmod 600 "$BUILD_SWAP"
  mkswap "$BUILD_SWAP" >/dev/null
  swapon "$BUILD_SWAP"
fi
run_as_deploy_user env NODE_OPTIONS="--max-old-space-size=640" npm run build --prefix hangers-crm

# CloudFront serves /_next/static from S3, while CRM HTML comes from EC2. Publish
# the complete new immutable build before exposing its HTML. Never delete older
# hashed chunks here: already-open browser tabs may still need them.
echo "Publishing Next.js static assets..."
run_as_deploy_user aws s3 sync \
  "$REPO_ROOT/hangers-crm/.next/static" \
  "s3://$STATIC_BUCKET/_next/static" \
  --cache-control "public,max-age=31536000,immutable" \
  --only-show-errors

echo "Restarting application processes..."
run_as_deploy_user env PM2_HOME="$PM2_HOME" AWS_REGION=ap-south-1 node \
  "$REPO_ROOT/scripts/deploy/load-live-razorpay-secrets.js"
run_as_deploy_user env PM2_HOME="$PM2_HOME" pm2 restart hangers-crm --update-env
echo "Waiting for backend and worker PM2 processes to return online on supported Node.js..."
payment_processes_ready=false
for attempt in {1..30}; do
  if run_as_deploy_user env PM2_HOME="$PM2_HOME" node \
    "$REPO_ROOT/scripts/deploy/check-pm2-node-runtime.js" >/dev/null 2>&1; then
    payment_processes_ready=true
    break
  fi
  sleep 2
done
if [[ "$payment_processes_ready" != true ]]; then
  run_as_deploy_user env PM2_HOME="$PM2_HOME" node \
    "$REPO_ROOT/scripts/deploy/check-pm2-node-runtime.js" || true
  fail "backend or worker PM2 process did not return online on Node.js 24 >=24.11.0 after restart"
fi
run_as_deploy_user env PM2_HOME="$PM2_HOME" node \
  "$REPO_ROOT/scripts/deploy/check-pm2-node-runtime.js"
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

verify_public_next_assets() {
  local route="$1"
  local html_file
  html_file="$(mktemp)"
  if ! curl --fail --silent --show-error --max-time 20 \
    "${PUBLIC_CRM_URL}${route}" >"$html_file"; then
    rm -f "$html_file"
    fail "public route ${PUBLIC_CRM_URL}${route} is not reachable"
  fi

  local asset_count=0
  local missing_assets=0
  while IFS= read -r asset; do
    [[ -n "$asset" ]] || continue
    asset_count=$((asset_count + 1))
    if ! curl --fail --silent --max-time 15 \
      "${PUBLIC_CRM_URL}${asset}" >/dev/null 2>&1; then
      echo "Missing public asset: ${PUBLIC_CRM_URL}${asset}" >&2
      missing_assets=$((missing_assets + 1))
    fi
  done < <(grep -oE '/_next/static/[^" ]+' "$html_file" | tr -d '\\' | sort -u)
  rm -f "$html_file"

  [[ "$asset_count" -gt 0 ]] || fail "public route $route did not expose any Next.js assets"
  [[ "$missing_assets" -eq 0 ]] || fail "$missing_assets Next.js asset(s) missing for public route $route"
  echo "Public route $route has $asset_count reachable Next.js assets."
}

verify_public_next_assets "/login"
verify_public_next_assets "/dashboard/finance"

deployed_commit="$(run_as_deploy_user git rev-parse HEAD)"
[[ "$deployed_commit" == "$target_commit" ]] \
  || fail "deployed commit $deployed_commit does not match target $target_commit"

install -m 0755 "$REPO_ROOT/scripts/deploy/deploy-ec2-code.sh" \
  /usr/local/sbin/hangers-deploy-code

echo "DEPLOYMENT_COMPLETE commit=$deployed_commit"
echo "No database migration, seed, restore, or data sync was run."
echo "$(date -Is) complete commit=${deployed_commit}" >>"$DEPLOY_LOG" 2>/dev/null || true
