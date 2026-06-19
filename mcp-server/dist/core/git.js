import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MemoryError } from "../utils/errors.js";
const execFileAsync = promisify(execFile);
/**
 * Read-only git access. Only an explicit allow-list of argument vectors is ever
 * executed. We never run a shell, never interpolate user input into a command
 * string, and never run write operations (commit, add, checkout, etc.).
 */
const ALLOWED_ARGS = [
    ["diff"],
    ["diff", "--name-only"],
    ["diff", "--name-status"],
    ["status", "--porcelain"],
    ["status", "--porcelain", "--untracked-files=all"],
    ["rev-parse", "--is-inside-work-tree"],
    ["config", "user.name"],
    ["config", "user.email"],
];
function assertAllowed(args) {
    const ok = ALLOWED_ARGS.some((allowed) => allowed.length === args.length && allowed.every((a, i) => a === args[i]));
    if (!ok) {
        throw new MemoryError("GIT_FORBIDDEN", `Refusing to run non-allowlisted git command: git ${args.join(" ")}`);
    }
}
async function git(cwd, args) {
    assertAllowed(args);
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        });
        return stdout;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new MemoryError("GIT_FAILED", `git ${args.join(" ")} failed: ${message}`);
    }
}
export async function isGitRepo(cwd) {
    try {
        const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
        return out.trim() === "true";
    }
    catch {
        return false;
    }
}
/** Full unified working-tree diff (unstaged + tracked changes). */
export async function getDiff(cwd) {
    return git(cwd, ["diff"]);
}
export async function getChangedFiles(cwd) {
    const out = await git(cwd, ["diff", "--name-only"]);
    return out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}
/** Parse `git diff --name-status` into added/modified/removed buckets. */
export async function getNameStatus(cwd) {
    const out = await git(cwd, ["diff", "--name-status"]);
    const entries = [];
    for (const line of out.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const parts = trimmed.split("\t");
        const status = parts[0] ?? "";
        // Renames look like `R100\told\tnew`; record the new path.
        const file = parts[parts.length - 1] ?? "";
        if (file)
            entries.push({ status: status[0] ?? "M", file });
    }
    return entries;
}
export async function getStatusPorcelain(cwd) {
    return git(cwd, ["status", "--porcelain"]);
}
/**
 * Untracked files (porcelain `??`). Plain `git diff` ignores these, but for a
 * change-memory tool a brand-new file is exactly the kind of "added" change we
 * want to record. Read-only: we only parse status output.
 */
/**
 * Read the committer identity from git config as "Name <email>" so changes can
 * be attributed when memory is shared across a team. Returns undefined when
 * neither name nor email is configured. Read-only: only `git config <key>` runs,
 * which never mutates the repo.
 */
export async function getAuthor(cwd) {
    const read = async (key) => {
        try {
            const out = await git(cwd, ["config", key]);
            return out.trim();
        }
        catch {
            // `git config <key>` exits non-zero when the key is unset.
            return "";
        }
    };
    const name = await read("user.name");
    const email = await read("user.email");
    if (name && email)
        return `${name} <${email}>`;
    if (name)
        return name;
    if (email)
        return `<${email}>`;
    return undefined;
}
export async function getUntrackedFiles(cwd) {
    // `--untracked-files=all` expands untracked directories into individual files.
    const out = await git(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    const files = [];
    for (const line of out.split("\n")) {
        if (!line.startsWith("?? "))
            continue;
        let file = line.slice(3).trim();
        // Porcelain quotes paths with special chars; strip surrounding quotes.
        if (file.startsWith('"') && file.endsWith('"')) {
            file = file.slice(1, -1);
        }
        // Never capture our own memory directory.
        if (!file || file === ".change-memory" || file.startsWith(".change-memory/"))
            continue;
        files.push(file);
    }
    return files;
}
//# sourceMappingURL=git.js.map