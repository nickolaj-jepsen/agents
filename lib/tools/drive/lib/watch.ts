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
import { existsSync, readdirSync, watch, type FSWatcher } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { checkoutRoot, type HarnessName } from "./harness.ts";
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
export const isSource = (rel: string) => SOURCE.test(rel) && !NOISE.test(rel);

/** The built apps a scenario loads: its own, if it is an app's, and those it names. */
const appsOf = (r: Resolved) =>
  [...new Set([r.plugin, ...(r.start.plugins ?? [])])].filter((name) =>
    existsSync(join(repoRoot, "apps", name, "package.json")),
  );

/** The folders a scenario's screen comes from: its apps' sources, the kit's and its own scenario folder. */
export function sourceDirs(r: Resolved): string[] {
  const kits = existsSync(join(repoRoot, "lib/kits"))
    ? readdirSync(join(repoRoot, "lib/kits")).map((c) => join(repoRoot, "lib/kits", c, "src"))
    : [];
  return [
    ...appsOf(r).map((p) => join(checkoutRoot, "apps", p, "src")),
    ...kits,
    e2ePackage(r.plugin)?.e2e ?? "",
  ].filter((dir) => dir && existsSync(dir));
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
export const touchesScenario = (r: Resolved, files: string[]) => {
  const e2e = e2ePackage(r.plugin)?.e2e;
  return !!e2e && files.some((f) => f.startsWith(relative(checkoutRoot, e2e) + "/"));
};

/**
 * Builds what a session of the scenario loads, in a process of its own so it reads the sources as
 * they are now: its apps and, for a kit scenario, the catalogue. Its lines, if any.
 */
export async function rebuild(r: Resolved): Promise<string[]> {
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
 * Watches `dirs` and calls `handler` with the repo-relative sources saved, `quiet` ms after the
 * last save of a batch. One handler runs at a time; saves made meanwhile make the next batch.
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

  const watchers: FSWatcher[] = dirs.map((dir) =>
    watch(dir, { recursive: true }, (_event, name) => {
      if (closed || !name) return;
      const rel = relative(checkoutRoot, join(dir, name.toString()));
      if (!isSource(rel)) return;
      pending.add(rel);
      clearTimeout(timer);
      timer = setTimeout(flush, quiet);
    }),
  );
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}

/** `a.ts, b.ts and 3 more`, for a status line. */
export function fileList(files: string[], most = 3): string {
  const shown = files.slice(0, most).join(", ");
  return files.length > most ? `${shown} and ${files.length - most} more` : shown;
}
