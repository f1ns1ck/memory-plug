import { promises as fs } from "node:fs";
import {
  ChangeRecord,
  MemoryIndex,
  SCHEMA_VERSION,
  DEFAULT_CONSTRAINTS,
  DEFAULT_MAX_BOOTSTRAP_TOKENS,
  DEFAULT_MAX_RECENT_CHANGES,
} from "./types.js";
import { MemoryPaths } from "../utils/paths.js";
import { notInitialized } from "../utils/errors.js";

/** True when `.change-memory/index.json` exists. */
export async function isInitialized(paths: MemoryPaths): Promise<boolean> {
  try {
    await fs.access(paths.indexFile);
    return true;
  } catch {
    return false;
  }
}

export async function ensureInitialized(paths: MemoryPaths): Promise<void> {
  if (!(await isInitialized(paths))) {
    throw notInitialized(paths.memoryDir);
  }
}

export function newIndex(projectName: string, now: string): MemoryIndex {
  return {
    schema_version: SCHEMA_VERSION,
    project_name: projectName,
    created_at: now,
    last_session_at: now,
    active_files: [],
    recent_change_ids: [],
    unresolved_items: [],
    constraints: [...DEFAULT_CONSTRAINTS],
    max_bootstrap_tokens: DEFAULT_MAX_BOOTSTRAP_TOKENS,
    max_recent_changes: DEFAULT_MAX_RECENT_CHANGES,
    share_patches: false,
  };
}

export async function readIndex(paths: MemoryPaths): Promise<MemoryIndex> {
  const raw = await fs.readFile(paths.indexFile, "utf8");
  return JSON.parse(raw) as MemoryIndex;
}

export async function writeIndex(
  paths: MemoryPaths,
  index: MemoryIndex,
): Promise<void> {
  await fs.writeFile(paths.indexFile, JSON.stringify(index, null, 2) + "\n", "utf8");
}

/** Append one change as a single JSONL line. */
export async function appendChange(
  paths: MemoryPaths,
  change: ChangeRecord,
): Promise<void> {
  await fs.appendFile(paths.changesFile, JSON.stringify(change) + "\n", "utf8");
}

/** Read all changes (oldest first). Tolerates blank/corrupt lines. */
export async function readChanges(paths: MemoryPaths): Promise<ChangeRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(paths.changesFile, "utf8");
  } catch {
    return [];
  }
  const out: ChangeRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ChangeRecord);
    } catch {
      // Skip unparseable lines rather than failing the whole read.
    }
  }
  return out;
}

/** Overwrite changes.jsonl with the given records (used by compaction). */
export async function writeChanges(
  paths: MemoryPaths,
  changes: ChangeRecord[],
): Promise<void> {
  const body = changes.map((c) => JSON.stringify(c)).join("\n");
  await fs.writeFile(paths.changesFile, body.length ? body + "\n" : "", "utf8");
}

/** Most recent `limit` changes (newest first). */
export async function recentChanges(
  paths: MemoryPaths,
  limit: number,
): Promise<ChangeRecord[]> {
  const all = await readChanges(paths);
  return all.slice(-limit).reverse();
}

export function findChange(
  changes: ChangeRecord[],
  changeId: string,
): ChangeRecord | undefined {
  return changes.find((c) => c.id === changeId);
}

export const indexDefaults = {
  SCHEMA_VERSION,
  DEFAULT_MAX_BOOTSTRAP_TOKENS,
  DEFAULT_MAX_RECENT_CHANGES,
};
