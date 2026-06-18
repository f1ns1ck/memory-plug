import { promises as fs } from "node:fs";
import { resolveProjectRoot, memoryPaths, toPosix, ensureInsideRoot, } from "../utils/paths.js";
import { ensureInitialized, readIndex, writeIndex, appendChange, recentChanges, } from "../core/memoryStore.js";
import { isGitRepo, getDiff, getChangedFiles, getNameStatus, getUntrackedFiles, } from "../core/git.js";
import { generateChangeId } from "../utils/ids.js";
import { savePatch } from "../core/patchStore.js";
import { defaultSummarizer } from "../core/summarizer.js";
import { estimateTokens } from "../core/tokenBudget.js";
import { buildSessionMarkdown } from "../core/sessionBuilder.js";
import { MemoryError } from "../utils/errors.js";
function uniq(list) {
    return [...new Set(list)];
}
const MAX_UNTRACKED_BYTES = 256 * 1024;
/**
 * Build a synthetic "new file" diff block for an untracked file so its content
 * is preserved in the stored patch. Reads are confined to the project root and
 * capped in size. Binary-ish content is skipped (header only).
 */
async function untrackedDiffBlock(projectRoot, relFile) {
    const header = `diff --git a/${relFile} b/${relFile}\nnew file (untracked)\n--- /dev/null\n+++ b/${relFile}`;
    try {
        const abs = ensureInsideRoot(projectRoot, relFile);
        const stat = await fs.stat(abs);
        if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) {
            return `${header}\n@@ untracked file omitted (too large or not a regular file: ${stat.size} bytes) @@\n`;
        }
        const buf = await fs.readFile(abs);
        if (buf.includes(0)) {
            return `${header}\n@@ binary file omitted @@\n`;
        }
        const body = buf
            .toString("utf8")
            .split("\n")
            .map((l) => `+${l}`)
            .join("\n");
        return `${header}\n${body}\n`;
    }
    catch {
        return `${header}\n@@ could not read untracked file @@\n`;
    }
}
export async function captureChange(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    if (!(await isGitRepo(projectRoot))) {
        throw new MemoryError("NOT_A_GIT_REPO", `Not a git repository: ${projectRoot}. capture_change reads 'git diff'.`);
    }
    const trackedDiff = await getDiff(projectRoot);
    const untracked = (await getUntrackedFiles(projectRoot)).map(toPosix);
    if (!trackedDiff.trim() && untracked.length === 0) {
        return "No changes to capture (no tracked changes and no untracked files).";
    }
    // Compose the full patch: tracked diff + synthetic blocks for untracked files.
    let diff = trackedDiff;
    for (const f of untracked) {
        const block = await untrackedDiffBlock(projectRoot, f);
        diff += (diff.endsWith("\n") || diff === "" ? "" : "\n") + block;
    }
    const trackedFiles = (await getChangedFiles(projectRoot)).map(toPosix);
    const files = uniq([...trackedFiles, ...untracked]);
    const nameStatus = [
        ...(await getNameStatus(projectRoot)).map((e) => ({
            status: e.status,
            file: toPosix(e.file),
        })),
        ...untracked.map((file) => ({ status: "A", file })),
    ];
    const id = generateChangeId(diff);
    const timestamp = new Date().toISOString();
    // Store the full diff compressed; it stays out of the model context.
    const patchRel = await savePatch(paths.patchesDir, id, diff);
    const summary = defaultSummarizer.summarize({
        files,
        nameStatus,
        diff,
        reason: input.reason,
        changeTypeHint: input.changeType,
    });
    const record = {
        id,
        timestamp,
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
    index.recent_change_ids = uniq([id, ...index.recent_change_ids]).slice(0, index.max_recent_changes);
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
    return [
        `Captured change ${id}`,
        `Type: ${record.type}`,
        `Files: ${files.length} (${record.added.length} added, ${record.modified.length} modified, ${record.removed.length} removed)`,
        record.risk.length ? `Risk: ${record.risk.join(" | ")}` : `Risk: none flagged`,
        `Patch: ${patchRel} (compressed, ~${record.token_cost_estimate} tokens uncompressed)`,
        ``,
        `Summary: ${record.summary}`,
    ].join("\n");
}
//# sourceMappingURL=captureChange.js.map