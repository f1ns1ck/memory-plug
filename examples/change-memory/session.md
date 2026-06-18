# Session Context

Project: demo-app

This is a compact memory snapshot for Claude Code.
It intentionally excludes full diffs to reduce token usage.

## Recent Changes

- chg_20260112_142500_a1b2c3d4: Feature change: added 1, modified 2 file(s) in src/routes, src/middleware (`src/routes/auth.ts`, `src/middleware/rateLimit.ts`). Reason: added per-IP rate limiting to login route. Full patch stored locally.
- chg_20260112_111200_55ee77aa: Test change: added 1 file(s) in test (`test/auth.test.ts`). Reason: cover token refresh and lockout paths. Full patch stored locally.
- chg_20260111_173045_0df914c2: Feature change: added 1 file(s) in src/db/migrations (`src/db/migrations/0007_add_sessions.sql`). Reason: introduce persistent sessions table. Full patch stored locally.
- chg_20260110_090210_39be4584: Chore change: modified 1 file(s) in root (`.gitignore`). Reason: baseline before auth rework. Full patch stored locally.

## Active Files

- src/server.ts
- src/routes/auth.ts
- src/db/migrations/0007_add_sessions.sql
- src/middleware/rateLimit.ts
- test/auth.test.ts

## Open Issues

- Add rate-limit headers to auth endpoints
- Backfill session expiry for pre-migration rows

## Constraints

- Keep context compact.
- Do not include full diffs by default.
- Load patch details only when needed.

## Available Memory Tools

- show_change(changeId)
- list_changes()
- search_changes(query)
- capture_change()
