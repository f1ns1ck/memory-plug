# Change Memory

> Change Memory gives Claude Code compact, local memory of what changed in your
> project across sessions. It stores semantic summaries, changed files, unresolved
> issues, risks, and compressed patches **without loading full diffs into context
> by default**.

**Category:** development
**Keywords:** claude-code, mcp, agent-memory, git-diff, context-management, token-optimization, coding-agent

---

## What it does

Long coding sessions burn tokens re-reading history. Change Memory keeps a tiny
on-disk "map" of your project's changes and hands Claude a **compact snapshot** at
the start of a session instead of full diffs. The full patches are stored locally,
gzip-compressed, and loaded **only when explicitly requested**.

The guiding principle:

> The agent gets a short change map, not the whole diff. Full patch files are
> loaded only on explicit request.

## Why Claude Code users want it

- **Continuity across sessions** — pick up where you left off without re-explaining.
- **Token efficiency** — bootstrap context is budgeted (~700 tokens by default).
- **Avoid repeating work** — search past fixes, risks, and unresolved items.
- **Local & private** — nothing leaves your machine. No network, no telemetry.

## How it works

The plugin ships three parts:

1. **Agent Skill** (`skills/change-memory`) — teaches Claude *when* and *how* to
   use the memory (progressive disclosure: snapshot first, patches last).
2. **MCP server** (`mcp-server/`) — local Node.js server exposing the memory tools.
3. **Slash commands** (`commands/`) — quick entry points.

State lives in your project under `.change-memory/`:

```
.change-memory/
  session.md       # compact snapshot (mirrors get_session_context)
  index.json       # project metadata, active files, unresolved items, budgets
  changes.jsonl    # one JSON line per captured change
  patches/         # gzip-compressed full diffs (chg_*.patch.gz)
  summaries/       # archived/compacted history
```

## Install

1. Add this plugin from your Claude Code marketplace (or install locally).
2. The MCP server runs from compiled output at `mcp-server/dist/index.js`.
   - If you cloned the source, build it once: `npm install` (the `prepare`
     script runs `npm run build` automatically). Requires **Node.js ≥ 18**.
3. Restart Claude Code so it picks up the bundled MCP server defined in `.mcp.json`.

### Enabling the MCP server

`.mcp.json` registers the server for the plugin:

```json
{
  "mcpServers": {
    "change-memory": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js"]
    }
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` is provided by Claude Code and points at the installed
plugin directory. No configuration is required.

> **Tip:** add `.change-memory/` to your project's `.gitignore` if you don't want the
> memory committed. (Patches are local artifacts.)

## Tools

| Tool | Purpose |
| --- | --- |
| `init_memory` | Create `.change-memory/` for the project. |
| `capture_change` | Snapshot the current `git diff` (incl. untracked files) → compressed patch + semantic summary. |
| `auto_capture_change` | Like `capture_change`, but debounced + deduplicated for automatic (hook) use. |
| `get_session_context` | Return the compact markdown snapshot. **Never includes full diffs.** |
| `show_change` | Show one change's metadata; the patch only when `includePatch: true`. |
| `list_changes` | Compact table: `id \| type \| file \| summary`. |
| `search_changes` | Search id, summary, files, reason, risk, tests. |
| `compact_memory` | Archive old changes into a summary; keep recent ones; preserve patches. |

## Slash commands

| Command | Action |
| --- | --- |
| `/memory-init` | Initialize memory for the project. |
| `/memory-capture [reason]` | Capture current changes. |
| `/memory-session` | Load the compact session context. |
| `/memory-show <changeId> [patch]` | Show a change (add `patch` for the diff). |

## Automatic capture

Once the plugin is installed, Change Memory records changes **automatically** — you
don't need to run `/memory-capture` by hand.

A bundled Claude Code hook (`hooks/hooks.json`) fires on `PostToolUse` for the
`Write`, `Edit` and `MultiEdit` tools and calls the `auto_capture_change` MCP tool.

- **Manual capture still works.** `/memory-capture` (and the `capture_change` tool)
  remain available — use them for a deliberate, named snapshot with a custom reason.
- **Debounced.** At most one capture per `debounceMs` window (default **30s**), so a
  burst of edits produces a single snapshot, not dozens.
- **Deduplicated.** Auto-capture fingerprints the composed working-tree diff
  (tracked diff + untracked file contents). If the diff is unchanged since the last
  capture, it does nothing.
- **Never touches git state.** It only reads `git diff` / `git status` and writes
  into `.change-memory/`. It does **not** `git add`, `commit`, `checkout`, or run any
  destructive git command.
- **Non-blocking.** If memory isn't initialized, the path isn't a git repo, or the
  tree is clean, the hook skips silently and never interrupts your work.

Auto-capture keeps its bookkeeping in `.change-memory/auto-capture.json`
(`last_fingerprint`, `last_capture_at`, `last_change_id`).

