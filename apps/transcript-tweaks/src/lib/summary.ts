/**
 * What a folded tool result says, as the kit's styled spans: the model the pi renderer paints.
 *
 * A folded result is one line: a success check, the facts about the work (duration, size), and,
 * for a shell command, the line it ended on. Everything else keeps pi's own rendering; `folds`
 * says which calls this one answers.
 */
import { meaningSpan, span, type Span } from "@agents/kit-core/lines.ts";

/** Tools whose result body is the payload, not a report about work: the diff, the question, the queue. */
const KEEP_BODY: ReadonlySet<string> = new Set([
  // The diff is how the change gets checked.
  "edit",
  "write",
  // A hidden question is a bug.
  "ask_user_question",
  // Its one line is where a repeat says `seen N×`.
  "docfix",
]);

// Only a command ends on a line worth quoting: elsewhere the last line is the middle of the thing.
const QUOTE_LAST_LINE: ReadonlySet<string> = new Set(["bash"]);

/** Whether a headless body stays pi's: its result is the thing itself rather than a report. */
export const keepsBody = (toolName: string) => KEEP_BODY.has(toolName);

/** A duration as the folded line says it: milliseconds under a second, one decimal above. */
export const seconds = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${Math.round(ms / 100) / 10}s`;

export type Fold = {
  toolName: string;
  /** The result as text; trailing whitespace is not a line. */
  body: string;
  durationMs?: number;
};

/**
 * Whether a result is folded to the summary line. Expansion, streaming output, failures and
 * results that are pictures keep pi's own rendering; so does a tool whose body is the payload.
 */
export const folds = (
  toolName: string,
  {
    expanded,
    isPartial,
    isError,
    hasImage,
  }: { expanded?: boolean; isPartial?: boolean; isError?: boolean; hasImage?: boolean },
) => !KEEP_BODY.has(toolName) && !expanded && !isPartial && !isError && !hasImage;

/** The last line of a shell result, when that is the line worth reading. */
export const quotedLine = (toolName: string, body: string) => {
  if (!QUOTE_LAST_LINE.has(toolName)) return undefined;
  const last = body.trimEnd().split("\n").at(-1)?.trim();
  return last ? last : undefined;
};

/**
 * The folded result as one row's spans: `✓ 1.3s · 12 lines · exit 0`, with a shell command's
 * last line in the text role. The success meaning's own glyph opens the row, so it matches the
 * mark the kit draws elsewhere on the terminal.
 */
export function summarySpans({ toolName, body, durationMs }: Fold): Span[] {
  const text = body.trimEnd();
  const facts: Span[] = [];
  if (durationMs !== undefined) facts.push(span(seconds(durationMs), { role: "dim" }));
  if (text !== "") {
    const lines = text.split("\n").length;
    facts.push(span(`${lines} ${lines === 1 ? "line" : "lines"}`, { role: "dim" }));
  }

  const spans: Span[] = [meaningSpan("state:success")];
  facts.forEach((fact, at) => {
    spans.push(span(at === 0 ? " " : " · ", { role: "dim" }));
    spans.push(fact);
  });

  const last = quotedLine(toolName, text);
  if (last) spans.push(span(" · ", { role: "dim" }), span(last, { role: "text" }));
  return spans;
}
