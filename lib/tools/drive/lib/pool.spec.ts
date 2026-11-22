/**
 * Bounded workers: at most `limit` tasks run at once, a task that is running can still add work,
 * and a task's rejection is that task's result rather than the pool's, so callers decide what a
 * failure means. Tasks are held at a barrier, not timed.
 */
import { expect, it } from "vitest";
import { boundedAll, openPool } from "./pool.ts";

/** A latch the test opens, to hold tasks at a barrier until it says go. */
function latch() {
  let release: () => void = () => {};
  const opened = new Promise<void>((r) => (release = r));
  return { opened, open: () => release() };
}

it("runs a fixed list with no more than its limit at once, whatever a task's verdict", async () => {
  const started: string[] = [];
  let active = 0;
  let most = 0;
  const both = latch();
  const letGo = latch();
  const run = boundedAll(["a", "b", "c", "d", "e"], 2, async (task) => {
    active++;
    most = Math.max(most, active);
    started.push(task);
    if (active === 2) both.open();
    await letGo.opened;
    active--;
    if (task === "c") throw new Error(`cannot record ${task}`);
    return task;
  });

  // The two workers are held in their tasks: no third one starts, however much is queued.
  await both.opened;
  expect(started).toEqual(["a", "b"]);
  expect(most).toBe(2);
  letGo.open();
  const results = await run;

  // Push order, and one task's failure is not the list's.
  expect(results.map((r) => r.status)).toEqual([
    "fulfilled",
    "fulfilled",
    "rejected",
    "fulfilled",
    "fulfilled",
  ]);
  expect((results[2] as PromiseRejectedResult).reason).toEqual(new Error("cannot record c"));
  expect(results.filter((r) => r.status === "fulfilled").map((r) => r.value)).toEqual([
    "a",
    "b",
    "d",
    "e",
  ]);
  expect(started).toEqual(["a", "b", "c", "d", "e"]);
  expect(most).toBe(2);
});

it("takes work a running task adds, without dropping or repeating it", async () => {
  const played: string[] = [];
  const queued = latch();
  const hold = latch();
  const pool = openPool<string, string>(1, async (task) => {
    played.push(task);
    if (task === "a") {
      // The runner's requeue: the scenarios a broken chain never reached join the queue.
      pool.push("b");
      pool.push("c");
      queued.open();
      await hold.opened;
    }
    return task;
  });

  pool.push("a");
  const drained = pool.drain();
  await queued.opened;
  // The additions are still queued while the only worker runs its task.
  expect(played).toEqual(["a"]);
  hold.open();
  const results = await drained;

  expect(played).toEqual(["a", "b", "c"]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
  expect(results.map((r) => (r.status === "fulfilled" ? r.value : undefined))).toEqual([
    "a",
    "b",
    "c",
  ]);
});

it("drains a queue that never got a task", async () => {
  expect(await openPool<number, number>(2, async (n) => n).drain()).toEqual([]);
});
