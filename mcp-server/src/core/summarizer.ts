import path from "node:path";
import { ChangeType, CHANGE_TYPES } from "./types.js";
import { NameStatusEntry } from "./git.js";

/**
 * Heuristic, offline summarizer. No external LLM is contacted. The interface is
 * intentionally small (and async) so a future LLM-backed summarizer can
 * implement the same `summarize` contract without changing call sites.
 */
export interface SummarizerInput {
  files: string[];
  nameStatus: NameStatusEntry[];
  diff: string;
  reason?: string;
  changeTypeHint?: ChangeType;
}

export interface SummarizerOutput {
  type: ChangeType;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
  risk: string[];
}

export interface Summarizer {
  summarize(input: SummarizerInput): Promise<SummarizerOutput>;
}

/**
 * An optional, agent-authored summary. The host model (Claude Code) — not the
 * server — produces this; the server still makes zero network calls and holds no
 * API keys. Any field left undefined falls back to the heuristic result, so a
 * partial override (e.g. a better summary line but no risk) is safe. Agent risk
 * notes are unioned with the heuristic risks, never replacing them, so the
 * automatic security flags can't be lost.
 */
export interface AgentSummary {
  summary?: string;
  risk?: string[];
  type?: ChangeType;
}

/**
 * Merge an agent-authored summary over a heuristic base. The heuristic output is
 * the floor: it is always computed first, so capture never depends on the agent
 * supplying anything. Empty / blank / invalid overrides are ignored.
 */
export function mergeAgentSummary(
  base: SummarizerOutput,
  agent?: AgentSummary,
): SummarizerOutput {
  if (!agent) return base;
  const out: SummarizerOutput = { ...base };
  if (typeof agent.summary === "string" && agent.summary.trim()) {
    out.summary = agent.summary.trim();
  }
  if (Array.isArray(agent.risk)) {
    const cleaned = agent.risk
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim())
      .filter(Boolean);
    // Union over the heuristic risks: agent notes augment, never replace, the
    // automatic security flags. Heuristic notes come first, then agent extras.
    if (cleaned.length) out.risk = [...new Set([...base.risk, ...cleaned])];
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
const CHORE_RE =
  /(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.gitignore|tsconfig.*\.json|\.eslintrc|\.prettierrc|dockerfile|\.ya?ml|\.toml|\.ini|makefile)$/i;

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
function classifyByPaths(files: string[], hint?: ChangeType): ChangeType {
  if (hint && hint !== "unknown") return hint;
  if (files.length === 0) return "unknown";

  const all = (re: RegExp) => files.every((f) => re.test(f));
  const any = (re: RegExp) => files.some((f) => re.test(f));

  if (all(TEST_RE)) return "test";
  if (all(DOCS_RE)) return "docs";
  if (all(CHORE_RE)) return "chore";
  if (any(TEST_RE) && files.length <= 3) return "test";
  return "unknown";
}

// --- Conservative risk notes ---------------------------------------------------

interface RiskRule {
  re: RegExp;
  note: string;
}

const RISK_RULES: RiskRule[] = [
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

function collectRisks(files: string[]): string[] {
  const notes = new Set<string>();
  for (const file of files) {
    // Documentation carries no executable risk; a file like `session.md` or
    // `secrets-rotation.md` must not raise code-risk flags.
    if (DOCS_RE.test(file)) continue;
    for (const rule of RISK_RULES) {
      if (rule.re.test(file)) notes.add(rule.note);
    }
  }
  return [...notes];
}

// --- Summary text --------------------------------------------------------------

function describeFiles(files: string[]): string {
  if (files.length === 0) return "no files";
  if (files.length === 1) return `\`${files[0]}\``;
  if (files.length <= 3) return files.map((f) => `\`${f}\``).join(", ");
  const head = files.slice(0, 2).map((f) => `\`${f}\``).join(", ");
  return `${head} and ${files.length - 2} more file(s)`;
}

function topAreas(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const dir = path.posix.dirname(f.split(path.sep).join("/"));
    dirs.add(dir === "." ? "root" : dir);
  }
  return [...dirs].slice(0, 3);
}

export class HeuristicSummarizer implements Summarizer {
  async summarize(input: SummarizerInput): Promise<SummarizerOutput> {
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    for (const entry of input.nameStatus) {
      if (entry.status === "A") added.push(entry.file);
      else if (entry.status === "D") removed.push(entry.file);
      else modified.push(entry.file);
    }

    const type = classifyByPaths(input.files, input.changeTypeHint);
    const risk = collectRisks(input.files);

    const verbParts: string[] = [];
    if (added.length) verbParts.push(`added ${added.length}`);
    if (modified.length) verbParts.push(`modified ${modified.length}`);
    if (removed.length) verbParts.push(`removed ${removed.length}`);
    const counts = verbParts.length ? verbParts.join(", ") + " file(s)" : "changed files";

    const areas = topAreas(input.files);
    const areaText = areas.length ? ` in ${areas.join(", ")}` : "";

    let summary = `${capitalize(type)} change: ${counts}${areaText} (${describeFiles(
      input.files,
    )}).`;
    if (input.reason && input.reason.trim()) {
      summary += ` Reason: ${input.reason.trim()}.`;
    }
    summary += " Full patch stored locally.";
    if (risk.length) summary += " Review behavior and tests before release.";

    return { type, summary, added, modified, removed, risk };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const defaultSummarizer: Summarizer = new HeuristicSummarizer();
