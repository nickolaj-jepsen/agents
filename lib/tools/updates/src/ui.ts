/**
 * Deploy a Herdr UI artifact into the writable directory the app loads it from.
 *
 * Herdr reads its UI from a writable config directory (`$XDG_CONFIG_HOME/herdr-app`), not from a
 * store path: the app writes editor metadata beside a mod, and its layout editor saves layouts. So
 * the artifact cannot be linked there, as a plugin's store path can; its files are deployed as real
 * files.
 *
 * The design is one sentence: **a deploy rewrites only the files that differ, and prunes only the
 * files it wrote last time.** Herdr watches those files and reloads them itself, so an unchanged
 * switch must not touch anything (a content-identical rewrite would wake every watcher for
 * nothing), and a file this tool never wrote — Herdr's `shared.json`, the mods home-manager links,
 * anything the person added — must survive both a deploy and a prune.
 *
 * Ownership lives beside the publication state, not in the config dir:
 * `$XDG_STATE_HOME/agents-updates/ui/<name>.json` records the source, the destination root and the
 * relative paths written. A record made for a different destination root is never used to prune in
 * this one, so pointing the deployer somewhere else cannot delete files there.
 *
 * Order matters to a watcher: helpers before entry points (`main.js`, `mod.json`), so a mod is
 * never seen with an entry point that imports a helper the tree does not have yet, and every mod
 * before the layouts. Each file is replaced by an atomic rename from a scratch directory inside the
 * destination, so no reader sees a half-written file; a failure rolls back what this run changed,
 * through the same kind of rename, and leaves the ownership record alone.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative as relativePath, sep } from "node:path";
import { UpdatesError } from "./core/errors.ts";
import { readJsonFile, writeJsonAtomic } from "./core/json.ts";
import type { Environment } from "./core/paths.ts";
import { inside, realpathLoose } from "./snapshot.ts";

export class DeployError extends UpdatesError {
  override name = "DeployError";
}

/** The artifact's folders, and the only paths this tool may write or prune. */
export const MANAGED_TOPS = ["mods", "layouts"] as const;

/** The files a mod is loaded through. Deployed after its helpers. */
export const ENTRIES = ["main.js", "mod.json"] as const;

/** Where a target's files belong, relative to XDG_CONFIG_HOME. Herdr's own config directory. */
export const UI_TARGETS: Record<string, string> = { "herdr-ui": "herdr-app" };

/** The ownership records, under the state directory beside `current.json`. */
export const RECORD_DIR = "ui";

/** Scratch files, inside the destination so a rename stays on one filesystem. */
export const SCRATCH = ".agents-deploy";

const MODE = 0o644;

export type DeployConsole = { say(message?: string): void; warn(message: string): void };

/** The seams the specs use to fail a rename, a record write or a prune. */
export type DeployIo = {
  replace?: (from: string, to: string) => void;
  unlink?: (path: string) => void;
  writeFile?: (path: string, bytes: Buffer) => void;
  saveRecord?: (path: string, payload: OwnershipRecord) => void;
  removeEmpty?: (root: string, directory: string) => void;
  scratchFile?: (
    directory: string,
    prefix: string,
  ) => { path: string; write: (bytes: Buffer) => void };
};

export type OwnershipRecord = {
  name: string;
  source: string;
  destination: string;
  files: string[];
};

export type Skipped = [relative: string, reason: string];

export class DeployResult {
  readonly name: string;
  readonly source: string;
  readonly destination: string;
  readonly written: string[] = [];
  readonly pruned: string[] = [];
  readonly skipped: Skipped[] = [];
  unchanged = 0;
  dryRun = false;

  constructor(name: string, source: string, destination: string) {
    this.name = name;
    this.source = source;
    this.destination = destination;
  }

  get changed(): boolean {
    return this.written.length > 0 || this.pruned.length > 0;
  }
}

// --------------------------------------------------------------------------------------------
// Where a target goes

export function configHome(env: Environment): string {
  return env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
}

