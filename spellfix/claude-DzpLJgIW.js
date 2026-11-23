// ../../lib/kits/core/src/tokens.ts
/** The style's numbers and glyphs, shared by every client; one edit here restyles them all. No host imports. */
const tokens = {
	/** Width classes: caps in columns, never targets. `wide` is the room less `wideMargin`. */
	width: {
		reading: 96,
		split: 124,
		dialog: 72,
		wideMargin: 2
	},
	/** Prose is wrapped at this measure even in a wider room. */
	prose: 80,
	/** What a Claude Code pane is opened with: `"transparent"` is no fill under the body. */
	pane: { backgroundColor: "transparent" },
	/** Cells between the keys of a button row, and between a band's divider and what stands in it. */
	keyGap: 3,
	/** Cells between two things on a row: a label and its text, two buttons, two columns. */
	gutter: 2,
	/** From this many columns a list with detail is two panes; below it stacks. */
	splitFrom: 110,
	/** The list pane's share of a split's content width. */
	splitRatio: .55,
	glyph: {
		pointer: "❯",
		single: {
			off: "○",
			on: "●"
		},
		multi: {
			off: "□",
			on: "■"
		},
		/** The mark of an answer the person writes themselves, while it is empty. */
		ellipsis: "…",
		more: {
			up: "↑",
			down: "↓"
		},
		rule: "─",
		done: "✓",
		times: "×",
		/** The mark of a state that needs a look, beside `done` and `times`. */
		status: { warning: "⚠" },
		enter: "↵",
		bullet: "•",
		/** The rail down the left of a card in a transcript. */
		rail: "│",
		/** The mark of a row set aside: it stays in the list, left out of what is carried out. */
		dropped: "–"
	},
	/** The graphical surfaces' numbers: none of them is a cell. */
	gui: {
		/** A long list shows this many rows, then an `N more` row. */
		maxItems: 12,
		/**
		* The widest a choice's label may be, in cells, before a graphical surface sets it as text
		* under a Button of its `short` word: a Button never wraps and runs off a 420-pixel pane.
		*/
		maxLabel: 34,
		/**
		* Icon colours. The host's theme cannot be read from a mod and an image cannot follow it, so
		* the neutral is one mid-grey that reads on light and dark; colour marks a state only.
		*/
		tone: {
			neutral: "#8b8f98",
			/** The accent: what is chosen. */
			accent: "#d97757",
			error: "#e5534b",
			warning: "#d4962a",
			success: "#3fa65b"
		},
		/** An icon's side, in CSS pixels. */
		icon: 16,
		/**
		* The column, in cells, that leads each row of a choice drawn as rows: its key's Button (`A`)
		* or an icon, centred, so every row's text starts at one edge.
		*/
		lead: 4.6,
		/**
		* A passage longer than this, in cells, or of more than one line, is cut to one line with a
		* `More` beside it (`excerpt`): about what one line of a 420-pixel band holds beside the button.
		*/
		excerptCells: 40,
		/**
		* The vertical rhythm, in lines of body text. A step name is a whole line or none on VS Code,
		* too coarse for a short pane, so the kit spaces with these numbers. `xs` sits between the
		* lines of one part (a label and its text), `sm` between the parts of one item (claim, meta,
		* evidence, keys), `md` between items that stand alone (groups, the pane's regions).
		*/
		space: {
			xs: .2,
			sm: .5,
			md: .9
		},
		/**
		* Horizontal room, in cells: `xs` between the buttons of a row, `sm` after an icon, `md`
		* between a line's text and its control, and `inset` on each side of a row, which is where
		* an opened row's fill reaches.
		*/
		across: {
			xs: .6,
			sm: .8,
			md: 1.2,
			inset: 1
		},
		/**
		* The fill of an opened row: the theme's own second background, a well the row's body sits
		* in, which a quiet button's outline still reads on.
		*/
		fill: "userMessageBackground",
		/** Behind a code span in a Text, which has no code face: the theme's code background. */
		chip: "bashMessageBackgroundColor",
		/** A thin rule's colour: one grey at low alpha, which reads on a light theme and a dark one. */
		rule: "#8b8f9866",
		/**
		* The least a form's label column takes, in cells, so its controls start at one edge: a
		* label longer than this pushes only its own control.
		*/
		labelColumn: 7
	}
};

