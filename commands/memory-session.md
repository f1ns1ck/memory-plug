---
description: Load the compact Change Memory session context for this project.
---

Load the compact session context for the current project.

Call the `get_session_context` MCP tool (from the `change-memory` server) with
no arguments (or only `projectPath` if the user names another directory).

Use the returned snapshot to orient yourself: recent changes, active files, open
issues, risks and constraints. This snapshot deliberately excludes full diffs —
do not request patches unless the task needs exact diff details. To go deeper use
`list_changes`, `search_changes`, then `show_change`.

If the tool reports the memory is not initialized, suggest `/memory-init`.
