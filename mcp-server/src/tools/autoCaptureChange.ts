import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveProjectRoot, memoryPaths } from "../utils/paths.js";
import { isInitialized, readIndex, readChanges } from "../core/memoryStore.js";
import { isGitRepo, getBranch } from "../core/git.js";
import { DEFAULT_COALESCE_WINDOW_MS } from "../core/types.js";
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

export interface AutoCaptureState {
  /** When false, auto-capture is disabled for this machine (toggle via
   * set_auto_capture / `/memory-auto off`). Undefined ⇒ enabled. */
  enabled?: boolean;
  last_fingerprint?: string;
  last_capture_at?: string; // ISO
  last_change_id?: string;
  last_skip_reason?: string;
}

function stateFile(memoryDir: string): string {
  return path.join(memoryDir, AUTO_STATE_FILE);
}

export async function readAutoState(memoryDir: string): Promise<AutoCaptureState> {
  try {
    return JSON.parse(await fs.readFile(stateFile(memoryDir), "utf8")) as AutoCaptureState;
  } catch {
    return {};
  }
}

export async function writeAutoState(
  memoryDir: string,
  state: AutoCaptureState,
): Promise<void> {
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

  // Per-machine toggle: honored before any git work so a disabled hook is cheap.
  const preState = await readAutoState(paths.memoryDir);
  if (preState.enabled === false) return skip("auto-capture disabled");

  if (!(await isGitRepo(projectRoot))) return skip("not a git repository");

  const wt = await buildWorkingTreeDiff(projectRoot);
  if (wt.isEmpty) return skip("working tree is clean");

  const fingerprint = fingerprintDiff(wt.diff);
  const state = preState;
  const debounceMs =
    typeof input.debounceMs === "number" && input.debounceMs >= 0
      ? input.debounceMs
      : DEFAULT_DEBOUNCE_MS;
  const now = Date.now();

  // Dedupe: identical change set already captured.
  if (state.last_fingerprint === fingerprint) {
    await writeAutoState(paths.memoryDir, { ...state, last_skip_reason: "dedupe" });
    return skip("diff identical to last capture (dedupe)");
  }

  // Debounce: too soon after the previous capture.
  if (state.last_capture_at) {
    const elapsed = now - Date.parse(state.last_capture_at);
    if (Number.isFinite(elapsed) && elapsed < debounceMs) {
      await writeAutoState(paths.memoryDir, { ...state, last_skip_reason: "debounce" });
      return skip(`debounced (${elapsed}ms < ${debounceMs}ms since last capture)`);
    }
  }

  // Coalesce: while consecutive auto-captures land on the same branch within the
  // configured window, fold them into one evolving change instead of appending a
  // near-duplicate. Best-effort — any failure here just means a normal append.
  let replaceChangeId: string | undefined;
  try {
    const index = await readIndex(paths);
    const windowMs =
      typeof index.coalesce_window_ms === "number"
        ? index.coalesce_window_ms
        : DEFAULT_COALESCE_WINDOW_MS;
    if (windowMs > 0 && state.last_change_id && state.last_capture_at) {
      const sinceLast = now - Date.parse(state.last_capture_at);
      if (Number.isFinite(sinceLast) && sinceLast < windowMs) {
        const last = (await readChanges(paths)).find((c) => c.id === state.last_change_id);
        if (last) {
          const branch = await getBranch(projectRoot);
          if ((last.branch ?? "") === (branch ?? "")) replaceChangeId = last.id;
        }
      }
    }
  } catch {
    // Coalescing is an optimization; never let it block a capture.
  }

  // Capture, reusing the diff we already computed.
  const result = await runCapture(
    { projectPath: projectRoot, reason: autoReason(input) },
    wt,
    { replaceChangeId },
  );
  if (!result.captured) {
    return skip(result.message);
  }

  await writeAutoState(paths.memoryDir, {
    ...state,
    last_fingerprint: fingerprint,
    last_capture_at: new Date(now).toISOString(),
    last_change_id: result.changeId,
    last_skip_reason: undefined,
  });

  if (asHook) return hookOutput();
  return [
    `${result.coalesced ? "Auto-updated" : "Auto-captured"} ${result.changeId}`,
    input.sourceTool ? `Trigger: ${input.sourceTool}${input.sourceFile ? ` (${input.sourceFile})` : ""}` : null,
    ``,
    result.message,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
