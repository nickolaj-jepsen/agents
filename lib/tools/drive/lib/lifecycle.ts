/**
 * The life of a named session: `goto` parks one on a scenario, `attach` finds it again for a verb,
 * `reload` replays it after an edit, `stop` ends it, and `live` runs one in the foreground. What
 * differs per harness is here; what a verb does once it has a `Target` is in `target.ts`.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveDesktop, type DesktopSet } from "./desktop-scenario.ts";
import { launchDesktop, requireDesktop } from "./desktop.ts";
import { loadAny, type Entry, type Kind } from "./find.ts";
import { checkoutRoot } from "./harness.ts";
import { live } from "./live.ts";
import { options } from "./options.ts";
import { loadSet, reach, resolveScenario } from "./scenario.ts";
import {
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
import {
  fileList,
  rebuild,
  relevant,
  sourceDirs,
  touchesScenario,
  watchSources,
  type Buildable,
} from "./watch.ts";
import type { Size } from "./session.ts";

export type Flags = {
  size?: Size;
  watch?: boolean;
  inPlace?: boolean;
  /** Desktop: a prefilled draft for a real model, not the seeded session. */
  draft?: boolean;
};

/** The daemon's session name for a session of ours; a reload starts `-next` beside it. */
const daemonBase = (name: string) => `d-${name}`;

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
  const base = { harness, package: entry.package, scenario, file: entry.file, size: flags.size };

  if (terminal(harness)) {
    const r = resolveScenario(await loadSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    const runDir = newRunDir(name);
    const daemon = daemonBase(name);
    const session = await reach(r, "daemon", daemon, runDir).catch((err: unknown) => {
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
      const { session, state } = await reachVscode(r, runDir);
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
      session = await reach(r, "daemon", next, runDir);
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

  const set = await loadVscodeSet(rec.file);
  if (!set.scenarios[scenario])
    throw new Error(
      `no scenario ${rec.package} ${scenario}; has ${Object.keys(set.scenarios).join(", ")}`,
    );
  const r = resolveVscode(set, scenario);
  for (const line of await rebuild(r)) console.log(line);
  if (rec.size) r.size = rec.size;
  const session = await reloadVscode(r, rec.runDir);
  writeSession(name, { ...rec, scenario });
  console.log(`on ${rec.package}/vscode/${scenario}; folder ${session.state.cwd}`);
  console.log(await session.text());
  session.close();
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
  if (flags.watch)
    throw new Error(
      `--watch is not available for live ${harness}: \`goto --watch\` reloads a parked one`,
    );
  if (harness === "vscode") {
    const r = resolveVscode(await loadVscodeSet(entry.file), scenario);
    if (flags.size) r.size = flags.size;
    return liveVscode(r);
  }
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
 * scenario is read anew), which prints the screen. With `inPlace`, a Claude session gets the rebuild
 * alone and reloads the mod itself, unless the scenario changed.
 */
export async function watchParked(name: string, entry: Entry, scenario: string, inPlace: boolean) {
  const r = (await resolveFor(entry.harness, entry.file, scenario)) as Buildable;
  const harness = entry.harness === "pi" ? "pi" : "claude";
  const dirs = sourceDirs(r);
  console.log(
    `watching ${dirs.map((d) => relative(checkoutRoot, d)).join(", ")}; Ctrl+C stops watching and leaves the session parked`,
  );
  const watcher = watchSources(
    dirs,
    async (saved) => {
      const files = relevant(harness, saved);
      if (files.length === 0) return;
      console.log(`\n${new Date().toTimeString().slice(0, 8)} saved ${fileList(files)}`);
      if (!readSession(name)) return void console.log("no session is parked: `goto` again");
      if (entry.harness === "claude" && inPlace && !touchesScenario(r, files)) {
        for (const line of await rebuild(r)) console.log(line);
        console.log(IN_PLACE);
        return;
      }
      const code = await new Promise<number | null>((resolve) =>
        spawn(
          process.execPath,
          [join(import.meta.dirname, "..", "drive.ts"), "reload", "--session", name],
          { stdio: "inherit" },
        ).once("exit", resolve),
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
