export const CHANGE_TYPES = [
    "feature",
    "fix",
    "refactor",
    "test",
    "docs",
    "chore",
    "unknown",
];
export const DEFAULT_CONSTRAINTS = [
    "Keep AI context compact",
    "Do not include full diffs by default",
    "Load detailed patches only when explicitly needed",
];
// v4 adds the optional `tags[]` field to ChangeRecord; v5 adds the optional
// `enriched` flag for lazy agent enrichment. The bumps are informational —
// reads tolerate older records (fields simply absent), so no migration runs.
export const SCHEMA_VERSION = 5;
export const DEFAULT_MAX_BOOTSTRAP_TOKENS = 700;
export const DEFAULT_MAX_RECENT_CHANGES = 10;
/** Active history is auto-compacted once it grows past this many changes. */
export const DEFAULT_AUTO_COMPACT_AFTER_CHANGES = 200;
/** Auto-compaction archives changes older than this many days. */
export const DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS = 30;
/** Default auto-capture coalescing window (5 minutes). Consecutive auto-captures
 * on the same branch within this window fold into one evolving change. */
export const DEFAULT_COALESCE_WINDOW_MS = 5 * 60 * 1000;
//# sourceMappingURL=types.js.map