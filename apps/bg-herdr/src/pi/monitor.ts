/**
 * The read-only child terminal for one bg task: its state, its log, and nothing
 * that can act on it.
 *
 * Everything it needs lives inside `monitorMain`, because that function's own
 * source is what runs in the terminal (`monitorScript` in ./script.ts writes it
 * to a file): a module-scope import or constant would be missing there. Its
 * capabilities arrive as `io`, so a spec drives the very same code in-process.
 *
 * The record it renders is untrusted text from another package: names,
 * commands, paths and the log itself all go through `bounded` before they can
 * touch the terminal, so a task cannot clear the screen, move the cursor or
 * reorder text in the window Herdr shows.
 */
import type { BgTask } from "../lib/state.ts";

/** What the bridge writes per task: the task, and when it last saw it change. */
export type MonitorRecord = BgTask & { observedAt?: number };

/** The handle `node:fs/promises`'s `open` resolves to, as far as a log tail needs. */
export interface MonitorFile {
  stat(): Promise<{ size: number }>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown>;
  close(): Promise<void>;
}

export interface MonitorIo {
  readFile(path: string): Promise<string>;
  open(path: string, flags: string): Promise<MonitorFile>;
  delay(ms: number): Promise<void>;
  write(text: string): void;
  now(): number;
}

/** The terminal's shape, as `hc` runs it: a viewport, or the defaults when piped. */
type View = { columns: number; rows: number };

