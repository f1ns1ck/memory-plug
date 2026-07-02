import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import { getSessionContext } from "../mcp-server/dist/tools/getSessionContext.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-enrich-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

async function captureHeuristic(dir, content) {
  await fs.writeFile(path.join(dir, "app.ts"), content);
  await captureChange({ projectPath: dir, reason: "auto: test" });
  const [rec] = await readChanges(memoryPaths(dir));
  return rec;
}

test("heuristic capture is flagged enriched: false; agent-authored is true", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  const heuristic = await captureHeuristic(dir, "export const x = 2\n");
  assert.equal(heuristic.enriched, false, "heuristic-only capture awaits enrichment");

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");
  await captureChange({ projectPath: dir, llmSummary: "Bump x to 3 for the fixture" });
  const changes = await readChanges(memoryPaths(dir));
  const agent = changes.find((c) => c.id !== heuristic.id);
  assert.equal(agent.enriched, true, "agent-authored capture is already enriched");
});

test("enrichChangeId updates the record in place and flips the flag", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const rec = await captureHeuristic(dir, "export const x = 2\n");

  const out = await captureChange({
    projectPath: dir,
    enrichChangeId: rec.id,
    llmSummary: "Raised the export to 2 to exercise enrichment",
    llmRisk: ["fixture only"],
    llmType: "fix",
    tags: ["Enrich"],
  });
  assert.match(out, /Enriched change/);

  const changes = await readChanges(memoryPaths(dir));
  assert.equal(changes.length, 1, "no new record appended");
  const updated = changes[0];
  assert.equal(updated.id, rec.id);
  assert.equal(updated.timestamp, rec.timestamp, "timestamp preserved");
  assert.equal(updated.patch_file, rec.patch_file, "patch untouched");
  assert.equal(updated.summary, "Raised the export to 2 to exercise enrichment");
  assert.equal(updated.type, "fix");
  assert.ok(updated.risk.includes("fixture only"), "agent risk unioned in");
  assert.deepEqual(updated.tags, ["enrich"], "tags sanitized and stored");
  assert.equal(updated.enriched, true);
});

test("session context lists un-enriched records and drops them once enriched", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const rec = await captureHeuristic(dir, "export const x = 2\n");

  const before = await getSessionContext({ projectPath: dir });
  assert.match(before, /## Awaiting Enrichment/);
  assert.match(before, new RegExp(`- ${rec.id}`));

  await captureChange({
    projectPath: dir,
    enrichChangeId: rec.id,
    llmSummary: "Bumped the export for the enrichment test",
  });

  const after = await getSessionContext({ projectPath: dir });
  assert.doesNotMatch(after, /## Awaiting Enrichment/, "nothing left to enrich");
  assert.match(after, /Bumped the export/, "snapshot shows the enriched summary");
});

test("enrichment requires llmSummary and an existing change id", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const rec = await captureHeuristic(dir, "export const x = 2\n");

  await assert.rejects(
    captureChange({ projectPath: dir, enrichChangeId: rec.id }),
    /requires llmSummary/,
  );
  await assert.rejects(
    captureChange({ projectPath: dir, enrichChangeId: "chg_missing", llmSummary: "x" }),
    /No change with id/,
  );
});
