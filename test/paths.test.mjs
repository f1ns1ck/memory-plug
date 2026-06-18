import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  ensureInsideRoot,
  toPosix,
  memoryPaths,
  resolveProjectRoot,
} from "../mcp-server/dist/utils/paths.js";

test("toPosix normalizes separators", () => {
  assert.equal(toPosix(path.join("a", "b", "c.ts")), "a/b/c.ts");
});

test("ensureInsideRoot allows nested paths", () => {
  const root = path.resolve("/tmp/project");
  const resolved = ensureInsideRoot(root, "src/index.ts");
  assert.equal(resolved, path.resolve(root, "src/index.ts"));
});

test("ensureInsideRoot rejects ../ traversal", () => {
  const root = path.resolve("/tmp/project");
  assert.throws(() => ensureInsideRoot(root, "../secret.txt"), /PATH_OUTSIDE_ROOT|outside/);
});

test("ensureInsideRoot rejects absolute escape", () => {
  const root = path.resolve("/tmp/project");
  const escape = path.resolve("/etc/passwd");
  assert.throws(() => ensureInsideRoot(root, escape), /outside/);
});

test("memoryPaths builds expected layout", () => {
  const root = path.resolve("/tmp/project");
  const p = memoryPaths(root);
  assert.ok(p.indexFile.endsWith(path.join(".change-memory", "index.json")));
  assert.ok(p.changesFile.endsWith(path.join(".change-memory", "changes.jsonl")));
  assert.ok(p.patchesDir.endsWith(path.join(".change-memory", "patches")));
});

test("resolveProjectRoot falls back to cwd", () => {
  assert.equal(resolveProjectRoot(), path.resolve(process.cwd()));
});
