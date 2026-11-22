/**
 * Hot reload for a live or parked session: which sources a scenario's screen is drawn from, a
 * watch over them that hands each batch of saves to a handler one at a time, and the rebuild that
 * carries an edit into the `dist/` folders a session loads.
 *
 * Replaying gets back to the scenario's exact screen. In place, Claude watches the built mod,
 * while pi's dev extension asks pi to reload when idle, without typing into the prompt.
 *
 * A watch owns the work its saves start: closing it stops new batches, drops the ones queued and
 * waits for the batch being handled, so a person who leaves cannot be taken over by a late replay.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { watch as chokidar } from "chokidar";
import { RELOAD_REQUEST } from "../assets/pi-reload.ts";
import { checkoutRoot, modWatchEnv, type HarnessName } from "./harness.ts";
import { e2ePackage, repoRoot } from "./packages.ts";
import type { Resolved } from "./scenario.ts";

const run = promisify(execFile);

/**
 * What an agent or a test run writes beside the sources, and what the build writes: none of it is an
 * edit, and reacting to a build's own writes would loop.
 */
const NOISE =
  /(^|\/)(node_modules|dist|__snapshots__|\.claude-plugin\/types)(\/|$)|(^|\/)\.[^/]*$|(^|\/)tsconfig\.json$|\.(spec|test)\.tsx?$|\.actual\./;
const SOURCE = /\.(tsx?|[cm]?js|json)$/;

/** True for a repo-relative path whose change can change what a session draws. */
const isSource = (rel: string) => SOURCE.test(rel) && !NOISE.test(rel);

/** What a session is built from: the package of its scenario and the apps it asks to load. */
type Buildable = { plugin: string; start: { plugins?: string[] } };

/** The built apps a scenario loads: its own, if it is an app's, and those it names. */
const appsOf = (r: Buildable) =>
  [...new Set([r.plugin, ...(r.start.plugins ?? [])])].filter((name) =>
    existsSync(join(repoRoot, "apps", name, "package.json")),
  );

/** `@agents/kit-<c>` is `lib/kits/<c>`. */
const KIT = "@agents/kit-";
const kitDir = (name: string) =>
  name.startsWith(KIT) ? join(repoRoot, "lib/kits", name.slice(KIT.length)) : undefined;

/** The kit packages a package imports, and those they do. */
function kitDeps(dir: string, seen = new Set<string>()): Set<string> {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return seen;
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string>>;
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const kit = kitDir(name);
    if (kit && existsSync(kit) && !seen.has(kit)) {
      seen.add(kit);
      kitDeps(kit, seen);
    }
  }
  return seen;
}

/**
 * The folders a scenario's screen comes from: the sources of its apps and of the kit packages they
 * import, those of the catalogue and the kit package for a kit's own scenarios, and its scenario folder.
 */
function sourceDirs(r: Buildable): string[] {
  const roots = [
    ...appsOf(r).map((p) => join(repoRoot, "apps", p)),
    ...(r.plugin.startsWith("kit-")
      ? [join(repoRoot, "lib/kits/catalog"), join(repoRoot, "lib/kits", r.plugin.slice(4))]
      : []),
  ];
  const dirs = new Set<string>();
  for (const root of roots) {
    dirs.add(root);
    for (const kit of kitDeps(root)) dirs.add(kit);
  }
  return [...[...dirs].map((dir) => join(dir, "src")), e2ePackage(r.plugin)?.e2e ?? ""].filter(
    (dir) => dir && existsSync(dir),
  );
}

/** The other agent's half of an app or of the catalogue: a pi screen does not read `claude`. */
const OTHER_HALF: Record<HarnessName, RegExp> = {
  pi: /^(apps\/[^/]+|lib\/kits\/catalog)\/src\/claude(\.|\/)/,
  claude: /^(apps\/[^/]+|lib\/kits\/catalog)\/src\/pi(\.|\/)/,
};

type WatchHarness = HarnessName | "vscode";
const SCENARIO_HARNESS = /\/e2e\/(claude|pi|vscode|desktop|site)\.scenarios\.ts$/;

/** An edit to another harness's scenario shouldn't reset this session. */
function relevant(harness: WatchHarness, files: string[]): string[] {
  const otherHalf = OTHER_HALF[harness === "pi" ? "pi" : "claude"];
  return files.filter((file) => {
    const owner = SCENARIO_HARNESS.exec(file)?.[1];
    return (!owner || owner === harness) && !otherHalf.test(file);
  });
}

/** A save touched the scenario's own files, which only a replay reads. */
const touchesScenario = (r: Buildable, files: string[]) => {
  const e2e = e2ePackage(r.plugin)?.e2e;
  return !!e2e && files.some((f) => f.startsWith(relative(checkoutRoot, e2e) + "/"));
};

const piReloadFile = (runDir: string) => join(runDir, "pi-reload-request");
const piReloadExtension = join(import.meta.dirname, "..", "assets", "pi-reload.ts");

