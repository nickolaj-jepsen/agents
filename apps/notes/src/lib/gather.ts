/**
 * What both halves do over a `Host`: link the checkout to its store, walk the store and the
 * harness's memory, read a note, and hand one to an app. Pure: Claude Code's host is the
 * engine, pi's is node, and the commands and the words said are the same in both.
 */
import { DETACH, type Platform, probeArgv, readConfig, readProbe } from "@agents/launch/apps.ts";
import { clean } from "./clean.ts";
import { handOff, tooLarge, type Way } from "./hand.ts";
import type { Body, Place } from "./screen.ts";
import { claudeMemoryDir, memoryGroup, shelve, type Group, type Note } from "./shelf.ts";
import { ensureArgv, hasStore, LINK, noticeOf, readEnsure, type Ensured } from "./store.ts";
import { walk, type Lister, type WalkLimits } from "./walk.ts";

/** A command run to its end. */
export type Ran = { exitCode: number; stdout: string };

/** What a harness gives. */
export type Host = {
  /** Runs a command to its end; nothing when it could not start or ran out of time. */
  run(argv: string[], o?: { cwd?: string; timeoutMs?: number }): Promise<Ran | undefined>;
  /** Lists a folder, links not followed. */
  list: Lister;
  /** Where a path lands, every link followed; nothing when it leads nowhere. */
  realPath(path: string): Promise<string | undefined>;
  /** A file's size in bytes; nothing when there is no file. */
  size(path: string): Promise<number | undefined>;
  read(path: string): Promise<string>;
  /** `open.json`'s text, when there is one, and the platform its apps are for. */
  config(): Promise<{ text: string | undefined; platform: Platform }>;
};

/**
 * How long the link script may run: well over the few seconds it waits on a store another session
 * holds, so that wait ends as `busy` (which says so) and not as a run that timed out.
 */
export const ENSURE_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 3000;
/** A memory folder is flat: a few levels and a few hundred files are all it holds. */
const MEMORY_LIMITS: WalkLimits = { depth: 2, files: 500 };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Names the store of the repository `cwd` is in and links the checkout to it; never throws.
 * @param stores The folder every store is in (`storeRoot`); nothing when no home is known.
 */
export async function ensureAt(
  host: Host,
  cwd: string,
  stores: string | undefined,
): Promise<Ensured> {
  if (!stores) return { state: "failed", detail: "neither XDG_DATA_HOME nor HOME is set" };
  const ran = await host
    .run(ensureArgv(cwd, stores), { timeoutMs: ENSURE_TIMEOUT_MS })
    .catch(() => undefined);
  if (!ran) return { state: "failed", detail: "the script did not run" };
  return readEnsure(ran.stdout);
}

/** Where the folder stands, for what the screen says. */
export const placeOf = (e: Ensured): Place =>
  e.state === "not-git" ? "outside" : hasStore(e) ? "store" : "none";

/**
 * What to tell the person once about a link that is not simply there, ready to draw: its words
 * name paths a repository chose, so they have no control character.
 */
export const noticeText = (e: Ensured): string | undefined => {
  const text = noticeOf(e);
  return text === undefined ? undefined : clean(text);
};

/**
 * What the list says about the link over its rows: the link's notice, or that another session
 * held the store too long to wait for.
 */
export const linkNotice = (e: Ensured): string | undefined =>
  noticeText(e) ??
  (e.state === "busy"
    ? "Another session is setting up this repository's store. Open /notes again in a moment."
    : undefined);

/** Whether a link is worth asking about again later: another session held it, or it failed. */
export const isSettled = (e: Ensured) => e.state !== "busy" && e.state !== "failed";

/** How long a folder whose link failed, was busy or timed out is left alone. */
export const BACKOFF_MS = 30_000;

/** What an ask for a link brings: how to make one, the time, and whether to ask at once. */
export type LinkAsk = {
  /** Makes the link; it runs once for each ask that is not answered from what is known. */
  ensure: (cwd: string) => Promise<Ensured>;
  /** The time in ms, which the back-off is told by. */
  clock: () => number | Promise<number>;
  /** The person opened /notes: ask now, back-off or not. */
  fresh?: boolean;
};

/** The links of the folders a session ran in. */
export type Links = {
  /**
   * The folder's link. One that is settled is made once. One that failed, was busy or timed out
   * is not asked about again for `BACKOFF_MS`, so a stuck store cannot stall every hook.
   */
  get(cwd: string, ask: LinkAsk): Promise<Ensured>;
};

