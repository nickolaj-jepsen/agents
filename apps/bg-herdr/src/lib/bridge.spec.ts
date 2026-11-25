import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createBgHerdrBridge } from "../pi/bridge.ts";

const PARENT = "t25";
const SESSION = "session-1";

/** An `hc` that keeps terminals in memory and records what the bridge asked it. */
function fakeHc() {
  const calls: string[][] = [];
  const killed: string[] = [];
  const terminals = new Map<
    string,
    {
      address: string;
      parent?: string;
      state?: string;
      labels?: Record<string, string>;
      argv?: string[];
    }
  >();
  const state = { next: 1, failRun: undefined as string | undefined };
  const notFound = (address: string) =>
    Object.assign(new Error(`no terminal "${address}"`), {
      stderr: JSON.stringify({ error: { kind: "not_found", message: `no terminal "${address}"` } }),
    });
  const labelsFrom = (args: string[]) => {
    const labels: Record<string, string> = {};
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== "--label") continue;
      const pair = args[index + 1] ?? "";
      const equals = pair.indexOf("=");
      if (equals > 0) labels[pair.slice(0, equals)] = pair.slice(equals + 1);
    }
    return labels;
  };
  const value = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
  const run = async (args: string[]): Promise<string> => {
    calls.push(args);
    const command = args[0];
    const target = String(args[1]);
    if (command === "run") {
      if (state.failRun) {
        const message = state.failRun;
        state.failRun = undefined;
        throw new Error(message);
      }
      const address = `t${state.next++}`;
      terminals.set(address, {
        address,
        parent: value(args, "--parent"),
        state: "live",
        labels: labelsFrom(args),
        argv: args.slice(args.indexOf("--") + 1),
      });
      return JSON.stringify({ address });
    }
    if (command === "ls") {
      const wanted = labelsFrom(args);
      // A summary, as `hc ls --json` is: no labels and no parent.
      const listed = [...terminals.values()]
        .filter((terminal) =>
          Object.entries(wanted).every(([key, expected]) => terminal.labels?.[key] === expected),
        )
        .map((terminal) => ({ address: terminal.address, state: terminal.state ?? "live" }));
      return JSON.stringify({ terminals: listed });
    }
    if (command === "get") {
      const terminal = terminals.get(target);
      if (!terminal) throw notFound(target);
      return JSON.stringify(terminal);
    }
    if (command === "kill") {
      killed.push(target);
      terminals.delete(target);
      return "{}";
    }
    if (command === "label") {
      const terminal = terminals.get(target);
      if (!terminal) throw notFound(target);
      terminal.labels ??= {};
      for (const pair of args.slice(2)) {
        const equals = pair.indexOf("=");
        const key = pair.slice(0, equals);
        const text = pair.slice(equals + 1);
        if (text === "") delete terminal.labels[key];
        else terminal.labels[key] = text;
      }
      return "{}";
    }
    throw new Error(`fake hc: unexpected ${args.join(" ")}`);
  };
  return { calls, killed, terminals, state, run };
}

const temporary: string[] = [];

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "bg-herdr-spec-"));
  temporary.push(dir);
  return dir;
};

const task = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "build",
  pid: 4242,
  path: "/tmp/pi-bg/session-1/1.log",
  cwd: "",
  command: "pnpm build",
  state: "running",
  code: null,
  signal: null,
  startedAt: 1_700_000_000_000,
  finishedAt: null,
  ...over,
});

const snapshot = (tasks: unknown[], over: Record<string, unknown> = {}) => ({
  protocol: 1,
  sessionId: SESSION,
  instanceId: "instance-1",
  sequence: 1,
  type: "snapshot",
  tasks,
  ...over,
});

async function setup(over: Record<string, unknown> = {}) {
  const hc = fakeHc();
  const work = await tempDir();
  const script = join(await tempDir(), "monitor.mjs");
  const errors: unknown[] = [];
  const bridge = await createBgHerdrBridge({
    parent: PARENT,
    sessionId: SESSION,
    cwd: work,
    script: async () => script,
    run: hc.run,
    onError: (error) => errors.push(error),
    now: () => 1_700_000_000_000,
    ...over,
  });
  return { hc, bridge, errors, work, script };
}

const recordOf = async (file: string) => JSON.parse(await readFile(file, "utf8"));

describe("createBgHerdrBridge", () => {
  test("refuses to start without a parent terminal", async () => {
    const hc = fakeHc();
    const base = {
      sessionId: SESSION,
      cwd: "/tmp",
      script: async () => "/tmp/monitor.mjs",
      run: hc.run,
      onError: () => {},
    };
    for (const parent of ["", "  ", "t 1\n--rm", undefined as unknown as string]) {
      await expect(createBgHerdrBridge({ ...base, parent })).rejects.toThrow(/terminal id/);
    }
    // Nothing was asked of hc, so no terminal can exist for a parent we do not have.
    expect(hc.calls).toEqual([]);
  });
});

