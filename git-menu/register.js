import { atom, read, update } from "claude-code";
import { t as tokens } from "./tokens-B6LwkIOZ.js";

// ../../lib/kits/core/src/icons.ts
const g = tokens.glyph;
/**
* Every meaning the kit draws. Seeded from what `main`'s designs marked: a tracker's status and
* priority, a doc suggestion's kind and what it is set to, and the states a notice has.
*/
const meanings = {
	"state:success": {
		shape: "success",
		tone: "success",
		glyph: g.done,
		role: "success",
		alt: "Done"
	},
	"state:error": {
		shape: "error",
		tone: "error",
		glyph: g.times,
		role: "error",
		alt: "Failed"
	},
	"state:warning": {
		shape: "warning",
		tone: "warning",
		glyph: g.status.warning,
		role: "warning",
		alt: "Needs a look"
	},
	"state:pending": {
		shape: "pending",
		tone: "neutral",
		glyph: g.single.off,
		role: "dim",
		alt: "Pending"
	},
	"state:question": {
		shape: "question",
		tone: "neutral",
		glyph: "?",
		role: "dim",
		alt: "Waiting for an answer"
	},
	"kind:wrong": {
		shape: "wrong",
		tone: "error",
		glyph: "!",
		role: "error",
		alt: "Wrong"
	},
	"kind:stale": {
		shape: "stale",
		tone: "warning",
		glyph: "↻",
		role: "warning",
		alt: "Stale"
	},
	"kind:missing": {
		shape: "missing",
		tone: "neutral",
		glyph: "+",
		role: "text",
		alt: "Missing"
	},
	"decision:open": {
		shape: "open",
		tone: "neutral",
		glyph: g.single.off,
		role: "text",
		alt: "Not decided"
	},
	"decision:apply": {
		shape: "success",
		tone: "success",
		glyph: g.single.on,
		role: "accent",
		alt: "Set to apply"
	},
	"decision:dismiss": {
		shape: "dropped",
		tone: "neutral",
		glyph: g.dropped,
		role: "dim",
		alt: "Set to dismiss"
	},
	"choice:open": {
		shape: "open",
		tone: "neutral",
		glyph: g.single.off,
		role: "text",
		alt: "Not chosen"
	},
	"choice:chosen": {
		shape: "chosen",
		tone: "accent",
		glyph: g.single.on,
		role: "accent",
		alt: "Chosen"
	},
	"priority:none": {
		shape: "priorityNone",
		tone: "neutral",
		glyph: "-",
		role: "dim",
		alt: "No priority"
	},
	"priority:low": {
		shape: "priorityLow",
		tone: "neutral",
		glyph: "!",
		role: "dim",
		alt: "Low priority"
	},
	"priority:medium": {
		shape: "priorityMedium",
		tone: "neutral",
		glyph: "!!",
		role: "dim",
		alt: "Medium priority"
	},
	"priority:high": {
		shape: "priorityHigh",
		tone: "neutral",
		glyph: "!!!",
		role: "text",
		alt: "High priority"
	},
	"priority:urgent": {
		shape: "priorityUrgent",
		tone: "warning",
		glyph: g.status.warning,
		role: "warning",
		alt: "Urgent"
	},
	"field:status": {
		shape: "status",
		tone: "neutral",
		glyph: g.single.off,
		role: "dim",
		alt: "Status"
	},
	"field:project": {
		shape: "project",
		tone: "neutral",
		glyph: g.multi.off,
		role: "dim",
		alt: "Project"
	},
	"field:label": {
		shape: "label",
		tone: "neutral",
		glyph: g.single.on,
		role: "dim",
		alt: "Label"
	},
	"field:draft": {
		shape: "draft",
		tone: "neutral",
		glyph: "✎",
		role: "dim",
		alt: "Draft"
	}
};
/** What a name draws as. */
const meaningOf = (name) => meanings[name];

