import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { ensureInitialized, readChanges } from "../core/memoryStore.js";
import { invalidInput } from "../utils/errors.js";
function fields(c) {
    return [
        { weight: 3, text: c.summary },
        { weight: 3, text: (c.tags ?? []).join(" ") },
        { weight: 2, text: c.reason },
        { weight: 1.5, text: c.type },
        { weight: 1, text: c.files.join(" ") },
        { weight: 0.5, text: [c.id, c.branch ?? "", c.commit ?? "", ...c.risk, ...c.tests].join(" ") },
    ].map((f) => ({ weight: f.weight, text: f.text.toLowerCase() }));
}
/**
 * Recency boost in [0, 1]: newest change ⇒ 1, oldest ⇒ 0, linear by rank. Folded
 * in as a small additive nudge so freshness breaks ties and lifts otherwise-equal
 * matches, without ever outweighing a strong textual match.
 */
const RECENCY_WEIGHT = 0.75;
/** Score one change against the query terms, with field weights + recency. */
export function scoreChange(c, terms, recency) {
    const fs = fields(c);
    let score = 0;
    for (const term of terms) {
        for (const f of fs) {
            if (f.text.includes(term))
                score += f.weight;
        }
    }
    // Only boost changes that actually matched something.
    if (score > 0)
        score += recency * RECENCY_WEIGHT;
    return score;
}
export async function searchChanges(input) {
    const query = (input.query ?? "").trim();
    if (!query)
        throw invalidInput("query is required.");
    const projectRoot = resolveProjectRoot(input.projectPath);
    const paths = memoryPaths(projectRoot);
    await ensureInitialized(paths);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let changes = await readChanges(paths);
    // Optional tag pre-filter: a tag is an exact label, not a fuzzy term.
    if (input.tag && input.tag.trim()) {
        const want = input.tag.trim().toLowerCase();
        changes = changes.filter((c) => (c.tags ?? []).some((t) => t.toLowerCase() === want));
    }
    // Recency rank: index 0 = oldest. Normalize to [0, 1] so newest scores highest.
    const lastIdx = Math.max(1, changes.length - 1);
    const scored = changes
        .map((c, i) => ({ c, score: scoreChange(c, terms, i / lastIdx) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || b.c.timestamp.localeCompare(a.c.timestamp));
    const limit = input.limit && input.limit > 0 ? input.limit : 20;
    const top = scored.slice(0, limit);
    if (!top.length) {
        const tagNote = input.tag ? ` with tag "${input.tag}"` : "";
        return `No changes match "${query}"${tagNote}.`;
    }
    return top
        .map(({ c }) => {
        const tagSuffix = c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
        return `${c.id} | ${c.type} | ${c.files[0] ?? "(no file)"} | ${c.summary}${tagSuffix}`;
    })
        .join("\n");
}
//# sourceMappingURL=searchChanges.js.map