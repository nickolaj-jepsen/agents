import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios, type Step } from "@agents/drive/lib/scenario.ts";
import type { SetupContext } from "@agents/drive/lib/setup.ts";

/**
 * A session with nothing but this plugin: no system config, no parent package, and a registry and
 * socket dir of its own inside the run folder. The turns are canned, so the only thing asked of the
 * machine is this session's own registry.
 */
const turns: Turn[] = [
  {
    text: "Checking which other sessions answer here.",
    toolCall: { name: "list_agents", arguments: {} },
  },
  { text: "Nobody else answers, so there is no one to message." },
];

const PEER = {
  fromName: "peer-fixture",
  body: "The retry in src/sync.ts is capped at a minute; is that what you meant?",
};

/**
 * Folder paths for the session's own environment, written where the fixture extension reads them.
 * `HOME` is forced on a session by the driver, so isolation cannot come through `start.env`; the
 * extension loaded below sets these before the plugin reads them. All of it is under the run's
 * folder, which the driver removes with the run.
 */
const isolate = (ctx: SetupContext) => {
  const where = {
    home: join(ctx.runDir, "home"),
    claudeConfig: join(ctx.runDir, "home", ".claude"),
    runtime: join(ctx.runDir, "runtime"),
    message: PEER,
  };
  writeFileSync(join(ctx.cwd, ".e2e-isolation.json"), JSON.stringify(where));
  ctx.initRepo();
};

const start = {
  hermetic: true,
  plugins: ["claude-peers"],
  turns,
  // Loaded after the plugin's, which is enough: the environment is set while extensions load, before
  // any session starts.
  args: ["-e", fileURLToPath(new URL("./fixture-env.ts", import.meta.url))],
};

const asked: Step[] = [
  { type: "Which other sessions can you reach?" },
  { press: "Enter" },
  { wait: "Nobody else answers", timeout: 30_000 },
];

/** The transcript from the peer's message to the answer, so the footer and composer stay out of it. */
const transcript: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((line) => line.includes("Message from @peer-fixture"));
  const bottom = lines.findIndex((line) => line.includes("Nobody else answers"));
  if (top < 0 || bottom < 0) return undefined;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

export default scenarios({
  plugin: "claude-peers",
  harness: "pi",
  start,
  region: transcript,
  mask: [
    // The short id is a hash of a socket path in the run folder, which carries the pid.
    { pattern: /pi-cwd \[[0-9a-f]+\]/g, with: "<session>" },
    // The reply address is the same socket path, which the built-in mask cuts to `<tmp>` partway
    // through the line: name what the rest of it was.
    { pattern: /\(reply to uds:<tmp>/g, with: "(reply to <id>)" },
  ],
  scenarios: {
    reachable: {
      about:
        "a peer's message arrives and is folded to one line, then list_agents answers with no peers and no error",
      setup: isolate,
      sizes: [[112, 32]],
      steps: asked,
    },
    expanded: {
      about: "ctrl+o opens the peer's message whole, with the address a reply goes to",
      from: "reachable",
      // Wide enough for the whole reply address, which the mask replaces as one span.
      sizes: [[160, 45]],
      steps: [{ press: "Ctrl+o" }, { wait: "reply to", timeout: 10_000 }],
    },
  },
});
