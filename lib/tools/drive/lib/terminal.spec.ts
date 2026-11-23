/**
 * `drive terminal` is the pinned tui-test CLI with the parked session already chosen: the tree it
 * reads, clicks and photographs is the one `goto` parked, under the checkout's own session name.
 * What the CLI prints and the status it exits with come back as it gave them, and the commands that
 * would launch, replace or tear down the session are refused here rather than in the agent.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionRecord } from "./sessions.ts";
import { Option } from "commander";
import { planTerminal, runTerminal, terminalCall } from "./terminal.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-terminal-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const daemon = "d-1a2b3c4d-default";
const parked = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  harness: "pi",
  package: "answer",
  scenario: "cards-open",
  file: "/repo/apps/answer/src/e2e/pi.scenarios.ts",
  runDir: "/tmp/run-default",
  daemon,
  ...over,
});

/** `plan` with a session registry that holds `rec` (or nothing). */
const plan = (args: string[], rec?: SessionRecord, name = "default") =>
  planTerminal(args, name, () => rec);

/** `plan` with several parked sessions, by name. */
const planAll = (args: string[], records: Record<string, SessionRecord>, name = "default") =>
  planTerminal(args, name, (n) => records[n]);

describe("the parked session", () => {
  it("puts the checkout's daemon name in front of the native arguments", () => {
    expect(plan(["text"], parked())).toEqual({
      args: ["--session", daemon, "text"],
      session: daemon,
    });
  });

  it("leaves the native arguments in the order and spelling it was given", () => {
    expect(
      plan(["--json", "click", "text", "Postgres", "--nth", "1"], parked()).args.slice(2),
    ).toEqual(["--json", "click", "text", "Postgres", "--nth", "1"]);
    // A value of the CLI's own reads as one word here too.
    expect(plan(["text", "WITH SCHEMA", "--json"], parked()).args.slice(2)).toEqual([
      "text",
      "WITH SCHEMA",
      "--json",
    ]);
  });

  it("reads the daemon of the session `drive` was given", () => {
    const rec = parked({ daemon: "d-1a2b3c4d-b" });
    expect(plan(["text"], rec, "b")).toEqual({
      args: ["--session", "d-1a2b3c4d-b", "text"],
      session: rec.daemon,
    });
  });

  it("says to park one when nothing is parked", () => {
    expect(() => plan(["text"])).toThrow(/no session default.*goto/);
    expect(() => plan(["text"], undefined, "b")).toThrow(/no session b/);
  });

  it("sends a graphical or launch-only session to the verbs it has", () => {
    expect(() => plan(["text"], parked({ harness: "vscode", daemon: undefined }))).toThrow(
      /vscode session.*drive cap/s,
    );
    expect(() => plan(["text"], parked({ harness: "desktop", daemon: undefined }))).toThrow(
      /is a desktop session.*can only be launched/,
    );
  });

  it("says to park again when the record has no terminal", () => {
    expect(() => plan(["text"], parked({ daemon: undefined }))).toThrow(/no terminal/);
  });
});

describe("the lifecycle is drive's", () => {
  const takeover: [string, RegExp][] = [
    ["run", /drive goto/],
    ["open", /drive goto/],
    ["restart", /drive reload/],
    ["close", /drive stop/],
    ["kill", /drive stop/],
    ["signal", /drive stop/],
    ["daemon", /drive stop/],
    ["sessions", /drive ls/],
  ];
  for (const [command, advice] of takeover)
    it(`refuses ${command}`, () => {
      expect(() => plan([command, "x"], parked())).toThrow(advice);
      // …also behind the CLI's own flags.
      expect(() => plan(["--json", command], parked())).toThrow(advice);
    });

  it("takes --session as drive's own before the command, as on every other verb", () => {
    const b = parked({ daemon: "d-1a2b3c4d-b" });
    const records = { default: parked(), b };
    expect(planAll(["--session", "b", "text"], records)).toEqual({
      args: ["--session", b.daemon, "text"],
      session: b.daemon,
    });
    expect(planAll(["--session=b", "--json", "state"], records)).toEqual({
      args: ["--session", b.daemon, "--json", "state"],
      session: b.daemon,
    });
  });

  it("rejects invalid names before looking up a record", () => {
    const read = () => {
      throw new Error("should not read a record");
    };
    expect(() => planTerminal(["--session=../b", "text"], "default", read)).toThrow(/use up to 24/);
  });

  it("refuses a session of the CLI's own, where its options start", () => {
    expect(() => plan(["text", "--session", "other"], parked())).toThrow(
      /--session.*belongs before the command/,
    );
    expect(() => plan(["text", "--session=other"], parked())).toThrow(/belongs before the command/);
  });
});

