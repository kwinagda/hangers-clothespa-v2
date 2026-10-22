#!/usr/bin/env bash
# Emergency rollback helper, run from your Mac.
#
# WHY THIS IS A REVERT, NOT A RE-DEPLOY OF AN OLD COMMIT:
# .github/workflows/deploy-production.yml hard-refuses to deploy any commit that
# is not origin/main's CURRENT HEAD. There is no way to tell the real pipeline
# "go back to commit X" directly - main has to actually point at the fixed state.
# So "rollback" here means: revert the bad commit on top of main, get it through
# CI like any other change, then ship it normally. This script automates the
# revert-branch-and-PR part; it does not merge or deploy anything by itself.
set -Eeuo pipefail

REPO="kwinagda/hangers-clothespa-v2"

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required. Install it and run 'gh auth login' first." >&2; exit 1; }

bad_commit="${1:-}"
if [[ -z "$bad_commit" ]]; then
  echo "Usage: deploy/rollback.sh <bad-commit-sha>" >&2
  echo "Tip: find it with 'gh run list --repo $REPO --workflow=deploy-production.yml'" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to start a rollback: your working tree isn't clean. Commit or stash first." >&2
  exit 1
fi

echo "Fetching origin/main..."
git fetch origin main --quiet

branch_name="rollback/$(date +%Y%m%d-%H%M%S)"
git checkout -b "$branch_name" origin/main

echo "Reverting $bad_commit on $branch_name..."
if ! git revert --no-edit "$bad_commit"; then
  echo "Revert hit a conflict. Resolve it by hand in this worktree, then:" >&2
  echo "  git add -A && git revert --continue" >&2
  echo "  git push -u origin $branch_name" >&2
  echo "  gh pr create --repo $REPO --title 'Revert $bad_commit' --body 'Emergency rollback.'" >&2
  exit 1
fi

git push -u origin "$branch_name"
gh pr create --repo "$REPO" \
  --title "Revert $bad_commit (emergency rollback)" \
  --body "Automated rollback revert of $bad_commit, created by deploy/rollback.sh. Review, merge once CI passes, then run deploy/ship.sh to deploy the reverted state."

echo "Rollback PR opened on $branch_name. Review and merge it, then run deploy/ship.sh."