describe("a task's monitor", () => {
  test("is one `hc run` of the monitor script, as argv and never a shell", async () => {
    const { hc, bridge, work, script } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();

    const runs = hc.calls.filter((args) => args[0] === "run");
    expect(runs).toHaveLength(1);
    const args = runs[0]!;
    expect(args.slice(0, 4)).toEqual(["run", "--bg", "--json", "--no-notify"]);
    expect(args).toContain("--rm");
    expect(args[args.indexOf("--parent") + 1]).toBe(PARENT);
    expect(args[args.indexOf("--cwd") + 1]).toBe(work);
    // The program, its script and its two arguments; no `bash -c` anywhere.
    const [, program, file, record, pid] = [0, ...args.slice(args.indexOf("--") + 1)];
    expect(program).toBe(process.execPath);
    expect(file).toBe(script);
    expect(record).toMatch(/\.json$/);
    expect(pid).toBe(String(process.pid));
    expect(args).not.toContain("bash");
    expect(args).not.toContain("-c");
    // The task's own record is what the monitor reads.
    expect(await recordOf(record!)).toMatchObject({
      id: 1,
      name: "build",
      state: "running",
      command: "pnpm build",
    });
    // Labels are how a later session recognises its own terminals.
    const labels = args.filter((_, index) => args[index - 1] === "--label");
    expect(labels).toContainEqual(expect.stringMatching(/^bg-herdr\.owner=[0-9a-f-]{36}$/));
    expect(labels).toContainEqual("bg-herdr.task=1");
    expect(labels).toContainEqual(`bg-herdr.session=${SESSION}`);
    expect(labels).toContainEqual("bg-herdr.state=running");
    expect(labels).toContainEqual("bg-herdr.name=build");
    // herdr-ui's monitor row (mods/nested-spaces/monitor-row.js) reads these
    // three: without them the terminal is a duplicate Git row, not the task.
    expect(labels).toContainEqual("fireproof.pi-agent-monitor=true");
    expect(labels).toContainEqual("fireproof.pi-agent-name=build");
    expect(labels).toContainEqual("fireproof.pi-agent-state=working");
    expect(bridge.status()).toMatchObject({ tasks: 1, monitors: 1 });
  });

  test("relabels and rewrites its record when the lifecycle changes", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const record = hc.terminals.get("t1")!.argv![2]!;

    bridge.accept(
      snapshot([task({ cwd: work, state: "exited", code: 2, finishedAt: 1_700_000_001_000 })], {
        sequence: 2,
      }),
    );
    await bridge.flush();

    // One terminal, updated in place: no second program, one label call.
    expect(hc.calls.filter((args) => args[0] === "run")).toHaveLength(1);
    const labels = hc.calls.filter((args) => args[0] === "label");
    expect(labels).toHaveLength(1);
    expect(labels[0]![1]).toBe("t1");
    expect(labels[0]).toContain("bg-herdr.state=exited");
    expect(hc.terminals.get("t1")!.labels!["bg-herdr.state"]).toBe("exited");
    // The row herdr-ui draws follows the same change, in its own vocabulary.
    expect(hc.terminals.get("t1")!.labels!["fireproof.pi-agent-state"]).toBe("failed");
    expect(await recordOf(record)).toMatchObject({ state: "exited", code: 2 });
  });

  test("keeps the finished task's terminal, so its log stays readable", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work, state: "exited", code: 0 })]));
    await bridge.flush();
    expect(hc.terminals.size).toBe(1);
    expect(hc.killed).toEqual([]);
    expect(bridge.status().monitors).toBe(1);
  });

  test("is killed with its record when bg drops the task", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const record = hc.terminals.get("t1")!.argv![2]!;

    bridge.accept(snapshot([], { sequence: 2 }));
    await bridge.flush();

    expect(hc.killed).toEqual(["t1"]);
    expect(hc.terminals.size).toBe(0);
    await expect(stat(record)).rejects.toThrow();
    expect(bridge.status()).toMatchObject({ tasks: 0, monitors: 0 });
  });

  test("goes away with the session, folder and all", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const dir = dirname(hc.terminals.get("t1")!.argv![2]!);

    await bridge.dispose();

    expect(hc.killed).toEqual(["t1"]);
    await expect(stat(dir)).rejects.toThrow();
  });
});

