import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { showChange } from "../mcp-server/dist/tools/showChange.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { appendChange } from "../mcp-server/dist/core/memoryStore.js";
import {
  savePatch,
  patchRelativePath,
  extractFilePatch,
} from "../mcp-server/dist/core/patchStore.js";

async function tmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acm-show-"));
}

const TWO_FILE_PATCH = [
  "diff --git a/src/alpha.ts b/src/alpha.ts",
  "index 1111111..2222222 100644",
  "--- a/src/alpha.ts",
  "+++ b/src/alpha.ts",
  "@@ -1,2 +1,3 @@",
  " const a = 1;",
  "+const added = 2;",
  " export { a };",
  "diff --git a/src/beta.ts b/src/beta.ts",
  "index 3333333..4444444 100644",
  "--- a/src/beta.ts",
  "+++ b/src/beta.ts",
  "@@ -1 +1 @@",
  "-const old = true;",
  "+const fresh = false;",
].join("\n");

test("extractFilePatch returns only the matching file's hunk", () => {
  const { text, matched, available } = extractFilePatch(
    TWO_FILE_PATCH,
    "alpha.ts",
  );
  assert.deepEqual(available, ["src/alpha.ts", "src/beta.ts"]);
  assert.deepEqual(matched, ["src/alpha.ts"]);
  assert.match(text, /const added = 2;/);
  assert.doesNotMatch(text, /const fresh = false;/);
});

test("extractFilePatch reports a miss with the available files", () => {
  const { matched, available } = extractFilePatch(TWO_FILE_PATCH, "gamma.ts");
  assert.deepEqual(matched, []);
  assert.deepEqual(available, ["src/alpha.ts", "src/beta.ts"]);
});

test("extractFilePatch can match multiple files by substring", () => {
  const { matched } = extractFilePatch(TWO_FILE_PATCH, "src/");
  assert.deepEqual(matched, ["src/alpha.ts", "src/beta.ts"]);
});

async function seedChange(root) {
  await initMemory({ projectPath: root, projectName: "demo" });
  const paths = memoryPaths(root);
  const id = "chg_show_test";
  await savePatch(paths.patchesDir, id, TWO_FILE_PATCH);
  await appendChange(paths, {
    id,
    timestamp: new Date().toISOString(),
    files: ["src/alpha.ts", "src/beta.ts"],
    type: "fix",
    summary: "two-file change",
    added: [],
    modified: ["src/alpha.ts", "src/beta.ts"],
    removed: [],
    reason: "",
    risk: [],
    tests: [],
    patch_file: patchRelativePath(id),
    token_cost_estimate: 10,
  });
  return id;
}

test("show_change with file returns just that file's diff", async () => {
  const root = await tmpProject();
  const id = await seedChange(root);
  const out = await showChange({
    projectPath: root,
    changeId: id,
    file: "beta.ts",
  });
  assert.match(out, /## Patch \(file: src\/beta\.ts\)/);
  assert.match(out, /const fresh = false;/);
  assert.doesNotMatch(out, /const added = 2;/);
});

test("show_change with an unknown file lists available files", async () => {
  const root = await tmpProject();
  const id = await seedChange(root);
  const out = await showChange({
    projectPath: root,
    changeId: id,
    file: "nope.ts",
  });
  assert.match(out, /No file in this change matches "nope\.ts"/);
  assert.match(out, /src\/alpha\.ts, src\/beta\.ts/);
});
