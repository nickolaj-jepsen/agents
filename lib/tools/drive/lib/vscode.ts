// Each command reconnects to the detached VS Code window over its saved DevTools port.
import { options } from "./options.ts";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  chromium,
  type Browser,
  type CDPSession,
  type ElementHandle,
  type Frame,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright-core";
import {
  checkoutMods,
  hermeticClaude,
  modWatchEnv,
  sessionPath,
  STUB_KEY,
  type Turn,
} from "./harness.ts";
import { runEnv } from "./setup.ts";
import type { Pattern } from "./screen.ts";
import type { Target } from "./session.ts";
import { startStub, stopStub } from "./stub.ts";

export type VscodeStart = {
  /** Assistant turns the stub serves, in order. A session starts on the first prompt or command. */
  turns?: Turn[];
  /** The mods (`apps/<name>`, their builds) to load; every built mod of the checkout when left out. */
  plugins?: string[];
  env?: Record<string, string>;
  /** Programs the session finds first on its PATH, by name: the script text of each. */
  bin?: Record<string, string>;
  /** Commands the session must not find at all, as a machine without them. */
  hide?: string[];
  /** MCP servers the session starts with, as a terminal scenario's `start.mcp`. */
  mcp?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  /** Merged over the config folder's settings.json, e.g. `pluginConfigs` for a mod's options. */
  settings?: Record<string, unknown>;
};

/** What `launchVscode` leaves in the run folder for the next process to find. */
export type VscodeState = {
  port: number;
  stubPort: number;
  cwd: string;
  size?: [number, number];
  /** The start options a window's environment fixed at launch; a reload must match them. */
  fixed?: string;
};

export type VscodeLaunch = { visible?: boolean; watchPlugins?: boolean; signal?: AbortSignal };

/** The part of a start that is in the window's environment, which only a new window changes. */
export const fixedOf = (start: VscodeStart) =>
  JSON.stringify({ env: start.env, bin: start.bin, hide: start.hide, plugins: start.plugins });

const STATE = "vscode.json";
const CLAUDE_TAB = '.part.editor .tab[data-resource-name^="webview-claudeVSCodePanel-"]';
const CLAUDE_VIEW = 'iframe.webview[src*="extensionId=Anthropic.claude-code"]';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** With `--timing`, how long each phase of a start took, on stderr. */
const born = Date.now();
export const mark = (what: string) => {
  if (options.timing) console.error(`[timing] ${((Date.now() - born) / 1000).toFixed(1)}s ${what}`);
};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/**
 * Where VS Code, its extensions, the compositor and the fonts come from. The site's derivation
 * names its own (`E2E_VSCODE_CODE`, `E2E_VSCODE_EXTENSIONS`, `E2E_VSCODE_CAGE`,
 * `E2E_VSCODE_FONTCONFIG_FILE`): a build has no `code` on PATH, no home, no `nix run` and no
 * /etc/fonts. A person's run takes the machine's `code`, its installed extensions, nixpkgs' cage
 * and the machine's fonts.
 */
function machine() {
  const env = process.env;
  return {
    code: env.E2E_VSCODE_CODE || execFileSync("which", ["code"], { encoding: "utf8" }).trim(),
    extensions: env.E2E_VSCODE_EXTENSIONS || join(env.HOME ?? "", ".vscode", "extensions"),
    cage: env.E2E_VSCODE_CAGE ? [env.E2E_VSCODE_CAGE] : ["nix", "run", "nixpkgs#cage", "--"],
    fonts: env.E2E_VSCODE_FONTCONFIG_FILE,
  };
}

/** What of this process's environment VS Code and the claude it spawns must not inherit. */
const inherited = (name: string) => /^(CLAUDE|ANTHROPIC|VSCODE_|ELECTRON_)/.test(name);

/**
 * The config folder and the project's `.mcp.json` the extension's `claude` reads when it starts:
 * written at launch, and again by a reload, since each new tab's `claude` reads them afresh.
 */
