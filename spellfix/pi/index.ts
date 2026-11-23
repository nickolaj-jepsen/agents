import { spawn } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { contentText } from "@earendil-works/pi-ai";

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
/** Spaces that bring `spans` to `width` cells, as one unstyled span; none when they are wider. */
const padding = (spans, width) => {
	const room = width - spansWidth(spans);
	return room > 0 ? [span(" ".repeat(room))] : [];
};
/** What a window's marker says of the rows past its edge: `↓ 3 more`. */
const moreText = (glyph, count) => `${glyph} ${count} more`;
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

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP = " ".repeat(tokens.gutter);
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
* The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
* before a row of its own, such as an input, to line it up with the card's.
*/
const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);

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
/**
* Every row of a footer, as `buttonRow` draws one: the view model decides what is lit (one) and
* what goes quiet while Close asks (`confirming`). A row that wraps goes on under itself; the
* next row starts below it.
* @param model `rows`, and `lead` before the first entry.
*/
function buttonRows(model, width) {
	return settle(model.rows, model.confirming).flatMap((row, i) => buttonRow(row, width, {
		wrap: model.wrap,
		lead: i === 0 ? [...model.lead ?? []] : [],
		hover: model.hover
	}));
}

// ../../lib/kits/frame/src/contract.ts
/** The control a close action is, as a drawn span's `hit`. */
const closeHit = (action) => `frame:${action}`;
/** The close action a `hit` names. */
const closeOf = (hit) => hit === "frame:close" || hit === "frame:discard" || hit === "frame:keep" ? hit.slice(6) : void 0;
/** The capability each gated field needs. The rest of the model is for every surface. */
const frameNeeds = {
	width: "cells",
	hostTitle: "cells:false",
	head: "cells:false",
	actions: "cells:false"
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
/** The control at cell `x` of a painted row. */
const cellAt = (cells, x) => cells?.find((cell) => x >= cell.start && x < cell.end);

// ../../lib/kits/sheet/src/contract.ts
/** The sheet's contract: its model and what each drawing is given. No host imports. */
/** Where the sheet puts its body, and the rows it takes besides. */
const sheetLayout = {
	/**
	* Cells and rows from the sheet's corner to the body's. A body's rows bring their own column
	* for a pointer (`CARD_INSET`), as a card's do, so that column is the sheet's inset.
	*/
	x: 2,
	y: 2,
	/** Rows it takes besides its body, its notice and its buttons: its edges and a blank one. */
	chrome: 3
};
/** The rows of `sheetLayout.chrome` a sheet takes: one fewer where it has no bottom edge. */
const sheetChrome = (foot = "edge") => sheetLayout.chrome - (foot === "none" ? 1 : 0);
/** The cells a body row has in a sheet `width` cells wide. */
const sheetRoom = (width) => Math.max(0, width - 2 * sheetLayout.x);
/** The capability each gated field needs: a frame's, and the cells `foot` is set in. */
const sheetNeeds = {
	...frameNeeds,
	foot: "cells"
};
const sheetFields = modelFields()([...frameFields.filter((k) => k !== "end"), "foot"]);

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

// ../../lib/kits/sheet/src/terminal.ts
/** The sheet as styled lines: the one drawing both terminals paint. */
const EDGE = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	side: "│"
};
const edge = (text) => span(text, { role: "border" });
/**
* A panel laid over the screen, closed on every side so what is under it stays apart: the
* title and Close in its top edge, as a captioned frame has them, the body set in, and the
* buttons above its bottom edge. With no `foot` its sides run down to a rule the host draws
* under it, so it reads as standing behind what that rule starts. A row that is one control
* keeps to its words: the edges beside it are not part of it.
*/
function sheet(s) {
	const { width } = s;
	const room = sheetRoom(width);
	const inset = span(" ".repeat(sheetLayout.x - 1));
	const row = (l) => {
		if (l?.slot?.kind === "input") {
			const used = spansWidth(l.slot.lead) + l.slot.width + spansWidth(l.slot.tail ?? []);
			return {
				spans: [],
				slot: {
					...l.slot,
					lead: [
						edge(EDGE.side),
						inset,
						...l.slot.lead
					],
					hang: [
						edge(EDGE.side),
						inset,
						...l.slot.hang ?? [span(" ".repeat(spansWidth(l.slot.lead)))]
					],
					tail: [
						...l.slot.tail ?? [],
						span(" ".repeat(Math.max(0, room - used))),
						inset,
						edge(EDGE.side)
					]
				}
			};
		}
		const spans = truncateSpans(l?.hit === void 0 ? l?.spans ?? [] : hitSpans(l.spans, l.hit), room);
		return line([
			edge(EDGE.side),
			inset,
			...spans,
			...padding(spans, room),
			inset,
			edge(EDGE.side)
		]);
	};
	const top = frameTop({
		...s,
		width: Math.max(0, width - 2)
	});
	return [
		line([
			edge(EDGE.topLeft),
			...top.spans,
			edge(EDGE.topRight)
		]),
		row(void 0),
		...s.body.map(row),
		...s.notice ? [row(s.notice)] : [],
		...(s.footer ?? []).map(row),
		...s.foot === "none" ? [] : [line([edge(EDGE.bottomLeft + "─".repeat(Math.max(0, width - 2)) + EDGE.bottomRight)])]
	];
}

