/** How each agent is started and when it is ready. */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LaunchSpec } from "./term.ts";

export type HarnessName = "claude" | "pi";

/** One canned assistant turn for the replay provider and the model stub (`lib/stub.ts`). */
export type Turn = {
  /**
   * Claude's stub only: serve this turn to the request whose system prompt or messages contain the
   * text (a side call, not the main loop's next turn), each once, in order.
   */
  match?: string;
  text?: string;
  thinking?: string;
  toolCall?: { name: string; arguments: unknown };
  error?: string;
};

export type StartOptions = {
  /** Programs the agent finds first on its PATH, by name: the script text of each. */
  bin?: Record<string, string>;
  /**
   * A config folder of its own instead of the person's, so nothing of them shows: what the site
   * media are made on. Needs `turns`; Claude runs plain `claude` with every mod of this checkout,
   * pi loads only `plugins`.
   */
  hermetic?: boolean;
  /**
   * With `hermetic`: the plugins (`plugins/<name>`) to load and nothing else; Claude loads every mod
   * of the checkout when this is left out.
   */
  plugins?: string[];
  /**
   * MCP servers for Claude, by name, and no others. The name is what plugins see in tool names:
   * `linear` is what linear-issue looks for.
   */
  mcp?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  args?: string[];
  env?: Record<string, string>;
  /** Assistant turns to replay, in order, instead of a real model. */
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
export const checkoutRoot = resolve(here, "..", "..");

/**
 * The system's `claude-dev` / `pi-dev` with its checkout swapped for this one, so a session loads
 * the plugins of the tree the harness runs from (a worktree's own), not the wrappers' fixed path.
 */
function devWrapper(bin: "claude-dev" | "pi-dev", runDir: string): string | undefined {
  try {
    const path = execFileSync("which", [bin], { encoding: "utf8" }).trim();
    const text = readFileSync(path, "utf8");
    const swapped = text.replace(
      /^(checkout|plugins)="([^"]*)"$/m,
      (_, name: string, old: string) =>
        `${name}="${old.endsWith("/plugins") ? `${checkoutRoot}/plugins` : checkoutRoot}"`,
    );
    const out = join(runDir, bin);
    writeFileSync(out, swapped);
    chmodSync(out, 0o755);
    return out;
  } catch {
    return undefined;
  }
}

/** The plugins of this checkout with a Claude half: `only`, or all. */
function checkoutMods(only?: string[]): string[] {
  const root = join(checkoutRoot, "plugins");
  return (only ?? readdirSync(root).sort())
    .map((name) => join(root, name))
    .filter((dir) => existsSync(join(dir, ".claude-plugin", "plugin.json")));
}

/** The keys the plugins need, as a person would have bound them. */
const KEYBINDINGS = {
  bindings: [
    // spellfix's picker.
    { context: "Global", bindings: { "ctrl+q": "app:toggleDiffNoiseFilter" } },
    { context: "Chat", bindings: { "alt+a": "abovePrompt:focus" } },
    { context: "AbovePrompt", bindings: { j: "abovePrompt:next", k: "abovePrompt:previous" } },
    { context: "AbovePromptInput", bindings: { escape: "abovePrompt:previous" } },
  ],
};

const STUB_KEY = "sk-ant-api03-stub-key-for-the-e2e-model-stub-0000000000000000";

/**
 * A config folder for one session and the environment that points Claude at it. The one prompt that
 * stays, a folder's trust, is the driver's, as in any session.
 */
function hermeticClaude(run: Run): Record<string, string> {
  const dir = join(run.runDir, "claude-config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, ".claude.json"),
    JSON.stringify({
      hasCompletedOnboarding: true,
      theme: "dark",
      numStartups: 20,
      hasSeenAutoDefaultNotice: true,
      hasResetAutoModeOptInForDefaultOffer: true,
      effortCalloutV2Dismissed: true,
      customApiKeyResponses: { approved: [STUB_KEY.slice(-20)], rejected: [] },
    }),
  );
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ tui: "fullscreen", model: "sonnet", skipAutoPermissionPrompt: true }),
  );
  writeFileSync(join(dir, "keybindings.json"), JSON.stringify(KEYBINDINGS));
  return { CLAUDE_CONFIG_DIR: dir, ANTHROPIC_API_KEY: STUB_KEY };
}

/** `bin`'s scripts as executables in a folder of the run, and the PATH with it first. */
function withBin(run: Run, bin: Record<string, string>): string {
  const dir = join(run.runDir, "bin");
  mkdirSync(dir, { recursive: true });
  for (const [name, script] of Object.entries(bin)) {
    writeFileSync(join(dir, name), script);
    chmodSync(join(dir, name), 0o755);
  }
  return `${dir}:${process.env.PATH ?? ""}`;
}

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
// A hermetic session draws the same colours whatever terminal started the run: without it, a
// shell with no COLORTERM (CI) gets the 256-colour palette.
const HERMETIC_ENV = { COLORTERM: "truecolor" };

