import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { statusOf, type BgTask } from "./state.ts";
import { monitorMain, type MonitorIo } from "../pi/monitor.ts";
import { monitorScriptSource, writeMonitorScript } from "../pi/script.ts";

const NOW = 1_700_000_000_000;
const CLEAR = "\x1b[2J\x1b[H";
const HOME = "\x1b[H";
const OWN_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]P^_][\s\S]*?(?:\x07|\x1b\\)/g;
const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/;

const RECORD = (over: Record<string, unknown> = {}) => ({
  id: 3,
  name: "build",
  pid: 4242,
  path: "/tmp/bg-herdr/3.log",
  cwd: "/home/me/project",
  command: "pnpm build",
  state: "running",
  code: null,
  signal: null,
  startedAt: NOW - 65_000,
  finishedAt: null,
  observedAt: NOW,
  ...over,
});

/** A monitor driven in-process: one frame, then `delay` ends the loop. */
function fakeIo(
  options: {
    content?: string;
    log?: string;
    writes?: string[];
    opened?: string[];
    now?: () => number;
  } = {},
): MonitorIo {
  const log = Buffer.from(options.log ?? "");
  const opened = options.opened ?? [];
  const writes = options.writes ?? [];
  return {
    readFile: async () => options.content ?? "",
    open: async (path) => {
      opened.push(path);
      return {
        stat: async () => ({ size: log.length }),
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          log.copy(buffer, offset, position, Math.min(log.length, position + length));
          return length;
        },
        close: async () => {},
      };
    },
    delay: async () => {
      throw new Error("stop");
    },
    write: (text) => writes.push(text),
    now: options.now ?? (() => NOW),
  };
}

const setViewport = (columns: number, rows: number) => {
  const stdout = process.stdout;
  const saved = ["columns", "rows"].map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(stdout, key);
    Object.defineProperty(stdout, key, {
      value: key === "columns" ? columns : rows,
      configurable: true,
    });
    return [key, descriptor] as const;
  });
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(stdout, key, descriptor);
      else Reflect.deleteProperty(stdout, key);
    }
  };
};

/** One frame of the monitor, drawn over the whole record. */
async function draw(
  record: unknown,
  options: {
    columns?: number;
    rows?: number;
    log?: string;
    content?: string;
    opened?: string[];
  } = {},
): Promise<string[]> {
  const restore = setViewport(options.columns ?? 80, options.rows ?? 24);
  const writes: string[] = [];
  try {
    await monitorMain(
      fakeIo({
        content: options.content ?? JSON.stringify(record),
        log: options.log,
        writes,
        opened: options.opened,
      }),
      "/private/record.json",
      undefined,
    );
  } finally {
    restore();
  }
  return writes;
}

const firstFrame = (writes: string[]) => writes[0] ?? "";
const headOf = (frame: string) => frame.slice(0, frame.indexOf(CLEAR));
const bodyOf = (frame: string) => frame.slice(frame.indexOf(CLEAR) + CLEAR.length);
const plainOf = (frame: string) => frame.replace(OWN_SEQUENCE, "");
const statusIn = (frame: string) => /state=([a-z]+):app=bg:/.exec(headOf(frame))?.[1];
const linesOf = (frame: string) => bodyOf(frame).replace(/\n$/, "").split("\n");

/** A wide-cell estimate for assertions only. */
const WIDE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3]|[\u{1f300}-\u{1faff}]/u;
const cellsOf = (text: string) => {
  let width = 0;
  for (const char of text) width += WIDE.test(char) ? 2 : 1;
  return width;
};

