import { Type } from "typebox";
import { Input, Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";

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
	/**
	* The type roles of a graphical surface: what a line of text is, never a size. A drawing picks
	* a role (`typed`, `typeProps`) and the host's scale supplies the size, so the hierarchy
	* is one edit here. The terminal has one size: `terminalStyle` keeps its look, bold for a
	* semibold or bold weight and dim for a role that is dim, as the drawings always had it.
	* - `title`: a screen's own name, where the host draws none.
	* - `heading`: one record's title, or a group's.
	* - `section`: a small semibold heading over a part of a record (`Evidence`).
	* - `body`: the words of a screen.
	* - `caption`: meta: a count, an age, a hint.
	* Digits that line up or change (a count, a time) ask for `tabular` where they are drawn.
	*/
	type: {
		title: {
			size: "title",
			weight: "semibold"
		},
		heading: {
			size: "heading",
			weight: "semibold"
		},
		section: {
			size: "footnote",
			weight: "semibold"
		},
		body: {
			size: "body",
			weight: "regular"
		},
		caption: {
			size: "caption",
			weight: "regular",
			role: "dim"
		}
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
			neutral: "#7f838c",
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
		/**
		* One row of a list or a form: its line with `pad` lines of space above and below, whether or
		* not it holds a Button, so a column of them keeps one beat. A Box may carry no height
		* (`expectNative` says so), so the beat is padding. `gap` is the space between two rows
		* (`rows` and `rowOf` in `paint/gui.tsx`).
		*/
		row: {
			pad: .25,
			gap: .15
		},
		/**
		* A panel, what opens in place: the fill, set in by `x` cells and `y` lines of its own, so
		* the words stay a step inside the fill and a control beside them stays on it.
		*/
		panel: {
			x: 1,
			y: .5
		},
		/** A thin rule's colour: one grey at low alpha, which reads on a light theme and a dark one. */
		rule: "#8b8f9866",
		/**
		* The least a form's label column takes, in cells, so its controls start at one edge: a
		* label longer than this pushes only its own control.
		*/
		labelColumn: 7
	}
};
/**
* The class's cap in columns in a room `columns` wide, or the content width for `auto`.
* @param content The widest line in cells; only `auto` reads it.
*/
function widthCap(cls, columns, content = 0) {
	const cap = (n) => Math.max(1, Math.min(n, columns));
	if (cls === "wide") return cap(columns - tokens.width.wideMargin);
	if (cls === "auto") return cap(Math.min(content, tokens.width.dialog));
	return cap(tokens.width[cls]);
}

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
/** Cells a panel's rail and its gap take: a row of a panel starts this far in. */
const PANEL_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;

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

// ../../lib/kits/core/src/manifest.ts
/** A contract's model fields, checked against the model type: a field left out is an error. */
const modelFields = () => (keys) => keys;

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
/** A digit picks by a row's place, not by the letter printed on it. */
function digitChoice(key) {
	return /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
}

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
/** What a person can press on a card: in the accent on the keyboard's card, quiet elsewhere. */
const keyRole = (state) => state.active ? "accent" : "dim";
/**
* The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
* before a row of its own, such as an input, to line it up with the card's.
*/
const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);
/** The pointer column of one row: the pointer where the keyboard is, else blank. */
const pointerLead = (isFocused = false) => isFocused ? [span(tokens.glyph.pointer, {
	role: "text",
	bold: true
}), span(" ")] : [span(CARD_INSET)];
/**
* The question: the pointer column, its label, then the title hanging from it. That it is
* answered is the rail's to say.
*/
function heading(h, width) {
	return block(inline(h.title, {
		role: "text",
		bold: true
	}), width, { lead: [...pointerLead(h.focused), ...h.label ? [span(h.label + GAP$1, { role: keyRole(h) })] : []] });
}
/**
* One answer: the pointer column, its key, its mark and its words, wrapped to hang under their
* first line. Only a chosen one takes a colour, the accent.
*/
function choice(c, width) {
	const { chosen = false, literal: isLiteral = false, focused = false, hovered = false } = c;
	const marks = c.multiple ? tokens.glyph.multi : tokens.glyph.single;
	const isLit = chosen || focused || hovered;
	const label = controlStyle({
		primary: chosen,
		highlighted: focused || hovered,
		rest: isLiteral ? "dim" : "text"
	});
	const words = [...isLiteral ? literal(c.text, label) : inline(c.text, isLit ? label : {}), ...c.aside ? [span(c.aside, { role: "dim" })] : []];
	const mark = chosen ? {
		role: "accent",
		bold: true
	} : { role: "dim" };
	const lead = [
		...pointerLead(focused),
		span(c.key || " ", { role: keyRole(c) }),
		span(" "),
		span(chosen ? marks.on : marks.off, mark),
		span(" ")
	];
	const hang = [span(" ".repeat(spansWidth(lead)))];
	return [...block(words, width, {
		lead,
		hang,
		hit: c.hit
	}), ...c.detail ? block(inline(c.detail, { role: "dim" }), width, {
		lead: hang,
		hang,
		max: c.detailLines ?? 3,
		hit: c.hit
	}) : []];
}
const NOTE_LABEL = "Note: ";
/** The card's note after the pointer column and its label, or the invitation to add one. */
function note(n, width) {
	const isLit = n.focused || n.hovered;
	const style = controlStyle({
		highlighted: isLit,
		rest: "dim"
	});
	const room = width - cellWidth(CARD_INSET) - cellWidth(NOTE_LABEL);
	const words = isLit ? style : { role: n.value ? "text" : "dim" };
	return clamp(n.value || "Add a note", room, { max: n.max }).map((text, i) => line([...i ? [span(CARD_INSET + " ".repeat(cellWidth(NOTE_LABEL)))] : [...pointerLead(n.focused), span(NOTE_LABEL, isLit ? style : { role: "dim" })], span(text, words)], n.hit));
}
/**
* The steps of several questions on one row, each a control: the longest name is shortened
* first, and with no room for names only the short labels stay. `undefined` when even those do
* not fit.
*/
function steps(all, width) {
	const rule = tokens.glyph.rule;
	const gaps = Math.max(0, all.length - 1);
	const marked = all.filter(({ name }) => name).length;
	const fixed = all.reduce((n, step) => n + cellWidth(step.short), 0) + 2 * marked;
	const roomy = ` ${rule.repeat(tokens.gutter)} `;
	const tight = ` ${rule} `;
	const gap = width >= fixed + gaps * cellWidth(roomy) + marked * 2 ? roomy : width >= fixed - marked + gaps * cellWidth(tight) ? tight : rule;
	const base = fixed + gaps * cellWidth(gap);
	const widths = all.map((step) => step.name ? cellWidth(step.name) + 1 : 0);
	const isCompact = width < base + widths.filter(Boolean).length * 2;
	if (width < base - marked) return void 0;
	let overflow = base + widths.reduce((n, w) => n + w, 0) - width;
	while (!isCompact && overflow > 0) {
		widths[widths.indexOf(Math.max(...widths))]--;
		overflow--;
	}
	const spans = [];
	all.forEach((step, i) => {
		if (i) spans.push(span(gap, { role: "border" }));
		const mark = step.current ? tokens.glyph.pointer : step.done ? tokens.glyph.done : " ";
		const label = step.short + (!isCompact && step.name ? ` ${truncate(step.name, (widths[i] ?? 1) - 1)}` : "");
		const caption = controlStyle({
			primary: step.current,
			highlighted: step.hovered,
			rest: step.done || !step.name ? "text" : "dim"
		});
		if (step.name) {
			spans.push(span(mark, {
				role: step.current ? "accent" : "dim",
				hit: step.hit
			}));
			if (!isCompact) spans.push(span(" ", { hit: step.hit }));
		}
		spans.push(span(label, {
			...caption,
			hit: step.hit
		}));
	});
	return line(spans);
}
/** A numbered question's answers, one per line, then its note. */
function summary(s, width) {
	const prefix = s.label + GAP$1;
	const indent = span(" ".repeat(cellWidth(prefix)));
	const room = width - cellWidth(prefix);
	if (room < 1) return [];
	const label = controlStyle({ highlighted: s.hovered });
	const head = clamp(s.title, room).map((text, i) => line([i ? indent : span(prefix, { role: "dim" }), span(text, {
		role: "text",
		bold: true
	})], s.hit));
	const bullet = s.values.length > 1 && room > 2 ? `${tokens.glyph.bullet} ` : "";
	const answers = s.values.flatMap(({ text, literal: isLiteral }) => block(isLiteral ? literal(text, s.hovered ? label : {}) : inline(text, s.hovered ? label : {}), width, {
		lead: [indent, ...bullet ? [span(bullet, { role: "dim" })] : []],
		hang: [indent, ...bullet ? [span(" ".repeat(cellWidth(bullet)))] : []],
		hit: s.hit
	}));
	const missing = clamp("Not answered", room).map((text) => line([indent, span(text, s.hovered ? label : { role: "dim" })], s.hit));
	const noted = s.note ? clamp(s.note, room - cellWidth(NOTE_LABEL)).map((text, i) => line([indent, span((i ? " ".repeat(cellWidth(NOTE_LABEL)) : NOTE_LABEL) + text, { role: "dim" })], s.hit)) : [];
	return [
		...head,
		...answers.length ? answers : missing,
		...noted
	];
}
/** The nonempty sections of a card, `gap` between them: for rows that are not lines yet. */
function sectionsOf(gap, ...parts) {
	return parts.filter((part) => part.length > 0).flatMap((part, i) => i ? [gap, ...part] : part);
}

