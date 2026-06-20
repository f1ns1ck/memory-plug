---
description: Change Memory dispatcher — show, search, compact, auto, share.
argument-hint: <show|search|compact|auto|share> [args]
---

Route a Change Memory subcommand. The user input is in `$ARGUMENTS`. Take the
first token as the subcommand and treat the rest as its arguments. All tools are
from the `change-memory` server and accept an optional `projectPath` (omit it to
use the current project). If a tool reports the memory is not initialized, run
`init_memory` first (or suggest `/memory-init`).

If no subcommand is given, list the available ones and stop.

### `show <changeId> [patch]`
Call `show_change` with `changeId` (looks like `chg_YYYYMMDD_HHMMSS_hash`). Set
`includePatch: true` ONLY if the word "patch" or "diff" is present. If no id is
given, call `list_changes` first and ask which one. Summarize the metadata; if a
patch was loaded and truncated, offer to inspect a specific file.

### `search <query> [limit]`
Call `search_changes` with the remaining text as `query`. If a trailing standalone
integer is present, pass it as `limit` (else default 20). Present matches as a
short list (`id | type | file | summary`). If empty, ask what to search for.

### `compact [olderThanDays] [keepRecent]`
Call `compact_memory`. First integer → `olderThanDays` (default 30), second →
`keepRecent`. Report how many were archived, how many remain, and the archive
path. Remind the user the `summaries/` map is committed, so they may want to commit.

### `auto <on|off|status|1|0>`
Call `set_auto_capture`. `on`/`1` → `enabled: true`; `off`/`0` → `enabled: false`;
`status` or no value → omit `enabled` to report the current state. This is a
per-machine preference stored in the local (gitignored) `auto-capture.json`.

### `share <on|off|status|1|0>`
Call `set_share_patches`. `on`/`1` → `enabled: true` (commit `patches/` so teammates
can load any change's diff); `off`/`0` → `enabled: false` (patches stay local);
`status` or no value → omit `enabled` to report the current state. This is a team
decision stored as `share_patches` in the committed `index.json`; remind the user
to commit `.change-memory/` after toggling.
