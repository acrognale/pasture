#!/usr/bin/env bash
set -euo pipefail

# Clone production Pasture data into the dev app environment.
# Defaults are for macOS; override via env vars if needed:
#   PROD_DB, DEV_DB, PROD_CODEX_HOME, DEV_CODEX_HOME

PROD_DB="${PROD_DB:-$HOME/Library/Application Support/com.acrognale.pasture/workspace.db}"
DEV_DB="${DEV_DB:-$HOME/Library/Application Support/com.acrognale.pasture/workspace.dev.db}"
PROD_CODEX_HOME="${PROD_CODEX_HOME:-$HOME/.codex}"
DEV_CODEX_HOME="${DEV_CODEX_HOME:-$HOME/.codex-dev}"

echo "Source DB:      $PROD_DB"
echo "Dev DB target:  $DEV_DB"
echo "Source Codex:   $PROD_CODEX_HOME"
echo "Dev Codex:      $DEV_CODEX_HOME"

# Ensure target directories exist
mkdir -p "$(dirname "$DEV_DB")"
mkdir -p "$DEV_CODEX_HOME"

# Backup existing dev DB if present
if [ -f "$DEV_DB" ]; then
  cp "$DEV_DB" "${DEV_DB}.bak.$(date +%s)"
  echo "Backed up existing dev DB to ${DEV_DB}.bak.*"
fi

# Copy workspace DB
if [ ! -f "$PROD_DB" ]; then
  echo "ERROR: Prod DB not found at $PROD_DB" >&2
  exit 1
fi
cp "$PROD_DB" "$DEV_DB"
echo "Copied workspace DB to dev."

# Sync codex
if [ -d "$PROD_CODEX_HOME" ]; then
  rsync -a "$PROD_CODEX_HOME/" "$DEV_CODEX_HOME/"
  echo "Synced Codex sessions."
else
  echo "WARNING: No sessions directory at $PROD_CODEX_HOME; skipped."
fi

echo "Done. Launch dev with CODEX_HOME=$DEV_CODEX_HOME."