export const claude: Harness = {
  name: "claude",
  launch(run, start, size) {
    const hermetic = start.hermetic ? hermeticClaude(run) : undefined;
    const path = start.bin ? { PATH: withBin(run, start.bin) } : undefined;
    let mcp: string[] = [];
    if (start.mcp) {
      const file = join(run.runDir, "mcp.json");
      // Each server is told where the run's scratch is, to leave what it recorded there.
      const servers = Object.fromEntries(
        Object.entries(start.mcp).map(([name, spec]) => [
          name,
          { ...spec, env: { E2E_RUN_DIR: run.runDir, ...spec.env } },
        ]),
      );
      writeFileSync(file, JSON.stringify({ mcpServers: servers }));
      mcp = ["--mcp-config", file];
    }
    return {
      // Hermetic: plain `claude` with this checkout's mods, as `claude-dev` would load them, so a
      // machine without the wrapper (the Pages workflow) records the same screens.
      program: hermetic
        ? "claude"
        : (devWrapper("claude-dev", run.runDir) ??
          (onPath("claude-dev") ? "claude-dev" : "claude")),
      // The session is the person's account: no connectors (--strict-mcp-config).
      args: [
        ...(hermetic ? checkoutMods(start.plugins).flatMap((dir) => ["--plugin-dir", dir]) : []),
        "--strict-mcp-config",
        ...mcp,
        ...(hermetic
          ? ["--permission-mode", "default"]
          : ["--debug-file", join(run.runDir, "debug.log")]),
        ...(start.args ?? []),
      ],
      cwd: run.cwd,
      // CLAUDE_CODE_NO_FLICKER: the fullscreen renderer, which the snapshots are of. Claude records
      // a start that ended early as a strike in ~/.claude.json (`fullscreenAutoDisabled`) and, after
      // two, starts every session in the classic renderer; this overrides that.
      env: {
        ...COMMON_ENV,
        CLAUDE_CODE_NO_FLICKER: "1",
        ...(hermetic ? { ...hermetic, ...HERMETIC_ENV, CLAUDE_CODE_PLUGIN_DIRS: "" } : {}),
        ...path,
        ...start.env,
      },
      unset: UNSET,
      ...size,
    };
  },
  ready: (text) => /^❯|shift\+tab to cycle|\? for shortcuts/m.test(text),
  // Only ever a folder the driver made, so trusting it is safe: the first entry is "Yes",
  // and Down Enter reaches it.
  dialog: (text) => (text.includes("Yes, I trust this folder") ? ["Down", "Enter"] : undefined),
};

export const pi: Harness = {
  name: "pi",
  launch(run, start, size) {
    mkdirSync(join(run.runDir, "sessions"), { recursive: true });
    const args = ["--session-dir", join(run.runDir, "sessions")];
    const env: Record<string, string> = { ...COMMON_ENV, PI_OFFLINE: "1", ...start.env };
    if (start.bin) env.PATH = withBin(run, start.bin);
    if (start.turns) {
      const file = join(run.runDir, "turns.json");
      writeFileSync(file, JSON.stringify(start.turns));
      env.FIXTURE = file;
      args.push(
        "--extension",
        join(checkoutRoot, "e2e/assets/fixture-provider.ts"),
        "--provider",
        "fixture",
        "--model",
        "replay",
      );
    }
    if (start.hermetic) {
      const agentDir = join(run.runDir, "pi-agent");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ quietStartup: true }));
      env.PI_CODING_AGENT_DIR = agentDir;
      Object.assign(env, HERMETIC_ENV);
      args.push(
        "--no-extensions",
        "--no-skills",
        "--no-context-files",
        "--no-prompt-templates",
        "--no-mcp",
        "--use-theme",
        "dark",
      );
      for (const name of start.plugins ?? [])
        args.push("--extension", join(checkoutRoot, "plugins", name));
    }
    return {
      program: start.hermetic
        ? "pi"
        : (devWrapper("pi-dev", run.runDir) ?? (onPath("pi-dev") ? "pi-dev" : "pi")),
      args: [...args, ...(start.args ?? [])],
      cwd: run.cwd,
      env,
      unset: UNSET,
      ...size,
    };
  },
  // The startup hints, or with `quietStartup` (hermetic) the footer's context meter.
  ready: (text) => /escape interrupt|commands ·|\d%\/\d+k \(/.test(text),
  dialog: () => undefined,
};

export const harnesses: Record<HarnessName, Harness> = { claude, pi };
