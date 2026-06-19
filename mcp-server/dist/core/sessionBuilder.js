import { estimateTokens } from "./tokenBudget.js";
function renderChanges(changes) {
    if (!changes.length)
        return "_No changes recorded yet._";
    return changes
        .map((c) => `- ${c.id}${c.author ? ` (${c.author})` : ""}: ${c.summary}`)
        .join("\n");
}
function renderList(items, empty) {
    if (!items.length)
        return empty;
    return items.map((i) => `- ${i}`).join("\n");
}
function renderRisks(changes) {
    const risks = new Set();
    for (const c of changes)
        for (const r of c.risk)
            risks.add(r);
    if (!risks.size)
        return "";
    return `\n## Risks\n\n${[...risks].map((r) => `- ${r}`).join("\n")}\n`;
}
const CONSTRAINTS_BLOCK = `## Constraints

- Keep context compact.
- Do not include full diffs by default.
- Load patch details only when needed.`;
const TOOLS_BLOCK = `## Available Memory Tools

- show_change(changeId)
- list_changes()
- search_changes(query)
- capture_change()`;
function compose(index, changes, activeFiles, includeRisks) {
    const risksBlock = includeRisks ? renderRisks(changes) : "";
    return `# Session Context

Project: ${index.project_name}

This is a compact memory snapshot for Claude Code.
It intentionally excludes full diffs to reduce token usage.

## Recent Changes

${renderChanges(changes)}

## Active Files

${renderList(activeFiles, "_None tracked._")}

## Open Issues

${renderList(index.unresolved_items, "_None._")}
${risksBlock}
${CONSTRAINTS_BLOCK}

${TOOLS_BLOCK}
`;
}
/**
 * Render the snapshot, degrading until it fits within `maxTokens`.
 * Degradation order: drop risks -> trim active files -> drop oldest changes.
 */
export function buildSessionContext(input) {
    const { index, maxTokens } = input;
    let changes = [...input.recent];
    let activeFiles = [...index.active_files];
    let includeRisks = true;
    const render = () => compose(index, changes, activeFiles, includeRisks);
    if (estimateTokens(render()) <= maxTokens)
        return render();
    // 1) Drop risks block.
    includeRisks = false;
    if (estimateTokens(render()) <= maxTokens)
        return render();
    // 2) Trim active files progressively.
    while (activeFiles.length > 3 && estimateTokens(render()) > maxTokens) {
        activeFiles = activeFiles.slice(0, activeFiles.length - 1);
    }
    if (estimateTokens(render()) <= maxTokens)
        return render();
    // 3) Drop oldest changes (keep at least one).
    while (changes.length > 1 && estimateTokens(render()) > maxTokens) {
        changes = changes.slice(0, changes.length - 1);
    }
    return render();
}
/** The on-disk session.md mirrors the bootstrap context. */
export function buildSessionMarkdown(input) {
    return buildSessionContext(input);
}
//# sourceMappingURL=sessionBuilder.js.map