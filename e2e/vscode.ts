/**
 * Parks a real, headless VS Code on a scenario's screen of the Claude Code extension and drives
 * it from separate invocations: `goto <plugin> <scenario>`, then `cap`, `click`, `shot`, `stop`.
 * Run `node e2e/vscode.ts` (or `node e2e/cli.ts vscode`) for the verbs. Local only: it needs
 * `code` with the extension installed, and nix for cage. See "VS Code" in e2e/README.md.
 *
 * VS Code is started detached and outlives each invocation; a verb reconnects over the port saved
 * in the state file, which is separate from the terminal CLI's, so both can be parked at once.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadVscodeSet, reachVscode, resolveVscode, vscodeFiles } from "./lib/vscode-scenario.ts";
import { stopVscode, VscodeSession } from "./lib/vscode.ts";

const stateDir = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "agent-tools-e2e",
);
const currentFile = join(stateDir, "vscode-current.json");

type Current = { plugin: string; scenario: string; runDir: string; file: string };

const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

export const USAGE = `usage: node e2e/cli.ts vscode <verb>
  ls [plugin]                              scenarios
  goto <plugin> <scenario> [--size WxH]    start VS Code on that screen and leave it there
  cap                                      the Claude panel as text
  click <text> [--nth N] [--double]        click the visible element whose own text matches
  hover <text> [--nth N]                   move the pointer onto it
  type <text>                              literal text into the focused field or the prompt
  keys <Key...>                            Enter, Escape, Tab, Down, Ctrl+c, a ...
  wait <regex> [seconds]                   until the panel shows it
  resize <width> <height>                  the window's size (a viewport override)
  eval <js>                                an expression in the Claude webview's document (for the DOM)
  shot [file] [--window]                   PNG of the Claude panel (the whole window with --window)
  sweep                                    panel PNGs at a narrow and a wide width; prints the paths
  stop                                     end VS Code and the stub, remove the run folder`;

const readCurrent = (): Current | undefined =>
  existsSync(currentFile) ? (JSON.parse(readFileSync(currentFile, "utf8")) as Current) : undefined;

async function need(): Promise<{ cur: Current; session: VscodeSession }> {
  const cur = readCurrent();
  if (!cur) return die("no VS Code session: run `vscode goto <plugin> <scenario>` first");
  return { cur, session: await VscodeSession.attach(cur.runDir) };
}

async function stop() {
  const cur = readCurrent();
  if (cur) {
    await stopVscode(cur.runDir);
    rmSync(cur.runDir, { recursive: true, force: true });
  }
  rmSync(currentFile, { force: true });
  return cur;
}

/** `--name value` out of `args`, which loses both. */
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}
const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};

/** The widths `sweep` shoots: a narrow side panel and a wide editor. */
const SWEEP: [number, number][] = [
  [420, 800],
  [1280, 720],
];

export async function main(argv: string[]) {
  const [verb, ...args] = argv;
  switch (verb) {
    case "ls": {
      for (const f of vscodeFiles(args[0])) {
        const set = await loadVscodeSet(f.file);
        for (const [name, s] of Object.entries(set.scenarios))
          console.log(`${f.plugin} ${name}  [vscode]  ${s.about ?? ""}`);
      }
      return;
    }
    case "goto": {
      const size = option(args, "--size");
      const [plugin, scenario] = args;
      if (!plugin || !scenario) return die(USAGE);
      const file = vscodeFiles(plugin)[0]?.file;
      if (!file) return die(`no e2e/${plugin}/vscode.scenarios.ts; try \`vscode ls\``);
      const set = await loadVscodeSet(file);
      if (!set.scenarios[scenario])
        return die(
          `no scenario ${plugin} ${scenario}; has ${Object.keys(set.scenarios).join(", ")}`,
        );
      await stop();
      const r = resolveVscode(set, scenario);
      if (size) {
        const m = /^(\d+)x(\d+)$/.exec(size);
        if (!m) return die("--size is WIDTHxHEIGHT");
        r.size = [Number(m[1]), Number(m[2])];
      }
      mkdirSync(stateDir, { recursive: true });
      const runDir = mkdtempSync(join(stateDir, "vrun-"));
      // Written first, so a failed start still leaves something for `stop` to clean.
      writeFileSync(currentFile, JSON.stringify({ plugin, scenario, runDir, file }));
      try {
        const { session } = await reachVscode(r, runDir);
        console.log(`on ${plugin}/vscode/${scenario}; folder ${session.state.cwd}`);
        console.log(await session.text());
        session.close();
      } catch (err) {
        // E2E_KEEP=1 leaves a window that failed to start, for a look at its logs.
        if (!process.env.E2E_KEEP) await stop();
        throw err;
      }
      return;
    }
    case "stop": {
      const cur = await stop();
      console.log(cur ? `stopped ${cur.plugin}/vscode/${cur.scenario}` : "nothing was running");
      return;
    }
    case "cap": {
      const { session } = await need();
      console.log(await session.text());
      session.close();
      return;
    }
    case "type": {
      if (args.length === 0) return die("type <text>");
      const { session } = await need();
      await session.type(args.join(" "));
      console.log(await session.text());
      session.close();
      return;
    }
    case "keys": {
      if (args.length === 0) return die("keys <Key...>");
      const { session } = await need();
      await session.press(args);
      console.log(await session.text());
      session.close();
      return;
    }
    case "click":
    case "hover": {
      const nth = Number(option(args, "--nth") ?? 0);
      const double = flag(args, "--double");
      const text = args.join(" ");
      if (!text) return die(`${verb} <text>`);
      const { session } = await need();
      if (verb === "click")
        console.log(`clicked "${await session.click({ text, nth }, double ? 2 : 1)}"`);
      else await session.hover({ text, nth });
      console.log(await session.text());
      session.close();
      return;
    }
    case "wait": {
      const [pattern, secs] = args;
      if (!pattern) return die("wait <regex> [seconds]");
      const { session } = await need();
      await session.wait(new RegExp(pattern), { timeout: Number(secs ?? 15) * 1000 });
      console.log(await session.text());
      session.close();
      return;
    }
    case "resize": {
      const [w, h] = args.map(Number);
      if (!w || !h) return die("resize <width> <height>");
      const { session } = await need();
      await session.resize(w, h);
      console.log(await session.text());
      session.close();
      return;
    }
    case "eval": {
      if (args.length === 0) return die("eval <js>");
      const { session } = await need();
      await session.settle(800, 6000);
      console.log(JSON.stringify(await session.evalInView(args.join(" ")), null, 2));
      session.close();
      return;
    }
    case "shot": {
      const window = flag(args, "--window");
      const { cur, session } = await need();
      const path =
        args[0] ??
        join(cur.runDir, `shot-${new Date().toTimeString().slice(0, 8).replaceAll(":", "")}.png`);
      console.log(await session.shot(path, { panel: !window }));
      session.close();
      return;
    }
    case "sweep": {
      const { cur, session } = await need();
      const before = session.state.size;
      const dir = join(cur.runDir, "sweep");
      for (const [w, h] of SWEEP) {
        await session.resize(w, h);
        console.log(await session.shot(join(dir, `${w}x${h}.png`), { panel: true }));
      }
      if (before) await session.resize(before[0], before[1]);
      else await session.resize(...SWEEP[SWEEP.length - 1]!);
      session.close();
      return;
    }
    default:
      return die(USAGE);
  }
}

if (process.argv[1]?.endsWith("vscode.ts"))
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
