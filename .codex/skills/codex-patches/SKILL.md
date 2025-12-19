---
name: codex-patches
description: Use this when updating the codex subtree or when patch files in codex-patches/ need to be added, regenerated, or repaired.
---

# Codex Patch Workflow

Use this skill whenever you touch the upstream codex subtree or the patch series in `codex-patches/`.

## Apply Patches After Submodule Update

1. Update the codex submodule to the target commit:

```bash
cd codex
git checkout <commit>
cd ..
```

2. Apply our patches:

```bash
scripts/apply_codex_patches.sh
```

3. Verify with repo checks:

```bash
turbo lint
turbo typecheck
```

If a patch fails, fix only that patch before moving on.

## Repairing a Broken Patch

General approach:

1. Rehydrate `codex/` to clean upstream before re‑diffing:

```bash
git archive codex-upstream/main | tar -x -C codex
```

2. Re‑apply the remaining patches that still work. Fix conflicts manually if needed.
3. Regenerate the broken patch by diffing the upstream file(s) against our modified version.

### Regenerating a Patch (stable diff style)

Prefer diffs against the upstream tree to reduce context drift. Example for a multi‑file patch:

```bash
# Example: rebuild a patch from upstream vs current codex/
python - <<'PY'
from pathlib import Path
import subprocess

files = [
    'codex-rs/core/src/codex.rs',
    'codex-rs/core/src/tools/spec.rs',
]
patch_parts = []
for f in files:
    out = subprocess.check_output([
        'git','diff',
        f'codex-upstream/main:{f}',
        f'codex/{f}'
    ], text=True)
    if out.strip():
        out = out.replace(f'a/{f}', f'a/codex/{f}')
        out = out.replace(f'b/{f}', f'b/codex/{f}')
        patch_parts.append(out.rstrip())

Path('codex-patches/0001-example.patch').write_text('\n'.join(patch_parts) + '\n')
PY
```

### Patch Hygiene

- Keep each patch focused on a single feature or concern.
- Avoid bundling unrelated changes into the same patch.
- Do not include upstream-only changes; patches should be fork-only deltas.

## Quick Smoke Test

After applying patches:

```bash
turbo lint
turbo typecheck
```
