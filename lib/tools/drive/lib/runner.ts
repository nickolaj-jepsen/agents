/**
 * Runs scenarios side by side and along chains: a joinable child (`from`, with no `setup` or `start`
 * of its own and not `fresh`) plays in its parent's session, its siblings that can `reset` take
 * turns before it, and the deepest one carries on. Sessions are isolated by folder and by the
 * stub's port, so a pool of them runs at once; `--jobs` sets the size of each harness's pool (`N`, or `claude=N,pi=M`).
 */
import { options } from "./options.ts";
import { cpus } from "node:os";
import { capture, differs, type Capture } from "./check.ts";
import type { HarnessName } from "./harness.ts";
import {
  failShot,
  play,
  reach,
  resolveScenario,
  type Resolved,
  type ScenarioSet,
} from "./scenario.ts";
import { Session, startStats } from "./session.ts";

export type Outcome = { error?: Error; captures: Capture[]; sharedWith?: string };

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

const cpuCount = () => Math.max(1, cpus().length);

/** Sessions at once per harness: Claude Code is the heavier, and starts less reliably when crowded. */
export function poolSize(harness: HarnessName): number {
  const named = typeof options.jobs === "object" ? options.jobs[harness] : options.jobs;
  if (named && named >= 1) return Math.floor(named);
  return harness === "claude"
    ? Math.max(1, Math.min(4, Math.floor(cpuCount() / 4)))
    : Math.max(1, Math.min(8, Math.floor(cpuCount() / 2)));
}

type Task = { set: ScenarioSet; chain: Chain; solo: boolean };

const key = (plugin: string, harness: string, name: string) => `${plugin}/${harness}/${name}`;
let seq = 0;

const wrong = (captures: Capture[]) => captures.some(differs);

/** Plays one scenario's captures; the session is on its screen already. */
async function snap(session: Session, r: Resolved): Promise<Outcome> {
  if (r.expectFail) return { captures: [] };
  return { captures: await capture(session, r) };
}

/** A scenario alone, in a session of its own. */
async function solo(set: ScenarioSet, name: string): Promise<Outcome> {
  const r = resolveScenario(set, name);
  let session: Session | undefined;
  try {
    session = await reach(r, "lib", `e2e-${r.plugin}-${r.harness}-${++seq}`);
    return await snap(session, r);
  } catch (error) {
    if (session) await failShot(session, r);
    return { captures: [], error: error as Error };
  } finally {
    await session?.close();
  }
}

/** Runs one chain; a scenario that fails in a shared session is tried again alone. */
async function runChain(task: Task, out: Map<string, Outcome>, requeue: (t: Task) => void) {
  const { set, chain } = task;
  const k = (n: string) => key(set.plugin, set.harness, n);
  const head = resolveScenario(set, chain.head);
  let session: Session | undefined;
  try {
    session = await reach(head, "lib", `e2e-${head.plugin}-${head.harness}-${++seq}`);
    out.set(k(head.name), await snap(session, head));
  } catch (error) {
    out.set(k(head.name), { captures: [], error: error as Error });
    await session?.close();
    // The rest still run, each in a session of its own.
    for (const n of chain.next) requeue({ set, chain: { head: n.name, next: [] }, solo: true });
    return;
  }
  const shared = head.name;
  try {
    for (const [i, item] of chain.next.entries()) {
      const r = resolveScenario(set, item.name);
      let outcome: Outcome;
      try {
        // Back on the screen the next scenario starts from: its size, and what undoes the last one.
        const size = await session.size();
        const want = item.resizeTo ?? r.size;
        if (size.cols !== want[0] || size.rows !== want[1]) await session.resize(want[0], want[1]);
        await play(session, item.pre);
        // A root that takes its turn starts from the fresh screen: its whole steps, not an addition.
        await play(session, item.fromStart ? r.steps : r.ownSteps);
        await session.settle();
        outcome = await snap(session, r);
        if (!r.expectFail && wrong(outcome.captures))
          throw new Error("differs in a shared session");
      } catch (error) {
        // Alone it may be right: then what differed came from the session being shared.
        console.error(
          `e2e: ${k(r.name)} failed in the session of ${shared}: ${String(error).split("\n")[0]}; running it alone`,
        );
        out.set(k(r.name), await solo(set, r.name).then((o) => ({ ...o, sharedWith: shared })));
        for (const n of chain.next.slice(i + 1))
          requeue({ set, chain: { head: n.name, next: [] }, solo: true });
        return;
      }
      out.set(k(r.name), outcome);
    }
  } finally {
    await session.close();
  }
}

export type Stats = { sessions: number; hiccups: number; seconds: number };

/** Plays every job's scenarios and returns what each came to, by `plugin/harness/name`. */
export async function runAll(
  sets: ScenarioSet[],
  wanted: (plugin: string, harness: string, name: string) => boolean,
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
        queues[set.harness].push({ set, chain, solo: false });
      else
        for (const n of names)
          if (wanted(set.plugin, set.harness, n))
            queues[set.harness].push({ set, chain: { head: n, next: [] }, solo: true });
    }
  }
  const pools = (Object.keys(queues) as HarnessName[]).map(async (harness) => {
    const queue = queues[harness];
    // Longest first, so the pool does not end on one long chain.
    queue.sort((a, b) => b.chain.next.length - a.chain.next.length);
    const requeue = (t: Task) => queue.push(t);
    let running = 0;
    const worker = async () => {
      for (;;) {
        const task = queue.shift();
        if (!task) {
          // A chain that is still running may hand the rest of its scenarios back.
          if (running === 0) return;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        running++;
        try {
          await runChain(task, out, requeue);
        } catch (error) {
          out.set(key(task.set.plugin, harness, task.chain.head), {
            captures: [],
            error: error as Error,
          });
        } finally {
          running--;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(poolSize(harness), queue.length) }, worker));
  });
  await Promise.all(pools);
  return {
    outcomes: out,
    stats: {
      sessions: startStats.starts - startedWith.starts,
      hiccups: startStats.hiccups - startedWith.hiccups,
      seconds: (Date.now() - began) / 1000,
    },
  };
}
