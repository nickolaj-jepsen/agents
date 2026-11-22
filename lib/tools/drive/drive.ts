/**
 * `pnpm drive <verb> [<package> [<scenario>]] [--harness claude|pi|vscode|desktop] [--session NAME]`
 *
 * One driver for every harness: it parks a real agent (a terminal claude or pi, Claude Code in VS
 * Code) on a scenario's screen and drives it from separate invocations, runs the scenarios as
 * tests, and records the site's media. Run it with `--help` for the verbs.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import { captureCast, playCast } from "./lib/cast.ts";
import { entries, findOwner, KINDS, loadAny, type Kind } from "./lib/find.ts";
import {
  attach,
  gotoSession,
  liveSession,
  reloadSession,
  replayVscode,
  stopSession,
  type Flags,
} from "./lib/lifecycle.ts";
import { compare } from "./lib/compare.ts";
import { loadTypes } from "./lib/mod-types.ts";
import { setOptions } from "./lib/options.ts";
import { e2ePackages } from "./lib/packages.ts";
import { record } from "./lib/record.ts";
import { loadSet, reach, resolveScenario } from "./lib/scenario.ts";
import { DEFAULT_SESSION, sessionName, sessionNames, readSession } from "./lib/sessions.ts";
import { runTerminal, terminalCall } from "./lib/terminal.ts";
import { runTests } from "./lib/test.ts";
import { rebuild, withInPlaceReload } from "./lib/watch.ts";
import type { Target } from "./lib/target.ts";

const size = (value: string): [number, number] => {
  const m = /^(\d+)x(\d+)$/.exec(value);
  if (!m || !Number(m[1]) || !Number(m[2]))
    throw new InvalidArgumentError("use COLSxROWS for a terminal, WIDTHxHEIGHT for VS Code");
  return [Number(m[1]), Number(m[2])];
};
/** `4`, or `claude=1,pi=2` for one pool each. */
const jobs = (value: string): number | { claude?: number; pi?: number } => {
  const whole = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1)
      throw new InvalidArgumentError("whole numbers of 1 or more: 4, or claude=1,pi=2");
    return n;
  };
  if (!value.includes("=")) return whole(value);
  const out: { claude?: number; pi?: number } = {};
  for (const part of value.split(",")) {
    const [k, v] = part.split("=");
    if ((k !== "claude" && k !== "pi") || v === undefined)
      throw new InvalidArgumentError("whole numbers of 1 or more: 4, or claude=1,pi=2");
    out[k] = whole(v);
  }
  return out;
};
const count = (value: string) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("a whole number of 1 or more");
  return n;
};

const scaleOption = () =>
  new Option(
    "--scale <n>",
    "VS Code: device pixels per CSS pixel, 2 by default; 1 for the window's own density. The layout is the same",
  )
    .argParser(scale)
    .default(2);

const scale = (value: string) => {
  const n = Number(value);
  if (!(n >= 1 && n <= 4)) throw new InvalidArgumentError("a number from 1 to 4");
  return n;
};

const harnessOption = () =>
  new Option(
    "--harness <harness>",
    "where the scenario is shown; needed when it exists in several",
  ).choices(KINDS);

const program = new Command("drive")
  .description(
    "Drive plugins in real agents, run their screen tests and record the site's media.\n\n" +
      "A <package> is an app (`docfix`) or a kit component (`kit-card`); `kit` is every kit package, `apps` every app. " +
      "`drive ls` lists them. A parked session (goto) is named with --session; sessions of different names run side by side.",
  )
  .option("--session <name>", "the parked session a verb acts on", DEFAULT_SESSION)
  .option("--keep", "keep a run's folder and logs when it ends or fails to start, and print where")
  .option("--timing", "print how long each phase of a VS Code start took")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
