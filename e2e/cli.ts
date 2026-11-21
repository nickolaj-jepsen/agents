/**
 * Parks a live agent session on a scenario's screen and drives it from separate invocations,
 * through the tui-test daemon: `goto <plugin> <scenario>`, then `cap`, `keys`, `click` and so on.
 * Run `node e2e/cli.ts` for the verbs.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { checkoutRoot, type HarnessName } from "./lib/harness.ts";
import { live } from "./lib/live.ts";
import { loadSet, reach, resolveScenario, scenarioFiles, type Resolved } from "./lib/scenario.ts";
import { EXTREME_SIZES, Session } from "./lib/session.ts";
import { stopStub } from "./lib/stub.ts";
import { DaemonTerm, tuiTest } from "./lib/term.ts";
import {
  fileList,
  relevant,
  sourceDirs,
  syncKit,
  touchesScenario,
  watchSources,
} from "./lib/watch.ts";

const SESSION = "e2e-goto";
const stateDir = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "agent-tools-e2e",
);
const currentFile = join(stateDir, "current.json");

type Current = {
  plugin: string;
  harness: HarnessName;
  scenario: string;
  runDir: string;
  file: string;
  /** The daemon's session name, when not `SESSION`: a reload starts the next one beside it. */
  session?: string;
  /** `--size` as given to `goto`, which a reload starts at again. */
  size?: [number, number];
};

const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const USAGE = `usage: node e2e/cli.ts <verb>
  ls [plugin] [--harness claude|pi|vscode]   scenarios, by plugin and agent
  live <plugin> <scenario> [--harness claude|pi|vscode] [--size WxH] [--watch [--in-place]]
                                           replay the scenario, then interact and resize
  goto <plugin> <scenario> [--harness claude|pi] [--size COLSxROWS] [--watch [--in-place]]
                                           start the agent on that screen and leave it there
  reload                                   sync the kit, start over and replay to the same screen
  cap                                      the screen as text
  snap                                     the scenario's snapshot of the screen as it is now
  keys <Key...>                            Enter, Escape, Tab, Down, Ctrl+c, Alt+a ...
  type <text>                              literal text
  paste <text>                             text as one bracketed paste
  click <text> [--nth N] [--double]        click the visible text
  hover <text> [--nth N]                   move the pointer onto it
  wait <regex> [seconds]                   until the screen shows it
  resize <cols> <rows>
  shot [file]                              PNG of the screen; prints the path
  sweep                                    PNG at 70x24, 112x32, 160x45 and 240x60; prints the paths
  stop                                     end the session and remove its folder
  vscode <verb>                            the same in a headless VS Code (\`vscode\` alone lists them)

--watch: on each save under the plugin, kit/ or the scenario's folder, sync the kit, start over
and replay. --in-place: Claude keeps its session and reloads the mod itself, in its own time.
goto --watch stays in the foreground; Ctrl+C stops watching and leaves the session parked.`;

const readCurrent = (): Current | undefined =>
  existsSync(currentFile) ? (JSON.parse(readFileSync(currentFile, "utf8")) as Current) : undefined;

function need(): { cur: Current; session: Session } {
  const cur = readCurrent();
  if (!cur) return die("no session: run `goto <plugin> <scenario>` first");
  return { cur, session: Session.attach(cur.session ?? SESSION, cur.harness, cur.runDir) };
}

/** The daemon session a session runs in: a start that hit Claude's hiccup is `<name>-retry`. */
const daemonName = (session: Session, fallback: string) =>
  session.term instanceof DaemonTerm ? session.term.session : fallback;

async function resolved(cur: Current): Promise<Resolved> {
  return resolveScenario(await loadSet(cur.file), cur.scenario);
}