// ../../lib/kits/buttons/src/model.ts
/**
* The button row's view model: what is lit, what goes quiet and what is drawn on a surface.
* Pure and plain: the drawings read it, and so does the snapshot that holds it across surfaces.
* No host imports.
*/
/** How a button's key is printed after its label: `↵` for Enter, else in brackets; nothing for none. */
const shortcutOf = (b) => b.hit === void 0 || !b.hotkey ? b.hotkey : b.hotkey === "enter" ? tokens.glyph.enter : `[${b.hotkey}]`;
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
/** An inline form between two rules: a caption and Close in the top one, the body set in. */
function captionFrame(f) {
	const { width } = f;
	const inner = Math.max(0, width - 2 * captionFrameLayout.x);
	const pad = span(" ".repeat(captionFrameLayout.x));
	const row = (l) => l && (l.spans.length || l.slot) ? {
		...l,
		spans: [pad, ...truncateSpans(l.spans, inner)]
	} : blank();
	return [
		frameTop(f),
		blank(),
		...f.body.map(row),
		row(f.notice),
		row(f.footer),
		line([ruleSpan(width)])
	];
}

// ../../lib/kits/core/src/paint/pi.ts
/** Paints styled lines for pi: theme colours, and where each control is on its row. */
const ROLE = {
	text: "text",
	dim: "dim",
	accent: "accent",
	success: "success",
	warning: "warning",
	error: "error",
	code: "mdCode",
	link: "mdLink",
	border: "borderMuted"
};
/** One span in the theme: a span with no role keeps the terminal's own colour. */
function paintSpan(theme, s) {
	let out = s.role ? theme.fg(ROLE[s.role], s.text) : s.text;
	if (s.bold) out = theme.bold(out);
	if (s.italic) out = theme.italic(out);
	if (s.underline) out = theme.underline(out);
	if (s.inverse) out = theme.inverse(out);
	return out;
}
const paintSpans = (theme, spans) => spans.map((s) => paintSpan(theme, s)).join("");
function markdownTheme(theme) {
	const color = (role) => (text) => theme.fg(role, text);
	return {
		heading: color("mdHeading"),
		link: color("mdLink"),
		linkUrl: color("mdLinkUrl"),
		code: color("mdCode"),
		codeBlock: color("mdCodeBlock"),
		codeBlockBorder: color("mdCodeBlockBorder"),
		quote: color("mdQuote"),
		quoteBorder: color("mdQuoteBorder"),
		hr: color("mdHr"),
		listBullet: color("mdListBullet"),
		bold: (text) => theme.bold(text),
		italic: (text) => theme.italic(text),
		underline: (text) => theme.underline(text),
		strikethrough: (text) => theme.strikethrough(text),
		highlightCode(code, lang) {
			try {
				return getMarkdownTheme().highlightCode?.(code, lang) ?? code.split("\n").map(color("mdCodeBlock"));
			} catch {
				return code.split("\n").map(color("mdCodeBlock"));
			}
		}
	};
}
/**
* Block Markdown by pi's own renderer, at most `max` lines, the last of a cut one ending in
* `…`. A line in a default style ends with it still open and pi pads every line to the
* terminal's edge, so each is closed here.
*/
function markdownLines(theme, text, width, style, max = 1e400) {
	const lines = new Markdown(text, 0, 0, markdownTheme(theme), style).render(width).map((row) => row.trimEnd());
	if (lines.length > max) {
		lines.length = Math.max(0, max);
		const last = lines.pop();
		if (last !== void 0) lines.push(truncateToWidth(last, Math.max(0, width - 1), "") + (style?.color ?? String)("…"));
	}
	return lines.map((row) => `${row}\x1b[0m`);
}
const slotRows = (theme, slot) => markdownLines(theme, slot.text, slot.width, slot.isDim ? { color: (text) => theme.fg("dim", text) } : void 0, slot.max).map((row) => " ".repeat(slot.indent) + row);
/**
* @param width pi's own measure has the last word: a line it counts wider is cut, since pi
* refuses a render with one that does not fit.
*/
function paintLines(theme, lines, width, { fill = false } = {}) {
	const out = {
		lines: [],
		fields: [],
		hits: [],
		cells: []
	};
	const push = (text, hit, cells) => {
		const fit = visibleWidth(text) > width ? truncateToWidth(text, width, "") : text;
		out.lines.push(fill ? fit + " ".repeat(Math.max(0, width - visibleWidth(fit))) : fit);
		out.hits.push(hit);
		out.cells.push(cells);
	};
	for (const l of lines) {
		if (l.slot?.kind === "input") {
			const lead = paintSpans(theme, l.slot.lead);
			const tail = paintSpans(theme, l.slot.tail ?? []);
			const hang = l.slot.hang ? paintSpans(theme, l.slot.hang) : " ".repeat(visibleWidth(lead));
			const rows = l.slot.rows ?? 1;
			out.fields.push({
				row: out.lines.length,
				rows,
				lead,
				hang,
				tail,
				width: l.slot.width
			});
			push(lead + " ".repeat(l.slot.width) + tail, void 0, []);
			const under = hang + " ".repeat(l.slot.width) + tail;
			for (let row = 1; row < rows; row++) push(under, void 0, []);
			continue;
		}
		if (l.slot?.kind === "markdown") {
			for (const row of slotRows(theme, l.slot)) push(row, l.hit, []);
			continue;
		}
		const cells = [];
		let at = 0;
		let text = "";
		for (const s of l.spans) {
			const end = at + visibleWidth(s.text);
			const last = cells[cells.length - 1];
			if (s.hit !== void 0) {
				if (last && last.hit === s.hit && last.end === at) last.end = end;
				else cells.push({
					start: at,
					end,
					hit: s.hit
				});
			}
			text += paintSpan(theme, s);
			at = end;
		}
		if (l.hit !== void 0 && !cells.length) {
			const drawn = visibleWidth(l.spans.map((s) => s.text).join("").trimEnd());
			if (drawn > 0) cells.push({
				start: 0,
				end: drawn,
				hit: l.hit
			});
		}
		push(text, l.hit, cells);
	}
	return out;
}
/** One line painted, for where a caller places rows itself. */
function paintLine(theme, l, width) {
	const painted = paintLines(theme, [l], width);
	return {
		text: painted.lines[0] ?? "",
		cells: painted.cells[0] ?? []
	};
}
/** The control at cell `x` of a painted row. */
const cellAt = (cells, x) => cells?.find((cell) => x >= cell.start && x < cell.end);
/** Lines painted, for where only the rows are wanted. */
const draw = (theme, lines, width) => paintLines(theme, lines, width).lines;
/** One run of text in a style of the kit. */
const paintText = (theme, text, style = {}) => paintSpan(theme, {
	...style,
	text
});
/** Cells a painted row takes, by pi's measure. */
const paintedWidth = (text) => visibleWidth(text);
/** A painted row cut with `…` or padded with spaces to exactly `width` cells. */
const fitPainted = (text, width) => truncateToWidth(text, Math.max(0, width), "…", true);
/** A painted row cut to `width` cells, with nothing to mark the cut. */
const cutPainted = (text, width) => truncateToWidth(text, Math.max(0, width), "");

