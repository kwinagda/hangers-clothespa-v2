#!/usr/bin/env bash
# One-command production deploy trigger, run from your Mac.
#
# IMPORTANT - this does NOT match the original brief's generic "tag + SSH" design.
# The real pipeline (.github/workflows/deploy-production.yml) deploys backend + CRM
# together as one commit via AWS SSM, gated by: the commit must be origin/main's
# current HEAD, CI must have passed for that exact commit, and a human (you, in the
# GitHub "production" environment) must approve the run before it executes. There is
# no per-component deploy and no raw SSH - this script triggers that existing,
# already-safety-gated workflow instead of reinventing one.
set -Eeuo pipefail

REPO="kwinagda/hangers-clothespa-v2"
WORKFLOW="deploy-production.yml"

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required. Install it and run 'gh auth login' first." >&2; exit 1; }

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Refusing to ship: you're on '$branch', not 'main'. Switch to main first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to ship: your working tree isn't clean. Commit or stash first:" >&2
  git status --short >&2
  exit 1
fi

echo "Fetching origin/main..."
git fetch origin main --quiet

local_sha="$(git rev-parse main)"
remote_sha="$(git rev-parse origin/main)"
if [[ "$local_sha" != "$remote_sha" ]]; then
  echo "Refusing to ship: local main ($local_sha) does not match origin/main ($remote_sha)." >&2
  echo "Push or pull to reconcile first - do not force anything without understanding why they differ." >&2
  exit 1
fi

echo "Deploying commit $local_sha (current origin/main)."
echo "Checking it has a successful CI run before triggering deploy..."
ci_ok="$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$local_sha&per_page=100" \
  --jq '[.workflow_runs[] | select(.event == "push" and .status == "completed" and .conclusion == "success")] | length > 0')"
if [[ "$ci_ok" != "true" ]]; then
  echo "No successful push-triggered CI run found for $local_sha yet. Wait for CI, then retry." >&2
  exit 1
fi

echo "CI passed. Triggering the Deploy Production CRM workflow..."
gh workflow run "$WORKFLOW" --repo "$REPO" --ref main -f "commit=$local_sha"

echo "Dispatched. The workflow will pause for your manual approval in the GitHub"
echo "'production' environment before it actually touches the server. Watch it with:"
echo "  gh run watch --repo $REPO \$(gh run list --repo $REPO --workflow=$WORKFLOW -L1 --json databaseId --jq '.[0].databaseId')"
