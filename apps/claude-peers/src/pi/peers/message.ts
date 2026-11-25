/**
 * How a peer's message reads in the transcript: one dim line while folded, and the message itself,
 * with where to reply, when expanded. A message from a peer is the transcript's only way to tell
 * the person that another session spoke, so the folded line names the sender.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  line,
  span,
  truncateSpans,
  wrapSpans,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import { paintLines } from "@agents/kit-core/paint/pi.ts";

export type PeerMessageKind = "message" | "idle" | "status";

/** What one delivered message, idle notice or status line keeps for its renderer. */
export type PeerMessageDetails = {
  kind: PeerMessageKind;
  fromName: string;
  replyTo?: string;
  body: string;
};

// The folded line's own cut, before the screen's width has a say.
const PREVIEW_CHARS = 100;

const labelOf = (kind: PeerMessageKind, fromName: string) => {
  if (kind === "message") return `› Message from @${fromName}`;
  if (kind === "idle") return "› Idle notice";
  return "› Message status";
};

export class PeerMessage implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly details: PeerMessageDetails,
    private readonly expanded: boolean,
    private readonly pad: number,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const room = Math.max(1, width - this.pad);
    const label = labelOf(this.details.kind, this.details.fromName);
    const rows: Line[] = [];
    if (this.expanded) {
      // Expanded, the message is read whole: each row wraps onto the next instead of being cut, so
      // a narrow screen still shows all of it, and the reply address in full.
      const blocks: Span[][] = [
        ...wrapSpans([span(label, { role: "accent" })], room),
        ...wrapSpans([span(this.details.body)], room),
        ...(this.details.replyTo
          ? wrapSpans([span(`(reply to ${this.details.replyTo})`, { role: "dim" })], room)
          : []),
      ];
      for (const spans of blocks) rows.push(line(spans));
    } else {
      // Folded, it is one line: the sender, and as much of the message as the width allows.
      const [first = ""] = this.details.body.split("\n");
      const cut = first.length > PREVIEW_CHARS ? `${first.slice(0, PREVIEW_CHARS)}…` : first;
      rows.push(line(truncateSpans([span(`${label}: `, { role: "dim" }), span(cut)], room)));
    }
    return paintLines(this.theme, rows, room).lines.map((text) => " ".repeat(this.pad) + text);
  }
}
