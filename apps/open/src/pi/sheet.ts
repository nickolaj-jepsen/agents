/**
 * The menu in pi: the shared screen (`../lib/screen.ts`) in the kit's sheet, standing on the rule
 * over the prompt so the prompt stays in sight under it. The keys are Claude's: the arrows move,
 * Enter or a row's number presses, Esc closes; the mouse presses a row or Close and the wheel
 * moves a long list's window. Carrying a press out is the caller's.
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
import { closeOf } from "@agents/kit-frame/contract.ts";
import { hitSpans, span, type Line } from "@agents/kit-core/lines.ts";
import { cellAt, paintLines, type Painted } from "@agents/kit-core/paint/pi.ts";
import { widthCap } from "@agents/kit-core/tokens.ts";
import { notice } from "@agents/kit-notice/terminal.ts";
import { sheetChrome, sheetRoom } from "@agents/kit-sheet/contract.ts";
import { sheet } from "@agents/kit-sheet/terminal.ts";
import { focusOf, SETTLE_MS, type PressHost } from "../lib/gather.ts";
import type { Menu, Row } from "../lib/menus.ts";
import {
  CHROME,
  drawMenu,
  followTop,
  hitOf,
  INSET,
  maxTop,
  menuCaption,
  WHEEL_ROWS,
  type Look,
} from "../lib/screen.ts";

/** Rows of the terminal the sheet leaves above it, so what it was opened over stays in sight. */
const ABOVE = 1;
/** The fewest rows the sheet's body and foot are given, however short the terminal. */
const LEAST_ROWS = 4;
export { SETTLE_MS };

/** What a press said: what happened, or as a `warning` what did not. */
export type Said = { text: string; tone: Parameters<PressHost["say"]>[1] };

export type Pressed = { outcome: "stay" | "close"; said: Said[] };

export type SheetDeps = {
  /** Rows the prompt and what is under it take: the sheet stands on them. Zero for none. */
  below(): number;
  /** Carries a row's press out: whether the menu closes, and what it said. */
  press(row: Row): Promise<Pressed>;
  /** Closes the sheet, with what is to be said once it is gone. */
  done(said?: Said[]): void;
};

/** The sheet's width: the dialog class's cap, a cell short of each edge on a narrow terminal. */
export const sheetWidth = (columns: number) =>
  Math.max(1, Math.min(columns - 2, widthCap("dialog", columns)));

/**
 * Where the sheet stands: centred, its sides running down to the prompt's rule `below()` rows
 * over the bottom edge. pi asks for the options once and reads them at each render, so each is
 * read as it is asked for: a resize or a taller prompt moves the rule while the sheet is open.
 */
export const sheetOptions = (tui: TUI, below: () => number): OverlayOptions => ({
  anchor: "bottom-center",
  get width() {
    return sheetWidth(tui.terminal.columns);
  },
  get maxHeight() {
    return Math.max(1, tui.terminal.rows - ABOVE - below());
  },
  get margin() {
    return { bottom: below() };
  },
});

/**
 * Mounted above the prompt while a menu is open, drawing nothing: the mark the prompt is found by.
 * linear-issue and spellfix stand their sheets the same way; an app cannot import another's file.
 */
export class PromptMark implements Component {
  invalidate(): void {}

  render(): readonly string[] {
    return [];
  }
}

/** A component that holds others under each other, as pi's screen and its parts do. */
type Stacked = { children?: Component[] };

/**
 * Rows from the prompt's top rule to the bottom of the terminal: the prompt, and whatever pi
 * draws under it. pi stacks its screen as one list, with the widgets above the prompt as the
 * entry before it, so everything after the entry holding `mark` is counted. Undefined when pi's
 * screen is not laid out that way: the caller then keeps to the bottom edge.
 */
