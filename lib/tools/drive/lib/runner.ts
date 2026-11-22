/**
 * Runs scenarios side by side and along chains: a joinable child (`from`, with no `setup` or `start`
 * of its own and not `fresh`) plays in its parent's session, its siblings that can `reset` take
 * turns before it, and the deepest one carries on. Sessions are isolated by folder and by the
 * stub's port, so a pool of them runs at once; `--jobs` sets the size of each harness's pool (`N`, or `claude=N,pi=M`).
 *
 * A scenario's verdict is the result of the one attempt it got, in the session it played in: the
 * runner never retries a failure in a session of its own. A snapshot that differs is not a
 * failure of the chain, so the shared session carries on; a step or reset that throws broke the
 * session, so only the scenarios it never touched carry on in fresh ones.
 */
import { availableParallelism } from "node:os";
import { captureMedia, gateCapture, type Capture } from "./check.ts";
import type { HarnessName } from "./harness.ts";
import { options } from "./options.ts";
import { openPool } from "./pool.ts";
import {
  failShot,
  play,
  reach,
  resolveScenario,
  type Resolved,
  type ScenarioSet,
} from "./scenario.ts";
import { Session, startStats } from "./session.ts";

export type Outcome = { error?: Error; captures: Capture[] };

/**
 * What the runner needs of a scenario: start its agent and play its steps, read its screen at each
 * size, and photograph what a failure left. The gate's and recording's differ only in the capture.
 */
export type Stage = {
  /**
   * The engine its sessions run in. The gate leaves this out and runs in process: a picture of a
   * mismatched or `--png` screen is drawn of that very screen, so it cannot come from a session of
   * another engine. Recording names the daemon, whose screens are its own.
   */
  backend?: "lib" | "daemon";
  reach: (r: Resolved, backend: "lib" | "daemon", name: string) => Promise<Session>;
  capture: (session: Session, r: Resolved) => Promise<Capture[]>;
  failShot: (session: Session, r: Resolved) => Promise<void>;
};

/**
 * A real session with its steps: the gate's stage unless a caller reads the screen another way.
 *
 * The gate reads text, which the in-process engine gives for half the price of a daemon read
 * (lib/tools/drive/README.md's numbers, and /tmp/drive-09-proof-gKBvYX). `--png` asks for a
 * picture of every screen, and a picture is rasterized out of process, so that run names the
 * daemon; so does recording, which is asking for pictures and video of screens of its own.
 */
export const realStage: Stage = {
  get backend() {
    return options.png ? "daemon" : "lib";
  },
  reach,
  capture: gateCapture,
  failShot,
};

/** Recording's stage: its screens are checked by nobody, and its pictures are the point. */
export const mediaStage: Stage = {
  backend: "daemon",
  reach,
  capture: captureMedia,
  failShot,
};

export type Job = { plugin: string; harness: HarnessName; name: string; set: ScenarioSet };

/** One session's work: the scenario that starts it, and those that follow in it. */
export type Chain = {
  /** The first scenario: its resolved steps play in full on a new session. */
  head: string;
  /** In order, with the steps that put the session back on the parent's screen before it plays. */
  next: {
    name: string;
    pre: Step[];
    resizeTo?: readonly [number, number];
    /** Plays from a fresh start: all its steps, not what it adds to a parent's. */
    fromStart?: boolean;
  }[];
};
type Step = Parameters<typeof play>[1][number];

/** Whether `r` can play in a session already on its parent's screen. */
const joinable = (r: Resolved) => !r.fresh && !r.ownSetup && !r.ownStart;

const sameSize = (a: Resolved, b: Resolved) => a.size[0] === b.size[0] && a.size[1] === b.size[1];

const sameStart = (a: Resolved, b: Resolved) =>
  JSON.stringify([a.start, a.size]) === JSON.stringify([b.start, b.size]);

