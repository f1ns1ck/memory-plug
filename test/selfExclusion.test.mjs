import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

/** Tmp git repo with one committed source file. */
async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-self-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

test("capture never records the committed .change-memory map as a change", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  // Reproduce the recommended team workflow: the shared map is committed. After
  // an initial capture, commit so index.json + changes.jsonl become *tracked*
  // (init's .change-memory/.gitignore keeps patches/, session.md and
  // auto-capture.json out of git).
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  await captureChange({ projectPath: dir, reason: "first" });
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "snapshot memory");

  // The first post-commit capture writes to the now-tracked memory files,
  // leaving them dirty (uncommitted) in the working tree.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");
  await captureChange({ projectPath: dir, reason: "third" });

  // The second post-commit capture's `git diff` would otherwise include those
  // dirty memory files. It must not: the store is excluded from the diff.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 4\n");
  await captureChange({ projectPath: dir, reason: "fourth" });

  const changes = await readChanges(memoryPaths(dir));
  const last = changes[changes.length - 1];
  for (const f of last.files) {
    assert.ok(
      !f.includes(".change-memory"),
      `captured file list must exclude the memory store, got: ${f}`,
    );
  }
  assert.deepEqual(last.files, ["app.ts"]);
});
