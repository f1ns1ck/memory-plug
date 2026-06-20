# Changelog

All notable changes to the Change Memory plugin are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

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
