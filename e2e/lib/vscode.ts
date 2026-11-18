/**
 * Drives a real, headless VS Code with the `anthropic.claude-code` extension: the sibling of
 * `lib/session.ts` for the one surface a terminal does not show. Local only.
 *
 * VS Code runs in `cage` (a Wayland compositor with a headless output) and is steered over the
 * Chrome DevTools Protocol: the workbench is the `page` target, the Claude tab's webview is an
 * `iframe` target whose UI lives in `#active-frame`. Nothing here is a mock: the extension's own
 * `claude` runs against the model stub (`lib/stub.ts`) in a hermetic config folder.
 *
 * `launchVscode` starts it detached so it outlives the process, and `VscodeSession.attach`
 * reconnects over the saved port, which is how the CLI's verbs share one window.
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  chmodSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { checkoutMods, hermeticClaude, STUB_KEY, type Turn } from "./harness.ts";
import { notesEnv } from "./setup.ts";
import type { Pattern } from "./screen.ts";
import type { Target } from "./session.ts";
import { startStub, stopStub } from "./stub.ts";

export type VscodeStart = {
  /** Assistant turns the stub serves, in order. A session starts on the first prompt or command. */
  turns?: Turn[];
  /** The mods (`plugins/<name>`) to load; every mod of the checkout when left out. */
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
export type VscodeState = { port: number; stubPort: number; cwd: string; size?: [number, number] };

const STATE = "vscode.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * A PATH for the session: `bin`'s scripts first, then a folder of links to every command of this
 * process's PATH but `hide`'s and `bin`'s. A PATH cannot mask a command a later directory has, so
 * a program a scenario wants missing is left out of the links.
 */
function sessionPath(runDir: string, bin: Record<string, string>, hide: string[]): string {
  const stand = join(runDir, "bin");
  const links = join(runDir, "path");
  mkdirSync(stand, { recursive: true });
  mkdirSync(links, { recursive: true });
  for (const [name, script] of Object.entries(bin)) {
    writeFileSync(join(stand, name), script);
    chmodSync(join(stand, name), 0o755);
  }
  const skip = new Set([...hide, ...Object.keys(bin)]);
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (skip.has(name)) continue;
      skip.add(name);
      try {
        symlinkSync(join(dir, name), join(links, name));
      } catch {
        /* not linkable */
      }
    }
  }
  return `${stand}:${links}`;
}

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** What of this process's environment VS Code and the claude it spawns must not inherit. */
const inherited = (name: string) =>
  /^(CLAUDE|ANTHROPIC|VSCODE_|ELECTRON_)/.test(name) ||
  ["DISPLAY", "WAYLAND_DISPLAY", "NIXOS_OZONE_WL"].includes(name);

/**
 * Starts VS Code on a folder of the run and returns once its workbench answers over CDP. `cwd`
 * is the folder it opens, already filled by the scenario's setup.
 */
