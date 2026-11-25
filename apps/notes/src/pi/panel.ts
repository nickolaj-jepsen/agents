/**
 * The /notes sidebar in pi: the shared screen (`../lib/screen.ts`) painted in an overlay on the
 * right, from the top down to the editor, which stays in view, behind a divider that a drag
 * moves. Keys and the mouse go through the screen's reducer; this only paints, finds the control
 * under the pointer, and carries out what the reducer asks: reading a note and handing one off.
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
import { cellAt, paintLines, paintText, type Cell } from "@agents/kit-core/paint/pi.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import { blank } from "@agents/kit-core/lines.ts";
import type { Handing } from "../lib/gather.ts";
import type { Way } from "../lib/hand.ts";
import {
  drawScreen,
  keyIntent,
  reduce,
  WHEEL_ROWS,
  zoneAt,
  type Body,
  type Effect,
  type Intent,
  type ScreenOptions,
  type ScreenState,
  type Zones,
} from "../lib/screen.ts";
import type { Note } from "../lib/shelf.ts";

export type PanelDeps = {
  read(note: Note): Promise<Body>;
  hand(note: Note, way: Way): Promise<Handing>;
  /** Tells the person a note went to an app. */
  opened(note: Note, app: string): void;
};

/** Cells left of the screen: the divider, a blank cell on either side of it. */
const GUTTER = 3;
/** The divider's cell in the gutter. */
const DIVIDER = 1;
/** Rows under the sidebar: the editor between its rules, and the footer. */
const BELOW = 6;
/** The narrowest the screen is, and the least a drag leaves of the transcript beside it. */
const NARROWEST = 44;
const BESIDE = 20;

/** The width a drag of the divider left the screen at, kept while pi runs. */
let dragged: number | undefined;

/**
 * The screen's width: where a drag of the divider left it, else 64 columns or 45% of the
 * terminal, whichever is smaller; never under 44, nor wider than leaves the transcript 20.
 */
export const sidebarWidth = (columns: number) => {
  const widest = Math.max(NARROWEST, columns - GUTTER - BESIDE);
  return Math.max(NARROWEST, Math.min(widest, dragged ?? Math.min(64, Math.floor(columns * 0.45))));
};

/**
 * The overlay's options: on the right from the top. Its width is read at each render, so it
 * follows the terminal when it is resized, and the divider while it is dragged.
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

export class NotesPanel implements Component {
  private width = 0;
  private cells: Cell[][] = [];
  private zones: Zones = {};
  /** A hand-off is under way: a second press while it starts is dropped. */
  private isHanding = false;
  /** The pointer is on the divider, or dragging it: it is drawn bright. */
  private grip: "over" | "dragging" | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly deps: PanelDeps,
    private state: ScreenState,
    private readonly done: () => void,
  ) {}

  invalidate() {}

  private options(): ScreenOptions {
    return {
      width: this.width || sidebarWidth(this.tui.terminal.columns),
      height: Math.max(12, this.tui.terminal.rows - BELOW),
      now: Date.now(),
    };
  }

  act(intent: Intent) {
    const { state, effect } = reduce(this.state, intent, this.options());
    this.state = state;
    if (effect) this.carryOut(effect);
    this.tui.requestRender();
  }

  private carryOut(effect: Effect) {
    if (effect.do === "close") return this.done();
    if (effect.do === "read") {
      const { note } = effect;
      void this.deps.read(note).then((body) => this.act({ do: "loaded", id: note.id, body }));
      return;
    }
    if (this.isHanding) return;
    this.isHanding = true;
    const { note, way } = effect;
    void this.deps
      .hand(note, way)
      .then((handed) => {
        if ("problem" in handed) this.act({ do: "say", text: handed.problem });
        else this.deps.opened(note, handed.app);
      })
      .finally(() => {
        this.isHanding = false;
      });
  }

  handleInput(data: string): void {
    if (this.state.hover) this.state = { ...this.state, hover: undefined };
    if (matchesKey(data, "ctrl+c")) return this.done();
    const key = keyName(data);
    const intent = key === undefined ? undefined : keyIntent(key, this.state, this.options());
    if (intent) this.act(intent);
    else this.tui.requestRender();
  }

  /** The divider follows the pointer: the screen takes what is right of it. */
  private drag(screenX: number) {
    const before = sidebarWidth(this.tui.terminal.columns);
    dragged = this.tui.terminal.columns - screenX - (GUTTER - DIVIDER);
    // Kept as the width it came to, so the next drag starts from what is drawn.
    dragged = sidebarWidth(this.tui.terminal.columns);
    return dragged !== before;
  }

  /** A press on the divider takes the pointer until it is let go; `undefined` for any other event. */
  private handleGrip(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.grip === "dragging") {
      if (event.type === "drag") return { handled: true, render: this.drag(event.screenX) };
      // Let go where the divider is; the pointer's next move says otherwise.
      this.grip = "over";
      return { handled: true, render: true };
    }
    const was = this.grip;
    // The blank cell left of the divider is not it: the last the overlay hears of a pointer that
    // leaves for the transcript, so the divider is not left bright.
    this.grip = event.x >= DIVIDER && event.x < GUTTER ? "over" : undefined;
    if (!this.grip) {
      if (was) this.tui.requestRender();
      return undefined;
    }
    if (this.state.hover) this.act({ do: "hover", hit: undefined });
    if (event.type === "press" && event.button === "left") {
      this.grip = "dragging";
      return { capture: true, focus: true };
    }
    return { handled: true, render: was !== this.grip };
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const grip = this.handleGrip(event);
    if (grip) return grip;
    const x = event.x - GUTTER;
    const hit = x >= 0 ? cellAt(this.cells[event.y], x)?.hit : undefined;
    // The pointer is where any event says, a press as much as a move.
    if (hit !== this.state.hover) this.act({ do: "hover", hit });
    if (event.type === "move") return { handled: true };
    if (event.type === "wheel") {
      const zone = zoneAt(this.zones, event.y);
      if (zone && event.wheelDelta)
        this.act({ do: "scroll", zone, by: Math.sign(event.wheelDelta) * WHEEL_ROWS });
      return { handled: true };
    }
    if (event.button !== "left") return { handled: true };
    if (event.type === "press") return { handled: true, focus: true };
    if (event.type === "click" && hit) this.act({ do: "press", hit });
    return { handled: true };
  }

  render(width: number): string[] {
    this.width = Math.max(1, width - GUTTER);
    const options = this.options();
    const drawn = drawScreen(this.state, options);
    // Every row of the sidebar's height, so the divider runs down to the editor.
    const lines = [
      ...drawn.lines,
      ...Array.from({ length: Math.max(0, options.height - drawn.lines.length) }, blank),
    ];
    const painted = paintLines(this.theme, lines, this.width, { fill: true });
    this.cells = painted.cells;
    this.zones = drawn.zones;
    const divider = paintText(this.theme, tokens.glyph.rail, {
      role: this.grip ? "text" : "border",
      bold: this.grip === "dragging" || undefined,
    });
    const gutter = " ".repeat(DIVIDER) + divider + " ".repeat(GUTTER - DIVIDER - 1);
    return painted.lines.map((row) => gutter + row);
  }
}
