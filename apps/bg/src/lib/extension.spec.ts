/**
 * The extension itself, driven with a stand-in for pi: what the tools say, what
 * a session hears when a task ends, and what survives a switch. The shells are
 * real, so the detached groups, the logs and the kills are the ones that ship.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import createExtension from "../pi.ts";
import { BG_STATE, BG_STATE_REQUEST, parseSnapshot } from "./protocol.ts";

type Params = {
  command?: string;
  name?: string;
  id?: number;
  timeoutSeconds?: number;
};

type Result = {
  content: { type: string; text: string }[];
  details: { id?: number; pid?: number | null; path?: string; [key: string]: unknown };
};

type Tool = {
  name: string;
  description: string;
  execute: (
    callId: string,
    params: Params,
    signal?: AbortSignal,
    onUpdate?: (partial: unknown) => void,
    ctx?: { cwd: string },
  ) => Promise<Result>;
};

type Sent = { content: string; customType: string; options: unknown };

const dirs = new Set<string>();
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const until = async (check: () => boolean, ms = 10_000): Promise<void> => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error("timed out waiting for the session");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** pi, as far as this extension uses it: handlers, tools, `sendMessage` and the event bus. */
function harness(cwd = process.cwd()) {
  const tools = new Map<string, Tool>();
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const listeners = new Map<string, ((data: unknown) => void)[]>();
  const sent: Sent[] = [];
  const published: unknown[] = [];

  const events = {
    emit(channel: string, data: unknown) {
      if (channel === BG_STATE) published.push(data);
      for (const listener of listeners.get(channel) ?? []) listener(data);
    },
    on(channel: string, listener: (data: unknown) => void) {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
      return () => {};
    },
  };

  createExtension({
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      handlers.set(event, handler);
      return () => {};
    },
    registerTool(tool: Tool) {
      tools.set(tool.name, tool);
    },
    sendMessage(message: { content: string; customType: string }, options: unknown) {
      sent.push({ content: message.content, customType: message.customType, options });
    },
    events,
  } as unknown as ExtensionAPI);

  /** Calls a tool the way pi does, with the cwd of the turn. */
  const call = (
    name: string,
    params: Params,
    options: { signal?: AbortSignal; cwd?: string } = {},
  ): Promise<Result> => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`no ${name} tool`);
    return tool.execute("call", params, options.signal, undefined, {
      cwd: options.cwd ?? cwd,
    });
  };

  return {
    call,
    sent,
    published,
    request: () => events.emit(BG_STATE_REQUEST, { protocol: 1 }),
    start: (sessionId: string, sessionCwd = cwd) =>
      handlers.get("session_start")?.(
        {},
        {
          cwd: sessionCwd,
          sessionManager: { getSessionId: () => sessionId },
        },
      ),
    shutdown: () => handlers.get("session_shutdown")?.({}, {}),
  };
}

