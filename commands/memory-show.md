---
description: Show details for a specific Change Memory change id.
argument-hint: <changeId> [patch]
---

Show details for a specific change.

The user input is in `$ARGUMENTS`.

1. Take the first token as the `changeId` (it looks like `chg_YYYYMMDD_HHMMSS_hash`).
   If no id is provided, call `list_changes` first and ask which one.
2. Call the `show_change` MCP tool (from the `change-memory` server) with that
   `changeId`.
3. Set `includePatch: true` ONLY if the user explicitly asked for the diff/patch
   (e.g. the word "patch" or "diff" appears in `$ARGUMENTS`). Otherwise keep it
   `false` to save tokens.

Summarize the metadata for the user. If a patch was loaded and truncated, offer
to inspect a specific file rather than dumping the whole diff.
