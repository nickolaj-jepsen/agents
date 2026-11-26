import { site, type SiteScenario } from "@agents/drive/lib/site.ts";
import { bgTask } from "./fixture.ts";
import { showMonitor } from "./monitor-terminal.ts";

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * A hermetic pi session with no plugins, because a recording photographs the session it started and
 * the steps below put the plugin's own monitor in that terminal before the picture is taken. The
 * plugins are empty because bg-herdr has no pi surface at all: its monitors are Herdr child
 * terminals, which no pi session draws.
 */
const start: SiteScenario["start"] = { hermetic: true, plugins: [], turns: [] };

/** The monitor, drawn at the recording's size and read once it has settled on the task. */
const steps = (state: string): SiteScenario["steps"] => [
  { run: showMonitor },
  { wait: `State: ${state}` },
];

export default site({
  plugin: "bg-herdr",
  stills: {
    running: {
      caption:
        "Each bg task gets a read-only terminal of its own: its lifecycle, how long it has run, the command and the directory it runs in, and the last lines of its log as the task writes them.",
      harness: "pi",
      project: "sync-worker",
      setup: (ctx) =>
        bgTask(ctx, {
          id: 3,
          name: "worker checks",
          command: "pnpm test",
          state: "running",
          pid: 41207,
          // Hours, not seconds: the elapsed line holds still while the picture is taken.
          startedAgo: 3 * HOUR + 12 * MINUTE,
          log: [
            "> worker@0.4.0 test",
            "> vitest run",
            "",
            " ✓ src/retry.spec.ts (18 tests) 412ms",
            " ✓ src/websocket.spec.ts (9 tests) 1180ms",
            " ✓ src/backoff.spec.ts (14 tests) 640ms",
            " ✓ src/queue.spec.ts (6 tests) 233ms",
            " ✓ src/store.spec.ts (21 tests) 890ms",
            " ✓ src/drain.spec.ts (11 tests) 705ms",
            "",
            " RUNS  src/integration/reconnect.spec.ts",
            "",
          ].join("\n"),
        }),
      start,
      steps: steps("running"),
    },
    exited: {
      caption:
        "A finished task keeps its terminal: the exit code, how long it ran and the end of its log, so the reason a build failed stays readable until the task leaves the session.",
      harness: "pi",
      project: "shop-api",
      setup: (ctx) =>
        bgTask(ctx, {
          id: 2,
          name: "build",
          command: "pnpm build",
          state: "exited",
          code: 1,
          startedAgo: 5 * MINUTE,
          ranMs: 72_000,
          log: [
            "> shop-api@1.2.0 build",
            "> tsc -b && vite build",
            "",
            "src/retry.ts:41:3 - error TS2345: Argument of type '\"Retry-After\"' is not",
            "assignable to parameter of type 'HeaderName'.",
            "",
            '41   const wait = Number(headers.get("Retry-After"));',
            "       ~~~~",
            "",
            "Found 1 error.",
            "",
            " ELIFECYCLE  Command failed with exit code 1.",
            "",
          ].join("\n"),
        }),
      start,
      steps: steps("exited"),
    },
  },
});
