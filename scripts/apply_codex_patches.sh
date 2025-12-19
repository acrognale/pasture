#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
patch_dir="${root_dir}/codex-patches"
codex_dir="${root_dir}/codex"
codex_marker="${codex_dir}/codex-rs/core/src/codex.rs"

if [[ ! -d "${patch_dir}" ]]; then
  echo "Patch directory not found: ${patch_dir}" >&2
  exit 1
fi

if [[ ! -f "${codex_marker}" ]]; then
  echo "codex submodule not found (missing ${codex_marker}). Initialize the submodule before applying patches." >&2
  exit 1
fi

if [[ -n "$(git -C "${codex_dir}" status --porcelain)" ]]; then
  echo "codex submodule has uncommitted changes. Commit or reset before applying patches." >&2
  exit 1
fi

shopt -s nullglob
patches=("${patch_dir}"/*.patch)

if [[ ${#patches[@]} -eq 0 ]]; then
  echo "No patch files found in ${patch_dir}" >&2
  exit 1
fi

for patch in "${patches[@]}"; do
  echo "Applying ${patch##*/}"
  tmp_patch="$(mktemp)"
  sed 's# a/codex/# a/#g; s# b/codex/# b/#g; s#^diff --git a/codex/#diff --git a/#g' "${patch}" > "${tmp_patch}"
  git -C "${codex_dir}" apply --index "${tmp_patch}"
  rm -f "${tmp_patch}"
done

echo "Applied ${#patches[@]} patches from ${patch_dir}."
