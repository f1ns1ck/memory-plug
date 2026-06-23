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
export const SCHEMA_VERSION = 3;
export const DEFAULT_MAX_BOOTSTRAP_TOKENS = 700;
export const DEFAULT_MAX_RECENT_CHANGES = 10;
/** Active history is auto-compacted once it grows past this many changes. */
export const DEFAULT_AUTO_COMPACT_AFTER_CHANGES = 200;
/** Auto-compaction archives changes older than this many days. */
export const DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS = 30;
//# sourceMappingURL=types.js.map