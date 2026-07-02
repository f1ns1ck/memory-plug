# Changelog

All notable changes to the Change Memory plugin are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-07-02

### Added
- **Automatic session bootstrap.** A new `SessionStart` hook injects the compact
  change snapshot into context when a session starts (or after `/clear`) — no
  more running `/memory-session` by hand. Skips silently when memory isn't
  initialized; never blocks session start.
- **Lazy enrichment of heuristic captures.** Records whose summary is
  heuristic-only are stored with `enriched: false`; the session snapshot lists
  up to three of them under **Awaiting Enrichment**, and the agent can upgrade
  one in place with `capture_change({ enrichChangeId, llmSummary, ... })` —
  same id, patch and timestamp, only the summary/risk/type/tags improve. This
  finally routes the richest agent-authored summaries to auto-captures while the
  hook itself stays offline and heuristic. `schema_version` 5 (informational).
- **Retrieval evaluation harness.** `test/retrievalBenchmark.test.mjs` builds a
  fixture history of heuristic-only summaries via the real summarizer and asserts
  top-1 accuracy ≥ 80% on a fixed query set — the roadmap's capture-quality bar,
  now measured instead of eyeballed.

### Changed
- **Whole-word search matching.** `search_changes` no longer substring-matches:
  "auth" stops hitting every record's "author attribution". camelCase
  identifiers are split, so "cache" still finds `cacheStore.ts`.

## [0.8.0] - 2026-07-02

### Added
- **Diff-aware heuristic summaries.** The offline summarizer now parses the diff
  itself — not just file paths — and names the declarations a change touches plus
  its `(+added/-removed)` line counts (e.g. _"Touches `runCapture`, `coalesce`
  (+42/-8)"_). This lifts the default auto-capture summary past a bare file count
  while keeping the no-network / no-keys guarantee; the agent-authored
  `llmSummary` still overrides it on deliberate captures.
- **Tags + weighted search ranking.** `capture_change` accepts an optional
  `tags[]` (trimmed, lower-cased, de-duped, capped); `list_changes` and
  `search_changes` take a `tag` filter. Search no longer counts flat term hits —
  it ranks by field weight (summary and tags weigh most, then reason, type,
  files) with a recency boost, so a change that is *about* the query outranks one
  that merely mentions it. Schema-compatible: pre-v4 records simply omit `tags`.

### Changed
- **Auto-capture coalesces a burst into one evolving change.** While consecutive
  auto-captures land on the same branch within `coalesce_window_ms` (default 5
  min), the record is updated in place — same id, refreshed patch/summary/files/
  timestamp — instead of appending a near-duplicate. This directly cuts the
  noisy-history problem (68 entries on a tiny project). Manual `capture_change`
  always appends a deliberate checkpoint; set `coalesce_window_ms` to 0 to disable.
- `schema_version` bumped to 4 for the optional `tags[]` field. The bump is
  informational — reads tolerate older records, so no migration runs.

## [0.7.0] - 2026-06-24

### Changed
- **Smaller MCP tool surface (11 → 9).** The two per-setting toggles
  `set_auto_capture` and `set_share_patches` are replaced by a single `configure`
  tool taking optional `autoCapture` and/or `sharePatches` fields (omit a field to
  leave it unchanged, omit both to query). The scopes are unchanged — `autoCapture`
  stays a per-machine flag in the local `auto-capture.json`, `sharePatches` stays a
  team decision in the committed `index.json`. The `/memory auto` and `/memory share`
  commands are unaffected and now route through `configure`.
- **`auto_capture_change` is no longer exposed as an MCP tool.** It was only ever
  meant for the `PostToolUse` hook, which calls the bundled
  `cli/autoCapture.js` directly (no MCP round-trip), so nothing about automatic
  capture changes. Use `capture_change` for manual, deliberate snapshots.

## [0.6.1] - 2026-06-24

### Fixed
- **Memory no longer records itself.** Once the shared map
  (`.change-memory/index.json`, `changes.jsonl`) was committed — the recommended
  team workflow — every later `git diff` included the memory store's own files, so
  each capture recorded `.change-memory/*` as a change and embedded the growing
  history in its own patch (a recursive self-pollution). Working-tree diffs now
  exclude `.change-memory/` across the unified diff, `--name-only` and
  `--name-status`, mirroring the existing untracked-file guard. Read-only git only.
- **Fewer false-positive risk flags.** Documentation files
  (`.md`/`.mdx`/`.rst`/`.txt`/`.adoc` and `docs/`) no longer raise code-risk notes,
  and the auth/session/token rule now matches whole path tokens, so
  `sessionBuilder.ts` and `tokenBudget.ts` are no longer mislabeled "Touches
  authentication/session logic". Genuine auth paths (`auth/`, `login`, `session/`,
  `oauth`, `jwt`) still flag.