// src/pi/dialog.ts
const MIN_WIDTH = 28;
const RESERVED_ROWS = 10;
const MAX_ROWS = 24;
const GAP = " ".repeat(tokens.gutter);
/** The cells a card's row keeps for the pointer. */
const INSET = cellWidth(CARD_INSET);
const isAnswered = (draft) => draft.picked.length > 0 || draft.text.trim() !== "";
/** A row that carries a pointer target over the text it actually draws. */
function target(text, item) {
	return {
		text,
		hit: item,
		hitTo: paintedWidth(text.replace(/\s+$/, ""))
	};
}
/**
* A previous round's answer as a draft: options it names are picked, anything
* else is what the user typed, which is where those answers came from.
*/
function draftFrom(question, values) {
	const picked = [];
	const typed = [];
	for (const value of values) {
		const index = question.options.findIndex((option) => option.label === value);
		if (index >= 0) picked.push(index);
		else typed.push(value);
	}
	const sorted = [...new Set(picked)].sort((left, right) => left - right);
	return {
		picked: question.multiSelect ? sorted : sorted.slice(0, 1),
		text: typed.join(", ")
	};
}
var QuestionsDialog = class {
	tui;
	theme;
	questions;
	done;
	tabs;
	drafts;
	/** The answer field and the note field, each with its own cursor, undo and paste. */
	input;
	noteInput;
	tab = 0;
	row = 0;
	editing;
	/** One note per question, included with its answer in the result. */
	notes;
	/** First line of a question too tall for the frame, and how far it can go. */
	questionOffset = 0;
	questionMaxOffset = 0;
	/** The question's rows in the last frame, for wheeling over its text. */
	questionRows = {
		start: 0,
		end: 0
	};
	warning;
	/** Esc asks once before it throws the answers away; this is that question being pending. */
	confirming = false;
	/**
	* How far the preview is scrolled, how far it can go, and which row it belongs to.
	* The box prints the position; these are what the keys and the wheel move.
	*/
	previewOffset = 0;
	previewMax = 0;
	previewFor;
	previewCells;
	closed = false;
	isFocused = false;
	hits = /* @__PURE__ */ new Map();
	/** The controls of the top rule: a step each, and Close or its question. */
	captionCells = [];
	hoverTab;
	hoverClose;
	hoverReview;
	hoverButton;
	/** The row under the mouse: bold, while the pointer stays on the keyboard's row. */
	hoverRow;
	reviewOffset = 0;
	reviewMaxOffset = 0;
	/** The footer's row, the cells of its buttons and what each does, by its place. */
	footer;
	constructor(tui, theme, questions, done, previous = []) {
		this.tui = tui;
		this.theme = theme;
		this.questions = questions;
		this.done = done;
		this.tabs = questions.map((_, index) => ({
			kind: "question",
			index
		}));
		if (questions.length > 1) this.tabs.push({ kind: "review" });
		const was = (question) => previous.find((answer) => answer.header === question.header && answer.question === question.question);
		this.drafts = questions.map((question) => {
			const answer = was(question);
			return answer ? draftFrom(question, answer.values) : {
				picked: [],
				text: ""
			};
		});
		this.notes = questions.map((question) => was(question)?.note ?? "");
		this.row = this.firstChoice();
		this.input = new Input({
			prompt: "",
			placeholder: "Your answer"
		});
		this.noteInput = new Input({
			prompt: "",
			placeholder: "Your note"
		});
	}
	/** Inline rather than an overlay: the transcript stays readable behind it. */
	get focused() {
		return this.isFocused;
	}
	set focused(value) {
		this.isFocused = value;
		this.input.focused = value && this.editing === "answer";
		this.noteInput.focused = value && this.editing === "note";
	}
	invalidate() {}
	/** The field being edited; only meaningful while `editing` is set. */
	get editingInput() {
		return this.editing === "note" ? this.noteInput : this.input;
	}
	get tabKind() {
		return this.tabs[this.tab] ?? this.tabs[0];
	}
	/** The question the current tab edits, if it edits one. */
	get questionIndex() {
		const kind = this.tabKind;
		return kind.kind === "question" ? kind.index : void 0;
	}
	get question() {
		const index = this.questionIndex;
		return index === void 0 ? void 0 : this.questions[index];
	}
	items() {
		const question = this.question;
		if (!question) return [];
		const items = question.options.map((_, index) => ({
			kind: "option",
			index
		}));
		items.push({ kind: "custom" });
		items.push({ kind: "note" });
		return items;
	}
	/** Return to the answer already given, or start on the first option. */
	firstChoice() {
		const index = this.questionIndex;
		const draft = index === void 0 ? void 0 : this.drafts[index];
		return draft?.picked[0] ?? (draft?.text.trim() ? this.question.options.length : 0);
	}
	move(step) {
		if (this.editing) return;
		if (this.tabKind.kind === "review") {
			this.scrollReview(step);
			return;
		}
		const items = this.items();
		if (items.length === 0) return;
		this.row = (this.row + step % items.length + items.length) % items.length;
		this.warning = void 0;
		this.tui.requestRender();
	}
	goTab(tab) {
		this.keepDraft();
		this.clearHover();
		this.questionOffset = 0;
		this.previewOffset = 0;
		this.previewFor = void 0;
		this.reviewOffset = 0;
		this.tab = Math.max(0, Math.min(tab, this.tabs.length - 1));
		this.row = this.firstChoice();
		this.editing = void 0;
		this.input.focused = false;
		this.noteInput.focused = false;
		this.warning = void 0;
		this.tui.requestRender();
	}
	cycleTab(step) {
		if (this.tabs.length < 2) return;
		this.goTab((this.tab + step + this.tabs.length) % this.tabs.length);
	}
	/** Move a question too tall for the frame; idle when the whole text is on screen. */
	scrollQuestion(step) {
		if (this.questionMaxOffset === 0) return;
		const next = Math.max(0, Math.min(this.questionMaxOffset, this.questionOffset + step));
		if (next === this.questionOffset) return;
		this.questionOffset = next;
		this.tui.requestRender();
	}
	scrollReview(step) {
		const next = Math.max(0, Math.min(this.reviewMaxOffset, this.reviewOffset + step));
		if (next === this.reviewOffset) return;
		this.reviewOffset = next;
		this.tui.requestRender();
	}
	scrollPreview(step) {
		const next = Math.max(0, Math.min(this.previewMax, this.previewOffset + step));
		if (next === this.previewOffset) return;
		this.previewOffset = next;
		this.tui.requestRender();
	}
	startEditing(field) {
		const index = this.questionIndex;
		if (index === void 0) return;
		if (this.editing === field) return;
		this.keepDraft();
		this.editing = field;
		this.row = this.items().findIndex((item) => item.kind === (field === "note" ? "note" : "custom"));
		this.warning = void 0;
		this.input.focused = this.isFocused && field === "answer";
		this.noteInput.focused = this.isFocused && field === "note";
		this.editingInput.setValue(field === "note" ? this.notes[index] : this.drafts[index].text);
		this.tui.requestRender();
	}
	/** Leaving the field, or the tab, keeps what was typed as a draft on the row. */
	keepDraft() {
		const index = this.questionIndex;
		if (this.editing === void 0 || index === void 0) return;
		if (this.editing === "note") this.notes[index] = this.noteInput.getValue();
		else this.saveWriteIn(index, this.input.getValue());
	}
	saveWriteIn(index, text) {
		const draft = this.drafts[index];
		this.drafts[index] = {
			picked: !text.trim() || this.questions[index].multiSelect ? draft.picked : [],
			text
		};
	}
	stopEditing() {
		this.keepDraft();
		this.editing = void 0;
		this.input.focused = false;
		this.noteInput.focused = false;
		this.warning = void 0;
		this.tui.requestRender();
	}
	/**
	* Save the field and, for an answer, move on.
	*
	* A note saves in place: it is commentary on a question, not the decision, so
	* entering one must not carry the user off the tab they were reading.
	*/
	commitText() {
		const index = this.questionIndex;
		if (index === void 0) return;
		const text = this.editingInput.getValue().trim();
		if (this.editing === "note") {
			this.notes[index] = text;
			this.editing = void 0;
			this.input.focused = false;
			this.noteInput.focused = false;
			this.warning = void 0;
			this.tui.requestRender();
			return;
		}
		if (!text) {
			this.warning = "Type an answer, or press esc to go back";
			this.tui.requestRender();
			return;
		}
		const keepPicks = this.question?.multiSelect === true;
		this.saveWriteIn(index, text);
		this.editing = void 0;
		this.input.focused = false;
		if (keepPicks) {
			this.warning = void 0;
			this.tui.requestRender();
			return;
		}
		this.advance();
	}
	/** Take an option: a single-select answer is complete, a multi-select one is a toggle. */
	choose(index) {
		const question = this.question;
		const at = this.questionIndex;
		if (!question || at === void 0) return;
		const draft = this.drafts[at];
		if (question.multiSelect) {
			const picked = draft.picked.includes(index) ? draft.picked.filter((candidate) => candidate !== index) : [...draft.picked, index].sort((left, right) => left - right);
			this.drafts[at] = {
				picked,
				text: draft.text
			};
			this.warning = void 0;
			this.tui.requestRender();
			return;
		}
		this.drafts[at] = {
			picked: [index],
			text: ""
		};
		this.advance();
	}
	/** The answers one question contributes, options first and a typed one last. */
	valuesOf(index) {
		const draft = this.drafts[index];
		const options = this.questions[index].options;
		const text = draft.text.trim();
		return [...draft.picked.flatMap((picked) => {
			const option = options[picked];
			return option ? [option.label] : [];
		}), ...text ? [text] : []];
	}
	/** Move on the way a click on an option would: to the next open question, else to review. */
	advance() {
		this.warning = void 0;
		if (this.tabs.length === 1) {
			this.submit();
			return;
		}
		const open = this.drafts.findIndex((draft) => !isAnswered(draft));
		this.goTab(open >= 0 ? open : this.tabs.length - 1);
	}
	submit() {
		const open = this.drafts.findIndex((draft) => !isAnswered(draft));
		if (open >= 0) {
			this.goTab(open);
			this.warning = `Answer question ${open + 1} first`;
			this.tui.requestRender();
			return;
		}
		const answers = [];
		this.questions.forEach((question, index) => {
			const values = this.valuesOf(index);
			if (values.length > 0) {
				const note = this.notes[index]?.trim() ?? "";
				answers.push({
					header: question.header,
					question: question.question,
					values,
					...note ? { note } : {}
				});
			}
		});
		this.finish({
			answers,
			cancelled: false
		});
	}
	cancel() {
		this.finish({
			answers: [],
			cancelled: true
		});
	}
	/** Esc asks once: an accidental key must not throw away the answers already given. */
	askCancel() {
		if (this.editing) this.stopEditing();
		this.clearHover();
		this.confirming = true;
		this.warning = void 0;
		this.tui.requestRender();
	}
	finish(result) {
		if (this.closed) return;
		this.closed = true;
		this.focused = false;
		this.done(result);
	}
	/** The action a row performs, whichever way it was reached. */
	activate(item) {
		if (this.editing !== void 0 && item.kind !== this.editing) this.stopEditing();
		switch (item.kind) {
			case "option":
				this.choose(item.index);
				return;
			case "custom":
				this.startEditing("answer");
				return;
			case "note":
				this.startEditing("note");
				return;
			case "review":
				this.goTab(item.question);
				return;
		}
	}
	handleInput(data) {
		if (this.clearHover()) this.tui.requestRender();
		if (this.editing) {
			this.handleEditingInput(data);
			return;
		}
		if (this.confirming) {
			if (matchesKey(data, Key.enter)) this.cancel();
			else {
				this.confirming = false;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "ctrl+c")) {
			this.cancel();
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.askCancel();
			return;
		}
		if (matchesKey(data, Key.up) || data === "k") {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.move(1);
			return;
		}
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
			this.cycleTab(1);
			return;
		}
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			this.cycleTab(-1);
			return;
		}
		if (matchesKey(data, Key.shift("up")) || matchesKey(data, Key.shift("down"))) {
			const step = matchesKey(data, Key.shift("down")) ? 3 : -3;
			if (this.tabKind.kind === "review") this.scrollReview(step);
			else if (this.previewMax > 0) this.scrollPreview(step);
			else this.scrollQuestion(step);
			return;
		}
		if (matchesKey(data, Key.shift("left")) || matchesKey(data, Key.shift("right"))) {
			this.scrollQuestion(matchesKey(data, Key.shift("right")) ? 3 : -3);
			return;
		}
		if (data === "n" && this.question) {
			this.startEditing("note");
			return;
		}
		if (data === "s" && this.question?.multiSelect) {
			if (!isAnswered(this.drafts[this.questionIndex])) {
				this.warning = "Pick an option or write an answer first";
				this.tui.requestRender();
				return;
			}
			this.advance();
			return;
		}
		if (this.tabKind.kind === "review") {
			if (matchesKey(data, Key.enter)) this.submit();
			else {
				const index = digitChoice(data);
				if (index >= 0 && index < this.questions.length) this.goTab(index);
			}
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const item = this.items()[this.row];
			if (item) this.activate(item);
			return;
		}
		if (data === " ") {
			const item = this.items()[this.row];
			const question = this.question;
			if (item?.kind === "option" && question?.multiSelect) this.choose(item.index);
			return;
		}
		const slot = /^[a-e]$/i.test(data) ? data.toUpperCase().charCodeAt(0) - 65 : digitChoice(data);
		const item = this.question && slot >= 0 ? this.items()[slot] : void 0;
		if (item && (item.kind === "option" || item.kind === "custom")) {
			this.row = slot;
			this.activate(item);
		}
	}
	handleEditingInput(data) {
		if (matchesKey(data, Key.escape)) {
			this.stopEditing();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.commitText();
			return;
		}
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
			this.cycleTab(matchesKey(data, Key.tab) ? 1 : -1);
			return;
		}
		this.editingInput.handleInput(data);
		this.tui.requestRender();
	}
	/**
	* The target under the pointer: the row under it, when the pointer is over
	* that row's own text rather than the empty part of its line.
	*/
	itemAt(x, row) {
		const hit = this.hits.get(row);
		return hit && x < hit.to ? hit.item : void 0;
	}
	clearHover() {
		const changed = this.hoverTab !== void 0 || this.hoverReview !== void 0 || this.hoverButton !== void 0 || this.hoverRow !== void 0 || this.hoverClose !== void 0;
		this.hoverTab = this.hoverReview = this.hoverButton = this.hoverClose = void 0;
		this.hoverRow = void 0;
		return changed;
	}
	handleMouse(event) {
		const x = event.x - captionFrameLayout.x;
		const row = event.y - captionFrameLayout.y;
		const onCaption = event.y === 0 ? cellAt(this.captionCells, event.x)?.hit : void 0;
		const tab = !this.confirming && onCaption?.startsWith("step:") ? { act: Number(onCaption.slice(5)) } : void 0;
		const pressed = this.footer?.row === row ? cellAt(this.footer.cells, x) : void 0;
		const button = pressed && {
			start: pressed.start,
			act: this.footer?.acts[Number(pressed.hit.slice(4))] ?? (() => void 0)
		};
		const close = closeOf(onCaption);
		if (event.type === "move") {
			const item = !this.confirming && x >= 0 ? this.itemAt(x, row) : void 0;
			const review = item?.kind === "review" ? item.question : void 0;
			const over = item && !this.editing ? this.items().findIndex((other) => sameItem(other, item)) : -1;
			const hoverRow = over < 0 ? void 0 : over;
			if (this.hoverTab !== tab?.act || this.hoverButton !== button?.start || this.hoverReview !== review || this.hoverRow !== hoverRow || this.hoverClose !== close) {
				this.hoverClose = close;
				this.hoverTab = tab?.act;
				this.hoverButton = button?.start;
				this.hoverReview = review;
				this.hoverRow = hoverRow;
				this.tui.requestRender();
			}
		}
		if (event.button === "left" && (tab || button || close)) {
			if (event.type === "press") return {
				handled: true,
				focus: true
			};
			if (event.type === "click") {
				if (close === "close") this.askCancel();
				else if (close === "discard") this.handleInput("\r");
				else if (close === "keep") this.handleInput("\x1B");
				else if (tab) this.goTab(tab.act);
				else button?.act();
				return { handled: true };
			}
		}
		if (x < 0 || row < 0) return void 0;
		if (this.confirming) return void 0;
		if (event.type === "wheel" && event.wheelDelta) {
			const step = event.wheelDelta < 0 ? -1 : 1;
			const pane = this.previewCells;
			if (this.previewMax > 0 && pane && row >= pane.top && row < pane.bottom && x >= pane.left) {
				this.scrollPreview(step);
				return { handled: true };
			}
			if (row >= this.questionRows.start && row < this.questionRows.end && this.questionMaxOffset > 0) {
				this.scrollQuestion(step);
				return { handled: true };
			}
			this.move(step);
			return { handled: true };
		}
		const item = this.itemAt(x, row);
		if (!item) return void 0;
		const index = this.items().findIndex((candidate) => sameItem(candidate, item));
		if (event.type === "move") return { handled: true };
		if (event.button !== "left" || event.type !== "press" && event.type !== "click") return;
		if (item.kind === "custom" || item.kind === "note") {
			const field = item.kind === "note" ? "note" : "answer";
			if (event.type === "press") {
				if (index >= 0) {
					this.row = index;
					this.tui.requestRender();
				}
				return {
					handled: true,
					focus: true
				};
			}
			if (this.editing !== field) {
				this.startEditing(field);
				return { handled: true };
			}
			const prefix = cellWidth(field === "note" ? CARD_INSET + NOTE_LABEL : this.writeInLead(index)) - INSET;
			return this.editingInput.handleMouse?.({
				...event,
				x: Math.max(0, x - prefix),
				y: 0
			}) ?? { handled: true };
		}
		if (index >= 0) this.row = index;
		if (event.type === "press") {
			if (index >= 0) {
				this.warning = void 0;
				this.tui.requestRender();
			}
			return {
				handled: true,
				focus: true
			};
		}
		this.activate(item);
		return { handled: true };
	}
	render(width) {
		this.hits.clear();
		this.captionCells = [];
		this.reviewMaxOffset = 0;
		this.footer = void 0;
		this.previewCells = void 0;
		this.previewMax = 0;
		this.questionRows = {
			start: 0,
			end: 0
		};
		this.questionMaxOffset = 0;
		if (width < MIN_WIDTH) return [clamp("Question: widen terminal; esc cancel", width)[0] ?? ""];
		const { theme, question } = this;
		const hasPreview = question?.options.some((option) => option.preview !== void 0) ?? false;
		const split = hasPreview && width >= tokens.splitFrom;
		const inset = 2 * captionFrameLayout.x;
		const inner = (split ? widthCap("split", width) : Math.min(width, tokens.prose + inset)) - inset;
		const budget = Math.max(9, Math.min(MAX_ROWS, this.tui.terminal.rows - RESERVED_ROWS) - captionFrameLayout.chrome);
		const rows = question ? this.questionBody(question, inner, budget, split, hasPreview) : this.reviewBody(inner, budget);
		rows.forEach((row, index) => {
			const shift = question ? INSET : 0;
			if (row.hit) this.hits.set(index, {
				item: row.hit,
				to: (row.hitTo ?? inner + shift) - shift
			});
		});
		const hover = this.hoverButton === void 0 ? void 0 : {
			x: this.hoverButton,
			y: 0
		};
		const actions = this.confirming ? void 0 : this.footerActions();
		const buttons = actions && buttonRow(actions.keys, inner, { hover })[0];
		const [top, gap, notice, footer, bottom] = captionFrame({
			width,
			title: question?.header.trim() || "Questions",
			caption: this.tabs.length > 1 ? (available) => steps(this.tabs.map((tab, index) => ({
				short: tab.kind === "question" ? String(tab.index + 1) : "Review",
				name: tab.kind === "question" ? this.headerOf(tab.index) : void 0,
				current: index === this.tab,
				hovered: index === this.hoverTab,
				done: tab.kind === "question" && isAnswered(this.drafts[tab.index]),
				hit: `step:${index}`
			})), Math.min(widthCap("split", width) - captionFrameLayout.reserved, available))?.spans : void 0,
			close: {
				confirming: this.confirming,
				hover: this.hoverClose
			},
			body: [],
			footer: buttons,
			notice: this.warning ? { spans: [span(this.warning, { role: "warning" })] } : void 0
		}).map((row) => paintLine(theme, row, width));
		this.captionCells = top?.cells ?? [];
		if (actions && footer) this.footer = {
			row: rows.length + 1,
			cells: footer.cells.map((cell) => ({
				...cell,
				start: cell.start - captionFrameLayout.x,
				end: cell.end - captionFrameLayout.x
			})),
			acts: actions.acts
		};
		const pad = question ? "" : " ".repeat(captionFrameLayout.x);
		const room = width - 2 * captionFrameLayout.x + (question ? captionFrameLayout.x : 0);
		const set = (text) => fitPainted(pad + fitPainted(text, room), width);
		return [
			fitPainted(top?.text ?? "", width),
			set(gap?.text ?? ""),
			...rows.map(({ text }) => set(text)),
			fitPainted(notice?.text ?? "", width),
			fitPainted(footer?.text ?? "", width),
			bottom?.text ?? ""
		];
	}
	headerOf(index) {
		return this.questions[index].header.trim() || "Question";
	}
	questionBody(question, inner, budget, split, hasPreview) {
		const { theme } = this;
		const choiceWidth = split ? Math.floor((inner - GAP.length) * tokens.splitRatio) : inner;
		const multiple = question.multiSelect === true;
		const dim = (line) => paintText(theme, line, { role: "dim" });
		const title = draw(theme, heading({
			title: question.question,
			label: this.tabs.length === 1 ? "Q1" : "",
			active: true
		}, inner + INSET), inner + INSET);
		const titleRoom = Math.max(2, Math.floor(budget / 4));
		this.questionMaxOffset = Math.max(0, title.length - titleRoom);
		this.questionOffset = Math.min(this.questionOffset, this.questionMaxOffset);
		const shown = title.slice(this.questionOffset, this.questionOffset + titleRoom);
		if (this.questionMaxOffset > 0) {
			const index = this.questionOffset < this.questionMaxOffset ? shown.length - 1 : 0;
			shown[index] = cutPainted(shown[index], inner + INSET - 2) + dim(" …");
		}
		this.questionRows = {
			start: 0,
			end: shown.length
		};
		const heading$1 = shown.map((text) => ({ text }));
		const stackedRows = hasPreview && !split ? Math.max(2, Math.min(7, Math.floor(budget / 3))) : 0;
		const room = Math.max(2, budget - heading$1.length - 1);
		const listRoom = Math.max(2, room - stackedRows);
		const items = this.items();
		const blocks = items.map((item, i) => this.itemBlock(item, i, choiceWidth, 1e400));
		const height = (blocks) => blocks.reduce((n, block) => n + block.length, 0);
		const withoutGaps = (blocks) => blocks.map((block) => block[0]?.text === "" ? block.slice(1) : block);
		let compact = blocks;
		if (multiple && height(compact) > listRoom) compact = withoutGaps(compact);
		if (height(compact) > listRoom) {
			compact = items.map((item, i) => this.itemBlock(item, i, choiceWidth, 2));
			if (multiple && height(compact) > listRoom) compact = withoutGaps(compact);
		}
		let list = this.window(compact, listRoom);
		if (hasPreview) {
			const left = split ? choiceWidth + GAP.length : 0;
			const preview = this.preview(inner - left, split ? room : stackedRows);
			const top = heading$1.length + 1 + (split ? 0 : list.length);
			this.previewCells = {
				top,
				bottom: top + preview.length,
				left
			};
			if (split) list = Array.from({ length: Math.max(list.length, preview.length) }, (_, i) => {
				const row = list[i];
				return {
					...row,
					text: fitPainted(row?.text ?? "", choiceWidth + INSET) + GAP + (preview[i] ?? "")
				};
			});
			else list.push(...preview.map((text) => ({ text: CARD_INSET + text })));
		}
		return sectionsOf({ text: "" }, heading$1, list);
	}
	reviewBody(width, room) {
		const blocks = this.questions.map((_, index) => {
			const item = {
				kind: "review",
				question: index
			};
			const answers = this.valuesOf(index);
			const hasWriteIn = Boolean(this.drafts[index].text.trim());
			return draw(this.theme, summary({
				label: String(index + 1),
				title: this.headerOf(index),
				values: answers.map((text, i) => ({
					text,
					literal: hasWriteIn && i === answers.length - 1
				})),
				note: this.notes[index]?.trim(),
				hovered: index === this.hoverReview
			}, width), width).map((line) => target(line, item));
		});
		const spaced = sectionsOf({ text: "" }, ...blocks);
		if (spaced.length <= room) return spaced;
		const compact = blocks.flat();
		if (compact.length <= room) return compact;
		const limit = room - 1;
		this.reviewMaxOffset = spaced.length - limit;
		this.reviewOffset = Math.min(this.reviewOffset, this.reviewMaxOffset);
		const end = this.reviewOffset + limit;
		return [...spaced.slice(this.reviewOffset, end), { text: paintText(this.theme, `Lines ${this.reviewOffset + 1}–${end} of ${spaced.length}`, { role: "dim" }) }];
	}
	/** The footer's buttons, and what the one with `hit` `key:<n>` does. */
	footerActions() {
		const acts = [];
		const action = (label, hotkey, input, isLit = false) => {
			acts.push(() => this.handleInput(input));
			return {
				label,
				hotkey,
				isLit,
				hit: `key:${acts.length - 1}`
			};
		};
		const enter = (label, isLit = false) => action(label, "enter", "\r", isLit);
		const done = (keys) => ({
			keys,
			acts
		});
		if (this.editing) return done([enter("Save", true), action("Back", "esc", "\x1B")]);
		if (this.tabKind.kind === "review") {
			const ready = this.drafts.every(isAnswered);
			return done([enter(ready ? "Send" : "Answer first", ready)]);
		}
		const option = this.items()[this.row]?.kind === "option";
		const lead = this.question?.multiSelect ? action(this.tabs.length === 1 ? "Send" : "Continue", "s", "s", isAnswered(this.drafts[this.questionIndex])) : enter(option ? "Choose" : "Edit", true);
		const keys = [action("Note", "n", "n")];
		if (this.previewMax > 0) keys.push({
			hotkey: "⇧↑↓",
			label: "preview"
		});
		if (this.questionMaxOffset > 0) keys.push({
			hotkey: "⇧←→",
			label: "question"
		});
		if (this.question?.multiSelect && option) keys.push({
			hotkey: "space",
			label: "toggle"
		});
		return done([lead, ...keys]);
	}
	letter(i) {
		return String.fromCharCode(65 + i);
	}
	writeInLead(i) {
		return `${GAP}${this.letter(i)} › `;
	}
	itemBlock(item, i, width, detailLines) {
		const { theme, question } = this;
		const dim = (line) => paintText(theme, line, { role: "dim" });
		const at = i === this.row;
		const draft = this.drafts[this.questionIndex ?? 0];
		const answered = isAnswered(draft);
		const choice$1 = (key, text, chosen, literal = false, detail) => draw(theme, choice({
			key,
			text,
			chosen,
			active: true,
			focused: at,
			hovered: i === this.hoverRow,
			literal,
			multiple: question?.multiSelect,
			detail,
			detailLines
		}, width + INSET), width + INSET).map((line) => target(line, item));
		switch (item.kind) {
			case "option": {
				const option = question.options[item.index];
				return choice$1(this.letter(item.index), option.label, draft.picked.includes(item.index), false, option.description);
			}
			case "custom":
				if (this.editing === "answer") {
					const lead = this.writeInLead(i);
					const field = this.input.render(width + INSET - cellWidth(lead))[0] ?? "";
					return [{
						...target(dim(lead) + field, item),
						hitTo: width + INSET
					}];
				}
				return choice$1(this.letter(i), draft.text.trim() || "Write your own answer", Boolean(draft.text.trim()), true);
			case "note": {
				const note$1 = this.notes[this.questionIndex ?? 0]?.trim() ?? "";
				return this.editing === "note" ? [{
					...target(dim(CARD_INSET + NOTE_LABEL) + (this.noteInput.render(width - cellWidth("Note: "))[0] ?? ""), item),
					hitTo: width + INSET
				}] : draw(theme, note({
					value: note$1,
					active: true,
					answered,
					max: 3,
					focused: at,
					hovered: i === this.hoverRow
				}, width + INSET), width + INSET).map((line) => target(line, item));
			}
		}
	}
	/** Keep choices whole when possible and leave the focused block in view. */
	window(blocks, room) {
		const all = blocks.flat();
		if (all.length <= room) return all;
		const limit = Math.max(1, room - 1);
		let start = 0;
		let end = 0;
		let used = 0;
		while (end <= this.row) {
			start = end;
			const first = blocks[end++];
			used = first.length - (first[0]?.text === "" ? 1 : 0);
			while (end < blocks.length && used + blocks[end].length <= limit) used += blocks[end++].length;
		}
		const page = blocks.slice(start, end).flat();
		if (page[0]?.text === "") page.shift();
		const rows = page.slice(0, limit);
		if (used > limit) {
			const last = rows.at(-1);
			rows[rows.length - 1] = {
				...last,
				text: last.text + paintText(this.theme, " …", { role: "dim" })
			};
		}
		while (rows.length < limit) rows.push({ text: "" });
		const above = start ? `↑ ${start} above` : "";
		const below = end < blocks.length ? `↓ ${blocks.length - end} below` : "";
		rows.push({ text: paintText(this.theme, CARD_INSET + ([above, below].filter(Boolean).join(GAP) || "…"), { role: "dim" }) });
		return rows;
	}
	preview(width, room) {
		const shown = this.hoverRow ?? this.row;
		const option = this.question?.options[shown];
		if (this.previewFor !== shown) {
			this.previewFor = shown;
			this.previewOffset = 0;
		}
		const content = option?.preview ? markdownLines(this.theme, option.preview, width) : [paintText(this.theme, "No preview available", { role: "dim" })];
		const limit = Math.max(1, room - 1);
		const count = Math.min(limit, Math.max(1, ...this.question?.options.map(({ preview }) => preview ? markdownLines(this.theme, preview, width).length : 1) ?? []));
		this.previewMax = Math.max(0, content.length - count);
		this.previewOffset = Math.min(this.previewOffset, this.previewMax);
		const end = Math.min(content.length, this.previewOffset + count);
		const suffix = this.previewMax ? `  ${this.previewOffset + 1}–${end} of ${content.length}` : "";
		return [
			paintText(this.theme, `Preview${suffix}`, {
				role: "dim",
				bold: true
			}),
			...content.slice(this.previewOffset, end),
			...Array(count - (end - this.previewOffset)).fill("")
		];
	}
};
/** Two items are the same target when they name the same thing. */
function sameItem(left, right) {
	if (left.kind !== right.kind) return false;
	if (left.kind === "option" && right.kind === "option") return left.index === right.index;
	return true;
}