// ../../lib/kits/core/src/lines.ts
const span = (text, style = {}) => ({
	text,
	...style
});
const line = (spans, hit) => hit === void 0 ? { spans } : {
	spans,
	hit
};
/** An empty row. */
const blank = () => ({ spans: [] });
/** A line's characters, without its styles. */
const textOf = (l) => l.spans.map((s) => s.text).join("");
/** Cells a code point takes: 0 for marks and joiners, 2 for East Asian wide and emoji. */
const cellsOf = (c) => {
	if (c < 32 || c >= 127 && c < 160) return 0;
	if (c < 768) return 1;
	if (c >= 768 && c <= 879 || c >= 8203 && c <= 8207 || c >= 8400 && c <= 8447 || c >= 65024 && c <= 65039 || c === 65279 || c >= 917760 && c <= 917999) return 0;
	return c >= 4352 && c <= 4447 || c === 9001 || c === 9002 || c >= 8986 && c <= 8987 || c >= 9193 && c <= 9196 || c === 9200 || c === 9203 || c >= 9725 && c <= 9726 || c >= 9748 && c <= 9749 || c >= 9800 && c <= 9811 || c === 9855 || c === 9875 || c === 9889 || c >= 9898 && c <= 9899 || c >= 9917 && c <= 9918 || c >= 9924 && c <= 9925 || c === 9934 || c === 9940 || c === 9962 || c >= 9970 && c <= 9971 || c === 9973 || c === 9978 || c === 9981 || c === 9989 || c >= 9994 && c <= 9995 || c === 10024 || c === 10060 || c === 10062 || c >= 10067 && c <= 10069 || c === 10071 || c >= 10133 && c <= 10135 || c === 10160 || c === 10175 || c >= 11035 && c <= 11036 || c === 11088 || c === 11093 || c >= 11904 && c <= 12350 || c >= 12353 && c <= 13311 || c >= 13312 && c <= 19903 || c >= 19968 && c <= 42191 || c >= 43360 && c <= 43391 || c >= 44032 && c <= 55203 || c >= 63744 && c <= 64255 || c >= 65040 && c <= 65049 || c >= 65072 && c <= 65135 || c >= 65280 && c <= 65376 || c >= 65504 && c <= 65510 || c >= 127744 && c <= 128591 || c >= 128640 && c <= 128767 || c >= 129280 && c <= 129535 || c >= 129648 && c <= 129791 || c >= 131072 && c <= 262141 ? 2 : 1;
};
/** Cells `text` takes: wide characters two, marks and joiners none. Never `.length`. */
function cellWidth(text) {
	let n = 0;
	for (const ch of text) n += cellsOf(ch.codePointAt(0) ?? 0);
	return n;
}
/** The longest start of `text` that fits `cells`, and the rest. */
function split(text, cells) {
	let used = 0;
	let at = 0;
	for (const ch of text) {
		const w = cellsOf(ch.codePointAt(0) ?? 0);
		if (used + w > cells) break;
		used += w;
		at += ch.length;
	}
	return [text.slice(0, at), text.slice(at)];
}
/**
* The pieces of a word a line may end between: each wide character is one, as East Asian text
* has no spaces to break at, and a run of narrow ones is one. A mark stays with what it marks.
*/
function units(word) {
	const out = [];
	let run = "";
	for (const ch of word) {
		const w = cellsOf(ch.codePointAt(0) ?? 0);
		if (w === 2) {
			if (run) out.push(run);
			run = "";
			out.push(ch);
		} else if (w === 0 && !run && out.length) out[out.length - 1] += ch;
		else run += ch;
	}
	if (run) out.push(run);
	return out;
}
/**
* Greedy word wrap in cells: a line ends at a space or between wide characters, a narrow word
* longer than the width is broken, and a `\n` ends a line.
*/
function wrap(text, width) {
	const out = [];
	for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
		let line = "";
		let used = 0;
		const words = paragraph.split(/[ \t]+/).filter(Boolean);
		if (words.length === 0) out.push("");
		for (const word of words) {
			let gap = used > 0 ? 1 : 0;
			for (let unit of units(word)) {
				let w = cellWidth(unit);
				if (used > 0 && used + gap + w > width) {
					out.push(line);
					line = "";
					used = 0;
					gap = 0;
				}
				while (w > width) {
					const [head, rest] = split(unit, width);
					out.push(head);
					unit = rest;
					w = cellWidth(unit);
				}
				line += (gap ? " " : "") + unit;
				used += gap + w;
				gap = 0;
			}
		}
		if (words.length > 0) out.push(line);
	}
	return out;
}
/** The glyph a cut text ends in. */
const ELLIPSIS = "…";
/** `text` cut to `width` cells with `…` when it is longer. */
function truncate(text, width) {
	if (cellWidth(text) <= width) return text;
	return split(text, Math.max(0, width - 1))[0] + "…";
}
/**
* Plain text wrapped to `width` cells and bounded in lines: `{min: 1, max: 1}` truncates to one
* line; no options wraps without limit.
*/
function clamp$1(text, width, options = {}) {
	if (width < 1) return [];
	const { min = 0, max = 1e400 } = options;
	const cap = Math.max(min, max);
	let lines = wrap(text, width);
	if (lines.length > cap) {
		if (cap === 0) return [];
		const rest = lines.slice(cap - 1).join(" ");
		lines = [...lines.slice(0, cap - 1), truncate(rest, width)];
	}
	while (lines.length < min) lines.push("");
	return lines;
}
const INLINE = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<!\w)__([^_\n]+?)__(?!\w)|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])|\[([^\]\n]+)\]\([^)\s]+\)/g;
/**
* One paragraph of inline Markdown as spans in `style`: code takes the `code` role, bold and
* italic their faces over the style, and a link keeps its words, underlined. Line ends become
* spaces.
*/
function inline(text, style = {}) {
	const spans = [];
	const flat = text.replace(/\r\n?/g, "\n").split("\n").join(" ");
	let at = 0;
	for (const m of flat.matchAll(INLINE)) {
		const start = m.index ?? 0;
		if (start > at) spans.push({
			...style,
			text: flat.slice(at, start)
		});
		const [, code, bold, underscored, italic, slanted, link] = m;
		if (code !== void 0) spans.push({
			text: code,
			role: "code"
		});
		else if (bold !== void 0 || underscored !== void 0) spans.push({
			...style,
			text: bold ?? underscored ?? "",
			bold: true
		});
		else if (italic !== void 0 || slanted !== void 0) spans.push({
			...style,
			text: italic ?? slanted ?? "",
			italic: true
		});
		else spans.push({
			...style,
			text: link ?? "",
			role: "link",
			underline: true
		});
		at = start + m[0].length;
	}
	if (at < flat.length) spans.push({
		...style,
		text: flat.slice(at)
	});
	return spans;
}
/** Plain text as one span in `style`: what a person typed, which is not Markdown. */
const literal = (text, style = {}) => [{
	...style,
	text
}];
const sameStyle = (a, b) => a.role === b.role && !a.bold === !b.bold && !a.italic === !b.italic && !a.underline === !b.underline && !a.inverse === !b.inverse && a.hit === b.hit;
/** Spans in lines of at most `width` cells: greedy by word, a space at a break dropped. */
function wrapSpans(spans, width) {
	const lines = [[]];
	let used = 0;
	const put = (from, text) => {
		const row = lines[lines.length - 1] ?? [];
		const last = row[row.length - 1];
		if (last && sameStyle(last, from)) last.text += text;
		else row.push({
			...from,
			text
		});
		used += cellWidth(text);
	};
	const end = () => {
		const row = lines[lines.length - 1] ?? [];
		while (row.length) {
			const last = row[row.length - 1];
			if (!last) break;
			last.text = last.text.replace(/ +$/, "");
			if (last.text) break;
			row.pop();
		}
		lines.push([]);
		used = 0;
	};
	for (const from of spans) for (const paragraph of from.text.split("\n").map((p, i) => ({
		p,
		isBreak: i > 0
	}))) {
		if (paragraph.isBreak) end();
		for (const piece of paragraph.p.replace(/[\t ]/g, " ").split(/( +)/)) {
			if (!piece) continue;
			if (piece.startsWith(" ")) {
				if (used > 0) put(from, piece);
				continue;
			}
			for (let unit of units(piece)) {
				if (used > 0 && used + cellWidth(unit) > width) end();
				while (cellWidth(unit) > width) {
					const [head, rest] = split(unit, width);
					put(from, head);
					end();
					unit = rest;
				}
				put(from, unit);
			}
		}
	}
	const last = lines[lines.length - 1] ?? [];
	const tail = last[last.length - 1];
	if (tail) tail.text = tail.text.replace(/ +$/, "");
	return lines;
}
/** Cells a run of spans takes. */
const spansWidth = (spans) => spans.reduce((n, s) => n + cellWidth(s.text), 0);
/**
* Spans as lines of `width` cells: wrapped by word after a `lead`, later lines hanging under
* the first line's text.
*/
function block(spans, width, options = {}) {
	const lead = options.lead ?? [];
	const hang = options.hang ?? (lead.length ? [span(" ".repeat(spansWidth(lead)))] : []);
	const room = Math.max(1, width - spansWidth(lead));
	let rows = wrapSpans(spans, room);
	const max = options.max ?? 1e400;
	if (rows.length > max) {
		rows = rows.slice(0, Math.max(0, max));
		const cut = rows[rows.length - 1];
		const tail = cut?.[cut.length - 1];
		if (cut && tail) {
			const over = spansWidth(cut) + 1 - room;
			if (over > 0) tail.text = split(tail.text, Math.max(0, cellWidth(tail.text) - over))[0];
			cut.push({
				...tail,
				text: "…"
			});
		}
	}
	return rows.map((row, i) => line([...i ? hang : lead, ...row], options.hit));
}
/** A line with each of its spans marked as part of `hit`, where the row holds other things too. */
const hitSpans = (spans, hit) => spans.map((s) => ({
	...s,
	hit
}));
/** `spans` cut to `width` cells, the last ending in `…` when they were longer. */
function truncateSpans(spans, width) {
	if (spansWidth(spans) <= width) return [...spans];
	const out = [];
	let room = Math.max(0, width - 1);
	for (const s of spans) {
		if (room <= 0) break;
		const [head] = split(s.text, room);
		if (head) out.push({
			...s,
			text: head
		});
		room -= cellWidth(head);
		if (head.length < s.text.length) break;
	}
	const last = out[out.length - 1];
	if (width > 0) out.push({
		...last,
		text: "…"
	});
	return out;
}
/** What a window's marker says of the rows past its edge: `↓ 3 more`. */
const moreText = (glyph, count) => `${glyph} ${count} more`;
/** Cells a panel's rail and its gap take: a row of a panel starts this far in. */
const PANEL_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;
/** Markdown's own characters in words that are only words. */
const escapeMarkdown = (text) => text.replace(/([\\`*_{}[\]<>()#+!|~-])/g, "\\$1");

// ../../lib/kits/core/src/surfaces.ts
const fact = (value, note, source) => ({
	value,
	note,
	source
});
const unverified = (hint) => ({
	unverified: true,
	hint
});
const README = "lib/kits/README.md, What still differs between the clients";
const CLAUDE_MD = "49167447:skills/agent-plugin-dev/references/claude.md, Graphical surfaces (extension 2.1.327)";
const TYPES = "claude-code types, Elements (apps/*/.claude-types/claude-code/index.d.ts, `pnpm drive types <app>`)";
/**
* The table. Surfaces are the rows, capabilities the columns; each column's value type is
* `CapValues`, which the `satisfies` clause checks, and the literals stay for the types below.
*/
const surfaces = {
	pi: {
		drawing: "terminal",
		keyFocus: fact("kit", "the extension owns every key and draws its own pointer", README),
		hover: fact("kit", "pi reports the pointer; the kit bolds the label", README),
		hotkeys: fact(true, "the caller owns the binding; the key is drawn dim after the label", "lib/kits/buttons/src/manifest.ts, feature `bind`"),
		window: fact(true, "the kit draws ↑/↓ more and moves `top`", "lib/kits/list/src/manifest.ts, feature `window`"),
		framesPane: fact(false, "the kit draws a sheet's edges", "lib/kits/sheet/src/manifest.ts, feature `edges`"),
		inputRows: fact(1, "pi's field is one row and follows the cursor", README + ", Blocks"),
		input: fact(true, "pi's own field, in the row an `input` slot keeps", README + ", Blocks"),
		select: unverified(),
		progress: unverified(),
		svg: fact(false, "pi draws cells; there is no vector element", "pi-tui has no image or vector component"),
		textSize: fact(false, "the terminal has one size", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		transcriptKeyScroll: unverified(),
		images: fact(false, "pi-tui has no image component", "pi-tui exports (no Image)"),
		cells: fact(true, "the kit lays out every line in cells: a row is cut to its room, and there is no toolbar line or element for a host to draw", README)
	},
	"claude-terminal": {
		drawing: "terminal",
		keyFocus: fact("ring", "a parked ring plus a `ui.focus` hook put the kit's pointer on the row", README),
		hover: fact("painter", "the engine inverts a Button under the pointer; the painter swaps the row's colours first", README),
		hotkeys: fact(true, "a Button's `hotkey` presses it while the plugin's site holds the focus", TYPES + ", ButtonProps.hotkey"),
		window: fact(true, "the wheel reaches the mod as `ui.scroll`; the kit moves `top`", "lib/kits/list/src/manifest.ts, feature `window`"),
		framesPane: fact(true, "a pane or box has the engine's frame and Close; a mod draws `sheetHead` and the body", README + ", A panel over the screen"),
		inputRows: fact("many", "the engine's field wraps, and stands alone on its rows", README + ", Blocks"),
		input: fact(true, "the engine's `Input`", TYPES + ", Elements.terminal"),
		select: fact(true, "the engine's `Select`", TYPES + ", Elements.terminal"),
		progress: fact(true, "the engine's `Progress`", TYPES + ", Elements.terminal"),
		svg: fact(false, "the terminal's table has no `Svg`", TYPES + ", Elements.terminal"),
		textSize: fact(false, "the terminal has one size and ignores `size`", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		transcriptKeyScroll: unverified(),
		images: fact(true, "the terminal's table has an `Image`", TYPES + ", Elements.terminal"),
		cells: fact(true, "the kit lays out every line in cells: a row is cut to its room, and there is no toolbar line or element for a host to draw", README)
	},
	vscode: {
		drawing: "gui",
		keyFocus: fact("host", "the host draws a Button's focus itself", "lib/kits/band/src/manifest.ts, feature `focus`"),
		hover: fact("host", "the host draws a Button's hover state itself", "lib/kits/buttons/src/manifest.ts, feature `hover`"),
		hotkeys: fact(false, "the webview does not act on a Button's `hotkey` (checked live)", "lib/kits/buttons/src/manifest.ts, feature `bind`; VS Code extension 2.1.327"),
		window: fact(false, "the surface scrolls the pane, so there is no window for the kit to move", "lib/kits/list/src/manifest.ts, feature `window`"),
		framesPane: fact(true, "the host frames the pane and owns its Close", "lib/kits/sheet/src/manifest.ts, feature `edges`"),
		inputRows: fact(1, "an `Input` is one line", CLAUDE_MD),
		input: fact(true, "the extension's table has an `Input`", TYPES + ", Elements.vscode"),
		select: fact(true, "the extension's table has a `Select`", TYPES + ", Elements.vscode"),
		progress: fact(true, "the extension's table has a `Progress`", TYPES + ", Elements.vscode"),
		svg: fact(true, "drawn as an image, so it cannot take theme colours: check a light theme", TYPES + ", SvgProps (the editor draws an image)"),
		textSize: fact(false, "the webview draws a Text's colour, dimColor, bold, italic and underline, and no `size`: every Text is the body's size. A Markdown heading has real sizes", "extension 2.1.330 webview/index.js, the Text style function (read; probed live: every role drew 13px)"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: fact(false, "a Button's label never wraps; a long one overflows a narrow pane", CLAUDE_MD),
		transcriptKeyScroll: fact(false, "scrolling to a key inside a mod's AssistantMessage is denied or does nothing", CLAUDE_MD),
		images: fact(false, "the table has no `Image`: the host shows an image itself, and a mod draws nothing there", TYPES + ", Elements.vscode (`Image` is the terminal's alone)"),
		cells: fact(false, "the host lays out and wraps; the kit sets no width in cells", README + ", Draw on Claude Desktop and VS Code")
	},
	desktop: {
		drawing: "gui",
		keyFocus: unverified(),
		hover: unverified(),
		hotkeys: unverified(),
		window: unverified(),
		framesPane: unverified(),
		inputRows: unverified(),
		input: fact(true, "the extension's table has an `Input`, as VS Code's does; never driven", TYPES + ", Elements.desktop"),
		select: fact(true, "the extension's table has a `Select`, as VS Code's does; never driven", TYPES + ", Elements.desktop"),
		progress: unverified("the table has a `Progress`"),
		svg: fact(true, "drawn as an image, or in a sandboxed frame when `isInteractive`", TYPES + ", SvgProps; never driven"),
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		transcriptKeyScroll: fact(true, "the engine supports targeting element keys; Answer already relies on it for Desktop review, not verified live", TYPES + ", ui.scroll; apps/answer/src/claude.tsx, roundActions"),
		images: fact(false, "the table has no `Image`: the host shows an image itself, and a mod draws nothing there", TYPES + ", Elements.desktop (`Image` is the terminal's alone)"),
		cells: fact(false, "the host lays out and wraps; the kit sets no width in cells", README + ", Draw on Claude Desktop and VS Code")
	},
	mobile: {
		drawing: "gui",
		keyFocus: unverified(),
		hover: unverified(),
		hotkeys: unverified(),
		window: unverified(),
		framesPane: unverified(),
		inputRows: unverified(),
		input: fact(false, "an app is sent an `Input` only if it named it in `draws` on its `ui_attach`; the kit's apps name none", TYPES + ", Elements.mobile"),
		select: fact(false, "an app is sent a `Select` only if it named it in `draws` on its `ui_attach`; the kit's apps name none", TYPES + ", Elements.mobile"),
		progress: fact(false, "an app is sent a `Progress` only if it named it in `draws`; its Box and Text otherwise", TYPES + ", Elements.mobile"),
		svg: fact(true, "drawn in a web view", TYPES + ", SvgProps"),
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		transcriptKeyScroll: unverified(),
		images: fact(false, "the table has no `Image`: the host shows an image itself, and a mod draws nothing there", TYPES + ", Elements.mobile (`Image` is the terminal's alone)"),
		cells: fact(false, "the host lays out and wraps; the kit sets no width in cells", README + ", Draw on Claude Desktop and VS Code")
	}
};
/** What the table says of one capability on one surface: `undefined` when unverified. */
const factOf = (surface, cap) => {
	const f = surfaces[surface][cap];
	return "unverified" in f ? void 0 : f;
};
/** `undefined` when `surface` has the need, otherwise why not. */
function lackOf(surface, need) {
	const [cap, values] = need.split(":", 2);
	const f = factOf(surface, cap);
	if (!f) {
		const hint = surfaces[surface][cap].hint;
		return {
			cap,
			note: `${cap} has not been checked on ${surface}${hint ? ` (${hint})` : ""}`
		};
	}
	return (values === void 0 ? !(f.value === false || f.value === 0 || f.value === "") : values.split("|").includes(String(f.value))) ? void 0 : {
		cap,
		note: f.note
	};
}
/** Whether `surface` has the need. */
const holds = (surface, need) => lackOf(surface, need) === void 0;
/** Every fact a surface has, by name, for `ctx.caps`. */
function capsOf(surface) {
	const out = {};
	for (const cap of Object.keys(surfaces[surface])) {
		if (cap === "drawing") continue;
		const f = factOf(surface, cap);
		if (f) out[cap] = f.value;
	}
	return out;
}
const nothing = () => void 0;
/** A context for `surface`; events left out do nothing. */
const ctxOf = (surface, events = {}) => ({
	surface,
	caps: capsOf(surface),
	press: events.press ?? nothing,
	input: events.input ?? nothing,
	submit: events.submit ?? nothing
});
/**
* Whether the context's surface has the capability, narrowing it to the surfaces that do.
* A drawing asks this, never which surface it is.
*/
function can(ctx, need) {
	return holds(ctx.surface, need);
}

// ../../lib/kits/core/src/paint/gui.tsx
/** The props of a `Text` in a role of the style. `code` is a chip; `link` is underlined. */
const roleProps = (role) => {
	switch (role) {
		case void 0:
		case "text": return {};
		case "dim":
		case "border": return { dimColor: true };
		case "accent": return { color: "claude" };
		case "warning": return { color: tokens.gui.tone.warning };
		case "success":
		case "error": return { color: role };
		case "code": return {
			backgroundColor: tokens.gui.chip,
			mono: true
		};
		case "link": return { underline: true };
	}
};
/**
* The `Text` props of a type role: its size and weight from the host's scale, and dim for a role
* that is. A drawing takes a role and never a size.
* @param o `tabular` sets digits of one width, for a count or a time that changes or lines up.
* `isSized: false` leaves the size out, for a host that draws none: its `section` is then dim,
* since it cannot be smaller. `isToned: false` leaves the role's tone to the spans inside.
*/
const typeProps = (role, o = {}) => {
	const r = tokens.type[role];
	const isSized = o.isSized !== false;
	const isDim = o.isToned !== false && (r.role === "dim" || !isSized && role === "section");
	return {
		...isSized ? { size: r.size } : {},
		weight: r.weight,
		...isDim ? { dimColor: true } : {},
		...o.tabular ? { tabular: true } : {}
	};
};
/**
* The Markdown heading level a role takes where the host draws no `Text` sizes. The webview
* leaves about an em under a heading, which a `Box` cannot take back (it reads no negative
* margin), so a heading sits a little further from what it heads than a `Text` would.
*/
const HEADING = {
	title: "##",
	heading: "###"
};
/**
* Words in a type role: a `Text` that sets its size, weight and tone from `tokens.type`. Where
* the host draws no `Text` size (`textSize`: VS Code's webview reads none), a `title` or a
* `heading` of plain words is the host's own Markdown heading, which has real sizes; every other
* role is told apart by weight and tone. `wrap: "truncate-end"` cuts the words at the edge with
* `…` instead of wrapping them.
*/
function typed(g, role, children, o = {}) {
	const { Box, Markdown, Text } = g.els;
	const isSized = can(g, "textSize");
	if (!isSized && (role === "title" || role === "heading") && typeof children === "string") return /* @__PURE__ */ h(Box, { key: o.key }, /* @__PURE__ */ h(Markdown, { text: `${HEADING[role]} ${escapeMarkdown(children)}` }));
	return /* @__PURE__ */ h(Text, {
		key: o.key,
		wrap: o.wrap,
		...typeProps(role, {
			...o,
			isSized
		})
	}, children);
}
/**
* What opens in place, set apart as one object: a filled well, set in by `tokens.gui.panel`, so
* its words stay a step inside the fill and a control in it stays on it. A terminal draws the
* same object as a rail (`panelLines`).
* Use it for an editor, a note, a warning with its own actions and an opened row: whatever the
* person opens or is asked about, not for a group of rows that is always there.
* @param o `key` addresses it. `gap` is the step between its parts. @default "sm"
*/
function panel(g, o, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column",
		rowGap: tokens.gui.space[o.gap ?? "sm"],
		paddingX: tokens.gui.panel.x,
		paddingY: tokens.gui.panel.y,
		backgroundColor: tokens.gui.fill,
		borderStyle: "round",
		borderColor: "#00000000"
	}, parts.filter(Boolean));
}
/**
* One row of a list or a form: its line and `tokens.gui.row.pad` above and below, whether or not a Button is in it, its
* parts on one centre line a step apart. A column of these keeps one beat.
* @param o `align: "start"` sets the parts on the first line instead of the centre, for a row whose
* text may wrap: its icon stays beside the first line.
*/
function rowOf(g, o, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: o.align === "start" ? "flex-start" : "center",
		justifyContent: o.justify,
		paddingY: tokens.gui.row.pad,
		columnGap: tokens.gui.across.sm
	}, parts.filter(Boolean));
}
/** Rows under each other, `tokens.gui.row.gap` apart: the column a list's `rowOf`s stand in. */
function rows(g, o, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column",
		rowGap: tokens.gui.row.gap
	}, parts.filter(Boolean));
}
/**
* Styled spans as one `Text`: a nested run per span, in its role and face. A span's `hit` is not
* a control here: a graphical control is a `Button`, which a component draws itself.
* @param spans A caption or a line of a contract, as `terminal.ts` takes it.
* @param options `type` sets the line in a type role; `wrap: "truncate-end"` cuts it at the
* edge with `…` instead of wrapping.
*/
function spans(g, list, options = {}) {
	const { Text } = g.els;
	return /* @__PURE__ */ h(Text, {
		wrap: options.wrap,
		...options.type ? typeProps(options.type, {
			...options,
			isSized: can(g, "textSize"),
			isToned: false
		}) : {}
	}, list.map((s, i) => /* @__PURE__ */ h(Text, {
		key: `s${i}`,
		...roleProps(s.role),
		weight: s.bold ? "bold" : void 0,
		italic: s.italic || void 0,
		underline: s.underline || void 0,
		inverse: s.inverse || void 0
	}, s.text)));
}
/** The kit's icons: small stroked drawings on a 16-pixel grid. */
const ICONS = {
	wrong: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M8 4.7v4\"/><path d=\"M8 11.3v.01\"/>",
	stale: "<path d=\"M13.2 8.2A5.2 5.2 0 1 1 11.7 4.4\"/><path d=\"M13.4 2.4v3.2h-3.2\"/>",
	missing: "<path d=\"M8 3.2v9.6M3.2 8h9.6\"/>",
	warning: "<path d=\"M8 2.6 14.2 13.2H1.8L8 2.6Z\"/><path d=\"M8 6.8v2.9\"/><path d=\"M8 11.7v.01\"/>",
	success: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M5.2 8.2l2 2 3.6-4\"/>",
	error: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2\"/>",
	pending: "<circle cx=\"8\" cy=\"8\" r=\"6.2\" stroke-dasharray=\"2.4 2.4\"/>",
	open: "<circle cx=\"8\" cy=\"8\" r=\"5.4\"/>",
	chosen: "<circle cx=\"8\" cy=\"8\" r=\"5.4\"/><circle cx=\"8\" cy=\"8\" r=\"2.6\" fill=\"currentColor\" stroke=\"none\"/>",
	dropped: "<circle cx=\"8\" cy=\"8\" r=\"5.4\"/><path d=\"M5.6 8h4.8\"/>",
	note: "<path d=\"M2.6 3.4h10.8v7.2H7.4l-3 2.4v-2.4H2.6Z\"/><path d=\"M5.2 6h5.6M5.2 8h3.6\"/>",
	question: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M6.3 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4\"/><path d=\"M8 11.4v.01\"/>",
	write: "<path d=\"M10.6 2.9l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6Z\"/><path d=\"M9.2 4.3l2.5 2.5\"/>",
	status: "<circle cx=\"8\" cy=\"8\" r=\"5.6\"/><circle cx=\"8\" cy=\"8\" r=\"1.6\" fill=\"currentColor\"/>",
	priorityNone: "<path d=\"M3.2 8h1.4M7.3 8h1.4M11.4 8h1.4\"/>",
	priorityLow: "<path d=\"M4 13v-2.6\"/><path d=\"M8 13V7.4\" stroke-opacity=\".4\"/><path d=\"M12 13V4.4\" stroke-opacity=\".4\"/>",
	priorityMedium: "<path d=\"M4 13v-2.6M8 13V7.4\"/><path d=\"M12 13V4.4\" stroke-opacity=\".4\"/>",
	priorityHigh: "<path d=\"M4 13v-2.6M8 13V7.4M12 13V4.4\"/>",
	priorityUrgent: "<rect x=\"2.6\" y=\"2.6\" width=\"10.8\" height=\"10.8\" rx=\"2.6\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M8 5.2v3.4M8 10.8v.01\" stroke=\"#ffffff\"/>",
	project: "<path d=\"M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2Z\"/><path d=\"M2.8 5.2 8 8l5.2-2.8M8 8v5.6\"/>",
	label: "<circle cx=\"8\" cy=\"8\" r=\"3.4\" fill=\"currentColor\" stroke=\"none\"/>",
	draft: "<path d=\"M10.6 2.8 13.2 5.4 5.7 12.9 2.6 13.4 3.1 10.3Z\"/><path d=\"M9.2 4.2l2.6 2.6\"/>"
};
/**
* The markup of an icon, a whole `<svg>` document.
* @param tone The state it marks; grey when none.
* @param size Its side in CSS pixels.
*/
const iconSvg = (name, tone = "neutral", size = tokens.gui.icon) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" color="${tokens.gui.tone[tone]}" stroke="${tokens.gui.tone[tone]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
/**
* An icon: an image, grey or in the colour of the state it marks.
* @param alt What it says, for a reader that cannot see it. @default the icon's name
*/
function icon(g, name, options = {}) {
	const { Svg } = g.els;
	const { tone = "neutral", alt = name, size = tokens.gui.icon } = options;
	return /* @__PURE__ */ h(Svg, {
		source: iconSvg(name, tone, size),
		alt,
		width: size,
		height: size
	});
}
/**
* An icon that carries a meaning (`priority:high`, `kind:stale`, `decision:apply`,
* `state:error`): the kit's drawing for it, in its role's colour. A terminal draws the same
* name as a glyph (`meaningSpan`).
* @param o `size` in CSS pixels; `alt` replaces what it says.
*/
function meaning(g, name, o = {}) {
	const m = meaningOf(name);
	return icon(g, m.shape, {
		tone: m.tone,
		alt: o.alt ?? m.alt,
		size: o.size
	});
}

// ../../lib/kits/buttons/src/model.ts
/**
* The button row's view model: what is lit, what goes quiet and what is drawn on a surface.
* Pure and plain: the drawings read it, and so does the snapshot that holds it across surfaces.
* No host imports.
*/
/** How a button's key is printed after its label: `↵` for Enter, else in brackets; nothing for none. */
const shortcutOf = (b) => b.hit === void 0 || !b.hotkey ? b.hotkey : b.hotkey === "enter" ? tokens.glyph.enter : `[${b.hotkey}]`;
/** `word` with its first letter in capitals: a graphical button's label, which has no key beside it. */
const capital$1 = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/**
* The buttons as a screen shows them. One button of a screen is lit, the first that asks, so a
* screen never has two suggested actions; while Close asks, none is lit and every control is
* quiet, whatever the caller said.
*/
function settle(rows, confirming = false) {
	let isLitOne = false;
	return rows.map((row) => row.map((b) => {
		if (confirming) return {
			...b,
			isLit: false,
			isQuiet: b.hit === void 0 ? void 0 : true
		};
		if (!b.isLit) return b;
		if (isLitOne) return {
			...b,
			isLit: false
		};
		isLitOne = true;
		return b;
	}));
}
/** What `settle`d buttons are drawn as on `surface`. */
function view$3(model, surface) {
	const hasKeys = holds(surface, "hotkeys");
	const isGui = surfaces[surface].drawing === "gui";
	const rows = settle(model.rows, model.confirming).flatMap((row) => {
		const drawn = row.flatMap((b) => {
			if (b.hit === void 0) return hasKeys ? [{
				label: b.label,
				key: b.hotkey,
				tone: "hint"
			}] : [];
			const key = hasKeys ? shortcutOf(b) : "";
			return [{
				label: isGui && !b.isLiteral ? capital$1(b.label) : b.label,
				hit: b.hit,
				...key ? { key } : {},
				tone: b.isLit ? "lit" : b.isChosen && isGui && !model.confirming ? "chosen" : b.isQuiet ? "quiet" : isGui ? "quiet" : "plain"
			}];
		});
		return drawn.length ? [drawn] : [];
	});
	return {
		lead: textOf({ spans: [...model.lead ?? []] }),
		rows
	};
}

// ../../lib/kits/buttons/src/gui.tsx
/** Before the label of the chosen button. */
const CHECK = "✓";
/**
* The buttons of a screen's footer: a row each, every row starting at the same edge, a Button
* per action. The view model decides what is lit (one only), what is quiet while Close asks, and
* that a keyboard-only hint is not drawn: a surface with a pointer has no use for a key and no
* place to show one. VS Code paints a Button by its `dimColor` alone, so the suggested one is
* `primary` and the rest are dimmed. The host wraps a row, so nothing drops.
* @param props `rows` are the actions; a label is capitalised unless it is `isLiteral`. `lead`
* is drawn as a caption before the first Button of the first row.
* @returns `null` when there is nothing to draw.
*/
function buttonRow$1(g, props) {
	const { Box, Button } = g.els;
	const drawn = view$3(props, g.surface);
	const lead = props.lead?.length ? spans(g, props.lead, { type: "caption" }) : null;
	if (drawn.rows.length === 0 && !lead) return null;
	const all = drawn.rows.length ? drawn.rows : [[]];
	return rows(g, {}, ...all.map((row, r) => /* @__PURE__ */ h(Box, {
		key: `r${r}`,
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.gui.across.xs,
		rowGap: tokens.gui.space.xs,
		paddingX: props.isFlush ? void 0 : tokens.gui.across.inset
	}, r === 0 ? lead : null, row.map((b) => /* @__PURE__ */ h(Button, {
		key: b.hit,
		variant: b.tone === "lit" ? "primary" : void 0,
		dimColor: b.tone !== "lit" || void 0,
		label: b.tone === "chosen" ? `${CHECK} ${b.label}` : b.label,
		onPress: () => g.press(b.hit)
	})))));
}

// ../../lib/kits/frame/src/model.ts
/**
* The frame's view model: what its head, its footer and its notice are on a surface. Pure and
* plain: the graphical drawing reads it, and so does the snapshot that holds it across surfaces.
* The footer is decided by the buttons' view model (`@agents/kit-buttons/model.ts`), which
* says what is lit and what goes quiet while Close asks. A frame has one lit button: the head's
* own actions come first, so the footer's lit one is quieted where they have one. No host imports.
*/
const words$1 = (spans) => textOf({ spans: [...spans ?? []] });
function view$2(model, surface) {
	const isCells = holds(surface, "cells");
	const asks = !!model.close?.confirming;
	const hasCaption = (model.caption?.length ?? 0) > 0;
	const keep = model.close?.keep ?? "esc";
	const [acts = [], ...footer] = settle([model.actions ?? [], ...model.footer ?? []], asks);
	return {
		head: {
			title: isCells ? hasCaption ? void 0 : model.title : model.title && model.title !== model.hostTitle ? model.title : void 0,
			caption: words$1(model.caption),
			close: asks ? "question" : isCells ? "control" : "host",
			question: asks ? view$3({
				rows: [[{
					hotkey: "enter",
					label: "Discard",
					hit: "frame:discard",
					essential: true
				}, {
					hotkey: keep,
					label: "Keep",
					hit: "frame:keep",
					essential: true
				}]],
				confirming: true
			}, surface) : void 0,
			actions: !isCells && !asks && acts.length ? view$3({ rows: [acts] }, surface) : void 0
		},
		footer: view$3({
			rows: footer,
			confirming: asks
		}, surface),
		notice: words$1(model.notice)
	};
}

// ../../lib/kits/frame/src/gui.tsx
/**
* The captioned frame on the graphical surfaces. The host frames a pane and owns its Close, so
* there are no rules and no edges: the frame's top is a toolbar line, its body a column.
*
* The body and the notice are elements and spans here, in the props of `captionFrame`, drawn with
* the kit's own `gui.tsx` functions; the footer is the model's `Button[][]`, which the buttons'
* view model decides: one lit, and every control quiet while Close asks.
*/
const asModel = (f) => ({
	title: f.title ?? "",
	caption: f.caption,
	close: f.close,
	hostTitle: f.hostTitle,
	actions: f.actions,
	footer: f.footer,
	notice: f.notice,
	body: { question: "" }
});
/** Close's question, once it asks, set apart as a panel: it is a warning with its own actions. */
function question(g, f, v) {
	const { Box, Button, Text } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: tokens.gui.across.inset
	}, panel(g, { key: "ask" }, rowOf(g, {}, meaning(g, "state:warning"), /* @__PURE__ */ h(Text, {
		...typeProps("body"),
		...roleProps("warning")
	}, f.close?.question ?? "Discard answers?"), /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: tokens.gui.across.xs
	}, v.head.question?.rows[0]?.map((b) => /* @__PURE__ */ h(Button, {
		key: b.hit,
		dimColor: true,
		label: b.label,
		onPress: () => g.press(b.hit)
	}))))));
}
/** The toolbar line both heads are: the words at the start, the pane's own actions at the far edge. */
function head(g, f, v) {
	const { Box, Button } = g.els;
	if (v.head.close === "question") return question(g, f, v);
	const words = f.head ?? (v.head.title || v.head.caption ? /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.xs
	}, v.head.title ? typed(g, "heading", v.head.title) : null, v.head.caption ? spans(g, f.caption ?? [], { type: "caption" }) : null) : null);
	const acts = v.head.actions?.rows[0] ?? [];
	if (!words && acts.length === 0) return null;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "space-between",
		columnGap: tokens.gui.across.md,
		rowGap: tokens.gui.space.xs,
		paddingX: tokens.gui.across.inset,
		paddingY: tokens.gui.row.pad
	}, words, acts.length ? /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.gui.across.xs
	}, acts.map((b) => /* @__PURE__ */ h(Button, {
		key: b.hit,
		variant: b.tone === "lit" ? "primary" : void 0,
		dimColor: b.tone !== "lit" || void 0,
		label: b.label,
		onPress: () => g.press(b.hit)
	}))) : null);
}
/** A notice's row: an icon for the state its words are in, then the words. */
function notice$1(g, words) {
	const { Box } = g.els;
	if (!words?.length) return null;
	const role = words[0]?.role;
	const state = role === "warning" ? "state:warning" : role === "error" ? "state:error" : void 0;
	return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, rowOf(g, {}, state ? meaning(g, state) : null, spans(g, words, { type: state ? "body" : "caption" })));
}
/**
* An inline form: its head, its body, a notice and its footer in a column, a space between. The
* footer's buttons are the model's rows, decided by the buttons' view model.
*/
function captionFrame(g, f) {
	const { Box } = g.els;
	const v = view$2(asModel(f), g.surface);
	const [, ...footer] = settle([f.actions ?? [], ...f.footer ?? []], !!f.close?.confirming);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.md
	}, head(g, f, v), Array.isArray(f.body) ? f.body.filter(Boolean) : f.body, notice$1(g, f.notice), buttonRow$1(g, {
		rows: footer,
		confirming: !!f.close?.confirming
	}));
}

// ../../lib/kits/list/src/model.ts
/**
* The list's view model: what each row and group is on a surface. Pure and plain: the graphical
* drawing reads it, and so does the snapshot that holds it across surfaces. A terminal's rows
* are its own lines (`terminal.ts`), so its view says only what they are marked with. No host
* imports.
*/
/** What a row's `markHit` Button says a press steps the mark to. */
const STEP_TEXT = {
	open: "Choose",
	chosen: "Set aside",
	dropped: "Restore"
};
/** The longest an aside is, in cells, to scan as a column. */
const COLUMN_MAX = 8;
/** A count or a time: it starts with a digit and is short. */
const isColumn = (aside) => /^\d/.test(aside) && [...aside].length <= COLUMN_MAX;
const words = (text, fallback) => text ?? fallback;
/** How a row is drawn on `surface`. */
function rowView(r, l, isGui, isOpened) {
	const mark = r.mark ?? "open";
	const isDisabled = Boolean(r.disabled);
	const lead = mark === "none" ? void 0 : isGui && r.icon ? { meaning: r.icon } : { mark };
	const hasHit = isGui && r.hit !== void 0 && !isDisabled;
	return {
		text: r.text,
		isLiteral: Boolean(r.literal),
		isDim: isDisabled || mark === "dropped",
		...lead ? { lead } : {},
		...r.aside ? {
			aside: r.aside,
			...isGui ? { asideIn: isColumn(r.aside) ? "column" : "text" } : {}
		} : {},
		...hasHit ? { action: {
			hit: r.hit,
			label: isOpened ? words(l.closeAction, "Close") : words(r.action ?? l.action, "Open")
		} } : {},
		...isGui && r.markHit !== void 0 && !isDisabled && mark !== "none" ? { step: {
			hit: r.markHit,
			label: STEP_TEXT[mark]
		} } : {},
		isOpened,
		...r.hit !== void 0 ? { hit: r.hit } : {}
	};
}
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/** What the list is on `surface`: rows with their leads and controls, groups capped. */
function view$1(model, surface) {
	const isGui = surfaces[surface].drawing === "gui";
	const max = model.maxItems ?? tokens.gui.maxItems;
	const opened = model.opened ?? {};
	const isOpened = (r) => r.hit !== void 0 && opened[r.hit] !== void 0;
	const groups = model.groups.map((g) => {
		const capped = isGui && model.more && !model.more.isAll && g.rows.length > max;
		const shown = capped ? g.rows.filter((r, n) => n < max || isOpened(r)) : g.rows;
		const left = g.rows.length - shown.length;
		return {
			label: g.label,
			isActive: Boolean(g.active),
			isDone: Boolean(g.done),
			...isGui && g.hit !== void 0 ? { action: {
				hit: g.hit,
				label: words(model.action, "Open")
			} } : {},
			actions: isGui ? (g.actions ?? []).flatMap((a) => a.hit ? [{
				hit: a.hit,
				label: capital(a.label)
			}] : []) : [],
			rows: shown.map((r) => rowView(r, model, isGui, isOpened(r))),
			...capped && left > 0 && model.more ? { more: {
				hit: model.more.hit,
				label: `Show ${left} more`
			} } : {}
		};
	});
	return {
		groups,
		asideCells: Math.max(0, ...groups.flatMap((g) => g.rows.flatMap((r) => r.asideIn === "column" ? [[...r.aside ?? ""].length] : [])))
	};
}

// ../../lib/kits/list/src/gui.tsx
/**
* The list on the graphical surfaces: groups under a `section` heading, rows of one height a
* step apart, each led by an icon that says what it is.
*/
const { across } = tokens.gui;
/** What each mark is called for a reader who cannot see its icon. */
const MARK_TEXT = {
	open: "Left alone",
	chosen: "Chosen",
	dropped: "Set aside"
};
/** A row's lead: its meaning, or the bare mark where it was given none. */
function leadOf(g, r) {
	if (!r.lead) return null;
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: "lead",
		flexShrink: 0
	}, "meaning" in r.lead ? meaning(g, r.lead.meaning) : icon(g, r.lead.mark, {
		tone: r.lead.mark === "chosen" ? "accent" : "neutral",
		alt: MARK_TEXT[r.lead.mark]
	}));
}
/** A quiet Button at a row's or heading's edge. */
function control(g, c, key = c.hit) {
	const { Box, Button } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: `c:${c.hit}`,
		flexShrink: 0
	}, /* @__PURE__ */ h(Button, {
		key,
		dimColor: true,
		label: c.label,
		onPress: () => g.press(c.hit)
	}));
}
/**
* One row: its lead beside the first line, the text (wrapped whole, or one line the surface cuts),
* a count or time in the list's shared right-aligned column before the Button, which is at the far
* edge. A word aside follows the text. Two Buttons would crowd the text of a narrow pane, so they
* sit under it. A row opened in place gives its claim the panel's width: its lead, aside and
* Button are a line of their own over it.
* @param asideCells The width of the shared aside column, 0 where the list has none.
*/
function item(g, r, key, isCut, asideCells) {
	const { Box, Text } = g.els;
	const words = /* @__PURE__ */ h(Text, {
		dimColor: r.isDim || void 0,
		wrap: isCut ? "truncate-end" : void 0
	}, spans(g, r.isLiteral ? literal(r.text) : inline(r.text)));
	const isStacked = r.action !== void 0 && r.step !== void 0;
	const single = isStacked ? null : r.action ?? r.step;
	const under = isStacked ? /* @__PURE__ */ h(Box, {
		key: "under",
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.xs
	}, control(g, r.action), control(g, r.step)) : null;
	const column = asideCells > 0 ? /* @__PURE__ */ h(Box, {
		key: "count",
		flexShrink: 0,
		minWidth: asideCells,
		justifyContent: "flex-end"
	}, r.asideIn === "column" ? /* @__PURE__ */ h(Text, typeProps("caption", { tabular: true }), r.aside) : null) : null;
	if (r.isOpened) return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "column",
		rowGap: tokens.gui.space.xs
	}, rowOf(g, {
		key: `${key}:head`,
		justify: "space-between"
	}, /* @__PURE__ */ h(Box, {
		key: "who",
		flexDirection: "row",
		alignItems: "center",
		columnGap: across.sm
	}, leadOf(g, r), r.aside ? /* @__PURE__ */ h(Text, typeProps("caption", { tabular: true }), r.aside) : null), single ? control(g, single) : null), /* @__PURE__ */ h(Box, { key: "claim" }, words), under);
	const follows = r.asideIn === "text" ? /* @__PURE__ */ h(Box, {
		key: "aside",
		flexShrink: 0
	}, /* @__PURE__ */ h(Text, typeProps("caption"), r.aside)) : null;
	return rowOf(g, {
		key,
		align: "start"
	}, leadOf(g, r), /* @__PURE__ */ h(Box, {
		key: "body",
		flexDirection: "column",
		flexGrow: 1,
		flexShrink: 1,
		rowGap: tokens.gui.space.xs
	}, /* @__PURE__ */ h(Box, {
		key: "line",
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "flex-start",
		columnGap: across.sm
	}, /* @__PURE__ */ h(Box, {
		key: "text",
		flexShrink: 1,
		flexGrow: follows ? 0 : 1
	}, words), follows), under), column, single ? control(g, single) : null);
}
/** A group's heading: its label in the `section` role, its controls at the far edge. */
function heading(g, group, key) {
	const { Box, Text } = g.els;
	const section = typeProps("section", { isSized: can(g, "textSize") });
	const label = /* @__PURE__ */ h(Box, {
		key: "label",
		flexDirection: "row",
		alignItems: "center",
		columnGap: across.sm,
		flexShrink: 1
	}, /* @__PURE__ */ h(Text, {
		...section,
		...group.isActive ? roleProps("accent") : {},
		dimColor: void 0
	}, group.label), group.isDone ? meaning(g, "state:success", { alt: "Decided" }) : null);
	if (!group.action && !group.actions.length) return label;
	return rowOf(g, {
		key,
		justify: "space-between"
	}, label, /* @__PURE__ */ h(Box, {
		key: "actions",
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.xs,
		flexShrink: 0
	}, group.action ? control(g, group.action) : null, group.actions.map((a) => control(g, a))));
}
/**
* Groups of rows under a heading, a step apart. The host scrolls the pane, so there is no window,
* no rails, no flat rows and no key. A row's text wraps whole, or with `lines: 1` is one line the
* surface cuts at its edge, except an opened row's, which is shown whole in a panel with what
* belongs to it. A group of more than `maxItems` rows shows that many, then `Show N more`.
*/
function list$1(g, l) {
	const { Box } = g.els;
	const v = view$1(l, g.surface);
	const under = l.opened ?? {};
	const inset = across.inset + (l.opened ? tokens.gui.panel.x : 0);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.md
	}, v.groups.map((group, i) => /* @__PURE__ */ h(Box, {
		key: `g${i}`,
		flexDirection: "column",
		rowGap: tokens.gui.row.gap
	}, group.label ? /* @__PURE__ */ h(Box, {
		key: "head",
		paddingX: across.inset,
		flexDirection: "column"
	}, heading(g, group, `g${i}:head`)) : null, rows(g, { key: "rows" }, ...group.rows.map((r, n) => {
		const key = `g${i}:r${n}`;
		const row = item(g, r, key, l.lines === 1 && !r.isOpened, v.asideCells);
		const open = r.hit === void 0 ? void 0 : under[r.hit];
		return open ? /* @__PURE__ */ h(Box, {
			key: `${key}:panel`,
			paddingX: across.inset,
			flexDirection: "column"
		}, panel(g, { gap: "sm" }, row, open)) : /* @__PURE__ */ h(Box, {
			key: `${key}:row`,
			paddingX: inset,
			flexDirection: "column"
		}, row);
	})), group.more ? /* @__PURE__ */ h(Box, {
		key: "more",
		paddingX: inset,
		flexDirection: "row"
	}, rowOf(g, {}, control(g, group.more, `g${i}:more:${group.more.hit}`))) : null)));
}

// ../../lib/kits/notice/src/model.ts
/** The meaning a state is marked with, on a surface that draws icons. */
const MARKS = {
	success: "state:success",
	warning: "state:warning",
	error: "state:error",
	pending: "state:pending"
};
/** The colour role each status's words take: a pending one is quiet, as the dim words are. */
const TONES = {
	success: "success",
	warning: "warning",
	error: "error",
	pending: "dim",
	dim: "dim",
	text: "text"
};
function view(model, surface) {
	const isCells = holds(surface, "cells");
	const status = model.isEmpty ? "dim" : model.status ?? "warning";
	const tone = TONES[status];
	const said = isCells ? model.text : model.words ?? model.text;
	const text = typeof said === "string" ? [{
		text: said,
		role: tone
	}] : said.map((s) => ({
		...s,
		role: s.role ?? tone
	}));
	return {
		mark: !isCells && !model.isEmpty ? MARKS[status] : void 0,
		type: model.isEmpty || tone === "dim" ? "caption" : "body",
		rows: model.isEmpty ? "wrap" : (isCells ? model.isWrapped : !model.isCut) ? "wrap" : "cut",
		text
	};
}

// ../../lib/kits/notice/src/gui.tsx
/** The notice and the empty state on the graphical surfaces: the same model, in native controls. */
/**
* The words in their type role. One plain span is a single `Text` carrying its role's colour;
* spans of several styles are nested runs.
*/
function said(g, v, wrap) {
	const { Text } = g.els;
	const [only] = v.text;
	if (v.text.length === 1 && only && !only.bold && !only.italic && !only.underline) return /* @__PURE__ */ h(Text, {
		wrap,
		...typeProps(v.type, {
			isSized: can(g, "textSize"),
			isToned: false
		}),
		...roleProps(only.role)
	}, only.text);
	return spans(g, v.text, {
		type: v.type,
		wrap
	});
}
/**
* What a list says when there is nothing in it: a caption-role line at the inset, wrapped by the
* surface. `words` is the fuller sentence a graphical surface says in its place.
*/
function emptyState$1(g, e) {
	const { Box } = g.els;
	const v = view({
		...e,
		isEmpty: true
	}, g.surface);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: tokens.gui.across.inset
	}, said(g, v));
}

// ../../lib/kits/core/src/manifest.ts
/** A contract's model fields, checked against the model type: a field left out is an error. */
const modelFields = () => (keys) => keys;

// ../../lib/kits/frame/src/contract.ts
/** The control a close action is, as a drawn span's `hit`. */
const closeHit = (action) => `frame:${action}`;
/** The close action a `hit` names. */
const closeOf = (hit) => hit === "frame:close" || hit === "frame:discard" || hit === "frame:keep" ? hit.slice(6) : void 0;
/** Where the frame puts its body, and the rows it takes besides. */
const captionFrameLayout = {
	/** Cells and rows from the frame's corner to the body's. */
	x: 2,
	y: 2,
	/** Rows of the frame, its notice and its buttons. */
	chrome: 5,
	/** Cells of the top rule the caption may not take. */
	reserved: 5
};
const frameFields = modelFields()([
	"title",
	"caption",
	"end",
	"close",
	"body",
	"footer",
	"notice",
	"width",
	"hostTitle",
	"head",
	"actions"
]);

// ../../lib/kits/card/src/contract.ts
/**
* The question card's contract: its model, what each drawing is given, and the intents a list of
* choices sends back. No host imports.
*/
const cardFields = modelFields()([
	"heading",
	"choices",
	"note",
	"steps",
	"summaries",
	"closing",
	"width"
]);

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP$1 = " ".repeat(tokens.gutter);
/**
* One style for every label a person can act on. The keyboard's or the pointer's target is
* bold in the text colour; only what is chosen takes the accent, and is underlined when it is
* the target too.
*/
function controlStyle({ primary = false, highlighted = false, rest = "text", primaryRole = "accent" } = {}) {
	return {
		role: primary ? primaryRole : highlighted ? "text" : rest,
		bold: primary || highlighted || void 0,
		underline: primary && highlighted || void 0
	};
}
/**
* The rail's colour: the success colour beside a card that has its answer, else bright beside
* the keyboard's card and quiet beside every other.
*/
const railRole = (state) => state.answered ? "success" : state.active ? "text" : "dim";
/**
* The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
* before a row of its own, such as an input, to line it up with the card's.
*/
const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);
/** A line behind a card's rail, which still draws on a blank row. */
function rail(state, row) {
	const mark = span(tokens.glyph.rail, { role: railRole(state) });
	return {
		...row,
		spans: row.spans.length ? [
			mark,
			span(GAP$1),
			...row.spans
		] : [mark]
	};
}

// ../../lib/kits/buttons/src/terminal.ts
/** The button row as styled lines: the one drawing both terminals paint. */
/**
* Actions left to right, label first with the key dim after it, the suggested one in the
* accent; and dim keyboard-only hints, key first. One row drops what is neither suggested nor
* essential, last first, until it fits; with `wrap` nothing drops. One button is lit: the
* first that asks (`settle`).
*/
function buttonRow(keys, width, { wrap = false, lead = [], hover } = {}) {
	const chips = (settle([keys])[0] ?? []).map((key) => {
		const shortcut = shortcutOf(key);
		return {
			...key,
			shortcut,
			width: cellWidth(shortcut ? `${key.label} ${shortcut}` : key.label)
		};
	});
	const prefix = truncateSpans(lead, width);
	if (!wrap) {
		let remaining = spansWidth(prefix) + chips.reduce((n, chip) => n + chip.width + tokens.gutter, 0) - (prefix.length || !chips.length ? 0 : tokens.gutter);
		while (remaining > width) {
			const index = chips.map((chip) => !chip.essential && !chip.isLit).lastIndexOf(true);
			if (index < 0) break;
			remaining -= (chips.splice(index, 1)[0]?.width ?? 0) + tokens.gutter;
		}
	}
	const rows = [];
	let spans = [...prefix];
	for (const chip of chips) {
		if (wrap && spans.length && spansWidth(spans) + tokens.gutter + chip.width > width) {
			rows.push(line(spans));
			spans = [];
		}
		const start = spansWidth(spans) + (spans.length ? tokens.gutter : 0);
		if (start >= width) break;
		const isHovered = chip.hovered || hover?.y === rows.length && hover.x >= start && hover.x < start + chip.width;
		const entry = chip.hit === void 0 ? [span(`${chip.shortcut} ${chip.label}`, { role: "dim" })] : [span(chip.label, {
			...controlStyle({
				primary: chip.isLit,
				highlighted: isHovered,
				rest: chip.isQuiet ? "dim" : "text"
			}),
			hit: chip.hit
		}), ...chip.shortcut ? [span(" ", { hit: chip.hit }), span(chip.shortcut, {
			role: "dim",
			hit: chip.hit
		})] : []];
		if (spans.length) spans.push(span(" ".repeat(tokens.gutter)));
		spans.push(...truncateSpans(entry, width - start));
	}
	rows.push(line(spans));
	return rows;
}

// ../../lib/kits/frame/src/terminal.ts
/** The captioned frame as styled lines: the one drawing both terminals paint. */
const confirmButtons = (keep) => [{
	label: "Discard",
	hotkey: "enter",
	hit: closeHit("discard"),
	essential: true
}, {
	label: "Keep",
	hotkey: keep,
	hit: closeHit("keep"),
	essential: true
}];
/**
* Close, or the question it asks before the answers go: `undefined` when neither fits a top
* edge `width` cells wide, which keeps seven of them for its own rule and a caption's start.
*/
function closeSpans(width, { confirming, hover, question = "Discard answers?", keep = "esc" }) {
	const room = width - 7;
	if (!confirming) {
		const label = width < 40 ? tokens.glyph.times : `Close ${tokens.glyph.times}`;
		if (cellWidth(label) > room) return void 0;
		return [span(label, {
			...controlStyle({ highlighted: hover === "close" }),
			hit: closeHit("close")
		})];
	}
	const buttonsWidth = cellWidth(`Discard ${tokens.glyph.enter}`) + tokens.gutter + cellWidth(`Keep [${keep}]`);
	if (room < buttonsWidth) return void 0;
	const prompt = question;
	const lead = room >= buttonsWidth + tokens.gutter + cellWidth(prompt) ? [span(prompt, { role: "warning" })] : [];
	const buttons = confirmButtons(keep).map((b) => ({
		...b,
		hovered: hover !== void 0 && b.hit === closeHit(hover)
	}));
	return buttonRow(buttons, room, { lead })[0]?.spans;
}
/** Cells a title needs to be worth cutting into. */
const MIN_TITLE = 8;
const ruleSpan = (n) => span(tokens.glyph.rule.repeat(Math.max(0, n)), { role: "border" });
/** `words ── words`: the parts of a rule's caption, a short rule between two. */
const captionParts = (parts) => parts.filter((part) => part.length).flatMap((part, i) => i ? [
	span(" "),
	ruleSpan(tokens.gutter),
	span(" "),
	...part
] : part);
/** Cells of a caption rule its caption can take: the rest are its rules and its control. */
const captionRoom = ({ width, end = [], tail = 0 }) => Math.max(0, width - 3 - (end.length ? spansWidth(end) + 2 + (tail ? tail + 1 : 0) : 1));
/**
* `─ words ── words ──────── control ─`: a rule across `width` cells with a caption at its
* start and a control at its end. The one rule a frame's top and a section's heading are.
*/
function captionRule({ width, caption = [], end = [], tail = 0 }) {
	const label = truncateSpans(caption, captionRoom({
		width,
		end,
		tail
	}));
	const head = spansWidth(label) ? [
		ruleSpan(1),
		span(" "),
		...label,
		span(" ")
	] : [];
	const close = end.length ? [
		span(" "),
		...end,
		...tail ? [span(" "), ruleSpan(tail)] : []
	] : [];
	const spans = [
		...head,
		ruleSpan(width - spansWidth(head) - spansWidth(close)),
		...close
	];
	return line(truncateSpans(spans, width));
}
/**
* A frame's top edge, `width` cells of rule: the title or caption at its left, and Close or its
* question at its right, a cell of rule after it for the corner.
*/
function frameTop(f) {
	const { width } = f;
	const action = f.close && closeSpans(width, f.close) || void 0;
	const limit = Math.max(0, captionRoom({
		width,
		end: action,
		tail: 1
	}) - 1);
	const content = typeof f.caption === "function" ? f.caption(limit) : f.caption;
	return captionRule({
		width,
		caption: content || limit >= MIN_TITLE ? truncateSpans(content ?? [span(f.title, {
			role: "accent",
			bold: true
		})], limit) : [],
		end: action,
		tail: 1
	});
}

// ../../lib/kits/list/src/terminal.ts
/** The list as styled lines: the one drawing both terminals paint. */
const GAP = " ".repeat(tokens.gutter);
/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
const LIST_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;
/** Cells of the pointer column and the space after it. */
const POINTER = cellWidth(tokens.glyph.pointer) + 1;
/** Cells of a mark and the space after it. */
const MARK = cellWidth(tokens.glyph.single.off) + 1;
const allRows = (l) => (l.groups ?? []).flatMap((g) => g.rows);
/** Cells the list's keys take, with the space after: the widest key, or none where no row has one. */
const keyCells = (l) => {
	const widest = Math.max(0, ...allRows(l).map((r) => cellWidth(r.key ?? "")));
	return widest ? widest + 1 : 0;
};
/** Cells the mark takes: none where every row says `none`, so a menu of keys starts at its keys. */
const markCells = (l) => {
	const rows = allRows(l);
	return rows.length && rows.every((r) => r.mark === "none") ? 0 : MARK;
};
/** Cells before a row's text: the pointer column, the key, the mark and their spaces. */
const leadCells = (l) => POINTER + keyCells(l) + markCells(l);
/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;
/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";
/** Cells before a group's label and a row's pointer: the rail and its gap, or none without rails. */
const insetOf = (l) => l.rail === false ? 0 : LIST_INSET;
/** Cells a row's text has at `width`, beside the list's aside column. */
function listTextRoom(width, l = {}) {
	const aside = l.aside ?? 0;
	return Math.max(1, width - insetOf(l) - leadCells(l) - (aside > 0 ? aside + tokens.gutter : 0));
}
/** `label` cut from the left to `width` cells: whole folders first, then letters. */
function cutLeft(label, width) {
	if (cellWidth(label) <= width) return label;
	const parts = label.split("/");
	for (let i = 1; i < parts.length; i++) {
		const tail = `${"…"}/${parts.slice(i).join("/")}`;
		if (cellWidth(tail) <= width) return tail;
	}
	const chars = [...label];
	let out = "";
	for (let i = chars.length - 1; i >= 0; i--) {
		const next = (chars[i] ?? "") + out;
		if (cellWidth("…" + next) > width) break;
		out = next;
	}
	return width < 1 ? "" : "…" + out;
}
/** A flat row's group label: whole when it fits `width`, else its last part, cut from the left. */
function shortLabel(label, width) {
	if (cellWidth(label) <= width) return label;
	return cutLeft(label.split("/").pop() ?? label, width);
}
/** `left` and `right` on one row of `width` cells, `right` at its end. */
function spread(left, right, width) {
	const room = width - spansWidth(right) - (right.length ? tokens.gutter : 0);
	const cut = truncateSpans(left, Math.max(0, room));
	const pad = width - spansWidth(cut) - spansWidth(right);
	return right.length ? [
		...cut,
		span(" ".repeat(Math.max(1, pad))),
		...right
	] : cut;
}
const actionSpans = (actions) => buttonRow(actions.map((a) => ({
	...a,
	hotkey: "",
	isQuiet: true
})), Number.MAX_SAFE_INTEGER)[0]?.spans ?? [];
/** A line behind its group's rail, or as it is where the list draws none. */
const behind = (l, state, row) => l.rail === false ? row : rail(state, row);
/** A group's row: its label, cut from the left, and its controls at the right. */
function groupRow(g, l, width) {
	const room = width - insetOf(l);
	const all = g.actions?.length ? actionSpans(g.actions) : [];
	const actions = room - spansWidth(all) - tokens.gutter >= MIN_LABEL ? all : [];
	const labelRoom = room - (actions.length ? spansWidth(actions) + tokens.gutter : 0);
	const spans = spread([span(cutLeft(g.label, Math.max(1, labelRoom)), {
		role: g.active ? "accent" : "dim",
		...g.hit && actions.length ? { hit: g.hit } : {}
	})], actions, room);
	return behind(l, {
		active: g.active,
		answered: g.done
	}, line(spans, actions.length ? void 0 : g.hit));
}
/** Rows a row's text may take: one in a flat list, whose rows are for little room. */
const textRows = (l) => l.flat ? 1 : Math.max(1, l.lines ?? 1);
/**
* One row: the pointer column, the mark, the text and the aside at the right. The text is cut
* to the row, or with `rows` over one wrapped to as many, each later line hanging under the first.
*/
function itemRows(r, g, l, width, rows = textRows(l)) {
	const mark = r.mark ?? "open";
	const isLit = (r.focused || r.hovered) && !r.disabled;
	const hit = r.disabled ? void 0 : r.hit;
	const markHit = r.disabled ? void 0 : r.markHit;
	const words = r.disabled || mark === "dropped" ? {
		role: "dim",
		bold: isLit || void 0
	} : controlStyle({
		primary: mark === "chosen",
		highlighted: isLit
	});
	const glyph = mark === "chosen" ? span(tokens.glyph.single.on, {
		role: "accent",
		bold: true
	}) : mark === "dropped" ? span(tokens.glyph.dropped, { role: "dim" }) : span(tokens.glyph.single.off, { role: "dim" });
	const keys = keyCells(l);
	const key = keys ? [span((r.key ?? "").padEnd(keys - 1), { role: g.active && !r.disabled ? "accent" : "dim" }), span(" ")] : [];
	const hasMark = markCells(l) > 0;
	const pointer = r.focused ? [span(tokens.glyph.pointer, {
		role: "text",
		bold: true
	}), span(" ")] : [span(" ".repeat(cellWidth(tokens.glyph.pointer) + 1))];
	const room = width - insetOf(l);
	const aside = l.aside ?? 0;
	const textRoom = listTextRoom(width, l);
	let spans = (r.literal ? literal(r.text, words) : inline(r.text, words)).map((sp) => sp.role === "code" ? {
		...words,
		text: sp.text
	} : sp);
	if (l.flat) {
		const label = shortLabel(g.label, Math.max(4, Math.floor(textRoom / 3)));
		spans = [
			span(label, { role: "dim" }),
			span(SEPARATOR, { role: "dim" }),
			...spans
		];
	}
	const texts = rows > 1 ? block(spans, textRoom, { max: rows }).map((row) => row.spans) : [truncateSpans(spans, textRoom)];
	const lead = [
		...pointer,
		...key,
		...hasMark ? mark === "none" ? [span(" ".repeat(MARK))] : [glyph, span(" ")] : []
	];
	const right = aside > 0 ? [span(truncate(r.aside ?? "", aside).padStart(aside), { role: r.aside ? "dim" : void 0 })] : [];
	const state = {
		active: g.active,
		answered: g.done
	};
	return texts.map((text, i) => {
		if (i > 0) {
			const hang = span(" ".repeat(spansWidth(lead)));
			return behind(l, state, line([hang, ...hit ? hitSpans(text, hit) : text]));
		}
		const body = spread(text, right, room - spansWidth(lead));
		if (markHit === void 0) return behind(l, state, line([...lead, ...body], hit));
		return behind(l, state, line([...hitSpans(lead, markHit), ...hit ? hitSpans(body, hit) : body]));
	});
}
/**
* The group, row and line of each line of the list drawn whole at `width`: a group's row, each
* line of each of its rows, and with `space` a blank line before every group but the first.
*/
const entriesOf = (l, width) => l.groups.flatMap((g, group) => [
	...l.space && !l.flat && group > 0 ? [{
		group,
		isGap: true
	}] : [],
	...l.flat || !g.label ? [] : [{ group }],
	...g.rows.flatMap((r, row) => textRows(l) > 1 ? itemRows(r, g, l, width).map((_, part) => ({
		group,
		row,
		part
	})) : [{
		group,
		row,
		part: 0
	}])
]);
const isGroupRow = (e) => !!e && e.row === void 0 && !e.isGap;
const isFocused = (l, e) => e.row !== void 0 && Boolean(l.groups[e.group]?.rows[e.row]?.focused);
/** The first line of a row: what counts it, where its later lines do not. */
const isRow = (e) => e.row !== void 0 && !e.part;
const sameRow = (a, b) => !!a && !!b && a.row !== void 0 && a.group === b.group && a.row === b.row;
/** The window's rows, its more-row aside, and the furthest its top goes; none when all fits. */
function windowOf(l, entries) {
	const height = l.height ?? 1e400;
	if (entries.length <= height) return void 0;
	const rows = height >= 3 ? height - 1 : Math.max(1, height);
	const max = Math.max(0, entries.length - rows);
	let top = Math.max(0, Math.min(max, l.top ?? 0));
	while (entries[top]?.part || entries[top]?.isGap) top++;
	return {
		top,
		rows,
		max
	};
}
/**
* The top a window takes so the keyboard's row stays in it, every line of it, with `context`
* lines on either side: it moves only as far as that needs, and not at all while the row is well
* inside.
*/
function listFollow(l, width, context = 2) {
	const entries = entriesOf(l, width);
	const w = windowOf(l, entries);
	if (!w) return 0;
	const at = entries.findIndex((e) => isFocused(l, e));
	if (at < 0) return w.top;
	let end = at;
	while (end + 1 < entries.length && isFocused(l, entries[end + 1])) end++;
	const ctx = Math.min(context, Math.max(0, Math.floor((w.rows - (end - at + 1)) / 2)));
	let top = w.top;
	if (end > top + w.rows - 1 - ctx) top = end - (w.rows - 1 - ctx);
	if (at < top + ctx) top = at - ctx;
	return Math.max(0, Math.min(w.max, top));
}
/** Rows the list takes drawn whole at `width`: its lines, and with `space` those between groups. */
const listRows = (l, width) => entriesOf(l, width).length;
/** The furthest a window's `top` goes at `width`: 0 for a list drawn whole. */
function listTopMax(l, width) {
	return windowOf(l, entriesOf(l, width))?.max ?? 0;
}
/** How many rows a run of lines holds: a row counts where its first line is. */
const rowsIn = (entries) => entries.filter(isRow).length;
/**
* Groups of rows behind the card's rail: each group's row, then a row per item with its mark and
* its text, on one line or wrapped to `lines`. Taller than `height`, it is a window from `top`:
* the keyboard's group row stands in for its first row when it is above the window, a group row
* is never its last, a row its end cuts ends in `…` there, and its last row says how many rows
* are above it and below.
*/
function list(l, width) {
	const entries = entriesOf(l, width);
	/** Line `e.part` of its row, the row drawn in `rows` lines where the window has no more. */
	const draw = (e, rows) => {
		const g = l.groups[e.group];
		const r = e.row === void 0 ? void 0 : g.rows[e.row];
		if (e.isGap) return blank();
		return r ? itemRows(r, g, l, width, rows)[e.part ?? 0] ?? blank() : groupRow(g, l, width);
	};
	const w = windowOf(l, entries);
	if (!w) return entries.map((e) => draw(e));
	const shown = Array.from({ length: w.rows }, (_, i) => {
		const e = entries[w.top + i];
		return e && { e };
	});
	const at = entries.findIndex((e) => isFocused(l, e));
	const head = entries.findIndex((e) => isGroupRow(e) && e.group === entries[at]?.group);
	const stands = w.rows > 1 && head >= 0 && head < w.top && at > w.top && at < w.top + w.rows;
	let under = 0;
	if (stands) {
		const covered = entries[w.top];
		while (sameRow(shown[1 + under]?.e, covered)) under++;
		for (let i = 0; i < under; i++) shown[1 + i] = {
			e: {
				...covered,
				part: i
			},
			rows: under
		};
		shown[0] = { e: entries[head] };
	}
	const lastAt = shown.length - 1;
	if (w.rows > 1 && isGroupRow(shown[lastAt]?.e)) shown[lastAt] = void 0;
	const last = shown[lastAt]?.e;
	const cut = sameRow(last, entries[w.top + w.rows]) ? (last?.part ?? 0) + 1 : void 0;
	const lines = shown.map((x) => x ? draw(x.e, x.rows ?? (sameRow(x.e, last) ? cut : void 0)) : blank());
	if (w.rows >= (l.height ?? 0)) return lines;
	const up = rowsIn(entries.slice(0, w.top + (stands && !under ? 1 : 0)));
	const down = rowsIn(entries.slice(w.top + w.rows));
	const text = [up ? moreText(tokens.glyph.more.up, up) : "", down ? moreText(tokens.glyph.more.down, down) : ""].filter(Boolean).join(GAP);
	const more = line(text ? [span(" ".repeat(insetOf(l))), span(text, { role: "dim" })] : []);
	return [...lines, {
		...more,
		spans: truncateSpans(more.spans, width)
	}];
}

// ../../lib/kits/notice/src/terminal.ts
/** The notice and the empty state as styled lines: the one drawing both terminals paint. */
/**
* One line telling the person what just happened, in the role of its status, cut to the room
* with `…`. A terminal has no icon: the words take the status's colour, and a span with no role
* takes it too.
*/
function notice({ text, width, status = "warning", isWrapped = false }) {
	const role = status === "pending" ? "dim" : status;
	if (typeof text !== "string") {
		const styled = text.map((s) => ({
			...s,
			role: s.role ?? role
		}));
		return isWrapped ? wrapSpans(styled, width).map((row) => line(row)) : [line(truncateSpans(styled, width))];
	}
	return (isWrapped ? clamp$1(text, width) : clamp$1(text, width, {
		min: 1,
		max: 1
	})).map((row) => line([{
		text: row,
		role
	}]));
}
/**
* What a list says when there is nothing in it: dim words standing in for its rows, wrapped.
* Say what is missing and, if it helps, what makes rows appear.
*/
function emptyState({ text, width }) {
	return clamp$1(text, width).map((row) => line([{
		text: row,
		role: "dim"
	}]));
}

// src/claude/screen.ts
/**
* The menu pane's screen, from the kit: the terminal's lines for a width and a height, and the
* rows both surfaces share. A pure function of the menu and where the keyboard is, so the
* reducer in `register.tsx` and the draw agree on what the window shows.
*
* The heading is the frame's caption rule: the menu's name, what it acts on, and Close. A short
* pane has no room for the rest of a frame (blank rows, a bottom rule), and the host already
* draws the pane's box, so the rule is the whole of it.
*/
/** What a Button's `hit` is for the rest of a long list on a graphical surface. */
const MORE = "more";
/** The words under the rows while the pane has the keyboard. */
const HINT = "Enter picks · Esc closes";
/** Cells a row's note may take at its right; a longer one goes into the row's own text. */
const ASIDE_MAX = 24;
/** Lines a row's text may take: a long path wraps instead of losing its end. */
const TEXT_LINES = 3;
/** Rows the pane keeps besides the list: the caption rule and, with it, the hint. */
const CHROME = 2;
/** Cells the rows are set in by, under the caption's words. */
const INSET = captionFrameLayout.x;
/** The row's `hit`: the row's id, which is also the Button's address. */
const hitOf = (row) => row.id;
/** What the caption says beside the menu's name: the notes there are, else what the rows act on. */
const detailOf = (m) => m.kind === "notes" && m.rows?.length ? `${m.rows.length} ${m.rows.length === 1 ? "note" : "notes"}` : m.context;
/**
* The menu's rows as the list takes them. A note on a row (a host, a state, why it cannot run)
* is the dim aside when it is short, else part of the row's text, which wraps.
*/
function menuRows(rows, focus) {
	return rows.map((row, i) => {
		const note = row.unavailable ?? row.description;
		const isAside = note !== void 0 && cellWidth(note) <= ASIDE_MAX;
		return {
			text: note !== void 0 && !isAside ? `${row.label} ${note}` : row.label,
			literal: true,
			mark: "none",
			key: i < 9 ? String(i + 1) : void 0,
			aside: isAside ? note : void 0,
			focused: row.id === focus,
			disabled: row.action === void 0,
			hit: row.action ? hitOf(row) : void 0,
			action: row.action?.kind === "copy" ? "Copy" : "Open"
		};
	});
}
/** The menu's list, as a window `height` rows tall when it is given. */
function menuList(rows, look, height) {
	const items = menuRows(rows, look.focus);
	const aside = Math.max(0, ...items.map((r) => cellWidth(r.aside ?? "")));
	return {
		groups: [{
			label: "",
			active: look.held,
			rows: items
		}],
		rail: false,
		aside,
		lines: TEXT_LINES,
		height,
		top: look.top
	};
}
/**
* The rows a list has room for in a pane `height` rows tall. The hint takes the last row unless
* the pane holds the keyboard and has no row to spare: its keys are the ones a person guesses,
* and a short pane is better spent on the rows.
*/
function listRoom(rows, held, width, height) {
	const whole = listRows(menuList(rows, {
		held,
		top: 0
	}), width - INSET);
	const isHinted = !held || whole + 2 <= height;
	return Math.max(1, height - (isHinted ? 2 : 1));
}
/** The window's first line once the keyboard is on `look.focus`: it moves only to keep it in view. */
const followTop = (rows, look, width, height) => listFollow(menuList(rows, look, listRoom(rows, look.held, width, height)), width - INSET);
/** The furthest the window's top goes. */
const maxTop = (rows, held, width, height) => listTopMax(menuList(rows, {
	held,
	top: 0
}, listRoom(rows, held, width, height)), width - INSET);
/** The caption's words: the menu's name in the accent, what it acts on after a short rule. */
const caption = (m) => captionParts([[span(m.title, {
	role: "accent",
	bold: true
})], m.detail ? [span(m.detail, { role: "dim" })] : []]);
/**
* The pane as lines `width` cells wide and `height` rows tall, the hint's row included.
* @param m The open menu, or none.
*/
function drawMenu(m, look, width, height) {
	const inner = Math.max(1, width - INSET);
	if (!m) return {
		body: emptyState({
			text: "No menu open.",
			width: inner
		}),
		hint: []
	};
	const head = frameTop({
		width,
		title: m.title,
		caption: caption({
			title: m.title,
			detail: detailOf(m)
		}),
		close: {}
	});
	const hint = notice({
		text: HINT,
		width: inner,
		status: "dim"
	});
	if (m.error) return {
		head,
		body: emptyState({
			text: m.error,
			width: inner
		}),
		hint: []
	};
	if (m.rows === null) return {
		head,
		body: emptyState({
			text: m.kind === "notes" ? "Looking for notes…" : "Asking git…",
			width: inner
		}),
		hint: []
	};
	const room = listRoom(m.rows, look.held, width, height);
	const rows = menuList(m.rows, look, room);
	const top = Math.min(look.top, listTopMax(rows, inner));
	const isHinted = room === Math.max(1, height - 2);
	return {
		head,
		body: list({
			...rows,
			top
		}, inner),
		hint: isHinted ? hint : []
	};
}

// src/claude/gui.tsx
/** What the pane says in place of rows, as a graphical surface says it: whole sentences. */
const says = (m) => {
	if (m.error) return m.kind === "notes" ? "No notes yet. Plans and notes saved in this checkout's store show up here." : m.error;
	if (m.rows === null) return m.kind === "notes" ? "Looking for notes" : "Asking git";
};
/**
* The toolbar line under the host's own title, then the rows or what stands in for them.
* @param isAll Whether the rest of a long list is shown.
*/
function guiMenu(g, m, isAll) {
	if (!m) return emptyState$1(g, { text: "No menu open." });
	const detail = detailOf(m);
	const words = says(m);
	return captionFrame(g, {
		title: m.title,
		caption: detail ? [span(detail, { role: "dim" })] : void 0,
		hostTitle: m.title,
		body: words !== void 0 ? emptyState$1(g, { text: words }) : list$1(g, {
			groups: [{
				label: "",
				rows: menuRows(m.rows ?? [])
			}],
			more: {
				isAll,
				hit: MORE
			}
		})
	});
}

// ../../lib/kits/core/src/paint/host.tsx
/** Whether the event's surface draws with native controls (Desktop, VS Code, mobile), not cells. */
const isGui = (e) => e.surface !== "terminal";
/**
* The context of a `gui.tsx` function, from the event's resolved elements. Call it only where
* `isGui(e)` holds.
* @param els What `$.ui.resolve(e)` answered.
* @param events What a control does: `press` with its `hit`, `input` and `submit` with a field's text.
* The one reducer a mod wires for both surfaces. A bare function is `press` alone; events left out do nothing.
*/
const guiOf = (els, e, events = {}) => ({
	...ctxOf(e.surface, typeof events === "function" ? { press: events } : events),
	els
});
/**
* The one door through which a mod draws by surface itself: a terminal screen laid out to the
* cell beside a graphical one built from the kit's `gui.tsx`. Only the chosen drawing runs.
*/
function forSurface(e, drawings) {
	if (!isGui(e)) return drawings.tui();
	return (drawings[e.surface] ?? drawings.gui)();
}
/**
* The arguments of `$.ui.open` for a pane: yours, with the house style's (transparent, no fill)
* added. A pane is always opened through this.
* @param extra `id`, `title`, `focus`, `rows` and the rest of what the pane takes.
*/
const paneOptions = (extra) => ({
	...extra,
	backgroundColor: tokens.pane.backgroundColor
});

// ../../lib/kits/core/src/paint/claude.tsx
const COLOR = {
	text: void 0,
	dim: void 0,
	accent: "claude",
	success: "success",
	warning: "warning",
	error: "error",
	code: "permission",
	link: void 0,
	border: void 0
};
const isDim = (role) => role === "dim" || role === "border";
/**
* The engine inverts a Button under the pointer and offers no way to turn that off. Inverting
* swaps a cell's two colours, so while a control is hovered each run is given them the other
* way round: its own colour as the background and this fill as the text. Swapped back by the
* engine, the words keep their colour and the row sits on the fill: the theme's second
* background, the well a user message is drawn in.
*/
const HOVER_FILL = "userMessageBackground";
/** Consecutive lines of one row-wide control, or one line of none. */
const groups = (lines) => {
	const out = [];
	for (const l of lines) {
		const last = out.at(-1);
		if (last && l.hit !== void 0 && last.hit === l.hit && !l.slot) last.lines.push(l);
		else out.push({
			hit: l.slot ? void 0 : l.hit,
			lines: [l]
		});
	}
	return out;
};
/** The spans of a row cut where the control they belong to changes. */
const runsOf = (spans) => {
	const out = [];
	for (const s of spans) {
		const last = out.at(-1);
		if (last && last.hit === s.hit) last.spans.push(s);
		else out.push({
			hit: s.hit,
			spans: [s]
		});
	}
	return out;
};
function paintLines(k, lines, { press: pressed, ctx, width = 0, input, indent: setIn, autoFocus } = {}) {
	const press = pressed ?? ctx?.press;
	const { Box, Text, Button, Markdown, Image, Link } = k;
	const run = (s, key, isControl) => /* @__PURE__ */ h(Text, {
		key,
		color: s.role ? COLOR[s.role] : void 0,
		dimColor: isDim(s.role) || void 0,
		bold: s.bold || void 0,
		italic: s.italic || void 0,
		underline: s.underline || void 0,
		inverse: s.inverse || void 0,
		hover: isControl ? {
			color: HOVER_FILL,
			backgroundColor: isDim(s.role) ? "inactive" : (s.role && COLOR[s.role]) ?? "text",
			dimColor: false
		} : void 0
	}, s.text);
	const seen = /* @__PURE__ */ new Map();
	const address = (hit) => {
		const n = seen.get(hit) ?? 0;
		seen.set(hit, n + 1);
		return n ? `${hit}#${n}` : hit;
	};
	const control = (hit, label, body) => {
		const key = address(hit);
		return /* @__PURE__ */ h(Box, { key: `hover-${key}` }, /* @__PURE__ */ h(Button, {
			key,
			plain: true,
			autoFocus: key === autoFocus ? true : void 0,
			label,
			onPress: () => press?.(hit)
		}, body));
	};
	const wordsOf = (spans) => spans.map((s) => s.text).join("");
	const block = (rows, at, isControl = false) => /* @__PURE__ */ h(Text, { key: `rows${at}` }, rows.flatMap((l, r) => {
		const drawn = l.spans.length ? cellWidth(wordsOf(l.spans)) : 1;
		const room = isControl ? width - drawn : 0;
		return [
			...r ? ["\n"] : [],
			...l.spans.length ? [] : [" "],
			...l.spans.map((s, i) => run(s, `${at}-${r}-${i}`, isControl)),
			...room > 0 ? [run({ text: " ".repeat(room) }, `${at}-${r}-pad`, isControl)] : []
		];
	}));
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingLeft: setIn || void 0
	}, groups(lines).map((g, at) => {
		const [first] = g.lines;
		if (first?.slot?.kind === "input") {
			const blankLead = first.slot.lead.findIndex((s) => s.text.trim() !== "");
			const indent = first.slot.lead.slice(0, blankLead < 0 ? void 0 : blankLead).reduce((n, s) => n + cellWidth(s.text), 0);
			return /* @__PURE__ */ h(Box, {
				key: `field${at}`,
				flexDirection: "column",
				paddingLeft: indent
			}, input);
		}
		if (first?.slot?.kind === "image") {
			const { source, columns, rows, alt } = first.slot;
			return Image ? /* @__PURE__ */ h(Image, {
				key: `image${at}`,
				source,
				columns,
				rows,
				alt
			}) : block(g.lines, at);
		}
		if (first?.slot?.kind === "link") {
			const { href } = first.slot;
			return /* @__PURE__ */ h(Text, {
				key: `link${at}`,
				dimColor: true,
				wrap: "wrap"
			}, g.lines.flatMap((l, r) => [...r ? ["\n"] : [], Link ? /* @__PURE__ */ h(Link, {
				key: `${r}`,
				href,
				label: wordsOf(l.spans)
			}) : wordsOf(l.spans)]));
		}
		if (first?.slot?.kind === "markdown") return /* @__PURE__ */ h(Box, {
			key: `slot${at}`,
			paddingLeft: first.slot.indent,
			width: first.slot.indent + first.slot.width
		}, /* @__PURE__ */ h(Markdown, {
			text: first.slot.text,
			dimColor: first.slot.isDim || void 0
		}));
		if (g.hit !== void 0 && press) return control(g.hit, g.lines.map((l) => wordsOf(l.spans)).join(" "), block(g.lines, at, true));
		const parts = first ? runsOf(first.spans) : [];
		if (!press || parts.every((part) => part.hit === void 0)) return block(g.lines, at);
		return /* @__PURE__ */ h(Box, {
			key: `row${at}`,
			flexDirection: "row"
		}, parts.map((part, p) => part.hit === void 0 ? /* @__PURE__ */ h(Text, { key: `gap${at}-${p}` }, part.spans.map((s, i) => run(s, `${at}-${p}-${i}`, false))) : control(part.hit, wordsOf(part.spans), /* @__PURE__ */ h(Text, { key: `part${at}-${p}` }, part.spans.map((s, i) => run(s, `${at}-${p}-${i}`, true))))));
	}));
}
/** Where the engine's focus ring is kept, and the stops either side that an arrow reaches. */
const RING = {
	up: "kit-ring-up",
	park: "kit-ring",
	down: "kit-ring-down"
};
/** The address of a button that carries one key and draws nothing. */
const keyAddress = (key) => `kit-key-${key}`;
/**
* The keyboard's half of a site where the kit draws its own focus: nothing here is drawn. Put
* it first in the site: the engine keeps its ring by a button's place among the site's buttons,
* so one drawn after rows that come and go ends up on a row. The
* engine's ring rests on the middle button, so Enter acts on what the kit drew focus on; the
* two round it are where an arrow or Tab would take the ring, which the mod's `ui.focus` hook
* turns into a move (see `ringMove`). The rest carry the keys the site binds: a plain Button
* that shows its own hotkey prints it before its label, so the visible rows cannot carry them.
* @param enter What Enter does: the action of the focused control.
* @param keys One lowercase letter or digit each.
*/
function ring(k, enter, keys = []) {
	const { Box, Button } = k;
	return /* @__PURE__ */ h(Box, {
		width: 0,
		height: 0,
		overflow: "hidden"
	}, /* @__PURE__ */ h(Button, {
		key: RING.up,
		plain: true,
		label: "previous",
		onPress: () => void 0
	}), /* @__PURE__ */ h(Button, {
		key: RING.park,
		plain: true,
		autoFocus: true,
		label: "act",
		onPress: enter
	}), /* @__PURE__ */ h(Button, {
		key: RING.down,
		plain: true,
		label: "next",
		onPress: () => void 0
	}), keys.map(({ key, press }) => /* @__PURE__ */ h(Button, {
		key: keyAddress(key),
		plain: true,
		hotkey: key,
		label: key,
		onPress: press
	})));
}
/** Parts of one site under each other: painted lines, the ring, the hint for the keyboard. */
function stack(k, ...parts) {
	const { Box } = k;
	return /* @__PURE__ */ h(Box, { flexDirection: "column" }, parts.filter(Boolean));
}
/**
* What the ring trying to move onto `element` means for the kit's own focus, for a mod's
* `ui.focus` hook: a step up or down, a control the person clicked, or nothing (the ring was
* headed for the parked button, or for something that is not the kit's). Whenever this answers,
* the hook applies it to its state and lands the ring back: `next({ ...e, element: RING.park })`.
* @param isControl Whether `element` is one of the site's own controls: a painted `hit`.
*/
function ringMove(element, isControl) {
	if (!element || element === RING.park) return void 0;
	if (element === RING.up) return { by: -1 };
	if (element === RING.down) return { by: 1 };
	if (element.startsWith(keyAddress(""))) return { by: 0 };
	const hit = element.replace(/#\d+$/, "");
	return isControl(hit) ? { hit } : void 0;
}
/**
* One line saying how to move the keyboard between the prompt and the site that draws this,
* for wherever the kit's keys live. A click on a pane or the band gives it the keyboard too,
* so the line is itself somewhere to click.
* @param held Whether the site holds the keyboard, as far as the mod knows. The engine says
* when the ring moves in a site (`ui.focus`), when the person types in the prompt
* (`prompt.edit`, `prompt.change`) and when a transcript row is pressed (`ui.press` on a
* `Placed`), but not when Escape hands the keyboard back, so both ways stay on show and
* `held` only lights one.
* @param canLeave Whether Escape goes back to the prompt: true in the band, false in a pane
* that Escape closes, which then says nothing while it holds the keyboard.
*/
function keysHint(k, held, canLeave = false, indent = 0) {
	const { Box, Text } = k;
	if (held && !canLeave) return null;
	const way = (label, key, isLit) => /* @__PURE__ */ h(Text, { key }, /* @__PURE__ */ h(Text, {
		bold: isLit || void 0,
		dimColor: !isLit || void 0
	}, `${label} `), /* @__PURE__ */ h(Text, {
		backgroundColor: isLit ? HOVER_FILL : void 0,
		bold: isLit || void 0,
		dimColor: !isLit || void 0
	}, isLit ? ` ${key} ` : key));
	return /* @__PURE__ */ h(Box, {
		columnGap: 3,
		paddingLeft: indent
	}, way("Keys here", "ctrl+x tab", !held), canLeave ? way("Back to prompt", "esc", held) : null);
}

// src/claude/menus.ts
const FOLDER_APPS = [
	"code",
	"zed",
	"smerge",
	"files",
	"terminal"
];
/** The desktop's editor, `fireproof.desktop.editor`; the other keeps its row, not the keys. */
const preferredEditor = (value) => value === "vscode" ? "code" : "zed";
/** `zed` ships as `zed` from the cask and `zeditor` from nixpkgs. */
const EDITOR_COMMANDS = {
	code: ["code"],
	zed: ["zed", "zeditor"]
};
/** The editor binaries a note falls back to, the preferred editor's first. */
const editorCandidates = (editor) => [...EDITOR_COMMANDS[editor], ...EDITOR_COMMANDS[editor === "code" ? "zed" : "code"]];
const SHORT_SHA = 7;
const FORGES = {
	"github.com": "github",
	"gitlab.com": "gitlab",
	"codeberg.org": "codeberg"
};
const parseStatus = (output) => {
	let branch = null;
	let oid = "";
	let upstream = false;
	for (const line of output.split("\n")) if (line.startsWith("# branch.head ")) {
		const head = line.slice(14);
		branch = head === "(detached)" ? null : head;
	} else if (line.startsWith("# branch.oid ")) oid = line.slice(13);
	else if (line.startsWith("# branch.upstream ")) upstream = true;
	return {
		branch,
		oid,
		upstream
	};
};
/** A `gh pr view --json` answer as a Pr; undefined when it does not parse. */
const parsePr = (stdout) => {
	try {
		const data = JSON.parse(stdout);
		const state = data.isDraft ? "draft" : data.state === "MERGED" ? "merged" : data.state === "CLOSED" ? "closed" : "open";
		return {
			url: data.url,
			number: data.number,
			state
		};
	} catch {
		return;
	}
};
const parseRemote = (name, raw) => {
	const trimmed = raw.trim().replace(/\/+$/, "").replace(/\.git$/, "");
	let host;
	let path;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		let url;
		try {
			url = new URL(trimmed);
		} catch {
			return;
		}
		host = url.hostname;
		path = url.pathname;
	} else {
		const match = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed);
		if (!match?.[1] || !match[2]) return void 0;
		host = match[1];
		path = match[2];
	}
	host = host.toLowerCase();
	const forge = FORGES[host];
	if (!forge) return void 0;
	const segments = path.split("/").filter(Boolean);
	if (segments.length < 2) return void 0;
	const repo = segments[segments.length - 1] ?? "";
	const owner = segments.slice(0, -1).join("/");
	return {
		name,
		forge,
		host,
		owner,
		repo,
		web: `https://${host}/${owner}/${repo}`
	};
};
/** `config` holds `remote.<name>.url <url>` lines, as `git config --get-regexp` prints them. */
const chooseRemote = (config, branchRemote) => {
	const remotes = /* @__PURE__ */ new Map();
	for (const line of config.split("\n")) {
		const match = /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim());
		if (!match?.[1] || !match[2] || remotes.has(match[1])) continue;
		const remote = parseRemote(match[1], match[2]);
		if (remote) remotes.set(remote.name, remote);
	}
	const supported = [...remotes.values()];
	return (branchRemote && branchRemote !== "." ? remotes.get(branchRemote) : void 0) ?? remotes.get("origin") ?? (supported.length === 1 ? supported[0] : void 0);
};
/** A branch name as URL path segments, so a `#` or a space still links. */
const segment = (text) => text.split("/").map(encodeURIComponent).join("/");
const branchUrl = (remote, branch) => {
	const leaf = segment(branch);
	switch (remote.forge) {
		case "github": return `${remote.web}/tree/${leaf}`;
		case "gitlab": return `${remote.web}/-/tree/${leaf}`;
		case "codeberg": return `${remote.web}/src/branch/${leaf}`;
	}
};
const commitUrl = (remote, sha) => remote.forge === "gitlab" ? `${remote.web}/-/commit/${sha}` : `${remote.web}/commit/${sha}`;
const compareUrl = (remote, base, branch) => `${remote.web}/compare/${segment(base)}...${segment(branch)}?expand=1`;
const gitMenu = ({ status, remote, base, pr }) => {
	const { branch } = status;
	const found = typeof pr === "object" ? pr : null;
	const noRemote = "no supported remote";
	const rows = [remote ? {
		id: "repo",
		label: "Open repository",
		description: remote.host,
		action: {
			kind: "url",
			url: remote.web
		}
	} : {
		id: "repo",
		label: "Open repository",
		unavailable: noRemote
	}];
	if (branch) rows.push({
		id: "branch",
		label: "Open branch",
		unavailable: remote ? void 0 : noRemote,
		action: remote ? {
			kind: "url",
			url: branchUrl(remote, branch)
		} : void 0
	});
	else {
		const sha = status.oid || "HEAD";
		rows.push({
			id: "commit",
			label: `Open commit ${sha.slice(0, SHORT_SHA)}`,
			unavailable: remote ? void 0 : noRemote,
			action: remote ? {
				kind: "url",
				url: commitUrl(remote, sha)
			} : void 0
		});
	}
	if (found) rows.push({
		id: "pr",
		label: `Open pull request #${found.number}`,
		description: found.state,
		action: {
			kind: "url",
			url: found.url
		}
	});
	const create = found && (found.state === "merged" || found.state === "closed") ? "Create new pull request" : "Create pull request";
	const blocked = !remote ? noRemote : remote.forge !== "github" ? "GitHub only" : !branch ? "detached HEAD" : found && (found.state === "open" || found.state === "draft") ? `PR #${found.number} is open` : !status.upstream ? "push the branch first" : pr === "no-gh" ? "gh not installed" : pr === "unknown" ? "gh could not say" : void 0;
	rows.push(blocked || !remote || !branch ? {
		id: "create",
		label: create,
		unavailable: blocked
	} : {
		id: "create",
		label: create,
		description: `into ${base}`,
		action: {
			kind: "url",
			url: compareUrl(remote, base, branch)
		}
	});
	rows.push(branch ? {
		id: "copy",
		label: "Copy branch name",
		action: {
			kind: "copy",
			text: branch,
			what: "branch name"
		}
	} : {
		id: "copy",
		label: "Copy commit SHA",
		action: {
			kind: "copy",
			text: status.oid,
			what: "commit SHA"
		}
	});
	if (found) rows.push({
		id: "copy-pr",
		label: "Copy PR URL",
		action: {
			kind: "copy",
			text: found.url,
			what: "pull request URL"
		}
	});
	const preferred = found ? "pr" : !remote ? "repo" : branch ? "branch" : "commit";
	return {
		kind: "git",
		title: "Git",
		context: remote ? `${remote.owner}/${remote.repo}` : void 0,
		rows,
		preferred
	};
};
const appLabel = (app, isMac) => {
	switch (app) {
		case "code": return "VS Code";
		case "zed": return "Zed";
		case "smerge": return "Sublime Merge";
		case "files": return isMac ? "Finder" : "Files";
		case "terminal": return "Terminal";
	}
};
/** The checkout in the desktop's apps; one missing keeps its row, so the order never moves. */
const folderMenu = (cwd, launchers, isMac, editor) => ({
	kind: "folder",
	title: "Open folder",
	rows: [
		...FOLDER_APPS.map((app) => {
			const argv = launchers[app];
			return argv ? {
				id: app,
				label: appLabel(app, isMac),
				action: {
					kind: "launch",
					argv,
					...app === "terminal" ? { cwd } : {}
				}
			} : {
				id: app,
				label: appLabel(app, isMac),
				unavailable: app === "terminal" ? "no terminal launcher found" : "not installed"
			};
		}),
		{
			id: "copy",
			label: "Copy path",
			action: {
				kind: "copy",
				text: cwd,
				what: "path"
			}
		},
		{
			id: "notes",
			label: "Notes",
			action: {
				kind: "menu",
				menu: "notes"
			}
		}
	],
	preferred: launchers[editor] ? editor : void 0
});

