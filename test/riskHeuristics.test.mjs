import { test } from "node:test";
import assert from "node:assert/strict";

import { HeuristicSummarizer } from "../mcp-server/dist/core/summarizer.js";

const summarizer = new HeuristicSummarizer();

function summarize(files) {
  return summarizer.summarize({
    files,
    nameStatus: files.map((f) => ({ status: "M", file: f })),
    diff: "",
  });
}

const isAuthNote = (r) => /Touches authentication\/session/i.test(r);

test("risk: a docs file mentioning 'session' is not flagged", async () => {
  const out = await summarize(["examples/change-memory/session.md"]);
  assert.deepEqual(out.risk, [], "documentation carries no code risk");
});

test("risk: sessionBuilder.ts is not mistaken for auth code", async () => {
  const out = await summarize(["mcp-server/src/core/sessionBuilder.ts"]);
  assert.ok(!out.risk.some(isAuthNote), "a name starting with 'session' is not auth");
});

test("risk: tokenBudget.ts is not mistaken for an auth token", async () => {
  const out = await summarize(["mcp-server/src/core/tokenBudget.ts"]);
  assert.ok(!out.risk.some(isAuthNote));
});

test("risk: genuine auth code is still flagged", async () => {
  const out = await summarize(["src/auth/login.ts"]);
  assert.ok(out.risk.some(isAuthNote), "real auth paths must still flag");
});

test("risk: a code file under session/ is still flagged", async () => {
  const out = await summarize(["src/session/store.ts"]);
  assert.ok(out.risk.some(isAuthNote));
});
