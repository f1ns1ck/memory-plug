/**
 * Lightweight token budgeting. We deliberately avoid a real tokenizer (no
 * native deps, no model coupling) and use the well-known ~4 chars/token rough
 * estimate. Good enough to keep the bootstrap snapshot small.
 */
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/** Estimate the combined token cost of several strings. */
export function estimateTokensOf(...parts) {
    return estimateTokens(parts.join("\n"));
}
/**
 * Generic budget-driven section trimmer. Given an ordered list of section
 * renderers (most important first), include as many as fit under `maxTokens`.
 * The first section is always included (it's the header / most important part).
 */
export function fitSections(sections, maxTokens) {
    const kept = [];
    let running = 0;
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const cost = estimateTokens(section);
        if (i === 0 || running + cost <= maxTokens) {
            kept.push(section);
            running += cost;
        }
        else {
            break;
        }
    }
    return kept;
}
//# sourceMappingURL=tokenBudget.js.map