/** How the scenarios of one file are cut into chains. Every scenario is in exactly one. */
export function planChains(set: ScenarioSet): Chain[] {
  const names = Object.keys(set.scenarios);
  const all = new Map(names.map((n) => [n, resolveScenario(set, n)]));
  const kids = new Map<string, string[]>();
  for (const [n, r] of all) if (r.from) kids.set(r.from, [...(kids.get(r.from) ?? []), n]);
  const depth = (n: string): number =>
    1 + Math.max(0, ...(kids.get(n) ?? []).map((k) => (joinable(all.get(k)!) ? depth(k) : 0)));
  const covered = new Set<string>();
  const chains: Chain[] = [];

  // The session sits on `at`'s screen: its siblings that can reset play first, then the deepest child.
  function extend(chain: Chain, at: string) {
    const here = all.get(at)!;
    const joiners = (kids.get(at) ?? []).filter(
      (k) => !covered.has(k) && joinable(all.get(k)!) && sameSize(all.get(k)!, here),
    );
    const resets = joiners.filter((k) => all.get(k)!.reset);
    const goes = joiners.filter((k) => !all.get(k)!.reset);
    const main = goes.sort((a, b) => depth(b) - depth(a))[0];
    let pre: Step[] = [];
    for (const k of resets) {
      // A scenario that resets returns to `at`; its own children start sessions of their own.
      covered.add(k);
      chain.next.push({ name: k, pre, resizeTo: here.size });
      pre = all.get(k)!.reset ?? [];
    }
    if (main) {
      covered.add(main);
      chain.next.push({ name: main, pre, resizeTo: here.size });
      extend(chain, main);
    }
  }

  // Roots that reset and start alike take turns in one session, then the last carries on.
  const roots = names.filter((n) => !all.get(n)!.from);
  const turns = roots.filter((n) => {
    const r = all.get(n)!;
    return !r.fresh && r.reset && r.setup.length === 0;
  });
  if (turns.length > 1) {
    const first = turns[0]!;
    const group = turns.filter((n) => sameStart(all.get(n)!, all.get(first)!));
    if (group.length > 1) {
      const chain: Chain = { head: first, next: [] };
      covered.add(first);
      let pre = all.get(first)!.reset ?? [];
      for (const n of group.slice(1)) {
        covered.add(n);
        chain.next.push({ name: n, pre, fromStart: true });
        pre = all.get(n)!.reset ?? [];
      }
      // The last of them has not reset, so its own children carry on from where it stands.
      extend(chain, group[group.length - 1]!);
      chains.push(chain);
    }
  }
  for (const n of names) {
    if (covered.has(n)) continue;
    covered.add(n);
    const chain: Chain = { head: n, next: [] };
    extend(chain, n);
    chains.push(chain);
  }
  return chains;
}

// ---- the pool

const cpuCount = () => Math.max(1, availableParallelism());

/** Sessions at once per harness: Claude Code is the heavier, and starts less reliably when crowded. */
export function poolSize(harness: HarnessName): number {
  const named = typeof options.jobs === "object" ? options.jobs[harness] : options.jobs;
  if (named && named >= 1) return Math.floor(named);
  return harness === "claude"
    ? Math.max(1, Math.min(4, Math.floor(cpuCount() / 4)))
    : Math.max(1, Math.min(8, Math.floor(cpuCount() / 2)));
}

type Task = { set: ScenarioSet; chain: Chain };

const key = (plugin: string, harness: string, name: string) => `${plugin}/${harness}/${name}`;
let seq = 0;

/**
 * Plays one scenario's captures; the session is on its screen already. A scenario that is known to
 * fail is captured like any other: whether its screen is compared, or drawn at all, is the stage's
 * rule, so a recording keeps the screen the gate passes over.
 */
async function snap(stage: Stage, session: Session, r: Resolved): Promise<Outcome> {
  return { captures: await stage.capture(session, r) };
}

