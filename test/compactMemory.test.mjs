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
  readIndex,
  writeIndex,
} from "../mcp-server/dist/core/memoryStore.js";
import { patchRelativePath } from "../mcp-server/dist/core/patchStore.js";
import {
  runCompact,
  maybeAutoCompact,
} from "../mcp-server/dist/tools/compactMemory.js";

async function tmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acm-compact-"));
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeChange(id, timestamp) {
  return {
    id,
    timestamp,
    files: [`${id}.ts`],
    type: "fix",
    summary: `change ${id}`,
    added: [],
    modified: [`${id}.ts`],
    removed: [],
    reason: "",
    risk: [],
    tests: [],
    patch_file: patchRelativePath(id),
    token_cost_estimate: 10,
  };
}

async function seed(root, specs) {
  const paths = memoryPaths(root);
  for (const [id, ts] of specs) {
    await appendChange(paths, makeChange(id, ts));
  }
  return paths;
}

test("runCompact archives only old changes outside the keepRecent window", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = await seed(root, [
    ["chg_old1", daysAgo(60)],
    ["chg_old2", daysAgo(45)],
    ["chg_new1", daysAgo(1)],
    ["chg_new2", daysAgo(0)],
  ]);

  const res = await runCompact(paths, { olderThanDays: 30, keepRecent: 2 });
  assert.equal(res.archived, 2);
  assert.equal(res.remaining, 2);
  assert.ok(res.archiveFile);

  const remaining = (await readChanges(paths)).map((c) => c.id);
  assert.deepEqual(remaining, ["chg_new1", "chg_new2"]);
});

test("runCompact keeps recent changes even when old", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = await seed(root, [
    ["chg_a", daysAgo(90)],
    ["chg_b", daysAgo(80)],
  ]);

  const res = await runCompact(paths, { olderThanDays: 30, keepRecent: 5 });
  assert.equal(res.archived, 0);
  assert.equal((await readChanges(paths)).length, 2);
});

test("maybeAutoCompact is a no-op below the threshold", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = await seed(root, [["chg_a", daysAgo(90)]]);

  const index = await readIndex(paths);
  index.auto_compact_after_changes = 5;
  await writeIndex(paths, index);

  const res = await maybeAutoCompact(paths);
  assert.equal(res, null);
  assert.equal((await readChanges(paths)).length, 1);
});

test("maybeAutoCompact fires once active history passes the threshold", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  // 3 old + 2 recent, threshold 4 ⇒ fires; keepRecent defaults to max_recent_changes.
  const paths = await seed(root, [
    ["chg_o1", daysAgo(90)],
    ["chg_o2", daysAgo(80)],
    ["chg_o3", daysAgo(70)],
    ["chg_o4", daysAgo(60)],
    ["chg_n1", daysAgo(1)],
  ]);

  const index = await readIndex(paths);
  index.auto_compact_after_changes = 4;
  index.max_recent_changes = 2;
  index.auto_compact_older_than_days = 30;
  await writeIndex(paths, index);

  const res = await maybeAutoCompact(paths);
  assert.ok(res);
  assert.ok(res.archived > 0);
  // The two newest stay regardless of age.
  const remaining = (await readChanges(paths)).map((c) => c.id);
  assert.ok(remaining.includes("chg_o4"));
  assert.ok(remaining.includes("chg_n1"));
});

test("maybeAutoCompact is disabled when threshold is 0", async () => {
  const root = await tmpProject();
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = await seed(root, [
    ["chg_a", daysAgo(90)],
    ["chg_b", daysAgo(80)],
    ["chg_c", daysAgo(70)],
  ]);

  const index = await readIndex(paths);
  index.auto_compact_after_changes = 0;
  await writeIndex(paths, index);

  const res = await maybeAutoCompact(paths);
  assert.equal(res, null);
  assert.equal((await readChanges(paths)).length, 3);
});
