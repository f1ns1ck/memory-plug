import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized } from "../core/memoryStore.js";
import { setAutoCapture } from "./setAutoCapture.js";
import { setSharePatches } from "./setSharePatches.js";
/**
 * Single settings entry point for Change Memory. It folds the two former toggle
 * tools (`set_auto_capture`, `set_share_patches`) into one call so the MCP
 * surface stays small. The two settings keep their distinct scopes:
 *
 *  - `autoCapture` is a per-developer preference in the local, gitignored
 *    `auto-capture.json` — it never affects teammates.
 *  - `sharePatches` is a team-wide decision in the committed `index.json` and
 *    regenerates the managed `.gitignore`.
 *
 * Each field is applied only when provided; an omitted field is left unchanged
 * and merely reported. Omit both to query the current state of each.
 */
export async function configure(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    // Delegate to the underlying setters: passing `enabled: undefined` makes each
    // one report its current state instead of changing it.
    const auto = await setAutoCapture({ projectPath: projectRoot, enabled: input.autoCapture });
    const share = await setSharePatches({ projectPath: projectRoot, enabled: input.sharePatches });
    return [auto, share].join("\n");
}
//# sourceMappingURL=configure.js.map