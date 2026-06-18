import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { isInitialized, newIndex, writeIndex, readIndex, } from "../core/memoryStore.js";
import { buildSessionMarkdown } from "../core/sessionBuilder.js";
import { invalidInput } from "../utils/errors.js";
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
        return [
            `Memory already initialized at ${paths.memoryDir}.`,
            `Project: ${index.project_name}`,
            `Use capture_change to record work or get_session_context to load the snapshot.`,
        ].join("\n");
    }
    const projectName = input.projectName?.trim() || path.basename(projectRoot) || "project";
    const now = new Date().toISOString();
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.patchesDir, { recursive: true });
    await fs.mkdir(paths.summariesDir, { recursive: true });
    const index = newIndex(projectName, now);
    await writeIndex(paths, index);
    await fs.writeFile(paths.changesFile, "", "utf8");
    const sessionMd = buildSessionMarkdown({ index, recent: [], maxTokens: index.max_bootstrap_tokens });
    await fs.writeFile(paths.sessionFile, sessionMd, "utf8");
    return [
        `Initialized Change Memory at ${paths.memoryDir}`,
        `Project: ${projectName}`,
        `Created: index.json, changes.jsonl, session.md, patches/, summaries/`,
        ``,
        `Next: make code changes, then run capture_change (or /memory-capture).`,
    ].join("\n");
}
//# sourceMappingURL=initMemory.js.map