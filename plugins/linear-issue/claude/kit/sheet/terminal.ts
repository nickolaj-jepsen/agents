/** The sheet as styled lines: the one drawing both terminals paint. */
import { captionRule, closeSpans } from "../frame/terminal.ts";
import {
  hitSpans,
  line,
  padding,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Span,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import { sheetLayout, sheetRoom, type Sheet } from "./contract.ts";

const EDGE = { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", side: "│" };
const edge = (text: string) => span(text, { role: "border" });

/**
 * A panel laid over the screen, closed on every side so what is under it stays apart: the
 * title and Close in its top edge, as a captioned frame has them, the body set in, and the
 * buttons above its bottom edge. With no `foot` its sides run down to a rule the host draws
 * under it, so it reads as standing behind what that rule starts. A row that is one control
 * keeps to its words: the edges beside it are not part of it.
 */
export function sheet(s: Sheet): Line[] {
  const { width } = s;
  const room = sheetRoom(width);
  const inset = span(" ".repeat(sheetLayout.x - 1));
  const row = (l: Line | undefined): Line => {
    // The host's field keeps its row: the edges go before and after it.
    if (l?.slot?.kind === "input") {
      const used = spansWidth(l.slot.lead) + l.slot.width + spansWidth(l.slot.tail ?? []);
      return {
        spans: [],
        slot: {
          ...l.slot,
          lead: [edge(EDGE.side), inset, ...l.slot.lead],
          hang: [
            edge(EDGE.side),
            inset,
            ...(l.slot.hang ?? [span(" ".repeat(spansWidth(l.slot.lead)))]),
          ],
          tail: [
            ...(l.slot.tail ?? []),
            span(" ".repeat(Math.max(0, room - used))),
            inset,
            edge(EDGE.side),
          ],
        },
      };
    }
    const spans = truncateSpans(
      l?.hit === undefined ? (l?.spans ?? []) : hitSpans(l.spans, l.hit),
      room,
    );
    return line([
      edge(EDGE.side),
      inset,
      ...spans,
      ...padding(spans, room),
      inset,
      edge(EDGE.side),
    ]);
  };
  const top = captionRule({ ...s, width: Math.max(0, width - 2) });
  return [
    line([edge(EDGE.topLeft), ...top.spans, edge(EDGE.topRight)]),
    row(undefined),
    ...s.body.map(row),
    ...(s.notice ? [row(s.notice)] : []),
    ...(s.footer ?? []).map(row),
    ...(s.foot === "none"
      ? []
      : [line([edge(EDGE.bottomLeft + "─".repeat(Math.max(0, width - 2)) + EDGE.bottomRight)])]),
  ];
}

/**
 * The sheet's top edge without the edge: its title at the left, and at the right the question
 * Close asks. For a host that frames the panel itself, as Claude Code does a pane, and draws
 * its own Close there.
 */
export function sheetHead(s: Pick<Sheet, "width" | "title" | "close">): Line {
  const title: Span[] = truncateSpans(
    [span(s.title, { role: "accent", bold: true })],
    Math.max(0, s.width),
  );
  // No rule here: the question may take every cell the title leaves, less a gutter.
  const room = s.width - spansWidth(title) - tokens.gutter;
  const action = s.close?.confirming ? closeSpans(room + 7, s.close, 0) : undefined;
  if (!action) return line(title);
  return line([...title, ...padding([...title, ...action], s.width), ...action]);
}