function writeSessionConfig(runDir: string, folder: string, start: VscodeStart) {
  // The extension's `claude` inherits this environment. Without a trust record for the folder it
  // logs "Launching Claude on channel" and never spawns.
  const config = hermeticClaude(
    { runDir, cwd: folder },
    {
      config: {
        projects: {
          [folder]: { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true },
        },
      },
      settings: {
        model: "sonnet",
        skipAutoPermissionPrompt: true,
        ...(start.mcp && { enableAllProjectMcpServers: true }),
        ...start.settings,
      },
    },
  );
  // The extension takes no --mcp-config, so a project's own `.mcp.json` carries the servers, each
  // told where the run's scratch is, as the terminal driver does.
  if (start.mcp)
    writeFileSync(
      join(folder, ".mcp.json"),
      JSON.stringify({
        mcpServers: Object.fromEntries(
          Object.entries(start.mcp).map(([name, spec]) => [
            name,
            { ...spec, env: { E2E_RUN_DIR: runDir, ...spec.env } },
          ]),
        ),
      }),
    );
  return config;
}

/**
 * Starts VS Code on a folder of the run and returns once its workbench answers over CDP. `cwd`
 * is the folder it opens, already filled by the scenario's setup.
 */
export async function launchVscode(
  runDir: string,
  cwd: string,
  start: VscodeStart,
  { visible = false, watchPlugins = false, signal }: VscodeLaunch = {},
): Promise<VscodeState> {
  if (visible && !process.env.WAYLAND_DISPLAY && !process.env.DISPLAY)
    throw new Error("VS Code live mode needs a desktop display.");
  signal?.throwIfAborted();
  const folder = realpathSync(cwd);
  mark("launch: start");
  const stubPort = await startStub(runDir, start.turns ?? []);
  const port = await freePort();
  const config = writeSessionConfig(runDir, folder, start);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && !inherited(k)) env[k] = v;
  if (!visible) {
    for (const key of ["DISPLAY", "WAYLAND_DISPLAY", "NIXOS_OZONE_WL"]) delete env[key];
  }
  // VS Code itself starts by the real `code`, found before the session's PATH can shadow it.
  const { code: codeBin, extensions: extensionsDir, cage, fonts } = machine();
  if (start.bin || start.hide) env.PATH = sessionPath(runDir, start.bin ?? {}, start.hide ?? []);
  Object.assign(env, config, {
    ANTHROPIC_API_KEY: STUB_KEY,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${stubPort}`,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_PLUGIN_DIRS: checkoutMods(start.plugins).join(":"),
    AGENT_HUB_HIDDEN: "1",
    WT_NO_AUTOCLOSE: "1",
    ...runEnv(runDir),
    ...(!visible && {
      WLR_BACKENDS: "headless",
      WLR_LIBINPUT_NO_DEVICES: "1",
      WLR_RENDERER: "pixman",
      WLR_HEADLESS_OUTPUTS: "1",
    }),
    ...(fonts && { FONTCONFIG_FILE: fonts }),
    ...start.env,
    // The bundled Claude runs non-interactively, where the native mod watcher is off by default.
    ...(watchPlugins && modWatchEnv),
  });
  // The window's own furniture is out of the way: no Copilot chat beside the Claude tab, no
  // welcome page, no update or sign-in nags. The explorer is hidden once the tab is open.
  mkdirSync(join(runDir, "ud", "User"), { recursive: true });
  writeFileSync(
    join(runDir, "ud", "User", "settings.json"),
    JSON.stringify({
      "chat.disableAIFeatures": true,
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "workbench.startupEditor": "none",
      "workbench.tips.enabled": false,
      "workbench.layoutControl.enabled": false,
      "update.mode": "none",
      "extensions.autoUpdate": false,
      "extensions.autoCheckUpdates": false,
      "telemetry.telemetryLevel": "off",
      "window.titleBarStyle": "custom",
      // A tab's group is not locked, so the tab a reload opens takes the closed one's place
      // instead of a new group beside it.
      "claudeCode.lockEditorGroups": false,
      // No clock or date line in the chat: a picture of a screen is the same on every run.
      "claudeCode.showMessageTimestamps": false,
    }),
  );
  // A reused profile restores the old Claude tab and the new one hangs: always a fresh one.
  // Only the Claude extension runs: another one's toast (direnv's) lands on the panel.
  mark("launch: config written");
  const others = execFileSync(codeBin, ["--list-extensions", "--extensions-dir", extensionsDir], {
    encoding: "utf8",
    env,
  })
    .split("\n")
    .map((e) => e.trim())
    .filter((e) => e && e !== "anthropic.claude-code");
  mark("launch: extensions listed");
  const args = [
    `--ozone-platform=${!visible || env.WAYLAND_DISPLAY ? "wayland" : "x11"}`,
    "--disable-gpu",
    // A prerendered page can leave a target that never answers, which fails every connect.
    "--disable-features=Prerender2,SpeculationRulesPrerender2",
    "--password-store=basic",
    "--user-data-dir",
    join(runDir, "ud"),
    // The person's installed extensions, read only; the profile is the run's own.
    "--extensions-dir",
    extensionsDir,
    ...others.flatMap((e) => ["--disable-extension", e]),
    `--remote-debugging-port=${port}`,
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--new-window",
    folder,
  ];
  const code = [codeBin, ...args].map(quote).join(" ");
  const log = join(runDir, "vscode.log");
  const log_ = openSync(log, "a");
  const [program, programArgs] = visible
    ? [codeBin, args]
    : ["setsid", [...cage, "--", "sh", "-c", `${code}; sleep infinity`]];
  const child = spawn(program, programArgs, {
    env,
    detached: true,
    stdio: ["ignore", log_, log_],
  });
  closeSync(log_);
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.unref();
  const state: VscodeState = { port, stubPort, cwd: folder, fixed: fixedOf(start) };
  writeFileSync(join(runDir, STATE), JSON.stringify(state));
  mark(visible ? "launch: desktop window spawned" : "launch: cage spawned");
  const until = Date.now() + 120_000;
  for (;;) {
    signal?.throwIfAborted();
    if (spawnError) throw spawnError;
    try {
      const targets = await listTargets(port);
      if (targets.some((t) => t.type === "page" && t.url.includes("workbench"))) {
        mark("launch: workbench target up");
        return state;
      }
    } catch {
      /* not listening yet */
    }
    if (Date.now() > until) {
      await stopVscode(runDir);
      throw new Error(`VS Code did not come up in 120s; see ${log}`);
    }
    await sleep(500);
  }
}

/** Every process of the run: its command line or environment names the run folder. */
function ofRun(runDir: string): number[] {
  const pids: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (pid === process.pid || pid === process.ppid) continue;
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      const env = readFileSync(`/proc/${pid}/environ`, "utf8");
      if (cmd.includes(runDir) || env.includes(`=${runDir}/`)) pids.push(pid);
    } catch {
      /* gone, or not ours */
    }
  }
  return pids;
}

/**
 * Closes the Claude tab of the window a `launchVscode` left in `runDir`, and with it the tab's
 * `claude`. The next `attach` opens a new tab, whose `claude` reads the mods from disk again.
 * This resets the conversation and fixture, unlike the native mod watcher.
 */
export async function closeClaudeTab(runDir: string, start: VscodeStart) {
  const state = JSON.parse(readFileSync(join(runDir, STATE), "utf8")) as VscodeState;
  if (state.fixed !== undefined && state.fixed !== fixedOf(start))
    throw new Error(
      "this scenario starts with other env, bin, hide or plugins than the window was given: use `goto`",
    );
  const webview = (t: Target_) =>
    t.type === "iframe" && t.url.includes("extensionId=Anthropic.claude-code");
  const { browser, page } = await connect(state.port);
  try {
    // The session title can be anything. Leave unrelated tabs in the visible window alone.
    const actions = JSON.stringify(`${CLAUDE_TAB} .tab-actions .action-label`);
    await page.evaluate(`document.querySelectorAll(${actions}).forEach((a) => a.click())`);
    for (let i = 0; i < 50 && (await listTargets(state.port)).some(webview); i++) await sleep(100);
    if (await page.locator(CLAUDE_TAB).count())
      throw new Error("could not close the Claude tab for replay; close it and save again");
  } finally {
    await browser.close();
  }
}

/**
 * What a new tab's `claude` reads when it starts: the stub, back on the port the window's
 * environment names and serving `start.turns` from the first, and the config folder.
 */
export async function restartSession(runDir: string, start: VscodeStart) {
  const state = JSON.parse(readFileSync(join(runDir, STATE), "utf8")) as VscodeState;
  stopStub(runDir);
  // The old stub lets go of the port a moment after the signal.
  for (let i = 0; ; i++) {
    try {
      await startStub(runDir, start.turns ?? [], undefined, state.stubPort);
      break;
    } catch (err) {
      if (i >= 20) throw err;
      await sleep(150);
    }
  }
  writeSessionConfig(runDir, state.cwd, start);
}

/** Ends VS Code, cage, the claude the extension started and the stub of one run, and nothing else. */
export async function stopVscode(runDir: string) {
  stopStub(runDir);
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    const pids = ofRun(runDir);
    if (pids.length === 0) return;
    for (const pid of pids)
      try {
        process.kill(pid, signal);
      } catch {
        /* already gone */
      }
    await sleep(signal === "SIGTERM" ? 2000 : 500);
  }
}

type Target_ = { id: string; type: string; url: string; webSocketDebuggerUrl: string };

export async function waitForVscodeClose(port: number, signal: AbortSignal) {
  while (!signal.aborted) {
    const targets = await listTargets(port).catch(() => []);
    if (!targets.some((t) => t.type === "page" && t.url.includes("workbench"))) return;
    await sleep(400);
  }
}

/** The DevTools port's own list: it answers before any browser is attached and cannot hang. */
async function listTargets(port: number): Promise<Target_[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()) as Target_[];
}

/**
 * Attaches Playwright to the window and returns its workbench page. Closing the browser only
 * lets go of the connection: VS Code runs on.
 */
async function connect(port: number): Promise<{ browser: Browser; page: Page }> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000 });
  } catch {
    throw new Error("VS Code is not answering: run `goto` again");
  }
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes("workbench"));
  if (!page) {
    await browser.close();
    throw new Error("VS Code is not answering: run `goto` again");
  }
  return { browser, page };
}

const NAMED: Record<string, string> = {
  enter: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  space: "Space",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};
const MODIFIERS: Record<string, string> = {
  alt: "Alt",
  ctrl: "Control",
  control: "Control",
  meta: "Meta",
  cmd: "Meta",
  shift: "Shift",
};

/** "Enter", "Down", "a", "Ctrl+c", "Shift+Tab" as the chord Playwright's keyboard takes. */
function chord(spec: string): string {
  const parts = spec.split("+");
  const last = parts.length > 1 && parts.at(-1) === "" ? "+" : (parts.pop() as string);
  const mods = parts.map((m) => {
    const name = MODIFIERS[m.toLowerCase()];
    if (!name) throw new Error(`unknown modifier "${m}" in "${spec}"`);
    return name;
  });
  const named = NAMED[last.toLowerCase()];
  if (!named && [...last].length !== 1) throw new Error(`unknown key "${spec}"`);
  return [...mods, named ?? last].join("+");
}

const matcher = (p: Pattern) =>
  typeof p === "string" ? { text: p } : { re: p.source, flags: p.flags };

export type Shot = { panel?: boolean };

/** A VS Code window with the Claude tab open, and the calls to look at it and drive it. */
export class VscodeSession {
  readonly runDir: string;
  readonly state: VscodeState;
  private browser: Browser;
  private page: Page;
  /** The Claude webview's document, found again on each call: a reload replaces the frame. */
  private view: FrameLocator;
  private panel: Locator;
  private cdp?: CDPSession;
  private constructor(
    runDir: string,
    state: VscodeState,
    browser: Browser,
    page: Page,
    webview: string,
  ) {
    this.runDir = runDir;
    this.state = state;
    this.browser = browser;
    this.page = page;
    const outer = `iframe.webview[name="${webview}"]`;
    this.panel = page.locator(outer);
    this.view = page.frameLocator(outer).frameLocator("#active-frame");
  }

  /** Connects to the window a `launchVscode` left in `runDir`, opening the Claude tab if needed. */
  static async attach(runDir: string): Promise<VscodeSession> {
    const state = JSON.parse(readFileSync(join(runDir, STATE), "utf8")) as VscodeState;
    const { browser, page } = await connect(state.port);
    try {
      // The Claude tab's webview is the one on screen. A window can hold another, hidden: a
      // second Claude tab, or the one a reload closed, still going.
      const shownView = () =>
        page.evaluate<string | null>(`(() => {
          let best = null;
          for (const f of document.querySelectorAll(${JSON.stringify(CLAUDE_VIEW)})) {
            const r = f.getBoundingClientRect();
            if (r.width < 50 || r.height < 50 || getComputedStyle(f).visibility === 'hidden') continue;
            if (!best || r.width * r.height > best.area) best = { area: r.width * r.height, id: f.name || f.id };
          }
          return best && best.id;
        })()`);
      let view = await shownView();
      if (!view) {
        // A key sent before the workbench is up goes nowhere.
        await page
          .locator(".monaco-workbench .part.editor")
          .waitFor({ state: "attached", timeout: 60_000 });
        mark("attach: workbench DOM ready");
        // A press before the extension has activated is lost; its status bar entry says it has.
        await page
          .locator('[id="Anthropic.claude-code"]')
          .waitFor({ state: "attached", timeout: 30_000 });
        mark("attach: extension active");
        // Ctrl+Shift+Escape opens the Claude tab. A slow start can still lose the press, so it is
        // sent again after 5 s with no Claude tab in the workbench (and not once there is one, or a
        // second tab opens), and the webview is looked for in between.
        const tab = page.locator(CLAUDE_TAB);
        const until = Date.now() + 60_000;
        let sent = 0;
        while (!view && Date.now() < until) {
          if (Date.now() - sent > 5000 && (await tab.count()) === 0) {
            await page.keyboard.press("Control+Shift+Escape");
            sent = Date.now();
          }
          await sleep(200);
          view = await shownView();
        }
        mark("attach: Claude tab open");
        if (!view) throw new Error("the Claude tab did not open (is the extension installed?)");
        // Ctrl+B hides the explorer, so the tab has the whole width and a resize reflows it the same
        // way. It toggles: a reload's new tab finds it hidden already.
        const box = await page.locator("#workbench\\.parts\\.sidebar").boundingBox();
        if ((box?.width ?? 0) > 0) {
          await page.keyboard.press("Control+b");
          await sleep(500);
        }
      }
      mark("attach: explorer hidden");
      const session = new VscodeSession(runDir, state, browser, page, view);
      // The webview is ready once its document holds the prompt.
      await session.wait(/\S/, { timeout: 60_000 });
      mark("attach: webview has text");
      if (state.size) await session.applySize(state.size);
      return session;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /** Lets go of the window, which stays open. */
  close() {
    void this.browser.close().catch(() => undefined);
  }

  /** The Claude webview's frame, to run script in. */
  private async frame(): Promise<Frame> {
    const frame = await (await this.view.owner().elementHandle({ timeout: 5000 })).contentFrame();
    if (!frame) throw new Error("the Claude webview is not on screen");
    return frame;
  }

  /** `js`, an expression, evaluated in the Claude webview's document. */
  async evalInView<T = unknown>(js: string): Promise<T> {
    return (await this.frame()).evaluate<T>(`(${js})`);
  }

  /** The visible text of the Claude webview. */
  async text(): Promise<string> {
    try {
      return await this.view.locator("body").innerText({ timeout: 2000 });
    } catch {
      return "";
    }
  }

  /** Until the webview shows the text or pattern (or, with `gone`, stops showing it). */
  async wait(pattern: Pattern, o: { gone?: boolean; timeout?: number } = {}) {
    const until = Date.now() + (o.timeout ?? 15_000);
    let last = "";
    for (;;) {
      last = await this.text();
      const has = typeof pattern === "string" ? last.includes(pattern) : pattern.test(last);
      if (has !== !!o.gone) return;
      if (Date.now() > until)
        throw new Error(
          `timed out waiting for ${o.gone ? "no " : ""}${pattern}; the view shows:\n${last}`,
        );
      await sleep(150);
    }
  }

  /** Be still: the text unchanged for `quiet` ms. */
  async settle(quiet = 400, timeout = 5000) {
    const until = Date.now() + timeout;
    let last = await this.text();
    let since = Date.now();
    while (Date.now() < until && Date.now() - since < quiet) {
      await sleep(80);
      const now = await this.text();
      if (now !== last) {
        last = now;
        since = Date.now();
      }
    }
  }

  /**
   * The visible element whose own text matches, as a handle. Buttons, links and the like come
   * first, then any element; within each, an exact text before a partial one, then document order.
   */
  private async locate(t: Target): Promise<{ el: ElementHandle; label: string } | undefined> {
    const spec = typeof t === "object" && !(t instanceof RegExp) ? t : { text: t, nth: 0 };
    const m = matcher(spec.text);
    const handle = await (
      await this.frame()
    ).evaluateHandle(`(() => {
      const doc = document;
      const m = ${JSON.stringify(m)};
      const hit = (s) => m.re !== undefined ? new RegExp(m.re, m.flags).test(s) : s.includes(m.text);
      const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const s = doc.defaultView.getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none';
      };
      const ACTIVE = 'button, a, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], summary';
      const exact = (s) => m.re === undefined && s === m.text;
      const seen = new Set(); const tiers = [[], [], [], []];
      for (const el of doc.querySelectorAll('*')) {
        const ownText = el.matches('button, a, [role=button], summary') ? (el.innerText || '').trim() : own(el);
        const label = el.getAttribute('aria-label') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        if (!(hit(ownText) || exact(label) || hit(placeholder) || (!ownText && hit(label)))) continue;
        const target = el.closest(ACTIVE) || el;
        if (seen.has(target) || !visible(target)) continue;
        seen.add(target);
        // Buttons and links before other elements, and within each an exact text before a part of one.
        tiers[(target.matches(ACTIVE) ? 0 : 2) + (exact(ownText) ? 0 : 1)].push(target);
      }
      const el = tiers.flat()[${spec.nth ?? 0}];
      return { el: el ?? null, label: el ? (el.innerText || own(el) || '').trim().slice(0, 40) : '' };
    })()`);
    const el = (await handle.getProperty("el")).asElement();
    if (!el) return undefined;
    return { el, label: (await (await handle.getProperty("label")).jsonValue()) as string };
  }

  /** `locate`, looking for a moment: the element may still be drawing. */
  private async find(t: Target, verb: string) {
    const spec = typeof t === "object" && !(t instanceof RegExp) ? t : { text: t, nth: 0 };
    for (let i = 0; i < 20; i++) {
      const found = await this.locate(t);
      if (found) return found;
      await sleep(150);
    }
    throw new Error(`nothing visible to ${verb} for ${spec.text} (nth ${spec.nth ?? 0})`);
  }

  /** Click the visible element whose own text matches; `{text, nth}` picks a later one. */
  async click(t: Target, clicks = 1): Promise<string> {
    const { el, label } = await this.find(t, "click");
    await el.click({ clickCount: clicks, timeout: 5000 });
    await this.settle();
    return label;
  }

  /** Move the pointer onto the element, as `click` finds it. */
  async hover(t: Target) {
    const { el } = await this.find(t, "hover");
    await el.hover({ timeout: 5000 });
    await this.settle();
  }

  /** Literal characters into the focused field; the message input when none is. */
  async type(text: string) {
    const editable = await (
      await this.frame()
    ).evaluate<boolean>(`(() => {
      const a = document.activeElement;
      return !!a && (a.isContentEditable || ['INPUT', 'TEXTAREA'].includes(a.tagName));
    })()`);
    if (!editable) {
      // A new tab's input can draw a moment after the rest of its page: look for a few seconds.
      try {
        await this.view.locator('[aria-label="Message input"]').click({ timeout: 5000 });
      } catch {
        throw new Error("the message input is not on screen");
      }
      await sleep(250);
    }
    await this.page.keyboard.insertText(text);
    await this.settle();
  }

  /** Named keys, in order: "Enter", "Escape", "Tab", "Down", "Ctrl+c", "a". */
  async press(keys: string | string[]) {
    for (const spec of Array.isArray(keys) ? keys : [keys]) {
      await this.page.keyboard.press(chord(spec));
      await sleep(60);
    }
    await this.settle();
  }

  /**
   * How many of a mod's pictures (its `Svg`, such as an icon) the panel shows as their alt text.
   * The host draws them off the page, in a frame of its own; until it has, or when it refuses, the
   * alt text stands in, beside the hidden `img` or marked `svgWaiting`.
   */
  async undrawn(): Promise<number> {
    return this.evalInView<number>(`[...document.images].filter((i) =>
      i.src.startsWith('data:image/svg+xml') && getComputedStyle(i).display === 'none').length +
      document.querySelectorAll('[class*="svgWaiting"]').length`).catch(() => 0);
  }

  /** A PNG of the window, or with `panel` of the Claude panel alone. */
  async shot(file: string, o: Shot = {}): Promise<string> {
    // Attaching re-applies the viewport, which redraws the panel; a shot taken at once catches
    // it blank.
    await this.settle(1000, 8000);
    // A new tab can take seconds to draw a mod's pictures, and a reload's tab may not draw them
    // at all (e2e README, VS Code, Traps).
    const until = Date.now() + 10_000;
    let left = 0;
    while ((left = await this.undrawn()) > 0 && Date.now() < until) await sleep(200);
    if (left > 0) console.error(`shot: ${left} picture(s) of the panel not drawn after 10 s`);
    const capture = () => (o.panel ? this.panel : this.page).screenshot({ type: "png" });
    let data = await capture();
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      const next = await capture();
      if (next.equals(data)) break;
      data = next;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
    return file;
  }

  /**
   * Sets the window's size by overriding the page's viewport: cage keeps the output at 1280x720
   * whatever is asked of it. The override lasts as long as this connection, so the size is saved
   * in the run's state and `attach` applies it again.
   */
  async resize(width: number, height: number) {
    await this.applySize([width, height]);
    writeFileSync(
      join(this.runDir, STATE),
      JSON.stringify({ ...this.state, size: [width, height] }),
    );
    this.state.size = [width, height];
    await this.settle(600, 6000);
  }

  async useWindowSize() {
    if (!this.state.size) return;
    await (await this.emulation()).send("Emulation.clearDeviceMetricsOverride");
    delete this.state.size;
    writeFileSync(join(this.runDir, STATE), JSON.stringify(this.state));
  }

  /**
   * The raw DevTools session the size goes through: an override is undone only by the session that
   * set it, and Playwright keeps no way back to the window's own size.
   */
  private async emulation() {
    this.cdp ??= await this.page.context().newCDPSession(this.page);
    return this.cdp;
  }

  private async applySize([width, height]: [number, number]) {
    await (
      await this.emulation()
    ).send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}
