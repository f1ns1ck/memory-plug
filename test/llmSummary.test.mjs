import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { mergeAgentSummary } from "../mcp-server/dist/core/summarizer.js";
import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import { autoCaptureChange } from "../mcp-server/dist/tools/autoCaptureChange.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

/** Create a tmp git repo with one committed file. */
async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-llm-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

const BASE = {
  type: "unknown",
  summary: "Unknown change: modified 1 file(s). Full patch stored locally.",
  added: [],
  modified: ["app.ts"],
  removed: [],
  risk: ["heuristic risk"],
};

test("mergeAgentSummary: undefined agent returns the heuristic base unchanged", () => {
  assert.deepEqual(mergeAgentSummary(BASE, undefined), BASE);
});

test("mergeAgentSummary: a full override replaces summary and type, unions risk", () => {
  const out = mergeAgentSummary(BASE, {
    summary: "  Refactor token refresh to retry once on 401.  ",
    risk: ["touches auth"],
    type: "refactor",
  });
  assert.equal(out.summary, "Refactor token refresh to retry once on 401.");
  // Agent risk augments the heuristic risk; it never drops the security flags.
  assert.deepEqual(out.risk, ["heuristic risk", "touches auth"]);
  assert.equal(out.type, "refactor");
  // File lists come from git, never from the agent.
  assert.deepEqual(out.modified, ["app.ts"]);
});

test("mergeAgentSummary: llmType 'unknown' never overwrites a heuristic type", () => {
  const out = mergeAgentSummary({ ...BASE, type: "feature" }, { type: "unknown" });
  assert.equal(out.type, "feature");
});

test("mergeAgentSummary: partial override keeps heuristic fields", () => {
  const out = mergeAgentSummary(BASE, { summary: "Better summary" });
  assert.equal(out.summary, "Better summary");
  assert.deepEqual(out.risk, ["heuristic risk"], "risk falls back to heuristic");
  assert.equal(out.type, "unknown", "type falls back to heuristic");
});

test("mergeAgentSummary: blank/invalid overrides are ignored", () => {
  const out = mergeAgentSummary(BASE, {
    summary: "   ",
    risk: ["", "  "],
    type: "not-a-type",
  });
  assert.equal(out.summary, BASE.summary);
  assert.deepEqual(out.risk, BASE.risk);
  assert.equal(out.type, BASE.type);
});

test("mergeAgentSummary: unioned risk is de-duplicated across heuristic and agent", () => {
  const out = mergeAgentSummary(BASE, { risk: ["heuristic risk", "a", "a", " a ", "b"] });
  assert.deepEqual(out.risk, ["heuristic risk", "a", "b"]);
});

test("capture_change records an agent-authored summary/risk/type", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");

  await captureChange({
    projectPath: dir,
    llmSummary: "Bump x to 2 to exercise the agent summary path",
    llmRisk: ["none, demo only"],
    llmType: "refactor",
  });

  const [rec] = await readChanges(memoryPaths(dir));
  assert.equal(rec.summary, "Bump x to 2 to exercise the agent summary path");
  assert.deepEqual(rec.risk, ["none, demo only"]);
  assert.equal(rec.type, "refactor");
});

test("auto_capture stays heuristic (no agent summary)", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");

  const out = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(out, /Auto-captured/);

  const [rec] = await readChanges(memoryPaths(dir));
  assert.match(rec.summary, /Full patch stored locally\./, "heuristic phrasing retained");
});