cap, keys, type, paste, click, hover, wait, resize and shot drive a VS Code session; a parked
claude or pi session takes the same commands through \`drive terminal\`, in the tui-test CLI's own
syntax. snap is the scenario's own snapshot, sweep photographs the test sizes.

Examples:
  drive ls docfix                          the scenarios of docfix, by harness
  drive goto docfix queue --harness pi     park pi on that screen, then
  drive terminal text                      read it as text
  drive terminal click text "hosts.md"     click visible text
  drive terminal expect text "opened"      assert the screen; exit 1 when it does not
  drive terminal screenshot -o shot.png    write a PNG
  drive stop
  drive live answer long-body --harness desktop   open a fixture in Claude Desktop
  drive test docfix -t band                one scenario's snapshots
  drive record docfix                      rerecord the site's media for docfix`,
  );

program.hook("preAction", () => {
  const o = program.opts<{ keep?: boolean; timing?: boolean }>();
  setOptions({ keep: o.keep, timing: o.timing });
});

const session = () => sessionName(program.opts<{ session?: string }>().session);

/** A verb's failure is its message, and the exit code says so. */
function die(err: unknown): never {
  // A source that does not parse is named only in the stack's head, with its line and a caret.
  const head = err instanceof SyntaxError ? err.stack?.split(/\n\s+at /)[0] : undefined;
  console.error(head ?? (err instanceof Error ? err.message : err));
  process.exit(1);
}

/** Runs a verb; its error is its message, and the exit code says so. */
function verb<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      die(err);
    }
    process.exit(0);
  };
}

/** A verb on the parked session: connect, act, let go; the session runs on. */
function onSession(fn: (target: Target, kind: Kind, name: string) => Promise<void>) {
  return verb(async () => {
    const name = session();
    const { rec, target } = await attach(name);
    try {
      await fn(target, rec.harness, name);
    } finally {
      target.detach();
    }
  });
}

// ---- finding scenarios

program
  .command("ls")
  .description("list packages, or a package's scenarios by harness")
  .argument("[package]", "an app, kit-<component>, kit or apps")
  .addOption(harnessOption())
  .action(
    verb(async (pkg: string | undefined, o: { harness?: Kind }) => {
      if (!pkg) {
        for (const p of e2ePackages()) {
          const kinds: string[] = entries(p.name).map((e) => e.harness);
          if (existsSync(join(p.e2e, "site.scenarios.ts"))) kinds.push("site");
          console.log(`${p.name}  [${kinds.join(" ")}]`);
        }
        const parked = sessionNames();
        if (parked.length > 0) {
          console.log("\nparked sessions:");
          for (const n of parked) {
            const r = readSession(n)!;
            console.log(`  ${n}  ${r.package}/${r.harness}/${r.scenario}`);
          }
        }
        return;
      }
      for (const e of entries(pkg).filter((e) => !o.harness || e.harness === o.harness)) {
        const set = await loadAny(e.file);
        for (const [name, s] of Object.entries(set.scenarios))
          console.log(`${e.package} ${name}  [${e.harness}]  ${s.about ?? ""}`);
      }
    }),
  );

// ---- starting and stopping

/** The flags a start takes: what it shows, and at what size; `--draft` is Desktop's own. */
const startOptions = (c: Command) =>
  c
    .addOption(harnessOption())
    .option(
      "--size <size>",
      "the size the steps run at: COLSxROWS, or WIDTHxHEIGHT in VS Code",
      size,
    )
    .option("--draft", "desktop: open a prefilled draft for a real model, not a seeded session");

/** Watching is the foreground's: `live` rebuilds and replays on a save until it is closed. */
const watchOptions = (c: Command) =>
  c
    .option(
      "--watch",
      "on each save under the package, its kits or the scenario's folder, rebuild and replay",
    )
    .option(
      "--in-place",
      "with --watch: reload plugin edits without restarting the session; scenario edits still replay",
    );

type StartFlags = Flags & { harness?: Kind };

watchOptions(
  startOptions(
    program
      .command("live")
      .description(
        "replay a scenario in the foreground, then interact and resize; Ctrl+] stops a terminal one, closing the window a VS Code one; --watch replays on each save",
      )
      .argument("<package>")
      .argument("<scenario>"),
  ),
).action(
  verb(async (pkg: string, scenario: string, o: StartFlags) => {
    await liveSession(await findOwner(pkg, scenario, o.harness), scenario, o);
  }),
);