const temporary: string[] = [];

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("the monitor's frame", () => {
  test("shows the task's lifecycle, its command and the tail of its log", async () => {
    const writes = await draw(RECORD(), {
      log: "$ vite build\n✓ 142 modules transformed\nbuilt in 2.1s\n",
    });
    const frame = firstFrame(writes);

    expect(headOf(frame)).toContain("\x1b]7501;state=working:app=bg:");
    expect(statusIn(frame)).toBe("working");
    const body = plainOf(frame);
    expect(body).toContain("#3 build");
    expect(body).toContain("RUNNING");
    expect(body).toContain("State: running");
    expect(body).toContain("Running 1m 5s");
    expect(body).toContain("Command: pnpm build");
    expect(body).toContain("Directory: /home/me/project");
    // The log is the point of the terminal: its last lines are on screen.
    expect(body).toContain("✓ 142 modules transformed");
    expect(body).toContain("built in 2.1s");
  });

  test("says how a finished task ended", async () => {
    const exited = await draw(RECORD({ state: "exited", code: 2, finishedAt: NOW - 5_000 }), {
      log: "1 test failed\n",
    });
    expect(statusIn(firstFrame(exited))).toBe("error");
    const body = plainOf(firstFrame(exited));
    expect(body).toContain("EXITED");
    expect(body).toContain("exit 2");
    expect(body).toContain("Ran 1m");
    expect(body).toContain("ended 5s ago");
    // A finished task keeps its log, so the reason it failed is still readable.
    expect(body).toContain("1 test failed");
  });

  test("a stop the person asked for is idle, not an error", async () => {
    const stopped = await draw(
      RECORD({ state: "exited", code: null, signal: "SIGKILL", finishedAt: NOW }),
      { log: "killed\n" },
    );
    expect(statusIn(firstFrame(stopped))).toBe("idle");
    expect(plainOf(firstFrame(stopped))).toContain("signal SIGKILL");
  });

  test("a task that never started is an error with no process", async () => {
    const failed = await draw(RECORD({ state: "failed", pid: null }));
    expect(statusIn(firstFrame(failed))).toBe("error");
    const body = plainOf(firstFrame(failed));
    expect(body).toContain("FAILED");
    expect(body).toContain("never started");
    expect(body).not.toContain("Process group");
  });

  test("a stop in flight still counts as working", async () => {
    const stopping = await draw(RECORD({ state: "stopping" }));
    expect(statusIn(firstFrame(stopping))).toBe("working");
    expect(plainOf(firstFrame(stopping))).toContain("STOPPING");
    expect(plainOf(firstFrame(stopping))).toContain("Process group 4242");
  });

  test("a lifecycle it does not know says so instead of guessing", async () => {
    const unknown = await draw(RECORD({ state: "zombie" }));
    const frame = firstFrame(unknown);
    expect(statusIn(frame)).toBe("idle");
    expect(plainOf(frame)).toContain("UNKNOWN");
    expect(plainOf(frame)).toContain("unrecognized state");
  });

  test("keeps the vocabulary of ../lib/state.ts", async () => {
    for (const state of ["running", "stopping", "exited", "failed"] as const) {
      for (const over of [
        { code: null, signal: null },
        { code: 0, signal: null },
        { code: 1, signal: null },
        { code: null, signal: "SIGTERM" },
      ]) {
        const task = { state, ...over } as Pick<BgTask, "state" | "code" | "signal">;
        const frame = firstFrame(await draw(RECORD({ state, ...over })));
        expect(statusIn(frame)).toBe(statusOf(task));
      }
    }
  });

  test("cannot be repainted by the text it is given", async () => {
    const hostile = "x\x1b]0;attack\x07\ny\x1b[31m\u202Egnp.exe\u202C\u200B\ufeff\u009b2J\u2066z";
    const writes = await draw(RECORD({ name: hostile, command: hostile, cwd: hostile, path: "" }), {
      log: `${hostile}\n\u001b[2Jcleared\n`,
    });
    const frame = firstFrame(writes);
    const body = bodyOf(frame);
    // Nothing of the record can carry a control or bidi character through.
    expect(UNSAFE.test(plainOf(frame).replace(/\n/g, ""))).toBe(false);
    // Our own sequences are the only escapes: the title, the status head, one clear.
    expect(frame.split("\x1b").length - 1).toBe(5);
    expect(body).not.toContain("attack");
  });

  test("fits every row to the terminal it is drawn in", async () => {
    for (const [columns, rows] of [
      [80, 24],
      [40, 12],
      [20, 6],
      [120, 40],
    ] as const) {
      const writes = await draw(RECORD(), { columns, rows, log: "line\n".repeat(200) });
      const lines = linesOf(firstFrame(writes));
      expect(lines.length).toBeLessThanOrEqual(rows - 1);
      for (const line of lines) expect(cellsOf(line)).toBe(columns);
    }
  });

  test("shows the end of a long log, and cuts a long line", async () => {
    const log = `first line\n${"middle\n".repeat(500)}last line\n${"w".repeat(9_000)}\n`;
    const body = plainOf(firstFrame(await draw(RECORD(), { log })));
    expect(body).not.toContain("first line");
    expect(body).toContain("last line");
    expect(body).not.toContain("w".repeat(200));
    expect(body).toContain("…");
  });

  test("opens a log only when the record names an absolute path", async () => {
    for (const path of ["", "logs/3.log", "~/3.log", "/" + "x".repeat(5_000)]) {
      const opened: string[] = [];
      await draw(RECORD({ path }), { opened, log: "should not be read\n" });
      expect(opened).toEqual([]);
    }
    const opened: string[] = [];
    const writes = await draw(RECORD({ path: "/tmp/3.log" }), { opened, log: "read me\n" });
    expect(opened).toEqual(["/tmp/3.log"]);
    expect(plainOf(firstFrame(writes))).toContain("read me");
    expect(plainOf(firstFrame(writes))).toContain("Log: /tmp/3.log");
  });

  test("survives a record it cannot read", async () => {
    for (const content of ["", "not json", "[]", "null", `{"id":${"9".repeat(70_000)}`]) {
      const frame = firstFrame(await draw(undefined, { content }));
      expect(plainOf(frame)).toContain("Unreadable task state");
      expect(statusIn(frame)).toBe("idle");
    }
  });

  test("clears its Herdr status when it is done", async () => {
    const writes = await draw(RECORD());
    expect(writes.at(-1)).toBe("\x1b]7501;state=clear\x1b\\");
  });

  test("redraws in place while it runs, without repeating the protocol head", async () => {
    // A record whose log grows between polls: the second frame is a body-only redraw.
    const writes: string[] = [];
    let polls = 0;
    const io: MonitorIo = {
      ...fakeIo({ content: JSON.stringify(RECORD({ path: "/tmp/bg-herdr-redraw.log" })), writes }),
      open: async () => {
        polls += 1;
        const text = Buffer.from(polls === 1 ? "early\n" : "early\nlater\n");
        return {
          stat: async () => ({ size: text.length }),
          read: async (buffer: Buffer, offset: number, length: number, position: number) => {
            text.copy(buffer, offset, position, Math.min(text.length, position + length));
            return length;
          },
          close: async () => {},
        };
      },
      // Two frames, then stop: the loop is never allowed to run unbounded.
      delay: async () => {
        if (polls >= 2) throw new Error("stop");
      },
    };
    await monitorMain(io, "/private/record.json", undefined);

    expect(writes[0]).toContain(CLEAR);
    expect(writes[0]).toContain("early");
    const redrawn = writes.filter((write) => write.startsWith(HOME));
    expect(redrawn.length).toBeGreaterThan(0);
    expect(redrawn.at(-1)).toContain("later");
    // The status line is not churned for a body that only gained a line.
    expect(writes.filter((write) => write.includes("state=working")).length).toBe(1);
  });
});

