/**
 * Test-only isolation for the peers scenario, and the one inbound message its screen needs.
 *
 * A pi session is launched with `HOME` forced to the person's (the driver owns that), so a session
 * cannot be kept out of their Claude registry by the launch environment alone. This extension is
 * loaded into the session before any plugin's handler runs and points `HOME`,
 * `CLAUDE_CONFIG_DIR` and `XDG_RUNTIME_DIR` at folders under the run's own directory, whose paths
 * the scenario's `setup` wrote beside the fixture. The registry, the sockets and `homedir()` then
 * all stay inside the run; production discovery is untouched, and only this session's environment
 * differs.
 *
 * It also binds an inbox of its own in the fixture's socket dir and, once the session has registered
 * itself, sends it one peer message. That is what puts a `<peer-message>` in the transcript, so the
 * scenario photographs the message renderer and the reply address a real peer would be given.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  bindInbox,
  buildEnvelope,
  encodeAddress,
  sendFrame,
  userFrame,
} from "../pi/peers/protocol.ts";

/** What the scenario's setup writes into the fixture: folders under the run, and what to send. */
type Isolation = {
  home: string;
  claudeConfig: string;
  runtime: string;
  message: { body: string; fromName: string };
};

const FILE = ".e2e-isolation.json";

/**
 * The folders the scenario's setup wrote. Anything missing or malformed is fatal: a fixture that
 * quietly carried on would fall back to the person's own home and join their real registry, which
 * is the one thing this isolation exists to prevent.
 */
function read(): Isolation {
  const file = join(process.cwd(), FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`claude-peers e2e fixture: cannot read ${file}: ${String(error)}`);
  }
  const where = parsed as Partial<Isolation>;
  for (const key of ["home", "claudeConfig", "runtime"] as const)
    if (typeof where[key] !== "string" || !where[key])
      throw new Error(`claude-peers e2e fixture: ${file} has no \`${key}\``);
  const message = where.message;
  if (!message || typeof message.body !== "string" || typeof message.fromName !== "string")
    throw new Error(`claude-peers e2e fixture: ${file} has no message to deliver`);
  return where as Isolation;
}

const isolation = read();

// `os.homedir()` reads the environment on every call, so the plugin, which reads it in its own
// handlers, sees the fixture's folders.
process.env.HOME = isolation.home;
process.env.CLAUDE_CONFIG_DIR = isolation.claudeConfig;
process.env.XDG_RUNTIME_DIR = isolation.runtime;
mkdirSync(isolation.claudeConfig, { recursive: true, mode: 0o700 });

/** The registry entry the session wrote for itself, once the plugin has written it. */
function ownSocket(sessionId: string): { socketPath: string; sessionId: string } | undefined {
  try {
    const entry = JSON.parse(
      readFileSync(join(isolation.claudeConfig, "sessions", `${process.pid}.json`), "utf8"),
    ) as { messagingSocketPath?: string; sessionId?: string };
    if (entry.messagingSocketPath && entry.sessionId === sessionId)
      return { socketPath: entry.messagingSocketPath, sessionId: entry.sessionId };
  } catch {}
  return undefined;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export default function (pi: ExtensionAPI) {
  // A PID-shaped name, so this inbox is addressed like any session's.
  const socketPath = join(isolation.runtime, "cc-socks", "999999.sock");
  const address = encodeAddress(socketPath);
  let inbox: { close(): Promise<void> } | undefined;
  let sent = false;

  pi.on("session_start", async (_event, ctx) => {
    if (sent) return;
    sent = true;
    mkdirSync(join(isolation.runtime, "cc-socks"), { recursive: true, mode: 0o700 });
    inbox = await bindInbox(socketPath, () => {});
    const sessionId = ctx.sessionManager.getSessionId();
    // The plugin registers in its own session_start handler, which runs first; wait for its entry.
    for (let attempt = 0; attempt < 50; attempt++) {
      const own = ownSocket(sessionId);
      if (own) {
        const frame = userFrame({
          content: buildEnvelope({
            from: address,
            fromName: isolation.message.fromName,
            fromMode: "prompting",
            body: isolation.message.body,
          }),
          from: address,
          sessionId: own.sessionId,
        });
        await sendFrame(own.socketPath, frame).catch(() => {});
        return;
      }
      await wait(100);
    }
  });

  pi.on("session_shutdown", async () => {
    await inbox?.close().catch(() => {});
  });
}
