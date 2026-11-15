/**
 * Parks a live agent session on a scenario's screen and drives it from separate
 * invocations, through the tui-test daemon:
 *
 *   node e2e/cli.ts goto docfix queue
 *   node e2e/cli.ts cap
 *   node e2e/cli.ts click "Apply"
 *   node e2e/cli.ts sweep
 *   node e2e/cli.ts stop
 *
 * Run `node e2e/cli.ts` for the verbs.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessName } from "./lib/harness.ts";
import { loadSet, reach, resolveScenario, scenarioFiles, type Resolved } from "./lib/scenario.ts";
import { EXTREME_SIZES, Session } from "./lib/session.ts";
import { stopStub } from "./lib/stub.ts";
import { tuiTest } from "./lib/term.ts";

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
};

const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const USAGE = `usage: node e2e/cli.ts <verb>
  ls [plugin]                              scenarios, by plugin and agent
  goto <plugin> <scenario> [--harness claude|pi] [--size COLSxROWS]
                                           start the agent on that screen and leave it there
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
  stop                                     end the session and remove its folder`;

const readCurrent = (): Current | undefined =>
  existsSync(currentFile) ? (JSON.parse(readFileSync(currentFile, "utf8")) as Current) : undefined;

function need(): { cur: Current; session: Session } {
  const cur = readCurrent();
  if (!cur) return die("no session: run `goto <plugin> <scenario>` first");
  return { cur, session: Session.attach(SESSION, cur.harness, cur.runDir) };
}

async function resolved(cur: Current): Promise<Resolved> {
  return resolveScenario(await loadSet(cur.file), cur.scenario);
}

async function stop() {
  const cur = readCurrent();
  await tuiTest(["--session", SESSION, "close"]).catch(() => undefined);
  await tuiTest(["daemon", "stop", "--session", SESSION]).catch(() => undefined);
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

async function main() {
  const [verb, ...args] = process.argv.slice(2);
  switch (verb) {
    case "ls": {
      for (const f of scenarioFiles(args[0])) {
        const set = await loadSet(f.file);
        for (const [name, s] of Object.entries(set.scenarios))
          console.log(`${f.plugin} ${name}  [${f.harness}]  ${s.about ?? ""}`);
      }
      return;
    }
    case "goto": {
      const harness = option(args, "--harness") as HarnessName | undefined;
      const size = option(args, "--size");
      const [plugin, scenario] = args;
      if (!plugin || !scenario) return die(USAGE);
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
      const owner = owners[0] as (typeof owners)[number];
      await stop();
      const r = resolveScenario(await loadSet(owner.file), scenario);
      if (size) {
        const m = /^(\d+)x(\d+)$/.exec(size);
        if (!m) return die("--size is COLSxROWS");
        r.size = [Number(m[1]), Number(m[2])];
      }
      mkdirSync(stateDir, { recursive: true });
      const runDir = mkdtempSync(join(stateDir, "run-"));
      const session = await reach(r, "daemon", SESSION, runDir);
      const cur: Current = { plugin, harness: owner.harness, scenario, runDir, file: owner.file };
      writeFileSync(currentFile, JSON.stringify(cur));
      const sz = await session.size();
      console.log(
        `on ${plugin}/${owner.harness}/${scenario} at ${sz.cols}x${sz.rows}; folder ${session.cwd}`,
      );
      console.log(await session.text());
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
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
