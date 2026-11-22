/**
 * A watch is the foreground's source of work: one save batch at a time, and a close that stops new
 * batches and waits for the one being handled. What a person sees on leaving is decided by that
 * ordering, so it is checked here rather than through a single caller.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot } from "./packages.ts";
import { watchSources } from "./watch.ts";

// Inside the checkout: a save is a repo-relative source, and a folder beside the sources is one.
const dir = mkdtempSync(join(repoRoot, ".watch-spec-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const save = (name: string) => writeFileSync(join(dir, name), `// ${name}\n`);
const rel = (name: string) => relative(repoRoot, join(dir, name));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Until `done`, looked at every 10 ms; a watcher delivers a save a moment after it is written. */
async function until(done: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeout) throw new Error("the watcher never delivered the save");
    await sleep(10);
  }
}

describe("closing a watch", () => {
  it("waits for the save it was handling, and drops the ones queued behind it", async () => {
    const batches: string[][] = [];
    let handled = 0;
    const release = new Map<number, () => void>();
    const watch = watchSources(
      [dir],
      (files) => {
        batches.push(files);
        const n = ++handled;
        return new Promise<void>((resolve) => release.set(n, resolve));
      },
      { quiet: 40 },
    );
    try {
      await watch.ready;
      save("first.ts");
      await until(() => batches.length === 1);

      // Two saves while the first is still being handled: one batch queued behind it.
      save("second.ts");
      save("third.ts");
      await sleep(120);

      let closed = false;
      const closing = watch.close().then(() => (closed = true));
      await sleep(120);
      // Still handling the first save, so the close waits; nothing queued runs meanwhile.
      expect(closed).toBe(false);
      expect(batches).toEqual([[rel("first.ts")]]);

      release.get(1)!();
      await closing;
      // The queued batch was discarded rather than replayed after the person left.
      await sleep(120);
      expect(batches).toEqual([[rel("first.ts")]]);
    } finally {
      await watch.close();
    }
  });

  it("resolves at once when no save is being handled", async () => {
    const watch = watchSources([dir], () => Promise.resolve(), { quiet: 40 });
    await watch.ready;
    await expect(watch.close()).resolves.toBeUndefined();
  });
});
