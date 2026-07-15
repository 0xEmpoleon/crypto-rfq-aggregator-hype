#!/usr/bin/env bash
# Guarded production deploy to Vercel.
#
# The Vercel project is NOT git-connected, so `vercel --prod` ships whatever is
# in the working tree — bypassing CI and git. This wrapper refuses to deploy a
# tree that isn't clean, pushed, and even with origin/main, so what goes live is
# always a reviewed, CI-gated commit. Run from anywhere in the repo.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

fail() { echo "✗ $1" >&2; echo "  Refusing to deploy." >&2; exit 1; }

# 1. Clean working tree
[ -z "$(git status --porcelain)" ] || fail "Working tree has uncommitted changes."

# 2. On main (override with ALLOW_BRANCH=1 for a deliberate preview-of-branch)
if [ "$BRANCH" != "main" ] && [ "${ALLOW_BRANCH:-0}" != "1" ]; then
  fail "Not on main (on '$BRANCH'). Set ALLOW_BRANCH=1 to override."
fi

# 3. In sync with origin
git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse @)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$LOCAL" = "$REMOTE" ] || fail "Local $BRANCH is not equal to origin/$BRANCH (push/pull first)."

# 4. Latest CI on this commit must be green (best-effort; needs gh CLI + auth)
if command -v gh >/dev/null 2>&1; then
  CONCLUSION="$(gh run list --branch "$BRANCH" --limit 1 --json headSha,conclusion \
    --jq "map(select(.headSha==\"$LOCAL\")) | .[0].conclusion" 2>/dev/null || echo "")"
  if [ -n "$CONCLUSION" ] && [ "$CONCLUSION" != "success" ]; then
    fail "CI for $LOCAL is '$CONCLUSION', not success."
  fi
  [ -n "$CONCLUSION" ] || echo "… no CI run found for $LOCAL yet (continuing)." >&2
fi

echo "✓ Clean, on $BRANCH, in sync with origin, CI green. Deploying $LOCAL …"
# VERCEL_TOKEN in this environment is invalid; unset it so the CLI uses its login.
exec env -u VERCEL_TOKEN vercel --prod --yes