/**
 * The directory `name` is deployed into. Herdr's own config dir for the targets this package knows,
 * so home-manager's `herdr-app` entries and this tool write the same tree; `AGENTS_UI_DIR` for
 * anything else (a test, or a second window whose config lives elsewhere).
 */
export function destination(name: string, env: Environment): string {
  const override = env.AGENTS_UI_DIR;
  if (override) return override;
  const folder = UI_TARGETS[name];
  if (folder === undefined) {
    throw new DeployError(
      `no deployment directory is known for ${JSON.stringify(name)} ` +
        `(known: ${Object.keys(UI_TARGETS).sort().join(", ")}); set AGENTS_UI_DIR to say where it goes`,
    );
  }
  return join(configHome(env), folder);
}

export const recordPath = (state: string, name: string): string =>
  join(state, RECORD_DIR, `${name}.json`);

// --------------------------------------------------------------------------------------------
// Paths

/** `relative` as a deployable path, or a refusal. */
export function safeRelative(relative: string): string {
  const text = String(relative);
  if (!text || text.includes("\0") || text.startsWith("/") || isAbsolute(text)) {
    throw new DeployError(
      `${JSON.stringify(text)} is not a relative path inside the artifact's ${MANAGED_TOPS.join(" and ")}`,
    );
  }
  const parts = text.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new DeployError(`${JSON.stringify(text)} is not a plain relative path`);
  }
  if (parts.length < 2 || !(MANAGED_TOPS as readonly string[]).includes(parts[0]!)) {
    throw new DeployError(
      `${JSON.stringify(text)} is outside ${MANAGED_TOPS.join(" and ")}: the artifact holds ` +
        "Herdr's runtime UI and nothing else, so it is not deployed",
    );
  }
  return text;
}

/** Helpers, then entry points, then layouts: the order a watcher should see them in. */
export function orderKey(relative: string): [number, string] {
  const parts = relative.split("/");
  const last = parts[parts.length - 1]!;
  if (parts[0] === "mods") {
    return [(ENTRIES as readonly string[]).includes(last) ? 1 : 0, relative];
  }
  return [2, relative];
}

function compareOrder(left: string, right: string): number {
  const a = orderKey(left);
  const b = orderKey(right);
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
}

/**
 * Every file of `source`, as ordered relative paths. A symlink is followed to the file it names,
 * and refused when it resolves outside the artifact: a deployed copy that pointed back into the
 * store or the checkout could change under the app later, and the app must be able to edit what it
 * reads.
 */
export function collect(source: string): string[] {
  const real = fs.realpathSync(source);
  const found: string[] = [];
  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = fs.readdirSync(directory).sort();
    } catch (error) {
      throw new DeployError(`cannot read ${directory}: ${messageOf(error)}`);
    }
    for (const name of entries) {
      const entryPath = join(directory, name);
      const relative = relativePath(source, entryPath).split(sep).join("/");
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        const resolved = realpathLoose(entryPath);
        if (!inside(real, resolved)) {
          throw new DeployError(
            `${entryPath} is a symlink to ${fs.readlinkSync(entryPath)}, which resolves to ${resolved}, ` +
              `outside ${source}; point it at a file in the artifact`,
          );
        }
        if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
          throw new DeployError(`${entryPath} is a symlink to ${resolved}, which is not a file`);
        }
        found.push(relative);
      } else if (stat.isDirectory()) {
        walk(entryPath);
      } else if (stat.isFile()) {
        found.push(relative);
      } else {
        throw new DeployError(`${entryPath} is neither a file nor a directory`);
      }
    }
  };
  walk(source);
  return found.sort(compareOrder);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when the deployed file already holds exactly what the artifact holds. */
export function sameContent(source: string, target: string): boolean {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat === undefined || stat.isSymbolicLink() || !stat.isFile()) return false;
  try {
    if (fs.statSync(source).size !== stat.size) return false;
    return fs.readFileSync(source).equals(fs.readFileSync(target));
  } catch {
    return false;
  }
}

/**
 * A symlinked directory on the way to `relative`, or null. Refused when it leaves the root (writing
 * through it would escape); returned when it stays inside, because then it is another owner's tree —
 * home-manager's link, typically — and a file there is reported rather than written.
 */
