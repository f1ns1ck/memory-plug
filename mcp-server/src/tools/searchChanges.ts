import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readChanges } from "../core/memoryStore.js";
import { ChangeRecord } from "../core/types.js";
import { invalidInput } from "../utils/errors.js";

export interface SearchChangesInput {
  projectPath?: string;
  query: string;
  limit?: number;
}

/** Concatenate every searchable field of a change into one haystack. */
function haystack(c: ChangeRecord): string {
  return [
    c.id,
    c.summary,
    c.reason,
    c.type,
    ...c.files,
    ...c.risk,
    ...c.tests,
  ]
    .join(" \n ")
    .toLowerCase();
}

export async function searchChanges(input: SearchChangesInput): Promise<string> {
  const query = (input.query ?? "").trim();
  if (!query) throw invalidInput("query is required.");

  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  // Also search the unresolved items recorded in the index.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const changes = await readChanges(paths);

  const scored = changes
    .map((c) => {
      const hay = haystack(c);
      const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.c.timestamp.localeCompare(a.c.timestamp));

  const limit = input.limit && input.limit > 0 ? input.limit : 20;
  const top = scored.slice(0, limit);

  if (!top.length) {
    return `No changes match "${query}".`;
  }

  return top
    .map(({ c }) => `${c.id} | ${c.type} | ${c.files[0] ?? "(no file)"} | ${c.summary}`)
    .join("\n");
}
