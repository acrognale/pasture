# Regenerate Patch Example (Stable Diff)

Prefer diffs against the upstream tree to reduce context drift. Example for a multi-file patch:

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
