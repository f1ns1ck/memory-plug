---
description: Initialize local Change Memory (.change-memory/) for this project.
---

Initialize Change Memory for the current project.

Call the `init_memory` MCP tool (from the `change-memory` server). Do not pass
`projectPath` unless the user names a different directory — the default is the
current project root.

After it runs, briefly confirm to the user that `.change-memory/` was created
(index.json, changes.jsonl, session.md, patches/, summaries/) and tell them they
can now use `/memory-capture` to record changes.
