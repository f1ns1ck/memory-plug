import { promises as fs } from "node:fs";
import { SCHEMA_VERSION, DEFAULT_CONSTRAINTS, DEFAULT_MAX_BOOTSTRAP_TOKENS, DEFAULT_MAX_RECENT_CHANGES, DEFAULT_AUTO_COMPACT_AFTER_CHANGES, DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS, } from "./types.js";
import { notInitialized } from "../utils/errors.js";
/** True when `.change-memory/index.json` exists. */
export async function isInitialized(paths) {
    try {
        await fs.access(paths.indexFile);
        return true;
    }
    catch {
        return false;
    }
}
export async function ensureInitialized(paths) {
    if (!(await isInitialized(paths))) {
        throw notInitialized(paths.memoryDir);
    }
}
export function newIndex(projectName, now) {
    return {
        schema_version: SCHEMA_VERSION,
        project_name: projectName,
        created_at: now,
        last_session_at: now,
        active_files: [],
        recent_change_ids: [],
        unresolved_items: [],
        constraints: [...DEFAULT_CONSTRAINTS],
        max_bootstrap_tokens: DEFAULT_MAX_BOOTSTRAP_TOKENS,
        max_recent_changes: DEFAULT_MAX_RECENT_CHANGES,
        share_patches: false,
        auto_compact_after_changes: DEFAULT_AUTO_COMPACT_AFTER_CHANGES,
        auto_compact_older_than_days: DEFAULT_AUTO_COMPACT_OLDER_THAN_DAYS,
    };
}
export async function readIndex(paths) {
    const raw = await fs.readFile(paths.indexFile, "utf8");
    return JSON.parse(raw);
}
export async function writeIndex(paths, index) {
    await fs.writeFile(paths.indexFile, JSON.stringify(index, null, 2) + "\n", "utf8");
}
/** Append one change as a single JSONL line. */
export async function appendChange(paths, change) {
    await fs.appendFile(paths.changesFile, JSON.stringify(change) + "\n", "utf8");
}
/** Read all changes (oldest first). Tolerates blank/corrupt lines. */
export async function readChanges(paths) {
    let raw;
    try {
        raw = await fs.readFile(paths.changesFile, "utf8");
    }
    catch {
        return [];
    }
    const out = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            out.push(JSON.parse(trimmed));
        }
        catch {
            // Skip unparseable lines rather than failing the whole read.
        }
    }
    return out;
}
/** Overwrite changes.jsonl with the given records (used by compaction). */
export async function writeChanges(paths, changes) {
    const body = changes.map((c) => JSON.stringify(c)).join("\n");
    await fs.writeFile(paths.changesFile, body.length ? body + "\n" : "", "utf8");
}
/** Most recent `limit` changes (newest first). */
export async function recentChanges(paths, limit) {
    const all = await readChanges(paths);
    return all.slice(-limit).reverse();
}
export function findChange(changes, changeId) {
    return changes.find((c) => c.id === changeId);
}
export const indexDefaults = {
    SCHEMA_VERSION,
    DEFAULT_MAX_BOOTSTRAP_TOKENS,
    DEFAULT_MAX_RECENT_CHANGES,
};
//# sourceMappingURL=memoryStore.js.map