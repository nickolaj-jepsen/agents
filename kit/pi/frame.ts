import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fit } from "./text.ts";
import { paint, tokens } from "./tokens.ts";

/** A key hint. Listed highest priority first; `essential` ones (the way out) are never dropped. */
export type Hint = {
  /** What to press, shown in the text colour. */
  key: string;
  /** What it does, shown dim; cut with `…` as the last hint when short of room. */
  label: string;
  /** Never dropped when the border is too narrow for every hint. */
  essential?: boolean;
};

const border = (theme: Theme, text: string) => paint(theme, "border", text);

/** `n` rule cells starting at column `from`, with `tee` at column `at` when it falls inside. */
function rule(theme: Theme, n: number, from: number, at: number | undefined, tee: string) {
  const h = tokens.border.h;
  if (at === undefined || at < from || at >= from + n)
    return border(theme, h.repeat(Math.max(0, n)));
  return border(theme, h.repeat(at - from) + tee + h.repeat(from + n - at - 1));
}

function topBorder(
  theme: Theme,
  width: number,
  title: string,
  count: number | undefined,
  tee?: number,
) {
  const b = tokens.border;
  const room = Math.max(
    1,
    (tee ?? width) - 5 - (count === undefined ? 0 : String(count).length + 2),
  );
  const name = truncateToWidth(title, room, tokens.glyph.ellipsis);
  const head =
    border(theme, b.tl + b.h + " ") +
    theme.bold(paint(theme, "accent", name)) +
    (count === undefined ? "" : "  " + paint(theme, "dim", String(count))) +
    " ";
  const used = visibleWidth(head);
  return head + rule(theme, width - used - 1, used, tee, b.down) + border(theme, b.tr);
}

const hintWidth = (h: Hint) => visibleWidth(h.key) + 1 + visibleWidth(h.label);

type Placed = { hint: Hint; start: number };

/**
 * Lays the hints out left to right along the whole border. A hint that would touch the
 * divider's column starts after the junction instead, so `┴` is a rule cell with a rule
 * cell each side. Undefined when the run does not fit `width`.
 */
function place(hints: Hint[], width: number, tee?: number): Placed[] | undefined {
  const out: Placed[] = [];
  let end = 3; // `╰─ `
  for (const [i, hint] of hints.entries()) {
    let start = i === 0 ? 3 : end + 4;
    if (tee !== undefined && i > 0) {
      const text = start + hintWidth(hint) > tee - 2 && start < tee + 3;
      // The gap before this hint holds the junction: it needs a rule cell each side.
      const gap = tee >= end && tee < start && !(tee - 1 >= end + 1 && tee + 1 <= start - 2);
      if (text || gap) start = tee + 3;
    }
    out.push({ hint, start });
    end = start + hintWidth(hint);
  }
  // ` ` and at least one rule cell, then `╯`; the junction cannot sit against the last hint.
  if (end + 3 > width) return undefined;
  if (tee !== undefined && tee >= end && tee - 1 < end + 1) return undefined;
  return out;
}

function bottomBorder(theme: Theme, width: number, hints: Hint[], tee?: number) {
  const b = tokens.border;
  const kept = [...hints];
  let placed = place(kept, width, tee);
  // Drop the lowest priority first; the way out is never dropped.
  while (!placed && kept.length > 1) {
    const at = kept.map((h) => !h.essential).lastIndexOf(true);
    if (at < 0) break;
    kept.splice(at, 1);
    placed = place(kept, width, tee);
  }
  // Even the way out alone does not fit with the junction: let it run on and omit the junction.
  const junction = placed ? tee : undefined;
  placed ??= place(kept, width);
  const parts: string[] = [];
  let col = 3;
  for (const { hint, start } of placed ?? kept.map((h) => ({ hint: h, start: 3 }))) {
    if (start > col) parts.push(" ", rule(theme, start - col - 2, col + 1, junction, b.up), " ");
    const room = width - start - 4;
    const label = truncateToWidth(
      hint.label,
      Math.max(1, room - visibleWidth(hint.key) - 1),
      tokens.glyph.ellipsis,
    );
    parts.push(paint(theme, "text", hint.key) + " " + paint(theme, "dim", label));
    col = start + visibleWidth(hint.key) + 1 + visibleWidth(label);
  }
  return (
    border(theme, b.bl + b.h + " ") +
    parts.join("") +
    " " +
    rule(theme, width - col - 2, col + 1, junction, b.up) +
    border(theme, b.br)
  );
}

