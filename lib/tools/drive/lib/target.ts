/**
 * What a verb drives: one `Target` per harness, behind the same calls. A terminal agent (claude,
 * pi) is driven through the tui-test daemon, VS Code through its window (`lib/vscode.ts`), and
 * Claude Desktop not at all (it is only launched). A verb a harness can't do fails with a message
 * that says so.
 */
import { join } from "node:path";
import type { Kind } from "./find.ts";
import { options } from "./options.ts";
import type { Resolved } from "./scenario.ts";
import { EXTREME_SIZES, Session } from "./session.ts";
import type { VscodeSession } from "./vscode.ts";

export type Spot = { text: string; nth: number };

export interface Target {
  readonly kind: Kind;
  /** The screen as text. */
  text(): Promise<string>;
  keys(keys: string[]): Promise<void>;
  type(text: string): Promise<void>;
  paste(text: string): Promise<void>;
  /** Returns what was clicked, when the harness can say. */
  click(at: Spot, double: boolean): Promise<string | undefined>;
  hover(at: Spot): Promise<void>;
  wait(pattern: RegExp, seconds: number): Promise<void>;
  /** Columns by rows for a terminal, pixels for VS Code. */
  resize(a: number, b: number): Promise<void>;
  /** A PNG of the screen; the path it was written to. */
  shot(file: string | undefined, o: { window?: boolean }): Promise<string>;
  /** PNGs at the sizes a screen has to hold at; their paths. */
  sweep(): Promise<string[]>;
  /** The scenario's snapshot of the screen as it is now. */
  snap(r: Resolved): Promise<string>;
  /** An expression in the Claude webview's document. */
  eval(js: string): Promise<unknown>;
  /** Lets go of the connection; the session itself runs on. */
  detach(): void;
}

const stamp = () => new Date().toTimeString().slice(0, 8).replaceAll(":", "");

/** Every verb fails until a harness says it can. */
abstract class Base implements Target {
  abstract readonly kind: Kind;
  protected no(verb: string, why?: string): never {
    const only: Record<string, string> = {
      eval: "vscode sessions only",
      snap: "claude and pi sessions only",
    };
    throw new Error(
      `${verb} is not available for ${this.kind} sessions${why ? `: ${why}` : only[verb] ? ` (${only[verb]})` : ""}`,
    );
  }
  text(): Promise<string> {
    return this.no("cap");
  }
  keys(_keys: string[]): Promise<void> {
    return this.no("keys");
  }
  type(_text: string): Promise<void> {
    return this.no("type");
  }
  paste(_text: string): Promise<void> {
    return this.no("paste");
  }
  click(_at: Spot, _double: boolean): Promise<string | undefined> {
    return this.no("click");
  }
  hover(_at: Spot): Promise<void> {
    return this.no("hover");
  }
  wait(_pattern: RegExp, _seconds: number): Promise<void> {
    return this.no("wait");
  }
  resize(_a: number, _b: number): Promise<void> {
    return this.no("resize");
  }
  shot(_file: string | undefined, _o: { window?: boolean }): Promise<string> {
    return this.no("shot");
  }
  sweep(): Promise<string[]> {
    return this.no("sweep");
  }
  snap(_r: Resolved): Promise<string> {
    return this.no("snap");
  }
  eval(_js: string): Promise<unknown> {
    return this.no("eval");
  }
  detach() {}
}

/** claude and pi: a terminal behind the tui-test daemon. */
export class TerminalTarget extends Base {
  readonly kind: Kind;
  readonly session: Session;
  constructor(kind: "claude" | "pi", session: Session) {
    super();
    this.kind = kind;
    this.session = session;
  }
  text() {
    return this.session.text();
  }
  keys(keys: string[]) {
    return this.session.press(keys);
  }
  type(text: string) {
    return this.session.type(text);
  }
  paste(text: string) {
    return this.session.paste(text);
  }
  async click(at: Spot, double: boolean) {
    await this.session.click(at, double ? 2 : 1);
    return undefined;
  }
  hover(at: Spot) {
    return this.session.hover(at);
  }
  wait(pattern: RegExp, seconds: number) {
    return this.session.wait(pattern, { timeout: seconds * 1000 });
  }
  resize(cols: number, rows: number) {
    return this.session.resize(cols, rows);
  }
  shot(file: string | undefined, o: { window?: boolean }) {
    if (o.window) this.no("shot --window", "a terminal's screen is the whole window");
    return this.session.png(file ?? join(this.session.runDir, `shot-${stamp()}.png`));
  }
  async sweep() {
    const before = await this.session.size();
    const dir = join(this.session.runDir, "sweep");
    const out: string[] = [];
    try {
      for (const [cols, rows] of EXTREME_SIZES) {
        await this.session.resize(cols, rows);
        out.push(await this.session.png(join(dir, `${cols}x${rows}.png`)));
      }
    } finally {
      await this.session.resize(before.cols, before.rows);
    }
    return out;
  }
  async snap(r: Resolved) {
    const sz = await this.session.size();
    return this.session.snapshot(
      `${r.label}/${r.harness}/${r.name} ${sz.cols}x${sz.rows}`,
      r.region,
      r.mask,
    );
  }
}

/** The widths `sweep` shoots in VS Code: a narrow side panel and a wide editor. */
const VSCODE_SWEEP: [number, number][] = [
  [420, 800],
  [1280, 720],
];

/** The Claude extension in a VS Code window. */
export class VscodeTarget extends Base {
  readonly kind = "vscode" as const;
  readonly session: VscodeSession;
  constructor(session: VscodeSession) {
    super();
    this.session = session;
  }
  text() {
    return this.session.text();
  }
  keys(keys: string[]) {
    return this.session.press(keys);
  }
  type(text: string) {
    return this.session.type(text);
  }
  // The extension's message input takes text as one insertion, which is what a paste is.
  paste(text: string) {
    return this.session.type(text);
  }
  click(at: Spot, double: boolean) {
    return this.session.click(at, double ? 2 : 1);
  }
  hover(at: Spot) {
    return this.session.hover(at);
  }
  wait(pattern: RegExp, seconds: number) {
    return this.session.wait(pattern, { timeout: seconds * 1000 });
  }
  resize(w: number, h: number) {
    return this.session.resize(w, h);
  }
  async shot(file: string | undefined, o: { window?: boolean }) {
    await this.session.setScale(options.scale ?? 1);
    return this.session.shot(file ?? join(this.session.runDir, `shot-${stamp()}.png`), {
      panel: !o.window,
    });
  }
  async sweep() {
    await this.session.setScale(options.scale ?? 1);
    const before = this.session.state.size;
    const dir = join(this.session.runDir, "sweep");
    const out: string[] = [];
    for (const [w, h] of VSCODE_SWEEP) {
      await this.session.resize(w, h);
      out.push(await this.session.shot(join(dir, `${w}x${h}.png`), { panel: true }));
    }
    const [w, h] = before ?? VSCODE_SWEEP[VSCODE_SWEEP.length - 1]!;
    await this.session.resize(w, h);
    return out;
  }
  async eval(js: string) {
    await this.session.settle(800, 6000);
    return this.session.evalInView(js);
  }
  detach() {
    this.session.close();
  }
}

/** Claude Desktop: launched and left alone; every verb of a session fails. */
export class DesktopTarget extends Base {
  readonly kind = "desktop" as const;
  protected no(verb: string): never {
    throw new Error(
      `${verb} is not available for desktop sessions: Claude Desktop can only be launched (live and goto)`,
    );
  }
}
