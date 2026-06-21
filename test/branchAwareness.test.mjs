import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { appendChange } from "../mcp-server/dist/core/memoryStore.js";
import { patchRelativePath } from "../mcp-server/dist/core/patchStore.js";
import { listChanges } from "../mcp-server/dist/tools/listChanges.js";
import { searchChanges } from "../mcp-server/dist/tools/searchChanges.js";
import { summarizeBranch } from "../mcp-server/dist/tools/summarizeBranch.js";

async function tmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acm-branch-"));
}

function makeChange(id, summary, files, extra = {}) {
  return {
    id,
    timestamp: new Date().toISOString(),
    ...(extra.author ? { author: extra.author } : {}),
    ...(extra.branch ? { branch: extra.branch } : {}),
    ...(extra.commit ? { commit: extra.commit } : {}),
    files,
    type: extra.type ?? "fix",
    summary,
    added: extra.added ?? [],
    modified: extra.modified ?? files,
    removed: [],
    reason: extra.reason ?? "",
    risk: extra.risk ?? [],
    tests: extra.tests ?? [],
    patch_file: patchRelativePath(id),
    token_cost_estimate: 10,
  };
}

test("list_changes filters by branch", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  await appendChange(paths, makeChange("chg_a", "on feature", ["a.ts"], { branch: "feat/x" }));
  await appendChange(paths, makeChange("chg_b", "on main", ["b.ts"], { branch: "main" }));

  const onFeature = await listChanges({ projectPath: root, branch: "feat/x" });
  assert.ok(onFeature.includes("chg_a"));
  assert.ok(!onFeature.includes("chg_b"));
});

test("search_changes matches by branch and commit", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  await appendChange(paths, makeChange("chg_a", "thing", ["a.ts"], { branch: "feat/login", commit: "abc1234" }));
  await appendChange(paths, makeChange("chg_b", "other", ["b.ts"], { branch: "main", commit: "def5678" }));

  const byBranch = await searchChanges({ projectPath: root, query: "feat/login" });
  assert.ok(byBranch.includes("chg_a"));
  assert.ok(!byBranch.includes("chg_b"));

  const byCommit = await searchChanges({ projectPath: root, query: "def5678" });
  assert.ok(byCommit.includes("chg_b"));
});

test("summarize_branch groups by type and aggregates files/risks/tests", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  await appendChange(paths, makeChange("chg_a", "add login form", ["src/login.ts"], {
    branch: "feat/login", commit: "aaa1111", type: "feature", reason: "users need auth",
    risk: ["touches auth"], tests: ["login.test.ts"],
  }));
  await appendChange(paths, makeChange("chg_b", "fix redirect", ["src/router.ts"], {
    branch: "feat/login", commit: "bbb2222", type: "fix",
  }));
  await appendChange(paths, makeChange("chg_c", "unrelated", ["x.ts"], { branch: "main" }));

  const md = await summarizeBranch({ projectPath: root, branch: "feat/login" });
  assert.ok(md.includes("Changes on `feat/login`"));
  assert.ok(md.includes("### Features"));
  assert.ok(md.includes("add login form"));
  assert.ok(md.includes("users need auth"), "reason should appear");
  assert.ok(md.includes("### Fixes"));
  assert.ok(md.includes("`src/login.ts`"));
  assert.ok(md.includes("touches auth"), "risk should be aggregated");
  assert.ok(md.includes("login.test.ts"), "tests should be aggregated");
  assert.ok(!md.includes("unrelated"), "changes on other branches excluded");
});

test("summarize_branch reports when a branch has no recorded changes", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const md = await summarizeBranch({ projectPath: root, branch: "ghost" });
  assert.ok(md.includes("No recorded changes on branch `ghost`"));
});
