/**
 * Claude Code's same-machine cross-session protocol, as read out of the Claude Code 2.1.331 binary
 * and its cross-session-messaging docs: a session registry under `<config dir>/sessions`
 * (`~/.claude` on a plain install, `~/.claude-work` for a work wrapper), one Unix socket per session
 * under `cc-socks`, and newline-delimited JSON frames on it. Undocumented upstream, so any Claude
 * Code release may change it: everything here is read off one version, not promised by an API.
 *
 * Node built-ins only, so it can run outside pi for protocol tests.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { formatAge } from "./format.ts";

/** The custom message type a peer's message reaches pi's transcript as. */
export const PEER_MESSAGE_TYPE = "claude-peer-message";

export const PEER_PROTOCOL = 1;
export const FEATURE_NOTIFY_IDLE = "notify_idle";
// An idle recipient holds messages for its user's next prompt instead of starting a turn. Pi's own
// features are namespaced, so a future Claude feature of the same name cannot mean something else.
export const FEATURE_QUEUE_WHEN_IDLE = "pi:queue_when_idle";
// What pi extensions advertised before the namespace; still read from a peer that sends only this.
export const LEGACY_FEATURE_QUEUE_WHEN_IDLE = "queue_when_idle";

/** Whether a peer holds messages while idle, under either name it may have advertised. */
export const supportsQueueWhenIdle = (peer: Pick<Peer, "peerFeatures">) =>
  [FEATURE_QUEUE_WHEN_IDLE, LEGACY_FEATURE_QUEUE_WHEN_IDLE].some((name) =>
    peer.peerFeatures?.includes(name),
  );
const TAG = "cross-session-message";
// Claude drops a connection once this much arrives without a newline.
export const MAX_FRAME_BYTES = 1024 * 1024;
// AF_UNIX path limit Claude applies before falling back to /tmp/cc-socks-<uid>.
const MAX_SOCKET_PATH = 103;
// A peer that opens this many connections at once is not a peer this session has to serve.
export const MAX_INBOX_CONNECTIONS = 64;

export type PermissionClass = "bypass" | "prompting";

export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart?: string;
  version?: string;
  peerProtocol?: number;
  peerFeatures?: string[];
  kind: string;
  entrypoint?: string;
  pidDomain?: string;
  messagingSocketPath?: string;
  name?: string;
  nameSource?: string;
  nameSince?: number;
  updatedAt?: number;
  status?: string;
  statusUpdatedAt?: number;
  /** What a `waiting` session waits on; Claude Code writes its own, pi the open dialog's label. */
  waitingFor?: string;
  /** Adapter-owned: why the last turn failed, until the next turn starts. */
  hubFailed?: string;
  /** Adapter-owned: a peer's message woke the running turn. */
  hubPeer?: boolean;
  /** Adapter-owned: leave this session off the agent hub's bar. */
  hubHidden?: boolean;
  /** Adapter-owned: the tmux pane this session runs in, when it does. */
  tmux?: string;
  [key: string]: unknown;
}

export interface Peer extends RegistryEntry {
  messagingSocketPath: string;
  name: string;
}

/**
 * Claude config dirs this machine uses: the one CLAUDE_CONFIG_DIR names, `~/.claude`, and sibling
 * profiles such as `~/.claude-work` that already hold a registry. Each profile keeps its own
 * registry, so one without the others hides every session belonging to a different login.
 */
function configDirs(): string[] {
  const home = homedir();
  const dirs = [process.env.CLAUDE_CONFIG_DIR, path.join(home, ".claude")].filter(
    (dir): dir is string => !!dir,
  );
  for (const name of entries(home).sort())
    if (/^\.claude-[^.]+$/.test(name) && existsSync(path.join(home, name, "sessions")))
      dirs.push(path.join(home, name));
  return [...new Set(dirs)];
}