/** Runs one chain; what a broken step leaves untouched is handed back as work of its own. */
async function runChain(
  stage: Stage,
  task: Task,
  out: Map<string, Outcome>,
  requeue: (t: Task) => void,
) {
  const { set, chain } = task;
  const k = (n: string) => key(set.plugin, set.harness, n);
  const fresh = (n: string): Task => ({ set, chain: { head: n, next: [] } });
  const head = resolveScenario(set, chain.head);
  let session: Session | undefined;
  try {
    session = await stage.reach(
      head,
      stage.backend ?? "lib",
      `e2e-${head.plugin}-${head.harness}-${++seq}`,
    );
    out.set(k(head.name), await snap(stage, session, head));
  } catch (error) {
    out.set(k(head.name), { captures: [], error: error as Error });
    await session?.close();
    // The rest still run, each in a session of its own.
    for (const n of chain.next) requeue(fresh(n.name));
    return;
  }
  const shared = head.name;
  try {
    for (const [i, item] of chain.next.entries()) {
      const r = resolveScenario(set, item.name);
      try {
        // Back on the screen the next scenario starts from: its size, and what undoes the last one.
        const size = await session.size();
        const want = item.resizeTo ?? r.size;
        if (size.cols !== want[0] || size.rows !== want[1]) await session.resize(want[0], want[1]);
        await play(session, item.pre);
        // A root that takes its turn starts from the fresh screen: its whole steps, not an addition.
        await play(session, item.fromStart ? r.steps : r.ownSteps);
        await session.settle();
        // A screen that differs from its snapshot is still the shared session's, so the chain carries
        // on; the gate compares it, and a playback or capture failure is what breaks the session.
        out.set(k(r.name), await snap(stage, session, r));
      } catch (error) {
        console.error(
          `e2e: ${k(r.name)} failed in the session of ${shared}: ${String(error).split("\n")[0]}`,
        );
        // The failure is the result of the one attempt it got: no second one alone. What the broken
        // session never reached runs fresh.
        await stage.failShot(session, r);
        out.set(k(r.name), { captures: [], error: error as Error });
        for (const n of chain.next.slice(i + 1)) requeue(fresh(n.name));
        return;
      }
    }
  } finally {
    await session.close();
  }
}

export type Stats = { sessions: number; seconds: number };

/** Plays every job's scenarios and returns what each came to, by `plugin/harness/name`. */
export async function runAll(
  sets: ScenarioSet[],
  wanted: (plugin: string, harness: string, name: string) => boolean,
  stage: Stage = realStage,
): Promise<{ outcomes: Map<string, Outcome>; stats: Stats }> {
  const began = Date.now();
  const startedWith = { ...startStats };
  const out = new Map<string, Outcome>();
  const queues: Record<HarnessName, Task[]> = { claude: [], pi: [] };
  for (const set of sets) {
    for (const chain of planChains(set)) {
      // Only what was asked for: a chain is cut to the scenarios wanted, each of which then
      // replays its own way in, so a filtered run never plays a neighbour.
      const names = [chain.head, ...chain.next.map((n) => n.name)];
      if (names.every((n) => wanted(set.plugin, set.harness, n)))
        queues[set.harness].push({ set, chain });
      else
        for (const n of names)
          if (wanted(set.plugin, set.harness, n))
            queues[set.harness].push({ set, chain: { head: n, next: [] } });
    }
  }
  const pools = (Object.keys(queues) as HarnessName[]).map(async (harness) => {
    const queue = queues[harness];
    // Longest first, so the pool does not end on one long chain.
    queue.sort((a, b) => b.chain.next.length - a.chain.next.length);
    // A broken chain hands its untouched scenarios back while its worker still runs.
    const pool = openPool<Task>(poolSize(harness), async (task) => {
      try {
        await runChain(stage, task, out, (t) => pool.push(t));
      } catch (error) {
        out.set(key(task.set.plugin, harness, task.chain.head), {
          captures: [],
          error: error as Error,
        });
      }
    });
    for (const task of queue) pool.push(task);
    await pool.drain();
  });
  await Promise.all(pools);
  return {
    outcomes: out,
    stats: {
      sessions: startStats.starts - startedWith.starts,
      seconds: (Date.now() - began) / 1000,
    },
  };
}
