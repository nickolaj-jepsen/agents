import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const model = { provider: "test", id: "chosen" };

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;
async function instance(file: string | undefined = "next.jsonl", cwd = "/project") {
  // Simulate Pi loading fresh extension modules for each replacement runtime.
  vi.resetModules();
  const { default: aliases } = await import("./aliases.ts");
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, { handler: (...args: unknown[]) => unknown }>();
  const api = {
    on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)),
    registerCommand: vi.fn((name: string, command: { handler: (...args: unknown[]) => unknown }) =>
      commands.set(name, command),
    ),
    getThinkingLevel: vi.fn(() => "high"),
    setModel: vi.fn(async () => true),
    setThinkingLevel: vi.fn(),
  };
  const ctx = {
    cwd,
    model,
    sessionManager: { getSessionFile: (): string | undefined => file },
    modelRegistry: { find: vi.fn((): typeof model | undefined => model) },
    ui: { notify: vi.fn() },
  };
  aliases(api as unknown as ExtensionAPI);
  return {
    api,
    ctx,
    commands,
    emit: (name: string, event: Record<string, unknown>) =>
      handlers.get(name)?.(event, ctx as unknown as ExtensionContext),
  };
}

beforeEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for("agents.claude-compat.new-session-selections"));
});

describe("fresh-session model selection", () => {
  it("transfers model and thinking to the fresh extension instance exactly once", async () => {
    const old = await instance("old.jsonl");
    await old.emit("session_shutdown", { reason: "new", targetSessionFile: "next.jsonl" });
    const next = await instance();
    await next.emit("session_start", { reason: "new" });
    expect(next.ctx.modelRegistry.find).toHaveBeenCalledWith("test", "chosen");
    expect(next.api.setModel).toHaveBeenCalledWith(model);
    expect(next.api.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(old.api.setModel).not.toHaveBeenCalled();
    next.api.setModel.mockClear();
    await next.emit("session_start", { reason: "new" });
    expect(next.api.setModel).not.toHaveBeenCalled();
  });

  it.each(["startup", "resume", "fork", "reload"])("leaves %s selection alone", async (reason) => {
    const old = await instance("old.jsonl");
    await old.emit("session_shutdown", { reason, targetSessionFile: "next.jsonl" });
    const next = await instance();
    await next.emit("session_start", { reason });
    expect(next.api.setModel).not.toHaveBeenCalled();
    expect(next.api.setThinkingLevel).not.toHaveBeenCalled();
  });

  it("does not transfer when a switch was cancelled before shutdown", async () => {
    const next = await instance();
    await next.emit("session_start", { reason: "new" });
    expect(next.api.setModel).not.toHaveBeenCalled();
  });

  it("does not apply a selection to a different destination", async () => {
    const old = await instance("old.jsonl");
    await old.emit("session_shutdown", { reason: "new", targetSessionFile: "other.jsonl" });
    const next = await instance();
    await next.emit("session_start", { reason: "new" });
    expect(next.api.setModel).not.toHaveBeenCalled();
  });

  it("supports ephemeral sessions with no session file", async () => {
    const old = await instance();
    await old.emit("session_shutdown", { reason: "new" });
    const next = await instance();
    next.ctx.sessionManager.getSessionFile = () => undefined;
    await next.emit("session_start", { reason: "new" });
    expect(next.api.setModel).toHaveBeenCalledWith(model);
  });

  it.each(["missing", "unauthenticated"])(
    "warns and keeps defaults when model is %s",
    async (failure) => {
      const old = await instance("old.jsonl");
      await old.emit("session_shutdown", { reason: "new", targetSessionFile: "next.jsonl" });
      const next = await instance();
      if (failure === "missing") next.ctx.modelRegistry.find.mockReturnValue(undefined);
      else next.api.setModel.mockResolvedValue(false);
      await next.emit("session_start", { reason: "new" });
      expect(next.api.setThinkingLevel).not.toHaveBeenCalled();
      expect(next.ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Could not retain"),
        "warning",
      );
    },
  );

  it("keeps /clear as a new-session alias", async () => {
    const current = await instance();
    const newSession = vi.fn();
    await current.commands.get("clear")!.handler("", { newSession });
    expect(newSession).toHaveBeenCalledWith();
  });
});
