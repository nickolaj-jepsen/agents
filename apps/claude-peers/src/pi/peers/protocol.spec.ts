import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindInbox,
  buildEnvelope,
  controlFrame,
  MAX_INBOX_CONNECTIONS,
  registryDirs,
  replySocket,
  socketDir,
  socketDirs,
  decodeAddress,
  encodeAddress,
  escapeTag,
  MAX_FRAME_BYTES,
  parseEnvelope,
  resolvePeer,
  sendFrame,
  userFrame,
  type Inbox,
  type Peer,
} from "./protocol.ts";

const dir = () => mkdtempSync(join(tmpdir(), "claude-peers-"));
const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const done of cleanups.splice(0)) done();
});

/** An inbox inside the socket dir of a scratch XDG_RUNTIME_DIR, which is where a peer's is. */
async function peerInbox(name: string, onFrame: (frame: Record<string, unknown>) => void) {
  const inbox = await bindInbox(join(socketDir(), name), onFrame);
  cleanups.push(() => void inbox.close());
  return inbox;
}

/** An inbox in a scratch dir, closed and forgotten after the test. */
async function inboxIn(onFrame: (frame: Record<string, unknown>) => void): Promise<Inbox> {
  const socketPath = join(dir(), `${process.pid}.sock`);
  const inbox = await bindInbox(socketPath, onFrame);
  cleanups.push(() => void inbox.close());
  return inbox;
}

