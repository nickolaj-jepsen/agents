import { contentText } from "@earendil-works/pi-ai";
import { truncateToWidth } from "@earendil-works/pi-tui";

// src/pi/condense.ts
/**
* Draws a collapsed tool result as one line: status, duration, size and, for a
* shell command, the line it ended on. Pi's own collapsed form previews five to
* twenty lines per result, which is where most of the transcript's height goes.
*
* Everything else delegates through `next()`: expansion, streaming output,
* failures and the tools whose result body is the payload rather than a report
* about work done.
*/
const KEEP_BODY = /* @__PURE__ */ new Set([
	"edit",
	"write",
	"ask_user_question",
	"docfix"
]);
const QUOTE_LAST_LINE = /* @__PURE__ */ new Set(["bash"]);
const CHECK = "";
const showsImage = (result) => (result.content ?? []).some((block) => block.type === "image");
const seconds = (ms) => ms < 1e3 ? `${Math.round(ms)}ms` : `${Math.round(ms / 100) / 10}s`;
/** One line whatever it says: a wrapped summary would defeat the point. */
const oneLine = (text) => ({
	render: (width) => [truncateToWidth(text, Math.max(1, width), "…")],
	invalidate: () => {}
});
const summarize = (toolName, result, theme, context) => {
	const body = contentText(result.content ?? []).trimEnd();
	const separator = theme.fg("dim", " · ");
	const meta = [];
	if (context.durationMs !== void 0) meta.push(theme.fg("dim", seconds(context.durationMs)));
	if (body !== "") {
		const lines = body.split("\n").length;
		meta.push(theme.fg("dim", `${lines} ${lines === 1 ? "line" : "lines"}`));
	}
	const parts = [theme.fg("success", CHECK) + (meta.length > 0 ? ` ${meta.join(separator)}` : "")];
	const last = QUOTE_LAST_LINE.has(toolName) ? body.split("\n").at(-1)?.trim() : void 0;
	if (last) parts.push(theme.fg("toolOutput", last));
	return oneLine(parts.join(separator));
};
function condense_default(pi) {
	pi.registerToolRenderer((toolName, next) => {
		const base = next();
		const delegate = base?.renderResult;
		if (!delegate || KEEP_BODY.has(toolName)) return base;
		return {
			...base,
			renderResult: (result, options, theme, context) => options.expanded || options.isPartial || context.isError || showsImage(result) ? delegate(result, options, theme, context) : summarize(toolName, result, theme, context)
		};
	});
}

// src/pi/gutter.ts
const GUTTER = "▌";
function gutter_default(pi) {
	pi.registerMarkdownTransformer((markdown, context) => {
		if (context.messageType !== "assistant" || markdown.trim() === "") return markdown;
		return `${GUTTER} ${markdown}`;
	});
}

// src/pi.ts
function pi_default(pi) {
	for (const feature of [gutter_default, condense_default]) try {
		feature(pi);
	} catch (error) {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(`transcript-tweaks failed to load: ${error instanceof Error ? error.message : String(error)}`, "error");
		});
	}
}

export { pi_default as default };