const side = (theme: Theme, content: string, width: number) => {
  const pad = " ".repeat(tokens.padding);
  const v = border(theme, tokens.border.v);
  return v + pad + fit(content, width - 2 - 2 * tokens.padding) + pad + v;
};

export type ModalOptions = {
  /** The frame's outer width in cells, borders included. */
  width: number;
  /** Bold accent text in the top border, cut with `…` when it does not fit. */
  title: string;
  /** A dim count after the title; left out when undefined. */
  count?: number;
  /** Lines already laid out for `width - 4` cells. */
  body: string[];
  /** In the bottom border, highest priority first. */
  hints: Hint[];
  /** Takes the blank row above the hints. */
  notice?: string;
};

/** Where a modal's body starts, in the frame's own cells. */
export const bodyOrigin = { x: 1 + tokens.padding, y: 2 };

/**
 * A rounded border, the title and its count in the top, the hints in the bottom.
 */
export function modalFrame(theme: Theme, o: ModalOptions): string[] {
  return [
    topBorder(theme, o.width, o.title, o.count),
    side(theme, "", o.width),
    ...o.body.map((line) => side(theme, line, o.width)),
    side(theme, o.notice ?? "", o.width),
    bottomBorder(theme, o.width, o.hints),
  ];
}

export type SplitLayout = {
  /** True below the split threshold: one pane above the other, no divider. */
  stacked: boolean;
  /** Content widths: the list's and the detail's. Stacked, both are the full content width. */
  left: number;
  right: number;
  /** Where each pane starts, in the frame's cells. */
  leftAt: { x: number; y: number };
  rightAt: { x: number; y: number };
};

/**
 * Two panes from `tokens.splitFrom` terminal columns, stacked below.
 * @param width The frame's outer width, as for `modalFrame`.
 * @param columns The terminal's width, which decides stacked or split.
 */
export function splitLayout(width: number, columns: number): SplitLayout {
  const content = width - 2 - 2 * tokens.padding;
  if (columns < tokens.splitFrom) {
    return {
      stacked: true,
      left: content,
      right: content,
      leftAt: { x: bodyOrigin.x, y: 2 },
      rightAt: { x: bodyOrigin.x, y: 2 },
    };
  }
  const both = width - 3 - 4 * tokens.padding;
  const left = Math.round(both * tokens.splitRatio);
  const x = 1 + tokens.padding;
  return {
    stacked: false,
    left,
    right: both - left,
    leftAt: { x, y: 2 },
    rightAt: { x: x + left + tokens.padding + 1 + tokens.padding, y: 2 },
  };
}

export type SplitOptions = Omit<ModalOptions, "body"> & {
  /** From `splitLayout`; the frame draws the divider where it says. */
  layout: SplitLayout;
  /** Lines for the list pane and the detail pane; the taller sets the height. */
  left: string[];
  right: string[];
};

/**
 * One border round two panes, a `┬` / `┴` divider between them. Not for a stacked layout.
 * @param o As for `modalFrame`, with `left` and `right` panes laid out by `splitLayout`.
 */
export function splitFrame(theme: Theme, o: SplitOptions): string[] {
  const { layout: l, width } = o;
  const pad = " ".repeat(tokens.padding);
  const v = border(theme, tokens.border.v);
  const tee = 1 + tokens.padding + l.left + tokens.padding;
  const row = (a: string, b: string) =>
    v + pad + fit(a, l.left) + pad + v + pad + fit(b, l.right) + pad + v;
  const height = Math.max(o.left.length, o.right.length);
  const rows = Array.from({ length: height }, (_, i) => row(o.left[i] ?? "", o.right[i] ?? ""));
  return [
    topBorder(theme, width, o.title, o.count, tee),
    row("", ""),
    ...rows,
    o.notice === undefined ? row("", "") : side(theme, o.notice, width),
    bottomBorder(theme, width, o.hints, tee),
  ];
}