/** Enable Claude's native watcher or install the dev-only pi reload extension. */
export function withInPlaceReload(r: Resolved, runDir: string): Resolved {
  if (r.harness === "claude")
    return { ...r, start: { ...r.start, env: { ...r.start.env, ...modWatchEnv } } };
  return {
    ...r,
    start: {
      ...r.start,
      args: [...(r.start.args ?? []), "--extension", piReloadExtension],
      env: { ...r.start.env, [RELOAD_REQUEST]: piReloadFile(runDir) },
    },
  };
}

/**
 * Builds what a session of the scenario loads, in a process of its own so it reads the sources as
 * they are now: its apps and, for a kit scenario, the catalogue. Its lines, if any.
 */
export async function rebuild(r: Buildable): Promise<string[]> {
  const dirs = [
    ...appsOf(r).map((p) => join(checkoutRoot, "apps", p)),
    ...(r.plugin.startsWith("kit-") ? [join(checkoutRoot, "lib/kits/catalog")] : []),
  ];
  const lines: string[] = [];
  for (const dir of dirs) {
    try {
      const { stdout } = await run(
        process.execPath,
        [join(checkoutRoot, "lib/tools/build/build.ts"), dir],
        { cwd: checkoutRoot },
      );
      lines.push(...stdout.split("\n").filter((l) => l.includes("Build complete")));
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message: string };
      throw new Error(`build failed: ${(e.stderr || e.stdout || e.message).trim()}`);
    }
  }
  return lines;
}

/**
 * A watch over `dirs`: `ready` once a save is noticed at all, and `close` once it has stopped
 * taking saves and the batch it was handling has settled. Await `close` before returning to the
 * person, so no replay or rebuild is left running on resources it no longer owns.
 */
export type Watch = { ready: Promise<void>; close(): Promise<void> };

export type WatchFlags = {
  /** Rebuild on saves to the code or scenario. */
  watch?: boolean;
  /** Reload plugin code in the running agent; still replay scenario edits. */
  inPlace?: boolean;
};

/**
 * Watches `dirs` (chokidar) and calls `handler` with the repo-relative sources saved, `quiet` ms
 * after the last save of a batch. One handler runs at a time; saves made meanwhile make the next batch.
 */
export function watchSources(
  dirs: string[],
  handler: (files: string[]) => Promise<void>,
  o: { quiet?: number; onError?: (err: unknown) => void } = {},
): Watch {
  const quiet = o.quiet ?? 300;
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  /** The batch being handled, which a close waits for. */
  let handling: Promise<void> | undefined;
  let closed = false;

  const flush = () => {
    timer = undefined;
    if (handling || closed || pending.size === 0) return;
    const files = [...pending].sort();
    pending.clear();
    handling = handler(files)
      .catch((err: unknown) => o.onError?.(err))
      .finally(() => {
        handling = undefined;
        // A batch queued while this one ran; a closed watch drops it instead.
        if (pending.size > 0 && !closed && !timer) timer = setTimeout(flush, quiet);
      });
  };

  const rel = (path: string) => relative(checkoutRoot, path);
  const watcher = chokidar(dirs, {
    ignoreInitial: true,
    // Folders are walked unless they are noise (node_modules, a build's output); a file must be a source.
    ignored: (path, stats) =>
      stats?.isFile()
        ? !isSource(rel(path))
        : /(^|\/)(node_modules|dist|__snapshots__)$/.test(rel(path)),
  });
  const ready = new Promise<void>((resolve) => watcher.once("ready", () => resolve()));
  const saved = (path: string) => {
    if (closed || !isSource(rel(path))) return;
    pending.add(rel(path));
    clearTimeout(timer);
    timer = setTimeout(flush, quiet);
  };
  watcher.on("add", saved).on("change", saved).on("unlink", saved);
  return {
    ready,
    async close() {
      // No save after this point starts work, and none queued behind the batch in flight does either.
      closed = true;
      clearTimeout(timer);
      pending.clear();
      await watcher.close().catch(() => undefined);
      await handling;
    },
  };
}

/** Select replay or in-place reload the same way for live and parked sessions. */
export function watchScenario(
  r: Buildable,
  harness: WatchHarness,
  o: {
    /** The currently running session, if it can reload in place. */
    inPlaceRunDir?: () => string | undefined;
    /** Return false when there is no longer a session to watch. */
    onSave?: (files: string[]) => boolean | void;
    onBuild?: (lines: string[]) => void;
    replay: () => Promise<void>;
    onError: (err: unknown) => void;
  },
): Watch {
  return watchSources(
    sourceDirs(r),
    async (saved) => {
      const files = relevant(harness, saved);
      if (files.length === 0 || o.onSave?.(files) === false) return;
      const dir = touchesScenario(r, files) ? undefined : o.inPlaceRunDir?.();
      if (!dir) return o.replay();
      const lines = await rebuild(r);
      if (o.inPlaceRunDir?.() !== dir) return;
      // Both Claude hosts watch their own built mod. pi needs an explicit request.
      if (harness === "pi") writeFileSync(piReloadFile(dir), "");
      o.onBuild?.(lines);
    },
    { onError: o.onError },
  );
}

/** `a.ts, b.ts and 3 more`, for a status line. */
export function fileList(files: string[], most = 3): string {
  const shown = files.slice(0, most).join(", ");
  return files.length > most ? `${shown} and ${files.length - most} more` : shown;
}
