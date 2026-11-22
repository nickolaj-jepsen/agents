/**
 * A fake Linear MCP server for the site scenarios: stdio, newline-delimited JSON-RPC, written by
 * hand, no dependencies. `node linear-mcp.ts` serves fixture data for the tools linear-issue calls
 * and answers a write (`save_issue`, `save_comment`) with a made-up key and URL, recording it to
 * `$E2E_RUN_DIR/linear-writes.jsonl` and doing nothing else. Nothing touches the network.
 *
 * Name it `linear` in a scenario's `start.mcp`: linear-issue finds its server by a tool name
 * like `mcp__linear__save_issue`.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

export const TEAMS = [
  { id: "team-plt", name: "Platform", key: "PLT" },
  { id: "team-mob", name: "Mobile", key: "MOB" },
  { id: "team-web", name: "Web", key: "WEB" },
];

const STATUSES = [
  { id: "st-backlog", name: "Backlog", type: "backlog" },
  { id: "st-todo", name: "Todo", type: "unstarted" },
  { id: "st-progress", name: "In Progress", type: "started" },
  { id: "st-review", name: "In Review", type: "started" },
  { id: "st-done", name: "Done", type: "completed" },
  { id: "st-canceled", name: "Canceled", type: "canceled" },
];

const LABELS = [
  { id: "lb-bug", name: "Bug" },
  { id: "lb-feature", name: "Feature" },
  { id: "lb-improvement", name: "Improvement" },
  { id: "lb-reliability", name: "reliability", parent: "Area" },
  { id: "lb-perf", name: "performance", parent: "Area" },
  { id: "lb-docs", name: "Docs" },
];

const PROJECTS = [
  { id: "pr-sync", name: "Order sync" },
  { id: "pr-checkout", name: "Checkout rewrite" },
];

/** Open issues a search finds, for the duplicate check. */
const ISSUES = [
  {
    id: "PLT-212",
    title: "Sync worker retries too fast after rate limiting",
    statusType: "started",
    team: "PLT",
    description:
      "The order sync worker backs off with a fixed delay when the shop API answers 429. It should wait as long as the API asks.",
  },
  {
    id: "PLT-187",
    title: "Add metrics for the order sync queue",
    statusType: "unstarted",
    team: "PLT",
    description: "Expose queue depth and last successful sync time.",
  },
  {
    id: "WEB-96",
    title: "Checkout page flickers on slow connections",
    statusType: "unstarted",
    team: "WEB",
    description: "The summary box redraws twice while the totals load.",
  },
];

const TOOLS = [
  ["get_user", "Get a user, by id, name, email or `me`."],
  ["list_teams", "List the teams of the workspace."],
  ["list_issue_statuses", "List a team's issue statuses."],
  ["list_issue_labels", "List a team's issue labels."],
  ["list_projects", "List the projects."],
  ["list_issues", "List or search issues."],
  ["save_issue", "Create or update an issue."],
  ["save_comment", "Create or update a comment."],
].map(([name, description]) => ({
  name,
  description,
  inputSchema: { type: "object", additionalProperties: true },
}));

/** The file a run's writes go to. */
export const WRITES = "linear-writes.jsonl";
/** The file the server leaves once it has listed its tools, so a session can know they are there. */
export const LISTED = "linear-listed";

const record = (tool: string, args: unknown) => {
  const file = process.env.E2E_RUN_DIR ? `${process.env.E2E_RUN_DIR}/${WRITES}` : undefined;
  if (file) appendFileSync(file, `${JSON.stringify({ tool, args })}\n`);
};

let filed = 430;

function call(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "get_user":
      return {
        id: "user-me",
        name: "Alex Example",
        displayName: "alex",
        teams: TEAMS.map(({ name, key }) => ({ name, key })),
      };
    case "list_teams":
      return { teams: TEAMS };
    case "list_issue_statuses":
      return STATUSES;
    case "list_issue_labels":
      return { labels: LABELS };
    case "list_projects":
      return { projects: PROJECTS };
    case "list_issues": {
      const limit = typeof args.limit === "number" ? args.limit : 10;
      return { issues: ISSUES.slice(0, limit) };
    }
    case "save_issue": {
      record(name, args);
      const key = `${String(args.team ?? "PLT")}-${++filed}`;
      return { id: key, identifier: key, url: `https://linear.app/example/issue/${key}` };
    }
    case "save_comment": {
      record(name, args);
      return { id: "comment-1", url: "https://linear.app/example/issue/PLT-212#comment-1" };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);

/** Answers one JSON-RPC message; notifications (no id) get no reply. */
export function handle(msg: { id?: number | string; method?: string; params?: any }) {
  if (msg.id === undefined) return;
  const ok = (result: unknown) => send({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-linear", version: "0.0.0" },
      });
    case "tools/list":
      if (process.env.E2E_RUN_DIR) writeFileSync(`${process.env.E2E_RUN_DIR}/${LISTED}`, "");
      return ok({ tools: TOOLS });
    case "ping":
      return ok({});
    case "tools/call":
      try {
        const out = call(msg.params?.name, msg.params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (error) {
        return ok({
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        });
      }
    default:
      return send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `no method ${msg.method}` },
      });
  }
}

if (process.argv[1]?.endsWith("linear-mcp.ts")) {
  createInterface({ input: process.stdin }).on("line", (line) => {
    try {
      handle(JSON.parse(line));
    } catch {
      /* not JSON: ignore */
    }
  });
}

/** For a scenario's `start.mcp`: this file, run by node, as the server `linear`. */
export const linearMcp = {
  linear: { command: process.execPath, args: [import.meta.filename] },
};
