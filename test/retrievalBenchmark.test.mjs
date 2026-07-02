import { test } from "node:test";
import assert from "node:assert/strict";

import { HeuristicSummarizer } from "../mcp-server/dist/core/summarizer.js";
import { scoreChange } from "../mcp-server/dist/tools/searchChanges.js";

/**
 * Retrieval evaluation harness (ROADMAP: "Retrieval quality").
 *
 * Builds a fixture history of *heuristic-only* records — summaries produced by
 * the real HeuristicSummarizer over synthetic diffs, exactly what auto-capture
 * stores — then runs a fixed query set and measures top-1 accuracy: does the
 * intended change come back as the best-scored result?
 *
 * The capture-quality bar from the roadmap: >= 80% top-1 on heuristic-only
 * summaries. Ranking changes should move this number, not be eyeballed.
 */

// Each fixture is one "change" as auto-capture would see it: files, statuses,
// a diff carrying real declarations, and an auto-style reason.
const FIXTURES = [
  {
    key: "token-refresh",
    files: ["src/auth/tokenRefresh.ts"],
    diff: "+export async function refreshToken(session) {\n+  const expiry = session.expiresAt\n-  return null\n",
    reason: "auto: Edit (src/auth/tokenRefresh.ts)",
  },
  {
    key: "cache-eviction",
    files: ["src/cache/cacheStore.ts"],
    diff: "+function evictStale(entries) {\n+  const ttl = maxAgeMs\n-  entries.clear()\n",
    reason: "auto: Edit (src/cache/cacheStore.ts)",
  },
  {
    key: "login-validation",
    files: ["src/ui/LoginForm.tsx"],
    diff: "+function validateEmail(value) {\n+  const trimmed = value.trim()\n",
    reason: "auto: Edit (src/ui/LoginForm.tsx)",
  },
  {
    key: "webhook-retry",
    files: ["src/billing/webhook.ts"],
    diff: "+async function retryWebhook(event) {\n+  const backoff = attempt * 2\n",
    reason: "auto: Edit (src/billing/webhook.ts)",
  },
  {
    key: "search-ranking",
    files: ["src/search/rank.ts"],
    diff: "+const FIELD_WEIGHTS = { summary: 3 }\n+function rankResults(hits) {\n",
    reason: "auto: Edit (src/search/rank.ts)",
  },
  {
    key: "users-migration",
    files: ["migrations/20260702_add_users_table.sql"],
    diff: "+CREATE TABLE users (id serial primary key)\n",
    reason: "auto: Write (migrations/20260702_add_users_table.sql)",
  },
  {
    key: "ci-node-version",
    files: [".github/workflows/ci.yml"],
    diff: "+    node-version: 20\n-    node-version: 18\n",
    reason: "auto: Edit (.github/workflows/ci.yml)",
  },
  {
    key: "install-docs",
    files: ["README.md"],
    diff: "+## Install\n+Run npm install once, then restart.\n",
    reason: "auto: Edit (README.md)",
  },
];

// Query set: what a developer would actually type, mapped to the change that
// must come back first.
const QUERIES = [
  { q: "token refresh", expect: "token-refresh" },
  { q: "refresh token expiry", expect: "token-refresh" },
  { q: "cache eviction", expect: "cache-eviction" },
  { q: "evict stale entries", expect: "cache-eviction" },
  { q: "login form", expect: "login-validation" },
  { q: "validate email", expect: "login-validation" },
  { q: "billing webhook", expect: "webhook-retry" },
  { q: "webhook retry backoff", expect: "webhook-retry" },
  { q: "ranking weights", expect: "search-ranking" },
  { q: "users table migration", expect: "users-migration" },
  { q: "ci node version", expect: "ci-node-version" },
  { q: "install readme", expect: "install-docs" },
];

const BAR = 0.8;

async function buildRecords() {
  const summarizer = new HeuristicSummarizer();
  const records = [];
  for (let i = 0; i < FIXTURES.length; i++) {
    const f = FIXTURES[i];
    const out = await summarizer.summarize({
      files: f.files,
      nameStatus: f.files.map((file) => ({ status: "M", file })),
      diff: f.diff,
      reason: f.reason,
    });
    records.push({
      key: f.key,
      id: `chg_bench_${f.key}`,
      timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      files: f.files,
      type: out.type,
      summary: out.summary,
      added: out.added,
      modified: out.modified,
      removed: out.removed,
      reason: f.reason,
      risk: out.risk,
      tests: [],
      patch_file: "p",
      token_cost_estimate: 0,
    });
  }
  return records;
}

function top1(records, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lastIdx = Math.max(1, records.length - 1);
  const scored = records
    .map((c, i) => ({ c, score: scoreChange(c, terms, i / lastIdx) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.c.timestamp.localeCompare(a.c.timestamp));
  return scored[0]?.c;
}

test(`retrieval benchmark: top-1 accuracy on heuristic-only summaries >= ${BAR * 100}%`, async () => {
  const records = await buildRecords();
  const failures = [];
  let hits = 0;

  for (const { q, expect } of QUERIES) {
    const best = top1(records, q);
    if (best?.key === expect) {
      hits++;
    } else {
      failures.push(`"${q}" → ${best ? best.key : "(no match)"} (wanted ${expect})`);
    }
  }

  const accuracy = hits / QUERIES.length;
  // Per-query misses go into the assertion message so a regression is
  // diagnosable straight from the test output.
  assert.ok(
    accuracy >= BAR,
    `top-1 accuracy ${(accuracy * 100).toFixed(0)}% < ${BAR * 100}% bar.\nMisses:\n  ${failures.join("\n  ")}`,
  );
});

test("retrieval benchmark: every query matches something", async () => {
  const records = await buildRecords();
  for (const { q } of QUERIES) {
    assert.ok(top1(records, q), `query "${q}" returned no results at all`);
  }
});
