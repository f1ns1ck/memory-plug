import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized } from "../core/memoryStore.js";
import { readAutoState, writeAutoState } from "./autoCaptureChange.js";
/**
 * Toggle automatic capture for this machine. The flag lives in the local
 * (gitignored) `auto-capture.json`, so it is a per-developer preference and
 * never gets committed or forced onto teammates. When `enabled` is omitted the
 * call just reports the current state.
 */
export async function setAutoCapture(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    const state = await readAutoState(paths.memoryDir);
    if (typeof input.enabled !== "boolean") {
        // Status query: undefined ⇒ enabled (default behavior).
        const on = state.enabled !== false;
        return `Auto-capture is ${on ? "ON" : "OFF"}.`;
    }
    await writeAutoState(paths.memoryDir, { ...state, enabled: input.enabled });
    return input.enabled
        ? "Auto-capture is now ON. Edits will be recorded automatically (debounced)."
        : "Auto-capture is now OFF. Use /memory-capture to record changes manually.";
}
//# sourceMappingURL=setAutoCapture.js.map