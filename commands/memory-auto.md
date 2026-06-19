---
description: Turn automatic Change Memory capture on or off for this machine.
argument-hint: on | off | status
---

Toggle automatic Change Memory capture (per-developer, stored locally — never
committed).

Read the first token of `$ARGUMENTS`:

- `on`  → call `set_auto_capture` with `enabled: true`.
- `off` → call `set_auto_capture` with `enabled: false`.
- `status` or empty → call `set_auto_capture` with no `enabled` to report the
  current state.

Do not pass `projectPath` unless the user names a different directory — the
default is the current project root. If the tool reports the memory is not
initialized, run `init_memory` first.

Report back the returned one-line state. Note: this only controls the *automatic*
PostToolUse hook; `/memory-capture` always works regardless of the toggle.
