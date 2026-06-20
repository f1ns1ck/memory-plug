# Changelog

All notable changes to the Change Memory plugin are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

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