export async function monitorMain(
  io: MonitorIo,
  snapshotPath: unknown,
  parentPid: unknown,
): Promise<void> {
  const KNOWN_STATES = ["running", "stopping", "exited", "failed"];
  const KNOWN = new Set(KNOWN_STATES);
  // Mirrors `statusOf` in ../lib/state.ts, which the written script cannot
  // import; the spec keeps the two in step.
  const STATUS = new Map([
    ["running", "working"],
    ["stopping", "working"],
    ["failed", "error"],
  ]);
  const EXPLANATIONS = new Map([
    ["running", "running; its output appears below"],
    ["stopping", "stop requested; waiting for it to end"],
    ["exited", "ended; see the exit code"],
    ["failed", "never started; pi's session has the error"],
    ["unknown", "unrecognized state; only a newer bg can explain it"],
  ]);

  const DEFAULT_COLUMNS = 80;
  const DEFAULT_ROWS = 24;
  const MIN_COLUMNS = 20;
  const MAX_COLUMNS = 400;
  const MIN_ROWS = 6;
  const MAX_ROWS = 200;
  const NAME_LIMIT = 120;
  const FIELD_LIMIT = 240;
  // The file the bridge writes holds one small task record.
  const MAX_RECORD_CHARS = 64 * 1024;
  // Only the end of a log is shown, and only this much of it is ever read.
  const LOG_BYTES = 16 * 1024;
  // Long log lines are cut, and cutting needs a head start on a wide window.
  const LOG_LINE_CHARS = 4 * 1024;
  const POLL_MS = 300;

  const CLEAR = "\x1b[2J\x1b[H";
  const HOME = "\x1b[H";
  const FOOTER = ["", "Read-only bg monitor. Stop the task from pi's session: bg_stop."];

  // Any CSI (private and colon forms too), then OSC, DCS, PM and APC strings up to BEL or ST.
  const TERMINAL_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]P^_][\s\S]*?(?:\x07|\x1b\\)/g;
  // C0/C1 controls, bidi overrides and isolates, zero-width characters.
  const UNSAFE = /[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

  // `String.prototype.toWellFormed` is newer than this package's lib; it replaces
  // lone surrogates, which some terminals draw as garbage.
  const wellFormed = (text: string): string => {
    const fn = (text as unknown as { toWellFormed?: () => string }).toWellFormed;
    return typeof fn === "function" ? fn.call(text) : text;
  };

  /** One untrusted value as bounded single-line text; anything exotic becomes "". */
  const bounded = (value: unknown, limit: number): string => {
    const raw =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
    const text = wellFormed(raw)
      .replace(TERMINAL_SEQUENCE, " ")
      .replace(UNSAFE, " ")
      .replace(/\s+/g, " ")
      .trim();
    const chars = Array.from(text);
    return chars.length > limit ? chars.slice(0, limit).join("") : text;
  };

  /** A command is one line of the terminal, not a script: only its first line. */
  const firstLine = (value: unknown): string => {
    if (typeof value !== "string") return "";
    const first = wellFormed(value).split("\n")[0] ?? "";
    return bounded(first, FIELD_LIMIT);
  };

  // Wide code points (CJK, Hangul, fullwidth forms, emoji) occupy two cells.
  const WIDE =
    /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|[\u{1f000}-\u{1faff}\u{20000}-\u{3fffd}]/u;
  const cellWidth = (char: string): number => (WIDE.test(char) ? 2 : 1);
  const cellsOf = (text: string): number => {
    let width = 0;
    for (const char of text) width += cellWidth(char);
    return width;
  };

  const truncate = (text: string, width: number): string => {
    if (width <= 0) return "";
    if (cellsOf(text) <= width) return text;
    if (width === 1) return "…";
    let used = 0;
    let out = "";
    for (const char of text) {
      const cells = cellWidth(char);
      if (used + cells > width - 1) break;
      out += char;
      used += cells;
    }
    return `${out}…`;
  };

  const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.trunc(value)))
      : fallback;

  const viewOf = (): View => ({
    columns: clampInt(process.stdout.columns, MIN_COLUMNS, MAX_COLUMNS, DEFAULT_COLUMNS),
    rows: clampInt(process.stdout.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS),
  });

  const fitLine = (line: string, width: number): string => {
    const text = truncate(line, width);
    return text + " ".repeat(Math.max(0, width - cellsOf(text)));
  };

  const timestamp = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 8.64e15
      ? value
      : undefined;

  const formatDuration = (ms: number): string => {
    const total = Math.floor(Math.max(0, ms) / 1000);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours < 24) return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
  };

  const formatAgo = (ms: number): string => (ms < 1000 ? "just now" : `${formatDuration(ms)} ago`);

  /** The status word the lifecycle and the exit add up to (../lib/state.ts). */
  const statusOf = (state: string, code: number | null, signal: string | null): string => {
    if (state === "exited") return signal !== null ? "idle" : code === 0 ? "done" : "error";
    return STATUS.get(state) ?? "idle";
  };

  /** The title and OSC 7501 status Herdr reads; the payload is sanitized first. */
  const protocolHead = (title: string, state: string, status: string): string => {
    const name = bounded(title, NAME_LIMIT) || "task";
    // A fixed vocabulary value, or the word "unknown": never raw record text.
    const lifecycle = KNOWN.has(state) ? state : "unknown";
    const msg = Buffer.from(`${name}: ${lifecycle}`, "utf8").toString("base64");
    return `\x1b]0;bg task: ${name}\x07` + `\x1b]7501;state=${status}:app=bg:msg=${msg}\x1b\\`;
  };

  const parseRecord = (content: string): MonitorRecord | undefined => {
    if (content.length > MAX_RECORD_CHARS) return undefined;
    try {
      const value: unknown = JSON.parse(content);
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as MonitorRecord)
        : undefined;
    } catch {
      return undefined;
    }
  };

  /** The last `limit` bytes of a log, or undefined when it cannot be read. */
  const readTail = async (path: string, limit: number): Promise<string | undefined> => {
    let file: MonitorFile | undefined;
    try {
      file = await io.open(path, "r");
      const { size } = await file.stat();
      const start = Math.max(0, size - limit);
      const buffer = Buffer.alloc(size - start);
      await file.read(buffer, 0, buffer.length, start);
      const text = buffer.toString("utf8");
      // A cut first line would look like a line the program printed.
      return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
    } catch {
      return undefined;
    } finally {
      try {
        await file?.close();
      } catch {
        // The terminal or the file is already gone; nothing left to do.
      }
    }
  };

  /** The log of the record being drawn, read each poll so the window stays live. */
  const logOf = async (record: MonitorRecord | undefined): Promise<string[]> => {
    const path = record?.path;
    // Only an absolute path is opened, and only for a record that has one.
    if (typeof path !== "string" || !path.startsWith("/") || path.length > LOG_LINE_CHARS)
      return [];
    const text = await readTail(path, LOG_BYTES);
    if (typeof text !== "string") return [];
    return text
      .split("\n")
      .map((line) => bounded(line.slice(0, LOG_LINE_CHARS), FIELD_LIMIT))
      .filter((line, index, all) => line !== "" || index !== all.length - 1);
  };

  /** The whole frame: a header, the task, then as much of its log as fits. */
  const screenOf = (
    record: MonitorRecord,
    log: string[],
    view: View,
  ): { head: string; body: string } => {
    const { columns, rows } = view;
    const now = io.now();
    const state =
      typeof record.state === "string" && KNOWN.has(record.state) ? record.state : "unknown";
    const code = typeof record.code === "number" ? Math.trunc(record.code) : null;
    const signal = typeof record.signal === "string" ? record.signal : null;
    const status = statusOf(state, code, signal);
    const id =
      typeof record.id === "number" && Number.isFinite(record.id)
        ? Math.trunc(record.id)
        : undefined;
    const name = bounded(record.name, NAME_LIMIT) || (id === undefined ? "" : `#${id}`) || "task";
    const title = id === undefined ? name : `#${id} ${name}`;

    const badge = state.toUpperCase();
    const left = truncate(title, Math.max(0, columns - badge.length - 1));
    const header = left + " ".repeat(Math.max(1, columns - badge.length - cellsOf(left))) + badge;
    const rule = "─".repeat(columns);

    const startedAt = timestamp(record.startedAt);
    const finishedAt = timestamp(record.finishedAt);
    const details = [`State: ${state} — ${EXPLANATIONS.get(state) ?? ""}`];
    if (startedAt !== undefined && finishedAt !== undefined) {
      const ended = state === "exited" ? `, ended ${formatAgo(now - finishedAt)}` : "";
      details.push(`Ran ${formatDuration(finishedAt - startedAt)}${ended}`);
    } else if (startedAt !== undefined) {
      details.push(`Running ${formatDuration(now - startedAt)}`);
    }
    const exit = [
      code === null ? "" : `exit ${code}`,
      signal === null ? "" : `signal ${bounded(signal, 32)}`,
    ].filter(Boolean);
    if (exit.length > 0) details.push(exit.join(", "));
    if (
      typeof record.pid === "number" &&
      record.pid > 0 &&
      (state === "running" || state === "stopping")
    )
      details.push(`Process group ${record.pid}`);
    const command = firstLine(record.command);
    if (command) details.push(`Command: ${command}`);
    const cwd = bounded(record.cwd, FIELD_LIMIT);
    if (cwd) details.push(`Directory: ${cwd}`);
    const path = bounded(record.path, FIELD_LIMIT);
    if (path) details.push(`Log: ${path}`);

    // The last row is reserved: a frame of exactly `rows` lines would scroll.
    const room = rows - 1;
    const lines = [header, rule, ...details.slice(0, Math.max(0, room - 2))];
    let spare = room - lines.length;
    const footer = spare - 2 - 2 >= FOOTER.length ? FOOTER : [];
    spare -= footer.length;
    // A rule, then at least one line of the log: without room for both, no log.
    if (spare >= 2 && log.length > 0) {
      lines.push(rule, ...log.slice(-(spare - 1)));
    }
    lines.push(...footer);
    return {
      head: protocolHead(title, state, status),
      body: `${lines.map((line) => fitLine(line, columns)).join("\n")}\n`,
    };
  };

  /** A record we cannot read still gets a bounded, honest screen and no crash. */
  const unreadableScreen = (view: View): { head: string; body: string } => {
    const lines = [
      "Unreadable task state",
      "",
      "The monitor keeps watching; pi's session may be restarting.",
    ];
    return {
      head: protocolHead("task", "unknown", "idle"),
      body: `${lines
        .slice(0, Math.max(1, view.rows - 1))
        .map((line) => fitLine(line, view.columns))
        .join("\n")}\n`,
    };
  };

  const write = (text: string) => {
    try {
      io.write(text);
    } catch {
      // The terminal is already gone; nothing left to say.
    }
  };

  const path = typeof snapshotPath === "string" ? snapshotPath : "";
  const pid = Number(parentPid);
  const hasParent = Number.isInteger(pid) && pid > 0;
  const parentAlive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM still means the parent exists, just as another user.
      return (error as { code?: string } | undefined)?.code === "EPERM";
    }
  };

  // Nothing typed here reaches the task: this terminal only reads. Only the
  // first monitor in a process wires the streams, so a spec can drive many.
  process.stdin.resume();
  if (process.stdin.listenerCount("data") === 0) process.stdin.on("data", () => {});
  if (process.stdin.listenerCount("error") === 0) process.stdin.on("error", () => {});
  if (process.stdout.listenerCount("error") === 0) process.stdout.on("error", () => {});

  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
  for (const signal of SIGNALS) process.once(signal, stop);

  let lastHead = "";
  let lastBody = "";
  try {
    while (!stopped && !(hasParent && !parentAlive())) {
      const view = viewOf();
      let content: string;
      try {
        content = await io.readFile(path);
      } catch {
        // The bridge removes the record on cleanup, and writes via rename, so a
        // read error here means the monitor's lifetime is over.
        break;
      }
      const record = parseRecord(content);
      const frame =
        record === undefined ? unreadableScreen(view) : screenOf(record, await logOf(record), view);
      // Exact-width lines let a redraw overwrite the old frame without a clear;
      // the log, the elapsed clock and the lifecycle all arrive this way.
      if (frame.head !== lastHead) {
        write(frame.head + CLEAR + frame.body);
        lastHead = frame.head;
        lastBody = frame.body;
      } else if (frame.body !== lastBody) {
        write(HOME + frame.body);
        lastBody = frame.body;
      }
      try {
        await io.delay(POLL_MS);
      } catch {
        break;
      }
    }
  } finally {
    for (const signal of SIGNALS) process.removeListener(signal, stop);
    write("\x1b]7501;state=clear\x1b\\");
    process.stdin.pause();
  }
}
