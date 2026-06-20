---
description: Initialize local Change Memory (.change-memory/) for this project.
argument-hint: [share-patches]
---

Initialize Change Memory for the current project.

Call the `init_memory` MCP tool (from the `change-memory` server). Do not pass
`projectPath` unless the user names a different directory — the default is the
current project root.

If `$ARGUMENTS` asks to share patches (e.g. contains "share", "patches", or "on"),
pass `sharePatches: true` so `patches/` are committed with the repo and teammates
can load any change's diff. Pass `sharePatches: false` to turn it back off. Re-running
`init_memory` on an already-initialized project with `sharePatches` toggles the
setting and regenerates the managed `.gitignore`. Omit it to leave the setting as-is.

After it runs, briefly confirm to the user that `.change-memory/` was created
(index.json, changes.jsonl, session.md, patches/, summaries/), report whether patch
sharing is ON or OFF, and tell them they can now use `/memory-capture` to record
changes.
