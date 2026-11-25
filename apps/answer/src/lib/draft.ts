/**
 * The prompt's draft while a round's reply is filled into it: the reply goes above what the
 * person typed, and a second fill replaces that reply instead of stacking another. Their own
 * text, whitespace included, is kept exactly as they left it.
 */

/** What separates the reply from the person's own draft: one blank line. */
const SEPARATOR = "\n\n";

/** Whether the prompt's text carries `reply`: the text is the reply, or the reply above a draft. */
export const isReplyOf = (text: string, reply: string) =>
  reply !== "" && (text === reply || text.startsWith(`${reply}\n`));

/**
 * The prompt's text with `reply` above what the person had typed. Only an untouched prompt is
 * replaced: a draft of nothing but whitespace is still theirs, and stays under the reply.
 */
export const placeReply = (draft: string, reply: string) =>
  draft === "" ? reply : `${reply}${SEPARATOR}${draft}`;

/**
 * What the person typed themselves: the prompt's text less the reply an earlier fill put above
 * it. Filling again writes the same text back, so the draft never drifts by a blank line.
 */
export function ownDraft(text: string, filled: string | null): string {
  if (!filled || !isReplyOf(text, filled)) return text;
  return text.slice(filled.length).replace(/^\n{1,2}/, "");
}
