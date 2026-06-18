import path from "node:path";
// --- Classification heuristics -------------------------------------------------
const TEST_RE = /(^|\/)(test|tests|__tests__|spec)(\/|$)|\.(test|spec)\.[tj]sx?$/i;
const DOCS_RE = /\.(md|mdx|rst|txt|adoc)$|(^|\/)docs?(\/|$)/i;
const CHORE_RE = /(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.gitignore|tsconfig.*\.json|\.eslintrc|\.prettierrc|dockerfile|\.ya?ml|\.toml|\.ini|makefile)$/i;
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
    { re: /(^|\/)(auth|authentication|login|session|oauth|jwt|token)/i, note: "Touches authentication/session logic — review access control and tests." },
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
        for (const rule of RISK_RULES) {
            if (rule.re.test(file))
                notes.add(rule.note);
        }
    }
    return [...notes];
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
    summarize(input) {
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