// ../../lib/kits/core/src/lines.ts
const span = (text, style = {}) => ({
	text,
	...style
});
const line = (spans, hit) => hit === void 0 ? { spans } : {
	spans,
	hit
};
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
function clamp(text, width, options = {}) {
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

// ../../lib/kits/notice/src/terminal.ts
/** The notice and the empty state as styled lines: the one drawing both terminals paint. */
/**
* One line telling the person what just happened, in the role of its status, cut to the room
* with `…`.
* @param text Words, or spans where part of the line stands out (a word in its context); a span
* with no role takes the status's.
* @param status Success, warning and error only for an actual state. @default "warning"
*/
function notice(text, width, status = "warning", { isWrapped = false } = {}) {
	if (typeof text !== "string") {
		const styled = text.map((s) => ({
			...s,
			role: s.role ?? status
		}));
		return isWrapped ? wrapSpans(styled, width).map((row) => line(row)) : [line(truncateSpans(styled, width))];
	}
	return (isWrapped ? clamp(text, width) : clamp(text, width, {
		min: 1,
		max: 1
	})).map((row) => line([{
		text: row,
		role: status
	}]));
}

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
const CLAUDE_MD = "skills/agent-plugin-dev/references/claude.md, VS Code quirks (extension 2.1.327)";
const TYPES = "claude-code types, Elements (apps/*/dist/.claude-plugin/types/claude-code/index.d.ts, `pnpm drive types <app>`)";
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
		images: fact(false, "pi-tui has no image component", "pi-tui exports (no Image)")
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
		images: fact(true, "the terminal's table has an `Image`", TYPES + ", Elements.terminal")
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
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: fact(false, "a Button's label never wraps; a long one overflows a narrow pane", CLAUDE_MD),
		images: unverified("the table has no `Image`")
	},
	desktop: {
		drawing: "gui",
		keyFocus: unverified(),
		hover: unverified(),
		hotkeys: unverified(),
		window: unverified(),
		framesPane: unverified(),
		inputRows: unverified(),
		input: unverified("the table has an `Input`"),
		select: unverified("the table has a `Select`"),
		progress: unverified("the table has a `Progress`"),
		svg: fact(true, "drawn as an image, or in a sandboxed frame when `isInteractive`", TYPES + ", SvgProps; never driven"),
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		images: unverified("the table has no `Image`")
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
		images: unverified("the table has no `Image`")
	}
};
/** What the table says of one capability on one surface: `undefined` when unverified. */
const factOf = (surface, cap) => {
	const f = surfaces[surface][cap];
	return "unverified" in f ? void 0 : f;
};
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
/**
* A button that draws nothing and carries a keybinding's action, so the key a person bound to
* `action` in `keybindings.json` presses `press`. The engine presses only a mounted Button, so
* draw it whenever the key should work, wherever the site draws nothing else.
* @param action The action the key is bound to.
*/
function actionKey(k, action, press) {
	const { Box, Button } = k;
	return /* @__PURE__ */ h(Box, {
		width: 0,
		height: 0,
		overflow: "hidden"
	}, /* @__PURE__ */ h(Button, {
		key: "kit-action",
		plain: true,
		action,
		label: "action",
		onPress: press
	}));
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

export { ringMove as a, notice as c, span as d, spansWidth as f, ring as i, cellWidth as l, tokens as m, actionKey as n, stack as o, truncateSpans as p, paintLines as r, ctxOf as s, RING as t, line as u };