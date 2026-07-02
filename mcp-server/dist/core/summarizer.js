import path from "node:path";
import { CHANGE_TYPES } from "./types.js";
/**
 * Merge an agent-authored summary over a heuristic base. The heuristic output is
 * the floor: it is always computed first, so capture never depends on the agent
 * supplying anything. Empty / blank / invalid overrides are ignored.
 */
export function mergeAgentSummary(base, agent) {
    if (!agent)
        return base;
    const out = { ...base };
    if (typeof agent.summary === "string" && agent.summary.trim()) {
        out.summary = agent.summary.trim();
    }
    if (Array.isArray(agent.risk)) {
        const cleaned = agent.risk
            .filter((r) => typeof r === "string")
            .map((r) => r.trim())
            .filter(Boolean);
        // Union over the heuristic risks: agent notes augment, never replace, the
        // automatic security flags. Heuristic notes come first, then agent extras.
        if (cleaned.length)
            out.risk = [...new Set([...base.risk, ...cleaned])];
    }
    // "unknown" is a valid ChangeType but a non-classification — never let it
    // overwrite a confident heuristic type.
    if (agent.type && agent.type !== "unknown" && CHANGE_TYPES.includes(agent.type)) {
        out.type = agent.type;
    }
    return out;
}
// --- Classification heuristics -------------------------------------------------
const TEST_RE = /(^|\/)(test|tests|__tests__|spec)(\/|$)|\.(test|spec)\.[tj]sx?$/i;
const DOCS_RE = /\.(md|mdx|rst|txt|adoc)$|(^|\/)docs?(\/|$)/i;
const CHORE_RE = /(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.gitignore|tsconfig.*\.json|\.eslintrc|\.prettierrc|dockerfile|\.ya?ml|\.toml|\.ini|makefile)$/i;
/**
 * Path-only change classification. By design this only recognizes categories a
 * path can actually prove — test / docs / chore — and returns "unknown" for
 * anything involving source code or a mix of areas.
 *
 * Deliberately NOT "improved" to guess feature/fix/refactor by majority: a file
 * path cannot distinguish those, and a confident-looking but wrong label is worse
 * than an honest "unknown". When the type matters, the host model supplies an
 * accurate `llmType` on a deliberate `capture_change` (see mergeAgentSummary);
 * auto-capture intentionally stays heuristic.
 */
function classifyByPaths(files, hint) {
    if (hint && hint !== "unknown")
        return hint;
    if (files.length === 0)
        return "unknown";
    const all = (re) => files.every((f) => re.test(f));
    const any = (re) => files.some((f) => re.test(f));
    if (all(TEST_RE))
        return "test";
    if (all(DOCS_RE))
        return "docs";
    if (all(CHORE_RE))
        return "chore";
    if (any(TEST_RE) && files.length <= 3)
        return "test";
    return "unknown";
}
const RISK_RULES = [
    // Match whole path tokens (bounded by `/ . _ -` or string ends) so unrelated
    // names that merely start with a keyword — sessionBuilder.ts, tokenBudget.ts —
    // are not mislabeled as auth. `authentication` is listed before `auth` so the
    // longer keyword wins.
    { re: /(^|[\/._-])(authentication|auth|login|session|oauth|jwt|token)([\/._-]|$)/i, note: "Touches authentication/session logic — review access control and tests." },
    { re: /(^|\/)(payment|billing|checkout|stripe|invoice)/i, note: "Touches payment/billing logic — verify amounts, idempotency and error paths." },
    { re: /(migration|migrate|schema)/i, note: "Touches database migration/schema — confirm forward/back compatibility." },
    { re: /(^|\/)(api|routes?|controllers?|handlers?)\//i, note: "Touches API routes/handlers — check request validation and contracts." },
    { re: /(config|\.env|settings|secrets)/i, note: "Touches configuration — verify no secrets are committed and defaults are safe." },
    { re: /(security|crypto|encrypt|hash|password|sanitiz)/i, note: "Touches security-sensitive code — review carefully." },
    { re: /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)/i, note: "Touches dependency lockfile — review for unexpected dependency changes." },
];
function collectRisks(files) {
    const notes = new Set();
    for (const file of files) {
        // Documentation carries no executable risk; a file like `session.md` or
        // `secrets-rotation.md` must not raise code-risk flags.
        if (DOCS_RE.test(file))
            continue;
        for (const rule of RISK_RULES) {
            if (rule.re.test(file))
                notes.add(rule.note);
        }
    }
    return [...notes];
}
const MAX_SIGNAL_SYMBOLS = 4;
// Declaration patterns across a few common languages. Each captures the symbol
// name in group 1. Conservative on purpose: we only name things a line clearly
// declares, so we never invent a symbol from an arbitrary code line.
const SYMBOL_RES = [
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, // JS/TS function
    /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, // class
    /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, // TS interface
    /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/, // TS enum
    /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/, // TS type alias
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, // JS binding
    /\bdef\s+([A-Za-z_$][\w$]*)/, // Python def
    /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/, // Go func / method
    /\b(?:type\s+)?struct\s+([A-Za-z_$][\w$]*)/, // struct
];
/**
 * Parse a unified diff for content-level signals: how many lines changed and the
 * names of declarations touched. Purely textual and offline — it never contacts a
 * model. This lifts auto-capture summaries past a bare file count without breaking
 * the no-network guarantee.
 */
