/** The captioned frame as styled lines: the one drawing both terminals paint. */
import { buttonRow } from "../buttons/terminal.ts";
import type { Button } from "../buttons/contract.ts";
import { controlStyle } from "../card/terminal.ts";
import {
  blank,
  cellWidth,
  line,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Span,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import { captionFrameLayout, closeHit, type CaptionFrame, type CloseAction } from "./contract.ts";

const confirmButtons: Button[] = [
  { label: "Discard", hotkey: "enter", hit: closeHit("discard"), essential: true },
  { label: "Keep", hotkey: "esc", hit: closeHit("keep"), essential: true },
];

/** Close, or the question it asks before the answers go: `undefined` when neither fits. */
function closeSpans(
  width: number,
  { confirming, hover, question = "Discard answers?" }: NonNullable<CaptionFrame["close"]>,
): Span[] | undefined {
  const room = width - 7;
  if (!confirming) {
    const label = width < 40 ? tokens.glyph.times : `Close ${tokens.glyph.times}`;
    if (cellWidth(label) > room) return undefined;
    return [
      span(label, {
        ...controlStyle({ highlighted: hover === "close" }),
        hit: closeHit("close"),
      }),
    ];
  }
  const buttonsWidth =
    cellWidth(`Discard ${tokens.glyph.enter}`) + tokens.gutter + cellWidth("Keep [esc]");
  if (room < buttonsWidth) return undefined;
  const prompt = question;
  // The question goes before the caption: while it is asked, it is what the frame is about.
  const lead =
    room >= buttonsWidth + tokens.gutter + cellWidth(prompt)
      ? [span(prompt, { role: "warning" })]
      : [];
  const row = buttonRow(confirmButtons, room, { lead })[0];
  if (!row) return undefined;
  const hovered = hover as CloseAction | undefined;
  let at = 0;
  for (const s of row.spans) {
    if (hovered && s.hit === closeHit(hovered))
      return buttonRow(confirmButtons, room, { lead, hover: { x: at, y: 0 } })[0]?.spans;
    at += cellWidth(s.text);
  }
  return row.spans;
}

/** Cells a title needs to be worth cutting into. */
const MIN_TITLE = 8;

const ruleSpan = (n: number) => span(tokens.glyph.rule.repeat(Math.max(0, n)), { role: "border" });

/** `words ── words`: the parts of a rule's caption, a short rule between two. */
export const captionParts = (parts: readonly Span[][]): Span[] =>
  parts
    .filter((part) => part.length)
    .flatMap((part, i) => (i ? [span(" "), ruleSpan(tokens.gutter), span(" "), ...part] : part));

export type CaptionRule = {
  width: number;
  /** The words at the rule's start, after its first cell. */
  caption?: Span[];
  /** A control at the rule's end. */
  end?: Span[];
  /** Cells of rule after the control: the frame's corner. @default 0 */
  tail?: number;
};

/** Cells of a caption rule its caption can take: the rest are its rules and its control. */
export const captionRoom = ({ width, end = [], tail = 0 }: Omit<CaptionRule, "caption">) =>
  Math.max(0, width - 3 - (end.length ? spansWidth(end) + 2 + (tail ? tail + 1 : 0) : 1));

/**
 * `─ words ── words ──────── control ─`: a rule across `width` cells with a caption at its
 * start and a control at its end. The one rule a frame's top and a section's heading are.
 */
export function captionRule({ width, caption = [], end = [], tail = 0 }: CaptionRule): Line {
  const label = truncateSpans(caption, captionRoom({ width, end, tail }));
  const head = spansWidth(label) ? [ruleSpan(1), span(" "), ...label, span(" ")] : [];
  const close = end.length ? [span(" "), ...end, ...(tail ? [span(" "), ruleSpan(tail)] : [])] : [];
  const spans = [...head, ruleSpan(width - spansWidth(head) - spansWidth(close)), ...close];
  return line(truncateSpans(spans, width));
}

/** An inline form between two rules: a caption and Close in the top one, the body set in. */
export function captionFrame(f: CaptionFrame): Line[] {
  const { width } = f;
  const inner = Math.max(0, width - 2 * captionFrameLayout.x);
  const pad = span(" ".repeat(captionFrameLayout.x));
  const row = (l: Line | undefined): Line =>
    l && (l.spans.length || l.slot)
      ? { ...l, spans: [pad, ...truncateSpans(l.spans, inner)] }
      : blank();
  const action = (f.close && closeSpans(width, f.close)) || undefined;
  // A frame keeps a cell of rule more than the rule itself needs after its caption.
  const limit = Math.max(0, captionRoom({ width, end: action, tail: 1 }) - 1);
  const content = typeof f.caption === "function" ? f.caption(limit) : f.caption;
  // A title cut to a few letters says nothing: below that it goes.
  const label =
    content || limit >= MIN_TITLE
      ? truncateSpans(content ?? [span(f.title, { role: "accent", bold: true })], limit)
      : [];
  return [
    captionRule({ width, caption: label, end: action, tail: 1 }),
    blank(),
    ...f.body.map(row),
    row(f.notice),
    row(f.footer),
    line([ruleSpan(width)]),
  ];
}
