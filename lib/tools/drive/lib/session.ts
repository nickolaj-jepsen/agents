/**
 * A running agent and the verbs a scenario, a test or the CLI drives it with.
 * Mouse targets are visible text; sizes are columns by rows.
 */
import { options } from "./options.ts";
import { accessSync, constants, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { harnesses, type HarnessName, type StartOptions } from "./harness.ts";
import {
  applyMasks,
  builtinMasks,
  crop,
  findText,
  gridLines,
  matches,
  serialize,
  type Mask,
  type Pattern,
  type Region,
} from "./screen.ts";
import { setupContext, type SetupContext } from "./setup.ts";
import { startStub, stopStub } from "./stub.ts";
import {
  DaemonTerm,
  LibTerm,
  sleep,
  type ImageOptions,
  type RecordOptions,
  type Term,
} from "./term.ts";

export type { SetupContext };

export type Size = readonly [cols: number, rows: number];

/** Every state is snapshotted at the first two; an extreme-text state at all four. */
export const SIZES: Size[] = [
  [70, 24],
  [160, 45],
];
export const EXTREME_SIZES: Size[] = [
  [70, 24],
  [112, 32],
  [160, 45],
  [240, 60],
];

/**
 * The in-process sessions still open. An interrupted run closes them on its way out, so no agent
 * is left running in a test folder; a parked `goto` session is the daemon's and is not tracked.
 */
const live = new Set<Session>();
let hooked = false;
function track(session: Session) {
  live.add(session);
  if (hooked) return;
  hooked = true;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.once(signal, () => {
      void Promise.allSettled([...live].map((s) => s.close())).finally(() => process.exit(130));
    });
}

/**
 * Where a run's folder is made: `/tmp`, not `$TMPDIR`, so its path is as long whoever starts the
 * run (an agent's session sets a `$TMPDIR` of its own), and a path a screen wraps wraps at the same
 * place. `--tmp` names another; without a writable `/tmp`, the temp dir. Resolved, as the agents
 * show it (`/private/tmp` on macOS).
 */
function runBase(): string {
  if (options.tmp) return realpathSync(options.tmp);
  try {
    accessSync("/tmp", constants.W_OK);
    return realpathSync("/tmp");
  } catch {
    return realpathSync(tmpdir());
  }
}

/** How the screen is judged still: it must hold for `quiet` ms, looked at every `poll` ms. */
export const SETTLE = { quiet: 500, poll: 50 };

export type Target = Pattern | { text: Pattern; nth?: number };

const target = (t: Target) =>
  typeof t === "object" && !(t instanceof RegExp) ? t : { text: t, nth: 0 };

/** What Claude Code shows when its fullscreen renderer did not finish starting the last time. */
const HICCUP = /fullscreen[^\n]*(did not|didn.t)[^\n]*finish|classic renderer/i;

/** How many sessions were started. */
export const startStats = { starts: 0 };

export type StepOptions = {
  /** `false` leaves the wait for the screen to be still to whatever comes next (a `wait` step). */
  settle?: boolean;
};

export type OpenOptions = {
  harness: HarnessName;
  start?: StartOptions;
  setup?: ((ctx: SetupContext) => void | Promise<void>)[];
  size: Size;
  backend: "lib" | "daemon";
  /** Session name for the engine; unique per live session. */
  name: string;
  /** Reuse a run dir instead of making one (the CLI's, which outlives the invocation). */
  runDir?: string;
  /** The name of the folder the agent runs in, which shows in its header: default `cwd`. */
  project?: string;
  /**
   * A folder to put first on a daemon's PATH: where the recording it encodes finds its `ffmpeg`.
   * That is the daemon's environment, not this process's, so a screenshot or another session
   * beside it is unaffected.
   */
  path?: string;
};

export class Session {
  readonly term: Term;
  readonly runDir: string;
  readonly cwd: string;
  readonly harness: HarnessName;
  private ownsRun: boolean;
  /** Where a demo's `poster` step writes its picture. */
  poster?: { path: string; opts: ImageOptions };

  constructor(term: Term, harness: HarnessName, runDir: string, ownsRun: boolean, project = "cwd") {
    this.term = term;
    this.harness = harness;
    this.runDir = runDir;
    this.cwd = join(runDir, project);
    this.ownsRun = ownsRun;
  }

  /**
   * Starts the agent and waits for its prompt. A start that fails is the only one it gets: Claude
   * Code now and then comes up in its classic renderer ("fullscreen didn't finish starting last
   * time"), and that is a failure carrying what it printed, not a start to make again.
   */
  static async open(o: OpenOptions): Promise<Session> {
    startStats.starts++;
    const ownsRun = !o.runDir;
    const runDir = o.runDir ?? mkdtempSync(join(runBase(), "e2e-"));
    const cwd = join(runDir, o.project ?? "cwd");
    mkdirSync(cwd, { recursive: true });
    const ctx = setupContext(runDir, cwd);
    for (const setup of o.setup ?? []) await setup(ctx);

    let start = o.start ?? {};
    if (o.harness === "claude" && start.turns) {
      // Claude's model is the stub: this session only, and only for the replayed turns.
      const port = await startStub(
        runDir,
        start.turns,
        o.backend === "lib" ? process.pid : undefined,
      );
      start = {
        ...start,
        env: {
          ...start.env,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        },
      };
    }
    const harness = harnesses[o.harness];
    const spec = harness.launch({ runDir, cwd }, start, {
      cols: o.size[0],
      rows: o.size[1],
    });
    let term: Term;
    try {
      term =
        o.backend === "lib"
          ? await LibTerm.launch(spec, o.name)
          : await DaemonTerm.launch(spec, o.name, o.path);
    } catch (err) {
      stopStub(runDir);
      throw err;
    }
    const session = new Session(term, o.harness, runDir, ownsRun, o.project);
    if (o.backend === "lib") track(session);
    try {
      await session.waitReady();
    } catch (err) {
      await session.close();
      throw err;
    }
    return session;
  }

  /** A live CLI session from an earlier invocation. */
  static attach(name: string, harness: HarnessName, runDir: string): Session {
    return new Session(DaemonTerm.attach(name), harness, runDir, false);
  }

  private async waitReady(timeout = 45_000) {
    const h = harnesses[this.harness];
    const start = Date.now();
    let text = "";
    while (Date.now() - start < timeout) {
      text = await this.term.text().catch(() => "");
      if (this.harness === "claude" && HICCUP.test(text))
        throw new Error(`claude started in its classic renderer; screen:\n${text}`);
      if (h.failed?.(text)) throw new Error(`${this.harness} failed to start; screen:\n${text}`);
      const keys = h.dialog(text);
      if (keys) {
        await this.term.press(...keys);
        await sleep(1000);
      } else if (h.ready(text)) {
        // Fullscreen keeps the prompt at the bottom; the classic renderer prints it under the banner.
        const rows = text.split("\n");
        const at = rows.findIndex((r) => r.startsWith("❯"));
        if (this.harness === "claude" && at >= 0 && at < (await this.term.size()).rows / 2)
          throw new Error(`claude started in its classic renderer; screen:\n${text}`);
        await this.settle();
        return;
      }
      await sleep(200);
    }
    throw new Error(
      `${this.harness} did not reach its prompt after ${timeout / 1000}s; screen:\n${text}`,
    );
  }

  // ---- reading

  text = () => this.term.text();
  size = () => this.term.size();

  /** Waits until the screen stops changing, or gives up quietly after `max`: a spinner never settles. */
  async settle(quiet = SETTLE.quiet, max = 8000) {
    const start = Date.now();
    let last = await this.term.text();
    let since = Date.now();
    while (Date.now() - since < quiet && Date.now() - start < max) {
      await sleep(SETTLE.poll);
      const now = await this.term.text();
      if (now !== last) {
        last = now;
        since = Date.now();
      }
    }
  }

  async wait(pat: Pattern, o: { timeout?: number; gone?: boolean } = {}) {
    const timeout = o.timeout ?? 15_000;
    const start = Date.now();
    let text = "";
    while (Date.now() - start < timeout) {
      text = await this.term.text();
      if (matches(text, pat) !== !!o.gone) return;
      await sleep(SETTLE.poll);
    }
    throw new Error(
      `${o.gone ? "still showing" : "never showed"} ${String(pat)} after ${timeout / 1000}s; screen:\n${text}`,
    );
  }

  // ---- driving

  /** Literal text. A newline is a raw `\n`, which most prompts take as a line break; use `paste` for a block. */
  async type(text: string, o: StepOptions = {}) {
    await this.term.type(text);
    if (o.settle !== false) await this.settle(250, 3000);
  }

  /** Text as one bracketed paste, so line breaks stay in the draft. */
  async paste(text: string, o: StepOptions = {}) {
    await this.term.write(`\x1b[200~${text}\x1b[201~`);
    if (o.settle !== false) await this.settle(250, 3000);
  }

  /** Named keys: `Enter`, `Escape`, `Tab`, `Down`, `Ctrl+c`, `Alt+a`. */
  async press(keys: string[], o: StepOptions = {}) {
    for (const key of keys) {
      await this.term.press(key);
      // Escape and the next byte within a few milliseconds read as alt+<key>.
      if (key === "Escape") await sleep(300);
    }
    if (o.settle !== false) await this.settle(300, 4000);
  }

  /** Where the target is, waiting up to `timeout` for it to be drawn: a step can outrun the screen. */
  private async locate(t: Target, timeout = 5000) {
    const { text, nth } = target(t);
    const start = Date.now();
    for (;;) {
      const grid = await this.term.grid();
      const hit = findText(grid, text, true)[nth ?? 0];
      if (hit) return { x: hit.x + Math.floor(hit.w / 2), y: hit.y };
      if (Date.now() - start >= timeout)
        throw new Error(
          `no visible ${String(text)}${nth ? ` #${nth}` : ""} after ${timeout / 1000}s; screen:\n${gridLines(grid).join("\n")}`,
        );
      await sleep(SETTLE.poll * 2);
    }
  }

  async click(t: Target, clicks = 1, o: StepOptions = {}) {
    const { x, y } = await this.locate(t);
    await this.term.click(x, y, clicks);
    if (o.settle !== false) await this.settle(300, 4000);
  }

  async hover(t: Target, o: StepOptions = {}) {
    const { x, y } = await this.locate(t);
    await this.term.move(x, y);
    if (o.settle !== false) await this.settle(300, 4000);
  }

  async resize(cols: number, rows: number) {
    await this.term.resize(cols, rows);
    await sleep(300);
    await this.settle(500, 6000);
  }

  /**
   * Claude shows `◐ medium · /effort` under the prompt for about nine seconds after it starts,
   * which at a narrow size pushes the whole inline layout up a row. A snapshot is of the layout
   * without it, so it waits the label out. Quiet when it never shows.
   */
  async waitHintsGone(timeout = 20_000) {
    if (this.harness !== "claude") return;
    await this.wait(/\/effort/, { gone: true, timeout }).catch(() => undefined);
  }

  /** The full-colour PNG of the whole terminal. */
  async png(path: string, opts?: ImageOptions) {
    mkdirSync(dirname(path), { recursive: true });
    await this.term.screenshot(path, opts);
    return path;
  }

  /** Records the terminal into `path` (an `.mp4`) until `stopRecording`. */
  async record(path: string, opts?: RecordOptions) {
    mkdirSync(dirname(path), { recursive: true });
    await this.term.startRecording(path, opts);
  }

  stopRecording = () => this.term.stopRecording();

  // ---- snapshots

  /** The region's cells, masked, as snapshot text. Throws when the region isn't on screen. */
  async snapshot(title: string, region: Region, masks: Mask[] = []): Promise<string> {
    const grid = await this.term.grid();
    const rect = region(grid);
    if (!rect)
      throw new Error(
        `${title}: the snapshot region is not on screen:\n${gridLines(grid).join("\n")}`,
      );
    const masked = applyMasks(crop(grid, rect), [...builtinMasks([this.runDir]), ...masks]);
    return serialize(`${title} @${rect.x},${rect.y}`, masked);
  }

  async close() {
    live.delete(this);
    await this.term.close();
    stopStub(this.runDir);
    if (this.ownsRun && !options.keep) rmSync(this.runDir, { recursive: true, force: true });
  }
}
