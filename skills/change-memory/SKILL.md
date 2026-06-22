---
name: change-memory
description: Use this skill when working in a codebase where compact memory of prior changes is needed across Claude Code sessions. It records semantic summaries of git diffs, stores compressed patches locally, and retrieves concise session context without loading full history.
---

# Change Memory

Use this skill to preserve compact project memory across Claude Code sessions.

## When to use

Use this skill when the user asks to:
- continue from a previous coding session;
- remember what was changed;
- avoid repeating earlier fixes;
- capture current work;
- summarize recent project changes;
- inspect a specific previous change;
- reduce token usage while preserving project context.

## Core rule

Always load compact context first. Do not load full patches unless the user asks
or the task requires exact diff details. Rely on the auto-capture hook to record
changes; reserve manual `capture_change` for explicit checkpoints (see below).

## Workflow

1. Start with `get_session_context`.
2. Use `list_changes` to inspect recent work.
3. Use `search_changes` to find relevant historical changes.
4. Use `show_change` with `includePatch: false` first.
5. Use `show_change` with `includePatch: true` only when exact patch details are required.

## Capturing changes

Capture is **automatic**. A `PostToolUse` hook calls `auto_capture_change` after
`Write`/`Edit`/`MultiEdit`, with built-in debounce and dedupe. So:

- **Do not** call `capture_change` reflexively after every edit — the hook already
  records changes, and a manual call would create a duplicate snapshot of the same
  diff.
- Call `capture_change` **only** when:
  - the user explicitly asks to save progress / checkpoint, **or**
  - you want a deliberate **named snapshot** with a specific `reason`
    (e.g. a milestone, before a risky refactor).
- If you just triggered the auto-capture hook and the diff hasn't changed, calling
  `capture_change` again is redundant — skip it.
- At the start of a new session, still load `get_session_context` first.

## PR summaries

Each change records the `branch` and short `commit` it was captured on. To help a
reviewer (or to draft a pull-request description), call `summarize_branch` — it
returns PR-ready markdown grouped by change type, with the touched files, risks and
tests aggregated across the branch. Defaults to the current branch; pass `branch`
to target another. Use `list_changes({ branch })` to filter the raw table by branch.

## Team sharing

The memory **map** is meant to be committed so teammates inherit the change
history. `init_memory` writes a `.change-memory/.gitignore` that commits
`index.json`, `changes.jsonl` and `summaries/` while ignoring the machine-local
artifacts (`patches/`, `auto-capture.json`, `session.md`). Each change records its
`author` (from `git config`), so `list_changes` / `show_change` tell the next
coder *who* did what. On a fresh clone, just run `get_session_context` — it
rebuilds the snapshot from the committed map.

By default `patches/` stay machine-local, so a teammate can read any change's
metadata but `show_change` with `includePatch: true` only works for changes
captured on their own machine. To share patches too, use `set_share_patches`
(`/memory share on|off|status`, or `init_memory` with `sharePatches: true` at
setup): `patches/` are committed and the managed `.gitignore` is regenerated. The
flag is stored as `share_patches` in the committed `index.json` (a team-wide
decision, unlike the per-machine auto-capture toggle); pass `enabled: false` to
revert. This adds compressed patch blobs to git, so leave it OFF unless the team
wants full diffs to travel.

## Toggling auto-capture

Auto-capture can be turned off per-developer with `set_auto_capture`
(`/memory auto on|off|status`). The toggle lives in the local, gitignored
`auto-capture.json`, so it never affects teammates. When off, only manual
`capture_change` records changes.

## Setup

If `get_session_context` reports the memory is not initialized, call `init_memory`
once (or tell the user to run `/memory-init`). All tools accept an optional
`projectPath`; omit it to use the project Claude Code is running in.

## Token discipline

Never paste all history into the conversation.
Prefer summaries, IDs, active files, risks, and unresolved items.
The session snapshot intentionally excludes full diffs — keep it that way.
