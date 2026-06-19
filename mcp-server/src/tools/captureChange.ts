import { promises as fs } from "node:fs";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import {
  ensureInitialized,
  readIndex,
  writeIndex,
  appendChange,
  recentChanges,
} from "../core/memoryStore.js";
import { ChangeRecord, ChangeType } from "../core/types.js";
import { isGitRepo, getAuthor } from "../core/git.js";
import {
  buildWorkingTreeDiff,
  fingerprintDiff,
  WorkingTreeDiff,
} from "../core/workingTree.js";
import { generateChangeId } from "../utils/ids.js";
import { savePatch } from "../core/patchStore.js";
import { defaultSummarizer } from "../core/summarizer.js";
import { estimateTokens } from "../core/tokenBudget.js";
import { buildSessionMarkdown } from "../core/sessionBuilder.js";
import { MemoryError } from "../utils/errors.js";

export interface CaptureChangeInput {
  projectPath?: string;
  changeType?: ChangeType;
  reason?: string;
  tests?: string[];
  unresolvedItems?: string[];
}

export interface CaptureResult {
  captured: boolean;
  message: string;
  changeId?: string;
  /** Fingerprint of the captured working-tree diff (only when captured). */
  fingerprint?: string;
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

/**
 * Core capture routine shared by the `capture_change` tool and
 * `auto_capture_change`. Stores a compressed patch, writes a change record,
 * updates the index and rebuilds the session snapshot.
 *
 * Pass `pre` to reuse an already-computed working-tree diff (avoids a second
 * git read and keeps the auto-capture fingerprint consistent with what is
 * stored). Behavior is identical whether or not `pre` is supplied.
 */
export async function runCapture(
  input: CaptureChangeInput,
  pre?: WorkingTreeDiff,
): Promise<CaptureResult> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  if (!(await isGitRepo(projectRoot))) {
    throw new MemoryError(
      "NOT_A_GIT_REPO",
      `Not a git repository: ${projectRoot}. capture_change reads 'git diff'.`,
    );
  }

  const wt = pre ?? (await buildWorkingTreeDiff(projectRoot));
  if (wt.isEmpty) {
    return {
      captured: false,
      message: "No changes to capture (no tracked changes and no untracked files).",
    };
  }

  const { diff, files, nameStatus } = wt;
  const id = generateChangeId(diff);
  const timestamp = new Date().toISOString();
  const author = await getAuthor(projectRoot);

  // Store the full diff compressed; it stays out of the model context.
  const patchRel = await savePatch(paths.patchesDir, id, diff);

  const summary = defaultSummarizer.summarize({
    files,
    nameStatus,
    diff,
    reason: input.reason,
    changeTypeHint: input.changeType,
  });

  const record: ChangeRecord = {
    id,
    timestamp,
    ...(author ? { author } : {}),
    files,
    type: summary.type,
    summary: summary.summary,
    added: summary.added,
    modified: summary.modified,
    removed: summary.removed,
    reason: input.reason?.trim() ?? "",
    risk: summary.risk,
    tests: input.tests ?? [],
    patch_file: patchRel,
    token_cost_estimate: estimateTokens(diff),
  };

  await appendChange(paths, record);

  // Update the index: recent ids, active files, unresolved items, timestamp.
  const index = await readIndex(paths);
  index.last_session_at = timestamp;
  index.recent_change_ids = uniq([id, ...index.recent_change_ids]).slice(
    0,
    index.max_recent_changes,
  );
  index.active_files = uniq([...files, ...index.active_files]).slice(0, 20);
  if (input.unresolvedItems?.length) {
    index.unresolved_items = uniq([
      ...input.unresolvedItems.map((s) => s.trim()).filter(Boolean),
      ...index.unresolved_items,
    ]);
  }
  await writeIndex(paths, index);

  // Rebuild the on-disk compact session snapshot.
  const recent = await recentChanges(paths, index.max_recent_changes);
  const sessionMd = buildSessionMarkdown({
    index,
    recent,
    maxTokens: index.max_bootstrap_tokens,
  });
  await fs.writeFile(paths.sessionFile, sessionMd, "utf8");

  const message = [
    `Captured change ${id}`,
    `Type: ${record.type}`,
    `Files: ${files.length} (${record.added.length} added, ${record.modified.length} modified, ${record.removed.length} removed)`,
    record.risk.length ? `Risk: ${record.risk.join(" | ")}` : `Risk: none flagged`,
    `Patch: ${patchRel} (compressed, ~${record.token_cost_estimate} tokens uncompressed)`,
    ``,
    `Summary: ${record.summary}`,
  ].join("\n");

  return { captured: true, message, changeId: id, fingerprint: fingerprintDiff(diff) };
}

/** MCP `capture_change` tool — unchanged external behavior. */
export async function captureChange(input: CaptureChangeInput): Promise<string> {
  const result = await runCapture(input);
  return result.message;
}
