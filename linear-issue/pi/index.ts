import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contentText } from "@earendil-works/pi-ai";
import { createMcpExtension, getAgentDir, getMarkdownTheme, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import { Editor, Input, Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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
		enter: "↵",
		bullet: "•",
		/** The rail down the left of a card in a transcript. */
		rail: "│",
		/** The mark of a row set aside: it stays in the list, left out of what is carried out. */
		dropped: "–"
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

// ../../lib/kits/core/src/lines.ts
/**
* Styled lines: what a terminal component draws before a client paints it. pi and Claude Code's
* terminal are both cell grids, so a component is drawn once, here, and each client only paints
* the result (`paint/pi.ts`, `paint/claude.tsx`). No host imports.
*/
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
/** A host-drawn block in the drawing's flow. */
const slotLine = (slot) => ({
	spans: [],
	slot
});
/** Cells a code point takes: 0 for marks and joiners, 2 for East Asian wide and emoji. */
const cellsOf$1 = (c) => {
	if (c < 32 || c >= 127 && c < 160) return 0;
	if (c < 768) return 1;
	if (c >= 768 && c <= 879 || c >= 8203 && c <= 8207 || c >= 8400 && c <= 8447 || c >= 65024 && c <= 65039 || c === 65279 || c >= 917760 && c <= 917999) return 0;
	return c >= 4352 && c <= 4447 || c === 9001 || c === 9002 || c >= 8986 && c <= 8987 || c >= 9193 && c <= 9196 || c === 9200 || c === 9203 || c >= 9725 && c <= 9726 || c >= 9748 && c <= 9749 || c >= 9800 && c <= 9811 || c === 9855 || c === 9875 || c === 9889 || c >= 9898 && c <= 9899 || c >= 9917 && c <= 9918 || c >= 9924 && c <= 9925 || c === 9934 || c === 9940 || c === 9962 || c >= 9970 && c <= 9971 || c === 9973 || c === 9978 || c === 9981 || c === 9989 || c >= 9994 && c <= 9995 || c === 10024 || c === 10060 || c === 10062 || c >= 10067 && c <= 10069 || c === 10071 || c >= 10133 && c <= 10135 || c === 10160 || c === 10175 || c >= 11035 && c <= 11036 || c === 11088 || c === 11093 || c >= 11904 && c <= 12350 || c >= 12353 && c <= 13311 || c >= 13312 && c <= 19903 || c >= 19968 && c <= 42191 || c >= 43360 && c <= 43391 || c >= 44032 && c <= 55203 || c >= 63744 && c <= 64255 || c >= 65040 && c <= 65049 || c >= 65072 && c <= 65135 || c >= 65280 && c <= 65376 || c >= 65504 && c <= 65510 || c >= 127744 && c <= 128591 || c >= 128640 && c <= 128767 || c >= 129280 && c <= 129535 || c >= 129648 && c <= 129791 || c >= 131072 && c <= 262141 ? 2 : 1;
};
/** Cells `text` takes: wide characters two, marks and joiners none. Never `.length`. */
function cellWidth(text) {
	let n = 0;
	for (const ch of text) n += cellsOf$1(ch.codePointAt(0) ?? 0);
	return n;
}
/** The longest start of `text` that fits `cells`, and the rest. */
function split(text, cells) {
	let used = 0;
	let at = 0;
	for (const ch of text) {
		const w = cellsOf$1(ch.codePointAt(0) ?? 0);
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
		const w = cellsOf$1(ch.codePointAt(0) ?? 0);
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
/**
* The window of `lines` a room `rows` high shows, from `top`. Where lines are cut off, the
* window's first or last row says how many, and steps the window when it is a control. A line
* keeps its row as the window moves from the start.
*/
function scrolled(lines, scroll) {
	const rows = Math.max(0, Math.floor(scroll.rows));
	const marker = (side, count, hit) => {
		const glyph = tokens.glyph.more[side];
		const isHovered = hit !== void 0 && scroll.hovered === side;
		return line([...scroll.inset ? [span(" ".repeat(scroll.inset))] : [], span(moreText(glyph, count), {
			role: isHovered ? "text" : "dim",
			bold: isHovered || void 0
		})], hit);
	};
	if (lines.length <= rows || rows < 1) return {
		rows: lines.slice(0, rows),
		top: 0,
		max: 0
	};
	if (rows === 1) return {
		rows: [marker("down", lines.length, void 0)],
		top: 0,
		max: 0
	};
	if (rows === 2) {
		const at = Math.max(0, Math.min(lines.length - 1, Math.floor(scroll.top ?? 0)));
		const shown = lines.slice(at, at + 1);
		const after = lines.length - at - 1;
		return {
			rows: after ? [...shown, marker("down", after, scroll.hits?.down)] : [marker("up", at, scroll.hits?.up), ...shown],
			top: at,
			max: lines.length - 1
		};
	}
	const max = lines.length - rows;
	const top = Math.max(0, Math.min(max, Math.floor(scroll.top ?? 0)));
	const from = top > 0 ? top + 1 : 0;
	const room = rows - (top > 0 ? 1 : 0);
	const isCut = from + room < lines.length;
	const to = from + room - (isCut ? 1 : 0);
	return {
		rows: [
			...top > 0 ? [marker("up", from, scroll.hits?.up)] : [],
			...lines.slice(from, to),
			...isCut ? [marker("down", lines.length - to, scroll.hits?.down)] : []
		],
		top,
		max
	};
}
/** `top` after a step of `by` lines, for a window that was drawn with `scrolled`. */
const scrollBy = (window, by) => Math.max(0, Math.min(window.max, window.top + by));

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
		if (l.slot) {
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
/** Lines painted, for where only the rows are wanted. */
const draw$1 = (theme, lines, width) => paintLines(theme, lines, width).lines;
/** One run of text in a style of the kit. */
const paintText = (theme, text, style = {}) => paintSpan(theme, {
	...style,
	text
});
/** Cells a painted row takes, by pi's measure. */
const paintedWidth = (text) => visibleWidth(text);
/** A painted row cut with `…` or padded with spaces to exactly `width` cells. */
const fitPainted = (text, width) => truncateToWidth(text, Math.max(0, width), "…", true);

// src/lib/draft.ts
const NO_LINEAR = "Linear MCP unavailable or signed out, re-authenticate with /mcp";
const PRIORITIES = [
	{
		value: "1",
		label: "Urgent"
	},
	{
		value: "2",
		label: "High"
	},
	{
		value: "3",
		label: "Medium"
	},
	{
		value: "4",
		label: "Low"
	},
	{
		value: "0",
		label: "No priority"
	}
];
const FALLBACK_TEAM = "MSC";
const MESSAGE_CHARS = 2e3;
const SEARCH_HITS = 10;
const CANDIDATES = 20;
const CANDIDATE_CHARS = 300;
const CLOSED = [
	"completed",
	"canceled",
	"duplicate"
];
const SYSTEM = `You draft a Linear issue for the user to deal with later, from one of two seeds: an <insight> that a side agent flagged while it watched their session, or a <note> the user typed with /linear. The seed is what to file; the recent conversation is context for it. An empty <note> means: file what the recent conversation is about. The user reviews and edits your draft before it is created.

- team: the key of the team from <teams> that the repository and topic belong to; when unsure, the <defaults> team.
- title: short and specific, imperative, under 80 characters.
- description: Linear markdown that reads at a glance. Prefer structure to prose: one sentence saying what to do and why, then the details as bullets, never as a paragraph. Use the richer forms only when the content has that shape:
  - a table when comparing options, listing items that share attributes, or mapping before to after
  - a checklist (- [ ]) when the work splits into separate steps
  No diagrams: the draft cannot draw them.
  Then, leaving out a line you have nothing concrete for:
  **Where:** the file paths, symbols or commands named in the seed or conversation, in backticks
  **Done when:** one line saying how to tell it is finished
  No headings, no story of the session, no restating the title; about 120 words at most, a table not counted. Do not add a source or session line; it is appended for you.
- priority: 1 urgent, 2 high, 3 medium, 4 low. Reserve 1 for things that are breaking now; when unsure, the <defaults> priority.
- labels: names from <labels> that clearly fit, usually none.
- search: two or three short phrases, one to three words each, that an existing issue about the same problem would contain in its title or description; used to look for duplicates.
- Never copy secrets, tokens, credentials or .env contents into the draft.

Answer with one JSON object and nothing else:
{"team": "...", "title": "...", "description": "...", "priority": 4, "labels": [], "search": []}`;
const DUPLICATE_SYSTEM = `You check whether an open Linear issue already covers a <draft> the user is about to file. The <candidates> came from a keyword search, so most are unrelated. Only call one a duplicate when it is about the same problem or change, not merely the same area.

When one is, answer its key and a one-or-two-sentence comment for it adding what the draft knows that the issue does not. Never copy secrets, tokens, credentials or .env contents.

Answer with one JSON object and nothing else:
{"duplicate": null} or {"duplicate": {"issue": "KEY-1", "comment": "..."}}`;
const errorText = (error) => error instanceof Error ? error.message : String(error);
const oneLine = (text) => text.replace(/\s*\n\s*/g, " ");
/** `owner/repo` from a git remote URL, or undefined when it names none. */
const repoName = (remote) => /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1];
/** The JSON object in a model reply, which may wrap it in prose or a fence. */
function replyJson(text) {
	return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}
/** The label a field's value has among its options. */
const labelOf = (options, value) => options.find((o) => o.value === value)?.label;
/** The description as it is filed: with the line saying where it came from. */
const filedDescription = (f) => f.source ? `${f.description.trimEnd()}\n\n---\n${f.source}` : f.description;
/** The drafter's brief: the seed with where it came from, and the trailing source line. */
function brief(seed, o) {
	const recent = o.messages.filter((m) => m.text.trim() !== "").slice(-8).map((m) => {
		const text = m.text.length > MESSAGE_CHARS ? `${m.text.slice(0, MESSAGE_CHARS)}…` : m.text;
		return `<${m.role}>\n${text}\n</${m.role}>`;
	}).join("\n");
	const name = o.repo ?? o.cwd.split("/").pop() ?? o.cwd;
	return {
		text: [
			`<${seed.kind}>\n${seed.text}\n</${seed.kind}>`,
			`<source>\ndirectory: ${o.cwd}\nrepository: ${name}\nbranch: ${o.branch}\n</source>`,
			`<recent_conversation>\n${recent}\n</recent_conversation>`
		].join("\n\n"),
		source: `Source: \`${name}\` · ${o.branch} · session ${o.sessionId}`
	};
}
const blankForm = (draftId, seed) => ({
	draftId,
	phase: "drafting",
	stage: "linear",
	error: null,
	seed,
	source: "",
	teams: [],
	statuses: [],
	labels: [],
	projects: [],
	team: "",
	title: "",
	fieldRevision: 0,
	description: "",
	priority: 0,
	state: "",
	labelIds: [],
	project: "",
	duplicate: null,
	isCheckingDuplicates: false,
	settledAt: 0
});
/** The draft's own verbs, bound to one client's `Host`. */
function drafter(host, teamOptions = /* @__PURE__ */ new Map()) {
	const patch = (change) => host.update((cur) => cur && {
		...cur,
		...change
	});
	const call = (tool, args) => host.linear(tool, args);
	function loadTeam(team) {
		let options = teamOptions.get(team);
		if (!options) {
			options = (async () => {
				const [statuses, labels, projects] = await Promise.all([
					call("list_issue_statuses", { team }),
					call("list_issue_labels", {
						team,
						limit: 250
					}),
					call("list_projects", {
						team,
						limit: 50
					})
				]);
				const todo = statuses.find((s) => s.name === "Todo") ?? statuses.find((s) => s.type === "unstarted");
				return {
					statuses: statuses.map((s) => ({
						value: s.id,
						label: s.name
					})),
					labels: labels.labels.filter((l) => !l.archivedAt).map((l) => ({
						value: l.id,
						label: l.parent ? `${l.parent}/${l.name}` : l.name
					})),
					projects: [{
						value: "",
						label: "No project"
					}, ...projects.projects.map((p) => ({
						value: p.id,
						label: p.name
					}))],
					todo: todo?.id ?? statuses[0]?.id ?? ""
				};
			})();
			teamOptions.set(team, options);
			options.catch(() => teamOptions.delete(team));
		}
		return options;
	}
	/** Open issues anywhere in the workspace that any of `terms` finds, most hits first. */
	async function searchOpen(terms) {
		const found = await Promise.all(terms.map((query) => call("list_issues", {
			query,
			limit: SEARCH_HITS,
			fields: [
				"title",
				"statusType",
				"team",
				"description"
			]
		}).then((r) => r.issues, () => [])));
		const hits = /* @__PURE__ */ new Map();
		for (const issue of found.flat()) {
			if (CLOSED.includes(issue.statusType)) continue;
			const seen = hits.get(issue.id);
			hits.set(issue.id, {
				issue,
				count: (seen?.count ?? 0) + 1
			});
		}
		return [...hits.values()].sort((a, b) => b.count - a.count).slice(0, CANDIDATES).map((h) => h.issue);
	}
	/**
	* Looks for an open issue covering the draft `draftId` and offers commenting on it. Runs
	* after the form is ready, so a slow search never holds up Create; a result for a draft that
	* has since been filed or discarded is dropped.
	*/
	async function checkDuplicates(draftId, draft) {
		const settle = async (duplicate) => {
			const now = await host.now();
			await host.update((cur) => cur?.draftId === draftId ? {
				...cur,
				duplicate,
				isCheckingDuplicates: false,
				settledAt: duplicate ? now : cur.settledAt
			} : cur);
		};
		try {
			const terms = (draft.search ?? []).filter((t) => t.trim() !== "").slice(0, 3);
			const candidates = await searchOpen(terms.length > 0 ? terms : [draft.title]);
			if (candidates.length === 0) return await settle(null);
			const reply = await host.complete({
				system: DUPLICATE_SYSTEM,
				maxTokens: 1e3,
				prompt: [`<draft>\n${draft.title}\n\n${draft.description}\n</draft>`, `<candidates>\n${candidates.map((i) => {
					const about = oneLine(i.description ?? "").slice(0, CANDIDATE_CHARS);
					return `${i.id} [${i.team}] ${i.title}${about && `\n  ${about}`}`;
				}).join("\n")}\n</candidates>`].join("\n\n")
			});
			if ("error" in reply) return await settle(null);
			const v = replyJson(reply.text).duplicate;
			const dup = v && candidates.find((i) => i.id === v.issue);
			const about = oneLine(dup?.description ?? "").slice(0, CANDIDATE_CHARS);
			await settle(dup && v ? {
				issue: dup.id,
				title: dup.title,
				comment: v.comment,
				team: dup.team,
				status: dup.statusType,
				...about && { about }
			} : null);
		} catch (error) {
			host.log(`linear-issue: duplicate check failed: ${errorText(error)}`);
			await settle(null);
		}
	}
	/** Drafts from the open form's seed and fills it. */
	async function fill(draftId, seed) {
		const mine = async () => (await host.read())?.draftId === draftId;
		const fail = async (error) => {
			if (await mine()) await patch({
				phase: "failed",
				error
			});
		};
		try {
			const b = brief(seed, await host.origin());
			await patch({ source: b.source });
			const teams = (await call("get_user", { query: "me" })).teams.map((t) => ({
				value: t.key,
				label: `${t.name} (${t.key})`
			}));
			const last = await host.last().catch(() => void 0);
			const fallback = [last?.team, FALLBACK_TEAM].find((k) => teams.some((t) => t.value === k)) ?? teams[0]?.value ?? "";
			const usual = labelOf(PRIORITIES, String(last?.priority ?? 4)) ?? "Low";
			const guess = await loadTeam(fallback);
			if (!await mine()) return;
			await patch({ stage: "writing" });
			const reply = await host.complete({
				system: SYSTEM,
				maxTokens: 4e3,
				prompt: [
					b.text,
					`<defaults>\nteam: ${fallback}\npriority: ${usual}\n</defaults>`,
					`<teams>\n${teams.map((t) => t.label).join("\n")}\n</teams>`,
					`<labels>\n${guess.labels.map((l) => l.label).join("\n")}\n</labels>`
				].join("\n\n")
			});
			if ("error" in reply) return await fail(`drafting failed: ${reply.error}`);
			const d = replyJson(reply.text);
			const team = teams.some((t) => t.value === d.team) ? d.team : fallback;
			const options = await loadTeam(team);
			const labelIds = (d.labels ?? []).flatMap((name) => {
				const l = options.labels.find((o) => o.label === name || o.label.endsWith(`/${name}`));
				return l ? [l.value] : [];
			});
			if (!await mine()) return;
			await patch({
				settledAt: await host.now(),
				phase: "ready",
				error: null,
				teams,
				statuses: options.statuses,
				labels: options.labels,
				projects: options.projects,
				team,
				title: oneLine(d.title),
				description: d.description,
				priority: PRIORITIES.some((p) => p.value === String(d.priority)) ? d.priority : 0,
				state: options.todo,
				labelIds,
				project: "",
				isCheckingDuplicates: true
			});
			checkDuplicates(draftId, d);
		} catch (error) {
			await fail(errorText(error));
		}
	}
	return {
		/**
		* A new draft for `seed`, which drafting then fills; undefined while another is open, which
		* the client shows again instead. A failed draft gives way to a new one.
		*/
		async start(seed) {
			const open = await host.read();
			if (open && open.phase !== "failed") return void 0;
			const now = await host.now();
			const f = blankForm(`${now}-${Math.random().toString(36).slice(2)}`, seed);
			await host.update(() => f);
			fill(f.draftId, seed);
			return f;
		},
		/** Drafts a failed draft again, from the same seed. */
		async retry() {
			const f = await host.read();
			if (!f || f.phase !== "failed") return;
			await patch({
				phase: "drafting",
				stage: "linear",
				error: null
			});
			fill(f.draftId, f.seed);
		},
		/** Moves the draft to `team`: its statuses and projects, and the labels it has by name. */
		async switchTeam(team) {
			const options = await loadTeam(team).catch(() => void 0);
			if (!options) return;
			await host.update((cur) => {
				if (!cur) return cur;
				const keep = (ids) => ids.flatMap((id) => {
					const name = labelOf(cur.labels, id);
					const same = options.labels.find((l) => l.label === name);
					return same ? [same.value] : [];
				});
				return {
					...cur,
					team,
					statuses: options.statuses,
					labels: options.labels,
					projects: options.projects,
					state: options.todo,
					labelIds: keep(cur.labelIds),
					project: ""
				};
			});
		},
		/**
		* Writes the draft to Linear: the issue, or with `asComment` the duplicate's comment. Gives
		* what was filed, and leaves the draft open for the client to close; on an error the draft
		* says why and nothing is given.
		*/
		async submit({ asComment = false, open = false } = {}) {
			const f = await host.read();
			if (!f || f.phase !== "ready") return void 0;
			await patch({
				phase: "filing",
				error: null
			});
			try {
				if (asComment && f.duplicate) {
					const r = await call("save_comment", {
						issueId: f.duplicate.issue,
						body: f.duplicate.comment
					});
					const url = /https:\/\/linear\.app\/[^"'\s)]+/.exec(JSON.stringify(r))?.[0] ?? "";
					const last = await host.last().catch(() => void 0);
					if (last) await host.remember({
						...last,
						open
					}).catch(() => void 0);
					return {
						key: f.duplicate.issue,
						title: `commented: ${f.duplicate.title}`,
						url
					};
				}
				const r = await call("save_issue", {
					team: f.team,
					title: f.title,
					description: filedDescription(f),
					assignee: "me",
					state: f.state,
					priority: f.priority,
					...f.labelIds.length > 0 && { labels: f.labelIds },
					...f.project && { project: f.project }
				});
				const text = JSON.stringify(r);
				const key = r.identifier ?? r.id ?? /\b[A-Z][A-Z0-9]+-\d+\b/.exec(text)?.[0] ?? "";
				const url = r.url ?? /https:\/\/linear\.app\/[^"'\s)]+/.exec(text)?.[0] ?? "";
				await host.remember({
					team: f.team,
					priority: f.priority,
					open
				}).catch(() => void 0);
				return {
					key,
					title: f.title,
					url
				};
			} catch (error) {
				await patch({
					phase: "ready",
					error: errorText(error)
				});
				return;
			}
		}
	};
}

// ../../lib/kits/card/src/contract.ts
/** The row id of a list's item, as a drawn line's `hit`. */
const choiceHit = (index) => `choice:${index}`;
/** The item a `hit` names, or -1. */
const choiceOf = (hit) => hit?.startsWith("choice:") ? Number(hit.slice(7)) : -1;

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP$5 = " ".repeat(tokens.gutter);
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
const keyRole$2 = (state) => state.active ? "accent" : "dim";
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
		span(c.key || " ", { role: keyRole$2(c) }),
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
/** A list of answers the keyboard moves through: `choice` rows, each a control. */
function choiceList(list, width) {
	return list.items.flatMap((item, i) => choice({
		active: list.active,
		key: item.key,
		text: item.text,
		detail: item.detail,
		chosen: list.chosen.includes(i),
		focused: list.focus === i,
		hovered: list.hover === i,
		multiple: list.multiple,
		literal: item.writeIn,
		hit: choiceHit(i)
	}, width));
}

// ../../lib/kits/buttons/src/terminal.ts
/** The button row as styled lines: the one drawing both terminals paint. */
/** How a button's key is printed after its label: `↵` for Enter, else in brackets; nothing for none. */
const shortcutOf = (b) => b.hit === void 0 || !b.hotkey ? b.hotkey : b.hotkey === "enter" ? tokens.glyph.enter : `[${b.hotkey}]`;
/**
* Actions left to right, label first with the key dim after it, the suggested one in the
* accent; and dim keyboard-only hints, key first. One row drops what is neither suggested nor
* essential, last first, until it fits; with `wrap` nothing drops.
*/
function buttonRow(keys, width, { wrap = false, lead = [], hover } = {}) {
	const chips = keys.map((key) => {
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

// src/lib/chip.ts
const GAP$4 = " ".repeat(tokens.gutter);
/** The glyph a draft put aside is marked with. */
const DRAFT_MARK = "✎";
/** Below this many columns the line drops its name for the draft's title. */
const NARROW = 80;
/** The line's controls. */
const CHIP = {
	open: "chip:open",
	discard: "chip:discard"
};
/** A mark, what it is about cut to the room the buttons leave, and the buttons. */
function chip(mark, words, buttons, width) {
	const actions = buttonRow(buttons, width)[0]?.spans ?? [];
	const room = width - spansWidth(mark) - spansWidth(actions) - tokens.gutter;
	return line([
		...mark,
		span(truncate(words, Math.max(4, room)), { role: "text" }),
		span(GAP$4),
		...actions
	]);
}
/** A draft put aside: its title, Open and Discard. */
function draftChip(form, width, o) {
	const what = form.phase === "drafting" ? "being written…" : form.phase === "failed" ? "was not written" : form.title || "Untitled";
	return chip([span(`${"✎"} `, { role: "dim" }), ...width < NARROW ? [] : [span(`Linear draft${GAP$4}`, { bold: true })]], what, [{
		hotkey: o.openKey,
		label: "Open",
		hit: CHIP.open,
		essential: true,
		hovered: o.hover === CHIP.open
	}, {
		hotkey: o.discardKey,
		label: o.isArmed ? "Sure? Discard" : "Discard",
		hit: CHIP.discard,
		essential: true,
		hovered: o.hover === CHIP.discard
	}], width);
}

// ../../lib/kits/fields/src/contract.ts
/** The control a field is, as a drawn row's `hit`. */
const fieldHit = (id) => `field:${id}`;
/** The field a `hit` names. */
const fieldOf = (hit) => hit?.startsWith("field:") ? hit.slice(6) : void 0;

// ../../lib/kits/fields/src/terminal.ts
/** Fields as styled lines: the one drawing both terminals paint. */
const GAP$3 = " ".repeat(tokens.gutter);
/** What a person can press: in the accent where the keyboard is, quiet elsewhere. */
const keyRole$1 = (isActive = false) => isActive ? "accent" : "dim";
const valueRole = (f) => f.empty && !f.hovered ? "dim" : "text";
const valueStyle = (f) => ({
	role: valueRole(f),
	bold: f.hovered || void 0
});
/**
* One value each, named: a row per field with its key, its label and what it holds, the labels
* in one column; or, `inline`, the values side by side after their keys, wrapped whole. A field
* with a `hit` is a control, its row or its cells.
*/
function fields(all, width, options = {}) {
	const { active, inline: isInline = false, valueLines = 2 } = options;
	const hasKeys = all.some((f) => f.key);
	if (isInline) {
		const rows = [];
		let spans = [];
		for (const f of all) {
			const lead = f.key ?? f.label;
			const entry = truncateSpans([
				span(lead, {
					role: f.key ? keyRole$1(active) : "dim",
					hit: f.hit
				}),
				span(" ", { hit: f.hit }),
				span(f.value, {
					...valueStyle(f),
					hit: f.hit
				})
			], width);
			if (spans.length && spansWidth(spans) + tokens.gutter + spansWidth(entry) > width) {
				rows.push(line(spans));
				spans = [];
			}
			if (spans.length) spans.push(span(GAP$3));
			spans.push(...entry);
		}
		if (spans.length) rows.push(line(spans));
		return rows;
	}
	const keyed = hasKeys ? Math.max(...all.map((f) => cellWidth(f.key ?? ""))) + tokens.gutter : 0;
	const widest = Math.max(0, ...all.map((f) => cellWidth(f.label)));
	const labelled = Math.min(widest, Math.max(4, Math.floor((width - keyed) / 2) - tokens.gutter));
	return all.flatMap((f) => {
		const label = truncateSpans([span(f.label, { role: "dim" })], labelled);
		const lead = [
			...hasKeys ? [span((f.key ?? "").padEnd(keyed - tokens.gutter), { role: keyRole$1(active) }), span(GAP$3)] : [],
			...label,
			span(" ".repeat(labelled - spansWidth(label)) + GAP$3)
		];
		return block(literal(f.value, valueStyle(f)), width, {
			lead,
			max: valueLines,
			hit: f.hit
		});
	});
}

// ../../lib/kits/frame/src/contract.ts
/** The control a close action is, as a drawn span's `hit`. */
const closeHit = (action) => `frame:${action}`;
/** The close action a `hit` names. */
const closeOf = (hit) => hit === "frame:close" || hit === "frame:discard" || hit === "frame:keep" ? hit.slice(6) : void 0;

// ../../lib/kits/prose/src/terminal.ts
/**
* Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
* here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
* that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
* needs syntax colours or runs as long as it likes.
*/
const GAP$2 = " ".repeat(tokens.gutter);
const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const ROW = /^\s*\|.*\|\s*$/;
const DIVIDER = /^:?-{2,}:?$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
/** A table row's cells. */
const cellsOf = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
/**
* A table to `width` cells: columns two apart, each as wide as its widest cell while they fit
* and sharing the room in proportion when they do not, cells wrapped, the first row bold.
*/
function table(rows, width, base) {
	const all = rows.map(cellsOf).filter((cells) => !cells.every((cell) => DIVIDER.test(cell)));
	const count = Math.max(0, ...all.map((cells) => cells.length));
	if (!count) return [];
	const plain = (cell) => inline(cell).reduce((n, s) => n + cellWidth(s.text), 0);
	const natural = Array.from({ length: count }, (_, i) => Math.max(1, ...all.map((cells) => plain(cells[i] ?? ""))));
	const room = Math.max(count, width - (count - 1) * tokens.gutter);
	const total = natural.reduce((n, w) => n + w, 0);
	const widths = natural.map((w) => total <= room ? w : Math.max(1, Math.floor(room * w / total)));
	return all.flatMap((cells, r) => {
		const style = r === 0 ? {
			...base,
			role: base.role ?? "text",
			bold: true
		} : base;
		const columns = widths.map((w, i) => block(inline(cells[i] ?? "", style), w));
		const height = Math.max(1, ...columns.map((column) => column.length));
		return Array.from({ length: height }, (_, y) => {
			const spans = [];
			columns.forEach((column, i) => {
				const cell = column[y]?.spans ?? [];
				const used = cell.reduce((n, s) => n + cellWidth(s.text), 0);
				const isLast = i === columns.length - 1;
				spans.push(...cell);
				if (!isLast) spans.push(span(" ".repeat(Math.max(0, (widths[i] ?? 0) - used)) + GAP$2));
			});
			return line(spans);
		});
	});
}
/**
* Markdown's blocks as lines of `width` cells: paragraphs, lists (bulleted, numbered, ticked,
* nested), headings, quotes, rules, fenced code and tables, with inline Markdown in each. One
* blank row between blocks, none between the items of a list or the lines of a paragraph.
*/
function prose(text, width, { isDim = false } = {}) {
	const base = isDim ? { role: "dim" } : {};
	const quiet = { role: "dim" };
	const out = [];
	/** A blank row before a block, unless it follows one or starts the text. */
	const gap = () => {
		const last = out[out.length - 1];
		if (last && (last.spans.length || last.slot)) out.push(blank());
	};
	const rows = text.replace(/\r\n?/g, "\n").split("\n");
	let paragraph = [];
	let wasItem = false;
	const flush = () => {
		if (!paragraph.length) return;
		gap();
		for (const words of paragraph) out.push(...block(inline(words, base), width));
		paragraph = [];
	};
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i] ?? "";
		const fence = FENCE.exec(row);
		if (fence) {
			flush();
			gap();
			const code = [];
			for (i++; i < rows.length && !(rows[i] ?? "").trim().startsWith(fence[1] ?? "```"); i++) code.push(rows[i] ?? "");
			for (const l of code) out.push(line([span(GAP$2), span(truncate(l, width - tokens.gutter), { role: "code" })]));
			wasItem = false;
			continue;
		}
		if (ROW.test(row)) {
			flush();
			gap();
			const from = i;
			while (i + 1 < rows.length && ROW.test(rows[i + 1] ?? "")) i++;
			out.push(...table(rows.slice(from, i + 1), width, base));
			wasItem = false;
			continue;
		}
		if (!row.trim()) {
			flush();
			wasItem = false;
			continue;
		}
		if (RULE.test(row)) {
			flush();
			gap();
			out.push(line([span(tokens.glyph.rule.repeat(width), { role: "border" })]));
			wasItem = false;
			continue;
		}
		const heading = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/.exec(row);
		if (heading) {
			flush();
			gap();
			out.push(...block(inline(heading[1] ?? "", {
				...base,
				role: base.role ?? "text",
				bold: true
			}), width));
			wasItem = false;
			continue;
		}
		const quote = /^\s*>\s?(.*)$/.exec(row);
		if (quote) {
			flush();
			const lead = [span(tokens.glyph.rail, quiet), span(" ")];
			if (!wasItem) gap();
			out.push(...block(inline(quote[1] ?? "", quiet), width, {
				lead,
				hang: lead
			}));
			wasItem = true;
			continue;
		}
		const item = ITEM.exec(row);
		if (item) {
			flush();
			if (!wasItem) gap();
			const [, indent = "", , number, tick, words = ""] = item;
			let rest = words;
			while (i + 1 < rows.length && /^\s+\S/.test(rows[i + 1] ?? "") && !ITEM.test(rows[i + 1] ?? "") && !FENCE.test(rows[i + 1] ?? "")) rest += ` ${(rows[++i] ?? "").trim()}`;
			const depth = Math.min(3, Math.floor(indent.replace(/\t/g, "  ").length / 2));
			const mark = tick !== void 0 ? span(tick === " " ? "[ ]" : "[x]", tick === " " ? quiet : { role: "success" }) : span(number ? `${number}.` : tokens.glyph.bullet, quiet);
			out.push(...block(inline(rest, base), width, { lead: [
				span(" ".repeat(depth * tokens.gutter)),
				mark,
				span(" ")
			] }));
			wasItem = true;
			continue;
		}
		wasItem = false;
		paragraph.push(row.trim());
	}
	flush();
	while (out.length && !out[out.length - 1]?.spans.length) out.pop();
	return out;
}

// src/lib/screen.ts
const TITLE = "Linear draft";
const DISCARD_PROMPT = "Discard draft?";
const FIELDS = [
	"team",
	"status",
	"priority",
	"labels",
	"project"
];
/** The letter that opens each field: Linear's own for status, priority and labels. */
const FIELD_KEY = {
	team: "T",
	status: "S",
	priority: "P",
	labels: "L",
	project: "J"
};
const FIELD_LABEL = {
	team: "Team",
	status: "Status",
	priority: "Priority",
	labels: "Labels",
	project: "Project"
};
const TITLE_KEY = "E";
const startView = (opens = false) => ({
	step: "review",
	top: 0,
	focus: 0,
	isConfirming: false,
	opens,
	since: 0
});
const HIT = {
	title: "title",
	duplicate: "duplicate",
	up: "scroll:up",
	down: "scroll:down",
	done: "act:done",
	opens: "act:opens",
	act: (name) => `act:${name}`
};
const GAP$1 = " ".repeat(tokens.gutter);
/** An Enter this soon after what it does changed was meant for what stood there before. */
const GRACE_MS = 600;
/** The key that keeps the draft, and the one that goes back, where Escape is not the screen's. */
const KEEP_KEY = "k";
/**
* Where letters are the answers' own, digits are free: one goes back, and one ticks the row
* under the pointer in a list with more rows than there are letters.
*/
const BACK_KEY = "0";
const TICK_KEY = "1";
/** The key that opens the description to be typed: the x of its button's "text". */
const BODY_KEY = "x";
/**
* Rows the description's field is given at least, its rules included, while the room has them:
* a short draft grows to be written in.
*/
const FIELD_ROWS = 12;
const isMultiple = (id) => id === "labels";
const optionsOf = (f, id) => id === "team" ? f.teams : id === "status" ? f.statuses : id === "priority" ? PRIORITIES : id === "labels" ? f.labels : f.projects;
const chosenOf = (f, id) => id === "team" ? [f.team] : id === "status" ? [f.state] : id === "priority" ? [String(f.priority)] : id === "labels" ? f.labelIds : [f.project];
function fieldRows(f, hover) {
	const chosen = f.labels.filter((l) => f.labelIds.includes(l.value)).map((l) => l.label);
	const values = {
		team: { value: labelOf(f.teams, f.team) ?? f.team },
		status: { value: labelOf(f.statuses, f.state) ?? "" },
		priority: {
			value: labelOf(PRIORITIES, String(f.priority)) ?? "No priority",
			empty: f.priority === 0
		},
		labels: {
			value: chosen.join(", ") || "None",
			empty: chosen.length === 0
		},
		project: f.project ? { value: labelOf(f.projects, f.project) ?? "" } : {
			value: "None",
			empty: true
		}
	};
	return FIELDS.map((id) => ({
		key: FIELD_KEY[id],
		label: FIELD_LABEL[id],
		hit: fieldHit(id),
		hovered: hover === fieldHit(id),
		...values[id]
	}));
}
/** The keys a list of choices has: a letter each while they last. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const choiceItems = (options) => options.map((o, i) => ({
	key: LETTERS[i] ?? "",
	text: o.label
}));
/** The column a pointer stands in, kept by every row so each step has one left edge. */
const MARGIN = CARD_INSET;
const KEYED = 1 + tokens.gutter;
/** The cells a row's words have: the room less the pointer's column. */
const innerOf = (room) => Math.max(8, room.width - MARGIN.length);
const set = (l, lead = span(MARGIN)) => l.spans.length ? {
	...l,
	spans: [lead, ...l.spans]
} : l;
const setAll = (lines) => lines.map((l) => set(l));
const keyRole = (isActive) => isActive ? "accent" : "dim";
const buttons = (all, room, lead = []) => setAll(buttonRow(all.filter((b) => Boolean(b)).map((b) => ({
	...b,
	hovered: b.hit !== void 0 && b.hit === room.hover
})), innerOf(room), {
	wrap: true,
	lead
}));
/** Rows a line takes: one, but for the client's text field, which may have several. */
const rowsOf = (l) => l.slot?.kind === "input" ? l.slot.rows ?? 1 : 1;
/** Lines to exactly `rows` rows: cut, or blank ones added, so the buttons under them stay put. */
function pad(lines, rows) {
	const out = [];
	let used = 0;
	for (const l of lines) {
		if (used + rowsOf(l) > rows) break;
		out.push(l);
		used += rowsOf(l);
	}
	for (; used < rows; used++) out.push(blank());
	return out;
}
const said = (text, role = "dim") => set(line([span(text, { role })]));
/** The title after its key, hanging from its first line. */
const titleLines = (f, room, max, isActive) => setAll(block(literal(f.title || "Untitled", {
	role: "text",
	bold: true
}), innerOf(room), {
	lead: [span(TITLE_KEY, room.hover === HIT.title ? {
		role: "text",
		bold: true
	} : { role: keyRole(isActive) }), span(GAP$1)],
	max,
	hit: HIT.title
}));
/** The description as it is filed, the line saying where it came from quiet under it. */
function description(f, room) {
	const text = prose(f.description, innerOf(room));
	const source = f.source ? block(inline(f.source.replace(/ · session \S+$/, ""), { role: "dim" }), innerOf(room), { max: 1 }) : [];
	return source.length ? [
		...text,
		blank(),
		...source
	] : text;
}
/** The row over the buttons: a duplicate found, the search for one, or that there is none. */
function noticeOf(f, room) {
	const inner = innerOf(room);
	if (f.duplicate) {
		const { issue, title } = f.duplicate;
		const words = [`${issue} may already cover this`, `${issue} may cover this`].find((w) => cellWidth(w) <= inner) ?? truncate(`${issue}?`, inner);
		const left = inner - cellWidth(words) - tokens.gutter;
		return set(line([span(words, {
			role: "warning",
			bold: room.hover === HIT.duplicate || void 0
		}), ...left > 8 ? [span(GAP$1 + truncate(title, left), { role: "dim" })] : []], HIT.duplicate));
	}
	return said(truncate(f.isCheckingDuplicates ? "Looking for an issue that already covers it…" : "No open issue seems to cover this", inner));
}
const errorLines = (f, room) => f.error ? clamp(f.error, innerOf(room), { max: 2 }).map((t) => said(t, "error")) : [];
const sending = () => [said("Sending to Linear…")];
/** Whether the issue is opened once it is filed: a box to tick, never a way to file. */
const opensButton = (view) => ({
	hotkey: "o",
	label: `${view.opens ? tokens.glyph.multi.on : tokens.glyph.multi.off} Then open in Linear`,
	hit: HIT.opens
});
/** The box of `opensButton` in the accent while it is ticked, as a chosen answer's mark is. */
const ticked = (lines) => lines.map((l) => ({
	...l,
	spans: l.spans.flatMap((s) => s.hit === HIT.opens && s.text.startsWith(tokens.glyph.multi.on) ? [{
		...s,
		text: tokens.glyph.multi.on,
		role: "accent",
		bold: true
	}, {
		...s,
		text: s.text.slice(tokens.glyph.multi.on.length)
	}] : [s])
}));
function reviewFooter(f, view, room) {
	if (f.phase === "filing") return sending();
	return [...errorLines(f, room), ...ticked(buttons([
		{
			hotkey: "enter",
			label: f.duplicate ? "Create…" : "Create",
			hit: HIT.act("create"),
			isLit: true
		},
		{
			hotkey: "x",
			label: "Edit text",
			hit: HIT.act("edit")
		},
		{
			hotkey: "d",
			label: "Discard",
			hit: HIT.act("discard")
		},
		opensButton(view)
	], room))];
}
const LAYOUTS = [
	{
		isInline: false,
		hasGap: true,
		bodyMin: 5
	},
	{
		isInline: true,
		hasGap: true,
		bodyMin: 3
	},
	{
		isInline: true,
		hasGap: false,
		bodyMin: 2
	},
	{
		isInline: true,
		hasGap: false,
		bodyMin: 0,
		isTight: true
	}
];
/** Rows a layout keeps over the description, and under it: a blank one, and the notice's. */
const over = (l) => l.isTight ? 0 : 1;
const under = (l, hasNotice) => (l.isTight ? 0 : 1) + (hasNotice ? 1 : 0);
/**
* Whether the draft's notice has its row: always, so the search ending moves nothing, but in
* the tightest room, where only a duplicate or the search for one is worth a row.
*/
const noticed = (f, l) => !l.isTight || Boolean(f.duplicate) || f.isCheckingDuplicates;
/**
* The fields side by side: all of them on one row, else without those that hold nothing. The
* tightest room never gives a row to a field that holds nothing.
*/
function inlineFields(f, room, isActive, isTight = false) {
	const all = fieldRows(f, room.hover).map((row) => row.hit === fieldHit("team") ? {
		...row,
		value: f.team
	} : row);
	const whole = fields(all, innerOf(room), {
		active: isActive,
		inline: true
	});
	if (whole.length <= 1 && !isTight) return whole;
	const held = fields(all.filter((row) => !row.empty), innerOf(room), {
		active: isActive,
		inline: true
	});
	return isTight || held.length < whole.length ? held : whole;
}
/** The rows over the description in a layout: the title and the fields. */
function headOf(f, room, l, reserved, open) {
	const isActive = room.isActive && !open;
	const rows = open ? fields(fieldRows(f, room.hover).filter((row) => !l.isInline || row.hit === fieldHit(open)), innerOf(room), { active: isActive }) : l.isInline ? inlineFields(f, room, isActive, l.isTight) : fields(fieldRows(f, room.hover), innerOf(room), { active: isActive });
	const cue = l.isTight && !open && f.description.trim() ? 1 : 0;
	const max = Math.max(1, room.rows - rows.length - (l.hasGap ? 1 : 0) - reserved - cue);
	return [
		...open && l.isTight ? [] : titleLines(f, room, max, isActive),
		...l.hasGap ? [blank()] : [],
		...setAll(rows)
	];
}
/** The rows the draft takes in this room, which its own steps keep so nothing jumps. */
function heightOf(f, view, room) {
	const footer = reviewFooter({
		...f,
		phase: "ready",
		error: null
	}, {
		...view,
		isConfirming: false
	}, room);
	const text = description(f, room);
	let height = room.rows;
	for (const l of LAYOUTS) {
		const reserved = under(l, noticed(f, l)) + footer.length;
		const fixed = headOf(f, room, l, reserved).length + over(l) + reserved;
		height = fixed + Math.min(text.length, Math.max(0, room.rows - fixed));
		if (room.rows - fixed >= Math.min(l.bodyMin, text.length)) break;
	}
	return Math.max(1, Math.min(room.rows, height));
}
/** The window of `lines` that keeps `at` in sight. */
function following(lines, rows, at) {
	if (rows <= 2) return scrolled(lines, {
		rows,
		top: at
	});
	let top = Math.max(0, at - Math.floor(rows / 2));
	for (let tries = 0; tries < 4; tries++) {
		const w = scrolled(lines, {
			rows,
			top
		});
		const from = w.top > 0 ? w.top + 1 : 0;
		const to = from + w.rows.length - (w.top > 0 ? 1 : 0) - (w.top < w.max ? 1 : 0);
		if (at < from) top = Math.max(0, w.top - 1);
		else if (at >= to) top = w.top + 1;
		else return w;
	}
	return scrolled(lines, {
		rows,
		top
	});
}
/** A field's choices, set in under its row, a row each so their window counts answers. */
function choicesOf(f, id, view, room) {
	const options = optionsOf(f, id);
	const chosen = chosenOf(f, id);
	const width = innerOf(room) - KEYED;
	return choiceList({
		items: choiceItems(options).map((item) => ({
			...item,
			text: truncate(item.text, Math.max(1, width - 8))
		})),
		chosen: options.flatMap((o, i) => chosen.includes(o.value) ? [i] : []),
		focus: view.focus,
		hover: choiceOf(room.hover) >= 0 ? choiceOf(room.hover) : void 0,
		multiple: isMultiple(id),
		active: room.isActive
	}, width);
}
const pickFooter = (id, room) => isMultiple(id) ? buttons([{
	hotkey: "enter",
	label: "Done",
	hit: HIT.done,
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "space" : TICK_KEY,
	label: "Tick",
	hit: HIT.act("choose")
}], room) : buttons([{
	hotkey: "enter",
	label: "Choose",
	hit: HIT.act("choose"),
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
	label: "Back",
	hit: HIT.act("back")
}], room);
function review(f, view, room) {
	const isTyping = view.step === "title";
	const open = typeof view.step === "object" ? view.step.pick : void 0;
	const footer = isTyping ? buttons([{
		hotkey: "enter",
		label: "Save",
		hit: HIT.act("save"),
		isLit: true
	}, {
		hotkey: room.hasAllKeys ? "esc" : "",
		label: "Cancel",
		hit: HIT.act("back")
	}], room) : open ? pickFooter(open, room) : reviewFooter(f, view, room);
	const isOwn = !isTyping && !open;
	let hasNotice = isOwn;
	const height = heightOf(f, view, room);
	const text = description(f, room);
	const choices = open ? choicesOf(f, open, view, room) : [];
	let head = [];
	let rest = 0;
	let budget = 1;
	let layout = LAYOUTS[0];
	for (const l of LAYOUTS) {
		layout = l;
		hasNotice = isOwn && noticed(f, l);
		head = headOf(f, room, l, under(l, hasNotice) + footer.length, open);
		const wanted = head.length + choices.length + under(l, hasNotice) + footer.length;
		budget = Math.max(1, Math.min(room.rows, Math.max(height, wanted)) - under(l, hasNotice) - footer.length);
		rest = budget - head.length - over(l);
		if (rest >= (open ? Math.min(3, choices.length) : Math.min(l.bodyMin, text.length))) break;
	}
	const titled = head.filter((l) => l.hit === HIT.title).length;
	if (isTyping) rest -= (room.fieldRows ?? 1) + 1 - titled;
	rest = Math.max(0, rest);
	const textRows = Math.max(0, rest - choices.length);
	const nested = span(MARGIN + " ".repeat(KEYED));
	const list = open ? following(choices, textRows ? choices.length : rest + over(layout), view.focus).rows.map((l) => set(l, nested)) : [];
	const window = scrolled(text, {
		rows: textRows,
		top: view.top,
		hits: {
			up: HIT.up,
			down: HIT.down
		},
		hovered: room.hover === HIT.up ? "up" : room.hover === HIT.down ? "down" : void 0
	});
	if (isTyping) {
		const lead = [
			span(MARGIN),
			span(TITLE_KEY, { role: keyRole(room.isActive) }),
			span(GAP$1)
		];
		const width = Math.max(1, room.width - spansWidth(lead));
		head = [
			slotLine({
				kind: "input",
				lead,
				width,
				rows: room.fieldRows ?? 1
			}),
			line([span(" ".repeat(spansWidth(lead))), span(tokens.glyph.rule.repeat(width), { role: "border" })]),
			...head.slice(titled)
		];
	}
	const at = open ? head.map((l) => l.hit).lastIndexOf(fieldHit(open)) + 1 : head.length;
	return {
		body: [...pad([
			...head.slice(0, at),
			...list,
			...head.slice(at),
			...textRows ? [...layout.isTight ? [] : [blank()], ...setAll(window.rows)] : []
		], budget), ...layout.isTight ? [] : [blank()]],
		notice: hasNotice ? noticeOf(f, room) : void 0,
		footer,
		window: {
			top: window.top,
			max: window.max,
			page: Math.max(1, textRows - 2)
		}
	};
}
/**
* The description being typed, as the Markdown it is filed as: the client's own field of
* several rows, under the title alone so it has every row the fields and the notice gave up.
* The client draws the field's rules with it, since each field has its own.
*/
function writing(f, view, room) {
	const footer = buttons([
		{
			hotkey: "enter",
			label: "Save",
			hit: HIT.act("save"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : "",
			label: "Cancel",
			hit: HIT.act("back")
		},
		...room.newline ? [{
			hotkey: room.newline,
			label: "new line"
		}] : []
	], room);
	const gap = room.rows - footer.length >= 7 ? 1 : 0;
	const title = (max) => titleLines(f, room, max, false);
	const wanted = title(2).length + gap + FIELD_ROWS + gap + footer.length;
	const height = Math.min(room.rows, Math.max(heightOf(f, view, room), wanted));
	const budget = Math.max(1, height - gap - footer.length);
	const head = budget >= 6 ? [...title(budget >= 9 ? 2 : 1), ...gap ? [blank()] : []] : [];
	const lead = room.isFieldFlush ? [] : [span(MARGIN)];
	return {
		body: [
			...head,
			slotLine({
				kind: "input",
				lead,
				width: Math.max(1, room.width - spansWidth(lead)),
				rows: Math.max(1, budget - head.length)
			}),
			...gap ? [blank()] : []
		],
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** How far along an issue is, from Linear's kind of status. */
const STATUS = {
	triage: "In triage",
	backlog: "Backlog",
	unstarted: "Not started",
	started: "In progress"
};
/** The answers to a duplicate: a comment on the issue there is, or the new one anyway. */
const ANSWERS = 2;
/**
* The page a duplicate is decided on. What Enter sends is always in sight: both answers and the
* comment come first, and what the issue says of itself gives way to them row by row.
*/
function duplicate(f, view, room) {
	const d = f.duplicate;
	if (!d) return review(f, {
		...view,
		step: "review"
	}, room);
	const footer = f.phase === "filing" ? sending() : [...errorLines(f, room), ...ticked(buttons([
		{
			hotkey: "enter",
			label: view.focus === 0 ? "Send comment" : "Create issue",
			hit: HIT.act("send"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
			label: "Back",
			hit: HIT.act("back")
		},
		opensButton(view)
	], room))];
	const inner = innerOf(room);
	const gap = room.rows - footer.length >= 7 ? 1 : 0;
	const budget = Math.max(1, room.rows - gap - footer.length);
	const answer = (index, text, detail) => choice({
		key: LETTERS[index] ?? "",
		text,
		detail,
		detailLines: 1,
		chosen: view.focus === index,
		focused: view.focus === index,
		active: room.isActive,
		hovered: room.hover === choiceHit(index),
		hit: choiceHit(index)
	}, room.width);
	const under = [span(" ".repeat(6)), span(`${tokens.glyph.rail} `, { role: "dim" })];
	const posted = block(inline(d.comment, { role: "text" }), room.width, {
		lead: under,
		hang: under,
		hit: choiceHit(0)
	});
	const comment = (max) => posted.length <= max ? posted : [...posted.slice(0, Math.max(0, max - 1)), line([...under, span(`${posted.length - Math.max(0, max - 1)} more rows`, { role: "dim" })], choiceHit(0))];
	const answers = (max = 1e400, hasDetail = true) => [
		...answer(0, `Comment on ${d.issue} instead`),
		...comment(max),
		...answer(1, "Create the new issue anyway", hasDetail ? f.title : void 0)
	];
	const warning = `${d.issue} may already cover this`;
	const meta = [d.team, STATUS[d.status ?? ""]].filter(Boolean).join(" · ");
	const title = (max) => setAll(block(literal(d.title, {
		role: "text",
		bold: true
	}), inner, { max }));
	const heads = [
		[
			said(truncate(warning, inner), "warning"),
			...title(2),
			...meta ? [said(meta)] : [],
			...d.about ? setAll(block(literal(d.about, { role: "dim" }), inner, { max: 3 })) : [],
			blank()
		],
		[
			said(truncate(warning, inner), "warning"),
			...title(2),
			...meta ? [said(meta)] : [],
			blank()
		],
		[said(truncate(warning, inner), "warning"), ...title(1)],
		[set(line([span(d.issue, { role: "warning" }), span(GAP$1 + truncate(d.title, Math.max(1, inner - cellWidth(d.issue) - GAP$1.length)), { role: "dim" })]))]
	];
	const cut = Array.from({ length: Math.max(1, budget) }, (_, i) => Math.max(1, budget - i));
	return {
		body: [...[
			...heads.map((head) => [...head, ...answers()]),
			answers(),
			answers(1e400, false),
			...cut.map((max) => answers(max, false))
		].find((l, i, all) => l.length <= budget || i === all.length - 1) ?? [], ...gap ? [blank()] : []],
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** What is being filed from, quiet, so the wait shows it was heard. */
const seedLines = (f, room, max) => {
	const text = f.seed.text.trim();
	if (!text) return [said("From the recent conversation")];
	return [said(f.seed.kind === "note" ? "From your note" : "From what was flagged"), ...clamp(text, innerOf(room), { max }).map((t) => said(t))];
};
/**
* A page that waits or failed: what it says, then the note it has, then a blank row over the
* buttons. A room too short for the note's words leaves its heading out too.
*/
function withSeed(lines, f, room, footerRows) {
	const rows = Math.max(1, room.rows - footerRows);
	const said_ = lines.slice(0, rows);
	const left = rows - said_.length - 2;
	const seed = left >= 2 ? seedLines(f, room, left - 1) : [];
	return [
		...said_,
		...seed.length ? [blank(), ...seed] : [],
		...rows > said_.length ? [blank()] : []
	];
}
function drafting(f, view, room) {
	const step = (label, state) => set(line([state === "done" ? span(`${tokens.glyph.done} `, { role: "success" }) : span(state === "now" ? `${tokens.glyph.bullet} ` : "  ", {
		role: "text",
		bold: true
	}), span(truncate(label, innerOf(room) - 2), state === "now" ? {
		role: "text",
		bold: true
	} : { role: "dim" })]));
	const isWriting = f.stage === "writing";
	const footer = buttons([{
		hotkey: "d",
		label: "Discard",
		hit: HIT.act("discard")
	}], room);
	return {
		body: withSeed([step("Reading your teams and labels", isWriting ? "done" : "now"), step("Writing the issue", isWriting ? "now" : "next")], f, room, footer.length),
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
function failed(f, view, room) {
	const footer = buttons([{
		hotkey: "enter",
		label: "Try again",
		hit: HIT.act("retry"),
		isLit: true
	}, {
		hotkey: "d",
		label: "Discard",
		hit: HIT.act("discard")
	}], room);
	return {
		body: withSeed([set(line([span("The draft was not written", {
			role: "error",
			bold: true
		})])), ...clamp(f.error ?? "Something went wrong", innerOf(room), { max: 4 }).map((t) => said(t, "text"))], f, room, footer.length),
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** The screen for `form` in `room`. */
function draw(form, view, room) {
	const quiet = view.isConfirming ? {
		...room,
		isActive: false,
		hover: void 0
	} : room;
	const calm = {
		...view,
		isConfirming: false
	};
	const drawn = (() => {
		if (!form) return {
			body: [said("No Linear draft open.")],
			footer: [],
			window: {
				top: 0,
				max: 0,
				page: 1
			}
		};
		if (form.phase === "drafting") return drafting(form, calm, quiet);
		if (form.phase === "failed") return failed(form, calm, quiet);
		if (view.step === "duplicate") return duplicate(form, calm, quiet);
		if (view.step === "body") return writing(form, calm, quiet);
		return review(form, calm, quiet);
	})();
	return {
		...drawn,
		footer: view.isConfirming ? stilled(drawn.footer) : drawn.footer,
		close: {
			confirming: view.isConfirming,
			question: DISCARD_PROMPT,
			keep: room.hasAllKeys ? "esc" : KEEP_KEY
		}
	};
}
/** Rows that stand quiet while a question elsewhere waits for its answer: dim, and no controls. */
const stilled = (lines) => lines.map((l) => line(l.spans.map(({ text }) => span(text, { role: "dim" }))));
/** What choosing `option` of a field does to the draft. */
function chooseEffect(f, id, option) {
	switch (id) {
		case "team": return {
			do: "team",
			team: option.value
		};
		case "status": return {
			do: "set",
			patch: { state: option.value }
		};
		case "priority": return {
			do: "set",
			patch: { priority: Number(option.value) }
		};
		case "project": return {
			do: "set",
			patch: { project: option.value }
		};
		case "labels": return {
			do: "set",
			patch: { labelIds: f.labelIds.includes(option.value) ? f.labelIds.filter((l) => l !== option.value) : [...f.labelIds, option.value] }
		};
	}
}
/**
* What `intent` does on the screen as it was `drawn`: the view after it, and what the client
* has to do.
* @param now The time, where the client has one: an Enter that would write to Linear is
* ignored for a moment after what it does changed, as one typed for what stood there before.
*/
function act(form, view, intent, drawn, now) {
	const none = {
		view,
		effects: []
	};
	const to = (step, more = {}) => ({
		view: {
			...view,
			...more,
			step,
			since: now ?? 0
		},
		effects: []
	});
	const isEarly = (...since) => now !== void 0 && since.some((at) => now - at < GRACE_MS && now >= at);
	const hide = {
		view: {
			...view,
			isConfirming: false
		},
		effects: [{ do: "hide" }]
	};
	if (!form) return "escape" in intent ? hide : none;
	const hit = "hit" in intent ? intent.hit : void 0;
	const key = "key" in intent ? intent.key : void 0;
	const close = closeOf(hit);
	if (close === "close") return hide;
	if (view.isConfirming) {
		if (("enter" in intent || close === "discard") && !isEarly(view.since)) return {
			view: startView(view.opens),
			effects: [{ do: "discard" }]
		};
		if ("enter" in intent || close === "discard" || "move" in intent || "scroll" in intent) return none;
		return {
			view: {
				...view,
				isConfirming: false
			},
			effects: []
		};
	}
	if (form.phase === "filing") return "escape" in intent ? hide : none;
	const isTyping = view.step === "title" || view.step === "body";
	if (key === "d" && view.step !== "duplicate" && typeof view.step !== "object") {
		if (!isTyping) return {
			view: {
				...view,
				isConfirming: true,
				since: now ?? 0
			},
			effects: []
		};
	}
	if (hit === HIT.act("discard")) return {
		view: {
			...view,
			isConfirming: true,
			since: now ?? 0
		},
		effects: []
	};
	if (form.phase === "drafting" || form.phase === "failed") {
		if ("escape" in intent) return hide;
		if (form.phase === "failed" && ("enter" in intent || hit === HIT.act("retry"))) return {
			view: startView(view.opens),
			effects: [{ do: "retry" }]
		};
		return none;
	}
	if (key === "o" && (view.step === "review" || view.step === "duplicate")) return {
		view: {
			...view,
			opens: !view.opens
		},
		effects: []
	};
	if (hit === HIT.opens) return {
		view: {
			...view,
			opens: !view.opens
		},
		effects: []
	};
	if (typeof view.step === "object") {
		const id = view.step.pick;
		const options = optionsOf(form, id);
		const multiple = isMultiple(id);
		const back = to("review", { focus: 0 });
		const choose = (index) => {
			const option = options[index];
			if (!option) return none;
			const effect = chooseEffect(form, id, option);
			return multiple ? {
				view: {
					...view,
					focus: index
				},
				effects: [effect]
			} : {
				...back,
				effects: chosenOf(form, id).includes(option.value) ? [] : [effect]
			};
		};
		const count = Math.max(1, options.length);
		if ("move" in intent) return {
			view: {
				...view,
				focus: ((view.focus + intent.move) % count + count) % count
			},
			effects: []
		};
		if ("scroll" in intent) return act(form, view, { move: Math.sign(intent.scroll) }, drawn, now);
		if ("escape" in intent || hit === HIT.done || hit === HIT.act("back")) return back;
		if (key === BACK_KEY) return back;
		if ("enter" in intent) return multiple ? back : choose(view.focus);
		if ("space" in intent || hit === HIT.act("choose")) return choose(view.focus);
		if (key === TICK_KEY && multiple) return choose(view.focus);
		if (key !== void 0) {
			const at = choiceItems(options).findIndex((item) => item.key.toLowerCase() === key);
			return at < 0 ? none : choose(at);
		}
		const at = choiceOf(hit);
		if (at >= 0) return choose(at);
		const other = fieldOf(hit);
		if (other === id) return back;
		if (other && FIELDS.includes(other)) return openPick(form, to("review").view, other);
		if (hit === HIT.title) return to("title");
		return none;
	}
	if (isTyping) {
		if ("text" in intent) return {
			...to("review", view.step === "body" ? { top: 0 } : {}),
			effects: [{
				do: "set",
				patch: {
					...view.step === "body" ? { description: intent.text.replace(/\r\n?/g, "\n").trim() } : { title: intent.text.replace(/\s*\n\s*/g, " ").trim() || form.title },
					fieldRevision: form.fieldRevision + 1
				}
			}]
		};
		if ("escape" in intent || "enter" in intent || hit === HIT.act("back")) return {
			...to("review"),
			effects: [{
				do: "set",
				patch: { fieldRevision: form.fieldRevision + 1 }
			}]
		};
		return none;
	}
	if (view.step === "duplicate" && form.duplicate) {
		if ("escape" in intent || hit === HIT.act("back") || key === BACK_KEY) return to("review");
		if ("move" in intent) return {
			view: {
				...view,
				focus: (view.focus + 1) % ANSWERS
			},
			effects: []
		};
		if (key === "a" || key === "b") return {
			view: {
				...view,
				focus: key === "a" ? 0 : 1
			},
			effects: []
		};
		const at = choiceOf(hit);
		if (at >= 0 && at < ANSWERS) return {
			view: {
				...view,
				focus: at
			},
			effects: []
		};
		if ("enter" in intent || hit === HIT.act("send")) return isEarly(view.since) ? none : {
			view,
			effects: [{
				do: view.focus === 0 ? "comment" : "create",
				open: view.opens
			}]
		};
		return none;
	}
	const window = drawn?.window ?? {
		top: view.top,
		max: 1e400,
		page: 3
	};
	const step = (by) => ({
		view: {
			...view,
			top: scrollBy(window, by)
		},
		effects: []
	});
	if ("escape" in intent) return hide;
	if ("enter" in intent || hit === HIT.act("create")) {
		if (isEarly(form.settledAt, view.since)) return none;
		if (form.duplicate) return to("duplicate", { focus: 0 });
		return {
			view,
			effects: [{
				do: "create",
				open: view.opens
			}]
		};
	}
	if (hit === HIT.duplicate && form.duplicate) return to("duplicate", { focus: 0 });
	if ("move" in intent) return step(intent.move * 3);
	if ("scroll" in intent) return step(intent.scroll);
	if (hit === HIT.up) return step(-window.page);
	if (hit === HIT.down) return step(window.page);
	if (key === TITLE_KEY.toLowerCase() || hit === HIT.title) return to("title");
	if (key === "x" || hit === HIT.act("edit")) return to("body");
	const field = FIELDS.find((id) => FIELD_KEY[id].toLowerCase() === key) ?? fieldOf(hit);
	if (field && FIELDS.includes(field)) return openPick(form, to("review").view, field);
	return none;
}
function openPick(f, view, id) {
	const at = optionsOf(f, id).findIndex((o) => chosenOf(f, id).includes(o.value));
	return {
		view: {
			...view,
			step: { pick: id },
			focus: Math.max(0, at)
		},
		effects: []
	};
}

// src/pi/chip.ts
/** How /linear is typed: the line's way back for the keyboard. */
const OPEN_KEY = "/linear";
var DraftChip = class {
	theme;
	read;
	press;
	cells = [];
	hover;
	constructor(theme, read, press) {
		this.theme = theme;
		this.read = read;
		this.press = press;
	}
	invalidate() {}
	render(width) {
		const state = this.read();
		if (!state) {
			this.cells = [];
			this.hover = void 0;
			return [];
		}
		const drawn = draftChip(state.form, width, {
			openKey: OPEN_KEY,
			discardKey: "",
			isArmed: state.isArmed,
			hover: this.hover
		});
		const painted = paintLines(this.theme, [drawn], width);
		this.cells = painted.cells[0] ?? [];
		return painted.lines;
	}
	handleMouse(event) {
		const hit = event.y === 0 ? cellAt(this.cells, event.x)?.hit : void 0;
		if (event.type === "move") {
			if (hit === this.hover) return void 0;
			this.hover = hit;
			return {
				handled: true,
				render: true
			};
		}
		if (hit === void 0 || event.button !== "left") return void 0;
		if (event.type === "click") this.press(hit);
		return event.type === "press" || event.type === "click" ? { handled: true } : void 0;
	}
};
/**
* Rows from the prompt's top rule to the bottom of the terminal: the prompt, and whatever pi
* draws under it. pi stacks its screen as one list, with the widgets above the prompt as the
* entry before it, so everything after the entry holding `mark` is counted. Nothing when pi's
* screen is not laid out that way (pi 1.5.2 is): the caller then keeps to the bottom edge.
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

// src/pi/linear.ts
/**
* Linear's MCP tools for a command. pi runs a tool for the model or for another tool
* (`ctx.executeTool`), never for a command, so there is no asking the session's own connection.
* This starts pi's MCP support a second time, for the Linear servers alone, on a host that only
* keeps the tools it registers: the same `mcp.json`, the same stored sign-in and token refresh,
* and nothing declared to the model.
*/
const LINEAR = /linear/i;
const TOOL = /^mcp__(.*linear.*)__([^_].*)$/i;
/** How long a call waits for a server that is still connecting. */
const CONNECT_MS = 1e4;
/** The Linear servers of one `mcp.json`. */
function serversIn(file, scope) {
	if (!existsSync(file)) return [];
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		return Object.entries(parsed.mcpServers ?? {}).filter(([name]) => LINEAR.test(name)).map(([name, config]) => ({
			name,
			config,
			source: file,
			scope
		}));
	} catch {
		return [];
	}
}
function linearBridge(pi) {
	const tools = /* @__PURE__ */ new Map();
	const handlers = /* @__PURE__ */ new Map();
	let started;
	const entries = (ctx) => {
		const global = serversIn(join(getAgentDir(), "mcp.json"), "global");
		const project = ctx.isProjectTrusted() ? serversIn(join(ctx.cwd, ".pi", "mcp.json"), "project") : [];
		return [...new Map([...global, ...project].map((e) => [e.name, e])).values()].filter((e) => e.config.enabled !== false);
	};
	const host = new Proxy({
		on: (event, handler) => {
			handlers.set(event, [...handlers.get(event) ?? [], handler]);
			return () => void 0;
		},
		registerTool: (tool) => void tools.set(tool.name, tool),
		getAllTools: () => [...tools.values()],
		getActiveTools: () => [],
		setActiveTools: () => void 0,
		getMcpServers: () => pi.getMcpServers().filter((server) => LINEAR.test(server.name))
	}, { get: (target, key) => target[key] ?? (() => void 0) });
	/** The session as the second MCP support sees it: it reports its trouble here, not to the person. */
	const quiet = (ctx) => new Proxy(ctx, { get: (target, key) => key === "ui" ? new Proxy(target.ui, { get: (ui, name) => name === "notify" ? () => void 0 : Reflect.get(ui, name, ui) }) : key === "hasUI" ? false : Reflect.get(target, key, target) });
	const emit = async (event, ctx) => {
		for (const handler of handlers.get(event) ?? []) await handler({}, ctx);
	};
	const start = async (ctx) => {
		if (started) return;
		started = ctx;
		createMcpExtension({ loadConfig: () => ({
			servers: entries(ctx),
			errors: [],
			autoEnableCodemode: false
		}) })(host);
		await emit("session_start", quiet(ctx));
	};
	const find = (tool) => [...tools.values()].find((t) => {
		const m = TOOL.exec(t.name);
		return m?.[2] === tool && tools.has(`mcp__${m[1]}__save_issue`);
	});
	return {
		isConfigured: (ctx) => entries(ctx).length > 0 || host.getMcpServers().length > 0,
		async call(ctx, tool, args) {
			if (!this.isConfigured(ctx)) throw new Error(NO_LINEAR);
			await start(ctx);
			const deadline = Date.now() + CONNECT_MS;
			while (!find(tool) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
			const found = find(tool);
			if (!found) throw new Error(NO_LINEAR);
			const result = await found.execute(`linear-issue-${Date.now()}`, args, void 0, void 0, quiet(ctx));
			const text = result.content.map((c) => "text" in c ? c.text : "").join("\n");
			if (result.isError) throw new Error(text.slice(0, 200) || `${tool} failed`);
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		},
		async close(ctx) {
			if (!started) return;
			started = void 0;
			tools.clear();
			await emit("session_shutdown", quiet(ctx)).catch(() => void 0);
			handlers.clear();
		}
	};
}

// ../../lib/kits/sheet/src/contract.ts
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

// src/pi/sheet.ts
/**
* The draft as a sheet over the transcript: the shared screen in the kit's sheet, painted for
* pi. It stands on the rule over the prompt, so the prompt stays in sight in front of it.
*/
/** Rows of the terminal the sheet leaves above it, so what it was opened over stays in sight. */
const ABOVE = 1;
const WHEEL_LINES = 3;
/** The key that breaks a line in pi's editor, as its prompt has it. */
const NEWLINE = "shift+enter";
/** Lines pi's editor shows at least, and the share of the terminal's rows it shows at most. */
const EDITOR_MIN = 5;
const EDITOR_SHARE = .3;
/**
* The sheet's width on a terminal `columns` wide: what Claude Code gives a pane beside the
* transcript there, a little under half, between the dialog and the reading width classes.
*/
const sheetWidth = (columns) => Math.max(1, Math.min(columns - 2, Math.max(widthCap("dialog", columns), Math.min(tokens.width.reading, Math.floor(columns * .42)))));
/**
* Where the sheet stands: centred, its foot `below()` rows over the bottom edge, as wide as a
* Claude Code pane is, so both clients draw the draft in the same room. pi asks an extension
* for an overlay's options once and reads them at every render, so each is read as it is asked
* for: the terminal's size and the prompt's height change under an open sheet.
*/
const sheetOptions = (tui, below) => ({
	anchor: "bottom-center",
	get width() {
		return sheetWidth(tui.terminal.columns);
	},
	get maxHeight() {
		return Math.max(1, tui.terminal.rows - ABOVE - below());
	},
	get margin() {
		return { bottom: below() };
	}
});
/** The terminal height at which pi's editor shows exactly `lines` lines of what it holds. */
const rowsShowing = (lines) => {
	let rows = Math.ceil(lines / EDITOR_SHARE);
	while (Math.floor(rows * EDITOR_SHARE) < lines) rows++;
	return rows;
};
var DraftSheet = class {
	tui;
	theme;
	state;
	send;
	below;
	input = new Input({
		prompt: "",
		placeholder: "Title"
	});
	editor;
	/** Lines the editor is to show: it sizes itself by the terminal's height, so it is told one. */
	editorLines = EDITOR_MIN;
	drawn;
	painted;
	/** Where the description's field was painted, for a click in it. */
	field;
	hover;
	isFocused = false;
	typing;
	constructor(tui, theme, state, send, below) {
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.send = send;
		this.below = below;
		const rows = () => rowsShowing(this.editorLines);
		this.editor = new Editor({
			requestRender: () => tui.requestRender(),
			terminal: { get rows() {
				return rows();
			} }
		}, {
			borderColor: (text) => paintText(theme, text, { role: "border" }),
			selectList: getSelectListTheme()
		});
		this.editor.onSubmit = (text) => this.act({ text });
	}
	get focused() {
		return this.isFocused;
	}
	set focused(value) {
		this.isFocused = value;
		this.focusFields();
	}
	focusFields() {
		const { step } = this.state().view;
		this.input.focused = this.isFocused && step === "title";
		this.editor.focused = this.isFocused && step === "body";
	}
	invalidate() {}
	render(width) {
		const { form, view } = this.state();
		const step = view.step === "title" || view.step === "body" ? view.step : void 0;
		if (step === "title" && this.typing !== step) {
			this.input.setValue(form?.title ?? "");
			this.input.handleInput("");
		}
		if (step === "body" && this.typing !== step) this.editor.setText(form?.description ?? "");
		this.typing = step;
		this.focusFields();
		const below = this.below();
		const foot = below > 0 ? "none" : "edge";
		const rows = Math.max(8, this.tui.terminal.rows - ABOVE - below) - sheetChrome(foot);
		const drawn = draw(form, view, {
			width: sheetRoom(width),
			rows,
			isActive: true,
			hasAllKeys: true,
			fieldRows: 1,
			newline: NEWLINE,
			hover: this.hover
		});
		this.drawn = drawn;
		const lines = sheet({
			width,
			title: TITLE,
			close: {
				...drawn.close,
				hover: closeOf(this.hover)
			},
			body: drawn.body,
			notice: drawn.notice,
			footer: drawn.footer,
			foot
		});
		const painted = paintLines(this.theme, lines, width, { fill: true });
		this.field = void 0;
		for (const field of painted.fields) {
			const set = (row, text) => {
				painted.lines[field.row + row] = (row ? field.hang : field.lead) + fitPainted(text, field.width) + field.tail;
			};
			if (step !== "body") {
				set(0, this.input.render(field.width)[0] ?? "");
				continue;
			}
			this.field = {
				row: field.row,
				x: paintedWidth(field.lead),
				width: field.width,
				rows: field.rows
			};
			this.writing(field.rows, field.width).forEach((text, row) => set(row, text));
		}
		this.painted = painted;
		return painted.lines;
	}
	/**
	* The editor in exactly `rows` rows: its own rules first and last, which count the lines
	* scrolled past, and blank rows over the last while what it holds is shorter.
	*/
	writing(rows, width) {
		this.editorLines = Math.max(EDITOR_MIN, rows - 2);
		const all = this.editor.render(width);
		const text = all.slice(1, -1).slice(0, Math.max(0, rows - 2));
		const blank = Array.from({ length: Math.max(0, rows - 2 - text.length) }, () => "");
		return [
			all[0] ?? "",
			...text,
			...blank,
			all.at(-1) ?? ""
		].slice(0, rows);
	}
	act(intent) {
		this.send(intent, this.drawn);
		this.tui.requestRender();
	}
	handleInput(data) {
		const { view } = this.state();
		if (matchesKey(data, "ctrl+c")) return this.act({ escape: true });
		if ((view.step === "title" || view.step === "body") && !view.isConfirming) {
			if (matchesKey(data, Key.escape)) return this.act({ escape: true });
			if (view.step === "body") this.editor.handleInput(data);
			else {
				if (matchesKey(data, Key.enter)) return this.act({ text: this.input.getValue() });
				this.input.handleInput(data);
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter)) return this.act({ enter: true });
		if (matchesKey(data, Key.escape)) return this.act({ escape: true });
		if (matchesKey(data, Key.space)) return this.act({ space: true });
		if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) return this.act({ move: -1 });
		if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) return this.act({ move: 1 });
		const page = this.drawn?.window.page ?? 5;
		if (matchesKey(data, Key.pageUp)) return this.act({ scroll: -page });
		if (matchesKey(data, Key.pageDown)) return this.act({ scroll: page });
		if (/^[a-zA-Z0-9]$/.test(data)) return this.act({ key: data.toLowerCase() });
	}
	handleMouse(event) {
		const field = this.field;
		if (field && event.y >= field.row && event.y < field.row + field.rows && event.x >= field.x && event.x < field.x + field.width) {
			const result = this.editor.handleMouse({
				...event,
				x: event.x - field.x,
				y: event.y - field.row,
				width: field.width,
				height: field.rows
			});
			if (result) this.tui.requestRender();
			return result ? { handled: true } : void 0;
		}
		if (event.type === "wheel") {
			this.act({ scroll: Math.sign(event.wheelDelta ?? 0) * WHEEL_LINES });
			return { handled: true };
		}
		const hit = cellAt(this.painted?.cells[event.y], event.x)?.hit;
		if (event.type === "move") {
			if (hit === this.hover) return void 0;
			this.hover = hit;
			this.tui.requestRender();
			return {
				handled: true,
				render: true
			};
		}
		if (event.type !== "click" || event.button !== "left") return void 0;
		if (hit === void 0) return { handled: true };
		this.act({ hit });
		return { handled: true };
	}
};
const DONE_MARK = tokens.glyph.done;

// src/pi.ts
/**
* /linear in pi: drafts a Linear issue from a note or the recent conversation, shows it in a
* sheet over the transcript to review, and files it. The draft and what a key does are the
* shared core's; this half gives it pi's model, Linear's MCP tools and the sheet.
*/
const WIDGET = "linear-issue";
const FILED = "linear-issue-filed";
const GAP = " ".repeat(tokens.gutter);
/** How long a first press on the line's Discard waits for the second, which discards. */
const DISCARD_ARM_MS = 5e3;
/** What the last filed issue used, kept beside pi's own settings. */
const lastFile = () => join(getAgentDir(), "linear-issue.json");
const readLast = () => {
	try {
		return JSON.parse(readFileSync(lastFile(), "utf8"));
	} catch {
		return;
	}
};
/** One message's words, whatever blocks it is made of. */
function textOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block) => block.type === "text" ? block.text : "").filter(Boolean).join("\n");
}
/** An issue filed, as a row of the transcript: its key, its title and where it is. */
const filedLines = (f, width) => [line([
	span(`${DONE_MARK} `, { role: "success" }),
	span(f.key, {
		role: "text",
		bold: true
	}),
	span(GAP),
	span(truncate(f.title, Math.max(4, width - f.key.length - 2 - GAP.length)), { role: "text" })
]), ...f.url ? [line([span(`  ${truncate(f.url, Math.max(4, width - 2))}`, { role: "link" })])] : []];
function linearIssue(pi) {
	const linear = linearBridge(pi);
	const teams = /* @__PURE__ */ new Map();
	let form = null;
	let isSending = false;
	let view = startView();
	/** The open sheet's way to close it. */
	let open;
	/** The widget above the prompt and the surface it is on, once a session has mounted it. */
	let chip;
	/** The line's Discard was pressed once, and the timer that forgets it. */
	let isArmed = false;
	let disarm;
	const redraw = () => chip?.tui.requestRender();
	const arm = (armed) => {
		clearTimeout(disarm);
		disarm = armed ? setTimeout(() => arm(false), DISCARD_ARM_MS) : void 0;
		isArmed = armed;
		redraw();
	};
	const discard = () => {
		form = null;
		view = startView(view.opens);
		arm(false);
		close();
	};
	/**
	* Mounts the line above the prompt for a draft that is not on screen. It stays for the
	* session and draws no row while there is nothing to show.
	*/
	const mount = (ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWidget(WIDGET, (tui, theme) => {
			const widget = new DraftChip(theme, () => form && !open ? {
				form,
				isArmed
			} : void 0, (hit) => {
				if (hit === CHIP.open) {
					arm(false);
					show(ctx);
				} else if (hit === CHIP.discard) {
					if (isArmed) discard();
					else arm(true);
				}
			});
			chip = {
				tui,
				widget
			};
			return widget;
		});
	};
	const origin = async (ctx) => {
		const git = async (...args) => {
			try {
				const r = await pi.exec("git", [
					"-C",
					ctx.cwd,
					...args
				], { timeout: 2e3 });
				return r.code === 0 ? r.stdout.trim() : "";
			} catch {
				return "";
			}
		};
		const [remote, branch] = await Promise.all([git("remote", "get-url", "origin"), git("branch", "--show-current")]);
		const messages = ctx.sessionManager.getBranch().flatMap((entry) => {
			const message = entry.message;
			if (entry.type !== "message" || !message?.role) return [];
			if (message.role !== "user" && message.role !== "assistant") return [];
			return [{
				role: message.role,
				text: textOf(message.content)
			}];
		});
		return {
			cwd: ctx.cwd,
			repo: remote ? repoName(remote) : void 0,
			branch: branch || "(none)",
			sessionId: ctx.sessionManager.getSessionId(),
			messages
		};
	};
	const hostFor = (ctx) => ({
		now: () => Date.now(),
		linear: (tool, args) => linear.call(ctx, tool, args),
		async complete({ system, prompt, maxTokens }) {
			const model = ctx.model;
			if (!model) return { error: "no model is selected" };
			try {
				const reply = await ctx.modelRegistry.streamSimple(model, {
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
					maxTokens,
					sessionId: ctx.sessionManager.getSessionId()
				}).result();
				if (reply.stopReason === "error" || reply.stopReason === "aborted") return { error: reply.errorMessage ?? reply.stopReason };
				return { text: contentText(reply.content) };
			} catch (error) {
				return { error: errorText(error) };
			}
		},
		origin: () => origin(ctx),
		last: async () => readLast(),
		async remember(last) {
			const file = lastFile();
			if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, `${JSON.stringify(last)}\n`);
		},
		read: () => form,
		update(change) {
			form = change(form);
			redraw();
		},
		log: () => void 0
	});
	const close = () => {
		const sheet = open;
		open = void 0;
		sheet?.close();
		redraw();
	};
	const openUrl = async (ctx, url) => {
		for (const opener of ["xdg-open", "open"]) try {
			if ((await pi.exec(opener, [url], { timeout: 5e3 })).code === 0) return;
		} catch {}
		ctx.ui.notify(`Couldn't open ${url}`, "warning");
	};
	/** What a key or a click asked for, beyond the view's own change. */
	const run = async (ctx, effect) => {
		const d = drafter(hostFor(ctx), teams);
		switch (effect.do) {
			case "hide": return close();
			case "discard": return discard();
			case "retry": return d.retry();
			case "team": return d.switchTeam(effect.team);
			case "set":
				form = form && {
					...form,
					...effect.patch
				};
				return redraw();
			case "create":
			case "comment": {
				if (isSending) return;
				isSending = true;
				const filed = await d.submit({
					asComment: effect.do === "comment",
					open: effect.open
				}).finally(() => {
					isSending = false;
				});
				if (!filed) return redraw();
				form = null;
				view = startView(effect.open);
				close();
				pi.appendEntry(FILED, filed);
				if (effect.open && filed.url) await openUrl(ctx, filed.url);
			}
		}
	};
	function show(ctx) {
		if (open) return;
		if (!chip) mount(ctx);
		let surface;
		let measured;
		const below = () => {
			if (measured === void 0) {
				measured = surface && chip && rowsFromPrompt(surface, chip.widget) || 0;
				queueMicrotask(() => {
					measured = void 0;
				});
			}
			return measured;
		};
		ctx.ui.custom((tui, theme, _keys, done) => {
			surface = tui;
			open = { close: () => done() };
			return new DraftSheet(tui, theme, () => ({
				form,
				view
			}), (intent, drawn) => {
				const acted = act(form, view, intent, drawn, Date.now());
				view = acted.view;
				for (const effect of acted.effects) run(ctx, effect).catch((error) => ctx.ui.notify(`linear-issue: ${errorText(error)}`, "error"));
			}, below);
		}, {
			overlay: true,
			overlayOptions: () => sheetOptions(surface, below)
		}).finally(() => {
			open = void 0;
			redraw();
		});
	}
	pi.registerCommand("linear", {
		description: "Draft a Linear issue from the text after it (or the recent conversation) for approval",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/linear needs pi's terminal UI to show the draft", "warning");
				return;
			}
			arm(false);
			if (form && form.phase !== "failed") {
				show(ctx);
				if (args.trim()) ctx.ui.notify("Reopened your Linear draft; discard it to start another");
				return;
			}
			if (!linear.isConfigured(ctx)) {
				ctx.ui.notify("No Linear MCP server is configured: pi mcp add linear --url https://mcp.linear.app/mcp", "warning");
				return;
			}
			view = startView(readLast()?.open);
			await drafter(hostFor(ctx), teams).start({
				kind: "note",
				text: args.trim()
			});
			show(ctx);
		}
	});
	pi.registerEntryRenderer(FILED, (entry, _options, theme) => {
		const filed = entry.data;
		if (!filed?.key) return void 0;
		return {
			render: (width) => draw$1(theme, filedLines(filed, width), width),
			invalidate() {}
		};
	});
	pi.on("session_start", (_event, ctx) => {
		mount(ctx);
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		form = null;
		view = startView();
		arm(false);
		close();
		chip = void 0;
		await linear.close(ctx);
	});
}

export { linearIssue as default };