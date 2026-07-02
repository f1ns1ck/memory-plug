import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initMemory } from "../mcp-server/dist/tools/initMemory.js";
import { captureChange } from "../mcp-server/dist/tools/captureChange.js";

const CLI = fileURLToPath(
  new URL("../mcp-server/dist/cli/sessionStart.js", import.meta.url),
);

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-ss-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

/** Run the SessionStart hook CLI with a JSON payload on stdin. */
function runHook(payload) {
  const out = execFileSync(process.execPath, [CLI], {
    input: JSON.stringify(payload),
    // Blank out CLAUDE_PROJECT_DIR so the hook resolves from payload.cwd,
    // like a hook invocation outside this repo would.
    env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
    stdio: ["pipe", "pipe", "pipe"],
  }).toString();
  return JSON.parse(out);
}

test("sessionStart hook skips silently when memory is not initialized", async () => {
  const dir = await makeRepo();
  const out = runHook({ cwd: dir, source: "startup" });
  assert.deepEqual(out, { continue: true, suppressOutput: true });
});

test("sessionStart hook injects the compact snapshot when initialized", async () => {
  const dir = await makeRepo();
  await initMemory({ projectPath: dir });
  await fs.writeFile(path.join(dir, "app.ts"), "export const x = 2\n");
  const captured = await captureChange({ projectPath: dir, reason: "bootstrap test" });
  const id = captured.match(/chg_[\w]+/)[0];

  const out = runHook({ cwd: dir, source: "startup" });
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /# Session Context/, "carries the snapshot header");
  assert.match(ctx, new RegExp(id), "mentions the captured change");
  assert.doesNotMatch(ctx, /^diff --git/m, "never includes a raw diff");
});

test("sessionStart hook never fails on a non-repo directory", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acm-ss-plain-"));
  const out = runHook({ cwd: dir, source: "startup" });
  assert.deepEqual(out, { continue: true, suppressOutput: true });
});
