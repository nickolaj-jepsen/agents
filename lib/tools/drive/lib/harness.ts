/** How each agent is started and when it is ready. */
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distOf, repoRoot } from "./packages.ts";
import { runEnv } from "./setup.ts";
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
   * pi loads only `plugins`. Both load the builds (`apps/<name>/dist`).
   */
  hermetic?: boolean;
  /**
   * With `hermetic`: the apps (`apps/<name>`, their `dist/`) to load and nothing else; Claude loads every
   * built mod of the checkout when this is left out.
   */
  plugins?: string[];
  /**
   * MCP servers by name, and no others. Claude gets them as its config; a hermetic pi gets them
   * in its `mcp.json`, for a plugin that reads it. The name is what plugins see in tool names:
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
  /** True when the start has failed for good, so the wait for the prompt can stop. */
  failed?(text: string): boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
export const checkoutRoot = repoRoot;

/**
 * `claude` or `pi` from this package's pinned npm dependencies, which the tasks' cache key stands
 * for, not whichever the shell finds first. Turbo puts only the root's `node_modules/.bin` on PATH.
 */
export function agentBin(name: HarnessName): string {
  const bin = join(here, "..", "node_modules", ".bin", name);
  return existsSync(bin) ? bin : name;
}

/**
 * The built mods of this checkout (`apps/<name>/dist`, from `pnpm turbo run build`): `only`, or all of
 * them. A name that is not built throws, since a session would start without it.
 */
export function checkoutMods(only?: string[]): string[] {
  const root = join(checkoutRoot, "apps");
  const names = only ?? readdirSync(root).sort();
  const dirs = names.map((name) => distOf(name));
  const built = (dir: string) => existsSync(join(dir, ".claude-plugin", "plugin.json"));
  const missing = dirs.filter((dir, i) => only && !built(dir) && names[i]);
  if (missing.length)
    throw new Error(`not built: ${missing.join(", ")}; run \`pnpm turbo run build\``);
  return dirs.filter(built);
}

/** The pi extensions of this checkout's builds: `only`, or every app that has one. */
export function checkoutExtensions(only?: string[]): string[] {
  const root = join(checkoutRoot, "apps");
  const names = only ?? readdirSync(root).sort();
  const dirs = names.map((name) => distOf(name));
  const built = (dir: string) => existsSync(join(dir, "pi", "index.ts"));
  const missing = dirs.filter((dir) => only && !built(dir));
  if (missing.length)
    throw new Error(`not built: ${missing.join(", ")}; run \`pnpm turbo run build\``);
  return dirs.filter(built);
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

export const STUB_KEY = "sk-ant-api03-stub-key-for-the-e2e-model-stub-0000000000000000";

/**
 * A config folder for one session and the environment that points Claude at it. The one prompt that
 * stays, a folder's trust, is the driver's, as in any session.
 */
export function hermeticClaude(
  run: Run,
  extra: { config?: Record<string, unknown>; settings?: Record<string, unknown> } = {},
): Record<string, string> {
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
      ...extra.config,
    }),
  );
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify(
      extra.settings ?? { tui: "fullscreen", model: "sonnet", skipAutoPermissionPrompt: true },
    ),
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
// shell with no COLORTERM (CI) gets the 256-colour palette. Claude's `ctrl+g to edit in <editor>`
// hint names $VISUAL or $EDITOR, so the editor is pinned too.
const HERMETIC_ENV = { COLORTERM: "truecolor", EDITOR: "nvim", VISUAL: "nvim" };

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
      // Hermetic: the pinned `claude`; otherwise the person's own. Either loads this checkout's built
      // mods, so a machine without any wrapper (the Pages workflow) records the same screens.
      program: hermetic ? agentBin("claude") : "claude",
      // The session is the person's account: no connectors (--strict-mcp-config).
      args: [
        ...checkoutMods(hermetic ? start.plugins : undefined).flatMap((dir) => [
          "--plugin-dir",
          dir,
        ]),
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
        ...runEnv(run.runDir),
        CLAUDE_CODE_NO_FLICKER: "1",
        CLAUDE_CODE_PLUGIN_DIRS: "",
        ...(hermetic ? { ...hermetic, ...HERMETIC_ENV } : {}),
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
    const env: Record<string, string> = {
      ...COMMON_ENV,
      ...runEnv(run.runDir),
      PI_OFFLINE: "1",
      ...start.env,
    };
    if (start.bin) env.PATH = withBin(run, start.bin);
    if (start.turns) {
      const file = join(run.runDir, "turns.json");
      writeFileSync(file, JSON.stringify(start.turns));
      env.FIXTURE = file;
      args.push(
        "--extension",
        join(checkoutRoot, "lib/tools/drive/assets/fixture-provider.ts"),
        "--provider",
        "fixture",
        "--model",
        "replay",
        // The model scope too: a session that switches worktrees resolves it again, and
        // from settings it is the system's `enabledModels`, which a `pi` wrapper may merge into a
        // hermetic config, where none of them exist.
        "--models",
        "fixture/replay",
      );
    }
    if (start.hermetic) {
      const agentDir = join(run.runDir, "pi-agent");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ quietStartup: true }));
      // pi's own MCP support stays off (`--no-mcp`): a plugin that calls a server reads this
      // file itself, as linear-issue does. Each server is told where the run's scratch is.
      if (start.mcp)
        writeFileSync(
          join(agentDir, "mcp.json"),
          JSON.stringify({
            mcpServers: Object.fromEntries(
              Object.entries(start.mcp).map(([name, spec]) => [
                name,
                { ...spec, env: { E2E_RUN_DIR: run.runDir, ...spec.env } },
              ]),
            ),
          }),
        );
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
      for (const dir of checkoutExtensions(start.plugins ?? [])) args.push("--extension", dir);
    }
    // Not hermetic: the person's own `pi`, with no extensions of its own (`-ne`) and this checkout's.
    if (!start.hermetic)
      args.push("--no-extensions", ...checkoutExtensions().flatMap((dir) => ["--extension", dir]));
    return {
      program: start.hermetic ? agentBin("pi") : "pi",
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
  // An extension that does not load ends pi before its prompt.
  failed: (text) => /^Error: Failed to load extension/m.test(text),
};

export const harnesses: Record<HarnessName, Harness> = { claude, pi };
