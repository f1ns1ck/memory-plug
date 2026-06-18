import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readIndex, recentChanges, } from "../core/memoryStore.js";
import { buildSessionContext } from "../core/sessionBuilder.js";
export async function getSessionContext(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    const index = await readIndex(paths);
    const maxTokens = input.maxTokens && input.maxTokens > 0
        ? input.maxTokens
        : index.max_bootstrap_tokens;
    const recent = await recentChanges(paths, index.max_recent_changes);
    return buildSessionContext({ index, recent, maxTokens });
}
//# sourceMappingURL=getSessionContext.js.map