startOptions(
  program
    .command("goto")
    .description(
      "start the agent on a scenario's screen and leave it parked under --session; `reload` plays an edited one there",
    )
    .argument("<package>")
    .argument("<scenario>"),
).action(
  verb(async (pkg: string, scenario: string, o: StartFlags) => {
    await gotoSession(session(), await findOwner(pkg, scenario, o.harness), scenario, o);
  }),
);

program
  .command("reload")
  .description(
    "after an edit: rebuild and play the parked session's scenario again (VS Code: in a new Claude tab, and another scenario of the package may be named)",
  )
  .argument("[scenario]")
  .action(verb(async (scenario?: string) => reloadSession(session(), scenario)));

program
  .command("stop")
  .description("end the parked session and remove its run folder")
  .option("--all", "every parked session")
  .action(
    verb(async (o: { all?: boolean }) => {
      for (const name of o.all ? sessionNames() : [session()]) {
        const rec = await stopSession(name);
        console.log(
          rec
            ? `stopped ${name}: ${rec.package}/${rec.harness}/${rec.scenario}`
            : `nothing was running in ${name}`,
        );
      }
    }),
  );

// ---- driving a parked session

const out = async (t: Target) => console.log(await t.text());

program
  .command("terminal")
  .description(
    "a parked claude or pi session through the tui-test CLI the repo pins: its command and arguments pass through",
  )
  .argument("[args...]", "a tui-test command and its arguments")
  .allowUnknownOption()
  .allowExcessArguments()
  .addHelpText(
    "after",
    `
The session and its daemon are chosen here, so the tree the CLI reads, clicks and photographs is
the one goto parked. Its output, structured output (--json) and exit status come back as it gave
them; \`drive terminal help\` and \`drive terminal usage\` are its own guide.

  drive terminal text                            the screen as text
  drive terminal click text "hosts.md"           click visible text (--nth N, --clicks 2, --regex)
  drive terminal expect text "Opened"            assert the screen; exits 1 when it is not there
  drive terminal screenshot -o /tmp/shot.png     a PNG of the screen
  drive terminal resize 100 30                   columns by rows
  drive terminal wait idle                       until the screen stops repainting

Commands that launch, replace or tear down the session (run, open, restart, close, daemon, kill,
signal, sessions) are refused: goto, reload and stop own the lifecycle. So is a --session after the
command: write drive's own before it (\`drive terminal --session b text\`), because there it names
the parked session and is never handed to the CLI.`,
  )
  .action(() => {
    try {
      const call = terminalCall(process.argv.slice(2), program.options);
      if (!call) throw new Error("give a tui-test command: `drive terminal help` lists them");
      process.exit(runTerminal(call.args, sessionName(call.session)));
    } catch (err) {
      die(err);
    }
  });

program.command("cap").description("the screen as text (VS Code)").action(onSession(out));

program
  .command("snap")
  .description("the scenario's snapshot of the screen as it is now (terminal sessions)")
  .action(
    onSession(async (t, kind, name) => {
      const rec = readSession(name)!;
      const r =
        kind === "claude" || kind === "pi"
          ? resolveScenario(await loadSet(rec.file), rec.scenario)
          : undefined;
      console.log(await t.snap(r as never));
    }),
  );

program
  .command("keys")
  .description("named keys, in order: Enter, Escape, Tab, Down, Ctrl+c, Alt+a, a")
  .argument("<key...>")
  .action(
    verb(async (keys: string[]) => {
      const { target } = await attach(session());
      try {
        await target.keys(keys);
        await out(target);
      } finally {
        target.detach();
      }
    }),
  );

for (const name of ["type", "paste"] as const)
  program
    .command(name)
    .description(
      name === "type"
        ? "literal text into the focused input"
        : "text as one bracketed paste, so line breaks stay in the draft",
    )
    .argument("<text...>")
    .action(
      verb(async (words: string[]) => {
        const { target } = await attach(session());
        try {
          await (name === "type" ? target.type(words.join(" ")) : target.paste(words.join(" ")));
          await out(target);
        } finally {
          target.detach();
        }
      }),
    );

