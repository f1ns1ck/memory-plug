import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { configure } from "../mcp-server/dist/tools/configure.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-config-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

test("configure with no fields reports both settings (defaults)", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  const out = await configure({ projectPath: dir });
  assert.match(out, /Auto-capture is ON/);
  assert.match(out, /Patch sharing is OFF/);
});

test("configure sets only the provided field and leaves the other unchanged", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  const off = await configure({ projectPath: dir, autoCapture: false });
  assert.match(off, /Auto-capture is now OFF/);
  // Patch sharing was not provided, so it is merely reported (still OFF).
  assert.match(off, /Patch sharing is OFF/);

  // The auto-capture change persisted; sharing is still untouched.
  const status = await configure({ projectPath: dir });
  assert.match(status, /Auto-capture is OFF/);
  assert.match(status, /Patch sharing is OFF/);
});

test("configure can set both settings at once", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });

  const out = await configure({ projectPath: dir, autoCapture: false, sharePatches: true });
  assert.match(out, /Auto-capture is now OFF/);
  assert.match(out, /Patch sharing is now ON/);

  // sharePatches is a team setting: the managed .gitignore must stop ignoring patches/.
  const ignore = await fs.readFile(
    path.join(dir, ".change-memory", ".gitignore"),
    "utf8",
  );
  assert.doesNotMatch(ignore, /^patches\/$/m);
});
