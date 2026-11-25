import { rmSync } from "node:fs";
import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios } from "@agents/drive/lib/scenario.ts";

/**
 * A session with nothing but this plugin: no system config, no parent package, no other session.
 * The plugin's own tools are what is on trial, so the turn is canned and the only thing asked of
 * the machine is the session's own registry.
 */
const turns: Turn[] = [
  {
    text: "Checking which other sessions answer here.",
    toolCall: { name: "list_agents", arguments: {} },
  },
  { text: "No other session is reachable, so there is nobody to message." },
];

/**
 * Claude's registry and the socket dir moved into scratch of their own: a named profile is the only
 * one a session joins, so a test neither reads the person's registry nor writes into it, and what
 * it lists is the same on every machine.
 */
const FIXTURE = "/tmp/claude-peers-e2e";

const start = {
  hermetic: true,
  plugins: ["claude-peers"],
  turns,
  env: { CLAUDE_CONFIG_DIR: `${FIXTURE}/claude`, XDG_RUNTIME_DIR: `${FIXTURE}/run` },
};

/**
 * The fixture is swept before the session starts: a run that was killed leaves its registry entry
 * behind, and this session would then list a peer that no longer exists.
 */
const setup = () => rmSync(FIXTURE, { recursive: true, force: true });

const asked = [
  { type: "Which other sessions can you reach?" },
  { press: "Enter" },
  { wait: "No other session is reachable", timeout: 30_000 },
];

/** The transcript from the tool call to the answer, so the footer and composer stay out of it. */
const transcript: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((line) => line.includes("list_agents"));
  if (top < 0) return undefined;
  const bottom = lines.findIndex(
    (line, at) => at > top && line.includes("No other session is reachable"),
  );
  if (bottom < 0) return undefined;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

export default scenarios({
  plugin: "claude-peers",
  harness: "pi",
  start,
  region: transcript,
  // The session's own short id is a hash of its socket path, which carries its pid.
  mask: [{ pattern: /\[[0-9a-f]{6}\]/, with: "[ref]" }],
  scenarios: {
    reachable: {
      about:
        "a session with only this plugin starts, writes its registry entry, and answers list_agents: no peers, no error",
      setup,
      sizes: [[112, 32]],
      steps: asked,
    },
  },
});
