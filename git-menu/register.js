import { atom, read, update } from "claude-code";

// ../../lib/kits/legacy/src/claude/ui.tsx
/** A pane with fewer body rows than this drops the blank rows between its blocks. */
const TIGHT_ROWS = 16;
/**
* Binds the resolved elements to the surface they came from, and to the room it measured.
* @param els What `$.ui.resolve(e)` answered.
* @param e The render event: `surface`, `viewport` and the pane's or band's `props`.
*/
const kitOf = (els, e) => {
	const p = e.props ?? {};
	return {
		Box: els.Box,
		Text: els.Text,
		Button: els.Button,
		Markdown: els.Markdown,
		Image: els.Image,
		Link: els.Link,
		Svg: els.Svg,
		surface: e.surface,
		isNative: e.surface !== "terminal",
		columns: Math.max(1, Math.floor(p.bodyColumns ?? e.viewport?.columns ?? 80)),
		maxRows: p.maxRows,
		isTight: (p.scroll?.bodyRows ?? 1e400) < TIGHT_ROWS,
		title: p.title,
		placement: p.placement
	};
};
/** The options that apply on this kit's surface: the terminal's, or `gui` with its own surface's over it. */
function surfaceOf(k, o) {
	if (!o) return {};
	if (!k.isNative) return o.tui ?? {};
	const own = o[k.surface];
	return {
		...o.gui,
		...own
	};
}
/**
* The house style's numbers, glyphs and colour roles; one edit here restyles every mod that
* carries a fresh copy of this file.
*/
const tokens = {
	/** Width classes: caps in columns, never targets. `wide` is the pane less `wideMargin`. */
	width: {
		reading: 96,
		split: 124,
		dialog: 72,
		wideMargin: 2
	},
	/** What a pane is opened with, whichever mod opens it: `"transparent"` is no fill under the body. */
	pane: { backgroundColor: "transparent" },
	/** Prose is wrapped at this measure even in a wider pane. */
	prose: 80,
	/** From this many pane columns a list with detail is two panes; below it stacks. */
	splitFrom: 110,
	/** Cells of padding inside a border. */
	padding: 1,
	/** Cells between metadata columns, and before the first. */
	gutter: 2,
	/** Cells between the keys of a button row. */
	keyGap: 3,
	/** From this pane width dated entries use a date column; narrower, a date line. */
	entriesFrom: 50,
	/** Cells of the date column of dated entries: an ISO date. */
	dateWidth: 10,
	/** A row's title is never given less than this; metadata columns drop first. */
	minTitle: 16,
	glyph: {
		pointer: "❯",
		multi: {
			off: "□",
			on: "■"
		},
		single: {
			off: "○",
			on: "●"
		},
		ellipsis: "…",
		more: {
			up: "↑",
			down: "↓"
		},
		rule: "─",
		done: "✓",
		times: "×",
		noteMid: "│",
		noteEnd: "╰▸",
		kind: {
			missing: "+",
			stale: "↻",
			wrong: "!"
		},
		status: { warning: "⚠" },
		fold: {
			closed: "▸",
			open: "▾"
		}
	},
	/** Lines of a folded claim on the terminal. */
	foldedLines: 3,
	/** Inline code on the terminal, outside a `Markdown`: the theme colour its Markdown uses. */
	code: "permission",
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
	},
	/**
	* The style's roles as a mod draws them: `dim` is `dimColor`, `text` is the default,
	* the rest are theme colours. `note` is the colour of the words a person wrote.
	*/
	role: {
		text: void 0,
		dim: void 0,
		accent: "claude",
		success: "success",
		warning: "warning",
		error: "error",
		note: "suggestion"
	}
};
/** The props of a `Text` in `role`. */
const roleProps = (role) => role === "dim" ? { dimColor: true } : tokens.role[role] === void 0 ? {} : { color: tokens.role[role] };
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
/** `text` cut to `width` cells with `…` when it is longer. */
function truncate(text, width) {
	if (cellWidth(text) <= width) return text;
	return split(text, Math.max(0, width - 1))[0] + tokens.glyph.ellipsis;
}
/** Greedy word wrap in cells; a word longer than the width is broken, and a `\n` ends a line. */
function wrap(text, width) {
	const out = [];
	for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
		let line = "";
		let used = 0;
		const words = paragraph.split(/[ \t]+/).filter(Boolean);
		if (words.length === 0) out.push("");
		for (let word of words) {
			let w = cellWidth(word);
			if (used > 0 && used + 1 + w <= width) {
				line += ` ${word}`;
				used += 1 + w;
				continue;
			}
			if (used > 0) out.push(line);
			line = "";
			used = 0;
			while (w > width) {
				const [head, rest] = split(word, width);
				out.push(head);
				word = rest;
				w = cellWidth(word);
			}
			line = word;
			used = w;
		}
		if (words.length > 0) out.push(line);
	}
	return out;
}
/**
* `{min: 1, max: 1}` truncates to one line; no options wraps without limit.
* @param width Cells, not characters; wide characters count two.
*/
function clamp(text, width, options = {}) {
	if (width < 1) return [];
	const { min = 0, max = 1e400, target } = options;
	const wanted = target === void 0 ? 1e400 : Math.max(1, Math.ceil(target / width));
	const cap = Math.max(0, Math.max(min, Math.min(max, wanted)));
	let lines = wrap(text, width);
	if (lines.length > cap) {
		if (cap === 0) return [];
		const rest = lines.slice(cap - 1).join(" ");
		lines = [...lines.slice(0, cap - 1), truncate(rest, width)];
	}
	while (lines.length < min) lines.push("");
	return lines;
}
/** `text` padded with spaces to `width` cells, cut with `…` when longer. */
const fit = (text, width) => {
	const cut = truncate(text, Math.max(0, width));
	return cut + " ".repeat(Math.max(0, width - cellWidth(cut)));
};
/** `text` right-aligned in `width` cells. */
const alignRight = (text, width) => " ".repeat(Math.max(0, width - cellWidth(text))) + text;
/** The lines of a text, whatever its line ends. */
const linesOf = (text) => text.replace(/\r\n?/g, "\n").split("\n");
/** The kit's icons: small stroked drawings on a 16-pixel grid, for the graphical surfaces. */
const ICONS = {
	wrong: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M8 4.7v4\"/><path d=\"M8 11.3v.01\"/>",
	stale: "<path d=\"M13.2 8.2A5.2 5.2 0 1 1 11.7 4.4\"/><path d=\"M13.4 2.4v3.2h-3.2\"/>",
	missing: "<path d=\"M8 3.2v9.6M3.2 8h9.6\"/>",
	warning: "<path d=\"M8 2.6 14.2 13.2H1.8L8 2.6Z\"/><path d=\"M8 6.8v2.9\"/><path d=\"M8 11.7v.01\"/>",
	success: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M5.2 8.2l2 2 3.6-4\"/>",
	error: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2\"/>",
	pending: "<circle cx=\"8\" cy=\"8\" r=\"6.2\" stroke-dasharray=\"2.4 2.4\"/>",
	note: "<path d=\"M2.6 3.4h10.8v7.2H7.4l-3 2.4v-2.4H2.6Z\"/><path d=\"M5.2 6h5.6M5.2 8h3.6\"/>",
	question: "<circle cx=\"8\" cy=\"8\" r=\"6.2\"/><path d=\"M6.3 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4\"/><path d=\"M8 11.4v.01\"/>",
	write: "<path d=\"M10.6 2.9l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6Z\"/><path d=\"M9.2 4.3l2.5 2.5\"/>",
	status: "<circle cx=\"8\" cy=\"8\" r=\"5.6\"/><circle cx=\"8\" cy=\"8\" r=\"1.6\" fill=\"currentColor\"/>",
	priorityNone: "<path d=\"M3.2 8h1.4M7.3 8h1.4M11.4 8h1.4\"/>",
	priorityLow: "<path d=\"M4 13v-2.6\"/><path d=\"M8 13V7.4\" stroke-opacity=\".35\"/><path d=\"M12 13V4.4\" stroke-opacity=\".35\"/>",
	priorityMedium: "<path d=\"M4 13v-2.6M8 13V7.4\"/><path d=\"M12 13V4.4\" stroke-opacity=\".35\"/>",
	priorityHigh: "<path d=\"M4 13v-2.6M8 13V7.4M12 13V4.4\"/>",
	priorityUrgent: "<rect x=\"2.6\" y=\"2.6\" width=\"10.8\" height=\"10.8\" rx=\"2.6\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M8 5.2v3.4M8 10.8v.01\" stroke=\"#ffffff\"/>",
	project: "<path d=\"M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2Z\"/><path d=\"M2.8 5.2 8 8l5.2-2.8M8 8v5.6\"/>",
	label: "<circle cx=\"8\" cy=\"8\" r=\"3.4\" fill=\"currentColor\" stroke=\"none\"/>",
	draft: "<path d=\"M10.6 2.8 13.2 5.4 5.7 12.9 2.6 13.4 3.1 10.3Z\"/><path d=\"M9.2 4.2l2.6 2.6\"/>"
};
/** What each icon stands for on the terminal, where one glyph does it. */
const ICON_GLYPH = {
	wrong: tokens.glyph.kind.wrong,
	stale: tokens.glyph.kind.stale,
	missing: tokens.glyph.kind.missing,
	warning: tokens.glyph.status.warning,
	success: tokens.glyph.done,
	error: tokens.glyph.times,
	pending: tokens.glyph.single.off,
	question: "?",
	note: tokens.glyph.noteEnd,
	write: "✎",
	status: tokens.glyph.single.off,
	priorityNone: "-",
	priorityLow: "!",
	priorityMedium: "!!",
	priorityHigh: "!!!",
	priorityUrgent: tokens.glyph.status.warning,
	project: tokens.glyph.multi.off,
	label: tokens.glyph.single.on,
	draft: "✎"
};
/**
* The markup of an icon, a whole `<svg>` document.
* @param tone The state it marks; grey when none.
* @param size Its side in CSS pixels.
*/
const iconSvg = (name, tone = "neutral", size = tokens.gui.icon) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" color="${tokens.gui.tone[tone]}" stroke="${tokens.gui.tone[tone]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
/**
* An icon: an image on a graphical surface, its glyph in a role's colour on the terminal.
* @param alt What it says, for a reader that cannot see it.
*/
function icon(k, name, options = {}) {
	const { Svg, Text } = k;
	const { tone = "neutral", alt = name, size = tokens.gui.icon } = options;
	if (k.isNative && Svg) return /* @__PURE__ */ h(Svg, {
		source: iconSvg(name, tone, size),
		alt,
		width: size,
		height: size
	});
	return /* @__PURE__ */ h(Text, roleProps(tone === "neutral" ? "dim" : tone), ICON_GLYPH[name]);
}
/**
* A block of prose. A graphical surface draws it as markdown, as it draws a reply; the terminal
* wraps it in cells, and cuts it where `tui.lines` says.
* @param text Prose or markdown, whose own newlines are line breaks on the terminal.
*/
function prose(k, text, options = {}) {
	const { Text, Markdown } = k;
	const { role = "text", isDim } = options;
	if (k.isNative) {
		const md = /* @__PURE__ */ h(Markdown, {
			text,
			dimColor: isDim || void 0
		});
		if (!options.gui?.isInset) return md;
		const { Box } = k;
		return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, md);
	}
	const { lines, weight } = options.tui ?? {};
	return /* @__PURE__ */ h(Text, {
		weight,
		...roleProps(isDim ? "dim" : role)
	}, clamp(text, k.columns, lines).join("\n"));
}
/**
* A section header: bold title, then a dim rule to the edge on the terminal. A graphical surface
* draws a flat heading at its rows' inset.
* @param title Wrapped on a graphical surface; cut with `…` on the terminal unless `isWrapped`.
*/
function section(k, title, options = {}) {
	const { Box, Text } = k;
	const width = k.columns;
	if (k.isNative) return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, /* @__PURE__ */ h(Text, {
		weight: "semibold",
		mono: options.isCode || void 0
	}, title));
	const lines = options.isWrapped ? clamp(title, Math.max(1, width)) : clamp(title, Math.max(1, width), {
		min: 1,
		max: 1
	});
	const room = width - cellWidth(lines.at(-1) ?? "") - 1;
	return /* @__PURE__ */ h(Text, null, /* @__PURE__ */ h(Text, { weight: "semibold" }, lines.join("\n")), room > 0 ? /* @__PURE__ */ h(Text, { dimColor: true }, ` ${tokens.glyph.rule.repeat(room)}`) : null);
}
/**
* A pane's title line, `─ Title  count ─────`, so both harnesses share one. A graphical surface
* already draws the pane's own title above the body, so it draws only what the title leaves out;
* given `gui.actions`, the line is the pane's toolbar, its actions at the far edge.
* @param count Dim, after the title; left out when none.
* @param options `gui.count` is the count as a graphical surface says it, `3 open`; `gui.summary`
*   what closing will do, said in its place.
*/
function paneTitle(k, title, count, options = {}) {
	const { Box, Text } = k;
	if (!k.isNative && options.isHeading) return /* @__PURE__ */ h(Box, { flexDirection: "row" }, /* @__PURE__ */ h(Text, { bold: true }, title), count === void 0 ? null : /* @__PURE__ */ h(Text, { dimColor: true }, `  ${count}`));
	if (k.isNative) {
		const own = surfaceOf(k, options);
		const said = own.count ?? (count === void 0 ? "" : String(count));
		const lead = !title || title === k.title ? null : /* @__PURE__ */ h(Text, { weight: "semibold" }, `${title}${said || own.summary ? "  " : ""}`);
		const text = own.summary ? /* @__PURE__ */ h(Text, null, lead, own.summary) : said || lead ? /* @__PURE__ */ h(Text, null, lead, said ? /* @__PURE__ */ h(Text, { dimColor: true }, said) : null) : null;
		const actions = own.actions ?? [];
		const tabs = own.tabs ?? [];
		const left = tabs.length ? /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "wrap",
			columnGap: tokens.gui.across.xs,
			rowGap: tokens.gui.space.xs
		}, tabs.map((a) => actionButton(k, a))) : text;
		if (!left && actions.length === 0) return null;
		return /* @__PURE__ */ h(Box, {
			key: "toolbar",
			flexDirection: "row",
			flexWrap: tabs.length ? "nowrap" : "wrap",
			alignItems: tabs.length ? "flex-start" : "center",
			justifyContent: "space-between",
			columnGap: tokens.gui.across.md,
			rowGap: tokens.gui.space.xs,
			paddingX: tokens.gui.across.inset
		}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, left), actions.length > 0 ? /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "wrap",
			flexShrink: tabs.length ? 0 : void 0,
			columnGap: tokens.gui.across.xs,
			rowGap: tokens.gui.space.xs
		}, actions.map((a) => actionButton(k, a))) : null);
	}
	const width = k.columns;
	const rule = tokens.glyph.rule;
	const tail = count === void 0 ? "" : `  ${count}`;
	const head = clamp(title, Math.max(1, width - 2 - cellWidth(tail) - 1), {
		min: 1,
		max: 1
	})[0] ?? "";
	const fill = width - 2 - cellWidth(head) - cellWidth(tail) - 1;
	return /* @__PURE__ */ h(Text, null, /* @__PURE__ */ h(Text, { dimColor: true }, `${rule} `), /* @__PURE__ */ h(Text, { weight: "semibold" }, head), tail ? /* @__PURE__ */ h(Text, { dimColor: true }, tail) : null, fill > 0 ? /* @__PURE__ */ h(Text, { dimColor: true }, ` ${rule.repeat(fill)}`) : null);
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
/**
* One line telling the person what just happened. The terminal cuts it to the room, or wraps
* it whole with `isWrapped`; a graphical surface always wraps.
* @param status The colour role; success, warning and error only for an actual state.
*/
function notice(k, text, status = "warning", options = {}) {
	const { Box, Text } = k;
	if (k.isNative) return options.gui?.isHidden ? null : /* @__PURE__ */ h(Box, { paddingX: options.gui?.isFlush ? void 0 : tokens.gui.across.inset }, /* @__PURE__ */ h(Text, {
		wrap: options.gui?.isCut ? "truncate-end" : void 0,
		...roleProps(status)
	}, text));
	const lines = options.isWrapped ? clamp(text, k.columns).join("\n") : clamp(text, k.columns, {
		min: 1,
		max: 1
	})[0] ?? "";
	return /* @__PURE__ */ h(Text, roleProps(status), lines);
}
/**
* What a list says when there is nothing in it, wrapped and dim.
* @param text Say what is missing and, if it helps, what makes rows appear.
* @param options `gui.text` is the text as a graphical surface says it: a fuller sentence, or one
*   without the terminal's `…`.
*/
function emptyState(k, text, options = {}) {
	const { Box, Text } = k;
	if (k.isNative) return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, /* @__PURE__ */ h(Text, { dimColor: true }, options.gui?.text ?? text));
	return /* @__PURE__ */ h(Text, { dimColor: true }, clamp(text, k.columns).join("\n"));
}
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/**
* The first `gui.maxItems` of a long list, and an `N more` row for the rest. The terminal's pane
* scrolls as a whole, so it shows every item.
* @param isAll Show every item, as after the person asked for the rest.
* @param onMore Makes the `N more` row a Button that asks for the rest.
*/
function capped(k, items, options = {}) {
	const { Button, Text } = k;
	const max = options.gui?.maxItems ?? tokens.gui.maxItems;
	if (!k.isNative || options.isAll || items.length <= max) return {
		shown: [...items],
		more: null
	};
	const left = items.length - max;
	const { onMore } = options;
	const { Box } = k;
	return {
		shown: items.slice(0, max),
		more: /* @__PURE__ */ h(Box, {
			key: "more:box",
			paddingX: tokens.gui.across.inset
		}, onMore ? /* @__PURE__ */ h(Button, {
			key: "more",
			dimColor: true,
			label: `Show ${left} more`,
			onPress: () => onMore()
		}) : /* @__PURE__ */ h(Text, { dimColor: true }, `${left} more`))
	};
}
/**
* Words between backticks, as a Text can set them: in a chip, since a Text has no code face. The
* chip takes the line's own `truncate-end`: a nested Text without a `wrap` is drawn `pre-wrap`,
* and VS Code's extension before 2.1.327 breaks a one-line row after it.
*/
function inlineCode(k, text) {
	const { Text } = k;
	return text.split(/(`[^`\n]+`)/).filter(Boolean).map((part, i) => part.startsWith("`") && part.endsWith("`") && part.length > 2 ? /* @__PURE__ */ h(Text, {
		key: `c${i}`,
		backgroundColor: tokens.gui.chip,
		wrap: "truncate-end"
	}, ` ${part.slice(1, -1)} `) : part.replace(/\*\*|__/g, ""));
}
/** A thin rule down the side of what it marks: a Box of a fraction of a cell, filled. */
function sideRule(k, key) {
	const { Box } = k;
	return /* @__PURE__ */ h(Box, {
		key,
		width: .2,
		flexShrink: 0,
		backgroundColor: tokens.gui.rule
	});
}
/**
* The one graphical row. Folded, it is one line: the mark, the text cut at the edge, its detail,
* and a quiet button at the far edge. The line is one line of text tall whether it has a button
* or not, so every folded row is the same height. Opened, the line shows the text whole and the
* row takes a fill that holds everything under it, set in from the mark, with a rule running
* down from the mark so the body reads as that line's own. A Button cannot wrap or hold an icon
* and never shrinks, so it is never the row itself.
*/
function guiRow(k, o) {
	const { Box, Button, Text } = k;
	const { space, across } = tokens.gui;
	const isOpen = Boolean(o.isOpen);
	const { detail, button } = o;
	const line = o.field ? o.field : isOpen ? o.text ? prose(k, o.text) : null : /* @__PURE__ */ h(Text, {
		wrap: "truncate-end",
		dimColor: o.isDim || o.isStruck || void 0,
		strikethrough: o.isStruck || void 0,
		color: o.tone ? tokens.gui.tone[o.tone] : void 0
	}, o.isPlain ? o.text : inlineCode(k, linesOf(o.text).join(" ")));
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "row",
		flexWrap: "nowrap",
		columnGap: across.sm,
		paddingX: across.inset,
		paddingY: isOpen ? space.sm : space.xs,
		backgroundColor: isOpen ? tokens.gui.fill : void 0,
		borderStyle: "round",
		borderColor: "#00000000"
	}, o.mark ? /* @__PURE__ */ h(Box, {
		key: "mark",
		flexDirection: "column",
		alignItems: "flex-start",
		flexShrink: 0,
		minWidth: o.markWidth
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		alignItems: "center",
		flexGrow: 1,
		rowGap: space.xs
	}, /* @__PURE__ */ h(Box, {
		height: 1,
		alignItems: "center"
	}, o.mark), isOpen ? /* @__PURE__ */ h(Box, { flexGrow: 1 }, sideRule(k, "thread")) : null)) : null, /* @__PURE__ */ h(Box, {
		key: "text",
		flexDirection: "column",
		flexGrow: 1,
		flexShrink: 1,
		rowGap: isOpen ? space.sm : space.xs
	}, /* @__PURE__ */ h(Box, {
		key: "line",
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: isOpen ? "flex-start" : "center",
		columnGap: across.md,
		height: isOpen ? void 0 : 1
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		flexGrow: 1,
		flexShrink: 1,
		columnGap: across.md
	}, /* @__PURE__ */ h(Box, {
		flexShrink: 1,
		flexGrow: o.field ? 1 : void 0
	}, line), detail && !detail.isAtEnd ? /* @__PURE__ */ h(Box, {
		width: 0,
		flexGrow: 1,
		flexShrink: 1
	}, /* @__PURE__ */ h(Text, {
		wrap: "truncate-end",
		dimColor: true
	}, detail.text)) : null), detail?.isAtEnd ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, /* @__PURE__ */ h(Text, { dimColor: true }, detail.text)) : null, button ? /* @__PURE__ */ h(Button, {
		key: button.key,
		variant: button.isFilled ? "primary" : void 0,
		dimColor: !button.isFilled || void 0,
		label: button.label,
		onPress: () => button.onPress()
	}) : null), o.meta && !isOpen ? /* @__PURE__ */ h(Text, {
		wrap: "truncate-end",
		dimColor: true
	}, o.meta) : null, isOpen ? o.body : null));
}
/**
* One action's Button. A graphical surface fills only the one worth pressing now and draws the
* rest quiet: VS Code paints a Button by its `dimColor` alone, so the variant follows it.
*/
function actionButton(k, a) {
	const { Button } = k;
	const isPrimary = k.isNative ? a.gui?.isPrimary ?? a.isPrimary : a.isPrimary;
	return /* @__PURE__ */ h(Button, {
		key: a.key,
		variant: isPrimary ? "primary" : void 0,
		dimColor: k.isNative && !isPrimary || void 0,
		hotkey: a.hotkey,
		label: k.isNative ? capital(a.label) : a.label,
		onPress: () => a.onPress()
	});
}
/** Cells a mark takes with the space after it. */
const MARK = 2;
/**
* A graphical row that is pressed, not opened (`guiRow`): the title cut at the edge, its detail
* dim beside it or at its end, and one quiet button at the far edge. A dimmed row has no button.
*/
function listRowGui(k, item) {
	const meta = item.meta ?? [];
	const label = item.action ?? (item.isMarked === void 0 ? "Open" : item.isMarked ? "Chosen" : "Choose");
	return guiRow(k, {
		key: `${item.key}:row`,
		mark: item.icon ? icon(k, item.icon, { tone: item.iconTone }) : void 0,
		text: item.title,
		isPlain: true,
		isDim: item.isDim,
		detail: item.detail ? {
			text: item.detail,
			isAtEnd: item.gui?.isDetailAtEnd
		} : void 0,
		meta: meta.length > 0 ? meta.map((c) => c.text).join("  ·  ") : void 0,
		button: item.isDim ? void 0 : {
			key: item.key,
			label,
			isFilled: item.isMarked,
			onPress: item.onPress
		}
	});
}
/**
* One row of a list: a `Button` whose text is the mark, the clamped title and the metadata.
* A focused row is drawn by the engine; this draws no pointer of its own. A graphical surface
* draws a row of text with a short quiet button at its end (`listRowGui`).
*/
function listRow(k, item, options = {}) {
	const { Button, Text } = k;
	if (k.isNative) return listRowGui(k, item);
	if (options.tui?.isInline) {
		const pad = Math.max(0, (options.tui.labelWidth ?? 0) - cellWidth(item.title));
		return /* @__PURE__ */ h(Button, {
			key: item.key,
			plain: true,
			hotkey: item.hotkey,
			dimColor: item.isDim || void 0,
			onPress: () => item.onPress()
		}, `${item.title}${" ".repeat(pad)}`, item.detail ? /* @__PURE__ */ h(Text, { dimColor: true }, `  ${item.detail}`) : null);
	}
	const meta = [...item.detail ? [{
		text: item.detail,
		width: cellWidth(item.detail)
	}] : [], ...item.meta ?? []];
	const { isColumns = false } = options.tui ?? {};
	const width = k.columns;
	const gutter = tokens.gutter;
	const hasMark = item.isMarked !== void 0;
	const lead = hasMark ? MARK : 0;
	const columnsWidth = meta.reduce((n, c) => n + gutter + c.width, 0);
	const inColumns = isColumns && meta.length > 0 && width - lead - columnsWidth >= tokens.minTitle;
	const titleWidth = Math.max(1, width - lead - (inColumns ? columnsWidth : 0));
	const lines = clamp(item.title, titleWidth, options.tui?.title);
	const children = [];
	const cellText = (c) => c.align === "right" ? alignRight(truncate(c.text, c.width), c.width) : fit(c.text, c.width);
	lines.forEach((line, i) => {
		if (i > 0) children.push(`\n${" ".repeat(lead)}`);
		else if (hasMark) {
			const mark = tokens.glyph[options.marks ?? "multi"];
			children.push(item.isMarked ? `${mark.on} ` : `${mark.off} `);
		}
		children.push(line);
		if (i === 0 && inColumns) {
			children.push(" ".repeat(titleWidth - cellWidth(line) + gutter));
			meta.forEach((c, n) => {
				if (n > 0) children.push(" ".repeat(gutter));
				children.push(/* @__PURE__ */ h(Text, {
					key: `m${n}`,
					...roleProps(c.role ?? "dim")
				}, cellText(c)));
			});
		}
	});
	if (!inColumns && meta.length > 0) {
		children.push(`\n${" ".repeat(lead)}`);
		meta.forEach((c, n) => {
			if (n > 0) children.push(" ".repeat(gutter));
			children.push(/* @__PURE__ */ h(Text, {
				key: `m${n}`,
				...roleProps(c.role ?? "dim")
			}, c.text));
		});
	}
	return /* @__PURE__ */ h(Button, {
		key: item.key,
		plain: true,
		hotkey: item.hotkey,
		dimColor: item.isDim || void 0,
		onPress: () => item.onPress()
	}, children);
}
/**
* Groups of rows, each under a section header, one blank row between groups. A Claude pane
* scrolls as a whole, so the terminal has no windowing and no `n more`; a graphical surface shows
* `gui.maxItems` rows of a group and says how many more. A group with no title is rows alone.
*/
function list(k, groups, options = {}) {
	const { Box } = k;
	const own = surfaceOf(k, {
		gui: options.gui,
		desktop: options.desktop,
		vscode: options.vscode,
		mobile: options.mobile
	});
	const rowOptions = options.tui?.isInline ? {
		...options,
		tui: {
			...options.tui,
			labelWidth: Math.max(0, ...groups.flatMap((g) => g.rows.map((r) => cellWidth(r.title))))
		}
	} : options;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: k.isNative ? tokens.gui.space.md : 1
	}, groups.map((group, g) => {
		const { shown, more } = capped(k, group.rows, {
			gui: own,
			isAll: own.isAll,
			onMore: own.onMore
		});
		const rows = shown.map((row) => listRow(k, row, rowOptions));
		return k.isNative ? /* @__PURE__ */ h(Box, {
			key: `group${g}`,
			flexDirection: "column",
			rowGap: tokens.gui.space.xs
		}, group.title ? section(k, group.title) : null, /* @__PURE__ */ h(Box, {
			key: "rows",
			flexDirection: "column"
		}, rows), more) : /* @__PURE__ */ h(Box, {
			key: `group${g}`,
			flexDirection: "column"
		}, group.title ? section(k, group.title) : null, rows, more);
	}));
}
/**
* Blocks in a column with the gap of the style: a blank row on the terminal, dropped in a pane
* too short for them when `isTight`; on a graphical surface a step of `tokens.gui.space`, `md`
* unless `gui.gap` says, or `none` for rows that space themselves.
*/
function stack(k, children, options = {}) {
	const { Box } = k;
	const gap = options.gui?.gap ?? "md";
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: k.isNative ? gap === "none" ? 0 : tokens.gui.space[gap] : options.isTight && k.isTight ? 0 : options.tui?.gap ?? 1
	}, children);
}

// src/claude/menus.ts
const FOLDER_APPS = [
	"code",
	"zed",
	"smerge",
	"files",
	"ghostty"
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
		case "ghostty": return "Ghostty";
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
					argv
				}
			} : {
				id: app,
				label: appLabel(app, isMac),
				unavailable: "not installed"
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
const HINTS = "1-9 or Enter picks · Esc closes";
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
let isMacAnswer;
const run = async ($, argv, timeoutMs = GIT_TIMEOUT_MS) => {
	try {
		return await $.process.run(argv, { timeoutMs });
	} catch {
		return;
	}
};
/** One read-only git command; anything it refuses is an empty answer. */
const git = async ($, cwd, args) => {
	const r = await run($, [
		"git",
		"--no-optional-locks",
		"-C",
		cwd,
		...args
	]);
	return r?.exitCode === 0 ? r.stdout.trim() : "";
};
const isMac = ($) => isMacAnswer ??= run($, ["uname", "-s"]).then((r) => r?.stdout.trim() === "Darwin");
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
async function buildFolder($, cwd) {
	const mac = await isMac($);
	const editor = preferredEditor(await $.env.get("FIREPROOF_EDITOR"));
	const launchers = {};
	if (mac) {
		const bundle = async (app, name, args, fresh = false) => {
			if (await $.fs.exists(`/Applications/${name}.app`)) launchers[app] = fresh ? [
				"open",
				"-na",
				`${name}.app`,
				"--args",
				...args
			] : [
				"open",
				"-a",
				name,
				...args
			];
		};
		await Promise.all([
			bundle("code", "Visual Studio Code", [cwd]),
			bundle("zed", "Zed", [cwd]),
			bundle("smerge", "Sublime Merge", [cwd]),
			bundle("ghostty", "Ghostty", [`--working-directory=${cwd}`], true)
		]);
		launchers.files = ["open", cwd];
	} else {
		const probe = await run($, [
			"sh",
			"-c",
			"for c; do command -v \"$c\" >/dev/null && echo \"$c\"; done",
			"sh",
			...editorCandidates(editor),
			"smerge",
			"nautilus",
			"xdg-open",
			"ghostty"
		]);
		const found = new Set((probe?.stdout ?? "").split("\n").filter(Boolean));
		if (found.has("code")) launchers.code = ["code", cwd];
		const zed = ["zed", "zeditor"].find((name) => found.has(name));
		if (zed) launchers.zed = [zed, cwd];
		if (found.has("smerge")) launchers.smerge = ["smerge", cwd];
		if (found.has("nautilus")) launchers.files = ["nautilus", cwd];
		else if (found.has("xdg-open")) launchers.files = ["xdg-open", cwd];
		if (found.has("ghostty")) launchers.ghostty = ["ghostty", `--working-directory=${cwd}`];
	}
	return folderMenu(cwd, launchers, mac, editor);
}
/** A command by absolute path: on PATH, then the profiles a trimmed PATH may miss, then `also`. */
async function locate($, name, also = []) {
	const [home, user] = await Promise.all([$.env.get("HOME"), $.env.get("USER")]);
	const probe = await run($, [
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
async function close($) {
	await update($, menu, () => null);
	await update($, showAll, () => false);
	await $.ui.close({ id: PANE });
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
	if (shown?.kind === kind && shown.rows !== null && built.preferred) await $.ui.focus({
		requestId: PANE,
		key: built.preferred
	}).catch(() => void 0);
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
		if ((await run($, [...DETACH, ...argv]))?.exitCode !== 0) $.ui.toast(`Couldn't start ${argv[0]}`);
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
		await update($, menu, () => null);
		await update($, showAll, () => false);
		return next(e);
	});
	on("ui.render", {
		component: "Pane",
		requestId: PANE
	}, async ($, e) => {
		const k = kitOf($.ui.resolve(e), e);
		const { Text } = k;
		const m = await read($, menu);
		const isAll = await read($, showAll);
		if (!m) return /* @__PURE__ */ h(Text, { dimColor: true }, "No menu open.");
		const rows = m.rows ?? [];
		const count = m.kind === "notes" && rows.length ? `${rows.length} ${rows.length === 1 ? "note" : "notes"}` : "";
		const says = (text, gui) => emptyState(k, text, { gui: { text: gui } });
		return stack(k, [
			paneTitle(k, m.title, m.context, {
				isHeading: true,
				gui: { count: count || m.context }
			}),
			m.error ? says(m.error, m.kind === "notes" ? "No notes yet. Plans and notes saved in this checkout's store show up here." : m.error) : m.rows === null ? says(m.kind === "notes" ? "Looking for notes…" : "Asking git…", m.kind === "notes" ? "Looking for notes" : "Asking git") : list(k, [{
				title: "",
				rows: rows.map((row, i) => ({
					key: row.id,
					title: row.label,
					detail: row.unavailable ?? row.description,
					isDim: row.action === void 0,
					hotkey: i < 9 ? String(i + 1) : void 0,
					action: row.action?.kind === "copy" ? "Copy" : "Open",
					gui: { isDetailAtEnd: m.kind === "notes" },
					onPress: () => void press($, row, e.surface)
				}))
			}], {
				tui: { isInline: true },
				gui: {
					isAll,
					onMore: () => update($, showAll, () => true)
				}
			}),
			notice(k, HINTS, "dim", { gui: { isHidden: true } })
		], { tui: { gap: 0 } });
	});
};

export { register };