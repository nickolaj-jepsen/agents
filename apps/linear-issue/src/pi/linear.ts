/**
 * Linear's MCP tools for a command. pi runs a tool for the model or for another tool
 * (`ctx.executeTool`), never for a command, so there is no asking the session's own connection.
 * This starts pi's MCP support a second time, for the Linear servers alone, on a host that only
 * keeps the tools it registers: the same `mcp.json`, the same stored sign-in and token refresh,
 * and nothing declared to the model.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMcpExtension,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type McpServerEntry,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { NO_LINEAR } from "../lib/draft.ts";

const LINEAR = /linear/i;
const TOOL = /^mcp__(.*linear.*)__([^_].*)$/i;
/** How long a call waits for a server that is still connecting. */
const CONNECT_MS = 10_000;

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

/** The Linear servers of one `mcp.json`. */
function serversIn(file: string, scope: "global" | "project"): McpServerEntry[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      mcpServers?: Record<string, McpServerEntry["config"]>;
    };
    return Object.entries(parsed.mcpServers ?? {})
      .filter(([name]) => LINEAR.test(name))
      .map(([name, config]) => ({ name, config, source: file, scope }));
  } catch {
    return [];
  }
}

export type LinearBridge = {
  /** Calls a Linear tool; throws with the server's words, or `NO_LINEAR` when none can file. */
  call(ctx: ExtensionContext, tool: string, args: Record<string, unknown>): Promise<unknown>;
  /** Whether a Linear server is configured at all. */
  isConfigured(ctx: ExtensionContext): boolean;
  close(ctx: ExtensionContext): Promise<void>;
};

export function linearBridge(pi: ExtensionAPI): LinearBridge {
  const tools = new Map<string, ToolDefinition>();
  const handlers = new Map<string, Handler[]>();
  let started: ExtensionContext | undefined;

  const entries = (ctx: ExtensionContext): McpServerEntry[] => {
    const global = serversIn(join(getAgentDir(), "mcp.json"), "global");
    const project = ctx.isProjectTrusted()
      ? serversIn(join(ctx.cwd, ".pi", "mcp.json"), "project")
      : [];
    // A project's entry replaces the person's of the same name, as in pi's own loading.
    const named = new Map([...global, ...project].map((e) => [e.name, e]));
    return [...named.values()].filter((e) => (e.config as { enabled?: boolean }).enabled !== false);
  };

  // What pi's MCP support asks of its host. It registers tools and listens for the session;
  // everything else it asks for (commands, renderers, the active tool set) has no place here.
  const host = new Proxy(
    {
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return () => undefined;
      },
      registerTool: (tool: ToolDefinition) => void tools.set(tool.name, tool),
      getAllTools: () => [...tools.values()],
      getActiveTools: () => [],
      setActiveTools: () => undefined,
      // Servers another extension registered are the session's to connect, not this one's.
      getMcpServers: () => pi.getMcpServers().filter((server) => LINEAR.test(server.name)),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => undefined) },
  ) as unknown as ExtensionAPI;

  /** The session as the second MCP support sees it: it reports its trouble here, not to the person. */
  const quiet = (ctx: ExtensionContext): ExtensionContext =>
    new Proxy(ctx, {
      get: (target, key) =>
        key === "ui"
          ? new Proxy(target.ui, {
              get: (ui, name) => (name === "notify" ? () => undefined : Reflect.get(ui, name, ui)),
            })
          : key === "hasUI"
            ? false
            : Reflect.get(target, key, target),
    });

  const emit = async (event: string, ctx: ExtensionContext) => {
    for (const handler of handlers.get(event) ?? []) await handler({}, ctx);
  };

  const start = async (ctx: ExtensionContext) => {
    if (started) return;
    started = ctx;
    createMcpExtension({
      loadConfig: () => ({ servers: entries(ctx), errors: [], autoEnableCodemode: false }),
    })(host);
    await emit("session_start", quiet(ctx));
  };

  const find = (tool: string) =>
    [...tools.values()].find((t) => {
      const m = TOOL.exec(t.name);
      return m?.[2] === tool && tools.has(`mcp__${m[1]}__save_issue`);
    });

  return {
    isConfigured: (ctx) => entries(ctx).length > 0 || host.getMcpServers().length > 0,

    async call(ctx, tool, args) {
      if (!this.isConfigured(ctx)) throw new Error(NO_LINEAR);
      await start(ctx);
      // A server connects in the background, and one that is signed out never lists its tools.
      const deadline = Date.now() + CONNECT_MS;
      while (!find(tool) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      const found = find(tool);
      if (!found) throw new Error(NO_LINEAR);
      const result = await found.execute(
        `linear-issue-${Date.now()}`,
        args as never,
        undefined,
        undefined,
        quiet(ctx) as never,
      );
      const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
      if ((result as { isError?: boolean }).isError)
        throw new Error(text.slice(0, 200) || `${tool} failed`);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    },

    async close(ctx) {
      if (!started) return;
      started = undefined;
      tools.clear();
      await emit("session_shutdown", quiet(ctx)).catch(() => undefined);
      handlers.clear();
    },
  };
}