type Linked = { ensured: Ensured; until: number };

/** The links of a session, shared by both harnesses so they back off the same way. */
export function createLinks(): Links {
  const entries = new Map<string, Promise<Linked>>();
  return {
    get(cwd, { ensure, clock, fresh = false }) {
      const prior = entries.get(cwd);
      // Chained behind the folder's last ask: two asks together are one run.
      const next = (async (): Promise<Linked> => {
        const last = await prior?.catch(() => undefined);
        if (last) {
          if (isSettled(last.ensured)) return last;
          if (!fresh && (await clock()) < last.until) return last;
        }
        const ensured = await ensure(cwd).catch((): Ensured => ({
          state: "failed",
          detail: "the script did not run",
        }));
        return { ensured, until: isSettled(ensured) ? 0 : (await clock()) + BACKOFF_MS };
      })();
      entries.set(cwd, next);
      return next.then((linked) => linked.ensured);
    },
  };
}

/**
 * The folder the list walks: where the checkout's `.agents/store` lands, links followed. That
 * is the store itself when it is linked, and the folder an agent writes to when it is not.
 */
export async function shelfOf(host: Host, e: Ensured): Promise<string | undefined> {
  if (!hasStore(e) || !e.root) return undefined;
  return host.realPath(`${e.root}/${LINK}`).catch(() => undefined);
}

/**
 * Claude Code's memory folder for the checkout: the `autoMemoryDirectory` setting when it
 * is an absolute path or starts with `~/` (the home), else the one named after the main checkout
 * under the configuration directory: a relative path or a bare `~` counts as unset, as it does
 * for Claude Code. Nothing outside git, where there is no main checkout.
 */
export function memoryDirOf(o: {
  setting: unknown;
  configDir: string | undefined;
  home: string | undefined;
  main: string | undefined;
}): string | undefined {
  const dir = typeof o.setting === "string" ? o.setting.trim() : "";
  if (dir.startsWith("/")) return dir;
  if (dir.startsWith("~/") && o.home) return `${o.home}${dir.slice(1)}`;
  const config = o.configDir || (o.home ? `${o.home}/.claude` : undefined);
  return config && o.main ? claudeMemoryDir(config, o.main) : undefined;
}

/**
 * The groups the list shows: the store's folders, then the harness's memory when it saved any.
 * @param memoryDir Where the harness keeps its memory of the project; none for pi.
 */
export async function loadGroups(host: Host, e: Ensured, memoryDir?: string): Promise<Group[]> {
  const dir = await shelfOf(host, e);
  const groups = dir ? shelve(dir, await walk(host.list, dir)) : [];
  if (memoryDir) {
    const memory = memoryGroup(memoryDir, await walk(host.list, memoryDir, MEMORY_LIMITS));
    if (memory) groups.push(memory);
  }
  return groups;
}

/** A note's text for the reader, or why it is not read here. */
export async function readBody(host: Host, note: Note): Promise<Body> {
  const bytes = await host.size(note.file).catch(() => undefined);
  if (bytes === undefined) return { problem: "This note is no longer in the store." };
  const big = tooLarge(bytes);
  if (big) return { problem: big };
  try {
    return { text: clean(await host.read(note.file)) };
  } catch (error) {
    return { problem: clean(`Couldn't read this note: ${message(error)}`) };
  }
}

/** How a hand-off went: the app it went to, or why none took it. */
export type Handing = { app: string } | { problem: string };

/**
 * Hands a note to the first installed app that takes a file, or an HTML note to the first that
 * takes a link, from the person's `open.json` over the built-in table, and starts it detached.
 */
export async function handNote(host: Host, note: Note, way: Way): Promise<Handing> {
  const { text, platform } = await host.config();
  const config = readConfig(text, platform);
  const probe = await host.run(probeArgv(config.apps), { timeoutMs: PROBE_TIMEOUT_MS });
  const handed = handOff(config.apps, readProbe(probe?.stdout ?? ""), note.file, way);
  if ("problem" in handed) return { problem: clean(handed.problem) };
  // Detached: a run that waits would wait for a graphical app's output to close.
  const ran = await host
    .run([...DETACH, ...handed.argv], { cwd: handed.cwd, timeoutMs: PROBE_TIMEOUT_MS })
    .catch(() => undefined);
  return ran?.exitCode === 0
    ? { app: handed.label }
    : { problem: clean(`Couldn't start ${handed.label} (${handed.argv[0]}).`) };
}
