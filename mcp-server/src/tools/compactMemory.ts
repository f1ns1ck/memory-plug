import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths, MemoryPaths } from "../utils/paths.js";
import {
  ensureInitialized,
  readChanges,
  writeChanges,
  readIndex,
  writeIndex,
} from "../core/memoryStore.js";
import {
  ChangeRecord,
  DEFAULT_AUTO_COMPACT_AFTER_CHANGES,
  DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS,
} from "../core/types.js";
import { ensureInsideRoot } from "../utils/paths.js";

export interface CompactMemoryInput {
  projectPath?: string;
  olderThanDays?: number;
  keepRecent?: number;
}

export interface CompactResult {
  /** Number of changes moved into the archive summary. 0 ⇒ nothing compacted. */
  archived: number;
  /** Changes remaining in active history afterwards. */
  remaining: number;
  /** Project-relative path of the archive summary, when one was written. */
  archiveFile?: string;
  /** Human-readable outcome (also used as the tool's text response). */
  message: string;
}

function isOlderThan(timestamp: string, days: number): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t < cutoff;
}

function renderArchive(changes: ChangeRecord[]): string {
  const lines = [
    `# Archived changes`,
    ``,
    `Generated at ${new Date().toISOString()}.`,
    `These ${changes.length} change(s) were compacted out of the active history.`,
    `Patch files are NOT deleted — they remain under .change-memory/patches/.`,
    ``,
  ];
  for (const c of changes) {
    lines.push(
      `- ${c.id} | ${c.type} | ${c.timestamp}`,
      `  - ${c.summary}`,
      `  - files: ${c.files.join(", ") || "(none)"}`,
      c.risk.length ? `  - risk: ${c.risk.join(" | ")}` : `  - risk: (none)`,
      `  - patch: ${c.patch_file}`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Core compaction routine shared by the `compact_memory` tool and the automatic
 * size-threshold trigger. Archives changes that are both outside the keepRecent
 * window and older than `olderThanDays`, preserving every patch file. Assumes
 * memory is already initialized (callers guarantee it).
 */
export async function runCompact(
  paths: MemoryPaths,
  opts: { olderThanDays?: number; keepRecent?: number } = {},
): Promise<CompactResult> {
  const index = await readIndex(paths);
  const keepRecent =
    opts.keepRecent && opts.keepRecent > 0 ? opts.keepRecent : index.max_recent_changes;
  const olderThanDays =
    opts.olderThanDays && opts.olderThanDays > 0
      ? opts.olderThanDays
      : DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS;

  const all = await readChanges(paths); // oldest first
  if (all.length <= keepRecent) {
    return {
      archived: 0,
      remaining: all.length,
      message: `Nothing to compact: ${all.length} change(s) <= keepRecent (${keepRecent}).`,
    };
  }

  // Candidates for archiving: outside the keepRecent window AND old enough.
  const archivable = all.slice(0, all.length - keepRecent);
  const toArchive = archivable.filter((c) => isOlderThan(c.timestamp, olderThanDays));
  if (!toArchive.length) {
    return {
      archived: 0,
      remaining: all.length,
      message: `Nothing to compact: no changes older than ${olderThanDays} day(s) outside the keepRecent window.`,
    };
  }

  const archiveIds = new Set(toArchive.map((c) => c.id));
  const remaining = all.filter((c) => !archiveIds.has(c.id));

  // Write an archive summary file (patches are preserved).
  const fileName = `archive_${Date.now()}.md`;
  const archivePath = ensureInsideRoot(paths.summariesDir, fileName);
  await fs.writeFile(archivePath, renderArchive(toArchive), "utf8");

  await writeChanges(paths, remaining);

  // Refresh index recent ids to the surviving newest changes.
  index.recent_change_ids = remaining
    .slice(-index.max_recent_changes)
    .reverse()
    .map((c) => c.id);
  await writeIndex(paths, index);

  const archiveFile = path.join(".change-memory", "summaries", fileName);
  return {
    archived: toArchive.length,
    remaining: remaining.length,
    archiveFile,
    message: [
      `Compacted ${toArchive.length} change(s) older than ${olderThanDays} day(s).`,
      `Kept ${remaining.length} change(s) in active history.`,
      `Archive summary: ${archiveFile}`,
      `Patch files were preserved (not deleted).`,
    ].join("\n"),
  };
}

/**
 * Automatic compaction, run after a capture. Triggers only once the active
 * history grows past `auto_compact_after_changes` (project config, with a
 * built-in default). Set that field to 0 to disable. Designed to be called
 * softly — callers should swallow errors so compaction never fails a capture.
 *
 * Returns the CompactResult when it ran, or null when the trigger did not fire
 * (disabled or below threshold).
 */
export async function maybeAutoCompact(paths: MemoryPaths): Promise<CompactResult | null> {
  const index = await readIndex(paths);
  const threshold =
    index.auto_compact_after_changes ?? DEFAULT_AUTO_COMPACT_AFTER_CHANGES;
  if (threshold <= 0) return null; // explicitly disabled

  const count = (await readChanges(paths)).length;
  if (count <= threshold) return null;

  return runCompact(paths, { olderThanDays: index.auto_compact_older_than_days });
}

export async function compactMemory(input: CompactMemoryInput): Promise<string> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  const result = await runCompact(paths, {
    olderThanDays: input.olderThanDays,
    keepRecent: input.keepRecent,
  });
  return result.message;
}