function real(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every session registry on this machine; profiles symlinked together count once. */
export function registryDirs(): string[] {
  return [...new Set(configDirs().map((dir) => real(path.join(dir, "sessions"))))];
}

/** Socket directory Claude itself binds in; reply addresses outside it are refused. */
export function socketDir(): string {
  const base = process.env.XDG_RUNTIME_DIR || process.env.CLAUDE_CODE_TMPDIR || tmpdir();
  const dir = path.join(base, "cc-socks");
  const longest = path.join(dir, `${2 ** 22}-ffffffff.sock`);
  return longest.length <= MAX_SOCKET_PATH ? dir : `/tmp/cc-socks-${process.getuid?.() ?? 0}`;
}

/**
 * A socket directory this user's sessions may answer in: a real directory, not a link to one, owned
 * by this user and closed to others, which is what Claude creates (`ensureSocketDir`).
 */
function ownSocketDir(dir: string): boolean {
  try {
    const st = lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
    if (process.getuid && st.uid !== process.getuid()) return false;
    return (st.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

/**
 * Every directory a Claude session on this machine binds its inbox in, as the filesystem has it:
 * one per base (`XDG_RUNTIME_DIR`, `CLAUDE_CODE_TMPDIR`, the tmp dir) plus the `/tmp/cc-socks-<uid>`
 * fallback Claude takes when a path is over the AF_UNIX limit. A reply may go to any of them and
 * nowhere else. Both the named and the resolved form are compared, since an address may name either
 * and `/tmp` is `/private/tmp` on macOS; the directory itself must still be a real one.
 */
export function socketDirs(): string[] {
  const bases = [process.env.XDG_RUNTIME_DIR, process.env.CLAUDE_CODE_TMPDIR, tmpdir()].filter(
    (base): base is string => !!base,
  );
  const dirs = [
    ...bases.map((base) => path.join(base, "cc-socks")),
    `/tmp/cc-socks-${process.getuid?.() ?? 0}`,
  ];
  return [...new Set(dirs.flatMap((dir) => [dir, real(dir)]))].filter(ownSocketDir);
}

/**
 * Where an inbound frame may be answered: a `uds:` address naming a live socket in one of the
 * directories above, named like a session socket, and not this session's own. A link is never
 * followed, and a path outside those directories is refused, so a frame cannot aim this session at
 * a socket of its choosing. A peer whose socket is not one of these still gets its message; only
 * the receipt for it is dropped.
 */
export function replySocket(address: unknown, own: string): string | undefined {
  if (typeof address !== "string") return undefined;
  const target = decodeAddress(address);
  if (!target) return undefined;
  if (target === own) return undefined;
  if (!/^(\d+(-[0-9a-f]{8})?|[0-9a-f]{1,16})\.sock$/.test(path.basename(target))) return undefined;
  const parent = path.dirname(target);
  if (!socketDirs().includes(parent) && !socketDirs().includes(real(parent))) return undefined;
  try {
    // A link could point anywhere; a socket is what a bound inbox is, and what a peer has.
    if (!lstatSync(target).isSocket()) return undefined;
  } catch {
    return undefined;
  }
  return target;
}

/** Create the socket dir 0700, refusing one owned by another user like Claude does. */
export function ensureSocketDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  if (!st.isDirectory()) throw new Error(`${dir} is not a directory`);
  if (process.getuid && st.uid !== process.getuid())
    throw new Error(`${dir} is owned by another user`);
  if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}

/**
 * Process start token Claude stores as `procStart` to tell a live owner from a
 * recycled PID: field 22 of /proc/<pid>/stat on Linux, `ps lstart` elsewhere.
 */
export function procStart(pid: number): string | undefined {
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // comm (field 2) may contain spaces and parens; fields resume after the last ')'.
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    }
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      timeout: 1000,
    });
    return out.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

let domain: { value?: string } | undefined;

/** Identifies the PID namespace; Claude treats entries from another domain as foreign. */
export function pidDomain(): string | undefined {
  if (domain) return domain.value;
  domain = {};
  if (process.platform !== "linux") return undefined;
  try {
    const machineId = readFileSync("/etc/machine-id", "utf8").trim();
    domain.value = `linux:${machineId}:${readlinkSync("/proc/self/ns/pid")}`;
  } catch {}
  return domain.value;
}

/** `uds:` address with every byte outside `A-Za-z0-9:_/.-` percent-encoded. */
export function encodeAddress(socketPath: string): string {
  const enc = new TextEncoder();
  return `uds:${socketPath.replace(/[^A-Za-z0-9:_/.-]/gu, (ch) =>
    Array.from(enc.encode(ch), (b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join(""),
  )}`;
}

/** Socket path of a `uds:` address, or undefined for any other address kind. */
export function decodeAddress(address: string): string | undefined {
  if (!address.startsWith("uds:")) return undefined;
  try {
    return decodeURIComponent(address.slice(4));
  } catch {
    return address.slice(4);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function socketReachable(socketPath: string, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const c = connect({ path: socketPath });
    const done = (ok: boolean) => {
      c.destroy();
      resolve(ok);
    };
    c.setTimeout(timeoutMs, () => done(false));
    c.on("connect", () => done(true));
    c.on("error", () => done(false));
  });
}

async function readEntry(file: string): Promise<RegistryEntry | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Live, messageable sessions of other processes from every Claude registry,
 * newest first.
 */
export async function listPeers(): Promise<Peer[]> {
  const domain = pidDomain();
  const files = (
    await Promise.all(
      registryDirs().map((dir) =>
        readdir(dir).then(
          (names) => names.filter((n) => /^\d+\.json$/.test(n)).map((n) => path.join(dir, n)),
          () => [],
        ),
      ),
    )
  ).flat();
  const read = await Promise.all(files.map(readEntry));
  // A pi session registers in every registry, so the socket path is the key.
  const candidates = new Map<string, Peer>();
  for (const entry of read) {
    if (!entry) continue;
    const sock = entry.messagingSocketPath;
    if (typeof sock !== "string" || !sock) continue;
    if (candidates.has(sock)) continue;
    if ((entry.peerProtocol ?? 0) < PEER_PROTOCOL) continue;
    if (entry.pidDomain !== undefined && domain !== undefined && entry.pidDomain !== domain)
      continue;
    if (entry.pid === process.pid) continue;
    if (!pidAlive(entry.pid)) continue;
    if (entry.procStart !== undefined && procStart(entry.pid) !== entry.procStart) continue;
    candidates.set(sock, {
      ...entry,
      messagingSocketPath: sock,
      name: entry.name || `pid ${entry.pid}`,
    });
  }
  const peers = [...candidates.values()];
  const reachable = await Promise.all(peers.map((p) => socketReachable(p.messagingSocketPath)));
  return peers.filter((_, i) => reachable[i]).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Claude's own `[ref]` for a session, so an id read off either harness resolves
 * in both: the first 6 hex digits of sha256(`session:<socket path>`). Claude
 * lengthens a ref only while two collide, so match refs as a prefix of the full
 * digest. Its tengu_session_stable_address flag would hash
 * `session:sid:<sessionId>` instead.
 */
export function shortId(peer: Pick<Peer, "messagingSocketPath">): string {
  return refHash(peer).slice(0, 6);
}

function refHash(peer: Pick<Peer, "messagingSocketPath">): string {
  return createHash("sha256").update(`session:${peer.messagingSocketPath}`).digest("hex");
}

/**
 * When the session last did anything: now while it is not idle, otherwise when
 * it went idle. Claude Code stamps `statusUpdatedAt` on each status change.
 */
export function lastActive(peer: Peer, now = Date.now()): number {
  if (peer.status !== "idle") return now;
  return peer.statusUpdatedAt ?? peer.updatedAt ?? peer.startedAt;
}

export const harness = (peer: Peer) => (peer.entrypoint === "pi" ? "pi" : "claude-code");

/** "busy", or how long ago the session went idle, coarsely ("idle 3h"). */
export function activityLabel(peer: Peer, now = Date.now()): string {
  if (peer.status !== "idle") return peer.status ?? "unknown";
  return `idle ${formatAge(now - lastActive(peer, now), "<1m")}`;
}

export type Resolution = { peer: Peer } | { error: string };

/**
 * Find one peer by `uds:` address, session id (or its short-id prefix),
 * `name [shortid]`, or name. Prefix matches only when unambiguous.
 */
export function resolvePeer(peers: Peer[], to: string): Resolution {
  const query = to
    .trim()
    .replace(/^@/, "")
    .replace(/^"(.*)"$/, "$1");
  // A blank target would otherwise prefix-match every session: with one peer that is a guess, and
  // with none it says "no live session matches" about a question nobody asked.
  if (!query)
    return {
      error:
        "a target session is required: a name, `name [shortid]`, a session id or a uds: address",
    };
  const bracket = /^(.*?)\s*\[([0-9a-f]{4,})\]$/i.exec(query);
  const bracketName = bracket?.[1];
  const bracketId = bracket?.[2];
  const byId = (id: string) =>
    peers.filter((p) => p.sessionId === id || refHash(p).startsWith(id.toLowerCase()));
  const tries: Array<() => Peer[]> = [
    () =>
      peers.filter(
        (p) =>
          encodeAddress(p.messagingSocketPath) === query ||
          p.messagingSocketPath === decodeAddress(query),
      ),
    () =>
      bracketId === undefined
        ? []
        : byId(bracketId).filter((p) => !bracketName || p.name === bracketName),
    () => peers.filter((p) => p.sessionId === query),
    () => peers.filter((p) => p.name === query),
    () => peers.filter((p) => p.name.toLowerCase() === query.toLowerCase()),
    () => (/^[0-9a-f]{4,}$/i.test(query) ? byId(query) : []),
    () => peers.filter((p) => p.name.toLowerCase().startsWith(query.toLowerCase())),
  ];
  for (const attempt of tries) {
    const hits = attempt();
    const [only] = hits;
    if (hits.length === 1 && only) return { peer: only };
    if (hits.length > 1)
      return {
        error: `"${to}" matches several sessions: ${hits.map((p) => `${p.name} [${shortId(p)}]`).join(", ")}`,
      };
  }
  const known = peers.map((p) => `${p.name} [${shortId(p)}]`).join(", ") || "none";
  return { error: `no live session matches "${to}". Reachable: ${known}` };
}

/**
 * `body` with the `<` of every `<tag` and `</tag` turned into `<\`, the way
 * Claude keeps a body from closing its envelope. Claude also folds lookalike
 * characters, which this simpler escape does not.
 */
export function escapeTag(body: string, tag: string): string {
  return body.replace(new RegExp(`<(?=\\s*/?\\s*${tag})`, "giu"), "<\\");
}

const escapedTagInBody = new RegExp(`<\\\\(?=\\s*/?\\s*${TAG})`, "giu");

/** `value` made safe for a double-quoted attribute, capped at 64 characters. */
export function attr(value: string): string {
  const clean = value
    .replace(/["<>]/g, "")
    .replace(/[\p{Cf}\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/gu, "")
    .trim();
  const chars = [...clean];
  return chars.length > 64 ? `${chars.slice(0, 64).join("")}…` : clean;
}

export interface Envelope {
  from?: string;
  fromSession?: string;
  fromName?: string;
  fromMode?: PermissionClass;
  body: string;
}

/** Attribute order is fixed: Claude re-serializes what it parses and drops a mismatch. */
export function buildEnvelope(e: Envelope): string {
  const attrs: string[] = [];
  if (e.from) attrs.push(`from="${e.from}"`);
  if (e.fromSession && /^[A-Za-z0-9_-]{1,80}$/.test(e.fromSession))
    attrs.push(`from-session="${e.fromSession}"`);
  const name = e.fromName === undefined ? "" : attr(e.fromName);
  if (name) attrs.push(`from-name="${name}"`);
  if (e.fromMode) attrs.push(`from-mode="${e.fromMode}"`);
  return `<${TAG}${attrs.map((a) => ` ${a}`).join("")}>\n${escapeTag(e.body, TAG)}\n</${TAG}>`;
}

/** Parse an inbound envelope; content without one comes back as the body. */
export function parseEnvelope(content: string): Envelope {
  const m = new RegExp(`^<${TAG}((?:\\s+[a-z-]+="[^"]*")*)>\\n([\\s\\S]*)\\n</${TAG}>$`).exec(
    content,
  );
  if (!m) return { body: content };
  const [, attrsPart = "", body = ""] = m;
  const attrs = Object.fromEntries(
    [...attrsPart.matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
  );
  const mode = attrs["from-mode"];
  return {
    from: attrs.from,
    fromSession: attrs["from-session"],
    fromName: attrs["from-name"],
    fromMode: mode === "bypass" || mode === "prompting" ? mode : undefined,
    body: body.replace(escapedTagInBody, "<"),
  };
}

export interface UserFrame {
  msgV: 1;
  msg_id: string;
  type: "user";
  message: { role: "user"; content: string };
  priority: "now" | "next" | "later";
  from?: string;
  session_id?: string;
}

export function userFrame(o: { content: string; from?: string; sessionId?: string }): UserFrame {
  return {
    msgV: 1,
    msg_id: randomUUID(),
    type: "user",
    message: { role: "user", content: o.content },
    priority: "next",
    ...(o.from && { from: o.from }),
    ...(o.sessionId && { session_id: o.sessionId }),
  };
}

/**
 * `status` of a `peer_message_status` receipt. As of Claude Code 2.1.316, a
 * Claude sender reads `status` and, on `dropped`, `drop_reason`, and never
 * `reason`. Each status it knows prints fixed text and queues a prompt for the
 * sender: `held` blames permission modes and promises a later status, and
 * `delivered` says the message was approved. So a message that simply arrived
 * gets no receipt, as from Claude Code itself. Claude ignores `queued`, which
 * only pi senders read.
 */
export type ReceiptStatus = "held" | "delivered" | "denied" | "expired" | "dropped" | "queued";

/**
 * The `drop_reason`s of a `dropped` receipt this extension sends, all of them names Claude accepts:
 * `queue-full` for a message this session had no room to hold, `rate-limited` and `duplicate` for
 * the per-sender loop guard.
 */
export type DropReason = "rate-limited" | "duplicate" | "queue-full";

export function controlFrame(
  action: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return { msgV: 1, msg_id: randomUUID(), type: "control", action, ...fields };
}

/**
 * Write one frame and wait for the receiver to close. Resolving means the frame was written to this
 * side's socket and the receiver then closed cleanly: nothing more. It is not a delivery receipt —
 * only the receiver's own `peer_message_status` can say what became of it.
 *
 * Rejects when the write did not complete: a connection error, the timeout, or a receiver that
 * closed before our write callback ran. That last one is why `wrote` is tracked: a clean close on
 * its own used to leave the promise pending for its whole timeout, and resolving on any close would
 * report a send that may never have been written.
 */
export function sendFrame(socketPath: string, frame: object, timeoutMs = 5000): Promise<void> {
  const line = `${JSON.stringify(frame)}\n`;
  if (Buffer.byteLength(line) > MAX_FRAME_BYTES)
    return Promise.reject(new Error("message is over the 1 MiB frame limit"));
  return new Promise((resolve, reject) => {
    const c = connect({ path: socketPath });
    let wrote = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    // Every way out goes through here, so no path leaves the promise pending and none settles twice.
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c.destroy();
      if (error) reject(error);
      else resolve();
    };
    // A socket's own timeout is an *idle* one, and a receiver that drains slowly keeps resetting it,
    // so a frame could sit in the buffer indefinitely: this deadline belongs to the frame, not to the
    // socket's activity, and a peer that stops reading cannot hold a turn open.
    timer = setTimeout(() => settle(new Error(`timed out sending to ${socketPath}`)), timeoutMs);
    c.on("error", (error) => settle(error));
    c.on("connect", () => c.end(line, () => (wrote = true)));
    c.on("close", (hadError) => {
      if (hadError) settle(new Error(`connection to ${socketPath} closed with an error`));
      else if (wrote) settle();
      else settle(new Error(`connection to ${socketPath} closed before the frame was written`));
    });
    // The receiver may answer on this connection; nothing in v1 needs it.
    c.on("data", () => {});
  });
}

/** A listening inbox, closed without waiting on a peer that holds its connection open. */
export interface Inbox {
  socketPath: string;
  /** Stop listening, drop every open connection, and resolve once the socket file is gone. */
  close(): Promise<void>;
}

/** Larger than a frame, by characters or by bytes, is a line nobody should be sending. */
const overCap = (text: string) =>
  text.length > MAX_FRAME_BYTES || Buffer.byteLength(text) > MAX_FRAME_BYTES;

/**
 * Bind a 0600 listening socket that hands each parsed frame to `onFrame`.
 * Node exposes no SO_PEERCRED, so unlike Claude it cannot verify the sender's pid.
 */
export async function bindInbox(
  socketPath: string,
  onFrame: (frame: Record<string, unknown>) => void,
): Promise<Inbox> {
  ensureSocketDir(path.dirname(socketPath));
  if (await socketReachable(socketPath)) throw new Error(`${socketPath} is already in use`);
  await unlink(socketPath).catch(() => {});
  const connections = new Set<Socket>();
  const deliver = (line: string) => {
    if (!line.trim()) return;
    // A completed line over the cap is dropped whole, like malformed JSON: parsing it is what the
    // cap exists to prevent.
    if (overCap(line)) return;
    try {
      const frame = JSON.parse(line);
      if (frame && typeof frame === "object") onFrame(frame);
    } catch {
      // Malformed lines are dropped, as Claude does.
    }
  };
  const server: Server = createServer((conn) => {
    // A flood of connections is cut off at the socket: each one holds a buffer and a timer.
    if (connections.size >= MAX_INBOX_CONNECTIONS) {
      conn.destroy();
      return;
    }
    connections.add(conn);
    conn.on("close", () => connections.delete(conn));
    conn.setEncoding("utf8");
    let pending = "";
    conn.setTimeout(30_000, () => conn.destroy());
    conn.on("data", (chunk: string) => {
      pending += chunk;
      let start = 0;
      for (let at = pending.indexOf("\n"); at !== -1; at = pending.indexOf("\n", start)) {
        deliver(pending.slice(start, at));
        start = at + 1;
      }
      pending = pending.slice(start);
      // A line that never ends must not grow the buffer without bound.
      if (overCap(pending)) conn.destroy();
    });
    // Claude's sender resolves only once the socket fully closes.
    conn.on("end", () => conn.end());
    conn.on("error", () => {});
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  chmodSync(socketPath, 0o600);
  let closing: Promise<void> | undefined;
  return {
    socketPath,
    close: () =>
      // Closing twice is the same as closing once, so a shutdown and a failed start can both ask.
      (closing ??= (async () => {
        // A peer that holds its connection open must not hold up quitting, a reload or /new.
        for (const conn of connections) conn.destroy();
        const closed = new Promise<void>((resolve) => server.close(() => resolve()));
        // Unlinked at once and never again: the path belongs to the pid, so the next session in
        // this process binds it before this one has finished stopping, and a later unlink here
        // would take away the socket the new session just made.
        await unlink(socketPath).catch(() => {});
        await closed;
      })()),
  };
}

/** Register in every Claude profile's registry, so each login sees this session. */
export async function writeRegistryEntry(entry: RegistryEntry): Promise<void> {
  const body = JSON.stringify(entry);
  await Promise.allSettled(
    registryDirs().map(async (dir) => {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `${entry.pid}.json`);
      const tmp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
      await writeFile(tmp, body, { mode: 0o644 });
      await rename(tmp, file);
    }),
  );
}

export async function removeRegistryEntry(pid: number): Promise<void> {
  await Promise.all(
    registryDirs().map((dir) => unlink(path.join(dir, `${pid}.json`)).catch(() => {})),
  );
}
