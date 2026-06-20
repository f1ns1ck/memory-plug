import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";
import { autoCaptureChange } from "../mcp-server/dist/tools/autoCaptureChange.js";
import { setAutoCapture } from "../mcp-server/dist/tools/setAutoCapture.js";
import { setSharePatches } from "../mcp-server/dist/tools/setSharePatches.js";
import { memoryPaths } from "../mcp-server/dist/utils/paths.js";
import { readChanges } from "../mcp-server/dist/core/memoryStore.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-share-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "dev@example.com");
  git(dir, "config", "user.name", "Dev Example");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

test("init writes .change-memory/.gitignore with local-only entries (idempotent)", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const ignore = path.join(memoryPaths(dir).memoryDir, ".gitignore");
  const body = await fs.readFile(ignore, "utf8");
  for (const entry of ["patches/", "auto-capture.json", "session.md"]) {
    assert.match(body, new RegExp(`^${entry.replace("/", "\\/")}$`, "m"));
  }
  // Shared map files must NOT be ignored.
  assert.doesNotMatch(body, /^index\.json$/m);
  assert.doesNotMatch(body, /^changes\.jsonl$/m);

  // Idempotent: a customized file is left untouched.
  await fs.writeFile(ignore, "custom\n", "utf8");
  await initMemory({ projectPath: dir }); // already-initialized path
  assert.equal(await fs.readFile(ignore, "utf8"), "custom\n");
});

test("set_share_patches toggles whether patches/ is committed", async () => {
  const dir = await makeRepo();
  const ignore = path.join(memoryPaths(dir).memoryDir, ".gitignore");

  // Default: patches/ are local-only, and status reports OFF.
  await initMemory({ projectPath: dir });
  assert.match(await fs.readFile(ignore, "utf8"), /^patches\/$/m);
  assert.match(await setSharePatches({ projectPath: dir }), /OFF/);

  // Opt in: patches/ drop out of the managed gitignore and status flips ON.
  const on = await setSharePatches({ projectPath: dir, enabled: true });
  assert.match(on, /ON/);
  assert.doesNotMatch(await fs.readFile(ignore, "utf8"), /^patches\/$/m);
  assert.match(await setSharePatches({ projectPath: dir }), /ON/);

  // git now tracks a captured patch.
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 9\n");
  await captureChange({ projectPath: dir, reason: "patch share" });
  assert.match(
    git(dir, "status", "--porcelain", "--untracked-files=all"),
    /\.change-memory\/patches\//,
  );

  // Toggle back off: patches/ are ignored again.
  await setSharePatches({ projectPath: dir, enabled: false });
  assert.match(await fs.readFile(ignore, "utf8"), /^patches\/$/m);
});

test("init_memory still accepts sharePatches as an initial opt-in", async () => {
  const dir = await makeRepo();
  const ignore = path.join(memoryPaths(dir).memoryDir, ".gitignore");
  const out = await initMemory({ projectPath: dir, sharePatches: true });
  assert.match(out, /Patch sharing: ON/);
  assert.doesNotMatch(await fs.readFile(ignore, "utf8"), /^patches\/$/m);
});

test("git sees the shared map as tracked and local artifacts as ignored", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  await captureChange({ projectPath: dir, reason: "share test" });

  const status = git(dir, "status", "--porcelain", "--untracked-files=all");
  assert.match(status, /\.change-memory\/index\.json/);
  assert.match(status, /\.change-memory\/changes\.jsonl/);
  assert.doesNotMatch(status, /\.change-memory\/patches\//);
  assert.doesNotMatch(status, /auto-capture\.json/);
  assert.doesNotMatch(status, /\.change-memory\/session\.md/);
});

test("capture records the git author on the change", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 3\n");
  await captureChange({ projectPath: dir, reason: "author test" });

  const [change] = await readChanges(memoryPaths(dir));
  assert.equal(change.author, "Dev Example <dev@example.com>");
});

test("set_auto_capture off disables capture; on re-enables it", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const paths = memoryPaths(dir);

  const off = await setAutoCapture({ projectPath: dir, enabled: false });
  assert.match(off, /OFF/);

  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 4\n");
  const skipped = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(skipped, /disabled|skipped/i);
  assert.equal((await readChanges(paths)).length, 0);

  const on = await setAutoCapture({ projectPath: dir, enabled: true });
  assert.match(on, /ON/);
  const captured = await autoCaptureChange({ projectPath: dir, debounceMs: 0 });
  assert.match(captured, /Auto-captured/);
  assert.equal((await readChanges(paths)).length, 1);
});

test("set_auto_capture with no enabled reports current state", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  assert.match(await setAutoCapture({ projectPath: dir }), /ON/);
  await setAutoCapture({ projectPath: dir, enabled: false });
  assert.match(await setAutoCapture({ projectPath: dir }), /OFF/);
});
