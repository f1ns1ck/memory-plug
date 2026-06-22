import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { ensureInsideRoot, toPosix } from "../utils/paths.js";
import { notFound } from "../utils/errors.js";
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
/**
 * Patches are stored gzip-compressed inside `.change-memory/patches/`. We never let
 * a patch path escape that directory.
 */
export function patchFileName(changeId) {
    return `${changeId}.patch.gz`;
}
/** Project-relative path stored in the change record. Always POSIX-style. */
export function patchRelativePath(changeId) {
    return toPosix(path.join(".change-memory", "patches", patchFileName(changeId)));
}
export async function savePatch(patchesDir, changeId, diff) {
    const target = ensureInsideRoot(patchesDir, patchFileName(changeId));
    const compressed = await gzip(Buffer.from(diff, "utf8"));
    await fs.writeFile(target, compressed);
    return patchRelativePath(changeId);
}
export async function readPatch(projectRoot, patchRelPath) {
    const target = ensureInsideRoot(projectRoot, patchRelPath);
    let buf;
    try {
        buf = await fs.readFile(target);
    }
    catch {
        throw notFound(`Patch file not found: ${patchRelPath}`);
    }
    const out = await gunzip(buf);
    return out.toString("utf8");
}
/** Return the first `maxLines` lines of a patch, plus a truncation flag. */
export function truncatePatch(patch, maxLines) {
    const lines = patch.split("\n");
    if (lines.length <= maxLines) {
        return { text: patch, truncated: false, totalLines: lines.length };
    }
    return {
        text: lines.slice(0, maxLines).join("\n"),
        truncated: true,
        totalLines: lines.length,
    };
}
/**
 * Split a unified diff into per-file sections, keyed by the file's repo-relative
 * path (the `b/` side, falling back to the `a/` side for deletions). Each section
 * starts at its `diff --git` header and runs until the next one. Anything before
 * the first header (rare) is ignored.
 */
function splitPatchByFile(patch) {
    const sections = new Map();
    const lines = patch.split("\n");
    let currentPath = null;
    let buffer = [];
    const flush = () => {
        if (currentPath !== null) {
            sections.set(currentPath, buffer.join("\n"));
        }
    };
    for (const line of lines) {
        const header = parseDiffHeader(line);
        if (header) {
            flush();
            currentPath = header;
            buffer = [line];
        }
        else if (currentPath !== null) {
            buffer.push(line);
        }
    }
    flush();
    return sections;
}
/** Extract the repo-relative path from a `diff --git a/x b/y` line, or null. */
function parseDiffHeader(line) {
    if (!line.startsWith("diff --git "))
        return null;
    // Format: diff --git a/<old> b/<new>. Paths may contain spaces, but git quotes
    // those; for the common unquoted case we split on " b/" to recover the new path.
    const rest = line.slice("diff --git ".length);
    const sep = rest.indexOf(" b/");
    if (sep !== -1) {
        return rest.slice(sep + 3).trim();
    }
    // Fallback: strip a leading "a/" from the whole remainder.
    return rest.replace(/^a\//, "").trim();
}
/**
 * Return the diff section(s) for files whose path contains `fileQuery`
 * (case-sensitive substring, matching `list_changes`/`show_change` file fields).
 * `available` always lists every file in the patch so callers can guide the user
 * on a miss.
 */
export function extractFilePatch(patch, fileQuery) {
    const sections = splitPatchByFile(patch);
    const available = [...sections.keys()];
    const matched = [];
    const parts = [];
    for (const [filePath, section] of sections) {
        if (filePath.includes(fileQuery)) {
            matched.push(filePath);
            parts.push(section);
        }
    }
    return { text: parts.join("\n"), matched, available };
}
//# sourceMappingURL=patchStore.js.map