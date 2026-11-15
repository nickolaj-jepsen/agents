/**
 * One terminal session behind two engines, so a scenario plays the same either way:
 * `LibTerm` runs tui-test in this process (the vitest tests), `DaemonTerm` drives the
 * tui-test CLI's daemon, whose sessions outlive the invocation (`goto`).
 *
 * Both are Ghostty-backed. Everything above this file sees only `Term`, a grid of
 * cells and 0-based coordinates.
 */
import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { TuiTest } from "@microsoft/tui-test";
import { FONT_FAMILIES, fakeFontHome, realHome } from "./fonts.ts";

const run = promisify(execFile);
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type Color = "default" | number | string;

export type Cell = {
  /** The grapheme; " " when blank, "" for the second column of a wide character. */
  char: string;
  fg: Color;
  bg: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  inverse: boolean;
  strike: boolean;
  invisible: boolean;
  blink: boolean;
  underline_style: string;
};
export type Grid = Cell[][];

export type LaunchSpec = {
  program: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  /** Names to unset in the child, on top of what the engine passes through. */
  unset: string[];
  cols: number;
  rows: number;
};

export interface Term {
  size(): Promise<{ cols: number; rows: number }>;
  /** The visible screen, one string per row, trailing blanks trimmed by the engine. */
  text(): Promise<string>;
  grid(): Promise<Grid>;
  type(text: string): Promise<void>;
  /** Raw bytes to the program, no key translation. */
  write(data: string): Promise<void>;
  press(...keys: string[]): Promise<void>;
  click(x: number, y: number, clicks?: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  /** A full-colour PNG of the whole terminal. */
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
}

/** The child runs through `env -u`, so a session started from inside another agent isn't told so. */
const wrap = (spec: LaunchSpec) =>
  spec.unset.length === 0
    ? { program: spec.program, args: spec.args }
    : {
        program: "env",
        args: [...spec.unset.flatMap((n) => ["-u", n]), spec.program, ...spec.args],
      };

const toCell = (c: Record<string, unknown>): Cell => ({
  char: String(c.char ?? " "),
  fg: (c.fg as Color) ?? "default",
  bg: (c.bg as Color) ?? "default",
  bold: !!c.bold,
  dim: !!c.dim,
  italic: !!c.italic,
  inverse: !!c.inverse,
  strike: !!c.strike,
  invisible: !!c.invisible,
  blink: !!c.blink,
  underline_style: String(c.underline_style ?? "none"),
});

function toGrid(flat: Record<string, unknown>[], cols: number, rows: number): Grid {
  const grid: Grid = Array.from({ length: rows }, () => []);
  for (const raw of flat) {
    const x = Number(raw.x);
    const y = Number(raw.y);
    const row = grid[y];
    if (row && x < cols) row[x] = toCell(raw);
  }
  const blank = toCell({ char: " " });
  return grid.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? blank));
}

/** The screenshot in progress, so the next waits for it. */
let shots: Promise<void> = Promise.resolve();

export class LibTerm implements Term {
  private t: TuiTest;
  private constructor(t: TuiTest) {
    this.t = t;
  }

  static async launch(spec: LaunchSpec, session: string): Promise<LibTerm> {
    process.env.TUI_TEST_RECORDING_FONT_FAMILIES = FONT_FAMILIES;
    const t = new TuiTest(session);
    const { program, args } = wrap(spec);
    await t.run(program, args, {
      backend: "ghostty",
      cols: spec.cols,
      rows: spec.rows,
      cwd: spec.cwd,
      env: { ...spec.env, HOME: realHome },
      waitReady: false,
    });
    return new LibTerm(t);
  }

  async size() {
    const { cols, rows } = await this.t.getSize();
    return { cols, rows };
  }
  text = () => this.t.text();
  async grid() {
    const { cols, rows } = await this.size();
    return toGrid(
      (await this.t.cells(0, 0, cols, rows)) as unknown as Record<string, unknown>[],
      cols,
      rows,
    );
  }
  type = (text: string) => this.t.type(text);
  write = (data: string) => this.t.write(data);
  press = (...keys: string[]) => this.t.press(...keys);
  click = (x: number, y: number, clicks = 1) => this.t.mouse.click(x, y, { clicks });
  move = (x: number, y: number) => this.t.mouse.move(x, y);
  resize = (cols: number, rows: number) => this.t.resize(cols, rows);

