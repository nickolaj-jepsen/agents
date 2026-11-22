/**
 * Plays every scenario under e2e/<plugin>/ in its real agent and compares the screen
 * at each size with its stored snapshot. It starts Claude Code and pi, so it runs as the `e2e` task
 * of each e2e/<plugin>/ package (`node e2e/run.ts <plugin>`), not as part of the generic `test`.
 *
 * The scenarios run first, together, in `lib/runner.ts` (sessions side by side, a chain of
 * scenarios in one session); the tests then read what each came to.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { settleCapture } from "./lib/check.ts";
import { loadSet, resolveScenario, scenarioFiles, type ScenarioSet } from "./lib/scenario.ts";
import { runAll, type Outcome } from "./lib/runner.ts";

const sets: ScenarioSet[] = [];
for (const { file } of scenarioFiles(process.env.E2E_PLUGIN)) sets.push(await loadSet(file));

// A known failure passes while it fails (`expectFail`), and fails the day it is fixed.
const titleOf = (set: ScenarioSet, name: string) => {
  const why = resolveScenario(set, name).expectFail;
  return why ? `${name} (known failure: ${why})` : name;
};

/** Mirrors `vitest -t`: the pattern is tested against the whole test name. */
const filter = process.env.E2E_FILTER ? new RegExp(process.env.E2E_FILTER) : undefined;
const wanted = (plugin: string, harness: string, name: string) => {
  if (!filter) return true;
  const set = sets.find((s) => s.plugin === plugin && s.harness === harness);
  return !!set && filter.test(`${plugin} in ${harness} ${titleOf(set, name)}`);
};

let outcomes = new Map<string, Outcome>();
beforeAll(async () => {
  const done = await runAll(sets, wanted);
  outcomes = done.outcomes;
  console.error(
    `e2e: ${outcomes.size} scenarios in ${done.stats.sessions} sessions, ` +
      `${done.stats.hiccups} start failure(s) retried, ${done.stats.seconds.toFixed(0)}s`,
  );
}, 3_600_000);

for (const set of sets) {
  describe(`${set.plugin} in ${set.harness}`, () => {
    for (const name of Object.keys(set.scenarios)) {
      const r = resolveScenario(set, name);
      (r.expectFail ? it.fails : it)(titleOf(set, name), () => {
        const got = outcomes.get(`${set.plugin}/${set.harness}/${name}`);
        if (!got) throw new Error("the scenario did not run");
        if (got.error) throw got.error;
        // Settle every size first, so each leaves its own evidence, then fail on the first.
        const failed = got.captures.flatMap((c) => {
          const wrong = settleCapture(c);
          return wrong ? [{ c, wrong }] : [];
        });
        const first = failed[0];
        if (first) expect(first.c.actual, first.wrong).toBe(first.c.expected ?? "(no snapshot)");
      });
    }
  });
}
