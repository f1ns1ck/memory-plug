#!/usr/bin/env node
/**
 * PostToolUse hook entry point.
 *
 * Claude Code runs this as a `command` hook after Write/Edit/MultiEdit. It reads
 * the hook payload (JSON) from stdin, derives the project path and trigger
 * metadata, then delegates to the same auto-capture logic exposed by the MCP
 * `auto_capture_change` tool. Output is the hook-compatible JSON the tool
 * already produces, so capture stays debounced, deduped and non-intrusive.
 *
 * It must never fail the hook: any error is swallowed into a benign
 * `{ "continue": true }` so editing is never disrupted.
 */
import { autoCaptureChange } from "../tools/autoCaptureChange.js";
function readStdin() {
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
async function main() {
    let payload = {};
    try {
        const raw = await readStdin();
        if (raw.trim())
            payload = JSON.parse(raw);
    }
    catch {
        // Malformed/empty stdin — fall back to env/cwd below.
    }
    const projectPath = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
    const sourceTool = payload.tool_name;
    const sourceFile = payload.tool_input && typeof payload.tool_input.file_path === "string"
        ? payload.tool_input.file_path
        : undefined;
    const output = await autoCaptureChange({
        projectPath,
        sourceTool,
        sourceFile,
        asHookOutput: true,
    });
    process.stdout.write(output);
}
main().catch(() => {
    // Never disrupt editing: emit a benign, non-blocking hook result.
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
});
//# sourceMappingURL=autoCapture.js.map