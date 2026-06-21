# Change Memory

**English** | [Русский](README.ru.md)

> Change Memory gives Claude Code compact, local memory of what changed in your
> project across sessions. It stores semantic summaries, changed files, unresolved
> issues, risks, and compressed patches **without loading full diffs into context
> by default**.

**A git-native, fully offline, team-shareable change log for your AI agent.**
Zero tokens, zero cloud, zero telemetry — the change history is plain JSON that
commits with your repo and travels to the next coder, with author attribution.
Unlike conversation-memory plugins, Change Memory remembers **what changed in the
code and why**, not what was said in the chat. See
[Change Memory vs other memory plugins](#change-memory-vs-other-memory-plugins).

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
- **Local & private** — no network, no telemetry. The semantic map can be
  committed to share with your team; raw diffs (patches) stay on your machine.
- **Team-friendly** — the change history travels with the repo, with author
  attribution, so the next coder sees who changed what and why.

## Change Memory vs other memory plugins

Most memory plugins for AI agents record the **conversation / agent observations**
and compress them **with an LLM** (spending tokens) or store them in a **cloud /
paid** service. Change Memory deliberately occupies a different niche: a
**diff-centric, offline, git-committed** change log.

| | **Change Memory** | Conversation-memory plugins (e.g. claude-mem) | Cloud memory frameworks (e.g. Mem0, Zep) |
| --- | --- | --- | --- |
| **Remembers** | What *changed* in the code, and why (git diffs + reason/risk) | What the agent *did/said* during the session | Facts, preferences, conversation history |
| **Summarization** | Offline heuristic — **no LLM, no tokens** | AI-compressed (consumes tokens / API) | LLM + embeddings |
| **Storage** | Local files (`.change-memory/`) | Local DB (e.g. SQLite + vector) | Mostly cloud / paid tiers |
| **Network / telemetry** | **None** | Varies (API for compression) | Cloud by design |
| **Team sharing** | **Built-in** — map commits to git, with author attribution | Typically per-developer | Per-account |
| **Auditability** | Plain JSON, diffs in your PR | Opaque store | Remote service |
| **Search** | Keyword | Hybrid keyword + semantic | Semantic / graph |
| **Agents** | Claude Code | Often multi-agent | Many agents |

**When to choose Change Memory:** you want a *shared*, *auditable* record of code
changes that costs **nothing to run**, sends **nothing off your machine**, and lives
in the repo — ideal for privacy-sensitive, regulated, or team settings.

**When another tool fits better:** you want rich AI-written session summaries,
semantic/vector recall over conversation history, or one memory layer across many
different agents. These are complementary — Change Memory can run alongside them.

## How it works

The plugin ships three parts:

1. **Agent Skill** (`skills/change-memory`) — teaches Claude *when* and *how* to
   use the memory (progressive disclosure: snapshot first, patches last).
2. **MCP server** (`mcp-server/`) — local Node.js server exposing the memory tools.
3. **Slash commands** (`commands/`) — quick entry points.

State lives in your project under `.change-memory/`:

```
.change-memory/
  index.json       # project metadata, active files, unresolved items, budgets   [shared]
  changes.jsonl    # one JSON line per captured change (incl. author)             [shared]
  summaries/       # archived/compacted history                                   [shared]
  session.md       # compact snapshot (mirrors get_session_context, regenerated)  [local]
  patches/         # gzip-compressed full diffs (chg_*.patch.gz)                   [local]
  auto-capture.json# per-machine fingerprint + auto-capture on/off toggle         [local]
  .gitignore       # written by init_memory: commits the map, ignores the rest
```

`[shared]` files are committed so teammates inherit the change history;
`[local]` artifacts stay on your machine. See **Team workflow** below.

See [`examples/change-memory/`](examples/change-memory/) for a static sample of
`session.md` and `index.json` so you can preview the format without a live install.

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

## Team workflow

Change Memory is built to travel with the repo so the **next coder understands
what changed and why** — without you re-explaining it.

- **Commit the map.** `init_memory` writes a `.change-memory/.gitignore` that
  commits `index.json`, `changes.jsonl` and `summaries/` (the semantic map) and
  ignores `patches/`, `auto-capture.json` and `session.md` (machine-local /
  heavy-binary). Just commit `.change-memory/` as part of your normal git flow —
  the plugin never runs git writes itself.
- **Attribution.** Each change records its `author` from `git config
  user.name/user.email`, so `list_changes` and `show_change` show *who* made it.
- **Fresh clone.** A teammate who clones the repo runs `/memory-session`
  (`get_session_context`) and immediately gets the rebuilt snapshot from the
  committed map — no patches required. They can `show_change` any change's
  metadata; the raw diff (`includePatch: true`) is only available for changes
  captured on their own machine, since patches stay local.
- **Share patches too (opt-in).** Run `/memory share on` (or
  `set_share_patches({ enabled: true })`) to commit `patches/` as well, so
  teammates can load *any* change's diff. The flag is stored as `share_patches`
  in the committed `index.json` and the managed `.gitignore` is regenerated to
  track `patches/`; `/memory share off` reverts to local-only. You can also opt in
  at setup time with `/memory-init share`. Note this commits compressed patch
  blobs, which adds repo weight — leave it off unless the team wants full diffs.

> **Prefer not to share?** Delete the generated `.change-memory/.gitignore` and
> add `.change-memory/` to your project's root `.gitignore` to keep everything
> machine-local instead.

## Tools

| Tool | Purpose |
| --- | --- |
| `init_memory` | Create `.change-memory/` for the project. |
| `capture_change` | Snapshot the current `git diff` (incl. untracked files) → compressed patch + semantic summary. |
| `auto_capture_change` | Like `capture_change`, but debounced + deduplicated for automatic (hook) use. |
| `set_auto_capture` | Turn auto-capture on/off for this machine (per-developer; omit `enabled` to query). |
| `set_share_patches` | Turn patch sharing on/off for the project (team-wide via `index.json`; omit `enabled` to query). |
| `get_session_context` | Return the compact markdown snapshot. **Never includes full diffs.** |
| `show_change` | Show one change's metadata; the patch only when `includePatch: true`. |
| `list_changes` | Compact table: `id \| type \| file \| summary`. |
| `search_changes` | Search id, summary, files, reason, risk, tests. |
| `compact_memory` | Archive old changes into a summary; keep recent ones; preserve patches. |

## Slash commands

Three core commands are top-level; the rest live under a single `/memory`
dispatcher to keep the command surface small.

| Command | Action |
| --- | --- |
| `/memory-init [share-patches]` | Initialize memory; add `share` to commit patches too. |
| `/memory-capture [reason]` | Capture current changes. |
| `/memory-session` | Load the compact session context. |
| `/memory show <changeId> [patch]` | Show a change (add `patch` for the diff). |
| `/memory search <query> [limit]` | Search change history by keyword. |
| `/memory compact [olderThanDays] [keepRecent]` | Archive old changes; keep recent ones. |
| `/memory auto <on\|off\|status>` | Turn automatic capture on/off (per-machine). |
| `/memory share <on\|off\|status>` | Turn patch sharing on/off (team-wide). |

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
   - `list_changes` (or `/memory show`) — a new `chg_...` with reason `auto: ...`.
   - `.change-memory/auto-capture.json` — `last_change_id` updated.
3. Ask for a second edit within 30s → no new entry (debounced/deduped). Wait >30s and
   edit again → a new entry appears.

### Disable auto-capture (manual-only mode)

The simplest way is the per-machine toggle:

- Run **`/memory auto off`** (calls `set_auto_capture`). The flag is stored in the
  local, gitignored `auto-capture.json`, so it only affects your machine, never
  your teammates. `/memory auto on` re-enables it; `/memory auto status` reports
  the current state.

To hard-disable the hook for everyone (or as a fallback):

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
                            → chg_20260618_210712_... | fix | Ada <ada@example.com> | src/auth.ts

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

- chg_20260618_210712_de5c94c2 (Ada <ada@example.com>): Fix change: added 1,
  modified 1 file(s) in src (`src/auth.ts`). Reason: fix token refresh. Full
  patch stored locally.

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
   - `git config user.name` / `git config user.email` (read-only, for author
     attribution)

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

- **Raw diffs never leave your machine.** Patches are stored compressed locally
  and are gitignored by default; you control them.
- The **map** that can be committed (summaries, file lists, reasons, authors,
  open issues) is intentionally diff-free — only what a teammate needs to follow
  the history, not the source itself.
- The session snapshot deliberately excludes diffs to minimize what enters the
  model context.
- Don't want to share anything? See **Team workflow** for how to keep the whole
  `.change-memory/` directory machine-local.

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
- **Memory captured itself** — `.change-memory/` is always excluded from capture
  (see `getUntrackedFiles`). The generated `.change-memory/.gitignore` already
  keeps patches and machine-local state out of commits.
- **Author shows `(unknown)`** — set a git identity (`git config user.name` /
  `git config user.email`); pre-existing changes captured before this version
  have no recorded author.

## Roadmap

**Shipped**

- ✅ Team-shareable map with author attribution (0.2.0).
- ✅ Opt-in patch sharing + consolidated slash commands (0.3.0).
- ✅ Automatic capture via `PostToolUse` hook, with per-machine toggle.

**Next (priority order)**

- **Branch/commit awareness + PR summaries** — tie each change to its branch/commit
  and generate a change summary for a PR. Strengthens the review/onboarding use case.
- **Optional, opt-in LLM summarizer** (pluggable `Summarizer` interface already in
  place) for richer summaries — **off by default, still offline-first**.
- Per-file patch retrieval in `show_change` (request a single file's hunk).
- Automatic `compact_memory` on a size/age threshold.

**Later**

- Optional offline semantic search (local embeddings, no cloud).
- Staged vs. unstaged capture modes.
- Configurable token budgets and constraints via `index.json` editing helpers.
- Tags/labels and richer search ranking.

## License

MIT — see [LICENSE](./LICENSE).
