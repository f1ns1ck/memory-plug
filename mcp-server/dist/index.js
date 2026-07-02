#!/usr/bin/env node
import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { initMemory } from "./tools/initMemory.js";
import { captureChange } from "./tools/captureChange.js";
import { configure } from "./tools/configure.js";
import { getSessionContext } from "./tools/getSessionContext.js";
import { showChange } from "./tools/showChange.js";
import { listChanges } from "./tools/listChanges.js";
import { searchChanges } from "./tools/searchChanges.js";
import { summarizeBranch } from "./tools/summarizeBranch.js";
import { compactMemory } from "./tools/compactMemory.js";
import { toErrorMessage } from "./utils/errors.js";
import { CHANGE_TYPES } from "./core/types.js";
const projectPathProp = {
    projectPath: {
        type: "string",
        description: "Absolute path to the project root. Defaults to the directory the MCP server runs in.",
    },
};
const tools = [
    {
        name: "init_memory",
        description: "Initialize local .change-memory/ for the project (index.json, changes.jsonl, session.md, patches/, summaries/).",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                projectName: { type: "string", description: "Human-readable project name." },
                sharePatches: {
                    type: "boolean",
                    description: "Opt-in: commit patches/ so teammates can load any change's diff. Re-run to toggle (default OFF — patches stay machine-local).",
                },
            },
        },
        handler: (a) => initMemory(a ?? {}),
    },
    {
        name: "capture_change",
        description: "Capture the current working-tree git diff: store a compressed patch, generate a semantic summary, append to changes.jsonl, and refresh the compact session snapshot. Does not commit or modify user code.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                changeType: {
                    type: "string",
                    enum: CHANGE_TYPES,
                    description: "Optional change type hint.",
                },
                reason: { type: "string", description: "Why this change was made." },
                tests: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tests added/affected.",
                },
                unresolvedItems: {
                    type: "array",
                    items: { type: "string" },
                    description: "Open issues / TODOs to carry forward.",
                },
                llmSummary: {
                    type: "string",
                    description: "Optional agent-authored one-line semantic summary of what changed and why. YOU (the host model) write it from your understanding of the diff — the server makes no LLM/network call. Omit to use the offline heuristic. Use only for deliberate manual checkpoints, not reflexively.",
                },
                llmRisk: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional agent-authored risk notes, unioned with (not replacing) the heuristic risks so automatic security flags are never lost. Omit to keep only the heuristic risks.",
                },
                llmType: {
                    type: "string",
                    enum: CHANGE_TYPES,
                    description: "Optional agent-authored change type override (e.g. feature/fix/refactor). Omit to keep the heuristic classification.",
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional free-form labels for retrieval (e.g. [\"auth\", \"perf\"]). Lower-cased, de-duped and capped. They make list_changes/search_changes filterable by tag and boost ranking. Reserved for deliberate manual captures.",
                },
            },
        },
        handler: (a) => captureChange(a ?? {}),
    },
    {
        name: "configure",
        description: "Adjust Change Memory settings for this project. 'autoCapture' is a per-machine toggle for automatic capture (stored in the local, gitignored auto-capture.json — never affects teammates). 'sharePatches' is a team decision (stored in the committed index.json) for whether patches/ is committed so teammates can load any change's diff; toggling it regenerates the managed .gitignore. Provide a field to set it, omit a field to leave it unchanged; omit both to report the current state of each.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                autoCapture: {
                    type: "boolean",
                    description: "true to enable automatic capture on this machine, false to disable. Omit to leave unchanged.",
                },
                sharePatches: {
                    type: "boolean",
                    description: "true to commit patches/ for the team, false to keep them machine-local. Omit to leave unchanged.",
                },
            },
        },
        handler: (a) => configure(a ?? {}),
    },
    {
        name: "get_session_context",
        description: "Return a compact markdown memory snapshot for a new session. Never includes full diffs. Start every session here.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                maxTokens: {
                    type: "number",
                    description: "Override the bootstrap token budget.",
                },
            },
        },
        handler: (a) => getSessionContext(a ?? {}),
    },
    {
        name: "show_change",
        description: "Show the metadata of one change. Only includes the diff when includePatch is true (default false), or pass 'file' to load just one file's hunk.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                changeId: { type: "string", description: "The change id (chg_...)." },
                includePatch: {
                    type: "boolean",
                    description: "Load the full (possibly truncated) diff. Default false.",
                },
                file: {
                    type: "string",
                    description: "Return only the diff hunk for files whose path contains this substring. Cheaper than includePatch for large changes; takes precedence over includePatch.",
                },
            },
            required: ["changeId"],
        },
        handler: (a) => showChange(a),
    },
    {
        name: "list_changes",
        description: "List recent changes as a compact table: id | type | author | file | summary. Optional file/type/branch/tag filters.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                limit: { type: "number", description: "Max rows (default 20)." },
                file: { type: "string", description: "Filter by file substring." },
                type: { type: "string", enum: CHANGE_TYPES, description: "Filter by type." },
                branch: { type: "string", description: "Filter by exact branch name." },
                tag: { type: "string", description: "Filter by exact tag (case-insensitive)." },
            },
        },
        handler: (a) => listChanges(a ?? {}),
    },
    {
        name: "search_changes",
        description: "Search change history across summary, tags, reason, type, files, risk and tests. Ranked by field-weighted relevance (summary/tags weigh most) with a recency boost. Pass 'tag' to restrict to a label.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                query: { type: "string", description: "Search query." },
                limit: { type: "number", description: "Max results (default 20)." },
                tag: { type: "string", description: "Restrict to changes carrying this exact tag." },
            },
            required: ["query"],
        },
        handler: (a) => searchChanges(a),
    },
    {
        name: "summarize_branch",
        description: "Build a PR-ready markdown summary of the changes recorded on a branch: grouped by type, with touched files, risks and tests. Defaults to the current git branch. Read-only; never includes raw diffs.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                branch: {
                    type: "string",
                    description: "Branch to summarize. Defaults to the current git branch.",
                },
                limit: {
                    type: "number",
                    description: "Max changes to enumerate, newest first (default 50).",
                },
            },
        },
        handler: (a) => summarizeBranch(a ?? {}),
    },
    {
        name: "compact_memory",
        description: "Archive old changes into a summary file while keeping recent ones in active history. Patch files are preserved.",
        inputSchema: {
            type: "object",
            properties: {
                ...projectPathProp,
                olderThanDays: { type: "number", description: "Archive changes older than N days (default 30)." },
                keepRecent: { type: "number", description: "Always keep the newest N changes active." },
            },
        },
        handler: (a) => compactMemory(a ?? {}),
    },
];
const handlers = new Map(tools.map((t) => [t.name, t.handler]));
// Single source of truth for the version: read it from package.json at startup
// rather than hardcoding it, so the MCP handshake never drifts from the package.
const require = createRequire(import.meta.url);
const { version: pkgVersion } = require("../../package.json");
const server = new Server({ name: "change-memory", version: pkgVersion }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
    })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = handlers.get(request.params.name);
    if (!handler) {
        return {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        };
    }
    try {
        const text = await handler(request.params.arguments ?? {});
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${toErrorMessage(err)}` }],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Use stderr so we never corrupt the stdio JSON-RPC channel.
    process.stderr.write("change-memory MCP server running on stdio\n");
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${toErrorMessage(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map