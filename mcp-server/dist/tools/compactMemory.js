import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readChanges, writeChanges, readIndex, writeIndex, } from "../core/memoryStore.js";
import { ensureInsideRoot } from "../utils/paths.js";
function isOlderThan(timestamp, days) {
    const t = Date.parse(timestamp);
    if (Number.isNaN(t))
        return false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return t < cutoff;
}
function renderArchive(changes) {
    const lines = [
        `# Archived changes`,
        ``,
        `Generated at ${new Date().toISOString()}.`,
        `These ${changes.length} change(s) were compacted out of the active history.`,
        `Patch files are NOT deleted — they remain under .change-memory/patches/.`,
        ``,
    ];
    for (const c of changes) {
        lines.push(`- ${c.id} | ${c.type} | ${c.timestamp}`, `  - ${c.summary}`, `  - files: ${c.files.join(", ") || "(none)"}`, c.risk.length ? `  - risk: ${c.risk.join(" | ")}` : `  - risk: (none)`, `  - patch: ${c.patch_file}`);
    }
    return lines.join("\n") + "\n";
}
export async function compactMemory(input) {
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    const index = await readIndex(paths);
    const keepRecent = input.keepRecent && input.keepRecent > 0
        ? input.keepRecent
        : index.max_recent_changes;
    const olderThanDays = input.olderThanDays && input.olderThanDays > 0 ? input.olderThanDays : 30;
    const all = await readChanges(paths); // oldest first
    if (all.length <= keepRecent) {
        return `Nothing to compact: ${all.length} change(s) <= keepRecent (${keepRecent}).`;
    }
    // Candidates for archiving: outside the keepRecent window AND old enough.
    const archivable = all.slice(0, all.length - keepRecent);
    const toArchive = archivable.filter((c) => isOlderThan(c.timestamp, olderThanDays));
    if (!toArchive.length) {
        return `Nothing to compact: no changes older than ${olderThanDays} day(s) outside the keepRecent window.`;
    }
    const archiveIds = new Set(toArchive.map((c) => c.id));
    const remaining = all.filter((c) => !archiveIds.has(c.id));
    // Write an archive summary file (patches are preserved).
    const fileName = `archive_${Date.now()}.md`;
    const archivePath = ensureInsideRoot(paths.summariesDir, fileName);
    await fs.writeFile(archivePath, renderArchive(toArchive), "utf8");
    await writeChanges(paths, remaining);
    // Refresh index recent ids to the surviving newest changes.
    index.recent_change_ids = remaining
        .slice(-index.max_recent_changes)
        .reverse()
        .map((c) => c.id);
    await writeIndex(paths, index);
    return [
        `Compacted ${toArchive.length} change(s) older than ${olderThanDays} day(s).`,
        `Kept ${remaining.length} change(s) in active history.`,
        `Archive summary: ${path.join(".change-memory", "summaries", fileName)}`,
        `Patch files were preserved (not deleted).`,
    ].join("\n");
}
//# sourceMappingURL=compactMemory.js.map