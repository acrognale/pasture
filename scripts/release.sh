#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to run this script."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run this script."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Please commit or stash changes before running the release script."
  exit 1
fi

CURRENT_VERSION="$(jq -r '.version' apps/desktop/package.json)"
if [[ ! "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-alpha\.[0-9]+)?$ ]]; then
  echo "Current version '$CURRENT_VERSION' is not a valid semantic version (x.y.z or x.y.z-alpha.N)."
  exit 1
fi

# Parse command line arguments
BUMP_TYPE="minor"  # default to minor
RELEASE_TYPE="alpha"  # default to stable release
for arg in "$@"; do
  case "$arg" in
    --patch)
      BUMP_TYPE="patch"
      ;;
    --minor)
      BUMP_TYPE="minor"
      ;;
    --major)
      BUMP_TYPE="major"
      ;;
    --alpha)
      RELEASE_TYPE="alpha"
      ;;
    --stable)
      RELEASE_TYPE="stable"
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--patch|--minor|--major] [--alpha|--stable]"
      exit 1
      ;;
  esac
done

# Parse current version into components
if [[ "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-alpha\.([0-9]+))?$ ]]; then
  MAJOR="${BASH_REMATCH[1]}"
  MINOR="${BASH_REMATCH[2]}"
  PATCH="${BASH_REMATCH[3]}"
  IS_ALPHA="${BASH_REMATCH[4]}"  # Will be "-alpha.N" or empty
  ALPHA_NUM="${BASH_REMATCH[5]}"  # Will be "N" or empty
else
  echo "Failed to parse version: $CURRENT_VERSION"
  exit 1
fi

# Calculate next version based on release type and bump type
if [[ "$RELEASE_TYPE" == "alpha" ]]; then
  if [[ -n "$IS_ALPHA" ]]; then
    # Currently on alpha, increment alpha number
    NEXT_ALPHA=$((ALPHA_NUM + 1))
    NEXT_VERSION="${MAJOR}.${MINOR}.${PATCH}-alpha.${NEXT_ALPHA}"
    echo "Incrementing alpha: $CURRENT_VERSION -> $NEXT_VERSION"
  else
    # Currently on stable, create first alpha for next version
    case "$BUMP_TYPE" in
      patch)
        NEXT_PATCH=$((PATCH + 1))
        NEXT_VERSION="${MAJOR}.${MINOR}.${NEXT_PATCH}-alpha.1"
        ;;
      minor)
        NEXT_MINOR=$((MINOR + 1))
        NEXT_VERSION="${MAJOR}.${NEXT_MINOR}.0-alpha.1"
        ;;
      major)
        NEXT_MAJOR=$((MAJOR + 1))
        NEXT_VERSION="${NEXT_MAJOR}.0.0-alpha.1"
        ;;
    esac
    echo "Creating first alpha for next version: $CURRENT_VERSION -> $NEXT_VERSION"
  fi
else
  # Stable release
  if [[ -n "$IS_ALPHA" ]]; then
    # Graduate from alpha to stable (strip -alpha.N suffix)
    NEXT_VERSION="${MAJOR}.${MINOR}.${PATCH}"
    echo "Graduating alpha to stable: $CURRENT_VERSION -> $NEXT_VERSION"
  else
    # Normal stable version bump
    case "$BUMP_TYPE" in
      patch)
        NEXT_PATCH=$((PATCH + 1))
        NEXT_VERSION="${MAJOR}.${MINOR}.${NEXT_PATCH}"
        ;;
      minor)
        NEXT_MINOR=$((MINOR + 1))
        NEXT_VERSION="${MAJOR}.${NEXT_MINOR}.0"
        ;;
      major)
        NEXT_MAJOR=$((MAJOR + 1))
        NEXT_VERSION="${NEXT_MAJOR}.0.0"
        ;;
    esac
    echo "Bumping stable version: $CURRENT_VERSION -> $NEXT_VERSION"
  fi
fi


if git rev-parse "refs/tags/v$NEXT_VERSION" >/dev/null 2>&1; then
  echo "Tag v$NEXT_VERSION already exists."
  exit 1
fi

tmp="$(mktemp)"
jq --arg version "$NEXT_VERSION" '.version = $version' apps/desktop/package.json > "$tmp"
mv "$tmp" apps/desktop/package.json


if [[ -f package-lock.json ]]; then
  tmp="$(mktemp)"
  jq --arg version "$NEXT_VERSION" '
    .version = $version
    | if .packages and .packages["apps/desktop"] then
        .packages["apps/desktop"].version = $version
      else
        .
      end
  ' package-lock.json > "$tmp"
  mv "$tmp" package-lock.json
fi

tmp="$(mktemp)"
jq --arg version "$NEXT_VERSION" '.version = $version' apps/desktop/src-tauri/tauri.conf.json > "$tmp"
mv "$tmp" apps/desktop/src-tauri/tauri.conf.json

python3 - "$NEXT_VERSION" <<'PY'
import pathlib
import sys

version = sys.argv[1]
path = pathlib.Path("apps/desktop/src-tauri/Cargo.toml")
lines = path.read_text().splitlines()

in_package = False
for idx, line in enumerate(lines):
    stripped = line.strip()
    if stripped == "[package]":
        in_package = True
        continue
    if in_package and stripped.startswith("[") and stripped != "[package]":
        raise SystemExit("Could not locate version assignment under [package] section")
    if in_package and stripped.startswith("version"):
        prefix = line.split("version", 1)[0]
        lines[idx] = f'{prefix}version = "{version}"'
        break
else:
    raise SystemExit("Could not find version assignment in Cargo.toml")

path.write_text("\n".join(lines) + "\n")
PY

# Update Cargo.lock to reflect the new version in Cargo.toml
(cd apps/desktop/src-tauri && cargo update -p pasture --offline 2>/dev/null || cargo check --quiet)

git add package.json apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
if [[ -f package-lock.json ]]; then
  git add package-lock.json
fi

if git diff --cached --quiet; then
  echo "No changes detected after version bump."
  exit 1
fi

RELEASE_COMMIT="chore: release v$NEXT_VERSION"

git commit -m "$RELEASE_COMMIT"
git tag -a "v$NEXT_VERSION" -m "Release v$NEXT_VERSION"

echo
echo "Created release commit and tag:"
git log -1 --oneline
git tag -n1 "v$NEXT_VERSION"

echo
echo "Next steps:"
echo "  1. Review the commit: git show HEAD"
echo "  2. Push the commit: git push origin HEAD"
echo "  3. Push the tag:    git push origin v$NEXT_VERSION"