> **Project-root note:** the hook passes `${CLAUDE_PROJECT_DIR}` (the directory
> Claude Code was launched in) as `projectPath`. Open Claude Code **at your git
> repository root**, not a parent folder — if the repo is nested below the project
> root, auto-capture targets the wrong directory and silently skips.

### Verify auto-capture is working

1. Run `/memory-init` once in a git repo (auto-capture is a no-op until initialized).
2. Ask Claude to edit a file. After the edit, check the latest entry:
   - `list_changes` (or `/memory-show`) — a new `chg_...` with reason `auto: ...`.
   - `.change-memory/auto-capture.json` — `last_change_id` updated.
3. Ask for a second edit within 30s → no new entry (debounced/deduped). Wait >30s and
   edit again → a new entry appears.

### Disable auto-capture (manual-only mode)

Auto-capture lives entirely in `hooks/hooks.json`. To turn it off and keep only
manual `/memory-capture`:

- Remove or rename `hooks/hooks.json` in the installed plugin, **or**
- Disable the plugin's hooks from `/hooks` / your Claude Code hook settings, **or**
- Raise `debounceMs` in `hooks/hooks.json` to a large value to throttle it.

The MCP tools (including manual `capture_change`) are unaffected.

## Example workflow

```text
# New session
/memory-session          → Claude loads the compact snapshot

# ... you and Claude make changes ...

/memory-capture fixed token refresh on expiry
                            → chg_20260618_210712_... | fix | src/auth.ts

# Later, recall details
search_changes("token")     → finds the change
show_change(chg_..., includePatch:false)  → metadata only
show_change(chg_..., includePatch:true)   → full diff, on demand
```

## Example `.change-memory/session.md`

```md
# Session Context

Project: my-app

This is a compact memory snapshot for Claude Code.
It intentionally excludes full diffs to reduce token usage.

## Recent Changes

- chg_20260618_210712_de5c94c2: Fix change: added 1, modified 1 file(s) in src
  (`src/auth.ts`). Reason: fix token refresh. Full patch stored locally.

## Active Files

- src/auth.ts

## Open Issues

- add tests for token expiry

## Constraints

- Keep context compact.
- Do not include full diffs by default.
- Load patch details only when needed.

## Available Memory Tools

- show_change(changeId)
- list_changes()
- search_changes(query)
- capture_change()
```

## Security model

This plugin is built to be safe for marketplace distribution:

1. **Local only.** All state lives in `.change-memory/` inside your project.
2. **No telemetry**, no analytics, no phone-home.
3. **No external network calls.** The server has no HTTP client.
4. **No `eval`** and no dynamic code execution.
5. **No arbitrary shell.** The only external process is `git`, restricted to an
   **allow-list of read-only argument vectors**:
   - `git diff`
   - `git diff --name-only`
   - `git diff --name-status`
   - `git status --porcelain [--untracked-files=all]`
   - `git rev-parse --is-inside-work-tree`

   Commands are executed via `execFile` (no shell), and user input is never
   interpolated into a command. Write operations (commit/add/checkout) are
   impossible by construction.
6. **No user code is modified or committed.** Capture is read-only.
7. **Path traversal protection.** Every file access is normalized and verified to
   stay inside the project root (`ensureInsideRoot`). Patches live only under
   `.change-memory/patches/`.
8. **Bounded reads.** Untracked file content embedded in patches is capped (256 KB
   per file) and binary files are skipped.

## Privacy model

- Your code and diffs **never leave your machine**.
- Patches are stored compressed on local disk; you control them.
- The session snapshot deliberately excludes diffs to minimize what enters the
  model context.

## MVP limitations

Not included in this first version:

- Cloud sync / remote storage
- External LLM summarization (the summarizer is heuristic and offline)
- VSCode extension or web dashboard
- Authentication
- Telemetry
- Arbitrary shell command execution
- Staged-vs-unstaged separation (captures the working-tree diff + untracked files)

## Troubleshooting

- **"No .change-memory found"** — run `/memory-init` (or call `init_memory`).
- **"No changes to capture"** — the working tree has no tracked changes and no
  untracked files. Make an edit first.
- **"Not a git repository"** — `capture_change` reads `git diff`; run inside a git
  repo (`git init`).
- **Server not loading** — ensure `mcp-server/dist/index.js` exists; run
  `npm install` (which builds) and restart Claude Code.
- **Memory captured itself** — `.change-memory/` is always excluded from capture;
  also add it to `.gitignore` to keep it out of commits.

## Roadmap (0.2.0+)

- Optional, opt-in LLM-based summarizer (pluggable `Summarizer` interface already
  in place) for richer summaries — still local-first.
- Per-file patch retrieval in `show_change` (request a single file's hunk).
- Staged vs. unstaged capture modes and branch/commit awareness.
- Automatic `compact_memory` on a size/age threshold.
- Configurable token budgets and constraints via `index.json` editing helpers.
- Tags/labels and richer search ranking.

## License

MIT — see [LICENSE](./LICENSE).