// src/lib/spellfix.ts
const CHECK = `You check spelling in a draft message a developer is about to send to a coding assistant. The draft may be in English or Danish, or mix both; never translate.

A spell checker flagged the words marked ⟦like this⟧. Give each distinct flagged word one line:
<word text="teh" verdict="fix">the</word> when it is a typo: the word they meant, in the same language and casing.
<word text="Jepsen" verdict="correct"/> when it is a real word, name, product or technical term spelled as intended.
<word text="xqzt" verdict="unsure"/> when you can't tell.

Then give one line per typo outside the marked words, which the spell checker can't see: a word joined to another by a slash ("dense/recieve"), or a correctly spelled word that is clearly not the one meant ("form" for "from"). "word" is the typo exactly as written in the draft, and nth counts that word's occurrences in the draft from 1:
<extra word="recieve" nth="1">receive</extra>

Rules:
- Spelling only: never grammar, style, punctuation or wording.
- An acronym keeps all capitals (API, URL, JSON, CLI): never title case.
- Never touch code, file paths, URLs, identifiers, command names, flags, @mentions, /slash-commands, or anything inside backticks.
- Reply with these lines and nothing else.`;
const SKIPPED_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD = /^\p{L}+(?:['’]\p{L}+)*$/u;
/** hunspell's arguments after the executable: `-l` lists rejected words, `-a` is pipe mode. */
function hunspellArgs(mode, dictionaries, personal) {
	return [
		mode,
		"-d",
		dictionaries,
		...personal ? ["-p", personal] : []
	];
}
/** `text` with code blocks and spans blanked out, offsets kept. */
function maskCode(text) {
	return text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`?/g, (m) => " ".repeat(m.length));
}
/** The words to check, by the built-in spellcheck's documented rules: code-like text is left out. */
function candidates(text) {
	const out = [];
	for (const tok of maskCode(text).matchAll(/\S+/g)) {
		if (/^[/@-]|[/\\_~\d]|:\/\/|\.\p{L}/u.test(tok[0])) continue;
		for (const m of tok[0].matchAll(/\p{L}+(?:['’]\p{L}+)*/gu)) {
			const word = m[0];
			if (word.length < 2 || /.\p{Lu}/u.test(word) || SKIPPED_SCRIPTS.test(word)) continue;
			const start = tok.index + m.index;
			out.push({
				word,
				start,
				end: start + word.length
			});
		}
	}
	return out;
}
/** hunspell `-a` input adding `words` to the personal dictionary (`*`) and saving it (`#`). */
function addInput(words) {
	return `${words.map((w) => `*${w}\n`).join("")}#\n`;
}
/** The personal dictionary `text` without `words`; hunspell itself can't remove one. */
function withoutWords(text, words) {
	return text.split("\n").filter((l) => !words.includes(l.split("/")[0])).join("\n");
}
/** The cased spellings worth trying for an all-lowercase `word`, capitalised first; none for any other word. */
function caseVariants(word) {
	if (word !== word.toLowerCase() || word === word.toUpperCase()) return [];
	const [first = "", ...rest] = word;
	return [`${first.toUpperCase()}${rest.join("")}`, word.toUpperCase()];
}
/**
* Turns a `correct` verdict on an all-lowercase word into a fix when one of its `caseVariants`
* is in `accepted` (the variants hunspell passes): `claude` or `i'm` is a casing slip, not a
* word for the personal dictionary. A model fix that differs only in case already stays a fix.
*/
function recase(verdicts, accepted) {
	for (const [word, v] of verdicts) {
		if (v.kind !== "correct") continue;
		const cased = caseVariants(word).find((c) => accepted.has(c));
		if (cased) verdicts.set(word, {
			kind: "fix",
			word: cased
		});
	}
}
/** The words `verdicts` calls correct, for the personal dictionary, minus those `skip` holds back. */
function autoAdds(verdicts, skip) {
	return [...verdicts].filter(([word, v]) => v.kind === "correct" && !skip(word)).map(([w]) => w);
}
/** `text` with every flagged word wrapped for the model, as CHECK describes. */
function mark(text, flagged) {
	let marked = text;
	for (const m of [...flagged].sort((a, b) => b.start - a.start)) marked = `${marked.slice(0, m.start)}⟦${m.word}⟧${marked.slice(m.end)}`;
	return marked;
}
/** The user message for CHECK. */
function checkPrompt(text, flagged) {
	return `<draft>\n${mark(text, flagged)}\n</draft>`;
}
/** Enough output tokens for a line per distinct flagged word plus a few extras. */
function replyBudget(distinct) {
	return Math.min(4096, 48 * (distinct + 10));
}
/**
* A reply to CHECK for `text`: a verdict per flagged word in `distinct`, and the typos it found
* outside them, still by word and occurrence.
*/
function parseReply(reply, text, distinct) {
	const verdicts = /* @__PURE__ */ new Map();
	const found = [];
	for (const m of reply.matchAll(/<word text="([^"]+)" verdict="(fix|correct|unsure)"\s*(?:\/>|>([^<]*)<\/word>)/g)) {
		const [, word = "", kind, fix = ""] = m;
		if (!distinct.has(word)) {
			if (kind === "fix" && locate(text, word, 2) === void 0) found.push({
				word,
				nth: 1,
				fix
			});
			continue;
		}
		const isFix = kind === "fix" && fix.trim() !== "" && fix.trim() !== word;
		verdicts.set(word, isFix ? {
			kind: "fix",
			word: fix.trim()
		} : kind === "correct" ? { kind } : { kind: "unsure" });
	}
	for (const m of reply.matchAll(/<extra word="([^"]+)" nth="(\d+)">([^<]+)<\/extra>/g)) {
		const [, word = "", nth = "", fix = ""] = m;
		found.push({
			word,
			nth: Number(nth),
			fix
		});
	}
	return {
		verdicts,
		found
	};
}
/**
* `word`'s nth whole-word occurrence in `text`, counting code too, as the model does; undefined
* when that lands in code, a URL, a command, a mention or a flag. Unlike `candidates`, a word in
* a slashed token (`dense/consice`) counts.
*/
function locate(text, word, nth) {
	if (!WORD.test(word) || nth < 1) return void 0;
	const at = [...text.matchAll(new RegExp(`(?<![\\p{L}'’])${word}(?![\\p{L}'’])`, "gu"))][nth - 1];
	if (at === void 0) return void 0;
	const end = at.index + word.length;
	const tok = [...maskCode(text).matchAll(/\S+/g)].find((t) => t.index <= at.index && end <= t.index + t[0].length);
	if (!tok || /^[/@-]|:\/\//.test(tok[0])) return void 0;
	return {
		word,
		start: at.index,
		end
	};
}
/**
* `found` placed in `text`, the draft the model saw: one extra per offset, none on a flagged
* word, and none that would leave the word as it is.
*/
function placeExtras(text, found, flagged) {
	const extras = [];
	for (const { word, nth, fix } of found) {
		const at = locate(text, word, nth);
		if (!at || fix.trim() === word || flagged.some((f) => f.start === at.start)) continue;
		if (!extras.some((x) => x.start === at.start)) extras.push({
			...at,
			fix: fix.trim()
		});
	}
	return extras;
}
/** `m` past an edit that replaced start..end with `delta` more characters; undefined when the edit touched it. */
function shift(m, start, end, delta) {
	if (m.end <= start) return m;
	if (m.start >= end) return {
		...m,
		start: m.start + delta,
		end: m.end + delta
	};
}
/** `misses` with the `extras` that overlap none of them, in draft order. */
function withExtras(misses, extras) {
	const found = [...misses];
	for (const x of extras) if (!found.some((m) => m.start < x.end && x.start < m.end)) found.push(x);
	return found.sort((a, b) => a.start - b.start);
}
/**
* `text` with every splice applied, the offsets all taken from `text`. Where two overlap the
* one that starts first wins and the other is dropped, and the surviving ones are then applied
* from the last offset to the first so each still points where it did.
*/
function applyEdits(text, splices) {
	const kept = [];
	let end = -1;
	for (const s of [...splices].sort((a, b) => a.start - b.start)) {
		if (s.start < end) continue;
		kept.push(s);
		end = s.end;
	}
	let out = text;
	for (const s of kept.reverse()) out = `${out.slice(0, s.start)}${s.text}${out.slice(s.end)}`;
	return out;
}
/**
* `before` and `after` compared by words, as runs in reading order: words reordered rather than
* changed show as a removal and an addition, and spacing is normalised to one space between
* words.
*/
function wordDiff(before, after) {
	const left = before.trim().split(/\s+/).filter(Boolean);
	const right = after.trim().split(/\s+/).filter(Boolean);
	const lengths = Array.from({ length: left.length + 1 }, () => Array.from({ length: right.length + 1 }, () => 0));
	for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
	const runs = [];
	const push = (text, kind) => {
		const last = runs[runs.length - 1];
		if (last?.kind === kind) last.text = `${last.text} ${text}`;
		else runs.push({
			text,
			kind
		});
	};
	let i = 0;
	let j = 0;
	while (i < left.length && j < right.length) if (left[i] === right[j]) {
		push(left[i], "same");
		i++;
		j++;
	} else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
		push(left[i], "removed");
		i++;
	} else {
		push(right[j], "added");
		j++;
	}
	for (; i < left.length; i++) push(left[i], "removed");
	for (; j < right.length; j++) push(right[j], "added");
	return runs;
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
	return (isWrapped ? clamp(text, width) : clamp(text, width, {
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
	return clamp(text, width).map((row) => line([{
		text: row,
		role: "dim"
	}]));
}

// src/lib/review.ts
/** Lines one finding takes: its kind and count, then the draft with the fix in place. */
const FINDING_LINES = 2;
/** Findings one review shows at most, however tall the terminal. */
const MAX_FINDINGS = 9;
/** Draft characters shown on either side of the word. */
const CONTEXT = 28;
/** Cells the window's markers and the progress line are set in by, under a finding's text. */
const HANG = cellWidth(tokens.glyph.pointer) + 1;
/** What the review's controls press, by the hit a span or a Button carries. */
const REVIEW_HIT = {
	apply: "review:apply",
	applyAll: "review:apply-all",
	toggle: "review:toggle",
	keep: "review:keep",
	undo: "review:undo"
};
/** The hit that focuses finding `i`. */
const rowHit = (i) => `review:row:${i}`;
/** The hit that toggles finding `i`, on its mark. */
const markHit = (i) => `review:mark:${i}`;
/** The finding a row hit names, or undefined for another hit. */
function rowOfHit(hit) {
	const m = /^review:row:(\d+)$/.exec(hit ?? "");
	return m ? Number(m[1]) : void 0;
}
/** The finding a mark hit names, or undefined for another hit. */
function markOfHit(hit) {
	const m = /^review:mark:(\d+)$/.exec(hit ?? "");
	return m ? Number(m[1]) : void 0;
}
/**
* The row the window starts on: as it was, moved only as far as keeping finding `index` in view
* needs. A window is whole findings, so it never cuts a finding in two.
*/
function reviewWindow(index, count, height, previous = 0) {
	const rows = Math.max(1, Math.min(9, height));
	const max = Math.max(0, count - rows);
	let top = Math.max(0, Math.min(max, previous));
	if (index - top >= rows) top = index - rows + 1;
	if (index < top) top = index;
	top = Math.max(0, Math.min(max, top));
	return {
		top,
		above: top,
		below: Math.max(0, count - top - rows),
		rows
	};
}
/**
* Rows of the terminal the sheet leaves above it, so what it stands under stays in sight, and the
* rows it may take: the terminal less that one and the prompt and footer under it.
*/
const ABOVE = 1;
const rowsAbovePrompt = (rows, below) => Math.max(8, rows - 1 - below);
/**
* Findings the window shows: the room the sheet may take less the sheet's own rows (one fewer with
* no bottom edge), its footer, its notice when there is one, and the window's marker and progress.
*/
function reviewHeight(rows, { footer, notice: hasNotice, foot = "edge" }) {
	const taken = sheetChrome(foot) + Math.max(1, footer) + (hasNotice ? 1 : 0) + 2;
	return Math.max(3, Math.min(9, Math.floor((Math.max(1, rows) - taken) / 2)));
}
/** The sheet's width: a dialog's cap, with a cell of margin on either side of the terminal. */
const reviewWidth = (columns) => Math.max(1, Math.min(columns - 2, widthCap("dialog", columns)));
/** The title rule's caption: the plugin, then what the review has and what is checked. */
function reviewCaption(view) {
	const name = span("spellfix", {
		role: "accent",
		bold: true
	});
	const count = view.findings.length;
	if (count === 0) return [name];
	const checked = view.findings.filter((f) => f.checked && f.fix !== null).length;
	return [name, span(` · ${checked} to apply · ${count} found`, { role: "dim" })];
}
/**
* What the review says besides its findings: what it is waiting on, whether the model failed,
* and the words this answer added. Undefined when it has nothing to say, so the row is saved.
*/
function reviewNotice(view, width) {
	const notes = [];
	if (view.isChecking) notes.push("asking the model…");
	if (view.isPendingAll) notes.push("waiting for the model…");
	if (view.aiError) notes.push(`model: ${view.aiError}`);
	if (view.added.length) notes.push(`added: ${view.added.join(", ")}`);
	if (notes.length === 0) return void 0;
	return notice({
		text: notes.join(" · "),
		status: "dim",
		width
	})[0];
}
/** What the review offers: the action on the focused finding first, the keys beside it. */
function reviewButtons(view, hover) {
	const focused = view.findings[view.index];
	const checked = view.findings.some((f) => f.checked && f.fix !== null);
	const buttons = [];
	if (view.findings.length > 0) {
		buttons.push({
			label: "Apply",
			hotkey: "enter",
			hit: REVIEW_HIT.apply,
			isLit: true,
			essential: true
		});
		if (checked) buttons.push({
			label: "Apply all",
			hotkey: "a",
			hit: REVIEW_HIT.applyAll,
			essential: true
		});
		buttons.push({
			label: "Toggle",
			hotkey: "space",
			hit: REVIEW_HIT.toggle,
			essential: true
		});
		if (focused && focused.kind !== "real word") buttons.push({
			label: "Keep word",
			hotkey: "d",
			hit: REVIEW_HIT.keep
		});
		if (view.added.length > 0) buttons.push({
			label: "Undo add",
			hotkey: "u",
			hit: REVIEW_HIT.undo
		});
	}
	buttons.push({
		label: "close",
		hotkey: "esc"
	});
	return [buttons.map((b) => b.hit !== void 0 && b.hit === hover ? {
		...b,
		hovered: true
	} : b)];
}
/** The findings the window shows, then how many it hides, then where the keyboard is. */
function reviewBody(view, width) {
	if (view.findings.length === 0) {
		const words = view.isChecking ? "Checking for misspellings…" : "No misspellings left.";
		return view.isChecking ? notice({
			text: words,
			status: "pending",
			width
		}) : emptyState({
			text: words,
			width
		});
	}
	const { top, above, below, rows } = reviewWindow(view.index, view.findings.length, view.height, view.top);
	const body = [];
	for (let i = top; i < Math.min(view.findings.length, top + rows); i++) body.push(...findingLines(view, i, width));
	if (above || below) body.push(windowLine(above, below));
	body.push(line([span(" ".repeat(HANG)), span(`${view.index + 1}/${view.findings.length}`, { role: "dim" })]));
	return body;
}
/** A finding's two lines: its kind and count, then the draft with the fix in place. */
function findingLines(view, index, width) {
	const finding = view.findings[index];
	const focused = index === view.index;
	const row = rowHit(index);
	const isHovered = view.hover === row || view.hover === markHit(index);
	const pointer = focused ? span(tokens.glyph.pointer, {
		role: "text",
		bold: true,
		hit: row
	}) : span(" ".repeat(cellWidth(tokens.glyph.pointer)), { hit: row });
	const mark = {
		text: finding.checked ? tokens.glyph.multi.on : tokens.glyph.multi.off,
		...finding.checked ? {
			role: "accent",
			bold: true
		} : { role: "dim" },
		hit: markHit(index)
	};
	const label = {
		...controlStyle({
			highlighted: focused || isHovered,
			rest: "dim"
		}),
		hit: row
	};
	const count = finding.offsets.length > 1 ? [span(` ×${finding.offsets.length}`, {
		role: "dim",
		hit: row
	})] : [];
	return [line([
		pointer,
		span(" ", { hit: row }),
		mark,
		span(" ", { hit: row }),
		span(`[${finding.kind}]`, label),
		...count
	]), line(truncateSpans(diffSpans(view, finding, row), width))];
}
/** The draft around the finding's first occurrence, with the word and its replacement set apart. */
function diffSpans(view, finding, hit) {
	const at = finding.offsets[0];
	const lead = view.text.slice(Math.max(0, at.start - CONTEXT), at.start).replace(/\s+/g, " ");
	const tail = view.text.slice(at.end, Math.min(view.text.length, at.end + CONTEXT)).replace(/\s+/g, " ");
	const change = finding.fix === null ? [span(finding.word, {
		role: "warning",
		underline: true,
		hit
	})] : wordDiff(finding.word, finding.fix).flatMap((run, i) => [...i > 0 ? [span(" ", { hit })] : [], span(run.text, {
		...run.kind === "removed" ? { role: "error" } : run.kind === "added" ? { role: "success" } : {},
		hit
	})]);
	return [
		span(" ".repeat(HANG), { hit }),
		...at.start > CONTEXT ? [span("…", {
			role: "dim",
			hit
		})] : [],
		span(lead, {
			role: "dim",
			hit
		}),
		...change,
		span(tail, {
			role: "dim",
			hit
		}),
		...at.end + CONTEXT < view.text.length ? [span("…", {
			role: "dim",
			hit
		})] : []
	];
}
/** The kit's window marker, counting whole findings past either edge. */
function windowLine(above, below) {
	const parts = [];
	if (above) parts.push(moreText(tokens.glyph.more.up, above));
	if (below) parts.push(moreText(tokens.glyph.more.down, below));
	return line([span(" ".repeat(HANG)), span(parts.join(" ".repeat(tokens.gutter)), { role: "dim" })]);
}
/**
* The findings from hunspell's misses and the model's extras, each at its first occurrence in the
* draft. A fix that only changes case is a casing slip; an extra is a real word the model caught.
*/
function toFindings(misses, extras, verdicts) {
	const byWord = /* @__PURE__ */ new Map();
	for (const m of misses) {
		const seen = byWord.get(m.word);
		if (seen) seen.push(m);
		else byWord.set(m.word, [m]);
	}
	const findings = [];
	for (const [word, offsets] of byWord) {
		const verdict = verdicts.get(word);
		const fix = verdict?.kind === "fix" ? verdict.word : null;
		const kind = fix && fix.toLowerCase() === word.toLowerCase() ? "casing" : "typo";
		findings.push({
			word,
			fix,
			kind: verdict?.kind === "unsure" ? "unsure" : kind,
			offsets,
			checked: true
		});
	}
	for (const extra of extras) findings.push({
		word: extra.word,
		fix: extra.fix,
		kind: "real word",
		offsets: [{
			word: extra.word,
			start: extra.start,
			end: extra.end
		}],
		checked: true
	});
	return findings.sort((a, b) => a.offsets[0].start - b.offsets[0].start);
}

// src/pi/editor.ts
/** Carries a bridge; whatever a listener is handed is the publisher's own object. */
const OFFER = "fireproof:editor-hooks:offer";
/** Asked at session start, in case a bridge was offered before this half loaded. */
const REQUEST = "fireproof:editor-hooks:request";
/**
* Calls `use` once for each bridge a publisher offers, and asks for one at
* session start: load order alone would leave whichever package loaded first
* unheard.
*/
const followEditor = (pi, use) => {
	const seen = /* @__PURE__ */ new WeakSet();
	pi.events.on(OFFER, (data) => {
		if (!data || typeof data !== "object") return;
		const bridge = data;
		if (seen.has(bridge) || typeof bridge.add !== "function") return;
		seen.add(bridge);
		use(bridge);
	});
	pi.on("session_start", () => pi.events.emit(REQUEST, void 0));
};

// src/pi/prompt.ts
/** Mounted above the prompt and drawing nothing: the mark the prompt is found by. */
var PromptMark = class {
	invalidate() {}
	render() {
		return [];
	}
};
/**
* Rows from the prompt's top rule to the bottom of the terminal: the prompt, and whatever pi
* draws under it. Undefined when pi's screen is not laid out that way; the caller then keeps to
* the bottom edge, with the sheet covering the prompt as it did before.
*/
function rowsFromPrompt(tui, mark) {
	const stack = tui.children;
	if (!Array.isArray(stack)) return void 0;
	const at = stack.findIndex((entry) => entry.children?.includes(mark));
	if (at < 0 || at === stack.length - 1) return void 0;
	let rows = 0;
	for (const entry of stack.slice(at + 1)) rows += entry.render(tui.terminal.columns).length;
	return rows;
}
/**
* Where the sheet stands: centred, its sides running down to the prompt's rule `below()` rows
* over the bottom edge. The numbers are read at every render, since a resize or a taller draft
* moves the rule while the sheet is open.
*/
function sheetOptions(tui, below) {
	return {
		anchor: "bottom-center",
		get width() {
			return reviewWidth(tui.terminal.columns);
		},
		get maxHeight() {
			return Math.max(1, tui.terminal.rows - 1 - below());
		},
		get margin() {
			return { bottom: below() };
		}
	};
}

// src/pi/side-call.ts
/** One model call made beside the conversation. */
/** The default side model: the cheap workhorse. */
const SIDE_MODEL = "opencode-go/deepseek-v4.1-flash";
/** Asks the model once; never throws. */
const sideCall = async (ctx, { system, prompt, model = SIDE_MODEL, ...options }) => {
	const slash = model.indexOf("/");
	const found = slash > 0 ? ctx.modelRegistry.find(model.slice(0, slash), model.slice(slash + 1)) : void 0;
	if (!found) return {
		error: `${model} is not in the catalog`,
		cost: 0
	};
	try {
		const response = await ctx.modelRegistry.streamSimple(found, {
			systemPrompt: system,
			messages: [{
				role: "user",
				content: [{
					type: "text",
					text: prompt
				}],
				timestamp: Date.now()
			}]
		}, {
			...options,
			temperature: 0,
			sessionId: ctx.sessionManager.getSessionId()
		}).result();
		const cost = response.usage?.cost?.total ?? 0;
		if (response.stopReason === "error" || response.stopReason === "aborted") return {
			error: response.errorMessage ?? response.stopReason,
			cost
		};
		return {
			text: contentText(response.content),
			cost
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			cost: 0
		};
	}
};

// src/pi.ts
const HUNSPELL = process.env.PI_SPELLFIX_HUNSPELL || "hunspell";
const DICTIONARIES = process.env.PI_SPELLFIX_DICTS || "en_US";
const PERSONAL = process.env.PI_SPELLFIX_PERSONAL || "";
const MODEL = process.env.PI_SPELLFIX_MODEL || "anthropic/claude-haiku-5-5";
const CHECK_DELAY_MS = 300;
/** The widget's key: the empty mark above the prompt the review stands on. While closed, none. */
const WIDGET = "spellfix-review";
const WORD_IN_TEXT = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
const ESCAPE = /\x1b\[[0-9;:?]*[ -/]*[@-~]|\x1b_[^\x07]*\x07/g;
/** Words skipped in the review, forgotten once the draft is submitted or cleared. */
const ignored = /* @__PURE__ */ new Set();
const unadded = /* @__PURE__ */ new Set();
/** What the last answer added to the personal dictionary, for `/spellfix undo`. */
let lastAdded = [];
/** The live TUI session; the bridge's hooks act only while there is one. */
let live;
/** The prompt editor a publisher offered, when one did. */
let bridge;
/** The prompt editor that reported the latest edit. */
let editor;
/** The editor on screen: the bridge's, or the one that last reported an edit. */
const promptEditor = () => bridge?.current() ?? editor;
/** Its text at that edit: a cursor move reports an edit too, and needs no check. */
let editedText;
/** The words the editor underlines: by word, not offset, so every occurrence is marked. */
let underlined = /* @__PURE__ */ new Set();
let timer;
let checkId = 0;
/**
* Bumped on session start and shutdown: a ctx captured before the bump is unusable,
* so anything holding one across an await checks its gen first.
*/
let sessionGen = 0;
let suspended = false;
let warnedHunspell = false;
/**
* The last model answer, kept for reopening the review on the same draft
* without paying for it again; `text` follows the review's own fixes.
*/
let batch;
function toast(ctx, message, level = "info") {
	ctx.ui.notify(message, level);
}
function warnHunspell(ctx, error) {
	if (warnedHunspell) return;
	warnedHunspell = true;
	toast(ctx, `spellfix: hunspell failed: ${error instanceof Error ? error.message : String(error)}`, "error");
}
function ensurePersonal() {
	if (!PERSONAL) return Promise.resolve();
	return mkdir(dirname(PERSONAL), { recursive: true }).then(() => open(PERSONAL, "a")).then((file) => file.close()).catch(() => void 0);
}
async function runHunspell(gen, ctx, mode, stdin) {
	try {
		return await new Promise((resolve, reject) => {
			const child = spawn(HUNSPELL, hunspellArgs(mode, DICTIONARIES, PERSONAL), { stdio: [
				"pipe",
				"pipe",
				"pipe"
			] });
			let stdout = "";
			let stderr = "";
			let settled = false;
			const finish = (fn) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				fn();
			};
			const timeout = setTimeout(() => child.kill("SIGKILL"), 5e3);
			child.stdout.on("data", (data) => stdout += data.toString());
			child.stderr.on("data", (data) => stderr += data.toString());
			child.on("error", (error) => finish(() => reject(error)));
			child.on("close", (code) => finish(() => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `exit ${code}`))));
			child.stdin.on("error", () => void 0);
			child.stdin.end(stdin);
		});
	} catch (error) {
		if (gen === sessionGen) warnHunspell(ctx, error);
		return;
	}
}
/** The candidates hunspell rejects, skipped words excluded; none when hunspell fails. */
async function findMisses(gen, ctx, text) {
	const words = candidates(text).filter((w) => !ignored.has(w.word));
	if (words.length === 0) return [];
	const stdout = await runHunspell(gen, ctx, "-l", `${[...new Set(words.map((w) => w.word))].join("\n")}\n`);
	if (stdout === void 0) return [];
	const bad = new Set(stdout.split("\n").filter(Boolean));
	return words.filter((w) => bad.has(w.word));
}
/** The words of `words` hunspell accepts; none when it fails. */
async function knownWords(gen, ctx, words) {
	if (words.length === 0) return /* @__PURE__ */ new Set();
	const stdout = await runHunspell(gen, ctx, "-l", `${words.join("\n")}\n`);
	if (stdout === void 0) return /* @__PURE__ */ new Set();
	const bad = new Set(stdout.split("\n"));
	return new Set(words.filter((w) => !bad.has(w)));
}
/**
* Takes `words` out of the file at `path`, renaming a temporary file over it so no reader sees it
* half-written. Hunspell appends to this file from its own process, and a word it adds between
* our read and the rename would be lost, so the three steps run without yielding and a file
* that holds none of the words is left alone.
*/
function removeFromFile(path, words) {
	const before = readFileSync(path, "utf8");
	const after = withoutWords(before, words);
	if (after === before) return;
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, after);
	renameSync(tmp, path);
}
async function addWords(gen, ctx, words) {
	for (const word of words) ignored.add(word);
	lastAdded = [.../* @__PURE__ */ new Set([...lastAdded, ...words])];
	if (!PERSONAL || words.length === 0) return;
	await ensurePersonal();
	await runHunspell(gen, ctx, "-a", addInput(words));
}
/** Takes auto-added words back out of the personal dictionary; hunspell itself cannot remove one. */
async function removeWords(gen, ctx, words) {
	for (const word of words) {
		ignored.delete(word);
		unadded.add(word);
	}
	if (!PERSONAL) return;
	try {
		removeFromFile(PERSONAL, words);
	} catch (error) {
		if (gen === sessionGen) toast(ctx, `spellfix: couldn't edit ${PERSONAL}: ${String(error)}`, "error");
	}
}
async function askModel(gen, ctx, text, flagged, signal) {
	const distinct = new Set(flagged.map((m) => m.word));
	const reply = await sideCall(ctx, {
		system: CHECK,
		prompt: checkPrompt(text, flagged),
		model: MODEL,
		maxTokens: replyBudget(distinct.size),
		timeoutMs: 2e4,
		signal
	});
	if ("text" in reply) return parseReply(reply.text, text, distinct);
	if (signal.aborted || gen !== sessionGen) return void 0;
	toast(ctx, `spellfix: ${MODEL} failed: ${reply.error}`, "warning");
}
function setUnderlined(misses) {
	const words = new Set(misses.map((m) => m.word));
	if (words.size === 0 && underlined.size === 0) return;
	underlined = words;
	promptEditor()?.requestRender();
}
/** The cached batch's extras when it is for `text`, skipped words left out. */
function cachedExtras(text) {
	return batch?.text === text ? batch.extras.filter((x) => !ignored.has(x.word)) : [];
}
/**
* The draft as the editor holds it, a large paste still its `[paste #n]`
* marker: the words in a paste are neither checked nor sent to the model.
*/
function draftText(ctx) {
	return promptEditor()?.getText() ?? ctx.ui.getEditorText();
}
/** pi's own test for a draft it runs as a shell command (`!cmd`, `!!cmd`). */
function isShellDraft(text) {
	return text.trimStart().startsWith("!");
}
/** The cursor as an offset into `getText`, for "nearest misspelling". */
function cursorOffset(draft) {
	const { line, col } = draft.getCursor();
	const lines = draft.getLines();
	let offset = 0;
	for (let i = 0; i < line && i < lines.length; i++) offset += lines[i].length + 1;
	return offset + col;
}
/** Puts back a draft read with `draftText`, keeping the pastes its markers name. */
function writeDraft(ui, text) {
	const draft = promptEditor();
	if (draft) draft.replaceText(text);
	else ui.setEditorText(text);
}
/** Hunspell's misses plus the cached model extras, in draft order. */
async function allMisses(gen, ctx, text) {
	return withExtras(await findMisses(gen, ctx, text), cachedExtras(text));
}
function styleWords(line, words, style) {
	let out = "";
	let last = 0;
	for (const m of line.matchAll(ESCAPE)) {
		const index = m.index;
		out += line.slice(last, index).replace(WORD_IN_TEXT, (word) => words.has(word) ? style(word) : word);
		out += m[0];
		last = index + m[0].length;
	}
	return out + line.slice(last).replace(WORD_IN_TEXT, (word) => words.has(word) ? style(word) : word);
}
/** The prompt editor's line with the misspelled words underlined. */
function underline(line) {
	if (underlined.size === 0 || !live) return line;
	const theme = live.ui.theme;
	return styleWords(line, underlined, (word) => theme.style(word, {
		fg: "error",
		underline: true
	}));
}
/** Tells spellfix the prompt editor's draft changed; it repaints the editor once a check lands. */
function onEdit(draft) {
	editor = draft;
	const text = draft.getText();
	if (text === editedText) return;
	editedText = text;
	if (live) scheduleCheck(sessionGen, live);
}
/**
* The review overlay. It owns the draft text while open: every applied fix
* writes the whole editor text, since pi exposes no range replace. The editor
* is not focused meanwhile, so no edit can land between reads.
*/
var Review = class {
	tui;
	gen;
	ctx;
	ui;
	cursor;
	below;
	done;
	text;
	findings = [];
	index = 0;
	top = 0;
	checking = true;
	closed = false;
	pendingAll = false;
	aiError;
	added = /* @__PURE__ */ new Set();
	flagged = [];
	/** Findings the window shows, as the last drawing had room for. */
	height = 3;
	/** What the last drawing painted, for the controls under the pointer. */
	drawn;
	hover;
	abort = new AbortController();
	constructor(tui, gen, ctx, ui, text, cursor, below, done) {
		this.tui = tui;
		this.gen = gen;
		this.ctx = ctx;
		this.ui = ui;
		this.cursor = cursor;
		this.below = below;
		this.done = done;
		this.text = text;
	}
	/** The review outlives its ctx when the session is replaced under it. */
	get live() {
		return this.gen === sessionGen && !this.closed;
	}
	async start() {
		this.flagged = await findMisses(this.gen, this.ctx, this.text);
		if (!this.live) return;
		this.findings = toFindings(this.flagged, [], /* @__PURE__ */ new Map());
		this.focusNearest();
		this.tui.requestRender();
		if (batch?.text === this.text) this.restore(batch);
		else this.runModel();
	}
	focusNearest() {
		this.index = 0;
		for (let i = 0; i < this.findings.length; i++) {
			const at = this.findings[i].offsets[0];
			const best = this.findings[this.index].offsets[0];
			const distance = (m) => this.cursor < m.start ? m.start - this.cursor : Math.max(0, this.cursor - m.end);
			if (distance(at) < distance(best)) this.index = i;
		}
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.abort.abort();
		this.done();
	}
	clampIndex() {
		this.index = Math.max(0, Math.min(this.index, this.findings.length - 1));
	}
	/** Replaces `before` with `text` in the batch cache, so a reopened review is current. */
	keepBatch(before) {
		if (batch?.text !== before) return;
		batch.text = this.text;
	}
	repaint() {
		this.tui.requestRender();
	}
	/** The model has answered or failed: a waiting "apply all" can run, and its adds are named. */
	settle() {
		this.checking = false;
		if (this.added.size) lastAdded = [.../* @__PURE__ */ new Set([...lastAdded, ...this.added])];
		this.repaint();
		if (this.pendingAll) {
			this.pendingAll = false;
			this.applyChecked();
		}
	}
	/** Acts on a fresh answer, which may add words to the personal dictionary. */
	async applyFresh(verdicts, extras) {
		const correct = autoAdds(verdicts, (word) => ignored.has(word) || unadded.has(word));
		if (correct.length) await addWords(this.gen, this.ctx, correct);
		if (!this.live) return;
		for (const word of correct) this.added.add(word);
		this.fill(verdicts, extras);
		this.settle();
	}
	/** Rebuilds the findings from the current answer, keeping every row's toggle and focus. */
	fill(verdicts, extras) {
		const checked = new Map(this.findings.map((f) => [f.word, f.checked]));
		const focus = this.findings[this.index]?.word;
		const findings = toFindings(this.flagged, extras, verdicts).filter((f) => {
			if (ignored.has(f.word)) return false;
			return !(verdicts.get(f.word)?.kind === "correct" && !unadded.has(f.word));
		});
		for (const finding of findings) {
			const was = checked.get(finding.word);
			if (was !== void 0) finding.checked = was;
		}
		this.findings = findings;
		this.index = Math.max(0, focus === void 0 ? 0 : Math.max(0, findings.findIndex((f) => f.word === focus)));
	}
	/** Applies a cached answer without adding anything to the personal dictionary again. */
	restore(result) {
		this.fill(result.verdicts, cachedExtras(this.text));
		this.settle();
	}
	/** The model's batch for the draft at open; fixes found for words already gone are ignored. */
	async runModel() {
		const sent = this.text;
		const answer = await askModel(this.gen, this.ctx, sent, this.flagged, this.abort.signal);
		if (!this.live) return;
		if (!answer) {
			this.aiError = "no answer";
			this.settle();
			return;
		}
		const { verdicts, found } = answer;
		const variants = [...verdicts].flatMap(([word, v]) => v.kind === "correct" ? caseVariants(word) : []);
		recase(verdicts, await knownWords(this.gen, this.ctx, variants));
		if (!this.live) return;
		const extras = placeExtras(sent, found, this.flagged);
		batch = {
			text: sent,
			verdicts,
			extras
		};
		await this.applyFresh(verdicts, extras);
	}
	/** `finding`'s replacement at each of its occurrences. */
	splices(finding) {
		if (finding.fix === null) return [];
		const fix = finding.fix;
		return finding.offsets.map((o) => ({
			start: o.start,
			end: o.end,
			text: fix
		}));
	}
	/** Moves every other finding past an edit at `start`..`end` that changed by `delta`. */
	shiftOthers(start, end, delta) {
		for (const finding of this.findings) finding.offsets = finding.offsets.flatMap((o) => shift(o, start, end, delta) ?? []);
		this.findings = this.findings.filter((f) => f.offsets.length > 0);
		this.flagged = this.flagged.flatMap((m) => shift(m, start, end, delta) ?? []);
	}
	/** Writes one finding into the draft and takes it off the list. */
	applyOne(finding) {
		const before = this.text;
		for (const s of this.splices(finding).sort((a, b) => b.start - a.start)) {
			this.text = `${this.text.slice(0, s.start)}${s.text}${this.text.slice(s.end)}`;
			this.shiftOthers(s.start, s.end, s.text.length - (s.end - s.start));
		}
		if (this.text === before) return;
		this.keepBatch(before);
		this.findings = this.findings.filter((f) => f !== finding);
		this.clampIndex();
		writeDraft(this.ui, this.text);
		this.repaint();
		if (this.findings.length === 0) this.close();
	}
	/** Writes every checked finding into the draft and closes. */
	applyChecked() {
		if (this.checking && this.findings.every((f) => f.fix === null)) {
			this.pendingAll = true;
			this.repaint();
			return;
		}
		const edits = this.findings.filter((f) => f.checked).flatMap((f) => this.splices(f));
		if (edits.length === 0) {
			toast(this.ctx, "No fixes from the model", "info");
			return;
		}
		const before = this.text;
		this.text = applyEdits(before, edits);
		this.keepBatch(before);
		writeDraft(this.ui, this.text);
		this.close();
	}
	toggle() {
		const finding = this.findings[this.index];
		if (!finding) return;
		finding.checked = !finding.checked;
		this.repaint();
	}
	/** Adds the focused word to the personal dictionary and takes its rows off the list. */
	async keep() {
		const finding = this.findings[this.index];
		if (!finding || finding.kind === "real word") return;
		if (!PERSONAL) {
			toast(this.ctx, "spellfix: no personal dictionary configured", "warning");
			return;
		}
		await addWords(this.gen, this.ctx, [finding.word]);
		if (!this.live) return;
		this.findings = this.findings.filter((f) => f.word !== finding.word);
		this.clampIndex();
		this.repaint();
		if (this.findings.length === 0) this.close();
	}
	/** Takes this answer's auto-added words back out and puts their rows back. */
	async undoAdd() {
		if (this.added.size === 0) return;
		const words = [...this.added];
		this.added.clear();
		lastAdded = lastAdded.filter((w) => !words.includes(w));
		await removeWords(this.gen, this.ctx, words);
		if (!this.live) return;
		this.flagged = await findMisses(this.gen, this.ctx, this.text);
		if (!this.live) return;
		this.fill(batch?.verdicts ?? /* @__PURE__ */ new Map(), cachedExtras(this.text));
		this.repaint();
	}
	move(by) {
		if (this.findings.length === 0) return;
		this.index = (this.index + by + this.findings.length) % this.findings.length;
		this.repaint();
	}
	/** The focused finding's fix, as Enter and a press of Apply take it. */
	applyFocused() {
		const finding = this.findings[this.index];
		if (finding) this.applyOne(finding);
	}
	/** What the drawing reads: the review's state, in the shape the kit's rows take. */
	view() {
		return {
			text: this.text,
			findings: this.findings,
			index: this.index,
			top: this.top,
			height: this.height,
			isChecking: this.checking,
			isPendingAll: this.pendingAll,
			aiError: this.aiError,
			added: [...this.added],
			hover: this.hover
		};
	}
	invalidate() {}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.close();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.move(-this.height);
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.move(this.height);
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.index = 0;
			this.repaint();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.index = Math.max(0, this.findings.length - 1);
			this.repaint();
			return;
		}
		if (matchesKey(data, Key.up) || matchesKey(data, "k") || matchesKey(data, "p")) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, "j") || matchesKey(data, "n")) {
			this.move(1);
			return;
		}
		if (matchesKey(data, "space")) {
			this.toggle();
			return;
		}
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			this.applyFocused();
			return;
		}
		if (matchesKey(data, "a")) {
			this.applyChecked();
			return;
		}
		if (matchesKey(data, "d")) {
			this.keep();
			return;
		}
		if (matchesKey(data, "u")) {
			this.undoAdd();
			return;
		}
	}
	/**
	* A press of a row, its mark, a button or the frame's Close: the mouse does what the key
	* beside the same control does. Hover bolds the row's label; the pointer stays where it is.
	*/
	handleMouse(event) {
		if (event.type === "wheel") {
			this.move(Math.sign(event.wheelDelta ?? 0));
			return { handled: true };
		}
		const drawn = this.drawn;
		const hit = drawn ? cellAt(drawn.cells[event.y], event.x)?.hit ?? drawn.hits[event.y] : void 0;
		if (event.type === "move") {
			if (hit === this.hover) return void 0;
			this.hover = hit;
			this.repaint();
			return {
				handled: true,
				render: true
			};
		}
		if (event.type !== "click" || event.button !== "left") return void 0;
		if (hit !== void 0) this.press(hit);
		return { handled: true };
	}
	press(hit) {
		if (closeOf(hit) === "close") {
			this.close();
			return;
		}
		if (hit === REVIEW_HIT.apply) {
			this.applyFocused();
			return;
		}
		if (hit === REVIEW_HIT.applyAll) {
			this.applyChecked();
			return;
		}
		if (hit === REVIEW_HIT.toggle) {
			this.toggle();
			return;
		}
		if (hit === REVIEW_HIT.keep) {
			this.keep();
			return;
		}
		if (hit === REVIEW_HIT.undo) {
			this.undoAdd();
			return;
		}
		const mark = markOfHit(hit);
		if (mark !== void 0) {
			this.index = mark;
			this.toggle();
			return;
		}
		const row = rowOfHit(hit);
		if (row !== void 0) {
			this.index = row;
			this.repaint();
		}
	}
	render(width) {
		const room = sheetRoom(width);
		const base = this.view();
		const footer = buttonRows({
			rows: reviewButtons(base, this.hover),
			wrap: true
		}, room);
		const noticeLine = reviewNotice(base, room);
		const below = this.below();
		const foot = below > 0 ? "none" : "edge";
		this.height = reviewHeight(rowsAbovePrompt(this.tui.terminal.rows, below), {
			footer: footer.length,
			notice: noticeLine !== void 0,
			foot
		});
		this.top = reviewWindow(this.index, this.findings.length, this.height, this.top).top;
		const view = this.view();
		const lines = sheet({
			width,
			title: "spellfix",
			caption: reviewCaption(view),
			close: { hover: closeOf(this.hover) },
			body: reviewBody(view, room),
			...noticeLine ? { notice: noticeLine } : {},
			footer,
			foot
		});
		this.drawn = paintLines(this.ui.theme, lines, width, { fill: true });
		return this.drawn.lines;
	}
};
function scheduleCheck(gen, ctx) {
	if (suspended || gen !== sessionGen) return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = void 0;
		refreshUnderlines(gen, ctx);
	}, CHECK_DELAY_MS);
}
/** Underlines the draft's misspellings. */
async function refreshUnderlines(gen, ctx) {
	if (gen !== sessionGen) return;
	const id = ++checkId;
	const text = draftText(ctx);
	if (!text.trim() || isShellDraft(text)) {
		setUnderlined([]);
		return;
	}
	const misses = await allMisses(gen, ctx, text);
	if (id !== checkId || gen !== sessionGen) return;
	setUnderlined(misses);
}
async function openReview(ctx) {
	if (ctx.mode !== "tui") {
		toast(ctx, "spellfix: the review needs the interactive UI", "warning");
		return;
	}
	const text = draftText(ctx);
	if (!text.trim()) {
		toast(ctx, "No misspellings", "info");
		return;
	}
	if (isShellDraft(text)) {
		toast(ctx, "spellfix: shell commands aren't spellchecked", "info");
		return;
	}
	const gen = sessionGen;
	const focused = promptEditor();
	const cursor = focused ? cursorOffset(focused) : text.length;
	suspended = true;
	if (timer) clearTimeout(timer);
	let mark;
	ctx.ui.setWidget(WIDGET, () => {
		mark = new PromptMark();
		return mark;
	});
	let surface;
	let measured;
	const below = () => {
		if (measured === void 0) {
			measured = surface && mark && rowsFromPrompt(surface, mark) || 0;
			queueMicrotask(() => {
				measured = void 0;
			});
		}
		return measured;
	};
	try {
		await ctx.ui.custom((tui, _theme, _kb, done) => {
			surface = tui;
			const review = new Review(tui, gen, ctx, ctx.ui, text, cursor, below, done);
			review.start();
			return review;
		}, {
			overlay: true,
			overlayOptions: () => sheetOptions(surface, below)
		});
	} finally {
		ctx.ui.setWidget(WIDGET, void 0);
		suspended = false;
		if (gen === sessionGen) scheduleCheck(gen, ctx);
	}
}
/** `/spellfix undo`: takes the last answer's auto-added words back out of the dictionary. */
async function undoLastAdded(ctx) {
	const words = lastAdded;
	if (words.length === 0) {
		toast(ctx, "spellfix: nothing to undo", "info");
		return;
	}
	lastAdded = [];
	await removeWords(sessionGen, ctx, words);
	toast(ctx, `spellfix: removed ${words.join(", ")} from the dictionary`, "info");
}
function pi_default(pi) {
	followEditor(pi, (offered) => {
		bridge = offered;
		offered.add({
			decorateLine: underline,
			onEdit
		});
		if (live) scheduleCheck(sessionGen, live);
	});
	pi.registerShortcut("ctrl+q", {
		description: "Review spelling in the prompt draft",
		handler: (ctx) => openReview(ctx)
	});
	pi.registerCommand("spellfix", {
		description: "Review the draft's spelling, or `undo` the last words it learned",
		handler: async (args, ctx) => {
			if (args.trim() === "undo") return undoLastAdded(ctx);
			return openReview(ctx);
		}
	});
	pi.registerCommand("spellcheck", {
		description: "Review spelling in the prompt draft",
		handler: async (_args, ctx) => openReview(ctx)
	});
	pi.on("session_start", (_event, ctx) => {
		sessionGen++;
		const gen = sessionGen;
		ignored.clear();
		unadded.clear();
		lastAdded = [];
		batch = void 0;
		warnedHunspell = false;
		suspended = false;
		if (ctx.mode !== "tui") return;
		live = ctx;
		ensurePersonal();
		scheduleCheck(gen, ctx);
	});
	pi.on("session_shutdown", () => {
		sessionGen++;
		if (timer) clearTimeout(timer);
		timer = void 0;
		checkId++;
		suspended = false;
		live = void 0;
		editor = void 0;
		editedText = void 0;
		underlined = /* @__PURE__ */ new Set();
		batch = void 0;
	});
	pi.on("input", () => {
		ignored.clear();
		unadded.clear();
		lastAdded = [];
	});
}

export { pi_default as default };