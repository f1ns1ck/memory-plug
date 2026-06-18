import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import {
  appendChange,
  readChanges,
  isInitialized,
} from "../mcp-server/dist/core/memoryStore.js";
import {
  savePatch,
  readPatch,
  patchRelativePath,
} from "../mcp-server/dist/core/patchStore.js";
import { buildSessionContext } from "../mcp-server/dist/core/sessionBuilder.js";
import { estimateTokens } from "../mcp-server/dist/core/tokenBudget.js";
import { searchChanges } from "../mcp-server/dist/tools/searchChanges.js";

async function tmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acm-test-"));
}

function makeChange(id, summary, files, extra = {}) {
  return {
    id,
    timestamp: new Date().toISOString(),
    files,
    type: "fix",
    summary,
    added: [],
    modified: files,
    removed: [],
    reason: extra.reason ?? "",
    risk: extra.risk ?? [],
    tests: extra.tests ?? [],
    patch_file: patchRelativePath(id),
    token_cost_estimate: 10,
  };
}

test("init creates the memory layout", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  assert.equal(await isInitialized(paths), true);
  for (const f of [paths.indexFile, paths.changesFile, paths.sessionFile]) {
    await fs.access(f);
  }
  await fs.access(paths.patchesDir);
  await fs.access(paths.summariesDir);
});

test("JSONL append then read round-trips", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  const c1 = makeChange("chg_1", "first", ["a.ts"]);
  const c2 = makeChange("chg_2", "second", ["b.ts"]);
  await appendChange(paths, c1);
  await appendChange(paths, c2);
  const read = await readChanges(paths);
  assert.equal(read.length, 2);
  assert.equal(read[0].id, "chg_1");
  assert.equal(read[1].summary, "second");
});

test("compressed patch save/read round-trips", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  const diff = "diff --git a/x b/x\n+hello world\n".repeat(50);
  const rel = await savePatch(paths.patchesDir, "chg_patch", diff);
  // Stored file must be smaller than the raw diff (gzip).
  const stored = await fs.stat(path.join(root, rel));
  assert.ok(stored.size < Buffer.byteLength(diff));
  const back = await readPatch(root, rel);
  assert.equal(back, diff);
});

test("session context respects token budget and excludes diffs", () => {
  const index = {
    schema_version: 1,
    project_name: "demo",
    created_at: new Date().toISOString(),
    last_session_at: new Date().toISOString(),
    active_files: Array.from({ length: 40 }, (_, i) => `src/file${i}.ts`),
    recent_change_ids: [],
    unresolved_items: ["something"],
    constraints: [],
    max_bootstrap_tokens: 200,
    max_recent_changes: 10,
  };
  const recent = Array.from({ length: 10 }, (_, i) =>
    makeChange(`chg_${i}`, `summary ${i} `.repeat(10), [`src/f${i}.ts`], {
      risk: ["some risk note here"],
    }),
  );
  const ctx = buildSessionContext({ index, recent, maxTokens: 200 });
  assert.ok(estimateTokens(ctx) <= 200 + 60, "should be near the budget");
  assert.ok(!ctx.includes("diff --git"), "must not contain raw diffs");
  assert.ok(ctx.includes("# Session Context"));
});

test("search finds by summary, file and reason", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  await appendChange(paths, makeChange("chg_a", "fix token refresh", ["src/auth.ts"], { reason: "expired token bug" }));
  await appendChange(paths, makeChange("chg_b", "add docs", ["README.md"]));

  const bySummary = await searchChanges({ projectPath: root, query: "token" });
  assert.ok(bySummary.includes("chg_a"));
  assert.ok(!bySummary.includes("chg_b"));

  const byFile = await searchChanges({ projectPath: root, query: "auth.ts" });
  assert.ok(byFile.includes("chg_a"));

  const byReason = await searchChanges({ projectPath: root, query: "expired" });
  assert.ok(byReason.includes("chg_a"));
});

test("readPatch rejects paths outside the project root", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  await assert.rejects(
    () => readPatch(root, "../../../etc/passwd"),
    /outside|PATH_OUTSIDE_ROOT/,
  );
});
