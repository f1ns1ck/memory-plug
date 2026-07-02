export type ChangeType =
  | "feature"
  | "fix"
  | "refactor"
  | "test"
  | "docs"
  | "chore"
  | "unknown";

export const CHANGE_TYPES: ChangeType[] = [
  "feature",
  "fix",
  "refactor",
  "test",
  "docs",
  "chore",
  "unknown",
];

export interface MemoryIndex {
  schema_version: number;
  project_name: string;
  created_at: string;
  last_session_at: string;
  active_files: string[];
  recent_change_ids: string[];
  unresolved_items: string[];
  constraints: string[];
  max_bootstrap_tokens: number;
  max_recent_changes: number;
  /** Opt-in: commit `patches/` with the repo so teammates can load any change's
   * diff via show_change. Default/undefined ⇒ patches stay machine-local. */
  share_patches?: boolean;
  /** Auto-compaction trigger: once the active history grows beyond this many
   * changes, a capture transparently archives changes older than
   * `auto_compact_older_than_days`. `undefined` ⇒ the built-in default applies;
   * set to 0 (or negative) to disable auto-compaction for this project. */
  auto_compact_after_changes?: number;
  /** Age cutoff used by auto-compaction. `undefined` ⇒ the built-in default. */
  auto_compact_older_than_days?: number;
  /** Auto-capture coalescing window, in milliseconds. While consecutive
   * auto-captures on the same branch land within this window, they fold into one
   * evolving change (the record is updated in place) instead of appending a new
   * one — so a burst of edits becomes a single record, not many near-duplicates.
   * `undefined` ⇒ the built-in default; set to 0 (or negative) to disable
   * coalescing. Only auto-capture coalesces; manual `capture_change` always
   * appends a deliberate checkpoint. */
  coalesce_window_ms?: number;
}

export interface ChangeRecord {
  id: string;
  timestamp: string;
  /** Who made the change, "Name <email>" from git config. Optional: pre-v2
   * records and repos without a configured git identity omit it. */
  author?: string;
  /** Branch the change was captured on (`git rev-parse --abbrev-ref HEAD`).
   * Optional: pre-v3 records, detached HEAD and unborn branches omit it. */
  branch?: string;
  /** Short HEAD commit at capture time (`git rev-parse --short HEAD`).
   * Optional: pre-v3 records and unborn branches omit it. */
  commit?: string;
  files: string[];
  type: ChangeType;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
  reason: string;
  risk: string[];
  tests: string[];
  /** Optional free-form labels for retrieval (e.g. "auth", "perf", "ui"). The
   * host model may supply these on a deliberate `capture_change`; auto-capture
   * leaves them empty. Schema-compatible: pre-v4 records simply omit the field. */
  tags?: string[];
  /** Whether the summary is agent-authored. `false` marks a heuristic-only
   * record awaiting lazy enrichment — the session snapshot surfaces these so the
   * host model can improve them via `capture_change({ enrichChangeId })`.
   * Absent on pre-v5 records, which are never offered for enrichment. */
  enriched?: boolean;
  patch_file: string;
  token_cost_estimate: number;
}

export const DEFAULT_CONSTRAINTS: string[] = [
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
