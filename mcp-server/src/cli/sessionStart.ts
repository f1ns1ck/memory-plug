#!/usr/bin/env node
/**
 * SessionStart hook entry point.
 *
 * Claude Code runs this as a `command` hook when a session starts. It reads the
 * hook payload (JSON) from stdin, derives the project path, and — when Change
 * Memory is initialized for that project — emits the compact session snapshot
 * as `additionalContext`, so the agent starts already knowing the recent change
 * history without anyone running /memory-session by hand.
 *
 * The snapshot is the same budget-aware markdown `get_session_context` returns:
 * summaries, active files, open issues, risks — never a full diff.
 *
 * It must never fail the hook: uninitialized memory, a non-git directory or any
 * error collapses into a benign `{ "continue": true }` so session start is
 * never disrupted.
 */
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { isInitialized } from "../core/memoryStore.js";
import { getSessionContext } from "../tools/getSessionContext.js";

interface HookInput {
  cwd?: string;
  source?: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const stdin = process.stdin;
    if (stdin.isTTY) {
      resolve("");
      return;
    }
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => (data += chunk));
    stdin.on("end", () => resolve(data));
    stdin.on("error", () => resolve(data));
  });
}

function skip(): void {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
}

async function main(): Promise<void> {
  let payload: HookInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) payload = JSON.parse(raw) as HookInput;
  } catch {
    // Malformed/empty stdin — fall back to env/cwd below.
  }

  const projectPath =
    process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

  const projectRoot = resolveProjectRoot(projectPath);
  const paths = memoryPaths(projectRoot);
  if (!(await isInitialized(paths))) {
    skip();
    return;
  }

  const context = await getSessionContext({ projectPath: projectRoot });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    }),
  );
}

main().catch(() => {
  // Never disrupt session start: emit a benign, non-blocking hook result.
  skip();
});
