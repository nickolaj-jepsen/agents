/**
 * The menu pane's screen, from the kit: the terminal's lines for a width and a height, and the
 * rows both surfaces share. A pure function of the menu and where the keyboard is, so the
 * reducer in `register.tsx` and the draw agree on what the window shows.
 *
 * The heading is the frame's caption rule: the menu's name, what it acts on, and Close. A short
 * pane has no room for the rest of a frame (blank rows, a bottom rule), and the host already
 * draws the pane's box, so the rule is the whole of it.
 */
import { captionFrameLayout } from "@agents/kit-frame/contract.ts";
import { captionParts, frameTop } from "@agents/kit-frame/terminal.ts";
import { cellWidth, span, type Line, type Span } from "@agents/kit-core/lines.ts";
import type { List, ListRow } from "@agents/kit-list/contract.ts";
import { list, listFollow, listRows, listTopMax } from "@agents/kit-list/terminal.ts";
import { emptyState, notice } from "@agents/kit-notice/terminal.ts";
import type { Menu, Row } from "./types.d.ts";

/** What a Button's `hit` is for the rest of a long list on a graphical surface. */
export const MORE = "more";
/** The words under the rows while the pane has the keyboard. */
export const HINT = "Enter picks · Esc closes";
/** Cells a row's note may take at its right; a longer one goes into the row's own text. */
const ASIDE_MAX = 24;
/** Lines a row's text may take: a long path wraps instead of losing its end. */
const TEXT_LINES = 3;
/** Rows the pane keeps besides the list: the caption rule and, with it, the hint. */
export const CHROME = 2;
/** Cells the rows are set in by, under the caption's words. */
export const INSET = captionFrameLayout.x;

/** The row's `hit`: the row's id, which is also the Button's address. */
export const hitOf = (row: Row) => row.id;

/** What the caption says beside the menu's name: the notes there are, else what the rows act on. */
export const detailOf = (m: Menu): string | undefined =>
  m.kind === "notes" && m.rows?.length
    ? `${m.rows.length} ${m.rows.length === 1 ? "note" : "notes"}`
    : m.context;

/**
 * The menu's rows as the list takes them. A note on a row (a host, a state, why it cannot run)
 * is the dim aside when it is short, else part of the row's text, which wraps.
 */
export function menuRows(rows: readonly Row[], focus?: string): ListRow[] {
  return rows.map((row, i) => {
    const note = row.unavailable ?? row.description;
    const isAside = note !== undefined && cellWidth(note) <= ASIDE_MAX;
    return {
      text: note !== undefined && !isAside ? `${row.label} ${note}` : row.label,
      literal: true,
      mark: "none",
      key: i < 9 ? String(i + 1) : undefined,
      aside: isAside ? note : undefined,
      focused: row.id === focus,
      // A row that cannot run keeps its place and its key, and says why when pressed.
      disabled: row.action === undefined,
      hit: row.action ? hitOf(row) : undefined,
      action: row.action?.kind === "copy" ? "Copy" : "Open",
    };
  });
}

export type Look = {
  /** The row the keyboard is on. */
  focus?: string;
  /** The pane holds the keyboard: its keys are lit. */
  held: boolean;
  /** The window's first line. */
  top: number;
};

/** The menu's list, as a window `height` rows tall when it is given. */
export function menuList(rows: readonly Row[], look: Look, height?: number): List {
  const items = menuRows(rows, look.focus);
  const aside = Math.max(0, ...items.map((r) => cellWidth(r.aside ?? "")));
  return {
    groups: [{ label: "", active: look.held, rows: items }],
    rail: false,
    aside,
    lines: TEXT_LINES,
    height,
    top: look.top,
  };
}

/**
 * The rows a list has room for in a pane `height` rows tall. The hint takes the last row unless
 * the pane holds the keyboard and has no row to spare: its keys are the ones a person guesses,
 * and a short pane is better spent on the rows.
 */
export function listRoom(rows: readonly Row[], held: boolean, width: number, height: number) {
  const whole = listRows(menuList(rows, { held, top: 0 }), width - INSET);
  const isHinted = !held || whole + CHROME <= height;
  return Math.max(1, height - (isHinted ? CHROME : CHROME - 1));
}

/** The window's first line once the keyboard is on `look.focus`: it moves only to keep it in view. */
export const followTop = (rows: readonly Row[], look: Look, width: number, height: number) =>
  listFollow(menuList(rows, look, listRoom(rows, look.held, width, height)), width - INSET);

/** The furthest the window's top goes. */
export const maxTop = (rows: readonly Row[], held: boolean, width: number, height: number) =>
  listTopMax(menuList(rows, { held, top: 0 }, listRoom(rows, held, width, height)), width - INSET);

export type Drawn = {
  /** The caption rule, Close a control of it; none while no menu is open. */
  head?: Line;
  /** What is under it, set in by `INSET`. */
  body: Line[];
  /** The hint's lines, for when the pane holds the keyboard. */
  hint: Line[];
};

/** The caption's words: the menu's name in the accent, what it acts on after a short rule. */
const caption = (m: Pick<Menu, "title"> & { detail?: string }): Span[] =>
  captionParts([
    [span(m.title, { role: "accent", bold: true })],
    m.detail ? [span(m.detail, { role: "dim" })] : [],
  ]);

/**
 * The pane as lines `width` cells wide and `height` rows tall, the hint's row included.
 * @param m The open menu, or none.
 */
export function drawMenu(m: Menu | null, look: Look, width: number, height: number): Drawn {
  const inner = Math.max(1, width - INSET);
  if (!m) return { body: emptyState({ text: "No menu open.", width: inner }), hint: [] };
  const head = frameTop({
    width,
    title: m.title,
    caption: caption({ title: m.title, detail: detailOf(m) }),
    close: {},
  });
  const hint = notice({ text: HINT, width: inner, status: "dim" });
  if (m.error) return { head, body: emptyState({ text: m.error, width: inner }), hint: [] };
  if (m.rows === null)
    return {
      head,
      body: emptyState({
        text: m.kind === "notes" ? "Looking for notes…" : "Asking git…",
        width: inner,
      }),
      hint: [],
    };
  const room = listRoom(m.rows, look.held, width, height);
  const rows = menuList(m.rows, look, room);
  const top = Math.min(look.top, listTopMax(rows, inner));
  // Held with no row to spare: the list has the pane's last row.
  const isHinted = room === Math.max(1, height - CHROME);
  return { head, body: list({ ...rows, top }, inner), hint: isHinted ? hint : [] };
}
