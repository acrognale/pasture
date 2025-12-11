#!/usr/bin/env bash
set -euo pipefail

PREFIX=codex
REMOTE=https://github.com/openai/codex.git
BRANCH=main

# Make sure we have the latest upstream
git fetch "$REMOTE" "$BRANCH"

# Find the last subtree commit for this prefix
LAST_SPLIT=$(
  git log --grep="^git-subtree-dir: $PREFIX\$" --format='%B' -n 1 |
  awk '/^git-subtree-split:/ {print $2; exit}'
)

if [ -z "${LAST_SPLIT:-}" ]; then
  echo "Could not find previous git-subtree-split for $PREFIX."
  echo "You may be doing the first add/pull for this subtree."
  LAST_RANGE=""
else
  LAST_RANGE="$LAST_SPLIT..FETCH_HEAD"
fi

# Build a summary of upstream commits
if [ -n "$LAST_RANGE" ]; then
  SUMMARY=$(git log --oneline --no-merges "$LAST_RANGE")
else
  SUMMARY=$(git log --oneline --no-merges FETCH_HEAD)
fi

MSG="Update $PREFIX from $REMOTE/$BRANCH"

git subtree pull \
  --prefix="$PREFIX" \
  "$REMOTE" \
  "$BRANCH" \
  --squash \
  -m "$MSG"
