# Example `.change-memory/` snapshot

This folder is a **static, illustrative sample** of what Change Memory stores in a
project. It exists so you can see the on-disk format without digging into a live
install. It is **not** used by the plugin at runtime.

In a real project the state lives in a `.change-memory/` directory at the repo root,
which is **gitignored** (machine-local artifacts — never commit them). See the root
[`.gitignore`](../../.gitignore) and the [README](../../README.md).

## Files here

| File | What it is |
| --- | --- |
| [`session.md`](session.md) | Compact snapshot mirrored by `get_session_context` — recent changes, active files, open issues, constraints. |
| [`index.json`](index.json) | Project metadata: active files, recent change ids, unresolved items, token budgets. |

## Intentionally omitted

- **`patches/`** — gzip-compressed full diffs (`chg_*.patch.gz`). Binary and
  redundant with git history; left out of this example on purpose.
- **`changes.jsonl`** / **`auto-capture.json`** — append-only change log and
  auto-capture fingerprint. Machine-local bookkeeping, not useful as a static sample.

The values above (project `demo-app`, the `chg_*` ids) are fabricated for
illustration.