describe("the CLI's own guidance", () => {
  it("passes help, usage and the machine description through with nothing parked", () => {
    expect(plan(["--help"])).toEqual({ args: ["--help"] });
    expect(plan(["usage"])).toEqual({ args: ["usage"] });
    expect(plan(["help", "click"])).toEqual({ args: ["help", "click"] });
    expect(plan(["agent-context"])).toEqual({ args: ["agent-context"] });
    // …and with one parked: they read no session, so none is put in front of them.
    expect(plan(["usage"], parked())).toEqual({ args: ["usage"] });
  });

  it("says what to give it when given nothing", () => {
    expect(() => plan([], parked())).toThrow(/give a tui-test command/);
    // …and when a --session was all it was given.
    expect(() => plan(["--session", "b"], parked())).toThrow(/give a tui-test command/);
  });
});

describe("running it", () => {
  const script = join(dir, "tui-test");
  const argsFile = join(dir, "args");
  const sessionFile = join(dir, "session");
  const jsonFile = join(dir, "json");
  writeFileSync(
    script,
    `#!/bin/sh
printf '%s\\n' "$@" > "$ARGS"
printf '%s' "$TUI_TEST_SESSION" > "$SESSION"
printf '{"ok":true,"n":%s}\\n' "$#"
exit 3
`,
    { mode: 0o755 },
  );

  const env = () => ({
    PATH: process.env.PATH,
    ARGS: argsFile,
    SESSION: sessionFile,
  });
  /** The shipped run inherits the caller's stdio; a spec needs to read what the child printed. */
  const run = (bin: string, args: string[], childEnv: NodeJS.ProcessEnv) => {
    const r = spawnSync(bin, args, { env: childEnv, encoding: "utf8" });
    writeFileSync(jsonFile, r.stdout ?? "");
    return { status: r.status, signal: r.signal };
  };
  const deps = (rec?: SessionRecord) => ({
    read: () => rec,
    bin: () => script,
    env,
    run,
  });

  it("hands the CLI the session, its own arguments and the daemon's environment", () => {
    expect(runTerminal(["text", "--json"], "default", deps(parked()))).toBe(3);
    expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([
      "--session",
      daemon,
      "text",
      "--json",
    ]);
    // The CLI answers on the daemon it started, not on TUI_TEST_SESSION from one's own shell.
    expect(readFileSync(sessionFile, "utf8")).toBe(daemon);
    // Structured output comes back as the CLI printed it.
    expect(readFileSync(jsonFile, "utf8")).toBe('{"ok":true,"n":4}\n');
  });

  it("never starts the CLI for a command the lifecycle owns", () => {
    let ran = false;
    const spy = { ...deps(parked()), run: () => ((ran = true), { status: 0 }) };
    expect(() => runTerminal(["close"], "default", spy)).toThrow(/drive stop/);
    expect(ran).toBe(false);
  });
});

describe("finding the verb", () => {
  const globals = [
    new Option("--session <name>"),
    new Option("--extra <word>"),
    new Option("--keep"),
  ];
  const call = (argv: string[]) => terminalCall(argv, globals);

  it("takes the arguments after `terminal`, past registered global options", () => {
    expect(call(["terminal", "text"])).toEqual({ args: ["text"] });
    expect(call(["--keep", "terminal", "text"])).toEqual({ args: ["text"] });
    expect(call(["--extra", "terminal", "--session", "b", "terminal", "text"])).toEqual({
      args: ["text"],
      session: "b",
    });
    expect(call(["--session=b", "terminal", "--json", "state"])).toEqual({
      args: ["--json", "state"],
      session: "b",
    });
  });

  it("is not fooled by another verb's package or scenario named terminal", () => {
    expect(call(["goto", "terminal", "queue"])).toBeUndefined();
    expect(call(["ls", "terminal"])).toBeUndefined();
    expect(call(["--session", "terminal", "text"])).toBeUndefined();
    expect(call(["--help"])).toBeUndefined();
  });
});
