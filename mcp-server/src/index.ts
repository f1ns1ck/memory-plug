#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { initMemory } from "./tools/initMemory.js";
import { captureChange } from "./tools/captureChange.js";
import { getSessionContext } from "./tools/getSessionContext.js";
import { showChange } from "./tools/showChange.js";
import { listChanges } from "./tools/listChanges.js";
import { searchChanges } from "./tools/searchChanges.js";
import { compactMemory } from "./tools/compactMemory.js";
import { toErrorMessage } from "./utils/errors.js";
import { CHANGE_TYPES } from "./core/types.js";

const projectPathProp = {
  projectPath: {
    type: "string",
    description:
      "Absolute path to the project root. Defaults to the directory the MCP server runs in.",
  },
} as const;

const tools = [
  {
    name: "init_memory",
    description:
      "Initialize local .change-memory/ for the project (index.json, changes.jsonl, session.md, patches/, summaries/).",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProp,
        projectName: { type: "string", description: "Human-readable project name." },
      },
    },
    handler: (a: any) => initMemory(a ?? {}),
  },
  {
    name: "capture_change",
    description:
      "Capture the current working-tree git diff: store a compressed patch, generate a semantic summary, append to changes.jsonl, and refresh the compact session snapshot. Does not commit or modify user code.",
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
      },
    },
    handler: (a: any) => captureChange(a ?? {}),
  },
  {
    name: "get_session_context",
    description:
      "Return a compact markdown memory snapshot for a new session. Never includes full diffs. Start every session here.",
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
    handler: (a: any) => getSessionContext(a ?? {}),
  },
  {
    name: "show_change",
    description:
      "Show the metadata of one change. Only includes the diff when includePatch is true (default false).",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProp,
        changeId: { type: "string", description: "The change id (chg_...)." },
        includePatch: {
          type: "boolean",
          description: "Load the full (possibly truncated) diff. Default false.",
        },
      },
      required: ["changeId"],
    },
    handler: (a: any) => showChange(a),
  },
  {
    name: "list_changes",
    description:
      "List recent changes as a compact table: id | type | file | summary. Optional file/type filters.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProp,
        limit: { type: "number", description: "Max rows (default 20)." },
        file: { type: "string", description: "Filter by file substring." },
        type: { type: "string", enum: CHANGE_TYPES, description: "Filter by type." },
      },
    },
    handler: (a: any) => listChanges(a ?? {}),
  },
  {
    name: "search_changes",
    description:
      "Search change history across id, summary, files, reason, risk and tests.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProp,
        query: { type: "string", description: "Search query." },
        limit: { type: "number", description: "Max results (default 20)." },
      },
      required: ["query"],
    },
    handler: (a: any) => searchChanges(a),
  },
  {
    name: "compact_memory",
    description:
      "Archive old changes into a summary file while keeping recent ones in active history. Patch files are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProp,
        olderThanDays: { type: "number", description: "Archive changes older than N days (default 30)." },
        keepRecent: { type: "number", description: "Always keep the newest N changes active." },
      },
    },
    handler: (a: any) => compactMemory(a ?? {}),
  },
] as const;

const handlers = new Map<string, (args: any) => Promise<string>>(
  tools.map((t) => [t.name, t.handler]),
);

const server = new Server(
  { name: "change-memory", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

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
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${toErrorMessage(err)}` }],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Use stderr so we never corrupt the stdio JSON-RPC channel.
  process.stderr.write("change-memory MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${toErrorMessage(err)}\n`);
  process.exit(1);
});
