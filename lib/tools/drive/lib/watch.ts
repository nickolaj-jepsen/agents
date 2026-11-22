/**
 * Hot reload for a live or parked session: which sources a scenario's screen is drawn from, a
 * watch over them that hands each batch of saves to a handler one at a time, and the rebuild that
 * carries an edit into the `dist/` folders a session loads.
 *
 * The callers start the agent over and replay the steps, the one way back to the scenario's exact
 * screen. pi does not reload an extension on save, and its `/reload` (which does read an `-e`
 * extension afresh) keeps the transcript and wants the prompt. Claude Code reloads a mod in place
 * when a file of it is written, keeping the pane and its atoms, with a `● <mod>: reloaded` row in
 * the transcript; but it waits for the folder to go quiet, longer the more often it reloads (3 s
 * to a minute, measured), so in-place is opt-in.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { watch as chokidar } from "chokidar";
import { checkoutRoot, type HarnessName } from "./harness.ts";
import { e2ePackage, repoRoot } from "./packages.ts";

const run = promisify(execFile);

/**
 * What an agent or a test run writes beside the sources, and what the build writes: none of it is an
 * edit, and reacting to a build's own writes would loop.
 */
const NOISE =
  /(^|\/)(node_modules|dist|__snapshots__|\.claude-plugin\/types)(\/|$)|(^|\/)\.[^/]*$|(^|\/)tsconfig\.json$|\.(spec|test)\.tsx?$|\.actual\./;
const SOURCE = /\.(tsx?|[cm]?js|json)$/;

/** True for a repo-relative path whose change can change what a session draws. */
export const isSource = (rel: string) => SOURCE.test(rel) && !NOISE.test(rel);

/** What a session is built from: the package of its scenario and the apps it asks to load. */
export type Buildable = { plugin: string; start: { plugins?: string[] } };

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
export function sourceDirs(r: Buildable): string[] {
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

/** The saves that can change what an agent draws. */
export const relevant = (harness: HarnessName, files: string[]) =>
  files.filter((f) => !OTHER_HALF[harness].test(f));

/** A batch of saves touched the scenario's own files, which only a fresh start reads. */
export const touchesScenario = (r: { plugin: string }, files: string[]) => {
  const e2e = e2ePackage(r.plugin)?.e2e;
  return !!e2e && files.some((f) => f.startsWith(relative(checkoutRoot, e2e) + "/"));
};

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

export type Watch = { close(): void };

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
  let running = false;
  let closed = false;

  const flush = () => {
    timer = undefined;
    if (running || closed || pending.size === 0) return;
    const files = [...pending].sort();
    pending.clear();
    running = true;
    handler(files)
      .catch((err: unknown) => o.onError?.(err))
      .finally(() => {
        running = false;
        if (pending.size > 0 && !timer) timer = setTimeout(flush, quiet);
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
  const saved = (path: string) => {
    if (closed || !isSource(rel(path))) return;
    pending.add(rel(path));
    clearTimeout(timer);
    timer = setTimeout(flush, quiet);
  };
  watcher.on("add", saved).on("change", saved).on("unlink", saved);
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      void watcher.close();
    },
  };
}

/** `a.ts, b.ts and 3 more`, for a status line. */
export function fileList(files: string[], most = 3): string {
  const shown = files.slice(0, most).join(", ");
  return files.length > most ? `${shown} and ${files.length - most} more` : shown;
}
