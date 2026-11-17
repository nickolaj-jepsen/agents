/**
 * Marks the start of every assistant reply with a rule in front of its first
 * line, so a one-sentence answer reads as an answer instead of blending into the
 * tool rows around it.
 *
 * Inline and space-joined, not a line of its own: a marker alone reads as debris.
 * It cannot be coloured from here — a code span or a raw ANSI prefix bleeds
 * across the rest of the line.
 *
 * A reply with no text, which a turn that only calls tools produces, gets
 * nothing. The session keeps the untransformed text, so /copy, /export and the
 * model never see the rule.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Left half block: one column wide in Hack Nerd Font, and heavy enough to read as a rule.
const GUTTER = "▌";

export default function (pi: ExtensionAPI) {
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== "assistant" || markdown.trim() === "") return markdown;
    return `${GUTTER} ${markdown}`;
  });
}