describe("bg_run", () => {
  it("starts a task, then reports its exit passively: no turn is started for it", async () => {
    const h = harness();
    await h.start("session-a");

    const run = await h.call("bg_run", { command: "printf 'hello\\n'", name: "greet" });
    const text = run.content[0]?.text ?? "";
    expect(text).toContain("#1 started, pid ");
    expect(text).toContain("bg_wait");
    expect(text).toContain(`{"id":1}`);

    const path = run.details.path ?? "";
    dirs.add(dirname(path));
    await until(() => h.sent.length === 1);
    // The whole point: a passive custom message. No `deliverAs` (which would queue a follow-up or a
    // steering message) and no `triggerTurn` (which would start a run).
    expect(h.sent[0]?.options).toEqual({ triggerTurn: false });
    expect(h.sent[0]?.customType).toBe("bg-done");
    expect(h.sent[0]?.content).toContain("exited 0");
    expect(h.sent[0]?.content).toContain("hello");
    expect(readFileSync(path, "utf8")).toBe("hello\n");

    const snapshot = parseSnapshot(h.published.at(-1));
    expect(snapshot?.tasks[0]).toMatchObject({ id: 1, name: "greet", state: "exited", code: 0 });
  });

  it("keeps a nonzero exit for bg_wait and bg_status", async () => {
    const h = harness();
    await h.start("session-a");

    const run = await h.call("bg_run", { command: "echo out; exit 3" });
    dirs.add(dirname(run.details.path ?? ""));
    const waited = await h.call("bg_wait", { id: run.details.id });

    expect(waited.content[0]?.text).toMatch(/#1 "echo out; exit 3" exited 3 after \d+s/);
    expect(waited.content[0]?.text).toContain("out");
    expect(waited.details).toMatchObject({ state: "exited", code: 3, timedOut: false });

    const status = await h.call("bg_status", {});
    expect(status.content[0]?.text).toContain("1 task in this session (0 running)");
    expect(status.content[0]?.text).toContain("log: ");
  });

  it("runs in the cwd of the turn, not the one the session started in", async () => {
    const h = harness();
    await h.start("session-a");

    const run = await h.call("bg_run", { command: "pwd" }, { cwd: dirname(process.cwd()) });
    dirs.add(dirname(run.details.path ?? ""));
    const waited = await h.call("bg_wait", { id: run.details.id });
    expect(waited.content[0]?.text).toContain(dirname(process.cwd()));
    expect(waited.details).toMatchObject({ state: "exited", code: 0 });
  });

  it("ends a task on its own timeout", async () => {
    const h = harness();
    await h.start("session-a");

    const run = await h.call("bg_run", { command: "sleep 30", timeoutSeconds: 1 });
    dirs.add(dirname(run.details.path ?? ""));
    const waited = await h.call("bg_wait", { id: run.details.id });
    expect(waited.content[0]?.text).toMatch(/exited (SIGTERM|143)/);
  });

  it("records a command it cannot start, and tells nobody", async () => {
    const h = harness();
    await h.start("session-a");

    // cwd is the turn's: a directory that is not there fails the spawn.
    await expect(
      h.call("bg_run", { command: "true" }, { cwd: "/definitely/not/a/directory" }),
    ).rejects.toThrow(/could not start/);
    expect(h.sent).toHaveLength(0);
    const status = await h.call("bg_status", {});
    expect(status.content[0]?.text).toContain("failed to start");
  });

  it("holds the tail it reports to a bounded number of lines", async () => {
    const h = harness();
    await h.start("session-a");

    const run = await h.call("bg_run", { command: "seq 1 5000" });
    dirs.add(dirname(run.details.path ?? ""));
    await until(() => h.sent.length === 1);

    const lines = (h.sent[0]?.content ?? "").split("\n");
    // The status line, 40 log lines, and the note that the rest was cut.
    expect(lines.length).toBeLessThanOrEqual(42);
    expect(h.sent[0]?.content).toContain("5000");
    expect(h.sent[0]?.content).toContain("earlier output cut");
  });
});

describe("bg_wait", () => {
  it("stops waiting when its signal aborts, and leaves the process running", async () => {
    const h = harness();
    await h.start("session-a");
    const run = await h.call("bg_run", { command: "sleep 30" });
    dirs.add(dirname(run.details.path ?? ""));
    const pid = run.details.pid ?? 0;
    expect(alive(pid)).toBe(true);

    const abort = new AbortController();
    const waiting = h.call("bg_wait", { id: run.details.id }, { signal: abort.signal });
    abort.abort();
    await expect(waiting).rejects.toThrow(/still running/);

    expect(alive(pid)).toBe(true);
    const status = await h.call("bg_status", { id: run.details.id });
    expect(status.content[0]?.text).toContain(" running after ");

    const stopped = await h.call("bg_stop", { id: run.details.id });
    expect(stopped.content[0]?.text).toContain("SIGTERM");
    const ended = await h.call("bg_wait", { id: run.details.id });
    expect(ended.content[0]?.text).toMatch(/exited (SIGTERM|143)/);
    expect(alive(pid)).toBe(false);
    await h.shutdown();
  });

  it("hands back a task that is still running when its time is up", async () => {
    const h = harness();
    await h.start("session-a");
    const run = await h.call("bg_run", { command: "echo early; sleep 30" });
    dirs.add(dirname(run.details.path ?? ""));

    const waited = await h.call("bg_wait", { id: run.details.id, timeoutSeconds: 1 });
    expect(waited.content[0]?.text).toContain("still running after");
    expect(waited.content[0]?.text).toContain("early");
    expect(waited.details.timedOut).toBe(true);
    await h.shutdown();
  });
});

describe("the session", () => {
  it("says nothing to the session that replaces it", async () => {
    const h = harness();
    await h.start("session-a");
    const run = await h.call("bg_run", { command: "sleep 30" });
    dirs.add(dirname(run.details.path ?? ""));
    const pid = run.details.pid ?? 0;

    await h.shutdown();
    // The shutdown waits for its own kill: the task is gone by the time it returns.
    expect(alive(pid)).toBe(false);
    // The exit that caused reaches neither a message nor a snapshot.
    expect(h.sent).toHaveLength(0);
    expect(parseSnapshot(h.published.at(-1))).toMatchObject({
      sessionId: "session-a",
      type: "stopped",
      tasks: [],
    });

    const before = h.published.length;
    await h.start("session-b");
    expect(parseSnapshot(h.published.at(-1))).toMatchObject({
      sessionId: "session-b",
      type: "snapshot",
      tasks: [],
    });
    // The next session numbers its tasks from one and knows none of the old ones.
    const status = await h.call("bg_status", {});
    expect(status.content[0]?.text).toContain("No `bg_run` tasks in this session.");
    await expect(h.call("bg_status", { id: 1 })).rejects.toThrow(/not a task of this session/);
    expect(h.published).toHaveLength(before + 1);
    await h.shutdown();
  });

  it("kills what ignores SIGTERM before the shutdown returns", async () => {
    const h = harness();
    await h.start("session-a");
    // A process that handles SIGTERM and stays: a shell trap alone would still die with the
    // `sleep` the signal also reaches, so only this one needs the kill.
    const run = await h.call("bg_run", {
      command: `node -e 'process.on("SIGTERM", () => {}); console.log(process.pid); setInterval(() => {}, 1000)'`,
    });
    const path = run.details.path ?? "";
    dirs.add(dirname(path));
    const leader = run.details.pid ?? 0;
    await until(() => (readFileSync(path, "utf8").trim().split("\n")[0] ?? "") !== "");
    const ignores = Number(readFileSync(path, "utf8").trim().split("\n")[0]);
    expect(alive(ignores)).toBe(true);

    const shutting = h.shutdown();
    // The signal has been sent and the task shrugged it off.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(alive(leader)).toBe(true);
    expect(alive(ignores)).toBe(true);

    await shutting;
    expect(alive(leader)).toBe(false);
    expect(alive(ignores)).toBe(false);
    expect(h.sent).toHaveLength(0);
  });

  it("answers a request for its state, and nothing once it is gone", async () => {
    const h = harness();
    h.request();
    expect(h.published).toHaveLength(0);

    await h.start("session-a");
    const run = await h.call("bg_run", { command: "sleep 30" });
    dirs.add(dirname(run.details.path ?? ""));
    const before = h.published.length;
    h.request();
    expect(h.published).toHaveLength(before + 1);
    expect(parseSnapshot(h.published.at(-1))?.tasks[0]).toMatchObject({
      id: run.details.id,
      state: "running",
    });

    await h.shutdown();
    const after = h.published.length;
    h.request();
    expect(h.published).toHaveLength(after);
  });

  it("refuses a tool call that has no session behind it", async () => {
    const h = harness();
    await expect(h.call("bg_status", {})).rejects.toThrow(/no session/);
    await expect(h.call("bg_run", { command: "true" })).rejects.toThrow(/no session/);
  });
});
