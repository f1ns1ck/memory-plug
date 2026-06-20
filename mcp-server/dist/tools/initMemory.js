import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { isInitialized, newIndex, writeIndex, readIndex, } from "../core/memoryStore.js";
import { buildSessionMarkdown } from "../core/sessionBuilder.js";
import { invalidInput } from "../utils/errors.js";
/** Always machine-local, regardless of patch sharing. */
const ALWAYS_LOCAL_IGNORE = ["auto-capture.json", "session.md"];
/** Render the managed `.gitignore` body for a given sharing mode. `patches/` is
 * ignored unless the project opts in to sharing them. */
function renderGitignore(sharePatches) {
    const entries = sharePatches
        ? [...ALWAYS_LOCAL_IGNORE]
        : ["patches/", ...ALWAYS_LOCAL_IGNORE];
    return ([
        "# Machine-local Change Memory artifacts — never commit these.",
        "# The shared map (index.json, changes.jsonl, summaries/) IS committed so",
        "# teammates inherit the change history on clone.",
        ...entries,
    ].join("\n") + "\n");
}
/** Write `.change-memory/.gitignore` for the given sharing mode. Idempotent and
 * safe: creates the file when missing, rewrites it when it still matches one of
 * our managed variants (so toggling `share_patches` takes effect), but never
 * clobbers a file a user has customized by hand. */
export async function ensureMemoryGitignore(memoryDir, sharePatches) {
    const file = path.join(memoryDir, ".gitignore");
    const desired = renderGitignore(sharePatches);
    let existing = null;
    try {
        existing = await fs.readFile(file, "utf8");
    }
    catch {
        // not present — fall through to write
    }
    if (existing === null) {
        await fs.writeFile(file, desired, "utf8");
        return;
    }
    if (existing === desired)
        return; // already correct
    const isManaged = existing === renderGitignore(true) || existing === renderGitignore(false);
    if (isManaged) {
        await fs.writeFile(file, desired, "utf8"); // safe to retune our own file
    }
    // otherwise: user-customized — leave it untouched
}
export async function initMemory(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    // Confirm the root actually exists and is a directory.
    let stat;
    try {
        stat = await fs.stat(projectRoot);
    }
    catch {
        throw invalidInput(`Project path does not exist: ${projectRoot}`);
    }
    if (!stat.isDirectory()) {
        throw invalidInput(`Project path is not a directory: ${projectRoot}`);
    }
    const paths = memoryPaths(projectRoot);
    if (await isInitialized(paths)) {
        const index = await readIndex(paths);
        // Apply a sharing toggle if one was passed, otherwise keep the stored value.
        if (input.sharePatches !== undefined && input.sharePatches !== index.share_patches) {
            index.share_patches = input.sharePatches;
            await writeIndex(paths, index);
        }
        const share = index.share_patches ?? false;
        // Backfill / retune the gitignore for the current sharing mode.
        await ensureMemoryGitignore(paths.memoryDir, share);
        return [
            `Memory already initialized at ${paths.memoryDir}.`,
            `Project: ${index.project_name}`,
            `Patch sharing: ${share ? "ON (patches/ committed)" : "OFF (patches/ local-only)"}.`,
            `Use capture_change to record work or get_session_context to load the snapshot.`,
        ].join("\n");
    }
    const projectName = input.projectName?.trim() || path.basename(projectRoot) || "project";
    const now = new Date().toISOString();
    const sharePatches = input.sharePatches ?? false;
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.patchesDir, { recursive: true });
    await fs.mkdir(paths.summariesDir, { recursive: true });
    await ensureMemoryGitignore(paths.memoryDir, sharePatches);
    const index = newIndex(projectName, now);
    index.share_patches = sharePatches;
    await writeIndex(paths, index);
    await fs.writeFile(paths.changesFile, "", "utf8");
    const sessionMd = buildSessionMarkdown({ index, recent: [], maxTokens: index.max_bootstrap_tokens });
    await fs.writeFile(paths.sessionFile, sessionMd, "utf8");
    return [
        `Initialized Change Memory at ${paths.memoryDir}`,
        `Project: ${projectName}`,
        `Created: index.json, changes.jsonl, session.md, patches/, summaries/, .gitignore`,
        `Shared (commit these): index.json, changes.jsonl, summaries/${sharePatches ? ", patches/" : ""}`,
        `Local-only (gitignored): ${sharePatches ? "" : "patches/, "}auto-capture.json, session.md`,
        `Patch sharing: ${sharePatches ? "ON" : "OFF"} (re-run init_memory with sharePatches to toggle).`,
        ``,
        `Next: make code changes, then run capture_change (or /memory-capture).`,
    ].join("\n");
}
//# sourceMappingURL=initMemory.js.map