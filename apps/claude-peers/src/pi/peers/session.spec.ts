/**
 * The plugin's own decisions, driven through a stand-in `ExtensionAPI`: what it publishes, what it
 * refuses, and what it does when other sessions pile on. Every test gets a home and a socket dir of
 * its own, so a run never reads or writes the person's Claude registry.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_STATE, REGISTRY_METADATA, REGISTRY_REQUEST } from "./metadata.ts";
import {
  bindInbox,
  buildEnvelope,
  controlFrame,
  encodeAddress,
  FEATURE_NOTIFY_IDLE,
  FEATURE_QUEUE_WHEN_IDLE,
  type Inbox,
  PEER_MESSAGE_TYPE,
  sendFrame,
  userFrame,
} from "./protocol.ts";
import claudePeers, { MAX_PENDING_APPROVALS, MAX_QUEUED_MESSAGES } from "./session.ts";

const SESSION_ID = "session-under-test";

type Sent = {
  message: { customType?: string; content?: string; details?: { kind?: string } };
  options?: { deliverAs?: string; triggerTurn?: boolean };
};
type Frame = Record<string, unknown>;

/** A stand-in pi: the handlers it was given, the tools it registered, and what it was sent. */
function fakePi() {
  const handlers = new Map<string, ((event: never, ctx: never) => unknown)[]>();
  const bus = new Map<string, ((data: unknown) => void)[]>();
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
  const sent: Sent[] = [];
  const emitted: { channel: string; data: unknown }[] = [];
  let name: string | undefined;
  const pi = {
    on(event: string, handler: (event: never, ctx: never) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    events: {
      on(channel: string, handler: (data: unknown) => void) {
        bus.set(channel, [...(bus.get(channel) ?? []), handler]);
      },
      emit(channel: string, data: unknown) {
        emitted.push({ channel, data });
        for (const handler of bus.get(channel) ?? []) handler(data);
      },
    },
    getSessionName: () => name,
    setSessionName: (next: string) => {
      name = next;
    },
    sendMessage: (message: Sent["message"], options?: Sent["options"]) => {
      sent.push({ message, options });
    },
    registerMessageRenderer: () => {},
    registerTool: (tool: { name: string }) => {
      tools.set(tool.name, tool as never);
    },
  } as unknown as ExtensionAPI;
  return { pi, handlers, tools, sent, emitted };
}

/** A stand-in context whose dialogs the test answers, and whose idleness it decides. */
function fakeCtx() {
  const state = { idle: true };
  const notifications: { text: string; level?: string }[] = [];
  const confirms: { title: string; body: string }[] = [];
  const answer: ((yes: boolean) => void)[] = [];
  const ctx = {
    cwd: "/work/fixture",
    hasUI: true,
    isIdle: () => state.idle,
    ui: {
      notify: (text: string, level?: string) => notifications.push({ text, level }),
      confirm: (title: string, body: string) => {
        confirms.push({ title, body });
        return new Promise<boolean>((done) => answer.push(done));
      },
    },
    sessionManager: { getSessionId: () => SESSION_ID },
  } as unknown as ExtensionContext;
  return { ctx, state, notifications, confirms, answer };
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Polls until `check` holds, so a socket frame that travels in this process is not a sleep. */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  for (const started = Date.now(); Date.now() - started < ms; await wait(10)) if (check()) return;
  throw new Error("condition never held");
}

type Fixture = {
  home: string;
  runtime: string;
  entry: () => Frame | undefined;
  entryFile: string;
  ping: ReturnType<typeof fakePi>;
  ui: ReturnType<typeof fakeCtx>;
  fire: (event: string, payload?: unknown) => Promise<void>;
  mailbox: (name: string) => Promise<{ inbox: Inbox; frames: Frame[] }>;
  send: (from: string, body: string, options?: { hold?: boolean }) => Promise<void>;
  socketPath: () => string;
  tool: (name: string) => { execute: (...args: unknown[]) => Promise<unknown> };
  close: () => Promise<void>;
};

const running: Fixture[] = [];

afterEach(async () => {
  for (const fixture of running.splice(0)) await fixture.close();
  vi.unstubAllEnvs();
  delete process.env.CLAUDE_CODE_MESSAGING_SOCKET;
});

/** A started session, isolated under a folder of its own, and the frames it can be sent. */
async function startSession(): Promise<Fixture> {
  const root = mkdtempSync(join("/tmp", "cp-session-"));
  const home = join(root, "home");
  const claude = join(home, ".claude");
  const runtime = join(root, "run");
  mkdirSync(join(claude, "sessions"), { recursive: true });
  vi.stubEnv("HOME", home);
  vi.stubEnv("CLAUDE_CONFIG_DIR", claude);
  vi.stubEnv("XDG_RUNTIME_DIR", runtime);

  const ping = fakePi();
  const ui = fakeCtx();
  claudePeers(ping.pi);

  const fire = async (event: string, payload: unknown = {}) => {
    for (const handler of ping.handlers.get(event) ?? [])
      await (handler as (event: unknown, ctx: unknown) => unknown)(payload, ui.ctx);
  };

  const inboxes: Inbox[] = [];
  const entryFile = join(claude, "sessions", `${process.pid}.json`);
  const entry = () => {
    try {
      return JSON.parse(readFileSync(entryFile, "utf8")) as Frame;
    } catch {
      return undefined;
    }
  };
  const socketPath = () => String(entry()?.messagingSocketPath ?? "");

  await fire("session_start", { reason: "startup" });

  const fixture: Fixture = {
    home,
    runtime,
    entry,
    entryFile,
    ping,
    ui,
    fire,
    socketPath,
    tool: (name) => ping.tools.get(name)!,
    mailbox: async (name) => {
      const frames: Frame[] = [];
      const inbox = await bindInbox(join(runtime, "cc-socks", `${name}.sock`), (frame) =>
        frames.push(frame),
      );
      inboxes.push(inbox);
      return { inbox, frames };
    },
    send: async (from, body, options = {}) => {
      const frame = userFrame({
        content: buildEnvelope({
          from,
          fromName: "peer",
          // `hold` sends no mode at all, which the plugin treats like a bypass sender's.
          ...(options.hold ? {} : { fromMode: "prompting" as const }),
          body,
        }),
        from,
        sessionId: SESSION_ID,
      });
      await sendFrame(socketPath(), frame);
    },
    close: async () => {
      await fire("session_shutdown", { reason: "quit" });
      for (const inbox of inboxes) await inbox.close().catch(() => {});
      rmSync(root, { recursive: true, force: true });
    },
  };
  running.push(fixture);
  return fixture;
}

describe("startup", () => {
  it("publishes its own entry, asks for metadata, and lets an adapter's fields through", async () => {
    const fixture = await startSession();
    const entry = fixture.entry();
    expect(entry).toEqual(
      expect.objectContaining({
        pid: process.pid,
        sessionId: SESSION_ID,
        kind: "interactive",
        entrypoint: "pi",
        status: "idle",
        messagingSocketPath: fixture.socketPath(),
        peerFeatures: [FEATURE_NOTIFY_IDLE, FEATURE_QUEUE_WHEN_IDLE],
      }),
    );
    // No hub field of its own: only an adapter can put one there.
    expect(entry).not.toHaveProperty("hubHidden");
    expect(entry).not.toHaveProperty("tmux");
    expect(fixture.ping.emitted.filter((e) => e.channel === REGISTRY_REQUEST)).toEqual([
      { channel: REGISTRY_REQUEST, data: { protocol: 1 } },
    ]);

    // The adapter's half, applied on top of the core and kept through a status change.
    fixture.ping.pi.events.emit(REGISTRY_METADATA, {
      protocol: 1,
      metadata: { hubPeer: true, tmux: "%4" },
    });
    await fixture.fire("agent_start");
    await until(() => fixture.entry()?.status === "busy");
    expect(fixture.entry()).toEqual(
      expect.objectContaining({ status: "busy", hubPeer: true, tmux: "%4" }),
    );
  });

  it("refuses to send anything when it has no inbox", async () => {
    const ping = fakePi();
    const ui = fakeCtx();
    claudePeers(ping.pi);
    const send = ping.tools.get("send_message")!;
    await expect(
      send.execute("call-1", { to: "peer", message: "hi" }, undefined, undefined, ui.ctx),
    ).rejects.toThrow(/no inbox/);
    expect(ui.ctx && ping.sent).toHaveLength(0);
  });
});

describe("inbound", () => {
  it("holds 50 messages for the user's prompt and drops the 51st with a reason", async () => {
    const fixture = await startSession();
    const peer = await fixture.mailbox("710001");
    // A sender is its own bucket in the loop guard, so the queue, not the rate limit, is the cap.
    for (let i = 0; i < MAX_QUEUED_MESSAGES; i++)
      await fixture.send(`uds:${fixture.runtime}/cc-socks/${800000 + i}.sock`, `message ${i}`);
    await until(() => fixture.ping.sent.length === MAX_QUEUED_MESSAGES);
    expect(fixture.ping.sent.every((s) => s.options?.deliverAs === "nextTurn")).toBe(true);
    // What reaches the transcript is the custom type a peer's message has always had.
    expect(fixture.ping.sent[0]?.message.customType).toBe(PEER_MESSAGE_TYPE);

    await fixture.send(encodeAddress(join(fixture.runtime, "cc-socks", "710001.sock")), "one more");
    await until(() => peer.frames.length > 0);
    expect(peer.frames[0]).toEqual(
      expect.objectContaining({
        action: "peer_message_status",
        status: "dropped",
        drop_reason: "queue-full",
      }),
    );
    expect(fixture.ping.sent).toHaveLength(MAX_QUEUED_MESSAGES);
  });

  it("asks about four approval-waiting senders, and says once that it is waiting", async () => {
    const fixture = await startSession();
    const peer = await fixture.mailbox("710002");
    for (let i = 0; i < MAX_PENDING_APPROVALS; i++)
      // No mode at all: a sender that does not say it is "prompting" is held, like a bypass one.
      await fixture.send(`uds:${fixture.runtime}/cc-socks/${810000 + i}.sock`, `hold ${i}`, {
        hold: true,
      });
    await until(() => fixture.ui.confirms.length === MAX_PENDING_APPROVALS);
    expect(fixture.ui.confirms[0]?.title).toContain("skips permission prompts");
    const waiting = () =>
      fixture.ping.emitted.filter((e) => e.channel === APPROVAL_STATE).map((e) => e.data);
    expect(waiting()).toEqual([{ protocol: 1, waiting: true }]);

    // One more is turned away rather than opened: there is a limit to what it puts in front of you.
    await fixture.send(encodeAddress(join(fixture.runtime, "cc-socks", "710002.sock")), "fifth", {
      hold: true,
    });
    await until(() => peer.frames.length > 0);
    expect(peer.frames[0]).toEqual(
      expect.objectContaining({ status: "dropped", drop_reason: "queue-full" }),
    );
    expect(fixture.ui.confirms).toHaveLength(MAX_PENDING_APPROVALS);

    // Answering one leaves the others open, so the host is not told it stopped waiting.
    fixture.ui.answer[0]?.(true);
    await until(() => fixture.ping.sent.some((s) => s.message.details?.kind === "message"));
    expect(waiting()).toEqual([{ protocol: 1, waiting: true }]);
  });

  it("tells the host it stopped waiting when the session shuts down mid-dialog", async () => {
    const fixture = await startSession();
    await fixture.send(`uds:${fixture.runtime}/cc-socks/820000.sock`, "hold", { hold: true });
    await until(() => fixture.ui.confirms.length === 1);
    const waiting = () =>
      fixture.ping.emitted.filter((e) => e.channel === APPROVAL_STATE).map((e) => e.data);
    expect(waiting()).toEqual([{ protocol: 1, waiting: true }]);

    // Shut down with the dialog still on screen, then answer it: nothing is said twice.
    await fixture.fire("session_shutdown", { reason: "quit" });
    expect(waiting()).toEqual([
      { protocol: 1, waiting: true },
      { protocol: 1, waiting: false },
    ]);
    fixture.ui.answer[0]?.(true);
    await wait(50);
    expect(waiting()).toHaveLength(2);
    expect(fixture.ping.sent).toHaveLength(0);
  });

  it("hears an idle notice that answers the subscription as it is made", async () => {
    const fixture = await startSession();
    const peer = await fixture.mailbox("710003");
    const peerAddress = encodeAddress(join(fixture.runtime, "cc-socks", "710003.sock"));
    // A session that is already idle answers notify_when_idle at once: the notice comes back while
    // the send that made the subscription is still in flight.
    const notice = controlFrame("peer_idle_notice", {
      orig_msg_id: "",
      state: "idle",
      from: peerAddress,
    });
    await peer.inbox.close();
    const subscribed: Frame[] = [];
    const inbox = await bindInbox(join(fixture.runtime, "cc-socks", "710003.sock"), (frame) => {
      subscribed.push(frame);
      if (frame.action !== "notify_when_idle") return;
      void sendFrame(fixture.socketPath(), {
        ...notice,
        orig_msg_id: frame.msg_id,
        from: peerAddress,
      });
    });
    running.push({
      ...fixture,
      close: async () => {
        await inbox.close().catch(() => {});
        await fixture.close();
      },
    });
    writeFileSync(
      join(fixture.home, ".claude", "sessions", `${process.ppid}.json`),
      JSON.stringify({
        pid: process.ppid,
        sessionId: "peer-session",
        cwd: "/elsewhere",
        startedAt: Date.now() - 1000,
        kind: "interactive",
        entrypoint: "pi",
        peerProtocol: 1,
        peerFeatures: [FEATURE_NOTIFY_IDLE],
        messagingSocketPath: join(fixture.runtime, "cc-socks", "710003.sock"),
        name: "peer-alpha",
        status: "idle",
        statusUpdatedAt: Date.now() - 1000,
      }),
    );

    const send = fixture.tool("send_message");
    const result = await send.execute(
      "call-1",
      { to: "peer-alpha", notify_when_idle: true },
      undefined,
      undefined,
      fixture.ui.ctx,
    );
    expect(JSON.stringify(result)).toContain("Subscribed");
    await until(() => fixture.ping.sent.some((s) => s.message.details?.kind === "idle"));
    const noticeMessage = fixture.ping.sent.find((s) => s.message.details?.kind === "idle");
    expect(noticeMessage?.message.content).toContain("peer-alpha");
    expect(noticeMessage?.options?.triggerTurn).toBe(true);
  });
});

describe("shutdown", () => {
  it("leaves no entry behind, and nothing can write one back", async () => {
    const fixture = await startSession();
    expect(existsSync(fixture.entryFile)).toBe(true);

    await fixture.fire("agent_start");
    await until(() => fixture.entry()?.status === "busy");
    // A status change with its write still in flight when the shutdown starts must not outlive it.
    await fixture.fire("agent_start");
    await fixture.fire("session_shutdown", { reason: "reload" });
    expect(existsSync(fixture.entryFile)).toBe(false);
    expect(existsSync(String(fixture.entry()?.messagingSocketPath ?? ""))).toBe(false);

    // Whatever arrived before the session came back: a turn's edge, an adapter's answer.
    await fixture.fire("agent_start");
    await fixture.fire("agent_settled");
    fixture.ping.pi.events.emit(REGISTRY_METADATA, { protocol: 1, metadata: { hubPeer: true } });
    await wait(50);
    expect(existsSync(fixture.entryFile)).toBe(false);
  });
});
