/**
 * The life of a named session: `goto` parks one on a scenario, `attach` finds it again for a verb,
 * `reload` replays it after an edit, `stop` ends it, and `live` runs one in the foreground. What
 * differs per harness is here; what a verb does once it has a `Target` is in `target.ts`.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { resolveDesktop, type DesktopSet } from "./desktop-scenario.ts";
import { launchDesktop, requireDesktop } from "./desktop.ts";
import { loadAny, type Entry, type Kind } from "./find.ts";
import { live } from "./live.ts";
import { options } from "./options.ts";
import { loadSet, reach, resolveScenario } from "./scenario.ts";
import {
  checkoutId,
  newRunDir,
  readSession,
  removeSession,
  writeSession,
  type SessionRecord,
} from "./sessions.ts";
import { Session } from "./session.ts";
import { stopStub } from "./stub.ts";
import { DaemonTerm, tuiTest } from "./term.ts";
import { DesktopTarget, TerminalTarget, VscodeTarget, type Target } from "./target.ts";
import { liveVscode } from "./vscode-live.ts";
import { loadVscodeSet, reachVscode, reloadVscode, resolveVscode } from "./vscode-scenario.ts";
import { stopVscode, VscodeSession } from "./vscode.ts";
import { fileList, rebuild, watchScenario, withInPlaceReload, type WatchFlags } from "./watch.ts";
import type { Size } from "./session.ts";

export type Flags = WatchFlags & {
  size?: Size;
  /** Desktop: a prefilled draft for a real model, not the seeded session. */
  draft?: boolean;
};

/**
 * The daemon's session name for a session of ours; a reload starts `-next` beside it. The daemons
 * are the user's, not the checkout's, so the name carries the checkout.
 */
const daemonBase = (name: string) => `d-${checkoutId}-${name}`;

/** The daemon session a session runs in: a start that hit Claude's hiccup is `<name>-retry`. */
const daemonName = (session: Session, fallback: string) =>
  session.term instanceof DaemonTerm ? session.term.session : fallback;

/** A failed start's folder: kept and named with `--keep`, else removed. */
function keepOrRemove(runDir: string) {
  if (options.keep) console.error(`kept the run folder: ${runDir}`);
  else rmSync(runDir, { recursive: true, force: true });
}

const terminal = (k: Kind): k is "claude" | "pi" => k === "claude" || k === "pi";

/** The scenario of a record or entry, resolved for the harness's own kind. */
async function resolveFor(kind: Kind, file: string, scenario: string) {
  if (terminal(kind)) return resolveScenario(await loadSet(file), scenario);
  if (kind === "vscode") return resolveVscode(await loadVscodeSet(file), scenario);
  return resolveDesktop((await loadAny(file)) as unknown as DesktopSet, scenario);
}

// ---- goto

