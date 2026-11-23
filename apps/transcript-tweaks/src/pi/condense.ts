/**
 * Draws a collapsed tool result as one line: status, duration, size and, for a
 * shell command, the line it ended on. Pi's own collapsed form previews five to
 * twenty lines per result, which is where most of the transcript's height goes.
 *
 * The row's words are the summary model's (`../lib/summary.ts`); this file only
 * paints them through the kit at the room the transcript gives.
 *
 * Everything else delegates through `next()`: expansion, streaming output,
 * failures and the tools whose result body is the payload rather than a report
 * about work done.
 */
import { contentText } from "@earendil-works/pi-ai";
import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { line, truncateSpans, type Span } from "@agents/kit-core/lines.ts";
import { draw } from "@agents/kit-core/paint/pi.ts";
import { folds, keepsBody, summarySpans } from "../lib/summary.ts";

type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
type Result = Parameters<RenderResult>[0];

const showsImage = (result: Result) =>
  (result.content ?? []).some((block) => block.type === "image");

/** One line whatever it says: a wrapped summary would defeat the point. */
const oneLine = (theme: Theme, spans: readonly Span[]) => ({
  render: (width: number) => {
    const room = Math.max(1, width);
    return draw(theme, [line(truncateSpans(spans, room))], room);
  },
  invalidate: () => {},
});

export default function (pi: ExtensionAPI) {
  pi.registerToolRenderer((toolName, next) => {
    const base = next();
    const delegate = base?.renderResult;
    if (!delegate || keepsBody(toolName)) return base;
    return {
      ...base,
      renderResult: (result, options, theme, context) => {
        const folded = folds(toolName, {
          expanded: options.expanded,
          isPartial: options.isPartial,
          isError: context.isError,
          hasImage: showsImage(result),
        });
        if (!folded) return delegate(result, options, theme, context);
        return oneLine(
          theme,
          summarySpans({
            toolName,
            body: contentText(result.content ?? []).trimEnd(),
            durationMs: context.durationMs,
          }),
        );
      },
    };
  });
}
