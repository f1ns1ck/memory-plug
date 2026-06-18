import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { isInitialized } from "../core/memoryStore.js";
import { isGitRepo } from "../core/git.js";
import { buildWorkingTreeDiff, fingerprintDiff } from "../core/workingTree.js";
import { runCapture } from "./captureChange.js";

export interface AutoCaptureChangeInput {
  projectPath?: string;
  reason?: string;
  sourceTool?: string;
  sourceFile?: string;
  debounceMs?: number;
  /** When true, return a Claude Code hook-compatible JSON string instead of text. */
  asHookOutput?: boolean;
}

export const DEFAULT_DEBOUNCE_MS = 30000;
export const AUTO_STATE_FILE = "auto-capture.json";

interface AutoCaptureState {
  last_fingerprint?: string;
  last_capture_at?: string; // ISO
  last_change_id?: string;
  last_skip_reason?: string;
}

function stateFile(memoryDir: string): string {
  return path.join(memoryDir, AUTO_STATE_FILE);
}

async function readState(memoryDir: string): Promise<AutoCaptureState> {
  try {
    return JSON.parse(await fs.readFile(stateFile(memoryDir), "utf8")) as AutoCaptureState;
  } catch {
    return {};
  }
}

async function writeState(memoryDir: string, state: AutoCaptureState): Promise<void> {
  await fs.writeFile(stateFile(memoryDir), JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Hook-compatible output. PostToolUse hooks may emit JSON on stdout; we keep it
 * minimal and non-intrusive: never block Claude, suppress transcript noise.
 */
function hookOutput(extra?: Record<string, unknown>): string {
  return JSON.stringify({ continue: true, suppressOutput: true, ...extra });
}

function autoReason(input: AutoCaptureChangeInput): string {
  if (input.reason && input.reason.trim()) return input.reason.trim();
  const tool = input.sourceTool ? input.sourceTool : "edit";
  const file = input.sourceFile ? ` ${input.sourceFile}` : "";
  return `auto-capture after ${tool}${file}`;
}

/**
 * Automatically capture the current working-tree diff after Claude edits files.
 * Debounced and deduplicated so it is safe to wire to a PostToolUse hook.
 *
 * Skips silently (never throws to a hook) when:
 *  - memory is not initialized;
 *  - the path is not a git repo;
 *  - the working tree is clean;
 *  - the diff fingerprint matches the last capture (dedupe);
 *  - the last capture was within `debounceMs`.
 *
 * Safety: read-only git access only. Never runs add / commit / checkout or any
 * destructive git operation.
 */
export async function autoCaptureChange(input: AutoCaptureChangeInput): Promise<string> {
  const projectRoot = resolveProjectRoot(input.projectPath);
  const paths = memoryPaths(projectRoot);
  const asHook = !!input.asHookOutput;

  const skip = (reason: string): string =>
    asHook ? hookOutput() : `Auto-capture skipped: ${reason}.`;

  // Soft guards — auto-capture must never disrupt normal work.
  if (!(await isInitialized(paths))) return skip("Change Memory not initialized");
  if (!(await isGitRepo(projectRoot))) return skip("not a git repository");

  const wt = await buildWorkingTreeDiff(projectRoot);
  if (wt.isEmpty) return skip("working tree is clean");

  const fingerprint = fingerprintDiff(wt.diff);
  const state = await readState(paths.memoryDir);
  const debounceMs =
    typeof input.debounceMs === "number" && input.debounceMs >= 0
      ? input.debounceMs
      : DEFAULT_DEBOUNCE_MS;
  const now = Date.now();

  // Dedupe: identical change set already captured.
  if (state.last_fingerprint === fingerprint) {
    await writeState(paths.memoryDir, { ...state, last_skip_reason: "dedupe" });
    return skip("diff identical to last capture (dedupe)");
  }

  // Debounce: too soon after the previous capture.
  if (state.last_capture_at) {
    const elapsed = now - Date.parse(state.last_capture_at);
    if (Number.isFinite(elapsed) && elapsed < debounceMs) {
      await writeState(paths.memoryDir, { ...state, last_skip_reason: "debounce" });
      return skip(`debounced (${elapsed}ms < ${debounceMs}ms since last capture)`);
    }
  }

  // Capture, reusing the diff we already computed.
  const result = await runCapture({ projectPath: projectRoot, reason: autoReason(input) }, wt);
  if (!result.captured) {
    return skip(result.message);
  }

  await writeState(paths.memoryDir, {
    last_fingerprint: fingerprint,
    last_capture_at: new Date(now).toISOString(),
    last_change_id: result.changeId,
  });

  if (asHook) return hookOutput();
  return [
    `Auto-captured ${result.changeId}`,
    input.sourceTool ? `Trigger: ${input.sourceTool}${input.sourceFile ? ` (${input.sourceFile})` : ""}` : null,
    ``,
    result.message,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
