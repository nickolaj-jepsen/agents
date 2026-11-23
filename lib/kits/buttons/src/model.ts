/**
 * The button row's view model: what is lit, what goes quiet and what is drawn on a surface.
 * Pure and plain: the drawings read it, and so does the snapshot that holds it across surfaces.
 * No host imports.
 */
import { tokens } from "@agents/kit-core/tokens.ts";
import { holds, surfaces, type Surface } from "@agents/kit-core/surfaces.ts";
import { textOf, type Span } from "@agents/kit-core/lines.ts";
import type { Button, Buttons } from "./contract.ts";

/** How a button's key is printed after its label: `↵` for Enter, else in brackets; nothing for none. */
export const shortcutOf = (b: Pick<Button, "hotkey" | "hit">) =>
  b.hit === undefined || !b.hotkey
    ? b.hotkey
    : b.hotkey === "enter"
      ? tokens.glyph.enter
      : `[${b.hotkey}]`;

/** `word` with its first letter in capitals: a graphical button's label, which has no key beside it. */
export const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * The buttons as a screen shows them. One button of a screen is lit, the first that asks, so a
 * screen never has two suggested actions; while Close asks, none is lit and every control is
 * quiet, whatever the caller said.
 */
export function settle(rows: Buttons["rows"], confirming = false): readonly (readonly Button[])[] {
  let isLitOne = false;
  return rows.map((row) =>
    row.map((b) => {
      if (confirming)
        return { ...b, isLit: false, isQuiet: b.hit === undefined ? undefined : true };
      if (!b.isLit) return b;
      if (isLitOne) return { ...b, isLit: false };
      isLitOne = true;
      return b;
    }),
  );
}

/**
 * How a button is drawn: lit (the suggestion), chosen (what the screen is set to: dim, with a check),
 * plain, quiet (a control to the side) or a hint.
 */
export type Tone = "lit" | "chosen" | "plain" | "quiet" | "hint";

export type ButtonView = {
  label: string;
  tone: Tone;
  /** The control it presses. Not for a hint. */
  hit?: string;
  /** Its key, where the surface has keys to press. */
  key?: string;
};

export type ButtonsView = {
  /** The words before the first button. */
  lead: string;
  /** Each row's entries; a row left with none is left out. */
  rows: ButtonView[][];
};

/** What `settle`d buttons are drawn as on `surface`. */
export function view(model: Buttons, surface: Surface): ButtonsView {
  const hasKeys = holds(surface, "hotkeys");
  const isGui = surfaces[surface].drawing === "gui";
  const rows = settle(model.rows, model.confirming).flatMap((row) => {
    const drawn = row.flatMap((b): ButtonView[] => {
      // A hint is its key and what it does: with no key to press, there is nothing to show.
      if (b.hit === undefined)
        return hasKeys ? [{ label: b.label, key: b.hotkey, tone: "hint" }] : [];
      const key = hasKeys ? shortcutOf(b) : "";
      return [
        {
          label: isGui && !b.isLiteral ? capital(b.label) : b.label,
          hit: b.hit,
          ...(key ? { key } : {}),
          tone: b.isLit
            ? "lit"
            : b.isChosen && isGui && !model.confirming
              ? "chosen"
              : b.isQuiet
                ? "quiet"
                : isGui
                  ? "quiet"
                  : "plain",
        },
      ];
    });
    return drawn.length ? [drawn] : [];
  });
  return { lead: textOf({ spans: [...(model.lead ?? [])] as Span[] }), rows };
}
