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
* The one door through which a mod draws by surface itself. A mod describes content and intent
* and the kit draws it on each surface; this is for what the kit can't draw yet: a terminal
* screen the mod lays out to the cell, beside a graphical one built from the kit's functions,
* or a value only one surface has (a hotkey the graphical surfaces would draw as a chip). `tui`
* is the terminal's; `gui` every graphical surface's; `desktop`, `vscode` and `mobile` replace
* `gui` on that one. Only the chosen one runs.
*/
function forSurface(k, drawings) {
	if (!k.isNative) return drawings.tui();
	return (drawings[k.surface] ?? drawings.gui)();
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
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/**
* A set of options, one chosen or several. A graphical surface draws each as a Button, the chosen
* one `primary`, with its detail inside it; the terminal draws plain keys or marked rows.
*/
function choice(k, options, settings = {}) {
	const { Box, Button, Text } = k;
	if (k.isNative) {
		const { layout = "stack", onward } = surfaceOf(k, {
			gui: settings.gui,
			desktop: settings.desktop,
			vscode: settings.vscode,
			mobile: settings.mobile
		});
		if (layout === "rows") return choiceRows(k, options, settings, onward);
		const isRow = layout === "row";
		return /* @__PURE__ */ h(Box, {
			key: settings.key,
			flexDirection: isRow ? "row" : "column",
			flexWrap: isRow ? "wrap" : void 0,
			columnGap: tokens.gui.across.xs,
			rowGap: isRow ? tokens.gui.space.xs : tokens.gui.space.sm
		}, options.map((o) => {
			const isLong = !isRow && o.short !== void 0 && cellWidth(o.label) > tokens.gui.maxLabel;
			const button = /* @__PURE__ */ h(Button, {
				key: o.key,
				variant: o.isOn && !o.isQuiet ? "primary" : "secondary",
				dimColor: !(o.isOn && !o.isQuiet) || void 0,
				label: isLong ? capital(o.short ?? o.label) : o.isLiteral ? o.label : capital(o.label),
				onPress: () => o.onPress()
			});
			return isRow || !o.detail && !isLong ? button : /* @__PURE__ */ h(Box, {
				key: `${o.key}:detail`,
				flexDirection: "column"
			}, button, isLong ? /* @__PURE__ */ h(Text, null, o.label) : null, o.detail ? /* @__PURE__ */ h(Text, { dimColor: true }, o.detail) : null);
		}));
	}
	const { style = "chips" } = settings.tui ?? {};
	if (style === "marks") return /* @__PURE__ */ h(Box, {
		key: settings.key,
		flexDirection: "column"
	}, options.map((o) => listRow(k, {
		key: o.key,
		title: o.label,
		isMarked: Boolean(o.isOn),
		meta: o.detail ? [{
			text: o.detail,
			width: 0
		}] : void 0,
		onPress: o.onPress
	}, { marks: settings.isMulti ? "multi" : "single" })));
	return /* @__PURE__ */ h(Box, {
		key: settings.key,
		columnGap: tokens.gutter
	}, options.map((o) => /* @__PURE__ */ h(Button, {
		key: o.key,
		plain: true,
		hotkey: o.hotkey,
		dimColor: !o.isOn,
		label: o.label,
		onPress: () => o.onPress()
	})));
}
/**
* A choice as rows (`guiRow`), for options a person reads before picking: each row is one line,
* led by a Button of the option's tag (filled when chosen), its label and its detail cut at the
* edge beside it. The option chosen of a single choice opens in its well: the label and the detail
* whole, its `body` under them and the way on at its far edge. A row with a `field` holds that
* control in place of the label, led by its icon, so a click lands in the field itself.
*/
function choiceRows(k, options, settings, onward) {
	const { Box, Button, Text } = k;
	const isTagged = options.some((o) => o.tag !== void 0);
	return /* @__PURE__ */ h(Box, {
		key: settings.key,
		flexDirection: "column"
	}, options.map((o) => {
		const isOn = Boolean(o.isOn && !o.isQuiet);
		const isOpen = isOn && !settings.isMulti;
		const mark = o.field ? icon(k, o.icon ?? "write") : /* @__PURE__ */ h(Button, {
			key: o.key,
			variant: isOn ? "primary" : void 0,
			dimColor: !isOn || void 0,
			label: o.tag ?? (o.isLiteral ? o.label : capital(o.label)),
			onPress: () => o.onPress()
		});
		const label = o.field || o.tag === void 0 ? "" : o.label;
		const named = cellWidth(label) <= tokens.gui.maxLabel ? `**${label.replaceAll("**", "")}**` : label;
		const whole = isOpen ? [label ? named : "", o.detail ?? ""].filter(Boolean).join("  ") : "";
		return guiRow(k, {
			key: `${o.key}:row`,
			mark,
			markWidth: isTagged ? tokens.gui.lead : void 0,
			text: isOpen ? whole : label,
			field: o.field,
			detail: !isOpen && o.detail ? { text: o.detail } : void 0,
			isOpen,
			button: isOpen && onward ? {
				...onward,
				isFilled: true
			} : void 0,
			body: isOpen ? [o.field && o.detail ? /* @__PURE__ */ h(Text, { key: "detail" }, o.detail) : null, o.body ?? null] : void 0
		});
	}));
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
* A line that tells the person there is something to open, drawn in the band above the prompt: a
* status mark and the text, and a way in.
* @param hint What pressing it does, `review`.
*/
function statusBand(k, o) {
	const { Box, Button, Text } = k;
	const status = o.status ?? "warning";
	if (k.isNative) {
		const extra = o.gui?.actions ?? [];
		const isOneLine = Boolean(o.gui?.isOneLine);
		const mark = icon(k, o.gui?.icon ?? status, { tone: o.gui?.tone ?? status });
		const text = /* @__PURE__ */ h(Box, {
			flexShrink: 1,
			flexGrow: isOneLine ? 1 : void 0
		}, /* @__PURE__ */ h(Text, { wrap: isOneLine ? "truncate-end" : void 0 }, o.gui?.text ?? o.text));
		const first = /* @__PURE__ */ h(Button, {
			key: o.key,
			dimColor: true,
			label: capital(o.hint),
			onPress: () => o.onPress()
		});
		if (extra.length === 0 || isOneLine) return /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "nowrap",
			columnGap: tokens.gui.across.sm,
			alignItems: "center",
			paddingX: tokens.gui.across.inset
		}, mark, text, /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexShrink: 0,
			columnGap: tokens.gui.across.xs
		}, first, extra.map((a) => /* @__PURE__ */ h(Button, {
			key: a.key,
			dimColor: true,
			label: capital(a.label),
			onPress: () => a.onPress()
		}))));
		return /* @__PURE__ */ h(Box, {
			flexDirection: "column",
			rowGap: tokens.gui.space.xs,
			paddingX: tokens.gui.across.inset
		}, /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "nowrap",
			columnGap: tokens.gui.across.sm
		}, mark, text), /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "wrap",
			columnGap: tokens.gui.across.xs
		}, first, extra.map((a) => /* @__PURE__ */ h(Button, {
			key: a.key,
			dimColor: true,
			label: capital(a.label),
			onPress: () => a.onPress()
		}))));
	}
	return /* @__PURE__ */ h(Button, {
		key: o.key,
		plain: true,
		onPress: () => o.onPress()
	}, /* @__PURE__ */ h(Text, roleProps(status), `${ICON_GLYPH[status]} ${o.text}`), /* @__PURE__ */ h(Text, { dimColor: true }, ` ${o.hint}`));
}
/**
* The pane's action row: its Submit, its Close. Labels are as written on the terminal and
* capitalised on a graphical surface.
*/
function actionBar(k, actions, options = {}) {
	const { Box, Text } = k;
	if (k.isNative && options.gui?.isHidden) return null;
	const summary = k.isNative ? options.gui?.summary : void 0;
	return /* @__PURE__ */ h(Box, {
		key: "actions",
		columnGap: k.isNative ? tokens.gui.across.md : void 0,
		rowGap: k.isNative ? tokens.gui.space.xs : void 0,
		alignItems: k.isNative ? "center" : void 0,
		paddingX: k.isNative ? tokens.gui.across.inset : void 0,
		flexWrap: "wrap"
	}, summary ? /* @__PURE__ */ h(Text, null, summary) : null, actions.map((a) => actionButton(k, a)));
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

// src/claude/band.tsx
const arrows = (change) => change.replace("→", " → ");
/** The keys of the action row that may carry a hotkey, for `expectNative`. */
const ACTION_KEYS = [
	"skip",
	"all",
	"add",
	"undo",
	"dismiss"
];
/**
* The band on the desktop app and VS Code: the count line (its button opens, then closes, the
* picker) with the picker or the report under it. The terminal's drawing is `terminalBand`.
*/
function guiBand(k, v, a) {
	const { Box, Text } = k;
	const { picker: p, report: done, added: words, isBusy, count: n } = v;
	const inset = tokens.gui.across.inset;
	const head = (text, hint, status) => statusBand(k, {
		key: "spellfix",
		text,
		hint,
		status,
		onPress: a.toggle
	});
	if (p) {
		const ai = [];
		if (p.ai || !p.isAiDone) ai.push({
			key: "ai",
			label: p.isAiDone ? p.ai ?? "" : p.wantsAi ? "Waiting" : "Checking",
			isLiteral: p.isAiDone,
			onPress: () => a.pick("1")
		});
		const summary = p.summary.map(arrows).join(", ");
		const actions = [
			{
				key: "skip",
				label: "skip",
				hotkey: "s",
				onPress: () => a.pick("s")
			},
			{
				key: "all",
				label: p.wantsAll ? "Waiting" : "fix all",
				hotkey: "a",
				onPress: () => a.pick("a")
			},
			...v.hasPersonal && !p.isExtra ? [{
				key: "add",
				label: "add word",
				hotkey: "d",
				onPress: () => a.pick("d")
			}] : [],
			...words.length > 0 ? [{
				key: "undo",
				label: "undo add",
				hotkey: "8",
				onPress: () => a.pick("8")
			}] : []
		];
		return stack(k, [
			head(n > 0 ? `${n} misspelled` : "A typo only Haiku found", "close", "warning"),
			/* @__PURE__ */ h(Box, {
				key: "context",
				paddingX: inset
			}, /* @__PURE__ */ h(Text, null, /* @__PURE__ */ h(Text, { dimColor: true }, p.lead), /* @__PURE__ */ h(Text, {
				weight: "bold",
				...roleProps(p.isExtra ? "warning" : "error")
			}, p.word), /* @__PURE__ */ h(Text, { dimColor: true }, p.trail))),
			/* @__PURE__ */ h(Box, {
				key: "haiku",
				flexDirection: "row",
				alignItems: "center",
				columnGap: tokens.gui.across.md,
				paddingX: inset
			}, ai.length > 0 ? choice(k, ai, { key: "ai:choice" }) : null, /* @__PURE__ */ h(Text, { dimColor: true }, ai.length > 0 ? "Haiku" : "Haiku has no suggestion")),
			p.suggestions.length > 0 ? /* @__PURE__ */ h(Box, {
				key: "suggestions",
				paddingX: inset
			}, choice(k, p.suggestions.map((s, i) => ({
				key: `s${i}`,
				label: s,
				isLiteral: true,
				onPress: () => a.pick(String(i + 2))
			})), {
				key: "suggestions:choice",
				gui: { layout: "row" }
			})) : null,
			summary ? /* @__PURE__ */ h(Box, {
				key: "summary",
				paddingX: inset
			}, /* @__PURE__ */ h(Text, {
				wrap: "truncate-end",
				dimColor: true
			}, `Fix all changes ${summary}`)) : null,
			words.length > 0 ? notice(k, `Added ${words.join(", ")} to the dictionary`, "dim") : null,
			actionBar(k, actions)
		], { gui: { gap: "sm" } });
	}
	const notes = [...done ? [`Fixed ${done.changes.map(arrows).join(", ")}`] : [], ...words.length > 0 ? [`Added ${words.join(", ")} to the dictionary`] : []];
	return stack(k, [
		isBusy ? notice(k, "Checking spelling", "dim") : n > 0 ? head(`${n} misspelled`, "review", "warning") : null,
		...notes.map((text) => notice(k, text, "text")),
		notes.length > 0 ? actionBar(k, [{
			key: "undo",
			label: "undo",
			hotkey: "8",
			onPress: () => a.answer("8")
		}, {
			key: "dismiss",
			label: "dismiss",
			hotkey: "9",
			onPress: () => a.answer("9")
		}]) : null
	], { gui: { gap: "sm" } });
}
/**
* The band in the terminal: plain Buttons with their keys in the labels. The kit's statusBand,
* choice and actionBar draw other cells, so this stays the mod's own.
* @param toggle The Button that opens and closes the picker; the caller keeps it mounted.
*/
function terminalBand(k, v, a, toggle, hidden, isQuiet) {
	const { Box, Button, Text } = k;
	const { picker: p, report: done, added: words, isBusy, count: n } = v;
	if (isQuiet) return hidden;
	if (p) {
		const slot = p.isAiDone ? p.ai ?? "no idea" : p.wantsAi ? "waiting…" : "…";
		const summary = [...p.summary, ...words.length ? [`added: ${words.join(", ")}`] : []];
		return /* @__PURE__ */ h(Box, { flexDirection: "column" }, /* @__PURE__ */ h(Text, { wrap: "truncate-end" }, /* @__PURE__ */ h(Text, { dimColor: true }, "…", p.before), /* @__PURE__ */ h(Text, {
			weight: "bold",
			underline: true,
			color: p.isExtra ? "yellow" : "red"
		}, p.word), /* @__PURE__ */ h(Text, { dimColor: true }, p.after, "…")), /* @__PURE__ */ h(Box, {
			flexWrap: "wrap",
			columnGap: 2
		}, /* @__PURE__ */ h(Button, {
			key: "ai",
			hotkey: "1",
			plain: true,
			onPress: () => a.pick("1")
		}, slot, /* @__PURE__ */ h(Text, { dimColor: true }, " (Haiku)")), p.suggestions.map((s, i) => /* @__PURE__ */ h(Button, {
			key: `s${i}`,
			hotkey: String(i + 2),
			plain: true,
			onPress: () => a.pick(String(i + 2))
		}, s)), /* @__PURE__ */ h(Button, {
			key: "skip",
			hotkey: "s",
			plain: true,
			label: "skip",
			onPress: () => a.pick("s")
		}), v.hasPersonal && !p.isExtra ? /* @__PURE__ */ h(Button, {
			key: "add",
			hotkey: "d",
			plain: true,
			label: "add to dictionary",
			onPress: () => a.pick("d")
		}) : null, /* @__PURE__ */ h(Button, {
			key: "all",
			hotkey: "a",
			plain: true,
			label: p.wantsAll ? "waiting…" : "fix all",
			onPress: () => a.pick("a")
		}), toggle), summary.length > 0 && /* @__PURE__ */ h(Box, { columnGap: 2 }, /* @__PURE__ */ h(Text, {
			wrap: "truncate-end",
			dimColor: true
		}, summary.join(" · ")), words.length > 0 && /* @__PURE__ */ h(Button, {
			key: "undo",
			hotkey: "8",
			plain: true,
			label: "undo add",
			onPress: () => a.pick("8")
		})));
	}
	const notes = [...done ? [["fixed: ", done.changes.join(", ")]] : [], ...words.length ? [["added: ", words.join(", ")]] : []];
	return /* @__PURE__ */ h(Box, { columnGap: 2 }, notes.length > 0 && /* @__PURE__ */ h(Fragment, null, /* @__PURE__ */ h(Text, { wrap: "truncate-end" }, notes.flatMap(([label, list], i) => [/* @__PURE__ */ h(Text, {
		key: `n${i}`,
		dimColor: true
	}, i ? ` · ${label}` : label), list])), /* @__PURE__ */ h(Button, {
		key: "undo",
		hotkey: "8",
		plain: true,
		label: "undo",
		onPress: () => a.answer("8")
	}), /* @__PURE__ */ h(Button, {
		key: "dismiss",
		hotkey: "9",
		plain: true,
		label: "dismiss",
		role: "dismiss",
		onPress: () => a.answer("9")
	})), isBusy || n > 0 ? toggle : hidden);
}

export { kitOf as a, forSurface as i, guiBand as n, terminalBand as r, ACTION_KEYS as t };