import path from "node:path";
import { pathOutsideRoot } from "./errors.js";
export const MEMORY_DIR = ".change-memory";
/**
 * Resolve the project root. When no path is supplied we fall back to the
 * current working directory of the MCP server process (the project Claude Code
 * was launched in).
 */
export function resolveProjectRoot(projectPath) {
    const base = projectPath && projectPath.trim().length > 0 ? projectPath : process.cwd();
    return path.resolve(base);
}
export function memoryRoot(projectRoot) {
    return path.join(projectRoot, MEMORY_DIR);
}
export function memoryPaths(projectRoot) {
    const memoryDir = memoryRoot(projectRoot);
    return {
        projectRoot,
        memoryDir,
        indexFile: path.join(memoryDir, "index.json"),
        changesFile: path.join(memoryDir, "changes.jsonl"),
        sessionFile: path.join(memoryDir, "session.md"),
        patchesDir: path.join(memoryDir, "patches"),
        summariesDir: path.join(memoryDir, "summaries"),
    };
}
/**
 * Normalize a path and guarantee it stays inside `root`. Protects against path
 * traversal (`../`), absolute escapes and symlink-style prefix tricks.
 * Returns the absolute, normalized path.
 */
export function ensureInsideRoot(root, target) {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(resolvedRoot, target);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    const escapes = relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative);
    if (escapes) {
        throw pathOutsideRoot(target);
    }
    return resolvedTarget;
}
/** Normalize a project-relative file path to forward slashes for storage. */
export function toPosix(p) {
    return p.split(path.sep).join("/");
}
//# sourceMappingURL=paths.js.map