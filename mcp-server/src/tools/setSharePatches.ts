import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readIndex, writeIndex } from "../core/memoryStore.js";
import { ensureMemoryGitignore } from "./initMemory.js";

export interface SetSharePatchesInput {
  projectPath?: string;
  enabled?: boolean;
}

/**
 * Toggle whether `patches/` is committed with the repo. Unlike auto-capture
 * (a per-machine preference), this is a *team* decision stored as
 * `share_patches` in the shared `index.json`, and it regenerates the managed
 * `.change-memory/.gitignore` so the change takes effect. When `enabled` is
 * omitted the call just reports the current state.
 */
export async function setSharePatches(input: SetSharePatchesInput): Promise<string> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  const index = await readIndex(paths);

  if (typeof input.enabled !== "boolean") {
    const on = index.share_patches === true;
    return `Patch sharing is ${on ? "ON (patches/ committed)" : "OFF (patches/ local-only)"}.`;
  }

  if (index.share_patches !== input.enabled) {
    index.share_patches = input.enabled;
    await writeIndex(paths, index);
  }
  await ensureMemoryGitignore(paths.memoryDir, input.enabled);

  return input.enabled
    ? "Patch sharing is now ON. patches/ will be committed so teammates can load any change's diff. Commit .change-memory/ to share."
    : "Patch sharing is now OFF. patches/ stay machine-local (gitignored).";
}
