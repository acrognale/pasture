#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <codex-commit-or-ref>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ref="$1"

if [[ ! -d "${root_dir}/codex/.git" ]]; then
  echo "codex submodule not initialized. Run: git submodule update --init --recursive" >&2
  exit 1
fi

# Update submodule to target ref
(
  cd "${root_dir}/codex"
  git reset --hard
  git clean -fd
  git fetch origin
  git checkout "${ref}"
)

# Re-apply patches
"${root_dir}/scripts/apply_codex_patches.sh"

# Validate
(
  cd "${root_dir}"
  cargo check
  pnpm run generate:types
  turbo lint
  turbo typecheck
)

echo "Codex submodule updated to ${ref} and patches applied successfully."
echo "Commit the submodule pointer with: git add codex && git commit -m \"Bump codex submodule to ${ref}\""
