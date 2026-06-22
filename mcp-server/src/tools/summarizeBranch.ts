import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readChanges } from "../core/memoryStore.js";
import { ChangeRecord, ChangeType } from "../core/types.js";
import { getBranch } from "../core/git.js";

export interface SummarizeBranchInput {
  projectPath?: string;
  /** Branch to summarize. Defaults to the current git branch. */
  branch?: string;
  /** Max changes to enumerate (newest first). Default 50. */
  limit?: number;
}

const TYPE_ORDER: ChangeType[] = [
  "feature",
  "fix",
  "refactor",
  "test",
  "docs",
  "chore",
  "unknown",
];

const TYPE_HEADING: Record<ChangeType, string> = {
  feature: "Features",
  fix: "Fixes",
  refactor: "Refactors",
  test: "Tests",
  docs: "Docs",
  chore: "Chores",
  unknown: "Other",
};

function uniq(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))];
}

/**
 * Build a PR-ready markdown summary of the changes recorded on a branch.
 *
 * Reads the local change history (never the diffs) and groups changes by type,
 * then aggregates touched files, risks and tests. Read-only: only
 * `git rev-parse` runs (to resolve the current branch) and the memory store is
 * read, never written.
 */
export async function summarizeBranch(
  input: SummarizeBranchInput,
): Promise<string> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  await ensureInitialized(paths);

  const target = input.branch?.trim() || (await getBranch(projectRoot));
  if (!target) {
    return (
      "Could not determine a branch to summarize. Pass a branch name, or run " +
      "inside a git repository on a named branch (not detached HEAD)."
    );
  }

  const all = await readChanges(paths);
  const onBranch = all
    .filter((c) => (c.branch ?? "") === target)
    .reverse(); // newest first

  if (!onBranch.length) {
    return (
      `No recorded changes on branch \`${target}\`.\n\n` +
      "Changes are tagged with a branch only when captured by this version. " +
      "Older changes captured before branch-awareness have no branch and won't appear here."
    );
  }

  const limit = input.limit && input.limit > 0 ? input.limit : 50;
  const changes = onBranch.slice(0, limit);

  const lines: string[] = [];
  lines.push(`# Changes on \`${target}\``);
  lines.push("");

  const commits = uniq(changes.map((c) => c.commit ?? ""));
  const authors = uniq(changes.map((c) => c.author ?? ""));
  const meta = [`${changes.length} change(s)`];
  if (commits.length) meta.push(`commits: ${commits.join(", ")}`);
  if (authors.length) meta.push(`by ${authors.join(", ")}`);
  lines.push(`_${meta.join(" · ")}_`);
  lines.push("");

  // Grouped change list, by type, in a stable order.
  const byType = new Map<ChangeType, ChangeRecord[]>();
  for (const c of changes) {
    const bucket = byType.get(c.type) ?? [];
    bucket.push(c);
    byType.set(c.type, bucket);
  }
  lines.push("## Summary");
  lines.push("");
  for (const type of TYPE_ORDER) {
    const bucket = byType.get(type);
    if (!bucket?.length) continue;
    lines.push(`### ${TYPE_HEADING[type]}`);
    lines.push("");
    for (const c of bucket) {
      const reason = c.reason ? ` — ${c.reason}` : "";
      lines.push(`- ${c.summary}${reason}`);
    }
    lines.push("");
  }

  // Aggregations across the branch.
  const files = uniq(changes.flatMap((c) => c.files));
  if (files.length) {
    lines.push(`## Files touched (${files.length})`);
    lines.push("");
    for (const f of files) lines.push(`- \`${f}\``);
    lines.push("");
  }

  const risks = uniq(changes.flatMap((c) => c.risk));
  if (risks.length) {
    lines.push("## Risks");
    lines.push("");
    for (const r of risks) lines.push(`- ${r}`);
    lines.push("");
  }

  const tests = uniq(changes.flatMap((c) => c.tests));
  if (tests.length) {
    lines.push("## Tests");
    lines.push("");
    for (const t of tests) lines.push(`- ${t}`);
    lines.push("");
  }

  if (onBranch.length > changes.length) {
    lines.push(
      `_Showing the ${changes.length} most recent of ${onBranch.length} changes on this branch._`,
    );
  }

  return lines.join("\n").trimEnd() + "\n";
}
