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
}

export interface ChangeRecord {
  id: string;
  timestamp: string;
  /** Who made the change, "Name <email>" from git config. Optional: pre-v2
   * records and repos without a configured git identity omit it. */
  author?: string;
  files: string[];
  type: ChangeType;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
  reason: string;
  risk: string[];
  tests: string[];
  patch_file: string;
  token_cost_estimate: number;
}

export const DEFAULT_CONSTRAINTS: string[] = [
  "Keep AI context compact",
  "Do not include full diffs by default",
  "Load detailed patches only when explicitly needed",
];

export const SCHEMA_VERSION = 2;
export const DEFAULT_MAX_BOOTSTRAP_TOKENS = 700;
export const DEFAULT_MAX_RECENT_CHANGES = 10;