  async screenshot(path: string) {
    // The rasterizer finds fonts under $HOME only; swap it for the call. One at a time, since
    // the swap is the whole process's and sessions run side by side.
    const turn = shots;
    let done!: () => void;
    shots = new Promise<void>((resolve) => (done = resolve));
    await turn;
    const home = fakeFontHome();
    const saved = process.env.HOME;
    if (home) process.env.HOME = home;
    try {
      await this.t.screenshot(path);
    } finally {
      process.env.HOME = saved;
      done();
    }
  }

  async close() {
    await this.t.close().catch(() => undefined);
  }
}

/** Where the daemon keeps its sockets: short, since a unix socket path holds about 100 bytes. */
export const daemonHome = () => `${process.env.XDG_RUNTIME_DIR ?? "/tmp"}/tt-e2e`;

let bin: string | undefined;

/** The daemon CLI: TUI_TEST_BIN, `tui-test` on PATH, or the one this flake builds (`pkgs/tui-test`). */
export function tuiTestBin(): string {
  if (bin) return bin;
  bin = process.env.TUI_TEST_BIN;
  if (!bin) {
    try {
      execFileSync("which", ["tui-test"], { stdio: "ignore" });
      bin = "tui-test";
    } catch {
      const root = join(import.meta.dirname, "..", "..", "..");
      const out = execFileSync(
        "nix",
        ["build", `${root}#tui-test`, "--no-link", "--print-out-paths"],
        { encoding: "utf8" },
      ).trim();
      bin = join(out, "bin", "tui-test");
    }
  }
  return bin;
}

/** The CLI's environment: the daemon it starts inherits it, which is how it finds fonts. */
function cliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TUI_TEST_HOME: daemonHome(),
    TUI_TEST_RECORDING_FONT_FAMILIES: FONT_FAMILIES,
  };
  const home = fakeFontHome();
  if (home) env.HOME = home;
  return env;
}

export async function tuiTest(args: string[]): Promise<string> {
  try {
    const { stdout } = await run(tuiTestBin(), args, {
      env: cliEnv(),
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string; code?: string };
    if (e.code === "ENOENT")
      throw new Error(`${tuiTestBin()} not found: set TUI_TEST_BIN or put pkgs.tui-test on PATH`);
    throw new Error(`tui-test ${args.join(" ")}: ${(e.stderr || e.stdout || e.message).trim()}`);
  }
}

export class DaemonTerm implements Term {
  readonly session: string;
  private constructor(session: string) {
    this.session = session;
  }

  static async launch(spec: LaunchSpec, session: string): Promise<DaemonTerm> {
    const { program, args } = wrap(spec);
    const env = Object.entries({ ...spec.env, HOME: realHome }).flatMap(([k, v]) => [
      "--env",
      `${k}=${v}`,
    ]);
    await tuiTest([
      "--session",
      session,
      "run",
      "--backend",
      "ghostty",
      "--cols",
      String(spec.cols),
      "--rows",
      String(spec.rows),
      "--cwd",
      spec.cwd,
      ...env,
      "--",
      program,
      ...args,
    ]);
    return new DaemonTerm(session);
  }

  /** A session another invocation started. */
  static attach(session: string) {
    return new DaemonTerm(session);
  }

  private cli = (...args: string[]) => tuiTest(["--session", this.session, ...args]);
  private json = async (...args: string[]) => JSON.parse(await this.cli("--json", ...args)).data;

  async size() {
    const d = await this.json("get", "size");
    const v = (d.value ?? d.size ?? d) as { cols: number; rows: number };
    return { cols: v.cols, rows: v.rows };
  }
  async text() {
    return (await this.cli("text")).replace(/\n$/, "");
  }
  async grid() {
    const { cols, rows } = await this.size();
    const d = await this.json("cells", "0", "0", String(cols), String(rows));
    return toGrid(d.cells, cols, rows);
  }
  async type(text: string) {
    await this.cli("type", text);
  }
  async write(data: string) {
    await this.cli("write", data);
  }
  async press(...keys: string[]) {
    await this.cli("key", "press", ...keys);
  }
  async click(x: number, y: number, clicks = 1) {
    await this.cli("mouse", "click", String(x), String(y), "--clicks", String(clicks));
  }
  async move(x: number, y: number) {
    await this.cli("mouse", "move", String(x), String(y));
  }
  async resize(cols: number, rows: number) {
    await this.cli("resize", String(cols), String(rows));
  }
  async screenshot(path: string) {
    await this.cli("screenshot", "-o", path);
  }
  async close() {
    await this.cli("close").catch(() => undefined);
    await tuiTest(["daemon", "stop", "--session", this.session]).catch(() => undefined);
  }
}