export function rowsFromPrompt(tui: TUI, mark: Component): number | undefined {
  const stack = (tui as Stacked).children;
  if (!Array.isArray(stack)) return undefined;
  const at = stack.findIndex((entry) => (entry as Stacked).children?.includes(mark));
  if (at < 0 || at === stack.length - 1) return undefined;
  let rows = 0;
  for (const entry of stack.slice(at + 1)) rows += entry.render(tui.terminal.columns).length;
  return rows;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Cells the screen is set in by inside the sheet's own inset: its pointer column under the caption's words. */
const UNDER_CAPTION = 1;

/**
 * A line of the screen set in under the caption. A row that is one control stays one, from its
 * pointer column on: the cell it is set in by is not part of it.
 */
const setIn = (l: Line): Line => ({
  spans: [
    span(" ".repeat(UNDER_CAPTION)),
    ...(l.hit === undefined ? l.spans : hitSpans(l.spans, l.hit)),
  ],
});

export class MenuSheet implements Component {
  private focus: string | undefined;
  private top = 0;
  private hover: string | undefined;
  private said: Said | undefined;
  /** A press is being carried out: another is dropped. */
  private isBusy = false;
  /** When the rows came. */
  private shownAt = 0;
  /** The room the list was last drawn in, which the keys and the wheel move its window in. */
  private room = { width: 60, height: 10 };
  private painted: Painted | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private menu: Menu,
    private readonly deps: SheetDeps,
  ) {}

  /** The menu's rows have come: the keyboard goes to its preselected row. */
  show(menu: Menu) {
    this.menu = menu;
    this.shownAt = Date.now();
    const first = focusOf(menu, undefined);
    if (first) this.focusRow(first);
    this.tui.requestRender();
  }

  /** One line under the rows, until the next one: what `open.json` got wrong, or why a row can't run. */
  say(said: Said) {
    this.said = said;
    this.tui.requestRender();
  }

  invalidate() {}

  private look(): Look {
    return {
      focus: focusOf(this.menu, this.focus),
      held: true,
      top: this.top,
      hover: this.hover,
    };
  }

  /** Puts the keyboard on a row and keeps it in the window. */
  private focusRow(id: string) {
    const rows = this.menu.rows;
    if (!rows) return;
    this.focus = id;
    this.top = followTop(rows, this.look(), this.room.width, this.room.height);
  }

  private move(by: number) {
    const rows = this.menu.rows ?? [];
    const at = rows.findIndex((r) => r.id === focusOf(this.menu, this.focus));
    const to = rows[clamp(at + by, 0, rows.length - 1)];
    if (to) this.focusRow(to.id);
    this.tui.requestRender();
  }

  private scroll(by: number) {
    const rows = this.menu.rows;
    if (!rows) return;
    const max = maxTop(rows, true, this.room.width, this.room.height);
    this.top = clamp(this.top + by, 0, max);
    this.tui.requestRender();
  }

  /**
   * Carries a row's press out: it closes the menu, or the menu stays and says why. Not before the
   * rows have stood still for a moment, and not while another press is under way.
   */
  private press(row: Row | undefined) {
    if (!row || this.isBusy || Date.now() - this.shownAt < SETTLE_MS) return;
    this.isBusy = true;
    void this.deps.press(row).then(
      ({ outcome, said }) => {
        this.isBusy = false;
        if (outcome === "close") return this.deps.done(said);
        this.said = said.at(-1) ?? this.said;
        this.tui.requestRender();
      },
      (error) => {
        this.isBusy = false;
        this.say({ text: `${row.label}: ${String(error)}`, tone: "warning" });
      },
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) return this.deps.done();
    const rows = this.menu.rows ?? [];
    if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) return this.move(-1);
    if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) return this.move(1);
    if (matchesKey(data, Key.enter)) {
      const at = focusOf(this.menu, this.focus);
      return this.press(rows.find((r) => r.id === at));
    }
    // A row's number presses it, as in Claude Code: one that cannot run says why.
    if (/^[1-9]$/.test(data)) return this.press(rows[Number(data) - 1]);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const hit = cellAt(this.painted?.cells[event.y], event.x)?.hit;
    if (event.type === "wheel") {
      if (event.wheelDelta) this.scroll(Math.sign(event.wheelDelta) * WHEEL_ROWS);
      return { handled: true };
    }
    // The pointer is where any event says, a press as much as a move.
    const moved = hit !== this.hover;
    this.hover = hit;
    if (event.type === "move") return { handled: true, render: moved };
    if (event.button !== "left") return { handled: true, render: moved };
    if (event.type === "press") return { focus: true, render: moved };
    if (event.type === "click" && hit !== undefined) {
      if (closeOf(hit) === "close") this.deps.done();
      else this.press(this.menu.rows?.find((r) => hitOf(r) === hit));
    }
    return { handled: true, render: moved };
  }

  render(width: number): string[] {
    const below = this.deps.below();
    // Standing on the prompt's rule; a pi whose prompt could not be found keeps its own bottom edge.
    const foot = below > 0 ? "none" : "edge";
    const room = sheetRoom(width) - UNDER_CAPTION;
    const rows =
      Math.max(LEAST_ROWS + sheetChrome(foot), this.tui.terminal.rows - ABOVE - below) -
      sheetChrome(foot);
    const said = this.said
      ? notice({
          text: this.said.text,
          width: room,
          status: this.said.tone === "warning" ? "warning" : "text",
          isWrapped: true,
        })
      : [];
    // The screen's height counts its caption rule, which is the sheet's top edge here.
    const height = Math.max(CHROME + 1, rows - said.length + 1);
    this.room = { width: room + INSET, height };
    const drawn = drawMenu(this.menu, this.look(), room + INSET, height);
    const lines = sheet({
      width,
      title: this.menu.title,
      caption: menuCaption(this.menu),
      close: { hover: closeOf(this.hover) },
      body: drawn.body.map(setIn),
      footer: [...said, ...drawn.hint].map(setIn),
      foot,
    });
    this.painted = paintLines(this.theme, lines, width, { fill: true });
    return this.painted.lines;
  }
}