function symlinkedParent(root: string, relative: string): string | null {
  let current = root;
  const parts = relative.split("/");
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      const resolved = realpathLoose(current);
      if (!inside(root, resolved)) {
        throw new DeployError(
          `${current} is a symlink to ${fs.readlinkSync(current)}, outside ${root}; ` +
            "refusing to write through it",
        );
      }
      return current;
    }
  }
  return null;
}

/** Drop the directories a prune emptied, never the artifact's two top folders. */
export function removeEmpty(root: string, directory: string): void {
  const stop = new Set([root, ...MANAGED_TOPS.map((top) => join(root, top))]);
  let current = directory;
  while (!stop.has(current) && inside(root, current)) {
    try {
      fs.rmdirSync(current);
    } catch {
      return; // not empty: someone else's files live here
    }
    current = dirname(current);
  }
}

// --------------------------------------------------------------------------------------------
// The ownership record

function emptyRecord(): OwnershipRecord {
  return { name: "", source: "", destination: "", files: [] };
}

/**
 * The record of what this tool wrote last time; an absent one claims nothing. Unreadable JSON is
 * reported and claims nothing either: without a record nothing is pruned and nothing is treated as
 * ours, and the next successful deploy overwrites it.
 */
export function loadRecord(path: string, console?: DeployConsole): OwnershipRecord {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    if (!fs.existsSync(path)) return emptyRecord();
    console?.warn(
      `agents: the ownership record ${path} is unreadable (${messageOf(error)}); ` +
        "no deployed file will be pruned this run",
    );
    return emptyRecord();
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyRecord();
  const entry = raw as Record<string, unknown>;
  const files = Array.isArray(entry.files)
    ? entry.files.filter((f): f is string => typeof f === "string")
    : [];
  return {
    name: typeof entry.name === "string" ? entry.name : "",
    source: typeof entry.source === "string" ? entry.source : "",
    destination: typeof entry.destination === "string" ? entry.destination : "",
    files,
  };
}

export function saveRecord(
  path: string,
  payload: OwnershipRecord,
  rename?: (from: string, to: string) => void,
): void {
  writeJsonAtomic(path, payload, rename === undefined ? {} : { rename });
}

// --------------------------------------------------------------------------------------------
// The deploy

type Changes = {
  created: string[];
  replaced: [string, Buffer][];
  pruned: [string, Buffer][];
};

type Runtime = Required<
  Pick<DeployIo, "replace" | "unlink" | "writeFile" | "saveRecord" | "removeEmpty">
> & {
  scratchFile: NonNullable<DeployIo["scratchFile"]>;
};

function runtime(io: DeployIo): Runtime {
  return {
    replace: io.replace ?? fs.renameSync,
    unlink: io.unlink ?? ((path) => fs.unlinkSync(path)),
    writeFile: io.writeFile ?? ((path, bytes) => fs.writeFileSync(path, bytes)),
    saveRecord: io.saveRecord ?? ((path, payload) => saveRecord(path, payload, io.replace)),
    removeEmpty: io.removeEmpty ?? removeEmpty,
    scratchFile: io.scratchFile ?? scratchFile,
  };
}

