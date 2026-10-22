#!/usr/bin/env bash
# Run this yourself to protect main (requires repo admin - that's why an AI agent can't
# do it: GitHub-settings/permission changes need a human). Requires `gh auth login`.
set -Eeuo pipefail

REPO="kwinagda/hangers-clothespa-v2"

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required." >&2; exit 1; }

gh api --method PUT "repos/$REPO/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=Backend — lint, type-check, test' \
  -f 'required_status_checks[contexts][]=CRM — type-check, build' \
  -F enforce_admins=false \
  -f required_pull_request_reviews[required_approving_review_count]=0 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -F restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false

echo "main is now protected: PR required, CI must pass, no force-push, no deletion."
echo "Optional next step: enable 'Require review from Code Owners' in the GitHub UI"
echo "(Settings > Branches > main rule) to make .github/CODEOWNERS take effect."
