/**
 * Same-user live reload, told honestly.
 *
 * There is no reload API in either harness that another process can call. pi sessions advertise
 * themselves (pid, status, requestPath) in `<state>/sessions`; the bridge inside a session polls its
 * request file and writes an ack. This module only delivers requests and reports what the ack says:
 * without an ack it says "requested", never "reloaded". Claude Code resolves plugin paths at launch,
 * so it has no bridge at all and the only honest answer is "restart the session".
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { UpdatesError, describeError } from "./core/errors.ts";
import { readJsonObject, writeJsonAtomic } from "./core/json.ts";
import { sessionsDir } from "./core/paths.ts";
import { type SessionRecord, REQUEST_TTL_SECONDS, isoSeconds } from "./core/protocol.ts";

export type ProcessState = "alive" | "missing" | "foreign" | "unreadable";

export class Session {
  readonly file: string;
  readonly data: SessionRecord;
  readonly process: ProcessState;

  constructor(file: string, data: SessionRecord, process: ProcessState) {
    this.file = file;
    this.data = data;
    this.process = process;
  }

  get harness(): string | undefined {
    return typeof this.data.harness === "string" ? this.data.harness : undefined;
  }

  get sessionId(): string {
    return typeof this.data.sessionId === "string"
      ? this.data.sessionId
      : basename(this.file).replace(/\.json$/, "");
  }

  get status(): string {
    return typeof this.data.status === "string" ? this.data.status : "busy";
  }

  get requestPath(): string | null {
    const value = this.data.requestPath;
    return typeof value === "string" && value ? value : null;
  }

  /** The last answer the bridge gave, which belongs to the request it answered. */
  ack(): Record<string, unknown> | undefined {
    const path = this.requestPath;
    return path ? readJsonObject(`${path}.ack`) : undefined;
  }

  describe(): string {
    const note = this.process === "alive" ? "" : ` (${this.process})`;
    const ack = this.ack();
    const status = ack?.status;
    const answered = typeof status === "string" ? ` last ack ${status}` : "";
    return `${this.harness ?? "unknown"} ${this.sessionId} ${this.status}${note}${answered}`;
  }
}

export function loadSessions(state: string): Session[] {
  const directory = sessionsDir(state);
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const sessions: Session[] = [];
  for (const name of files) {
    const file = join(directory, name);
    const data = readJsonObject(file);
    if (data === undefined) {
      sessions.push(new Session(file, {}, "unreadable"));
      continue;
    }
    sessions.push(new Session(file, data, processState(data.pid)));
  }
  return sessions;
}

export function processState(pid: unknown): ProcessState {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return "missing";
  try {
    process.kill(pid, 0);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM" ? "foreign" : "missing";
  }
  const owner = processOwner(pid);
  if (owner === null) return "alive";
  const euid = typeof process.geteuid === "function" ? process.geteuid() : null;
  return owner === euid ? "alive" : "foreign";
}

function processOwner(pid: number): number | null {
  let status: string;
  try {
    status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  } catch {
    return null;
  }
  for (const line of status.split("\n")) {
    if (!line.startsWith("Uid:")) continue;
    const value = line.split(/\s+/)[1];
    if (value === undefined) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export type Delivery =
  | { outcome: "error"; detail: string }
  | {
      outcome: "pending";
      detail: { request: Record<string, unknown>; previousAck?: Record<string, unknown> };
    }
  | {
      outcome: "written";
      detail: {
        request: { id: string; requestedAt: string };
        previousAck?: Record<string, unknown>;
      };
    };

/**
 * Ask `session` to reload *now*.
 *
 * A request always goes out for the update that just happened: an ack on a request that is still
 * lying around answers an *earlier* update, so it is reported as history and the file is replaced.
 * The exception is a request the bridge has not answered and has not removed — that is an update
 * still in flight, and overwriting it would make the session reload twice or report the wrong one.
 */
export function deliver(session: Session, ttl: number = REQUEST_TTL_SECONDS): Delivery {
  const path = session.requestPath;
  if (path === null) return { outcome: "error", detail: "the session file has no requestPath" };
  const previous = readJsonObject(path);
  const ack = session.ack();
  let previousAck: Record<string, unknown> | undefined;
  if (previous === undefined) {
    // No request on disk: the bridge claimed it (and normally removes it), so whatever the ack
    // file says belongs to an earlier update. Report it as history and deliver.
    previousAck = ack;
  } else if (ack !== undefined && ack.id === previous.id) {
    // Answered but not cleaned up: consume the answer, then deliver this update's request.
    previousAck = ack;
  } else {
    let age = ttl;
    try {
      age = Date.now() / 1000 - fs.statSync(path).mtimeMs / 1000;
    } catch {
      age = ttl;
    }
    if (age < ttl) return { outcome: "pending", detail: { request: previous, previousAck: ack } };
  }
  const request = { id: randomUUID().replace(/-/g, ""), requestedAt: isoSeconds() };
  try {
    writeJsonAtomic(path, request);
  } catch (error) {
    if (error instanceof UpdatesError) return { outcome: "error", detail: error.message };
    return { outcome: "error", detail: `cannot write ${path}: ${describeError(error)}` };
  }
  return { outcome: "written", detail: { request, previousAck } };
}

export type LiveConsole = { say(message?: string): void };

/** Best effort: deliver requests, report exactly what is known and nothing more. */
export function runLive(state: string, harnesses: readonly string[], console: LiveConsole): void {
  const sessions = loadSessions(state);
  for (const harness of harnesses) {
    if (harness === "claude") {
      console.say(
        "live claude: unsupported; restart the session (Claude Code resolves plugin paths at launch)",
      );
      continue;
    }
    const group = sessions.filter((session) => session.harness === "pi");
    const usable = group.filter((session) => session.process === "alive");
    if (usable.length < group.length) {
      console.say(`live pi: ignored ${group.length - usable.length} stale session file(s)`);
    }
    if (usable.length === 0) {
      console.say(
        "live pi: no running pi session with an update bridge; restart older sessions to enable it",
      );
      continue;
    }
    for (const session of usable) {
      const result = deliver(session);
      if (result.outcome === "pending") {
        console.say(`live pi: ${session.sessionId} has an unanswered request; not queued again`);
      } else if (result.outcome === "written") {
        // Never report an older update's answer as this one's result.
        reportAck(console, session, result.detail.previousAck, "previous request");
        // The bridge handles a request whenever the session is next free; "busy" only means the
        // human is mid-turn, so say what we know: it is queued, not applied.
        const verb = session.status === "idle" ? "requested" : "queued";
        console.say(`live pi: ${verb} in ${session.sessionId} (${session.status}); not confirmed`);
      } else {
        console.say(`live pi: ${result.detail}`);
      }
    }
  }
}

/** Say what an ack claims, for the update it belongs to and no other. */
export function reportAck(
  console: LiveConsole,
  session: Session,
  ack: Record<string, unknown> | undefined,
  what: string,
): void {
  if (ack === undefined) return;
  const status = ack.status;
  if (status === "applied") {
    console.say(`live pi: ${session.sessionId}'s ${what} was applied`);
  } else if (status === "failed") {
    const message = typeof ack.message === "string" && ack.message ? ack.message : "no message";
    console.say(`live pi: ${session.sessionId}'s ${what} failed: ${message}`);
  } else {
    console.say(`live pi: ${session.sessionId}'s ${what} answered ${JSON.stringify(status)}`);
  }
}