// src/pi/types.ts
/**
* The questionnaire's contract with the model: what a call may contain and
* what comes back. Kept apart from the dialog so the limits the model is told
* about in `questions.ts` and the ones enforced here are the same numbers.
*/
const TOOL_NAME = "ask_user_question";
/** Limits, also stated to the model in the tool schema. */
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;
const HEADER_MAX = 16;
const LABEL_MAX = 60;
/** The always-present row for an answer the options do not cover. */
const TYPE_SOMETHING = "Type something.";
/**
* Every reason a call cannot be rendered, in one message.
*
* All findings are reported at once: a model that has to fix a header and a
* label should not need two round trips to hear about both.
*/
function validateQuestions(questions) {
	const problems = [];
	if (questions.length === 0) problems.push("ask at least one question");
	if (questions.length > 4) problems.push(`ask at most ${4} questions`);
	questions.forEach((question, index) => {
		const at = `question ${index + 1}`;
		if (question.header.length > 16) problems.push(`${at}: header is ${question.header.length} characters, the limit is ${16}`);
		if (question.options.length < 2 || question.options.length > 4) problems.push(`${at}: give ${2}-${4} options`);
		question.options.forEach((option, optionIndex) => {
			if (option.label.length > 60) problems.push(`${at}, option ${optionIndex + 1}: label is ${option.label.length} characters, the limit is ${60}`);
			if (option.preview !== void 0 && question.multiSelect) problems.push(`${at}, option ${optionIndex + 1}: previews need a single-select question`);
		});
	});
	return problems.length > 0 ? problems.join("; ") : void 0;
}

