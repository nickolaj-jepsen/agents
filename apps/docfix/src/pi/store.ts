/**
 * Where a checkout's suggestions live and the file IO on them:
 * `<repo>/.agents/store/docfix/`, shared by every worktree of the repo when the notes plugin links
 * the store, so a gap one worktree hit is in the next one's queue too.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileName, parse, serialize, STORE_DIR, type Suggestion } from "../lib/docfix.ts";

const run = promisify(execFile);

const git = async (cwd: string, args: string[]) => {
  try {
    const { stdout } = await run("git", args, { cwd, timeout: 10_000 });
    return { ok: true, out: stdout.trim() };
  } catch {
    return { ok: false, out: "" };
  }
};

/** The checkout's top level, or undefined outside git. */
export const repoRoot = async (cwd: string) => {
  const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return top.ok && top.out ? top.out : undefined;
};

export const isTracked = async (root: string, target: string) =>
  (await git(root, ["ls-files", "--error-unmatch", "--", target])).ok;

/** Whether the checkout has a store folder. */
export const hasStore = (root: string) => existsSync(join(root, ".agents", "store"));

/** The suggestions folder; `make` creates it when it is missing, undefined when that fails. */
export async function storeDir(root: string, make = true): Promise<string | undefined> {
  const dir = join(root, ".agents", "store", STORE_DIR);
  if (make && !existsSync(dir)) {
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      return undefined;
    }
  }
  return dir;
}

export async function loadAll(dir: string): Promise<Suggestion[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const loaded = await Promise.all(
    names
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => parse(await readFile(join(dir, name), "utf8").catch(() => ""))),
  );
  return loaded.filter((s): s is Suggestion => s !== null);
}

export async function save(dir: string, suggestion: Suggestion) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName(suggestion.id)), serialize(suggestion));
}

export const remove = (dir: string, suggestion: Suggestion) =>
  rm(join(dir, fileName(suggestion.id)), { force: true });
