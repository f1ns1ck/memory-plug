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
//# sourceMappingURL=patchStore.js.map