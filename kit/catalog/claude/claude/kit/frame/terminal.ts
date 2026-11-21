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
  { confirming, hover }: NonNullable<CaptionFrame["close"]>,
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
  const prompt = "Discard answers?";
  // The longer prompt only when there is still room for a caption.
  const lead =
    room >= buttonsWidth + tokens.gutter + cellWidth(prompt) + 7
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

/** An inline form between two rules: a caption and Close in the top one, the body set in. */
export function captionFrame(f: CaptionFrame): Line[] {
  const { width } = f;
  const inner = Math.max(0, width - 2 * captionFrameLayout.x);
  const pad = span(" ".repeat(captionFrameLayout.x));
  const row = (l: Line | undefined): Line =>
    l && (l.spans.length || l.slot)
      ? { ...l, spans: [pad, ...truncateSpans(l.spans, inner)] }
      : blank();
  const h = tokens.glyph.rule;
  const rule = (n: number) => span(h.repeat(Math.max(0, n)), { role: "border" });
  const action = f.close && closeSpans(width, f.close);
  const actionStart = action ? width - spansWidth(action) - 2 : width;
  const limit = Math.max(0, (action ? actionStart - 1 : width) - captionFrameLayout.reserved);
  const content = typeof f.caption === "function" ? f.caption(limit) : f.caption;
  const label = truncateSpans(content ?? [span(f.title, { role: "accent", bold: true })], limit);
  const head = spansWidth(label) ? [rule(1), span(" "), ...label, span(" ")] : [];
  const end = action ? actionStart - 1 : width;
  return [
    line([
      ...head,
      rule(end - spansWidth(head)),
      ...(action ? [span(" "), ...action, span(" "), rule(1)] : []),
    ]),
    blank(),
    ...f.body.map(row),
    row(f.notice),
    row(f.footer),
    line([rule(width)]),
  ];
}
