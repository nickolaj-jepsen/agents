/**
 * How each agent is started and when it is ready: the checkout's plugins
 * (`claude-dev` / `pi-dev`), no MCP servers for Claude, a folder of its own.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LaunchSpec } from "./term.ts";

export type HarnessName = "claude" | "pi";

/** One canned pi assistant turn for the replay provider (`e2e/assets/fixture-provider.ts`). */
export type Turn = {
  text?: string;
  thinking?: string;
  toolCall?: { name: string; arguments: unknown };
  error?: string;
};

export type StartOptions = {
  /** Extra arguments for the agent. */
  args?: string[];
  env?: Record<string, string>;
  /** Assistant turns to replay, in order, instead of a real model (pi's replay provider; Claude's `lib/stub.ts`). */
  turns?: Turn[];
};

export type Run = {
  /** Scratch for this session: the agent's logs and session files. */
  runDir: string;
  /** The folder the agent runs in; a scenario's setup fills it. */
  cwd: string;
};

export interface Harness {
  name: HarnessName;
  launch(run: Run, start: StartOptions, size: { cols: number; rows: number }): LaunchSpec;
  /** True once the agent takes input. */
  ready(text: string): boolean;
  /** Keys that answer a startup dialog the driver owns, if one is showing. */
  dialog(text: string): string[] | undefined;
}

const here = dirname(fileURLToPath(import.meta.url));
export const checkoutRoot = resolve(here, "..", "..", "..");

const onPath = (bin: string) => {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** Markers of a parent agent's session: a test session must not think it is a child of one. */
const UNSET = [
  "CLAUDECODE",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
];

// AGENT_HUB_HIDDEN: a test session stays off the agent hub's bar.
// WT_NO_AUTOCLOSE: ending it leaves a worktree it ran in open for the caller.
const COMMON_ENV = { AGENT_HUB_HIDDEN: "1", WT_NO_AUTOCLOSE: "1" };

export const claude: Harness = {
  name: "claude",
  launch(run, start, size) {
    return {
      program: onPath("claude-dev") ? "claude-dev" : "claude",
      // The session is the person's account: no connectors (--strict-mcp-config).
      args: [
        "--strict-mcp-config",
        "--debug-file",
        join(run.runDir, "debug.log"),
        ...(start.args ?? []),
      ],
      cwd: run.cwd,
      // CLAUDE_CODE_NO_FLICKER: the fullscreen renderer, which the snapshots are of. Claude records
      // a start that ended early (a session closed before its screen was up) as a strike in
      // ~/.claude.json (`fullscreenAutoDisabled`) and, after two, starts every session in the
      // classic renderer; this overrides that.
      env: { ...COMMON_ENV, CLAUDE_CODE_NO_FLICKER: "1", ...start.env },
      unset: UNSET,
      ...size,
    };
  },
  ready: (text) => /^❯|shift\+tab to cycle|\? for shortcuts/m.test(text),
  // Only ever a folder the driver made, so trusting it is safe: the first entry is "Yes",
  // and tui.sh sends Down Enter, which this follows.
  dialog: (text) => (text.includes("Yes, I trust this folder") ? ["Down", "Enter"] : undefined),
};

export const pi: Harness = {
  name: "pi",
  launch(run, start, size) {
    mkdirSync(join(run.runDir, "sessions"), { recursive: true });
    const args = ["--session-dir", join(run.runDir, "sessions")];
    const env: Record<string, string> = { ...COMMON_ENV, PI_OFFLINE: "1", ...start.env };
    if (start.turns) {
      const file = join(run.runDir, "turns.json");
      writeFileSync(file, JSON.stringify(start.turns));
      env.FIXTURE = file;
      args.push(
        "--extension",
        join(checkoutRoot, "agent-tools/e2e/assets/fixture-provider.ts"),
        "--provider",
        "fixture",
        "--model",
        "replay",
      );
    }
    return {
      program: onPath("pi-dev") ? "pi-dev" : "pi",
      args: [...args, ...(start.args ?? [])],
      cwd: run.cwd,
      env,
      unset: UNSET,
      ...size,
    };
  },
  ready: (text) => /escape interrupt|commands ·/.test(text),
  dialog: () => undefined,
};

export const harnesses: Record<HarnessName, Harness> = { claude, pi };