/** A client connection that the test drives frame by frame. */
function clientTo(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

const peer = (over: Partial<Peer> = {}): Peer => ({
  pid: 1,
  sessionId: "sid",
  cwd: "/w",
  startedAt: 1,
  kind: "interactive",
  messagingSocketPath: "/run/cc-socks/1.sock",
  name: "alpha",
  ...over,
});

describe("envelope", () => {
  it("round-trips a body that closes its own tag", () => {
    const body = 'a <cross-session-message from="x"> b </cross-session-message>';
    const content = buildEnvelope({ from: "uds:/run/cc-socks/2.sock", fromName: "beta", body });
    expect(content).toContain("<\\cross-session-message");
    expect(parseEnvelope(content).body).toBe(body);
  });

  it("keeps a body without an envelope whole", () => {
    expect(parseEnvelope("hello\nworld").body).toBe("hello\nworld");
  });

  it("does not read a mode it does not know", () => {
    const content = `<cross-session-message from-mode="anything">\nhi\n</cross-session-message>`;
    expect(parseEnvelope(content).fromMode).toBeUndefined();
  });

  it("escapes only the enclosing tag", () => {
    expect(escapeTag("a <b> <cross-session-message>", "cross-session-message")).toBe(
      "a <b> <\\cross-session-message>",
    );
  });

  it("keeps addresses that need encoding intact", () => {
    const path = "/run/user/1 000/cc-socks/9.sock";
    expect(decodeAddress(encodeAddress(path))).toBe(path);
    expect(encodeAddress(path)).not.toContain(" ");
  });
});

describe("resolvePeer", () => {
  it("refuses a blank target instead of prefix-matching the only session", () => {
    expect(resolvePeer([peer()], "  ")).toEqual({ error: expect.stringContaining("target") });
    expect(resolvePeer([peer()], "@")).toEqual({ error: expect.stringContaining("target") });
  });

  it("finds the one session a name names, and says when several match", () => {
    expect(resolvePeer([peer()], "alpha")).toEqual({ peer: peer() });
    expect(resolvePeer([peer(), peer({ name: "beta" })], "b")).toEqual({
      peer: peer({ name: "beta" }),
    });
    // Two that only a prefix tells apart are ambiguous, not the first one.
    expect(resolvePeer([peer({ name: "alpha" }), peer({ name: "alphabet" })], "alph")).toEqual({
      error: expect.stringContaining("matches several"),
    });
  });
});

describe("sendFrame", () => {
  it("refuses a frame over the cap without opening a connection", async () => {
    await expect(
      sendFrame("/nonexistent/peer.sock", { body: "x".repeat(MAX_FRAME_BYTES) }),
    ).rejects.toThrow(/frame limit/);
  });

  it("settles when the receiver hangs up before the frame is written", async () => {
    const socketPath = join(dir(), "3.sock");
    const server = createServer((socket) => socket.end());
    await new Promise<void>((done) => server.listen(socketPath, () => done()));
    cleanups.push(() => server.close());
    const started = Date.now();
    // Either way out is fine; what must not happen is the send staying pending until the timeout.
    await sendFrame(socketPath, userFrame({ content: "hi" }), 10_000).catch(() => {});
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("delivers a frame to a bound inbox", async () => {
    const frames: Record<string, unknown>[] = [];
    const inbox = await inboxIn((frame) => frames.push(frame));
    await sendFrame(inbox.socketPath, controlFrame("notify_when_idle", { from: "uds:/x" }));
    expect(frames).toEqual([expect.objectContaining({ action: "notify_when_idle" })]);
  });
});

describe("registryDirs", () => {
  // The machine-wide lookup, which every session writes into: a test gives it a home of its own.
  it("joins the configured profile and every profile that has a registry", () => {
    const home = mkdtempSync(join("/tmp", "cp-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(home, ".claude-work"));
    for (const name of [".claude", ".claude-work", ".claude-other"])
      mkdirSync(join(home, name, "sessions"), { recursive: true });
    // No registry inside it, so nothing joins it.
    mkdirSync(join(home, ".claude-empty"));
    const real = (name: string) => realpathSync(join(home, name, "sessions"));
    expect(registryDirs().sort()).toEqual(
      [".claude", ".claude-work", ".claude-other"].map(real).sort(),
    );
  });
});

describe("replySocket", () => {
  // Under /tmp, so the socket dir is the named one rather than the uid fallback: the test chmods it.
  const scratch = () => {
    const root = mkdtempSync(join("/tmp", "cp-sockets-"));
    vi.stubEnv("XDG_RUNTIME_DIR", root);
    return root;
  };

  it("answers a session socket in a socket dir of this user's", async () => {
    scratch();
    const peer = await peerInbox("123.sock", () => {});
    const own = await peerInbox("456.sock", () => {});
    expect(socketDirs()).toContain(socketDir());
    expect(replySocket(encodeAddress(peer.socketPath), own.socketPath)).toBe(peer.socketPath);
    // Never itself: a receipt to one's own inbox would be a loop.
    expect(replySocket(encodeAddress(own.socketPath), own.socketPath)).toBeUndefined();
  });

  it("refuses a socket dir another user could write to", async () => {
    const root = scratch();
    const peer = await peerInbox("123.sock", () => {});
    chmodSync(path.join(root, "cc-socks"), 0o777);
    expect(socketDirs()).not.toContain(socketDir());
    expect(replySocket(encodeAddress(peer.socketPath), "/run/cc-socks/9.sock")).toBeUndefined();
  });

  it("refuses a link, a path outside those dirs, a plain file and another name", async () => {
    const root = scratch();
    const peer = await peerInbox("123.sock", () => {});
    symlinkSync(peer.socketPath, join(root, "cc-socks", "124.sock"));
    expect(replySocket(encodeAddress(join(root, "cc-socks", "124.sock")), "")).toBeUndefined();
    writeFileSync(join(root, "cc-socks", "125.sock"), "");
    expect(replySocket(encodeAddress(join(root, "cc-socks", "125.sock")), "")).toBeUndefined();
    expect(replySocket(encodeAddress(join(root, "cc-socks", "not-a-session")), "")).toBeUndefined();
    const elsewhere = await inboxIn(() => {});
    expect(replySocket(encodeAddress(elsewhere.socketPath), "")).toBeUndefined();
    expect(replySocket("tcp:127.0.0.1:1", "")).toBeUndefined();
    expect(replySocket(undefined, "")).toBeUndefined();
  });
});

describe("bindInbox", () => {
  it("serves a bounded number of connections at once", async () => {
    const frames: Record<string, unknown>[] = [];
    const inbox = await inboxIn((frame) => frames.push(frame));
    const clients: Socket[] = [];
    for (let i = 0; i < MAX_INBOX_CONNECTIONS; i++) clients.push(await clientTo(inbox.socketPath));
    cleanups.push(() => clients.forEach((socket) => socket.destroy()));
    const refused = await clientTo(inbox.socketPath);
    cleanups.push(() => refused.destroy());
    const closed = await new Promise<boolean>((done) => {
      refused.once("close", () => done(true));
      setTimeout(() => done(false), 1000);
    });
    expect(closed).toBe(true);
    // The connections already being served are untouched.
    clients[0]?.write(JSON.stringify(controlFrame("rename", { name: "kept" })) + "\n");
    await wait(100);
    expect(frames).toEqual([expect.objectContaining({ action: "rename" })]);
  });

  it("refuses a socket already in use", async () => {
    const inbox = await inboxIn(() => {});
    await expect(bindInbox(inbox.socketPath, () => {})).rejects.toThrow(/already in use/);
  });

  it("drops an over-cap line that a newline completes, and keeps reading", async () => {
    const frames: Record<string, unknown>[] = [];
    const inbox = await inboxIn((frame) => frames.push(frame));
    const socket = await clientTo(inbox.socketPath);
    cleanups.push(() => socket.destroy());
    // Under the cap on its own, so the old guard saw nothing to cut: the newline in the next write
    // completed a line over the cap, which used to be parsed whole.
    socket.write("x".repeat(MAX_FRAME_BYTES - 1000));
    await wait(50);
    socket.write(JSON.stringify({ type: "user", pad: "y".repeat(2000) }) + "\n");
    await wait(50);
    socket.write(JSON.stringify(controlFrame("rename", { name: "kept" })) + "\n");
    await wait(100);
    expect(frames).toEqual([expect.objectContaining({ action: "rename" })]);
  });

  it("cuts a stream that never ends its line, rather than buffering it", async () => {
    const inbox = await inboxIn(() => {});
    const socket = await clientTo(inbox.socketPath);
    cleanups.push(() => socket.destroy());
    const closed = new Promise<void>((done) => socket.once("close", () => done()));
    socket.write("z".repeat(MAX_FRAME_BYTES + 100));
    await closed;
    expect(socket.destroyed).toBe(true);
  });

  it("closes without waiting on a peer that holds its connection open", async () => {
    const socketPath = join(dir(), "4.sock");
    const inbox = await bindInbox(socketPath, () => {});
    const socket = await clientTo(socketPath);
    cleanups.push(() => socket.destroy());
    const started = Date.now();
    await inbox.close();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(existsSync(socketPath)).toBe(false);
  });

  it("closes twice as once", async () => {
    const inbox = await inboxIn(() => {});
    await inbox.close();
    await expect(inbox.close()).resolves.toBeUndefined();
  });
});
