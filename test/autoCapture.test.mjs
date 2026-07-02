import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import {
  autoCaptureChange,
  AUTO_STATE_FILE,
} from "../mcp-server/dist/tools/autoCaptureChange.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges, readIndex, writeIndex } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

/** Create a tmp git repo with one committed file. */
async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-auto-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

async function readState(dir) {
  const paths = memoryPaths(dir);
  return JSON.parse(await fs.readFile(path.join(paths.memoryDir, AUTO_STATE_FILE), "utf8"));
}

test("auto_capture: nothing saved on empty working tree", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const out = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(out, /skipped/i);
  assert.equal((await readChanges(memoryPaths(dir))).length, 0);
});

test("auto_capture: duplicate diff is deduped; a follow-up diff coalesces into the same change", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  const first = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(first, /Auto-captured/);
  const [rec1] = await readChanges(paths);
  assert.equal((await readChanges(paths)).length, 1);

  // Same diff again -> dedupe, no new entry.
  const dup = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(dup, /dedupe|skipped/i);
  assert.equal((await readChanges(paths)).length, 1);

  // Different diff within the coalesce window -> updates the same evolving change,
  // not a new entry. The id is preserved; the summary tracks the latest content.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");
  const second = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(second, /Auto-updated/);
  const after = await readChanges(paths);
  assert.equal(after.length, 1, "burst folds into one record");
  assert.equal(after[0].id, rec1.id, "coalescing keeps the original id");
});

test("auto_capture: coalescing disabled (window 0) appends distinct entries", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  const index = await readIndex(paths);
  index.coalesce_window_ms = 0;
  await writeIndex(paths, index);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.equal((await readChanges(paths)).length, 1);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");
  const second = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(second, /Auto-captured/);
  assert.equal((await readChanges(paths)).length, 2);
});

test("auto_capture: debounce window suppresses a capture", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.equal((await readChanges(paths)).length, 1);

  // New diff but within a long debounce window -> suppressed.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 99\n");
  const out = await autoCaptureChange({ projectPath: dir, debounceMs: 60000 });
  assert.match(out, /debounc/i);
  assert.equal((await readChanges(paths)).length, 1);
});

test("manual capture_change still works as before", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 7\n");
  const out = await captureChange({ projectPath: dir, reason: "manual" });
  assert.match(out, /Captured change/);
  assert.equal((await readChanges(paths)).length, 1);
});

test("auto-capture.json is updated correctly", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 5\n");
  await autoCaptureChange({ projectPath: dir, debounceMs: 0 });

  const state = await readState(dir);
  assert.ok(state.last_change_id && state.last_change_id.startsWith("chg_"));
  assert.ok(typeof state.last_fingerprint === "string" && state.last_fingerprint.length > 0);
  assert.ok(!Number.isNaN(Date.parse(state.last_capture_at)));
});

test("asHookOutput returns hook-compatible JSON (skip and capture)", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  // Clean tree -> skip, still valid hook JSON.
  const skip = await autoCaptureChange({ projectPath: dir, asHookOutput: true, debounceMs: 0 });
  const skipObj = JSON.parse(skip);
  assert.equal(skipObj.continue, true);
  assert.equal(skipObj.suppressOutput, true);

  // Capture -> valid hook JSON.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 8\n");
  const cap = await autoCaptureChange({ projectPath: dir, asHookOutput: true, debounceMs: 0 });
  const capObj = JSON.parse(cap);
  assert.equal(capObj.continue, true);
  assert.equal((await readChanges(memoryPaths(dir))).length, 1);
});