/** A temporary file in `directory`, created 0600 and written whole before it is renamed. */
function scratchFile(
  directory: string,
  prefix: string,
): { path: string; write: (bytes: Buffer) => void } {
  fs.mkdirSync(directory, { recursive: true });
  for (;;) {
    const path = join(directory, `${prefix}${randomUUID().slice(0, 8)}`);
    try {
      const descriptor = fs.openSync(
        path,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
      );
      return {
        path,
        write: (bytes: Buffer) => {
          try {
            fs.writeFileSync(descriptor, bytes);
            fs.fsyncSync(descriptor);
          } finally {
            fs.closeSync(descriptor);
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/**
 * What `target` held as a regular file, or undefined when there is nothing to restore. A symlink is
 * deliberately not read: this tool never writes one, so a link at a deployed path belongs to
 * home-manager or to the person, and undoing a deploy must never replace it with the bytes of
 * whatever it pointed at.
 */
export function previousRegularBytes(target: string): Buffer | undefined {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat === undefined || stat.isSymbolicLink() || !stat.isFile()) return undefined;
  try {
    return fs.readFileSync(target);
  } catch (error) {
    throw new DeployError(`cannot read ${target}: ${messageOf(error)}`);
  }
}

/**
 * Put `previous` back at `target` the way a forward write goes in: via a rename. A truncating write
 * here would expose a half-written file to the app's watcher for as long as it takes to finish — the
 * one thing a rollback of a watched tree must not do. Falls back to a plain write only when no
 * scratch file can be made, and says so.
 */
function restore(target: string, previous: Buffer, console: DeployConsole, io: Runtime): void {
  try {
    fs.mkdirSync(dirname(target), { recursive: true });
    const temporary = io.scratchFile(dirname(target), `.${basename(target)}.restore.`);
    try {
      temporary.write(previous);
      fs.chmodSync(temporary.path, MODE);
      io.replace(temporary.path, target);
    } catch (error) {
      try {
        fs.unlinkSync(temporary.path);
      } catch {
        // The failure may have happened before the temporary existed.
      }
      throw error;
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/^E[A-Z0-9]+$/.test((error as NodeJS.ErrnoException).code ?? "")
    ) {
      throw error;
    }
    console.warn(
      `agents: ${target} could not be restored atomically (${messageOf(error)}); ` +
        "writing it in place",
    );
    io.writeFile(target, previous);
  }
}

/** Undo this run's writes, so a failed deploy leaves the tree it found. */
function rollback(changes: Changes, console: DeployConsole, io: Runtime): void {
  const failures: string[] = [];
  for (const [target, previous] of changes.pruned) {
    try {
      restore(target, previous, console, io);
    } catch (error) {
      failures.push(`${target}: ${messageOf(error)}`);
    }
  }
  for (const [target, previous] of changes.replaced) {
    try {
      restore(target, previous, console, io);
    } catch (error) {
      failures.push(`${target}: ${messageOf(error)}`);
    }
  }
  for (const target of changes.created) {
    try {
      io.unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        failures.push(`${target}: ${messageOf(error)}`);
      }
    }
  }
  if (failures.length > 0) {
    console.warn(`agents: the deploy failed and could not be fully undone: ${failures.join("; ")}`);
  }
}

function writeFile(
  source: string,
  target: string,
  scratch: string,
  changes: Changes,
  io: Runtime,
): void {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    // The caller skips a symlink before writing; this is the tripwire for a new caller that does
    // not, so a link is never replaced and later "restored" as a file.
    throw new DeployError(
      `${target} is a symlink this tool does not manage (${fs.readlinkSync(target)})`,
    );
  }
  const previous = stat === undefined ? undefined : previousRegularBytes(target);
  if (previous === undefined) changes.created.push(target);
  else changes.replaced.push([target, previous]);
  const temporary = io.scratchFile(scratch, "deploy-");
  try {
    temporary.write(fs.readFileSync(source));
    fs.chmodSync(temporary.path, MODE);
    io.replace(temporary.path, target);
  } catch (error) {
    try {
      fs.unlinkSync(temporary.path);
    } catch {
      // The failure may have happened before the temporary existed.
    }
    throw error;
  }
}

/** Deploy `source` into `target`, changing only what differs, and record what is ours. */
export function deploy(
  name: string,
  source: string,
  target: string,
  state: string,
  console: DeployConsole,
  dryRun = false,
  io: DeployIo = {},
): DeployResult {
  const runtimeIo = runtime(io);
  source = realpathLoose(source);
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    throw new DeployError(`the ${name} artifact ${source} is not a directory`);
  }
  const files = collect(source).map(safeRelative);
  if (files.length === 0) {
    throw new DeployError(
      `${source} holds no ${MANAGED_TOPS.join(" or ")} files: it is not a Herdr UI artifact`,
    );
  }

  target = realpathLoose(target);
  const targetStat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (targetStat !== undefined && !targetStat.isDirectory()) {
    throw new DeployError(`${target} is not a directory`);
  }

  const recordFile = recordPath(state, name);
  const record = loadRecord(recordFile, console);
  let previous = [...record.files];
  if (record.destination && record.destination !== target) {
    // The record describes another tree: nothing in this one is ours to prune, and claiming the old
    // paths would let a later run in the old tree delete files it still needs.
    previous = [];
  }

  const result = new DeployResult(name, source, target);
  result.dryRun = dryRun;
  const wanted = new Set(files);
  const changes: Changes = { created: [], replaced: [], pruned: [] };
  const scratch = join(target, SCRATCH);
  try {
    for (const relative of files) {
      const path = join(target, relative);
      const blocker = symlinkedParent(target, relative);
      if (blocker !== null) {
        result.skipped.push([relative, `${blocker} is a symlink this tool does not manage`]);
        continue;
      }
      const stat = fs.lstatSync(path, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink()) {
        // Never replaced, whatever the record says: this tool writes real files, so a link at a
        // deployed path was put there by someone else — home-manager, or the person.
        result.skipped.push([
          relative,
          `it is a symlink this tool does not manage (${fs.readlinkSync(path)})`,
        ]);
        continue;
      }
      if (stat?.isDirectory()) {
        throw new DeployError(`${path} is a directory; the artifact deploys a file there`);
      }
      if (sameContent(join(source, relative), path)) {
        result.unchanged += 1;
        continue;
      }
      result.written.push(relative);
      if (dryRun) continue;
      fs.mkdirSync(dirname(path), { recursive: true });
      writeFile(join(source, relative), path, scratch, changes, runtimeIo);
    }

    prune(target, previous, wanted, result, changes, dryRun, runtimeIo);

    // The record is the ledger of what may be pruned later, so it is part of the same transaction: a
    // deploy that cannot record itself is undone, and the tree and the record never disagree.
    if (!dryRun) {
      const leftAlone = new Set(result.skipped.map(([relative]) => relative));
      runtimeIo.saveRecord(recordFile, {
        name,
        source,
        destination: target,
        files: files.filter((relative) => !leftAlone.has(relative)).sort(),
      });
    }
  } catch (error) {
    if (!dryRun) rollback(changes, console, runtimeIo);
    throw error;
  } finally {
    if (!dryRun) {
      try {
        fs.rmdirSync(scratch); // only when this run left it empty
      } catch {
        // A scratch directory with something in it is not this run's to remove.
      }
    }
  }
  return result;
}

/** Remove the files this tool wrote before and the artifact no longer has. */
function prune(
  target: string,
  previous: readonly string[],
  wanted: ReadonlySet<string>,
  result: DeployResult,
  changes: Changes,
  dryRun: boolean,
  io: Runtime,
): void {
  const doomed = [...new Set(previous.filter((relative) => !wanted.has(relative)))].sort((a, b) => {
    const depth = b.split("/").length - a.split("/").length;
    if (depth !== 0) return depth;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  for (const relative of doomed) {
    try {
      safeRelative(relative);
    } catch {
      // A record naming something outside the artifact's folders (hand-edited, or from an older
      // layout) is never acted on.
      continue;
    }
    if (symlinkedParent(target, relative) !== null) {
      result.skipped.push([relative, "its directory is a symlink this tool does not manage"]);
      continue;
    }
    const path = join(target, relative);
    const stat = fs.lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      result.skipped.push([
        relative,
        `it is now a symlink this tool does not manage (${fs.readlinkSync(path)})`,
      ]);
      continue;
    }
    if (!stat?.isFile()) continue; // already gone, or replaced by a directory
    result.pruned.push(relative);
    if (dryRun) continue;
    changes.pruned.push([path, previousRegularBytes(path) ?? Buffer.alloc(0)]);
    try {
      io.unlink(path);
    } catch (error) {
      throw new DeployError(`cannot remove ${path}: ${messageOf(error)}`);
    }
    io.removeEmpty(target, dirname(path));
  }
}