async function stop() {
  const cur = readCurrent();
  for (const name of new Set([SESSION, cur?.session ?? SESSION])) {
    await tuiTest(["--session", name, "close"]).catch(() => undefined);
    await tuiTest(["daemon", "stop", "--session", name]).catch(() => undefined);
  }
  if (cur) stopStub(cur.runDir);
  if (cur) rmSync(cur.runDir, { recursive: true, force: true });
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

/** The scenario file of `plugin` that has `scenario`, in `harness` if given. */
async function findOwner(plugin: string, scenario: string, harness?: string) {
  const found = scenarioFiles(plugin).filter((f) => !harness || f.harness === harness);
  const owners: typeof found = [];
  for (const f of found) if ((await loadSet(f.file)).scenarios[scenario]) owners.push(f);
  if (owners.length === 0)
    return die(
      `no scenario ${plugin} ${scenario}${harness ? ` in ${harness}` : ""}; try \`ls ${plugin}\``,
    );
  if (owners.length > 1)
    return die(
      `${plugin} ${scenario} exists in ${owners.map((o) => o.harness).join(" and ")}: pass --harness`,
    );
  return owners[0] as (typeof owners)[number];
}

/** A failed start's folder: kept and named with E2E_KEEP=1, else removed. */
function keepOrRemove(runDir: string) {
  if (process.env.E2E_KEEP) console.error(`kept the run folder: ${runDir}`);
  else rmSync(runDir, { recursive: true, force: true });
}

/**
 * Syncs the kit and parks a fresh session on the scenario beside the current one, at the size
 * that one has now, and only then replaces it: a start that fails leaves the last good session
 * parked. The scenario's file is read as it is now.
 */
async function reload() {
  const { cur, session: old } = need();
  for (const line of await syncKit()) console.log(line);
  const r = await resolved(cur);
  if (cur.size) r.size = cur.size;
  const before = await old.size().catch(() => undefined);
  const runDir = mkdtempSync(join(stateDir, "run-"));
  // Two names in turn: the daemon leaves a file or two behind for every name it has served.
  const name = (cur.session ?? SESSION) === SESSION ? `${SESSION}-next` : SESSION;
  let session: Session;
  try {
    session = await reach(r, "daemon", name, runDir);
  } catch (err) {
    keepOrRemove(runDir);
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}\nreload failed; the session from before it is still parked`,
      { cause: err },
    );
  }
  if (before && (before.cols !== r.size[0] || before.rows !== r.size[1]))
    await session.resize(before.cols, before.rows);
  const next: Current = { ...cur, runDir, session: daemonName(session, name) };
  writeFileSync(currentFile, JSON.stringify(next));
  await old.close();
  rmSync(cur.runDir, { recursive: true, force: true });
  const sz = await session.size();
  console.log(`reloaded ${cur.plugin}/${cur.harness}/${cur.scenario} at ${sz.cols}x${sz.rows}`);
  console.log(await session.text());
}

const IN_PLACE =
  "Claude reloads the mod in place in its own time (seconds, or a minute when it reloads often); `cap` to see it";

/**
 * `goto --watch`: on each batch of saves until a signal, `reload` (in a process of its own, so the
 * scenario is read anew), which prints the screen. With `inPlace`, a Claude session gets the sync
 * alone and reloads the mod itself, unless the scenario changed.
 */
async function watchParked(r: Resolved, inPlace: boolean) {
  const dirs = sourceDirs(r);
  console.log(
    `watching ${dirs.map((d) => relative(checkoutRoot, d)).join(", ")}; Ctrl+C stops watching and leaves the session parked`,
  );
  const watcher = watchSources(
    dirs,
    async (saved) => {
      const files = relevant(r.harness, saved);
      if (files.length === 0) return;
      console.log(`\n${new Date().toTimeString().slice(0, 8)} saved ${fileList(files)}`);
      if (!readCurrent()) return void console.log("no session is parked: `goto` again");
      if (r.harness === "claude" && inPlace && !touchesScenario(r, files)) {
        for (const line of await syncKit()) console.log(line);
        console.log(IN_PLACE);
        return;
      }
      const code = await new Promise<number | null>((resolve) =>
        spawn(process.execPath, [join(import.meta.dirname, "cli.ts"), "reload"], {
          stdio: "inherit",
        }).once("exit", resolve),
      );
      if (code !== 0) console.log("waiting for the next save");
    },
    { onError: (err) => console.error(err instanceof Error ? err.message : err) },
  );
  await new Promise<void>((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, resolve);
  });
  watcher.close();
  console.log("stopped watching; the session is still parked (`stop` ends it)");
}

async function main() {
  const [verb, ...args] = process.argv.slice(2);
  switch (verb) {
    case "vscode": {
      // Its own state file and verbs, so a terminal session and a VS Code one coexist.
      const { main: vscode } = await import("./vscode.ts");
      await vscode(args);
      process.exit(0);
    }
    case "ls": {
      const harness = option(args, "--harness");
      for (const f of scenarioFiles(args[0]).filter((f) => !harness || f.harness === harness)) {
        const set = await loadSet(f.file);
        for (const [name, s] of Object.entries(set.scenarios))
          console.log(`${f.plugin} ${name}  [${f.harness}]  ${s.about ?? ""}`);
      }
      if (!harness || harness === "vscode") {
        const { main: vscode } = await import("./vscode.ts");
        await vscode(["ls", ...args]);
      }
      return;
    }
    case "goto":
    case "live":
    case "_reach": {
      const harness = option(args, "--harness");
      // `--no-watch` wins, so a recipe that watches by default can be told not to.
      const noWatch = flag(args, "--no-watch");
      const watch = flag(args, "--watch") && !noWatch;
      const inPlace = flag(args, "--in-place");
      if (verb === "live" && harness === "vscode") {
        const { main: vscode } = await import("./vscode.ts");
        return vscode(["live", ...args]);
      }
      const size = option(args, "--size");
      // `_reach`: live mode's reload, in a process of its own so it reads every source afresh.
      const name = option(args, "--session");
      const runAt = option(args, "--run");
      const [plugin, scenario] = args;
      if (!plugin || !scenario) return die(USAGE);
      const owner = await findOwner(plugin, scenario, harness);
      const r = resolveScenario(await loadSet(owner.file), scenario);
      let sized: [number, number] | undefined;
      if (size) {
        const m = /^(\d+)x(\d+)$/.exec(size);
        if (!m || !Number(m[1]) || !Number(m[2])) return die("--size is COLSxROWS");
        sized = [Number(m[1]), Number(m[2])];
        r.size = sized;
      }
      if (verb === "live") return live(r, { watch, inPlace });
      if (verb === "_reach") {
        if (!name || !runAt) return die("_reach needs --session and --run");
        const session = await reach(r, "daemon", name, runAt);
        console.log(JSON.stringify({ session: daemonName(session, name) }));
        return;
      }
      await stop();
      mkdirSync(stateDir, { recursive: true });
      const runDir = mkdtempSync(join(stateDir, "run-"));
      const session = await reach(r, "daemon", SESSION, runDir).catch((err: unknown) => {
        keepOrRemove(runDir);
        throw err;
      });
      const cur: Current = {
        plugin,
        harness: owner.harness,
        scenario,
        runDir,
        file: owner.file,
        session: daemonName(session, SESSION),
        size: sized,
      };
      writeFileSync(currentFile, JSON.stringify(cur));
      const sz = await session.size();
      console.log(
        `on ${plugin}/${owner.harness}/${scenario} at ${sz.cols}x${sz.rows}; folder ${session.cwd}`,
      );
      console.log(await session.text());
      if (watch) await watchParked(r, inPlace);
      return;
    }
    case "reload": {
      await reload();
      return;
    }
    case "stop": {
      const cur = await stop();
      console.log(
        cur ? `stopped ${cur.plugin}/${cur.harness}/${cur.scenario}` : "nothing was running",
      );
      return;
    }
    case "cap": {
      console.log(await need().session.text());
      return;
    }
    case "snap": {
      const { cur, session } = need();
      const r = await resolved(cur);
      const sz = await session.size();
      console.log(
        await session.snapshot(
          `${r.plugin}/${r.harness}/${r.name} ${sz.cols}x${sz.rows}`,
          r.region,
          r.mask,
        ),
      );
      return;
    }
    case "keys": {
      if (args.length === 0) return die("keys <Key...>");
      await need().session.press(args);
      console.log(await need().session.text());
      return;
    }
    case "type":
    case "paste": {
      if (args.length === 0) return die(`${verb} <text>`);
      const { session } = need();
      await (verb === "type" ? session.type(args.join(" ")) : session.paste(args.join(" ")));
      console.log(await session.text());
      return;
    }
    case "click":
    case "hover": {
      const nth = Number(option(args, "--nth") ?? 0);
      const double = flag(args, "--double");
      const text = args.join(" ");
      if (!text) return die(`${verb} <text>`);
      const { session } = need();
      await (verb === "click"
        ? session.click({ text, nth }, double ? 2 : 1)
        : session.hover({ text, nth }));
      console.log(await session.text());
      return;
    }
    case "wait": {
      const [pattern, secs] = args;
      if (!pattern) return die("wait <regex> [seconds]");
      const { session } = need();
      await session.wait(new RegExp(pattern), { timeout: Number(secs ?? 15) * 1000 });
      console.log(await session.text());
      return;
    }
    case "resize": {
      const [cols, rows] = args.map(Number);
      if (!cols || !rows) return die("resize <cols> <rows>");
      const { session } = need();
      await session.resize(cols, rows);
      console.log(await session.text());
      return;
    }
    case "shot": {
      const { cur, session } = need();
      const path =
        args[0] ??
        join(cur.runDir, `shot-${new Date().toTimeString().slice(0, 8).replaceAll(":", "")}.png`);
      console.log(await session.png(path));
      return;
    }
    case "sweep": {
      const { cur, session } = need();
      const before = await session.size();
      const dir = join(cur.runDir, "sweep");
      for (const [cols, rows] of EXTREME_SIZES) {
        await session.resize(cols, rows);
        console.log(await session.png(join(dir, `${cols}x${rows}.png`)));
      }
      await session.resize(before.cols, before.rows);
      return;
    }
    default:
      return die(USAGE);
  }
}

main().catch((err: unknown) => {
  // A source that does not parse is named only in the stack's head, with its line and a caret.
  const head = err instanceof SyntaxError ? err.stack?.split(/\n\s+at /)[0] : undefined;
  console.error(head ?? (err instanceof Error ? err.message : err));
  process.exit(1);
});