describe("the labels herdr-ui reads", () => {
  // mods/nested-spaces/monitor-row.js on the installed Herdr: a terminal is a
  // monitor row only with `fireproof.pi-agent-monitor=true`, and it draws
  // `fireproof.pi-agent-name` and the state word from `fireproof.pi-agent-state`.
  const labelsFor = async (over: Record<string, unknown>) => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work, ...over })]));
    await bridge.flush();
    return Object.fromEntries(
      (hc.calls.find((args) => args[0] === "run") ?? [])
        .map((arg, index, all) => (all[index - 1] === "--label" ? arg : undefined))
        .filter((label): label is string => label !== undefined)
        .map((label) => [label.slice(0, label.indexOf("=")), label.slice(label.indexOf("=") + 1)]),
    );
  };

  test("say it is a monitor, and which task and state it is", async () => {
    const labels = await labelsFor({ name: "tests", state: "running" });
    expect(labels["fireproof.pi-agent-monitor"]).toBe("true");
    expect(labels["fireproof.pi-agent-name"]).toBe("tests");
    expect(labels["fireproof.pi-agent-state"]).toBe("working");
    // Our own labels stay: ownership, cleanup and the record's lifecycle.
    expect(labels["bg-herdr"]).toBe("true");
    expect(labels["bg-herdr.task"]).toBe("1");
    expect(labels["bg-herdr.state"]).toBe("running");
    expect(labels["bg-herdr.owner"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("use herdr-ui's words for every ending, not bg's", async () => {
    expect((await labelsFor({ state: "stopping" }))["fireproof.pi-agent-state"]).toBe("working");
    expect((await labelsFor({ state: "exited", code: 0 }))["fireproof.pi-agent-state"]).toBe(
      "idle",
    );
    expect((await labelsFor({ state: "exited", code: 2 }))["fireproof.pi-agent-state"]).toBe(
      "failed",
    );
    expect(
      (await labelsFor({ state: "exited", code: null, signal: "SIGKILL" }))[
        "fireproof.pi-agent-state"
      ],
    ).toBe("interrupted");
    expect((await labelsFor({ state: "failed" }))["fireproof.pi-agent-state"]).toBe("failed");
  });

  test("never name a state they cannot vouch for", async () => {
    // Exited with neither a code nor a signal: the row says "Monitor" instead.
    const labels = await labelsFor({ state: "exited", code: null, signal: null });
    expect(labels["fireproof.pi-agent-monitor"]).toBe("true");
    expect(labels["fireproof.pi-agent-state"]).toBeUndefined();
  });
});

describe("recovery", () => {
  test("relaunches a monitor the core lost", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    // A core restart takes the terminal with it, and an idle session changes nothing.
    hc.terminals.delete("t1");

    await bridge.refresh();

    const runs = hc.calls.filter((args) => args[0] === "run");
    expect(runs).toHaveLength(2);
    expect(bridge.status().monitors).toBe(1);
    expect([...hc.terminals.keys()]).toEqual(["t2"]);
  });

  test("adopts its own terminal instead of launching a second one", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const first = hc.terminals.get("t1")!;
    first.parent = PARENT;
    // A fresh bridge, as after /reload of the extension alone, sees it in `ls`.
    const other = await createBgHerdrBridge({
      parent: PARENT,
      sessionId: SESSION,
      cwd: work,
      script: async () => "/tmp/monitor.mjs",
      run: hc.run,
      onError: () => {},
    });
    // Its owner label is the old session's, so it is not ours: read-only or not,
    // a monitor is killed only by the bridge that started it.
    await other.refresh();
    expect(hc.calls.filter((args) => args[0] === "run")).toHaveLength(1);
    await other.dispose();
  });

  test("kills an orphan carrying its own owner label", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const owner = hc.terminals.get("t1")!.labels!["bg-herdr.owner"];
    // A launch whose reply was lost: the terminal exists, the bridge never saw it.
    hc.terminals.set("t99", {
      address: "t99",
      parent: PARENT,
      state: "live",
      labels: { "bg-herdr.owner": owner!, "bg-herdr.task": "77" },
    });
    // And the task it belonged to is gone from bg's list.
    bridge.accept(snapshot([], { sequence: 2 }));
    await bridge.flush();

    await bridge.refresh();

    expect(hc.killed).toContain("t99");
    // Our own monitor went with its task, and so did the terminal.
    expect(hc.killed).toContain("t1");
  });

  test("never kills a terminal on another parent, even with its owner label", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const owner = hc.terminals.get("t1")!.labels!["bg-herdr.owner"];
    // A different pi session on a replaced core, reusing our address and labels.
    const foreign = hc.terminals.get("t1")!;
    foreign.parent = "t9";

    await bridge.refresh();

    expect(hc.killed).toEqual([]);
    // Not ours any more, so the bridge launches its own monitor again.
    expect(hc.calls.filter((args) => args[0] === "run")).toHaveLength(2);
    expect(hc.terminals.get("t1")!.labels!["bg-herdr.owner"]).toBe(owner);
  });

  test("reports a failed launch, then retries it", async () => {
    const { hc, bridge, errors, work } = await setup();
    hc.state.failRun = "core unavailable";
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();

    expect(errors).toHaveLength(1);
    expect(bridge.status()).toMatchObject({ tasks: 1, monitors: 0, lastError: "core unavailable" });

    await bridge.refresh();

    expect(hc.calls.filter((args) => args[0] === "run")).toHaveLength(2);
    expect(bridge.status()).toMatchObject({ monitors: 1, lastError: undefined });
  });

  test("survives a script that cannot be written", async () => {
    const { hc, bridge, errors, work } = await setup({
      script: async () => {
        throw new Error("read-only home");
      },
    });
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();

    expect(errors.map(String)).toEqual(["Error: read-only home"]);
    expect(hc.calls.filter((args) => args[0] === "run")).toHaveLength(0);
    expect(bridge.status().monitors).toBe(0);
  });
});

