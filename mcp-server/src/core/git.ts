import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MemoryError } from "../utils/errors.js";

const execFileAsync = promisify(execFile);

/**
 * Read-only git access. Only an explicit allow-list of argument vectors is ever
 * executed. We never run a shell, never interpolate user input into a command
 * string, and never run write operations (commit, add, checkout, etc.).
 */
const ALLOWED_ARGS: readonly (readonly string[])[] = [
  ["diff"],
  ["diff", "--name-only"],
  ["diff", "--name-status"],
  ["status", "--porcelain"],
  ["status", "--porcelain", "--untracked-files=all"],
  ["rev-parse", "--is-inside-work-tree"],
];

function assertAllowed(args: string[]): void {
  const ok = ALLOWED_ARGS.some(
    (allowed) =>
      allowed.length === args.length && allowed.every((a, i) => a === args[i]),
  );
  if (!ok) {
    throw new MemoryError(
      "GIT_FORBIDDEN",
      `Refusing to run non-allowlisted git command: git ${args.join(" ")}`,
    );
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  assertAllowed(args);
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MemoryError("GIT_FAILED", `git ${args.join(" ")} failed: ${message}`);
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/** Full unified working-tree diff (unstaged + tracked changes). */
export async function getDiff(cwd: string): Promise<string> {
  return git(cwd, ["diff"]);
}

export async function getChangedFiles(cwd: string): Promise<string[]> {
  const out = await git(cwd, ["diff", "--name-only"]);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export interface NameStatusEntry {
  status: string; // A, M, D, R, ...
  file: string;
}

/** Parse `git diff --name-status` into added/modified/removed buckets. */
export async function getNameStatus(cwd: string): Promise<NameStatusEntry[]> {
  const out = await git(cwd, ["diff", "--name-status"]);
  const entries: NameStatusEntry[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    const status = parts[0] ?? "";
    // Renames look like `R100\told\tnew`; record the new path.
    const file = parts[parts.length - 1] ?? "";
    if (file) entries.push({ status: status[0] ?? "M", file });
  }
  return entries;
}

export async function getStatusPorcelain(cwd: string): Promise<string> {
  return git(cwd, ["status", "--porcelain"]);
}

/**
 * Untracked files (porcelain `??`). Plain `git diff` ignores these, but for a
 * change-memory tool a brand-new file is exactly the kind of "added" change we
 * want to record. Read-only: we only parse status output.
 */
export async function getUntrackedFiles(cwd: string): Promise<string[]> {
  // `--untracked-files=all` expands untracked directories into individual files.
  const out = await git(cwd, ["status", "--porcelain", "--untracked-files=all"]);
  const files: string[] = [];
  for (const line of out.split("\n")) {
    if (!line.startsWith("?? ")) continue;
    let file = line.slice(3).trim();
    // Porcelain quotes paths with special chars; strip surrounding quotes.
    if (file.startsWith('"') && file.endsWith('"')) {
      file = file.slice(1, -1);
    }
    // Never capture our own memory directory.
    if (!file || file === ".change-memory" || file.startsWith(".change-memory/")) continue;
    files.push(file);
  }
  return files;
}