for (const name of ["click", "hover"] as const) {
  const c = program
    .command(name)
    .description(
      name === "click" ? "click the visible text" : "move the pointer onto the visible text",
    )
    .argument("<text...>")
    .option("--nth <n>", "a later occurrence than the first (0 is the first)", (v) => Number(v), 0);
  if (name === "click") c.option("--double", "a double click");
  c.action(
    verb(async (words: string[], o: { nth: number; double?: boolean }) => {
      const { target } = await attach(session());
      try {
        const at = { text: words.join(" "), nth: o.nth };
        if (name === "click") {
          const hit = await target.click(at, !!o.double);
          if (hit) console.log(`clicked "${hit}"`);
        } else await target.hover(at);
        await out(target);
      } finally {
        target.detach();
      }
    }),
  );
}

program
  .command("wait")
  .description("until the screen shows the pattern")
  .argument("<regex>")
  .argument("[seconds]", "how long to wait", (v) => Number(v), 15)
  .action(
    verb(async (pattern: string, seconds: number) => {
      const { target } = await attach(session());
      try {
        await target.wait(new RegExp(pattern), seconds);
        await out(target);
      } finally {
        target.detach();
      }
    }),
  );

program
  .command("resize")
  .description("columns by rows for a terminal; width by height in pixels for VS Code")
  .argument("<a>", "columns, or width", Number)
  .argument("<b>", "rows, or height", Number)
  .action(
    verb(async (a: number, b: number) => {
      if (!a || !b) throw new Error("resize <cols> <rows> (VS Code: <width> <height>)");
      const { target } = await attach(session());
      try {
        await target.resize(a, b);
        await out(target);
      } finally {
        target.detach();
      }
    }),
  );

program
  .command("shot")
  .description("a PNG of the screen; prints the path")
  .argument("[file]")
  .option("--window", "VS Code: the whole window, not the Claude panel")
  .addOption(scaleOption())
  .action(
    verb(async (file: string | undefined, o: { window?: boolean; scale: number }) => {
      setOptions({ scale: o.scale });
      const { target } = await attach(session());
      try {
        console.log(await target.shot(file, o));
      } finally {
        target.detach();
      }
    }),
  );

program
  .command("sweep")
  .description(
    "PNGs at the sizes a screen has to hold at (terminal: 70x24 to 240x60; VS Code: narrow and wide); prints the paths",
  )
  .addOption(scaleOption())
  .action(
    verb(async (o: { scale: number }) => {
      setOptions({ scale: o.scale });
      const { target } = await attach(session());
      try {
        for (const path of await target.sweep()) console.log(path);
      } finally {
        target.detach();
      }
    }),
  );

program
  .command("compare")
  .description(
    "photograph a package's VS Code scenarios here and in another checkout, wide and narrow, and write a page that sets each pair side by side; prints its path",
  )
  .argument("<package>", "an app or kit-<component>")
  .requiredOption("--base <path>", "the other checkout, installed and built (a worktree of main)")
  .option("--out <dir>", "write the pictures and index.html here, not to a new folder in /tmp")
  .addOption(scaleOption())
  .action(
    verb(async (pkg: string, o: { base: string; out?: string; scale: number }) => {
      console.log(await compare(pkg, o));
    }),
  );

program
  .command("eval")
  .description("an expression in the Claude webview's document, for the DOM (VS Code sessions)")
  .argument("<js...>")
  .action(
    verb(async (js: string[]) => {
      const { target } = await attach(session());
      try {
        console.log(JSON.stringify(await target.eval(js.join(" ")), null, 2));
      } finally {
        target.detach();
      }
    }),
  );

// ---- tests and media

program
  .command("test")
  .description(
    "play a package's scenarios in the real agents and compare each screen with its snapshot",
  )
  .argument("[package]", "an app, kit-<component>, kit or apps; all when left out")
  .option("-t, --testNamePattern <pattern>", "only the tests whose name matches, as vitest's -t")
  .option("--update", "accept the screens as the new snapshots")
  .option("--png", "also write a PNG beside every snapshot")
  .option("--jobs <n>", "sessions at once per harness: 4, or claude=1,pi=2", jobs)
  .option("--tmp <dir>", "make run folders here, not in /tmp")
  .action(
    verb(
      async (
        pkg: string | undefined,
        o: {
          testNamePattern?: string;
          update?: boolean;
          png?: boolean;
          jobs?: number | { claude?: number; pi?: number };
          tmp?: string;
        },
      ) => {
        const ok = await runTests(pkg, {
          filter: o.testNamePattern,
          update: o.update,
          png: o.png,
          jobs: o.jobs,
          tmp: o.tmp,
        });
        process.exit(ok ? 0 : 1);
      },
    ),
  );

