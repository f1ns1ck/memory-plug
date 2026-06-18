import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { ensureInsideRoot, toPosix } from "../utils/paths.js";
import { getDiff, getChangedFiles, getNameStatus, getUntrackedFiles, } from "./git.js";
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
/**
 * Compose the current working-tree change set: the tracked `git diff` plus
 * synthetic blocks for untracked files (whose content `git diff` omits).
 * Read-only — never mutates the repository.
 */
export async function buildWorkingTreeDiff(projectRoot) {
    const trackedDiff = await getDiff(projectRoot);
    const untracked = (await getUntrackedFiles(projectRoot)).map(toPosix);
    const isEmpty = !trackedDiff.trim() && untracked.length === 0;
    let diff = trackedDiff;
    for (const f of untracked) {
        const block = await untrackedDiffBlock(projectRoot, f);
        diff += (diff.endsWith("\n") || diff === "" ? "" : "\n") + block;
    }
    const trackedFiles = (await getChangedFiles(projectRoot)).map(toPosix);
    const files = [...new Set([...trackedFiles, ...untracked])];
    const nameStatus = [
        ...(await getNameStatus(projectRoot)).map((e) => ({
            status: e.status,
            file: toPosix(e.file),
        })),
        ...untracked.map((file) => ({ status: "A", file })),
    ];
    return { diff, files, nameStatus, untracked, isEmpty };
}
/**
 * Stable fingerprint of a composed working-tree diff. Used by auto-capture to
 * dedupe identical change sets. Because the diff already embeds untracked file
 * content, the fingerprint reflects content changes, not just file names.
 */
export function fingerprintDiff(diff) {
    return crypto.createHash("sha1").update(diff).digest("hex");
}
//# sourceMappingURL=workingTree.js.map