// src/claude/notes.ts
const OPENER = "agent-note-open";
const STORE = ".agents/store";
/** Whether the listing goes into a store directory: not superseded copies, artefacts or dot dirs. */
const holdsNotes = (dir) => dir !== "history" && dir !== "files" && !dir.startsWith(".");
const age = (ms) => {
	const minutes = Math.floor(Math.max(0, ms) / 6e4);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};
/** The notes as rows, newest first; a note nothing can open names its path. */
const notesMenu = ({ notes, opener, now }) => {
	if (notes.length === 0) return {
		kind: "notes",
		title: "Notes",
		rows: [],
		error: "No notes yet."
	};
	const rows = [...notes].sort((a, b) => b.at - a.at).map((note) => ({
		id: note.path,
		label: note.name,
		description: age(now - note.at),
		...opener ? { action: {
			kind: "launch",
			argv: [...opener, note.path]
		} } : { unavailable: `no editor: ${note.path}` }
	}));
	return {
		kind: "notes",
		title: "Notes",
		rows,
		preferred: rows[0]?.id
	};
};

// src/claude.tsx
const PANE = "git-menu";
const TITLES = {
	git: "Git",
	folder: "Open folder",
	notes: "Notes"
};
/** Rows a turn of the wheel moves the window by. */
const WHEEL_ROWS = 3;
const GIT_TIMEOUT_MS = 3e3;
const GH_TIMEOUT_MS = 5e3;
const DETACH = [
	"sh",
	"-c",
	"exec >/dev/null 2>&1 </dev/null; if command -v setsid >/dev/null; then exec setsid -f \"$@\"; fi; \"$@\" &",
	"sh"
];
const menu = atom({
	plugin: "git-menu",
	key: "menu"
}, null);
/** Whether the rest of a long list is shown: a graphical surface lists the first few. */
const showAll = atom({
	plugin: "git-menu",
	key: "showAll"
}, false);
/** The row the keyboard is on in a terminal, which draws its own focus. */
const focus = atom({
	plugin: "git-menu",
	key: "focus"
}, null);
/** The terminal list's first line. */
const top = atom({
	plugin: "git-menu",
	key: "top"
}, 0);
/** Whether the pane has the keyboard, as far as the mod knows. */
const held = atom({
	plugin: "git-menu",
	key: "held"
}, false);
/** What the terminal drew last: the room the keys move the window in, and the rows that are controls. */
let drawn = {
	width: 60,
	height: 10
};
let hits = /* @__PURE__ */ new Set();
let paneSurface;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
/** The row the keyboard is on: the one it was moved to, else the menu's own pick, else the first. */
const focusOf = (m, at) => m?.rows?.find((r) => r.id === at)?.id ?? m?.preferred ?? m?.rows?.[0]?.id;
let isMacAnswer;
const runProcess = async ($, argv, timeoutMs = GIT_TIMEOUT_MS, cwd) => {
	try {
		return await $.process.run(argv, {
			timeoutMs,
			...cwd ? { cwd } : {}
		});
	} catch {
		return;
	}
};
/** One read-only git command; anything it refuses is an empty answer. */
const git = async ($, cwd, args) => {
	const r = await runProcess($, [
		"git",
		"--no-optional-locks",
		"-C",
		cwd,
		...args
	]);
	return r?.exitCode === 0 ? r.stdout.trim() : "";
};
const isMac = ($) => isMacAnswer ??= runProcess($, ["uname", "-s"]).then((r) => r?.stdout.trim() === "Darwin");
async function lookupPr($, cwd, status) {
	if (!status.branch || !status.upstream) return null;
	let r;
	try {
		r = await $.process.run([
			"gh",
			"pr",
			"view",
			"--json",
			"url,number,state,isDraft"
		], {
			cwd,
			timeoutMs: GH_TIMEOUT_MS
		});
	} catch {
		return "no-gh";
	}
	if (r.exitCode !== 0) return /no pull requests found|no git remotes found/.test(r.stderr) ? null : "unknown";
	return parsePr(r.stdout) ?? "unknown";
}
/** The remote's default branch, then the local main/master refs, then `main`. */
async function defaultBranch($, cwd, remote) {
	const head = await git($, cwd, [
		"symbolic-ref",
		"--quiet",
		"--short",
		`refs/remotes/${remote}/HEAD`
	]);
	if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
	for (const candidate of ["main", "master"]) {
		const ref = `refs/remotes/${remote}/${candidate}`;
		if (await git($, cwd, [
			"rev-parse",
			"--verify",
			"--quiet",
			ref
		])) return candidate;
	}
	return "main";
}
async function buildGit($, cwd) {
	const out = await git($, cwd, [
		"status",
		"--porcelain=v2",
		"--branch",
		"--untracked-files=no"
	]);
	if (!out) return {
		kind: "git",
		title: TITLES.git,
		rows: [],
		error: "Not a git repository."
	};
	const status = parseStatus(out);
	const branch = status.branch;
	const [config, branchRemote, mergeBase, pr] = await Promise.all([
		git($, cwd, [
			"config",
			"--get-regexp",
			"^remote\\..*\\.url$"
		]),
		branch ? git($, cwd, [
			"config",
			"--get",
			`branch.${branch}.remote`
		]) : "",
		branch ? git($, cwd, [
			"config",
			"--get",
			`branch.${branch}.gh-merge-base`
		]) : "",
		lookupPr($, cwd, status)
	]);
	const remote = chooseRemote(config, branchRemote);
	const base = mergeBase || (remote ? await defaultBranch($, cwd, remote.name) : "main");
	return gitMenu({
		status,
		remote,
		base,
		pr
	});
}
/** Open a fresh shell, using the desktop's terminal selection rather than the host terminal. */
async function terminalLauncher($, cwd, mac) {
	const override = (await $.env.get("GIT_MENU_TERMINAL"))?.trim();
	if (override && (override.startsWith("/") || !override.includes("/"))) {
		const found = await locate($, override);
		if (found?.startsWith("/")) return [found];
	}
	if (mac) return [
		"open",
		"-a",
		"Terminal",
		cwd
	];
	const xdg = await locate($, "xdg-terminal-exec");
	if (xdg && (await runProcess($, [xdg, "--print-id"]))?.exitCode === 0) return [xdg, `--dir=${cwd}`];
	const alternative = await locate($, "x-terminal-emulator");
	return alternative ? [alternative] : void 0;
}
async function buildFolder($, cwd) {
	const mac = await isMac($);
	const editor = preferredEditor(await $.env.get("FIREPROOF_EDITOR"));
	const launchers = {};
	const terminal = terminalLauncher($, cwd, mac);
	if (mac) {
		const bundle = async (app, name) => {
			if (await $.fs.exists(`/Applications/${name}.app`)) launchers[app] = [
				"open",
				"-a",
				name,
				cwd
			];
		};
		await Promise.all([
			bundle("code", "Visual Studio Code"),
			bundle("zed", "Zed"),
			bundle("smerge", "Sublime Merge")
		]);
		launchers.files = ["open", cwd];
	} else {
		const probe = await runProcess($, [
			"sh",
			"-c",
			"for c; do command -v \"$c\" >/dev/null && echo \"$c\"; done",
			"sh",
			...editorCandidates(editor),
			"smerge",
			"nautilus",
			"xdg-open"
		]);
		const found = new Set((probe?.stdout ?? "").split("\n").filter(Boolean));
		if (found.has("code")) launchers.code = ["code", cwd];
		const zed = ["zed", "zeditor"].find((name) => found.has(name));
		if (zed) launchers.zed = [zed, cwd];
		if (found.has("smerge")) launchers.smerge = ["smerge", cwd];
		if (found.has("nautilus")) launchers.files = ["nautilus", cwd];
		else if (found.has("xdg-open")) launchers.files = ["xdg-open", cwd];
	}
	const launcher = await terminal;
	if (launcher) launchers.terminal = launcher;
	return folderMenu(cwd, launchers, mac, editor);
}
/** A command by absolute path: on PATH, then the profiles a trimmed PATH may miss, then `also`. */
async function locate($, name, also = []) {
	const [home, user] = await Promise.all([$.env.get("HOME"), $.env.get("USER")]);
	const probe = await runProcess($, [
		"sh",
		"-c",
		"for c; do command -v \"$c\" && exit 0; done; exit 1",
		"sh",
		name,
		...user ? [`/etc/profiles/per-user/${user}/bin/${name}`] : [],
		`${home ?? ""}/.nix-profile/bin/${name}`,
		...also
	]);
	return probe?.exitCode === 0 ? probe.stdout.trim().split("\n")[0] : void 0;
}
/** The Markdown under `dir`, a store directory by its real path; `below` is the path so far. */
async function notesUnder($, dir, below = "") {
	const entries = await $.fs.list(dir).catch(() => []);
	return (await Promise.all(entries.map(async (entry) => {
		const name = `${below}${entry.name}`;
		if (entry.kind === "dir") return holdsNotes(entry.name) ? notesUnder($, `${dir}/${entry.name}`, `${name}/`) : [];
		return entry.kind === "file" && entry.name.endsWith(".md") ? [{
			path: `${dir}/${entry.name}`,
			name,
			at: entry.mtimeMs
		}] : [];
	}))).flat();
}
async function buildNotes($, cwd) {
	const editor = preferredEditor(await $.env.get("FIREPROOF_EDITOR"));
	const [root, found, now] = await Promise.all([
		git($, cwd, ["rev-parse", "--show-toplevel"]),
		locate($, OPENER, editorCandidates(editor)),
		$.clock.now()
	]);
	const store = await $.fs.stat(`${root || cwd}/${STORE}`, { resolve: true }).catch(() => void 0);
	const notes = store?.realPath ? await notesUnder($, store.realPath) : [];
	const opener = found ? found.endsWith("/code") ? [found, "--reuse-window"] : [found] : void 0;
	return notesMenu({
		notes,
		opener,
		now
	});
}
const isOpen = async ($) => (await $.ui.panes()).some((p) => p.id === PANE);
async function reset($) {
	await update($, menu, () => null);
	await update($, showAll, () => false);
	await update($, focus, () => null);
	await update($, top, () => 0);
	await update($, held, () => false);
}
async function close($) {
	await reset($);
	await $.ui.close({ id: PANE });
}
/** Puts the keyboard on a row and keeps it in the window. */
async function focusRow($, id) {
	const m = await read($, menu);
	if (!m?.rows) return;
	await update($, focus, () => id);
	const look = {
		focus: id,
		held: true,
		top: await read($, top)
	};
	const next = followTop(m.rows, look, drawn.width, drawn.height);
	await update($, top, () => next);
}
async function moveFocus($, by) {
	const m = await read($, menu);
	const rows = m?.rows ?? [];
	const current = focusOf(m, await read($, focus));
	const at = rows.findIndex((r) => r.id === current);
	const to = rows[clamp(at + by, 0, rows.length - 1)];
	if (to) await focusRow($, to.id);
}
/**
* Opens a menu, or closes it when it is already up. The pane opens before git
* answers: one opened after the command hook returned counts as unasked and
* stays hidden on narrower terminals.
*/
async function show($, kind) {
	if ((await read($, menu))?.kind === kind && await isOpen($)) return close($);
	const cwd = await $.session.cwd();
	const title = TITLES[kind];
	await update($, menu, () => ({
		kind,
		title,
		rows: null
	}));
	await update($, showAll, () => false);
	await update($, focus, () => null);
	await update($, top, () => 0);
	await update($, held, () => true);
	const opened = await $.ui.open(paneOptions({
		id: PANE,
		title,
		focus: true,
		closeOnEscape: true,
		rows: 10
	}));
	if (!opened.isPlaced) $.ui.toast(`The ${title} menu can't show yet: ${opened.reason}`);
	const built = kind === "git" ? await buildGit($, cwd) : kind === "folder" ? await buildFolder($, cwd) : await buildNotes($, cwd);
	await update($, menu, (m) => m?.kind === kind && m.rows === null ? built : m);
	const shown = await read($, menu);
	const first = focusOf(shown, null);
	if (shown?.kind === kind && shown.rows !== null && first) await focusRow($, first);
}
async function press($, row, surface) {
	if (!row.action) {
		$.ui.toast(`${row.label}: ${row.unavailable ?? "not available"}`);
		return;
	}
	const action = row.action;
	if (action.kind === "menu") return show($, action.menu);
	if (action.kind === "copy") {
		const r = await $.ui.copy({
			text: action.text,
			surface
		});
		$.ui.toast(r.isCopied ? `Copied the ${action.what}` : `Couldn't copy: ${r.reason}`);
	} else {
		const argv = action.kind === "url" ? [await isMac($) ? "open" : "xdg-open", action.url] : action.argv;
		if ((await runProcess($, [...DETACH, ...argv], GIT_TIMEOUT_MS, action.kind === "launch" ? action.cwd : void 0))?.exitCode !== 0) $.ui.toast(`Couldn't start ${argv[0]}`);
	}
	await close($);
}
const register = (on) => {
	on("session.start", async ($, e, next) => {
		for (const [name, description, argumentHint] of [[
			"git",
			"Open the git menu: the repository, branch and pull request on the forge",
			void 0
		], [
			"open",
			"Open the folder menu: this checkout in an editor, file manager or terminal; `plan` opens one of this checkout's notes",
			"[plan]"
		]]) await $.command.register({
			name,
			description,
			argumentHint,
			immediate: true
		}).catch((error) => $.ui.log(`git-menu: /${name} not registered: ${String(error)}`, { to: "debug" }));
		return next(e);
	});
	on("command.run", { command: "git" }, async ($) => {
		await show($, "git");
		return { text: "Opened the git menu." };
	});
	on("command.run", { command: "open" }, async ($, e) => {
		if (e.args.trim() === "plan") {
			await show($, "notes");
			return { text: "Opened this checkout's notes." };
		}
		await show($, "folder");
		return { text: "Opened the folder menu." };
	});
	on("ui.close", { id: PANE }, async ($, e, next) => {
		await reset($);
		return next(e);
	});
	on("ui.focus", { requestId: PANE }, async ($, e, next) => {
		if (paneSurface !== "terminal") return next(e);
		const move = ringMove(e.element, (hit) => hits.has(hit));
		if (move && "hit" in move) await focusRow($, move.hit);
		else if (move?.by) await moveFocus($, move.by);
		const moved = await next(move ? {
			...e,
			element: RING.park
		} : e);
		if (!moved.deny) await update($, held, () => true);
		return moved;
	}).catch((_$, e, next) => next(e));
	on("ui.scroll", { requestId: PANE }, async ($, e, next) => {
		if (paneSurface !== "terminal") return next(e);
		const rows = (await read($, menu))?.rows;
		if (rows) {
			const by = e.pointer ? WHEEL_ROWS * Math.sign(e.by) : e.by;
			const max = maxTop(rows, await read($, held), drawn.width, drawn.height);
			await update($, top, (t) => clamp(t + by, 0, max));
		}
		return {};
	}).catch((_$, e, next) => next(e));
	on("prompt.edit", async ($, e, next) => {
		if (await read($, held)) await update($, held, () => false);
		return next(e);
	});
	on("prompt.change", async ($, e, next) => {
		if (e.origin.kind !== "plugin" && await read($, held)) await update($, held, () => false);
		return next(e);
	});
	on("ui.render", {
		component: "Pane",
		requestId: PANE
	}, async ($, e) => {
		paneSurface = e.surface;
		const els = $.ui.resolve(e);
		const m = await read($, menu);
		const isAll = await read($, showAll);
		/** A press on a control of the screen: a row, `more`, or the frame's Close. */
		const pressHit = async (hit) => {
			if (closeOf(hit) === "close") return close($);
			if (hit === "more") return update($, showAll, () => true);
			const row = (await read($, menu))?.rows?.find((r) => hitOf(r) === hit);
			if (row) await press($, row, e.surface);
		};
		return forSurface(e, {
			tui: async () => {
				const pad = e.props.placement === "inline" ? 0 : 1;
				const width = Math.max(20, e.props.bodyColumns - pad);
				drawn = {
					width,
					height: Math.max(2 + 1, e.props.scroll.bodyRows)
				};
				hits = new Set(m?.rows?.filter((r) => r.action).map(hitOf));
				const isHeld = await read($, held);
				const look = {
					focus: focusOf(m, await read($, focus)),
					held: isHeld,
					top: await read($, top)
				};
				const screen = drawMenu(m, look, width, drawn.height);
				const rows = m?.rows ?? [];
				return stack(els, ring(els, async () => {
					const now = await read($, menu);
					const at = focusOf(now, await read($, focus));
					const row = now?.rows?.find((r) => r.id === at);
					if (row) await press($, row, e.surface);
				}, rows.slice(0, 9).map((row, i) => ({
					key: String(i + 1),
					press: () => press($, row, e.surface)
				}))), screen.head ? paintLines(els, [screen.head], {
					press: pressHit,
					width,
					indent: pad
				}) : null, paintLines(els, screen.body, {
					press: pressHit,
					width: width - INSET,
					indent: pad + INSET
				}), isHeld && screen.hint.length === 0 ? null : keysHint(els, isHeld, false, pad + INSET) ?? paintLines(els, screen.hint, {
					width: width - INSET,
					indent: pad + INSET
				}));
			},
			gui: async () => guiMenu(guiOf(els, e, pressHit), m, isAll)
		});
	});
};

export { register };