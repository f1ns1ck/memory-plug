import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import {
  ensureInitialized,
  readChanges,
  findChange,
} from "../core/memoryStore.js";
import { readPatch, truncatePatch } from "../core/patchStore.js";
import { notFound, invalidInput } from "../utils/errors.js";

export interface ShowChangeInput {
  projectPath?: string;
  changeId: string;
  includePatch?: boolean;
}

const MAX_PATCH_LINES = 400;

export async function showChange(input: ShowChangeInput): Promise<string> {
  if (!input.changeId || !input.changeId.trim()) {
    throw invalidInput("changeId is required.");
  }
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  const changes = await readChanges(paths);
  const change = findChange(changes, input.changeId.trim());
  if (!change) {
    throw notFound(`Change not found: ${input.changeId}`);
  }

  const lines: string[] = [
    `# ${change.id}`,
    ``,
    `- Timestamp: ${change.timestamp}`,
    `- Author: ${change.author ?? "(unknown)"}`,
    `- Branch: ${change.branch ?? "(unknown)"}`,
    `- Commit: ${change.commit ?? "(unknown)"}`,
    `- Type: ${change.type}`,
    `- Summary: ${change.summary}`,
    change.reason ? `- Reason: ${change.reason}` : `- Reason: (none)`,
    `- Files (${change.files.length}): ${change.files.join(", ") || "(none)"}`,
    `- Added: ${change.added.join(", ") || "(none)"}`,
    `- Modified: ${change.modified.join(", ") || "(none)"}`,
    `- Removed: ${change.removed.join(", ") || "(none)"}`,
    `- Risk: ${change.risk.join(" | ") || "(none)"}`,
    `- Tests: ${change.tests.join(", ") || "(none)"}`,
    `- Patch file: ${change.patch_file}`,
    `- Est. tokens (full diff): ${change.token_cost_estimate}`,
  ];

  if (input.includePatch) {
    const patch = await readPatch(projectRoot, change.patch_file);
    const { text, truncated, totalLines } = truncatePatch(patch, MAX_PATCH_LINES);
    lines.push("", "## Patch", "");
    lines.push("```diff", text, "```");
    if (truncated) {
      lines.push(
        "",
        `_Patch truncated to ${MAX_PATCH_LINES} of ${totalLines} lines. ` +
          `Inspect a specific file or open ${change.patch_file} directly for full detail._`,
      );
    }
  } else {
    lines.push(
      "",
      `_Patch omitted. Call show_change with includePatch: true to load the diff._`,
    );
  }

  return lines.join("\n");
}
