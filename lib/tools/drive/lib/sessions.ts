/**
 * Named sessions: what a parked session of any harness leaves for the next `drive` invocation.
 * One folder, `${XDG_STATE_HOME:-~/.local/state}/agent-tools-e2e/`, holds a file per name under
 * `sessions/<checkout>/` and the run folders under `runs/`. Sessions of different names never share
 * anything, so several can be parked at once. Names belong to a checkout: `default` in one worktree
 * is not `default` in another, and `stop --all` reaches only this checkout's sessions.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Kind } from "./find.ts";
import { repoRoot } from "./packages.ts";

export const stateRoot = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "agent-tools-e2e",
);
/** This checkout, short: it scopes the session files and the tui-test daemons' names. */
export const checkoutId = createHash("sha256").update(repoRoot).digest("hex").slice(0, 8);
const sessionsDir = join(stateRoot, "sessions", checkoutId);
const runsDir = join(stateRoot, "runs");

export const DEFAULT_SESSION = "default";

export type SessionRecord = {
  harness: Kind;
  package: string;
  scenario: string;
  /** The scenario file, which a reload reads again. */
  file: string;
  /** The session's scratch: the agent's folder, its logs, the stub's state. */
  runDir: string;
  /** Terminal: the tui-test daemon session. A reload starts the next beside it. */
  daemon?: string;
  /** VS Code: the DevTools port of the window. */
  port?: number;
  /** Desktop: the launcher's process. */
  pid?: number;
  /** `--size` as given to `goto`, which a reload starts at again. */
  size?: readonly [number, number];
};

/** A session name is part of a file name and of a socket path: short, and nothing that needs quoting. */
export function sessionName(name: string | undefined): string {
  const n = name ?? DEFAULT_SESSION;
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(n))
    throw new Error(`--session ${JSON.stringify(n)}: use up to 24 letters, digits, - and _`);
  return n;
}

const fileOf = (name: string) => join(sessionsDir, `${name}.json`);

export function readSession(name: string): SessionRecord | undefined {
  const file = fileOf(name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SessionRecord) : undefined;
}

export function writeSession(name: string, record: SessionRecord) {
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(fileOf(name), JSON.stringify(record, null, 2));
}

export const removeSession = (name: string) => rmSync(fileOf(name), { force: true });

/** The names of the sessions parked now. */
export const sessionNames = (): string[] =>
  existsSync(sessionsDir)
    ? readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
    : [];

/** A new run folder for session `name`. */
export function newRunDir(name: string): string {
  mkdirSync(runsDir, { recursive: true });
  return mkdtempSync(join(runsDir, `${name}-`));
}