export function extractDiffSignals(diff) {
    let added = 0;
    let removed = 0;
    const symbols = [];
    const seen = new Set();
    for (const line of diff.split("\n")) {
        // File-level headers carry `+`/`-` but are not content changes.
        if (line.startsWith("+++") || line.startsWith("---"))
            continue;
        const isAdd = line.startsWith("+");
        const isDel = line.startsWith("-");
        if (!isAdd && !isDel)
            continue;
        if (isAdd)
            added++;
        else
            removed++;
        if (symbols.length >= MAX_SIGNAL_SYMBOLS)
            continue;
        const content = line.slice(1);
        for (const re of SYMBOL_RES) {
            const m = re.exec(content);
            if (m && m[1] && !seen.has(m[1])) {
                seen.add(m[1]);
                symbols.push(m[1]);
                if (symbols.length >= MAX_SIGNAL_SYMBOLS)
                    break;
            }
        }
    }
    return { added, removed, symbols };
}
/** Render diff signals as a short clause, or "" when there is nothing to add. */
function describeSignals(sig) {
    const counts = sig.added || sig.removed ? `(+${sig.added}/-${sig.removed})` : "";
    if (sig.symbols.length) {
        const names = sig.symbols.map((s) => `\`${s}\``).join(", ");
        return counts ? `Touches ${names} ${counts}.` : `Touches ${names}.`;
    }
    return counts ? `Net ${counts}.` : "";
}
// --- Summary text --------------------------------------------------------------
function describeFiles(files) {
    if (files.length === 0)
        return "no files";
    if (files.length === 1)
        return `\`${files[0]}\``;
    if (files.length <= 3)
        return files.map((f) => `\`${f}\``).join(", ");
    const head = files.slice(0, 2).map((f) => `\`${f}\``).join(", ");
    return `${head} and ${files.length - 2} more file(s)`;
}
function topAreas(files) {
    const dirs = new Set();
    for (const f of files) {
        const dir = path.posix.dirname(f.split(path.sep).join("/"));
        dirs.add(dir === "." ? "root" : dir);
    }
    return [...dirs].slice(0, 3);
}
export class HeuristicSummarizer {
    async summarize(input) {
        const added = [];
        const modified = [];
        const removed = [];
        for (const entry of input.nameStatus) {
            if (entry.status === "A")
                added.push(entry.file);
            else if (entry.status === "D")
                removed.push(entry.file);
            else
                modified.push(entry.file);
        }
        const type = classifyByPaths(input.files, input.changeTypeHint);
        const risk = collectRisks(input.files);
        const verbParts = [];
        if (added.length)
            verbParts.push(`added ${added.length}`);
        if (modified.length)
            verbParts.push(`modified ${modified.length}`);
        if (removed.length)
            verbParts.push(`removed ${removed.length}`);
        const counts = verbParts.length ? verbParts.join(", ") + " file(s)" : "changed files";
        const areas = topAreas(input.files);
        const areaText = areas.length ? ` in ${areas.join(", ")}` : "";
        let summary = `${capitalize(type)} change: ${counts}${areaText} (${describeFiles(input.files)}).`;
        const signals = describeSignals(extractDiffSignals(input.diff));
        if (signals)
            summary += ` ${signals}`;
        if (input.reason && input.reason.trim()) {
            summary += ` Reason: ${input.reason.trim()}.`;
        }
        summary += " Full patch stored locally.";
        if (risk.length)
            summary += " Review behavior and tests before release.";
        return { type, summary, added, modified, removed, risk };
    }
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
export const defaultSummarizer = new HeuristicSummarizer();
//# sourceMappingURL=summarizer.js.map