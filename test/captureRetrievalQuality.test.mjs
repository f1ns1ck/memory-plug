import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { extractDiffSignals, HeuristicSummarizer } from "../mcp-server/dist/core/summarizer.js";
import { scoreChange, searchChanges } from "../mcp-server/dist/tools/searchChanges.js";
import { listChanges } from "../mcp-server/dist/tools/listChanges.js";
import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-crq-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

// --- Diff-aware signals (capture quality 1a) -----------------------------------

test("extractDiffSignals: counts +/- content lines, ignoring file headers", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,2 +1,3 @@",
    "-const old = 1",
    "+const next = 2",
    "+const more = 3",
    " unchanged",
  ].join("\n");
  const sig = extractDiffSignals(diff);
  assert.equal(sig.added, 2, "two added lines (not the +++ header)");
  assert.equal(sig.removed, 1, "one removed line (not the --- header)");
});

test("extractDiffSignals: names declarations across languages, capped and de-duped", () => {
  const diff = [
    "+function runCapture() {}",
    "+class Foo {}",
    "+def handler():",
    "+func Serve() {}",
    "+const dupe = 1",
    "+const dupe = 1",
    "+interface Beyond {}",
  ].join("\n");
  const sig = extractDiffSignals(diff);
  assert.deepEqual(sig.symbols, ["runCapture", "Foo", "handler", "Serve"], "first 4, ordered");
  assert.equal(sig.symbols.length, 4, "capped at 4");
});

test("HeuristicSummarizer folds signals into the summary, keeping the patch marker", async () => {
  const out = await new HeuristicSummarizer().summarize({
    files: ["app.ts"],
    nameStatus: [{ status: "M", file: "app.ts" }],
    diff: "+function login() {}\n-const old = 1\n",
  });
  assert.match(out.summary, /Touches `login`/, "names the changed symbol");
  assert.match(out.summary, /\(\+1\/-1\)/, "reports line counts");
  assert.match(out.summary, /Full patch stored locally\./, "keeps the patch marker");
});

// --- Weighted ranking (retrieval quality 2) ------------------------------------

const REC = (over = {}) => ({
  id: "chg_x",
  timestamp: "2026-01-01T00:00:00.000Z",
  files: [],
  type: "feature",
  summary: "",
  added: [],
  modified: [],
  removed: [],
  reason: "",
  risk: [],
  tests: [],
  patch_file: "p",
  token_cost_estimate: 0,
  ...over,
});

test("scoreChange: a summary hit outweighs a file-path hit", () => {
  const inSummary = scoreChange(REC({ summary: "cache invalidation" }), ["cache"], 0);
  const inFile = scoreChange(REC({ files: ["src/cache.ts"] }), ["cache"], 0);
  assert.ok(inSummary > inFile, `summary (${inSummary}) should beat file (${inFile})`);
});

test("scoreChange: a tag hit ranks as strongly as a summary hit", () => {
  const inTag = scoreChange(REC({ tags: ["perf"] }), ["perf"], 0);
  const inSummary = scoreChange(REC({ summary: "perf work" }), ["perf"], 0);
  assert.equal(inTag, inSummary);
});

test("scoreChange: recency breaks ties between equal textual matches", () => {
  const newer = scoreChange(REC({ summary: "auth" }), ["auth"], 1);
  const older = scoreChange(REC({ summary: "auth" }), ["auth"], 0);
  assert.ok(newer > older, "newer change scores higher");
});

test("scoreChange: a non-matching change scores zero (no recency leak)", () => {
  assert.equal(scoreChange(REC({ summary: "nothing here" }), ["auth"], 1), 0);
});

test("scoreChange: whole-word matching — 'auth' does not hit 'author'", () => {
  assert.equal(
    scoreChange(REC({ summary: "recorded author attribution on changes" }), ["auth"], 0),
    0,
    "term inside an unrelated word must not match",
  );
  assert.ok(scoreChange(REC({ summary: "fix auth flow" }), ["auth"], 0) > 0);
  assert.ok(scoreChange(REC({ files: ["src/auth/login.ts"] }), ["auth"], 0) > 0);
});

test("scoreChange: camelCase identifiers match their word parts", () => {
  assert.ok(scoreChange(REC({ files: ["src/cacheStore.ts"] }), ["cache"], 0) > 0);
  assert.ok(scoreChange(REC({ summary: "tuned tokenBudget limits" }), ["budget"], 0) > 0);
});

// --- Tags end-to-end -----------------------------------------------------------

test("capture_change stores sanitized tags; list/search filter by tag", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  await captureChange({ projectPath: dir, reason: "tagged", tags: ["Auth", "auth", "  PERF  ", ""] });

  const [rec] = await readChanges(paths);
  assert.deepEqual(rec.tags, ["auth", "perf"], "trimmed, lower-cased, de-duped, blanks dropped");

  const listed = await listChanges({ projectPath: dir, tag: "perf" });
  assert.match(listed, new RegExp(rec.id));

  const missed = await listChanges({ projectPath: dir, tag: "nope" });
  assert.match(missed, /No changes match/);

  const searched = await searchChanges({ projectPath: dir, query: "tagged", tag: "auth" });
  assert.match(searched, new RegExp(rec.id));
  assert.match(searched, /\[auth, perf\]/, "tags shown in the result row");

  const searchMiss = await searchChanges({ projectPath: dir, query: "tagged", tag: "nope" });
  assert.match(searchMiss, /No changes match/);
});
