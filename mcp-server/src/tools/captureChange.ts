import { promises as fs } from "node:fs";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import {
  ensureInitialized,
  readIndex,
  writeIndex,
  appendChange,
  replaceChange,
  readChanges,
  recentChanges,
} from "../core/memoryStore.js";
import { ChangeRecord, ChangeType } from "../core/types.js";
import { isGitRepo, getAuthor, getBranch, getHeadCommit } from "../core/git.js";
import {
  buildWorkingTreeDiff,
  fingerprintDiff,
  WorkingTreeDiff,
} from "../core/workingTree.js";
import { generateChangeId } from "../utils/ids.js";
import { savePatch } from "../core/patchStore.js";
import { defaultSummarizer, mergeAgentSummary } from "../core/summarizer.js";
import { estimateTokens } from "../core/tokenBudget.js";
import { buildSessionMarkdown } from "../core/sessionBuilder.js";
import { maybeAutoCompact } from "./compactMemory.js";
import { MemoryError } from "../utils/errors.js";

export interface CaptureChangeInput {
  projectPath?: string;
  changeType?: ChangeType;
  reason?: string;
  tests?: string[];
  unresolvedItems?: string[];
  /**
   * Optional agent-authored summary. The host model (Claude Code) writes these
   * from its own understanding of the diff — the server makes no LLM/network
   * call and holds no keys. Any omitted field falls back to the offline
   * heuristic, so a partial override is safe. Reserved for deliberate, manual
   * checkpoints; auto-capture never supplies them and stays heuristic.
   */
  llmSummary?: string;
  llmRisk?: string[];
  llmType?: ChangeType;
  /** Optional free-form labels for retrieval. Trimmed, lower-cased, de-duped and
   * capped; an empty result is stored as no field at all (schema-light). */
  tags?: string[];
}

/** Internal capture options not exposed on the MCP tool surface. */
export interface RunCaptureOptions {
  /**
   * When set and the change still exists, update that record in place (keep its
   * id, overwrite its patch/summary/files/timestamp) instead of appending a new
   * one. Used by auto-capture coalescing to fold a burst of edits into one
   * evolving change. Falls back to a normal append if the id is gone.
   */
  replaceChangeId?: string;
}

export interface CaptureResult {
  captured: boolean;
  message: string;
  changeId?: string;
  /** True when an existing record was updated in place (coalesced). */
  coalesced?: boolean;
  /** Fingerprint of the captured working-tree diff (only when captured). */
  fingerprint?: string;
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

/** Normalize agent-supplied tags: trim, lower-case, drop blanks, de-dupe, cap. */
function sanitizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= 12) break;
  }
  return out;
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
  opts?: RunCaptureOptions,
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

  // Coalesce target: reuse the existing record's id (and patch slot) only if it
  // still exists. Otherwise generate a fresh id and append as usual.
  let id: string;
  let coalesced = false;
  if (opts?.replaceChangeId) {
    const existing = await readChanges(paths);
    if (existing.some((c) => c.id === opts.replaceChangeId)) {
      id = opts.replaceChangeId;
      coalesced = true;
    } else {
      id = generateChangeId(diff);
    }
  } else {
    id = generateChangeId(diff);
  }

  const timestamp = new Date().toISOString();
  const author = await getAuthor(projectRoot);
  const branch = await getBranch(projectRoot);
  const commit = await getHeadCommit(projectRoot);

  // Store the full diff compressed; it stays out of the model context.
  const patchRel = await savePatch(paths.patchesDir, id, diff);

  // Heuristic output is the floor — always computed offline, never fails. An
  // optional agent-authored summary (host model, no network) is merged on top.
  const base = await defaultSummarizer.summarize({
    files,
    nameStatus,
    diff,
    reason: input.reason,
    changeTypeHint: input.changeType,
  });
  const summary = mergeAgentSummary(base, {
    summary: input.llmSummary,
    risk: input.llmRisk,
    type: input.llmType,
  });
  const tags = sanitizeTags(input.tags);

  const record: ChangeRecord = {
    id,
    timestamp,
    ...(author ? { author } : {}),
    ...(branch ? { branch } : {}),
    ...(commit ? { commit } : {}),
    files,
    type: summary.type,
    summary: summary.summary,
    added: summary.added,
    modified: summary.modified,
    removed: summary.removed,
    reason: input.reason?.trim() ?? "",
    risk: summary.risk,
    tests: input.tests ?? [],
    ...(tags.length ? { tags } : {}),
    patch_file: patchRel,
    token_cost_estimate: estimateTokens(diff),
  };

  // Coalesce updates the record in place; otherwise append. If the target id
  // vanished between the existence check and now, fall back to append.
  if (coalesced) {
    const replaced = await replaceChange(paths, record);
    if (!replaced) await appendChange(paths, record);
  } else {
    await appendChange(paths, record);
  }

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

  // Auto-compaction runs once active history grows past the configured
  // threshold. It is best-effort: a failure here must never fail the capture
  // that already succeeded and was persisted above.
  let compactNote = "";
  try {
    const compacted = await maybeAutoCompact(paths);
    if (compacted && compacted.archived > 0) {
      compactNote = `\nAuto-compacted ${compacted.archived} old change(s) → ${compacted.archiveFile}`;
    }
  } catch {
    // Swallow — compaction is an optimization, not part of the capture contract.
  }

  const message = [
    `${coalesced ? "Updated change" : "Captured change"} ${id}`,
    `Type: ${record.type}`,
    `Files: ${files.length} (${record.added.length} added, ${record.modified.length} modified, ${record.removed.length} removed)`,
    record.risk.length ? `Risk: ${record.risk.join(" | ")}` : `Risk: none flagged`,
    `Patch: ${patchRel} (compressed, ~${record.token_cost_estimate} tokens uncompressed)`,
    compactNote ? compactNote.trimStart() : null,
    ``,
    `Summary: ${record.summary}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { captured: true, message, changeId: id, coalesced, fingerprint: fingerprintDiff(diff) };
}

/** MCP `capture_change` tool — unchanged external behavior. */
export async function captureChange(input: CaptureChangeInput): Promise<string> {
  const result = await runCapture(input);
  return result.message;
}
