/**
 * The line above the prompt for a draft put aside, written once: both clients draw it from the
 * same kit components and each only paints it and delivers its presses.
 */
import type { Button } from "../claude/kit/buttons/contract.ts";
import { buttonRow } from "../claude/kit/buttons/terminal.ts";
import { line, span, spansWidth, truncate, type Line, type Span } from "../claude/kit/lines.ts";
import { tokens } from "../claude/kit/tokens.ts";
import type { Form } from "./draft.ts";

const GAP = " ".repeat(tokens.gutter);
/** The glyph a draft put aside is marked with. */
export const DRAFT_MARK = "✎";
/** Below this many columns the line drops its name for the draft's title. */
const NARROW = 80;

/** The line's controls. */
export const CHIP = { open: "chip:open", discard: "chip:discard" } as const;

/** A mark, what it is about cut to the room the buttons leave, and the buttons. */
export function chip(mark: Span[], words: string, buttons: Button[], width: number): Line {
  const actions = buttonRow(buttons, width)[0]?.spans ?? [];
  const room = width - spansWidth(mark) - spansWidth(actions) - tokens.gutter;
  return line([
    ...mark,
    span(truncate(words, Math.max(4, room)), { role: "text" }),
    span(GAP),
    ...actions,
  ]);
}

export type DraftChip = {
  /** What brings the draft back, as the client has it: a digit, a command. */
  openKey: string;
  /** The key that discards, empty where only a press does. */
  discardKey: string;
  /** Discard was pressed once: the next press throws the draft away. */
  isArmed: boolean;
  /** The control under the pointer, where the client reports it. */
  hover?: string;
};

/** A draft put aside: its title, Open and Discard. */
export function draftChip(form: Form, width: number, o: DraftChip): Line {
  const what =
    form.phase === "drafting"
      ? "being written…"
      : form.phase === "failed"
        ? "was not written"
        : form.title || "Untitled";
  return chip(
    // A narrow room keeps the title: the mark and the buttons say what the line is.
    [
      span(`${DRAFT_MARK} `, { role: "dim" }),
      ...(width < NARROW ? [] : [span(`Linear draft${GAP}`, { bold: true })]),
    ],
    what,
    [
      {
        hotkey: o.openKey,
        label: "Open",
        hit: CHIP.open,
        essential: true,
        hovered: o.hover === CHIP.open,
      },
      {
        hotkey: o.discardKey,
        label: o.isArmed ? "Sure? Discard" : "Discard",
        hit: CHIP.discard,
        essential: true,
        hovered: o.hover === CHIP.discard,
      },
    ],
    width,
  );
}