/** The script the extension writes, run the way `hc run` runs it. */
describe("the monitor script", () => {
  const runScript = async (script: string, record: string, pid: string) => {
    const child = spawn(process.execPath, [script, record, pid], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = { text: "", errors: "" };
    child.stdout.on("data", (data) => {
      output.text += String(data);
    });
    child.stderr.on("data", (data) => {
      output.errors += String(data);
    });
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    return { child, output, exited };
  };

  const waitFor = async (predicate: () => boolean, label: string, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${label}`);
  };

  test("is self-contained: node's own modules, and the function itself", () => {
    const source = monitorScriptSource(monitorMain);
    const imports = [...source.matchAll(/^import .* from "(.*)";$/gm)].map((match) => match[1]);
    expect(imports).toEqual(["node:fs/promises", "node:timers/promises"]);
    expect(source).toMatch(/const monitor = async function monitorMain\(/);
    // Nothing from the package is needed at run time, and no field is interpolated.
    expect(source).not.toMatch(/from "\.\.?\//);
  });

  test("runs, draws the task, and ends when the bridge removes its record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bg-herdr-script-"));
    temporary.push(dir);
    const log = join(dir, "3.log");
    await writeFile(log, "$ sleep 60\nstarted\n");
    const record = join(dir, "record.json");
    await writeFile(record, JSON.stringify(RECORD({ path: log })));
    const script = await writeMonitorScript(dir, monitorMain);

    const { output, exited } = await runScript(script, record, String(process.pid));
    await waitFor(() => output.text.includes("started"), "the log tail");
    expect(output.text).toContain("\x1b]7501;state=working:app=bg:");
    expect(output.text).toContain("$ sleep 60");

    await rm(record);
    expect(await exited).toBe(0);
    expect(output.errors).toBe("");
    expect(output.text).toContain("\x1b]7501;state=clear\x1b\\");
  });

  test("ends when the pi session it belongs to is gone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bg-herdr-script-"));
    temporary.push(dir);
    const record = join(dir, "record.json");
    await writeFile(record, JSON.stringify(RECORD()));
    const script = await writeMonitorScript(dir, monitorMain);
    // A pid that has already exited: nothing is left to draw for.
    const dead = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => dead.on("exit", resolve));

    const { output, exited } = await runScript(script, record, String(dead.pid));
    expect(await exited).toBe(0);
    expect(output.text).not.toContain("state=working");
    expect(output.text).toContain("\x1b]7501;state=clear\x1b\\");
  });

  test("takes the server's viewport, and nothing from its own input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bg-herdr-script-"));
    temporary.push(dir);
    const record = join(dir, "record.json");
    await writeFile(record, JSON.stringify(RECORD()));
    const script = await writeMonitorScript(dir, monitorMain);

    const child = spawn(process.execPath, [script, record, String(process.pid)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, COLUMNS: "40", LINES: "12" },
    });
    let text = "";
    child.stdout.on("data", (data) => {
      text += String(data);
    });
    // Typing into a read-only monitor reaches nobody and draws nothing.
    child.stdin.write("rm -rf /\n");
    await waitFor(() => text.includes("bg task"), "the first frame");
    child.kill("SIGTERM");
    expect(await new Promise((resolve) => child.on("exit", resolve))).toBe(0);
    expect(text).toContain("\x1b]7501;state=clear\x1b\\");
  });
});