// src/pi.ts
/**
* `ask_user_question`: put one to four structured questions to the user and
* wait for the answers, so a decision the model cannot make alone comes back
* as data rather than a conversation.
*
* The dialog lives in `./dialog.ts`. This file owns the contract: the schema the
* model fills in, with its limits, and the non-TUI path.
*
* Sequential on purpose. Two questionnaires in the editor slot would replace
* each other, and pi resolves that by running this tool's calls one at a time.
*/
const DESCRIPTION = `Ask the user multiple-choice questions and wait for the answers. Use it when you can't proceed without the user's decision, with every question in one call. Each question already gets a "Type something." row and Esc, so don't write "Other" or "Type something." options. Put a recommended option first, its label ending in "(Recommended)". Give options a \`preview\` only to compare concrete artifacts such as mockups, code, diagrams or configs.`;
const OptionSchema = Type.Object({
	label: Type.String({
		maxLength: 60,
		description: "1-5 words; the row the user picks."
	}),
	description: Type.Optional(Type.String({ description: "One line of context under the label." })),
	preview: Type.Optional(Type.String({ description: "Markdown shown while this option is highlighted." }))
});
const QuestionSchema = Type.Object({
	question: Type.String({ description: "The complete question, ending in a question mark." }),
	header: Type.String({
		maxLength: 16,
		description: "Short chip naming the question, e.g. \"Storage\"."
	}),
	options: Type.Array(OptionSchema, {
		minItems: 2,
		maxItems: 4
	}),
	multiSelect: Type.Optional(Type.Boolean({ description: "Let the user pick several options instead of one." }))
});
/** One answer per line, with its note beneath, as every message about answers reads. */
function answerLines(answers) {
	const lines = [];
	for (const answer of answers) {
		lines.push(`- ${answer.header}: ${answer.values.join(", ")}`);
		if (answer.note) lines.push(`  note: ${answer.note}`);
	}
	return lines;
}
/** What the model sees: the answers as a list it can act on, or the refusal. */
function formatResult(result) {
	if (result.cancelled) return "The user cancelled the questions without answering. Do not treat this as a decision.";
	return ["The user answered:", ...answerLines(result.answers)].join("\n");
}
/**
* The questionnaire a call asked for; elsewhere a sequential walk of the host's
* own dialogs. `previous` pre-selects its answers in the terminal dialog only,
* which is where re-answering happens.
*/
async function askQuestions(ctx, questions, signal, previous) {
	if (ctx.mode !== "tui") return askSequentially(ctx, questions);
	const cancelled = {
		answers: [],
		cancelled: true
	};
	if (signal?.aborted) return cancelled;
	return ctx.ui.custom((tui, theme, _keys, done) => {
		const abort = () => done(cancelled);
		signal?.addEventListener("abort", abort, { once: true });
		const dispose = () => signal?.removeEventListener("abort", abort);
		const dialog = new QuestionsDialog(tui, theme, questions, (result) => {
			dispose();
			done(result);
		}, previous);
		if (signal?.aborted) queueMicrotask(abort);
		return Object.assign(dialog, { dispose });
	}, { overlay: false });
}
/**
* RPC, JSON and print hosts get the same answers through their own prompt
* primitives. A multi-select question is asked repeatedly until the user says
* Done, which is the only shape those dialogs offer.
*/
async function askSequentially(ctx, questions) {
	const answers = [];
	for (const question of questions) {
		const values = question.multiSelect ? await askMultiSelect(ctx, question) : await askSingle(ctx, question);
		if (values === void 0) return {
			answers: [],
			cancelled: true
		};
		if (values.length > 0) answers.push({
			header: question.header,
			question: question.question,
			values
		});
	}
	return {
		answers,
		cancelled: false
	};
}
const prompt = (question) => `${question.header}: ${question.question}`;
async function askSingle(ctx, question) {
	const choice = await ctx.ui.select(prompt(question), [...question.options.map((option) => option.label), TYPE_SOMETHING]);
	if (choice === void 0) return void 0;
	if (choice !== "Type something.") return [choice];
	const text = await ctx.ui.input(prompt(question), "Your answer");
	return text?.trim() ? [text.trim()] : [];
}
async function askMultiSelect(ctx, question) {
	const picked = /* @__PURE__ */ new Set();
	for (;;) {
		const entries = question.options.map((option) => picked.has(option.label) ? `✓ ${option.label}` : option.label);
		if (picked.size > 0) entries.push("Done");
		entries.push(TYPE_SOMETHING);
		const choice = await ctx.ui.select(prompt(question), entries);
		if (choice === void 0) return void 0;
		if (choice === "Done") return [...picked];
		if (choice === "Type something.") {
			const text = await ctx.ui.input(prompt(question), "Your answer");
			if (text?.trim()) picked.add(text.trim());
			continue;
		}
		if (picked.has(choice)) picked.delete(choice);
		else picked.add(choice);
	}
}
function pi_default(pi) {
	pi.registerTool({
		name: TOOL_NAME,
		label: "Ask",
		description: DESCRIPTION,
		promptSnippet: "Ask the user multiple-choice questions.",
		parameters: Type.Object({ questions: Type.Array(QuestionSchema, {
			minItems: 1,
			maxItems: 4
		}) }),
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const invalid = validateQuestions(params.questions);
			if (invalid) throw new Error(`ask_user_question: ${invalid}`);
			const result = await askQuestions(ctx, params.questions, signal);
			return {
				content: [{
					type: "text",
					text: formatResult(result)
				}],
				details: result
			};
		}
	});
}

export { answerLines, askQuestions, pi_default as default, formatResult };