/**
 * `drive terminal`: the tui-test CLI the repo pins, pointed at the session `goto` parked.
 *
 * Agents read, click, wait on and photograph a parked terminal through the CLI's own commands, so
 * its syntax is the one its `--help` and `usage` print and its structured output and exit status
 * come back untouched. What is not passed through is the lifecycle: the CLI could start a session
 * of its own, restart it or close it, and `drive` owns that (`goto`, `reload`, `stop`).
 */
import type { Option } from "commander";
import { spawnSync } from "node:child_process";
import { DEFAULT_SESSION, readSession, sessionName, type SessionRecord } from "./sessions.ts";
import { tuiTestBin, tuiTestEnv } from "./term.ts";

/** The CLI commands that would launch, replace or tear down the parked session, and what owns that. */
const REFUSED: Record<string, string> = {
  run: "`drive goto` starts the agent",
  open: "`drive goto` starts the agent",
  restart: "`drive reload` plays the scenario again",
  close: "`drive stop` ends it",
  kill: "`drive stop` ends it",
  signal: "`drive stop` ends it",
  daemon: "`drive stop` ends it",
  sessions: "`drive ls` lists this checkout's sessions",
};

/** The commands that explain the CLI itself: they read no session, so they need nothing parked. */
const GUIDANCE = new Set(["help", "usage", "agent-context"]);

/** The CLI's global options that take a value, which is not the command. */
const VALUE_OPTIONS = new Set([
  "--session",
  "--failure-artifacts",
  "--failure-artifact-mode",
  "--diagnostic-context",
]);

export type TerminalCall = { args: string[]; session?: string };

/**
 * The verb `terminal` on drive's command line and what follows it. drive's own `--session` before
 * the verb names the parked session, as it does for every verb; `--keep` and the help flags come
 * before the verb too. What follows `terminal` is the CLI's, and `planTerminal` reads it.
 */
export function terminalCall(argv: string[], globals: readonly Option[]): TerminalCall | undefined {
  let session: string | undefined;
  let i = 0;
  for (; i < argv.length; i++) {
    const arg = argv[i]!;
    const equals = arg.indexOf("=");
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const option = globals.find(({ short, long }) => flag === short || flag === long);
    if (!option) break;
    const value = equals !== -1 ? arg.slice(equals + 1) : option.required ? argv[++i] : undefined;
    if (option.long === "--session") session = value;
  }
  if (argv[i] !== "terminal") return undefined;
  return { args: argv.slice(i + 1), ...(session === undefined ? {} : { session }) };
}

/** Where the CLI command starts: the first word that is not one of its global options. */
function commandAt(args: string[]): number {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (VALUE_OPTIONS.has(arg)) i++;
    else if (!arg.startsWith("-")) return i;
  }
  return args.length;
}

export type TerminalPlan = { args: string[]; session?: string };

/**
 * The arguments to run the CLI with, or why this call is not one `drive` passes on. A command that
 * reads a session is given the parked one; the guidance commands are given nothing to override.
 * Before the command, `--session` is drive's, as it is on every other verb; after it, where the
 * CLI's own options start, it is refused rather than passed on.
 */
export function planTerminal(
  rest: string[],
  name: string,
  read: (name: string) => SessionRecord | undefined = readSession,
): TerminalPlan {
  const at = commandAt(rest);
  const command = rest[at];
  const refuse = command === undefined ? undefined : REFUSED[command];
  if (refuse !== undefined)
    throw new Error(
      `${command} is not passed through: it would launch, replace or tear down the parked session, and ${refuse}`,
    );

  let chosen = name;
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (i < at) {
      if (arg === "--session") chosen = rest[++i] ?? chosen;
      else if (arg.startsWith("--session=")) chosen = arg.slice("--session=".length);
      else args.push(arg);
    } else if (arg === "--session" || arg.startsWith("--session="))
      throw new Error(
        "--session is not passed to the CLI: --session on drive names the parked session, and belongs before the command",
      );
    else args.push(arg);
  }
  if (args.length === 0)
    throw new Error(
      "give a tui-test command: `drive terminal text` reads the parked screen, `drive terminal help` lists them",
    );

  if (command === undefined || GUIDANCE.has(command)) return { args };

  const rec = read(sessionName(chosen));
  if (!rec)
    throw new Error(
      `no session ${chosen}: run \`goto <package> <scenario>${chosen === DEFAULT_SESSION ? "" : ` --session ${chosen}`}\` first`,
    );
  if (rec.harness === "vscode")
    throw new Error(
      `session ${chosen} is a vscode session: drive cap, shot, resize, click, hover, wait, eval and sweep drive it, and terminal runs a claude or pi session`,
    );
  if (rec.harness === "desktop")
    throw new Error(
      `session ${chosen} is a desktop session: Claude Desktop sessions can only be launched (live and goto)`,
    );
  if (!rec.daemon)
    throw new Error(`session ${chosen} has no terminal; \`stop\` it and \`goto\` again`);
  return { args: ["--session", rec.daemon, ...args], session: rec.daemon };
}

export type TerminalResult = {
  status: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
};

export type TerminalDeps = {
  read?: (name: string) => SessionRecord | undefined;
  bin?: () => string;
  env?: () => NodeJS.ProcessEnv;
  /** Runs the CLI; by default with the caller's stdio, so its output is its own. */
  run?: (bin: string, args: string[], env: NodeJS.ProcessEnv) => TerminalResult;
};

/**
 * Runs the CLI on the parked session and returns the status it exited with. A call `drive` refuses
 * throws before anything is started.
 */
export function runTerminal(rest: string[], name: string, deps: TerminalDeps = {}): number {
  const plan = planTerminal(rest, name, deps.read ?? readSession);
  const env = { ...(deps.env ?? tuiTestEnv)() };
  // The daemon was started with this; stating it keeps a shell's own value from naming another one.
  if (plan.session !== undefined) env.TUI_TEST_SESSION = plan.session;
  const run =
    deps.run ??
    ((bin, args, childEnv) => spawnSync(bin, args, { stdio: "inherit", env: childEnv }));
  const result = run((deps.bin ?? tuiTestBin)(), plan.args, env);
  if (result.error) throw result.error;
  // Killed by a signal: the caller's own wait should see the same signal, not a made-up status.
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return 1;
  }
  return result.status ?? 1;
}
