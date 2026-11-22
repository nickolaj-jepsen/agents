/**
 * Bounded workers over a queue: at most `limit` tasks run at once, and a task that is running can
 * add work before it finishes. What is queued, when it drains and what a failure means stay the
 * caller's: this only decides which task goes next and how many are in flight.
 */

const settled = <R>(task: () => Promise<R>): Promise<PromiseSettledResult<R>> =>
  task().then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason) => ({ status: "rejected", reason }) as const,
  );

/**
 * A queue of `T` that `limit` workers drain; every task's verdict is kept in the order it was
 * queued, so a caller can line the results up with the work it pushed.
 */
export type Pool<T, R> = {
  /** Adds a task to the running queue; a worker picks it up when it is free. */
  push: (task: T) => void;
  /** Resolves once the queue is empty and no worker is busy, with every task's verdict in push order. */
  drain: () => Promise<PromiseSettledResult<R>[]>;
};

export function openPool<T, R = unknown>(limit: number, run: (task: T) => Promise<R>): Pool<T, R> {
  const queue: { at: number; task: T }[] = [];
  const results: PromiseSettledResult<R>[] = [];
  let pushed = 0;
  let running = 0;
  // Workers with no task to take wait here, rather than ending on a queue that is empty for now.
  let idle: (() => void)[] = [];
  const wake = () => {
    const waiting = idle;
    idle = [];
    for (const letGo of waiting) letGo();
  };

  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) {
        // Only an idle pool is a drained one: a worker still running may push more work.
        if (running === 0) return;
        await new Promise<void>((letGo) => idle.push(letGo));
        continue;
      }
      running++;
      try {
        results[next.at] = await settled(() => run(next.task));
      } finally {
        running--;
        wake();
      }
    }
  };

  // Workers start with the first task, so a pool nothing was pushed to is not one in flight. The
  // flag is set before they run: a task's own push must not start a second set of workers.
  let started = false;
  let drained: Promise<PromiseSettledResult<R>[]> | undefined;
  const kick = () => {
    if (started) return;
    started = true;
    drained = Promise.all(Array.from({ length: Math.max(1, Math.floor(limit)) }, worker)).then(
      () => results,
    );
  };

  return {
    push: (task) => {
      queue.push({ at: pushed++, task });
      wake();
      kick();
    },
    drain: () => drained ?? Promise.resolve([]),
  };
}

/**
 * Runs a fixed list with no more than `limit` at once, in list order, and keeps each task's verdict
 * rather than stopping the list on one failure.
 */
export async function boundedAll<T, R>(
  tasks: readonly T[],
  limit: number,
  run: (task: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (tasks.length === 0) return [];
  const pool = openPool<T, R>(limit, run);
  for (const task of tasks) pool.push(task);
  return pool.drain();
}