export async function gotoSession(
  name: string,
  entry: Entry,
  scenario: string,
  flags: Flags,
): Promise<void> {
  if (readSession(name)) await stopSession(name);
  const { harness } = entry;
  const inPlace = flags.watch && flags.inPlace;
  const base = {
    harness,
    package: entry.package,
    scenario,
    file: entry.file,
    size: flags.size,
    inPlace,
  };

  if (terminal(harness)) {
    const r = resolveScenario(await loadSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    const runDir = newRunDir(name);
    const daemon = daemonBase(name);
    const start = inPlace ? withInPlaceReload(r, runDir) : r;
    const session = await reach(start, "daemon", daemon, runDir).catch((err: unknown) => {
      keepOrRemove(runDir);
      throw err;
    });
    writeSession(name, { ...base, runDir, daemon: daemonName(session, daemon) });
    const sz = await session.size();
    console.log(
      `on ${entry.package}/${harness}/${scenario} at ${sz.cols}x${sz.rows}; session ${name}; folder ${session.cwd}`,
    );
    console.log(await session.text());
    return;
  }

  if (harness === "vscode") {
    const r = resolveVscode(await loadVscodeSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    const runDir = newRunDir(name);
    // Written first, so a failed start still leaves something for `stop` to clean.
    writeSession(name, { ...base, runDir });
    try {
      const { session, state } = await reachVscode(r, runDir, { watchPlugins: inPlace });
      writeSession(name, { ...base, runDir, port: state.port });
      console.log(
        `on ${entry.package}/vscode/${scenario}; session ${name}; folder ${session.state.cwd}`,
      );
      console.log(await session.text());
      session.close();
    } catch (err) {
      // `--keep` leaves a window that failed to start, for a look at its logs.
      if (!options.keep) await stopSession(name);
      else console.error(`kept the run folder: ${runDir}`);
      throw err;
    }
    return;
  }

  // Desktop: launched, nothing more.
  requireDesktop();
  const r = resolveDesktop((await loadAny(entry.file)) as unknown as DesktopSet, scenario);
  const runDir = newRunDir(name);
  writeSession(name, { ...base, runDir });
  try {
    const pid = await launchDesktop(r, runDir, { draft: flags.draft, wait: false });
    writeSession(name, { ...base, runDir, pid });
    console.log(`opened ${entry.package}/desktop/${scenario} in Claude Desktop; session ${name}`);
  } catch (err) {
    await stopSession(name);
    throw err;
  }
}

// ---- attach

/** The parked session `name` and its target, for a verb. */
export async function attach(name: string): Promise<{ rec: SessionRecord; target: Target }> {
  const rec = readSession(name);
  if (!rec)
    throw new Error(
      `no session ${name}: run \`goto <package> <scenario>${name === "default" ? "" : ` --session ${name}`}\` first`,
    );
  if (terminal(rec.harness)) {
    if (!rec.daemon)
      throw new Error(`session ${name} has no terminal; \`stop\` it and \`goto\` again`);
    return {
      rec,
      target: new TerminalTarget(rec.harness, Session.attach(rec.daemon, rec.harness, rec.runDir)),
    };
  }
  if (rec.harness === "vscode")
    return { rec, target: new VscodeTarget(await VscodeSession.attach(rec.runDir)) };
  return { rec, target: new DesktopTarget() };
}

// ---- reload

/**
 * Rebuilds, then plays the scenario again. A terminal gets a fresh session parked beside the
 * current one, at the size that one has now, and only then replaces it: a start that fails leaves
 * the last good session parked. VS Code opens a new Claude tab in the same window, and may take
 * another scenario of the package. The scenario file is read as it is now.
 */
export async function reloadSession(name: string, other?: string): Promise<void> {
  const rec = readSession(name);
  if (!rec) throw new Error(`no session ${name}: run \`goto <package> <scenario>\` first`);
  if (rec.harness === "desktop")
    throw new Error("reload is not available for desktop sessions: `goto` again");
  const scenario = other ?? rec.scenario;

  if (terminal(rec.harness)) {
    if (other && other !== rec.scenario)
      throw new Error("a terminal session reloads its own scenario: `goto` another one");
    const r = resolveScenario(await loadSet(rec.file), scenario);
    for (const line of await rebuild(r)) console.log(line);
    if (rec.size) r.size = rec.size;
    const old = Session.attach(rec.daemon!, rec.harness, rec.runDir);
    const before = await old.size().catch(() => undefined);
    const runDir = newRunDir(name);
    // Two names in turn: the daemon leaves a file or two behind for every name it has served.
    const base = daemonBase(name);
    const next = rec.daemon === base ? `${base}-next` : base;
    let session: Session;
    try {
      const start = rec.inPlace ? withInPlaceReload(r, runDir) : r;
      session = await reach(start, "daemon", next, runDir);
    } catch (err) {
      keepOrRemove(runDir);
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\nreload failed; the session from before it is still parked`,
        { cause: err },
      );
    }
    if (before && (before.cols !== r.size[0] || before.rows !== r.size[1]))
      await session.resize(before.cols, before.rows);
    writeSession(name, { ...rec, runDir, daemon: daemonName(session, next) });
    await old.close();
    rmSync(rec.runDir, { recursive: true, force: true });
    const sz = await session.size();
    console.log(`reloaded ${rec.package}/${rec.harness}/${scenario} at ${sz.cols}x${sz.rows}`);
    console.log(await session.text());
    return;
  }

  const session = await replayVscode(rec.file, scenario, rec.runDir, rec.size);
  try {
    writeSession(name, { ...rec, scenario });
    console.log(`on ${rec.package}/vscode/${scenario}; folder ${session.state.cwd}`);
    console.log(await session.text());
  } finally {
    session.close();
  }
}

export async function replayVscode(file: string, scenario: string, runDir: string, size?: Size) {
  const r = resolveVscode(await loadVscodeSet(file), scenario);
  for (const line of await rebuild(r)) console.log(line);
  if (size) r.size = size;
  return reloadVscode(r, runDir);
}

// ---- stop

/** Ends session `name` and removes its run folder. Returns what it was, if anything was there. */
export async function stopSession(name: string): Promise<SessionRecord | undefined> {
  const rec = readSession(name);
  if (!rec) return undefined;
  if (terminal(rec.harness)) {
    const base = daemonBase(name);
    for (const daemon of new Set([base, `${base}-next`, rec.daemon ?? base])) {
      await tuiTest(["--session", daemon, "close"]).catch(() => undefined);
      await tuiTest(["daemon", "stop", "--session", daemon]).catch(() => undefined);
    }
    stopStub(rec.runDir);
  } else if (rec.harness === "vscode") {
    await stopVscode(rec.runDir);
  } else if (rec.pid) {
    try {
      process.kill(-rec.pid);
    } catch {
      /* gone already */
    }
  }
  rmSync(rec.runDir, { recursive: true, force: true });
  removeSession(name);
  return rec;
}

// ---- live

/** Replays the scenario and stays in the foreground until it is closed. */
export async function liveSession(entry: Entry, scenario: string, flags: Flags): Promise<void> {
  const { harness } = entry;
  if (terminal(harness)) {
    const r = resolveScenario(await loadSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    return live(r, { watch: flags.watch, inPlace: flags.inPlace });
  }
  if (harness === "vscode") {
    const r = resolveVscode(await loadVscodeSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    return liveVscode(r, flags);
  }
  if (flags.watch) throw new Error("--watch is not available for desktop");
  requireDesktop();
  const r = resolveDesktop((await loadAny(entry.file)) as unknown as DesktopSet, scenario);
  const runDir = newRunDir("desktop-live");
  try {
    await launchDesktop(r, runDir, { draft: flags.draft, wait: true });
  } finally {
    if (!options.keep) rmSync(runDir, { recursive: true, force: true });
  }
}

// ---- watch

const IN_PLACE =
  "Claude reloads the mod in place in its own time (seconds, or a minute when it reloads often); `cap` to see it";

/**
 * `goto --watch`: on each batch of saves until a signal, `reload` (in a process of its own, so the
 * scenario is read anew), which prints the screen. In-place sessions reload the code after a
 * successful build and replay only when the scenario changes.
 */
export async function watchParked(name: string, entry: Entry, scenario: string) {
  const harness = entry.harness;
  if (harness === "desktop") throw new Error("--watch is not available for desktop");
  const r = await resolveFor(harness, entry.file, scenario);
  let watching = true;
  console.log("Watching sources; Ctrl+C stops watching and leaves the session parked.");
  const watcher = watchScenario(r, harness, {
    onSave: (files) => {
      if (!readSession(name)) {
        console.log("no session is parked: `goto` again");
        return false;
      }
      console.log(`\n${new Date().toTimeString().slice(0, 8)} saved ${fileList(files)}`);
    },
    inPlaceRunDir: () => {
      const rec = readSession(name);
      return watching && rec?.harness === harness && rec.inPlace ? rec.runDir : undefined;
    },
    onBuild: (lines) => {
      for (const line of lines) console.log(line);
      console.log(harness === "pi" ? "pi reloads when idle; `cap` to see it" : IN_PLACE);
    },
    replay: async () => {
      const code = await new Promise<number | null>((resolve, reject) =>
        spawn(
          process.execPath,
          [join(import.meta.dirname, "..", "drive.ts"), "reload", "--session", name],
          { stdio: "inherit" },
        )
          .once("exit", resolve)
          .once("error", reject),
      );
      if (code !== 0) console.log("waiting for the next save");
    },
    onError: (err) => console.error(err instanceof Error ? err.message : err),
  });
  await new Promise<void>((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, resolve);
  });
  watching = false;
  watcher.close();
  console.log("stopped watching; the session is still parked (`stop` ends it)");
}
