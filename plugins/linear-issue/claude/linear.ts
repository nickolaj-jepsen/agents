/** Claude Code's side of the draft: Linear through the session's MCP server, and the model beside it. */
import type { EngineInterface } from "claude-code";

import { NO_LINEAR, repoName, type Host, type Last } from "../core/draft.ts";

const LINEAR_TOOL = /^mcp__(.*linear.*)__([^_].*)$/i;
const SERVER_WAIT_S = 10;
// How long hasLinear trusts its last answer; a missing server is looked for again sooner.
const LINEAR_SEEN_MS = 60_000;
const LINEAR_MISSING_MS = 5_000;

let linearSeen: { at: number; isSeen: boolean } | undefined;

/** True when an MCP server named like Linear has a tool here, its auth stub included. */
export async function hasLinear($: EngineInterface): Promise<boolean> {
  const now = await $.clock.now();
  const ttl = linearSeen?.isSeen ? LINEAR_SEEN_MS : LINEAR_MISSING_MS;
  if (linearSeen && now - linearSeen.at < ttl) return linearSeen.isSeen;
  const tools = await $.tool.list().catch(() => []);
  linearSeen = { at: now, isSeen: tools.some((t) => /^mcp__.*linear.*__/i.test(t.name)) };
  return linearSeen.isSeen;
}

/** The first connected Linear server that can write issues, in tool-name spelling. */
async function linearServer($: EngineInterface): Promise<string | undefined> {
  // MCP servers connect after the session starts, so a /linear right away waits for one.
  for (let attempt = 0; attempt < SERVER_WAIT_S; attempt++) {
    for (const { name } of await $.tool.list()) {
      const m = LINEAR_TOOL.exec(name);
      if (m?.[2] === "save_issue") return m[1];
    }
    await $.clock.sleep(1000);
  }
  return undefined;
}

/** Calls a Linear tool and parses its JSON answer; throws with the server's text on an error. */
async function call($: EngineInterface, tool: string, args: Record<string, unknown>) {
  const server = await linearServer($);
  if (!server) throw new Error(NO_LINEAR);
  const result = await $.mcp.call(server, tool, args);
  const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
  if (result.isError) throw new Error(text.slice(0, 200) || `${tool} failed`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function gitBranch($: EngineInterface, cwd: string): Promise<string> {
  try {
    const r = await $.process.run(["git", "-C", cwd, "branch", "--show-current"], {
      timeoutMs: 2000,
    });
    return r.exitCode === 0 ? r.stdout.trim() || "(detached)" : "(none)";
  } catch {
    return "(none)";
  }
}

/** What the shared drafting asks of a client, answered by this session. */
/** The draft's own state, which the engine lets only the file that declares it read and write. */
export type Draft = Pick<Host, "read" | "update">;

export function hostFor($: EngineInterface, draft: Draft): Host {
  return {
    now: () => $.clock.now(),
    linear: (tool, args) => call($, tool, args),
    async complete({ system, prompt, maxTokens }) {
      const reply = await $.model.complete({ model: "sonnet", system, maxTokens, prompt });
      return reply.isAnswered ? { text: reply.text } : { error: reply.reason };
    },
    async origin() {
      const cwd = await $.session.cwd();
      const [repo, branch, sessionId, messages] = await Promise.all([
        $.session.repo().catch(() => null),
        gitBranch($, cwd),
        $.session.id(),
        $.session.messages().catch(() => []),
      ]);
      return {
        cwd,
        repo: (repo?.remote && repoName(repo.remote)) ?? repo?.root?.split("/").pop(),
        branch,
        sessionId,
        messages: messages.map((m) => ({ role: m.role, text: m.text })),
      };
    },
    last: async () => (await $.store.get("last").catch(() => undefined)) as Last | undefined,
    remember: (last) => $.store.set("last", last),
    ...draft,
    log: (message) => $.ui.log(message, { to: "debug" }),
  };
}

export async function openUrl($: EngineInterface, url: string) {
  for (const opener of ["xdg-open", "open"]) {
    try {
      if ((await $.process.run([opener, url], { timeoutMs: 5000 })).exitCode === 0) return;
    } catch {}
  }
  $.ui.toast(`Couldn't open ${url}`);
}
