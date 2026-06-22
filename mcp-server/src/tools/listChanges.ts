import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readChanges } from "../core/memoryStore.js";
import { ChangeRecord } from "../core/types.js";

export interface ListChangesInput {
  projectPath?: string;
  limit?: number;
  file?: string;
  type?: string;
  branch?: string;
}

function primaryFile(c: ChangeRecord): string {
  return c.files[0] ?? "(no file)";
}

export async function listChanges(input: ListChangesInput): Promise<string> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  let changes = await readChanges(paths);
  changes.reverse(); // newest first

  if (input.file) {
    const needle = input.file.toLowerCase();
    changes = changes.filter((c) =>
      c.files.some((f) => f.toLowerCase().includes(needle)),
    );
  }
  if (input.type) {
    const t = input.type.toLowerCase();
    changes = changes.filter((c) => c.type.toLowerCase() === t);
  }
  if (input.branch) {
    const b = input.branch.toLowerCase();
    changes = changes.filter((c) => (c.branch ?? "").toLowerCase() === b);
  }

  const limit = input.limit && input.limit > 0 ? input.limit : 20;
  const slice = changes.slice(0, limit);

  if (!slice.length) {
    return "No changes match.";
  }

  const rows = slice.map(
    (c) =>
      `${c.id} | ${c.type} | ${c.author ?? "(unknown)"} | ${primaryFile(c)} | ${c.summary}`,
  );
  return rows.join("\n");
}