program
  .command("record")
  .description(
    "play a package's site scenarios and write its media to apps/site/media/<package>/, emptying what it wrote before; all packages when none is named. Run it in `nix run .#media -- ...`",
  )
  .argument("[package]", "an app, kit-<component>, kit or apps; all when left out")
  .addOption(
    new Option("--harness <harness>", "only the terminal's media or only VS Code's").choices([
      "terminal",
      "vscode",
    ]),
  )
  .option("--jobs <n>", "scenarios of a package at once", count)
  .action(
    verb(async (pkg: string | undefined, o: { harness?: "terminal" | "vscode"; jobs?: number }) => {
      const bad = await record(pkg, o);
      process.exit(bad > 0 ? 1 : 0);
    }),
  );

program
  .command("cast")
  .description(
    "replay an asciicast v2 in Kitty and write <out-prefix>.mp4 and .png from it (Linux; run in the media environment)",
  )
  .argument("<cast-file>")
  .argument("<out-prefix>")
  .option("--require-graphics", "fail when the cast has no Kitty graphics")
  .action(
    verb(async (cast: string, prefix: string, o: { requireGraphics?: boolean }) => {
      captureCast(cast, prefix, !!o.requireGraphics);
    }),
  );

program
  .command("types")
  .description(
    "start a hermetic Claude with the build of an app (or of kit-catalog), wait for dist/.claude-plugin/types/ to appear, stop",
  )
  .argument("<package>")
  .action(
    verb(async (app: string) => {
      console.log(await loadTypes(app));
    }),
  );

// ---- internal

program
  .command("_reach", { hidden: true })
  .description("live mode's reload: play a scenario onto a daemon session and print its name")
  .argument("<package>")
  .argument("<scenario>")
  .addOption(harnessOption())
  .requiredOption("--daemon <name>")
  .requiredOption("--run <dir>")
  .option("--size <size>", "", size)
  .option("--in-place")
  .action(
    verb(
      async (
        pkg: string,
        scenario: string,
        o: {
          harness?: Kind;
          daemon: string;
          run: string;
          size?: [number, number];
          inPlace?: boolean;
        },
      ) => {
        const owner = await findOwner(pkg, scenario, o.harness);
        if (owner.harness !== "claude" && owner.harness !== "pi")
          throw new Error("_reach is for terminal scenarios");
        const r = resolveScenario(await loadSet(owner.file), scenario);
        if (o.size) r.size = o.size;
        await rebuild(r);
        const start = o.inPlace ? withInPlaceReload(r, o.run) : r;
        const s = await reach(start, "daemon", o.daemon, o.run);
        const term = s.term as { session?: string };
        console.log(JSON.stringify({ session: term.session ?? o.daemon }));
      },
    ),
  );

program
  .command("_replay-vscode", { hidden: true })
  .description("rebuild and replay a scenario in a visible VS Code window")
  .argument("<package>")
  .argument("<scenario>")
  .requiredOption("--run <dir>")
  .option("--size <size>", "", size)
  .action(
    verb(async (pkg: string, scenario: string, o: { run: string; size?: [number, number] }) => {
      const owner = await findOwner(pkg, scenario, "vscode");
      const session = await replayVscode(owner.file, scenario, o.run, o.size);
      try {
        await session.useWindowSize();
      } finally {
        session.close();
      }
    }),
  );

program
  .command("_cast-play", { hidden: true })
  .argument("<cast>")
  .argument("<scratch>")
  .action(async (cast: string, scratch: string) => {
    try {
      await playCast(cast, scratch);
    } catch (err) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${scratch}/error`, err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

await program.parseAsync();
