# Daily Workflow Cheat Sheet

The commands you'll actually use day to day.

1. **Start work on something new:**
   `git checkout main && git pull && git checkout -b feat/my-change`
   Always branch before editing. Never type code directly on `main`.

2. **See what's changed before committing:**
   `git status` then `git diff`
   Make sure nothing unexpected (a secret, a stray file) is about to get committed.

3. **Save your work:**
   `git add <files>` then `git commit -m "fix: describe what changed"`
   Commit small, focused changes — not one giant commit at the end of the day.

4. **Share it for review:**
   `git push -u origin feat/my-change` then `gh pr create`
   This opens a Pull Request; nothing reaches `main` without one.

5. **Deploy to production (only after a PR is merged into `main`):**
   `./deploy/ship.sh`
   Checks everything is safe, triggers the deploy workflow, then waits for your approval
   click in GitHub before touching the server.

6. **Something's broken in production — read logs without touching the server:**
   `gh run list --workflow=deploy-production.yml` to see recent deploys, or ask whoever has
   AWS access to pull `pm2 logs` via SSM (never SSH in and poke around by hand).

7. **Something's broken and you need to undo a deploy:**
   `./deploy/rollback.sh <bad-commit-sha>`
   Opens a revert PR. Merge it, then run `./deploy/ship.sh` again.

8. **Check if two of your AI agents might be fighting over the same files:**
   `git worktree list`
   If more than one branch is checked out and both are "yours," make sure each agent/session
   is pointed at a different path, not the same folder.