### Changed
- Version manifests realigned: `.claude-plugin/marketplace.json` was stuck at
  `0.3.0` while the package and plugin reported `0.6.0`; all three now report
  `0.6.1`.

## [0.6.0] - 2026-06-23

### Added
- **Automatic compaction on a size threshold.** Once active history grows past
  `auto_compact_after_changes` (project config in `index.json`, default 200), a
  capture transparently archives changes older than `auto_compact_older_than_days`
  (default 30) into a `summaries/archive_*.md` file, keeping the newest
  `max_recent_changes` active. Patch files are always preserved. Runs as a
  best-effort step after both manual `capture_change` and `auto_capture_change` —
  a compaction failure never fails the capture itself. Set
  `auto_compact_after_changes` to `0` to disable. Existing projects inherit the
  default without a schema bump. The manual `compact_memory` tool is unchanged.

## [0.5.0] - 2026-06-22

### Added
- **Per-file patch retrieval in `show_change`.** Pass `file: "<substring>"` to load
  only the diff hunk(s) for matching files instead of the whole patch. The server
  splits the stored unified diff on `diff --git` boundaries and returns just the
  matching sections (substring match against the repo-relative path, consistent with
  `list_changes`/`show_change` file fields). A miss lists every file in the patch so
  the agent can correct the query. `file` takes precedence over `includePatch` and is
  much cheaper for large, multi-file changes. No network call; read-only.

## [0.4.0] - 2026-06-22

### Added
- **Opt-in agent-authored summaries.** `capture_change` now accepts optional
  `llmSummary`, `llmRisk` and `llmType`. The host model (Claude Code) writes a
  richer, semantic summary from its own understanding of the diff and passes it
  in as plain text; the server makes **no network call** and holds no API keys,
  so the "no external network calls / no HTTP client" guarantee is unchanged. Any
  omitted field falls back to the offline heuristic. `SKILL.md` teaches the agent
  to enrich **deliberate manual checkpoints** only — auto-capture stays heuristic.

### Changed
- The `Summarizer` interface is now async (`summarize → Promise<SummarizerOutput>`)
  to keep the contract stable for future summarizer backends; `HeuristicSummarizer`
  behavior is unchanged. New `mergeAgentSummary` merges an agent override over the
  heuristic floor: blank/invalid fields are ignored, an `llmType` of `unknown`
  never overwrites a confident classification, and agent risk notes are unioned
  with (never replace) the heuristic risks so automatic security flags can't be
  lost.
- The MCP server now reports its version from `package.json` instead of a
  hardcoded string, so the handshake no longer drifts from the package version.

## [0.3.0] - 2026-06-20

### Added
- **Opt-in patch sharing.** New `set_share_patches` tool and `/memory share on|off|status`
  command commit `patches/` so teammates can load any change's diff. Stored as
  `share_patches` in the committed `index.json`; the managed `.change-memory/.gitignore`
  is regenerated when toggled (a hand-customized file is left untouched). `init_memory`
  also accepts `sharePatches` for setup-time opt-in (`/memory-init share`). Default OFF —
  patches stay machine-local.

### Changed
- **Consolidated slash commands.** The less-frequent commands now live under a single
  `/memory <show|search|compact|auto|share>` dispatcher; `/memory-init`, `/memory-capture`
  and `/memory-session` remain top-level. (`search_changes` and `compact_memory` are now
  reachable from a command, which they weren't before.)

## [0.2.0] - 2026-06-20

### Added
- **Team-shareable Change Memory.** The semantic map (`index.json`,
  `changes.jsonl`, `summaries/`) is now committed with the repo so teammates
  inherit the change history after `git clone`, while heavy/local artifacts
  (`patches/`, `auto-capture.json`, `session.md`) stay on each machine.
- **Author attribution.** Captured changes record the git author
  (`user.name <user.email>`), surfaced in `list_changes`, `show_change`, and the
  session context. `ChangeRecord` schema bumped to v2 (v1 records still read).
- **Auto-capture toggle.** New `set_auto_capture` tool and `/memory-auto on|off|status`
  command let each developer enable or disable automatic capture; the flag lives
  in the local (gitignored) `auto-capture.json`.
- **`.change-memory/.gitignore` written on init**, committing the map and
  ignoring local-only files (idempotent; backfills already-initialized projects).

### Changed
- README documents the Team workflow and updated Privacy/Security wording.
- Skill and examples updated to show author attribution and team sharing.

## [0.1.0]

### Added
- Initial release: compact, local change memory exposed as an MCP server, with
  semantic summaries, compressed patches loaded only on request, slash commands,
  and an agent skill.