export async function launchVscode(
  runDir: string,
  cwd: string,
  start: VscodeStart,
): Promise<VscodeState> {
  const folder = realpathSync(cwd);
  const stubPort = await startStub(runDir, start.turns ?? []);
  const port = await freePort();
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
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && !inherited(k)) env[k] = v;
  // VS Code itself starts by the real `code`, found before the session's PATH can shadow it.
  const codeBin = execFileSync("which", ["code"], { encoding: "utf8" }).trim();
  if (start.bin || start.hide) env.PATH = sessionPath(runDir, start.bin ?? {}, start.hide ?? []);
  Object.assign(env, config, {
    ANTHROPIC_API_KEY: STUB_KEY,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${stubPort}`,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_PLUGIN_DIRS: checkoutMods(start.plugins).join(":"),
    AGENT_HUB_HIDDEN: "1",
    WT_NO_AUTOCLOSE: "1",
    ...notesEnv(runDir),
    WLR_BACKENDS: "headless",
    WLR_LIBINPUT_NO_DEVICES: "1",
    WLR_RENDERER: "pixman",
    WLR_HEADLESS_OUTPUTS: "1",
    ...start.env,
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
      "telemetry.telemetryLevel": "off",
      "window.titleBarStyle": "custom",
    }),
  );
  // A reused profile restores the old Claude tab and the new one hangs: always a fresh one.
  // Only the Claude extension runs: another one's toast (direnv's) lands on the panel.
  const extensionsDir = join(process.env.HOME ?? "", ".vscode", "extensions");
  const others = execFileSync(codeBin, ["--list-extensions", "--extensions-dir", extensionsDir], {
    encoding: "utf8",
    env,
  })
    .split("\n")
    .map((e) => e.trim())
    .filter((e) => e && e !== "anthropic.claude-code");
  const code = [
    `${quote(codeBin)} --ozone-platform=wayland --disable-gpu --password-store=basic`,
    `--user-data-dir ${quote(join(runDir, "ud"))}`,
    // The person's installed extensions, read only; the profile is the run's own.
    '--extensions-dir "$HOME/.vscode/extensions"',
    ...others.map((e) => `--disable-extension ${quote(e)}`),
    `--remote-debugging-port=${port}`,
    "--disable-workspace-trust --skip-welcome --skip-release-notes --new-window",
    quote(folder),
  ].join(" ");
  const log = join(runDir, "vscode.log");
  const log_ = openSync(log, "a");
  const child = spawn(
    "setsid",
    ["nix", "run", "nixpkgs#cage", "--", "--", "sh", "-c", `${code}; sleep infinity`],
    { env, detached: true, stdio: ["ignore", log_, log_] },
  );
  child.unref();
  const state: VscodeState = { port, stubPort, cwd: folder };
  writeFileSync(join(runDir, STATE), JSON.stringify(state));
  const until = Date.now() + 120_000;
  for (;;) {
    try {
      const targets = await listTargets(port);
      if (targets.some((t) => t.type === "page" && t.url.includes("workbench"))) return state;
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

async function listTargets(port: number): Promise<Target_[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()) as Target_[];
}

/** One CDP connection to a target. */
class Cdp {
  private id = 0;
  private pending = new Map<number, [(v: unknown) => void, (e: Error) => void]>();
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data)) as { id?: number; result?: unknown; error?: unknown };
      const p = d.id === undefined ? undefined : this.pending.get(d.id);
      if (!p || d.id === undefined) return;
      this.pending.delete(d.id);
      if (d.error) p[1](new Error(JSON.stringify(d.error)));
      else p[0](d.result);
    };
  }
  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
    });
    return new Cdp(ws);
  }
  send<T = Record<string, unknown>>(method: string, params: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, [resolve as (v: unknown) => void, reject]);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T>(expression: string): Promise<T> {
    const r = await this.send<{
      result: { value: T };
      exceptionDetails?: unknown;
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  }
  close() {
    this.ws.close();
  }
}

type KeyDef = { key: string; code: string; vk: number; text?: string };

const NAMED: Record<string, KeyDef> = {
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  esc: { key: "Escape", code: "Escape", vk: 27 },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
  up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  home: { key: "Home", code: "Home", vk: 36 },
  end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 },
  pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
};
const MODIFIERS: Record<string, number> = {
  alt: 1,
  ctrl: 2,
  control: 2,
  meta: 4,
  cmd: 4,
  shift: 8,
};

/** "Enter", "Down", "a", "Ctrl+c", "Shift+Tab" as a CDP key and its modifier mask. */
function parseKey(spec: string): { def: KeyDef; modifiers: number } {
  const parts = spec.split("+");
  const last = parts.length > 1 && parts.at(-1) === "" ? "+" : (parts.pop() as string);
  let modifiers = 0;
  for (const m of parts) {
    const bit = MODIFIERS[m.toLowerCase()];
    if (bit === undefined) throw new Error(`unknown modifier "${m}" in "${spec}"`);
    modifiers |= bit;
  }
  const named = NAMED[last.toLowerCase()];
  if (named) return { def: named, modifiers };
  if ([...last].length !== 1) throw new Error(`unknown key "${spec}"`);
  const upper = last.toUpperCase();
  const code = /[a-z]/i.test(last) ? `Key${upper}` : /\d/.test(last) ? `Digit${last}` : "";
  return {
    def: {
      key: last,
      code,
      vk: upper.charCodeAt(0),
      // A chord with Ctrl or Alt types no character.
      ...(modifiers & 3 ? {} : { text: last }),
    },
    modifiers,
  };
}

const matcher = (p: Pattern) =>
  typeof p === "string" ? { text: p } : { re: p.source, flags: p.flags };

export type Shot = { panel?: boolean };

/** A VS Code window with the Claude tab open, and the calls to look at it and drive it. */
export class VscodeSession {
  readonly runDir: string;
  readonly state: VscodeState;
  private page: Cdp;
  private view: Cdp;
  private constructor(runDir: string, state: VscodeState, page: Cdp, view: Cdp) {
    this.runDir = runDir;
    this.state = state;
    this.page = page;
    this.view = view;
  }

  /** Connects to the window a `launchVscode` left in `runDir`, opening the Claude tab if needed. */
  static async attach(runDir: string): Promise<VscodeSession> {
    const state = JSON.parse(readFileSync(join(runDir, STATE), "utf8")) as VscodeState;
    const find = async () => {
      const targets = await listTargets(state.port);
      return {
        page: targets.find((t) => t.type === "page" && t.url.includes("workbench")),
        view: targets.find((t) => t.type === "iframe" && t.url.startsWith("vscode-webview://")),
      };
    };
    let { page, view } = await find();
    if (!page) throw new Error("VS Code is not answering: run `goto` again");
    const pageCdp = await Cdp.connect(page.webSocketDebuggerUrl);
    if (!view) {
      // A key sent before the workbench is up goes nowhere.
      for (let i = 0; i < 120; i++) {
        if (
          await pageCdp.eval<boolean>("!!document.querySelector('.monaco-workbench .part.editor')")
        )
          break;
        await sleep(500);
      }
      // Ctrl+Shift+Escape opens the Claude tab; the extension may not have activated for the
      // first one, so it is sent again while nothing has appeared.
      for (let attempt = 0; attempt < 4 && !view; attempt++) {
        await key(pageCdp, parseKey("Ctrl+Shift+Escape"));
        for (let i = 0; i < 20 && !view; i++) {
          await sleep(500);
          view = (await find()).view;
        }
      }
      if (!view) throw new Error("the Claude tab did not open (is the extension installed?)");
      // Ctrl+B hides the explorer, so the tab has the whole width and a resize reflows it the same way.
      await key(pageCdp, parseKey("Ctrl+b"));
      await sleep(500);
    }
    const viewCdp = await Cdp.connect(view.webSocketDebuggerUrl);
    const session = new VscodeSession(runDir, state, pageCdp, viewCdp);
    // The webview is ready once its document holds the prompt.
    await session.wait(/\S/, { timeout: 60_000 });
    if (state.size) await session.applySize(state.size);
    return session;
  }

  close() {
    this.page.close();
    this.view.close();
  }

  private doc = "document.getElementById('active-frame').contentDocument";

  /** `js` evaluated in the Claude webview's document, whose `document` is the page of `#active-frame`. */
  async evalInView<T = unknown>(js: string): Promise<T> {
    return this.view.eval<T>(`(function(document){ return (${js}); })(${this.doc})`);
  }

  /** The visible text of the Claude webview. */
  async text(): Promise<string> {
    try {
      return await this.view.eval<string>(`${this.doc}.body.innerText`);
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

  private async mouse(x: number, y: number, clicks: number) {
    const m = (type: string, extra: object) =>
      this.view.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
    await m("mouseMoved", { button: "none", buttons: 0 });
    for (let i = 1; i <= clicks; i++) {
      await m("mousePressed", { button: "left", buttons: 1, clickCount: i });
      await m("mouseReleased", { button: "left", buttons: 0, clickCount: i });
    }
  }

  /**
   * The centre, in webview coordinates, of the visible element whose own text matches. Buttons,
   * links and the like come first, then any element; within each, an exact text before a partial
   * one, then document order.
   */
  private async locate(t: Target): Promise<{ x: number; y: number; label: string } | undefined> {
    const spec = typeof t === "object" && !(t instanceof RegExp) ? t : { text: t, nth: 0 };
    const m = matcher(spec.text);
    return this.view.eval(`(() => {
      const doc = ${this.doc};
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
        const aria = el.getAttribute('aria-label') || '';
        if (!ownText && !aria) continue;
        if (!(hit(ownText) || (!ownText && hit(aria)))) continue;
        const target = el.closest(ACTIVE) || el;
        if (seen.has(target) || !visible(target)) continue;
        seen.add(target);
        // Buttons and links before other elements, and within each an exact text before a part of one.
        tiers[(target.matches(ACTIVE) ? 0 : 2) + (exact(ownText) ? 0 : 1)].push(target);
      }
      const el = tiers.flat()[${spec.nth ?? 0}];
      if (!el) return undefined;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: (el.innerText || own(el) || '').trim().slice(0, 40) };
    })()`);
  }

  /** Click the visible element whose own text matches; `{text, nth}` picks a later one. */
  async click(t: Target, clicks = 1): Promise<string> {
    const spec = typeof t === "object" && !(t instanceof RegExp) ? t : { text: t, nth: 0 };
    // The element may still be drawing: look for a moment before giving up.
    let at: Awaited<ReturnType<VscodeSession["locate"]>>;
    for (let i = 0; i < 20 && !at; i++) {
      at = await this.locate(t);
      if (!at) await sleep(150);
    }
    if (!at) throw new Error(`nothing visible to click for ${spec.text} (nth ${spec.nth ?? 0})`);
    await this.mouse(at.x, at.y, clicks);
    await this.settle();
    return at.label;
  }

  /** Move the pointer onto the element, as `click` finds it. */
  async hover(t: Target) {
    const at = await this.locate(t);
    if (!at) throw new Error("nothing visible to hover");
    await this.view.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: at.x,
      y: at.y,
      button: "none",
    });
    await this.settle();
  }

  /** Literal characters into the focused field; the message input when none is. */
  async type(text: string) {
    const editable = await this.view.eval<boolean>(`(() => {
      const a = ${this.doc}.activeElement;
      return !!a && (a.isContentEditable || ['INPUT', 'TEXTAREA'].includes(a.tagName));
    })()`);
    if (!editable) {
      const r = await this.view.eval<{ x: number; y: number } | null>(`(() => {
        const b = ${this.doc}.querySelector('[aria-label="Message input"]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (!r) throw new Error("the message input is not on screen");
      await this.mouse(r.x, r.y, 1);
      await sleep(250);
    }
    await this.view.send("Input.insertText", { text });
    await this.settle();
  }

  /** Named keys, in order: "Enter", "Escape", "Tab", "Down", "Ctrl+c", "a". */
  async press(keys: string | string[]) {
    for (const spec of Array.isArray(keys) ? keys : [keys]) {
      await key(this.view, parseKey(spec));
      await sleep(60);
    }
    await this.settle();
  }

  /** Where the Claude webview sits in the window, in page pixels. */
  private async panelRect() {
    return this.page.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
      let best = null;
      for (const f of document.querySelectorAll('iframe.webview')) {
        const r = f.getBoundingClientRect();
        if (r.width < 50 || r.height < 50 || getComputedStyle(f).visibility === 'hidden') continue;
        if (!best || r.width * r.height > best.width * best.height)
          best = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      return best;
    })()`);
  }

  /** A PNG of the window, or with `panel` of the Claude panel alone. */
  async shot(file: string, o: Shot = {}): Promise<string> {
    // Attaching re-applies the viewport, which redraws the panel; a shot taken at once catches
    // it blank.
    await this.settle(1000, 8000);
    const clip = o.panel ? await this.panelRect() : null;
    const r = await this.page.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.data, "base64"));
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

  private async applySize([width, height]: [number, number]) {
    await this.page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}

async function key(cdp: Cdp, { def, modifiers }: { def: KeyDef; modifiers: number }) {
  const common = {
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.vk,
    nativeVirtualKeyCode: def.vk,
    modifiers,
  };
  await cdp.send("Input.dispatchKeyEvent", {
    type: def.text ? "keyDown" : "rawKeyDown",
    ...common,
    ...(def.text ? { text: def.text } : {}),
  });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}
