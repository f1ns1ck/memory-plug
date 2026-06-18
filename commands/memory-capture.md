---
description: Capture the current git diff into Change Memory as a compact, summarized change.
argument-hint: [optional reason for the change]
---

Capture the current working-tree changes into Change Memory.

Call the `capture_change` MCP tool (from the `change-memory` server).

- If the user provided text in `$ARGUMENTS`, pass it as `reason`.
- Optionally infer `changeType` (feature | fix | refactor | test | docs | chore)
  from the conversation, but do not guess wildly — leave it unset if unsure.
- If you know of open TODOs from this session, pass them as `unresolvedItems`.

Do NOT paste the full diff into the conversation. Report back only the returned
change id, type, file counts, and one-line summary. If the tool reports the
memory is not initialized, run `init_memory` first.
