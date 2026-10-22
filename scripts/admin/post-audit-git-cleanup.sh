#!/usr/bin/env bash
# Run this yourself from your Mac, inside the main repo checkout (not a worktree).
# Both actions here are verified safe (see the 2026-10-01 audit) but are the kind of
# local-branch-rewrite / remote-branch-deletion an AI agent is blocked from doing itself.
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" == "main" ]]; then
  echo "You're on main right now - switch to another branch first so this doesn't touch your working tree." >&2
  exit 1
fi

echo "Fetching origin..."
git fetch origin --prune

echo "Fixing stale local main (verified: the extra local commit's content already exists"
echo "upstream via a different commit hash - nothing unique is lost)..."
git branch -f main origin/main

echo "Deleting 2 remote branches already fully merged into origin/main..."
git push origin --delete fix/public-checkout-reconciliation-route ultraplan-refactor || \
  echo "(one or both may already be gone - that's fine)"

echo "Done. Local main now matches origin/main; stale merged branches removed from GitHub."
