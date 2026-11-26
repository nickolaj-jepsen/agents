/**
 * Publish a checkout's working tree as a self-contained copy.
 *
 * Reading only: git is asked what its working tree holds (`ls-files --cached --others
 * --exclude-standard`), so whatever is staged, unstaged or new is what publishes, and nothing is
 * pulled, committed, stashed or switched. A symlink must stay inside the tree and point at
 * something the copy carries; a kept link is rewritten to the copy's own end of its chain.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { UpdatesError, describeError } from "./core/errors.ts";
import type { Environment } from "./core/paths.ts";

export type Snapshot = {
  root: string;
  revision: string;
  /** Changed paths git reports, so a publication says whether it is of a dirty tree. */
  dirty: number;
  files: number;
  /** Submodules and entries deleted from the working tree: git lists them, Nix need not have them. */
  skipped: string[];
};

const MAX_BUFFER = 256 * 1024 * 1024;

function gitEnvironment(environment: Environment | undefined): NodeJS.ProcessEnv {
  if (environment === undefined) return process.env;
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

function git(checkout: string, args: string[], environment?: Environment): Buffer {
  const result = spawnSync("git", ["-C", checkout, ...args], {
    env: gitEnvironment(environment),
    maxBuffer: MAX_BUFFER,
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UpdatesError("git is not installed");
    }
    throw new UpdatesError(
      `git ${args.join(" ")} in ${checkout} failed: ${describeError(result.error)}`,
    );
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") ?? "";
    const stdout = result.stdout?.toString("utf8") ?? "";
    throw new UpdatesError(
      `git ${args.join(" ")} in ${checkout} failed: ${(stderr || stdout).trim()}`,
    );
  }
  return result.stdout ?? Buffer.alloc(0);
}

/**
 * Copy tracked files, and untracked files git does not ignore, into `destination`.
 *
 * Files are copied before symlinks: an absolute link into the checkout is rewritten to the same
 * path *inside the snapshot*, which only exists once the files are there.
 */
export function publishSnapshot(
  checkout: string,
  destination: string,
  environment?: Environment,
): Snapshot {
  const root = fs.realpathSync(checkout);
  const revision = git(checkout, ["rev-parse", "HEAD"], environment).toString("utf8").trim();
  const dirty = git(checkout, ["status", "--porcelain"], environment)
    .toString("utf8")
    .split("\n")
    .filter((line) => line.length > 0).length;
  const listing = git(
    checkout,
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    environment,
  );

  fs.mkdirSync(destination, { recursive: true });
  let files = 0;
  const links: { relative: string; source: string; target: string }[] = [];
  const skipped: string[] = [];
  for (const raw of listing.toString("utf8").split("\0")) {
    if (!raw) continue;
    const relativePath = raw;
    const source = join(checkout, relativePath);
    const target = join(destination, relativePath);
    fs.mkdirSync(dirname(target), { recursive: true });
    const stat = fs.lstatSync(source, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      links.push({ relative: relativePath, source, target });
    } else if (stat?.isFile()) {
      copyFile(source, target);
      files += 1;
    } else {
      // A submodule gitlink, or a tracked file deleted from the working tree.
      skipped.push(relativePath);
    }
  }

  for (const { relative: relativePath, source, target } of links) {
    try {
      fs.symlinkSync(snapshotLink(relativePath, source, destination, root), target);
    } catch (error) {
      if (error instanceof UpdatesError) throw error;
      throw new UpdatesError(`cannot copy the symlink ${source}: ${describeError(error)}`);
    }
  }
  files += links.length;

  return { root: destination, revision, dirty, files, skipped };
}

/** `copy2` in spirit: the mode and times a build may rely on, with the bytes. */
function copyFile(source: string, target: string): void {
  fs.copyFileSync(source, target);
  const stat = fs.statSync(source);
  fs.chmodSync(target, stat.mode & 0o7777);
  fs.utimesSync(target, stat.atime, stat.mtime);
}

export function inside(root: string, path: string): boolean {
  if (path === root) return true;
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return path.startsWith(prefix);
}

/**
 * `os.path.realpath` without strictness: follow every link the path has, including the last
 * component, and stop where the filesystem stops. A repository path may not exist yet (a plugin
 * with no package.json), and a link that dangles or escapes must still be reported by where it
 * points rather than by an ENOENT.
 */
export function realpathLoose(path: string): string {
  let current = resolve(sep);
  const pending = resolve(path).split(sep).filter(Boolean);
  let hops = 0;
  while (pending.length > 0) {
    const part = pending.shift()!;
    if (part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const candidate = join(current, part);
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (stat === undefined) return join(current, part, ...pending);
    if (!stat.isSymbolicLink()) {
      current = candidate;
      continue;
    }
    hops += 1;
    if (hops > 40) {
      throw new UpdatesError(`too many levels of symbolic links: ${path}`);
    }
    const target = fs.readlinkSync(candidate);
    const parts = target.split(sep).filter((piece) => piece.length > 0 && piece !== ".");
    if (target.startsWith(sep)) current = resolve(sep);
    for (let index = parts.length - 1; index >= 0; index -= 1) pending.unshift(parts[index]!);
  }
  return current;
}

/**
 * The link text a published snapshot may keep, or an actionable failure.
 *
 * A published tree must refer only to itself: a link into the live checkout (or anywhere else
 * outside the snapshot) would let the store copy change under a harness later, and a link to a file
 * the snapshot does not carry would only dangle.
 *
 * The text is rewritten to the snapshot's copy of where the chain *ends*. Written in place it would
 * be order-dependent — git lists `a -> b` before `b -> skills/x` — and flattening the chain also
 * removes the mutable middle: a kept `a -> b` would follow `b` wherever the checkout later moved it.
 */
export function snapshotLink(
  relativePath: string,
  source: string,
  destination: string,
  root: string,
): string {
  const link = fs.readlinkSync(source);
  const resolved = realpathLoose(source);
  if (!inside(root, resolved)) {
    throw new UpdatesError(
      `${source} is a symlink to ${link}, which resolves to ${resolved}, outside the checkout; ` +
        "point it at a tracked path inside the checkout, or drop the link, then retry",
    );
  }
  const target = join(destination, relative(root, resolved));
  if (!fs.existsSync(target) && !isSymlink(target)) {
    throw new UpdatesError(
      `${source} is a symlink to ${link}, whose target ${resolved} the snapshot does not carry ` +
        "(it is ignored by git or not committed); commit that target, then retry",
    );
  }
  return relative(dirname(join(destination, relativePath)), target);
}

function isSymlink(path: string): boolean {
  return fs.lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

/** Join under `root`, refusing a symlink that leaves it (a plugin or skill must stay inside). */
export function repositoryPath(root: string, ...parts: string[]): string {
  const candidate = join(root, ...parts);
  const realRoot = fs.realpathSync(root);
  const real = realpathLoose(candidate);
  if (real !== realRoot && !inside(realRoot, real)) {
    throw new UpdatesError(`${candidate} resolves outside ${root}`);
  }
  return candidate;
}
