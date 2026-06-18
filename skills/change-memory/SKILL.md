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
or the task requires exact diff details.

## Workflow

1. Start with `get_session_context`.
2. Use `list_changes` to inspect recent work.
3. Use `search_changes` to find relevant historical changes.
4. Use `show_change` with `includePatch: false` first.
5. Use `show_change` with `includePatch: true` only when exact patch details are required.
6. Use `capture_change` after meaningful code changes or when the user asks to save progress.

## Setup

If `get_session_context` reports the memory is not initialized, call `init_memory`
once (or tell the user to run `/memory-init`). All tools accept an optional
`projectPath`; omit it to use the project Claude Code is running in.

## Token discipline

Never paste all history into the conversation.
Prefer summaries, IDs, active files, risks, and unresolved items.
The session snapshot intentionally excludes full diffs — keep it that way.
