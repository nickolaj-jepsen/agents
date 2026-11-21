/**
 * The /docfix sidebar in pi: the shared screen (`../core/screen.ts`) painted in an overlay on
 * the right, from the top down to the editor, which stays in view. Keys and the mouse go through
 * the screen's reducer; this only paints, finds the control under the pointer, and carries the
 * main action out: the dismissed ones are dismissed here, and the applied ones go to the caller,
 * which drafts the prompt.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type Component,
  type OverlayOptions,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { cellAt, paintLines, type Cell } from "../../../kit/paint/pi.ts";
import { openQueue, type Suggestion } from "../core/docfix.ts";
import {
  decided,
  drawScreen,
  keyIntent,
  reduce,
  startState,
  zoneAt,
  type Intent,
  type ScreenOptions,
  type ScreenState,
  type Zones,
} from "../core/screen.ts";

export type PanelDeps = {
  /** Dismisses what the main action carries out. */
  dismiss(picked: Suggestion[]): Promise<void>;
};

/** What the sidebar closed with: the suggestions to draft a prompt for, or nothing. */
export type PanelResult = { applied: Suggestion[] } | undefined;

/** The screen's width: 64 columns or 45% of the terminal, whichever is smaller, never under 44. */
export const sidebarWidth = (columns: number) =>
  Math.max(44, Math.min(64, Math.floor(columns * 0.45)));

/** A blank column between the transcript and the sidebar, so the two never touch. */
const GUTTER = 1;
/** Rows under the sidebar: the editor between its rules, and the footer. */
const BELOW = 6;
/** Rows one wheel notch moves a zone. */
const WHEEL = 3;

/**
 * The overlay's options: on the right from the top. Its width is read at each render, so it
 * follows the terminal when it is resized.
 */
export function sidebarOptions(columns: () => number): OverlayOptions {
  return {
    anchor: "top-right",
    get width() {
      return Math.min(columns(), sidebarWidth(columns()) + GUTTER);
    },
  };
}

/** A key as the screen names it: `up`, `enter`, or the character typed. */
function keyName(data: string): string | undefined {
  if (matchesKey(data, Key.up)) return "up";
  if (matchesKey(data, Key.down)) return "down";
  if (matchesKey(data, Key.pageUp)) return "pageup";
  if (matchesKey(data, Key.pageDown)) return "pagedown";
  if (matchesKey(data, Key.enter)) return "enter";
  if (matchesKey(data, Key.escape)) return "escape";
  return [...data].length === 1 ? data : undefined;
}

export class DocsPanel implements Component {
  private state: ScreenState;
  private width = 0;
  private cells: Cell[][] = [];
  private zones: Zones = {};
  private isBusy = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly deps: PanelDeps,
    initial: Suggestion[],
    private readonly done: (result: PanelResult) => void,
  ) {
    this.state = startState(
      openQueue(initial),
      initial.filter((s) => s.status === "dismissed").length,
    );
  }

  invalidate() {}

  private options(): ScreenOptions {
    return {
      width: this.width,
      height: Math.max(12, this.tui.terminal.rows - BELOW),
      now: Date.now(),
      wholeDoc: true,
    };
  }

  private act(intent: Intent) {
    if (this.isBusy) return;
    const { state, effect } = reduce(this.state, intent, this.options());
    this.state = state;
    if (effect === "close") this.done(undefined);
    else if (effect === "submit") this.submit();
    this.tui.requestRender();
  }

  /** Dismisses the dismissed ones, then closes with the applied ones; a failure stays open. */
  private submit() {
    const { applied, dismissed } = decided(this.state);
    if (dismissed.length === 0) return this.done({ applied });
    this.isBusy = true;
    void this.deps.dismiss(dismissed).then(
      () => this.done({ applied }),
      (error) => {
        this.isBusy = false;
        this.state = { ...this.state, notice: `Dismiss failed: ${String(error)}` };
        this.tui.requestRender();
      },
    );
  }

  handleInput(data: string): void {
    if (this.state.hover) this.state = { ...this.state, hover: undefined };
    if (matchesKey(data, "ctrl+c")) return this.done(undefined);
    const key = keyName(data);
    const intent = key === undefined ? undefined : keyIntent(key, this.state, this.options());
    if (intent) this.act(intent);
    else this.tui.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const x = event.x - GUTTER;
    const hit = x >= 0 ? cellAt(this.cells[event.y], x)?.hit : undefined;
    // The pointer is where any event says, a press as much as a move.
    if (hit !== this.state.hover) this.act({ do: "hover", hit });
    if (event.type === "move") return { handled: true };
    if (event.type === "wheel") {
      const zone = zoneAt(this.zones, event.y);
      if (zone && event.wheelDelta)
        this.act({ do: "scroll", zone, by: Math.sign(event.wheelDelta) * WHEEL });
      return { handled: true };
    }
    if (event.button !== "left") return { handled: true };
    if (event.type === "press") return { handled: true, focus: true };
    if (event.type === "click" && hit) this.act({ do: "press", hit });
    return { handled: true };
  }

  render(width: number): string[] {
    this.width = Math.max(1, width - GUTTER);
    const drawn = drawScreen(this.state, this.options());
    const painted = paintLines(this.theme, drawn.lines, this.width, { fill: true });
    this.cells = painted.cells;
    this.zones = drawn.zones;
    return painted.lines.map((row) => " ".repeat(GUTTER) + row);
  }
}