describe("untrusted input", () => {
  test("ignores another session, an old sequence and a wrong protocol", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();

    bridge.accept(snapshot([task({ cwd: work, state: "exited", code: 1 })], { sequence: 2 }));
    await bridge.flush();
    // A resend of the first snapshot is not news.
    bridge.accept(snapshot([task({ cwd: work })], { sequence: 1 }));
    await bridge.flush();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    await bridge.flush();
    expect(hc.calls.filter((args) => args[0] === "label")).toHaveLength(1);
    expect(hc.terminals.get("t1")!.labels!["bg-herdr.state"]).toBe("exited");

    // Another pi session's tasks are not ours to show.
    bridge.accept(snapshot([task({ id: 5 })], { sessionId: "session-2", sequence: 9 }));
    await bridge.flush();
    expect(hc.terminals.size).toBe(1);

    // Neither is another protocol's shape.
    bridge.accept(snapshot([task({ id: 6 })], { protocol: 2 }));
    await bridge.flush();
    expect(hc.terminals.size).toBe(1);
  });

  test("cleans what a name or a session can say in a label", async () => {
    const { hc, bridge, work } = await setup();
    const hostile = "build\x1b]0;attack\x07\nrm -rf /\u202Egnp.exe";
    bridge.accept(snapshot([task({ cwd: work, name: hostile })]));
    await bridge.flush();

    const labels = hc.calls
      .find((args) => args[0] === "run")!
      .filter((_, i, all) => all[i - 1] === "--label");
    expect(labels.every((label) => !/[\x00-\x1f\x7f\u202e]/.test(label))).toBe(true);
    expect(labels).toContainEqual("bg-herdr.name=build ]0;attack rm -rf / gnp.exe");
    expect(labels).toContainEqual("fireproof.pi-agent-name=build ]0;attack rm -rf / gnp.exe");
  });

  test("falls back to the session's own directory when the task's is gone", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(
      snapshot([task({ cwd: "/nonexistent/bg-herdr-test-dir" }), task({ id: 2, cwd: "relative" })]),
    );
    await bridge.flush();

    for (const args of hc.calls.filter((call) => call[0] === "run"))
      expect(args[args.indexOf("--cwd") + 1]).toBe(work);
  });

  test("a stopped session clears every monitor", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work }), task({ id: 2, cwd: work })]));
    await bridge.flush();
    expect(hc.terminals.size).toBe(2);

    bridge.accept(snapshot([task({ cwd: work })], { type: "stopped", sequence: 2 }));
    await bridge.flush();

    expect(hc.killed).toHaveLength(2);
    expect(bridge.status()).toMatchObject({ tasks: 0, monitors: 0 });
  });
});

describe("the record the monitor reads", () => {
  test("is written whole, atomically, and bounded in size", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work, command: "x".repeat(5_000) })]));
    await bridge.flush();
    const record = hc.terminals.get("t1")!.argv![2]!;
    const parsed = await recordOf(record);
    expect(parsed.command).toHaveLength(2_000);
    expect(parsed.observedAt).toBe(1_700_000_000_000);
    // No temporary file is left behind by the rename.
    await expect(stat(`${record}.tmp`)).rejects.toThrow();
  });

  test("is replaced, not appended, so the monitor never sees a half record", async () => {
    const { hc, bridge, work } = await setup();
    bridge.accept(snapshot([task({ cwd: work })]));
    await bridge.flush();
    const record = hc.terminals.get("t1")!.argv![2]!;
    await writeFile(`${record}.tmp`, "half");
    bridge.accept(snapshot([task({ cwd: work, state: "exited", code: 0 })], { sequence: 2 }));
    await bridge.flush();
    expect((await recordOf(record)).state).toBe("exited");
  });
});
