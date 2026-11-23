import { atom, read, update } from "claude-code";
import { _ as textOf, a as ringMove, b as tokens, c as can, d as surfaces, f as cellWidth, g as spansWidth, h as span, i as ring, l as ctxOf, m as line, n as actionKey, o as stack, p as escapeMarkdown, r as paintLines, s as notice$1, t as RING, u as holds, v as truncateSpans, y as meaningOf } from "./claude-B3pwfCuK.js";

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

// ../../lib/kits/band/src/internal.ts
/** The meaning each status marks the band with on a graphical surface. */
const statusMeaning = (status) => `state:${status}`;

// ../../lib/kits/band/src/model.ts
const capital$1 = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
function view$2(model, surface) {
	if (holds(surface, "cells")) return {
		mark: void 0,
		text: model.text,
		buttons: [],
		layout: "line"
	};
	const actions = model.actions ?? [];
	return {
		mark: model.mark ?? statusMeaning(model.status ?? "warning"),
		text: model.words ?? model.text,
		buttons: [{
			label: capital$1(model.hint),
			hit: model.hit
		}, ...actions].map((b) => ({
			label: capital$1(b.label),
			hit: b.hit
		})),
		layout: actions.length === 0 || model.isOneLine ? "line" : "stacked"
	};
}

// ../../lib/kits/band/src/gui.tsx
/** The status band on the graphical surfaces: an icon, the text and quiet buttons. */
/**
* The band's line: the status mark, the text, a quiet way-in button (`hint`) and a quiet button
* per further action, at the inset. A button's `hit` goes to `g.press`.
*/
function statusBand$1(g, b) {
	const { Box, Button } = g.els;
	const v = view$2(b, g.surface);
	const { across } = tokens.gui;
	const isOneLine = Boolean(b.isOneLine);
	const mark = v.mark ? meaning(g, v.mark) : null;
	const words = /* @__PURE__ */ h(Box, {
		flexShrink: 1,
		flexGrow: isOneLine ? 1 : void 0
	}, typed(g, "body", v.text, { wrap: isOneLine ? "truncate-end" : void 0 }));
	const buttons = v.buttons.map((x) => /* @__PURE__ */ h(Button, {
		key: x.hit,
		dimColor: true,
		label: x.label,
		onPress: () => g.press?.(x.hit)
	}));
	if (v.layout === "line") return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: across.inset
	}, rowOf(g, {}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: across.sm,
		flexGrow: 1
	}, mark, words, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexShrink: 0,
		columnGap: across.xs
	}, buttons))));
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: across.inset
	}, rows(g, {}, rowOf(g, {}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: across.sm
	}, mark, words)), rowOf(g, {}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.xs
	}, buttons))));
}

// ../../lib/kits/band/src/terminal.ts
/** The status band as styled lines: the one drawing both terminals paint. */
/**
* The band's line: the status mark and the text in the status's role, the hint dim after it,
* and the whole line one control. The text is cut with `…` so the hint stays whole.
*/
function statusBand({ text, hint, hit, width, status = "warning", hovered }) {
	const tail = ` ${hint}`;
	const room = Math.max(1, width - cellWidth(tail));
	const head = truncateSpans([span(`${meaningOf(statusMeaning(status)).glyph} ${text}`, {
		role: status,
		bold: hovered
	})], room);
	return [line([...head, span(tail, {
		role: "dim",
		bold: hovered
	})], hit)];
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
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
function view$1(model, surface) {
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
				label: isGui && !b.isLiteral ? capital(b.label) : b.label,
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
const CHECK$1 = "✓";
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
	const drawn = view$1(props, g.surface);
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
		label: b.tone === "chosen" ? `${CHECK$1} ${b.label}` : b.label,
		onPress: () => g.press(b.hit)
	})))));
}

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

// ../../lib/kits/card/src/gui.tsx
const { space, across, lead } = tokens.gui;
/** The column that leads a row of answers: the mark's icon and the key's Button. */
const LEAD = lead + 2.2;
/** The nonempty parts of a card, a gap between them. */
function sections(g, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.sm
	}, parts.filter(Boolean));
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
* One line telling the person what just happened: an icon for the state it is in (success,
* warning, error, pending) and its words in a type role, at the inset. The surface wraps it, or
* with `isCut` cuts it at the edge.
*/
function notice(g, n) {
	const { Box } = g.els;
	const v = view({
		...n,
		isEmpty: false
	}, g.surface);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: tokens.gui.across.inset
	}, rowOf(g, {}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: tokens.gui.across.sm
	}, v.mark ? meaning(g, v.mark) : null, /* @__PURE__ */ h(Box, { flexShrink: 1 }, said(g, v, v.rows === "cut" ? "truncate-end" : void 0)))));
}

// src/claude/band.tsx
const arrows = (change) => change.replace("→", " → ");
/** The control that opens the picker, or closes it. */
const TOGGLE = "spellfix";
/**
* The controls the keyboard steps through, in the order Tab takes them: the picks, the actions,
* and the count line last.
*/
function focusOrder(v) {
	const { picker: p } = v;
	const toggle = p || !v.isBusy && v.count > 0 ? [TOGGLE] : [];
	if (p) return [
		...p.isAiDone && !p.ai ? [] : ["ai"],
		...suggestionButtons(p).map((b) => b.hit),
		...pickerActions(v, p).map((b) => b.hit),
		...toggle
	];
	return [...isMarked(v) ? reportActions.map((b) => b.hit) : [], ...toggle];
}
/** The control that has the keyboard's focus: the one it moved to, else the first. */
const focusOf = (v) => {
	const order = focusOrder(v);
	return v.focus !== null && order.includes(v.focus) ? v.focus : order[0];
};
/**
* What a control of the band does, by its `hit`: the keys the picker answers, or those of the
* report and the auto-added notice, which share `8` for undo.
*/
function bandPress(v, a) {
	return (hit) => {
		if (hit === TOGGLE) return a.toggle();
		if (hit === "ai") return a.pick("1");
		if (hit === "skip") return a.pick("s");
		if (hit === "all") return a.pick("a");
		if (hit === "add") return a.pick("d");
		if (hit === "undo") return v.picker ? a.pick("8") : a.answer("8");
		if (hit === "dismiss") return a.answer("9");
		const suggestion = /^s(\d+)$/.exec(hit);
		if (suggestion) return a.pick(String(Number(suggestion[1]) + 2));
	};
}
/** The count line's words; a picker opened on a typo only Haiku found has no count. */
const countText = (n) => n > 0 ? `${n} misspelled` : "A typo only Haiku found";
const note = (text, status, isCut = false) => ({
	text,
	status,
	isCut
});
/** Haiku's pick: its answer is a word to insert, until then it says what it waits for. */
const aiButton = (p, label) => ({
	hotkey: "1",
	label,
	hit: "ai",
	isLiteral: p.isAiDone
});
const suggestionButtons = (p) => p.suggestions.map((s, i) => ({
	hotkey: String(i + 2),
	label: s,
	hit: `s${i}`,
	isLiteral: true
}));
const pickerActions = (v, p) => [
	{
		hotkey: "s",
		label: "skip",
		hit: "skip"
	},
	{
		hotkey: "a",
		label: p.wantsAll ? "waiting" : "fix all",
		hit: "all"
	},
	...v.hasPersonal && !p.isExtra ? [{
		hotkey: "d",
		label: "add word",
		hit: "add"
	}] : [],
	...v.added.length > 0 ? [{
		hotkey: "8",
		label: "undo add",
		hit: "undo"
	}] : []
];
const reportActions = [{
	hotkey: "8",
	label: "undo",
	hit: "undo"
}, {
	hotkey: "9",
	label: "dismiss",
	hit: "dismiss"
}];
const addedNote = (words) => `Added ${words.join(", ")} to the dictionary`;
/** What the picker says under its buttons: what fix all would change, and the words added. */
const pickerNotes = (v, p) => [...p.summary.length > 0 ? [note(`Fix all changes ${p.summary.map(arrows).join(", ")}`, "dim", true)] : [], ...v.added.length > 0 ? [note(addedNote(v.added), "dim")] : []];
/** What the band says once the picker is closed: the report of fix all and the words added. */
const reportNotes = (v) => [...v.report ? [note(`Fixed ${v.report.changes.map(arrows).join(", ")}`, "text")] : [], ...v.added.length > 0 ? [note(addedNote(v.added), "text")] : []];
const isMarked = (v) => v.report !== null || v.added.length > 0;
/** The typo in its context, standing out in the role of what it is. */
const context = (p, lead, trail, isUnderlined) => [
	span(lead, { role: "dim" }),
	span(p.word, {
		role: p.isExtra ? "warning" : "error",
		bold: true,
		underline: isUnderlined || void 0
	}),
	span(trail, { role: "dim" })
];
/**
* The band in the terminal: the kit's lines painted as one block, every control a plain Button.
* The keys sit on buttons that draw nothing, with the engine's focus ring parked beside them, so
* the band draws the keyboard's focus itself (`ui.focus` moves it). Null when there is nothing to
* say.
* @param width The band's room in cells.
*/
function terminalBand(els, v, a, width) {
	const press = bandPress(v, a);
	const focus = v.focus === null ? void 0 : focusOf(v);
	const { picker: p, count: n } = v;
	const status = (hint, width) => ({
		text: countText(n),
		hint: `${hint} ctrl+q`,
		hit: TOGGLE,
		status: "warning",
		width,
		hovered: focus === TOGGLE
	});
	const marked = (buttons) => buttons.map((b) => ({
		...b,
		hovered: b.hit === focus
	}));
	const notes = (list) => list.flatMap((x) => notice$1({
		text: x.text,
		width,
		status: x.status
	}));
	/** `buttons` are every key the band binds, drawn or not. */
	const painted = (lines, buttons) => stack(els, ring(els, () => focus ? press(focus) : void 0, buttons.map((b) => ({
		key: b.hotkey,
		press: () => press(b.hit)
	}))), paintLines(els, lines, {
		press,
		width
	}));
	if (p) {
		const waiting = p.wantsAi ? "waiting" : "checking";
		const buttons = [
			aiButton(p, `${p.isAiDone ? p.ai ?? "" : waiting} (Haiku)`),
			...suggestionButtons(p),
			...pickerActions(v, p)
		];
		const isMute = p.isAiDone && !p.ai;
		const lead = isMute ? [span("Haiku has no suggestion", { role: "dim" })] : [];
		return painted([
			...statusBand(status("close", width)),
			...notice$1({
				text: context(p, `…${p.before}`, `${p.after}…`, true),
				width,
				status: "text"
			}),
			...buttonRow(marked(isMute ? buttons.slice(1) : buttons), width, {
				wrap: true,
				lead
			}),
			...notes(pickerNotes(v, p))
		], buttons);
	}
	const isMarkedNow = isMarked(v);
	const head = v.isBusy ? notice$1({
		text: "Checking spelling",
		width,
		status: "dim"
	}) : n > 0 ? statusBand(status("review", width)) : [];
	if (head.length === 0 && !isMarkedNow) return null;
	return painted([
		...head,
		...notes(reportNotes(v)),
		...isMarkedNow ? buttonRow(marked(reportActions), width, { wrap: true }) : []
	], isMarkedNow ? reportActions : []);
}
/**
* The band on the desktop app and VS Code: the count line (its button opens, then closes, the
* picker) with the picker or the report under it.
*/
function guiBand(g, v) {
	const { picker: p, count: n } = v;
	const head = (hint) => statusBand$1(g, {
		text: countText(n),
		hint,
		hit: TOGGLE,
		status: "warning"
	});
	const notes = (list) => list.map((x) => notice(g, {
		text: x.text,
		status: x.status,
		isCut: x.isCut
	}));
	if (p) {
		const ai = [];
		if (p.ai || !p.isAiDone) ai.push(aiButton(p, p.isAiDone ? p.ai ?? "" : p.wantsAi ? "waiting" : "checking"));
		const lead = [span(ai.length > 0 ? "Haiku" : "Haiku has no suggestion", { role: "dim" })];
		return sections(g, head("close"), notice(g, {
			text: context(p, p.lead, p.trail, false),
			status: "text"
		}), buttonRow$1(g, {
			rows: [ai],
			lead
		}), buttonRow$1(g, { rows: [suggestionButtons(p)] }), ...notes(pickerNotes(v, p)), buttonRow$1(g, { rows: [pickerActions(v, p)] }));
	}
	const marked = isMarked(v);
	return sections(g, v.isBusy ? notice(g, {
		text: "Checking spelling",
		status: "pending"
	}) : n > 0 ? head("review") : null, ...notes(reportNotes(v)), marked ? buttonRow$1(g, { rows: [reportActions] }) : null);
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
/** hunspell `-a` input asking for `word`'s suggestions; `^` keeps the word from being read as a command. */
function suggestInput(word) {
	return `^${word}\n`;
}
/** The first `limit` suggestions in hunspell `-a` output; none when the word was accepted. */
function parseSuggestions(stdout, limit) {
	return stdout.split("\n").find((l) => l.startsWith("& "))?.split(": ")[1]?.split(", ").filter(Boolean).slice(0, limit) ?? [];
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
function isExtra(m) {
	return "fix" in m;
}
/** `misses` with the `extras` that overlap none of them, in draft order. */
function withExtras(misses, extras) {
	const found = [...misses];
	for (const x of extras) if (!found.some((m) => m.start < x.end && x.start < m.end)) found.push(x);
	return found.sort((a, b) => a.start - b.start);
}
function nearest(found, cursor) {
	const distance = (m) => cursor < m.start ? m.start - cursor : Math.max(0, cursor - m.end);
	return found.reduce((best, m) => !best || distance(m) < distance(best) ? m : best, void 0);
}

// src/claude.tsx
const ACTION = "app:toggleDiffNoiseFilter";
const PLUGIN = "spellfix";
const SUGGESTIONS = 5;
const CHECK_DELAY_MS = 300;
const count = atom({
	plugin: "spellfix",
	key: "count"
}, 0);
const hasDraft = atom({
	plugin: "spellfix",
	key: "hasDraft"
}, false);
const picker = atom({
	plugin: "spellfix",
	key: "picker"
}, null);
const report = atom({
	plugin: "spellfix",
	key: "report"
}, null);
const added = atom({
	plugin: "spellfix",
	key: "added"
}, []);
const focus = atom({
	plugin: "spellfix",
	key: "focus"
}, null);
const isBusy = atom({
	plugin: "spellfix",
	key: "isBusy"
}, false);
let config = {
	hunspell: "hunspell",
	dictionaries: "en_US",
	personal: ""
};
const ignored = /* @__PURE__ */ new Set();
const unadded = /* @__PURE__ */ new Set();
let isEventDriven = false;
let seen = "";
let written = "";
let timer;
let checkId = 0;
let hasWarned = false;
let batch;
function readConfig(options) {
	const text = (key, fallback) => {
		const value = options[key];
		return typeof value === "string" && value !== "" ? value : fallback;
	};
	return {
		hunspell: text("hunspell", "hunspell"),
		dictionaries: text("dictionaries", "en_US"),
		personal: text("personalDictionary", "")
	};
}
function hunspellArgv(mode) {
	return [config.hunspell, ...hunspellArgs(mode, config.dictionaries, config.personal)];
}
async function runHunspell($, mode, stdin) {
	try {
		const r = await $.process.run(hunspellArgv(mode), {
			stdin,
			timeoutMs: 5e3
		});
		if (r.exitCode === 0) return r.stdout;
		throw new Error(r.stderr.trim() || `exit ${r.exitCode}`);
	} catch (error) {
		if (!hasWarned) {
			hasWarned = true;
			$.ui.toast(`spellfix: hunspell failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		return;
	}
}
/** The candidates hunspell rejects, skipped words excluded; none when hunspell fails. */
async function findMisses($, text) {
	const words = candidates(text).filter((w) => !ignored.has(w.word));
	if (words.length === 0) return [];
	const stdout = await runHunspell($, "-l", `${[...new Set(words.map((w) => w.word))].join("\n")}\n`);
	if (stdout === void 0) return [];
	const bad = new Set(stdout.split("\n").filter(Boolean));
	return words.filter((w) => bad.has(w.word));
}
/** The words hunspell accepts; none when it fails. */
async function knownWords($, words) {
	if (words.length === 0) return /* @__PURE__ */ new Set();
	const stdout = await runHunspell($, "-l", `${words.join("\n")}\n`);
	if (stdout === void 0) return /* @__PURE__ */ new Set();
	const bad = new Set(stdout.split("\n"));
	return new Set(words.filter((w) => !bad.has(w)));
}
/** hunspell's misses plus the batch's extras for `text`, in draft order. */
async function allMisses($, text) {
	const extras = batch?.text === text ? batch.result?.extras ?? [] : [];
	return withExtras(await findMisses($, text), extras);
}
/** Haiku's fix for `m` from the batch, if it has landed and has one. */
function fixFor(m) {
	if (isExtra(m)) return m.fix;
	const v = batch?.result?.verdicts.get(m.word);
	return v?.kind === "fix" ? v.word : null;
}
function summarize(found) {
	return found.flatMap((m) => {
		const fix = fixFor(m);
		return fix ? [`${m.word}→${fix}${isExtra(m) ? "?" : ""}`] : [];
	});
}
async function suggest($, word) {
	const stdout = await runHunspell($, "-a", suggestInput(word));
	return stdout === void 0 ? [] : parseSuggestions(stdout, SUGGESTIONS);
}
async function addWords($, words) {
	for (const word of words) ignored.add(word);
	if (config.personal && words.length) await runHunspell($, "-a", addInput(words));
}
/** Takes auto-added words back out of the personal dictionary; hunspell itself can't remove one. */
async function removeWords($, words) {
	for (const word of words) {
		ignored.delete(word);
		unadded.add(word);
	}
	if (!config.personal) return;
	try {
		await $.fs.write(config.personal, withoutWords(await $.fs.read(config.personal), words));
	} catch (error) {
		$.ui.toast(`spellfix: couldn't edit ${config.personal}: ${String(error)}`);
	}
}
/** Keeps the batch on the draft through a fix the picker made to `text`. */
function noteSplice(text, m, replacement) {
	if (batch?.text !== text) return;
	const delta = replacement.length - (m.end - m.start);
	batch.text = `${text.slice(0, m.start)}${replacement}${text.slice(m.end)}`;
	if (!batch.result) batch.edits.push({
		start: m.start,
		end: m.end,
		delta
	});
	else batch.result.extras = batch.result.extras.flatMap((x) => shift(x, m.start, m.end, delta) ?? []);
}
/** Starts the batch for `text` unless one for it is already out or in. */
function ensureBatch($, text) {
	if (batch?.text === text) return batch;
	const b = {
		text,
		edits: []
	};
	batch = b;
	runBatch($, b, text);
	return b;
}
async function runBatch($, b, text) {
	const flagged = await findMisses($, text);
	const distinct = new Set(flagged.map((m) => m.word));
	const r = await $.model.complete({
		model: "haiku",
		system: CHECK,
		prompt: checkPrompt(text, flagged),
		effort: "low",
		maxTokens: replyBudget(distinct.size),
		timeoutMs: 2e4
	});
	if (!r.isAnswered) $.ui.toast(`spellfix: Haiku failed: ${r.reason}`);
	const { verdicts, found } = parseReply(r.isAnswered ? r.text : "", text, distinct);
	const variants = [...verdicts].flatMap(([word, v]) => v.kind === "correct" ? caseVariants(word) : []);
	recase(verdicts, await knownWords($, variants));
	let extras = placeExtras(text, found, flagged);
	for (const e of b.edits) extras = extras.flatMap((x) => shift(x, e.start, e.end, e.delta) ?? []);
	b.result = {
		verdicts,
		extras
	};
	if (batch === b) await landed($, b);
}
/** Acts on a batch's answers: adds the words it calls correct and brings the picker up to date. */
async function landed($, b) {
	const correct = autoAdds(b.result.verdicts, (word) => unadded.has(word) || ignored.has(word));
	await addWords($, correct);
	if (config.personal && correct.length) await update($, added, (words) => [.../* @__PURE__ */ new Set([...words, ...correct])]);
	const { text, cursor } = await $.prompt.read();
	if (text !== b.text) {
		await update($, isBusy, () => false);
		return;
	}
	if (await read($, isBusy)) {
		await update($, isBusy, () => false);
		const found = await allMisses($, text);
		const target = nearest(found, cursor);
		if (target) await show($, text, target);
		else $.ui.toast(correct.length ? "No misspellings left" : "No misspellings");
		return;
	}
	const p = await read($, picker);
	if (!p) return;
	if (correct.includes(p.word) && !p.isExtra) {
		await advance($, text, p.start);
		return;
	}
	const found = await allMisses($, text);
	const answered = {
		...p,
		ai: fixFor(found.find((m) => m.start === p.start) ?? p),
		isAiDone: true,
		wantsAi: false,
		wantsAll: false,
		summary: summarize(found)
	};
	await update($, picker, () => answered);
	if (p.wantsAll) await applyAllLate($);
	else if (p.wantsAi && answered.ai) await applyLate($, answered, answered.ai);
}
/**
* Takes in a draft the host raised no event for: what the edit and change hooks do when it did.
* A draft this mod filled in itself keeps its picker and report, as a plugin-origin change does.
*/
async function watchDraft($) {
	if (isEventDriven) return;
	const box = await $.prompt.read();
	if (box.text === seen) return;
	if (box.text === "") {
		ignored.clear();
		unadded.clear();
	}
	seen = box.text;
	if (box.text !== written) $.clock.after(0, async () => {
		await closePicker($);
		await dismiss($);
	});
	scheduleCheck($, box);
}
function scheduleCheck($, box) {
	timer?.cancel();
	timer = $.clock.after(CHECK_DELAY_MS, () => void refreshCount($, box));
}
async function refreshCount($, box) {
	const id = ++checkId;
	const n = (await findMisses($, box.text)).filter((m) => m.end !== box.cursor).length;
	if (id !== checkId) return;
	if (await read($, count) !== n) await update($, count, () => n);
	const has = box.text.trim() !== "";
	if (await read($, hasDraft) !== has) await update($, hasDraft, () => has);
}
/**
* Opens the picker on the misspelled word at or nearest the cursor, starting the batch; with
* none flagged, opens once the batch finds one. Closes it when open.
*/
async function togglePicker($) {
	if (await read($, picker)) {
		await closePicker($);
		return;
	}
	const { text, cursor } = await $.prompt.read();
	if (text.trim() === "") {
		$.ui.toast("No misspellings");
		return;
	}
	const b = ensureBatch($, text);
	const found = await allMisses($, text);
	const target = nearest(found, cursor);
	if (target) await show($, text, target);
	else if (!b.result) await update($, isBusy, () => true);
	else $.ui.toast("No misspellings");
}
/** The words a graphical surface sets round `miss`, to wrap or cut as it likes: no more than a sentence or so each way. */
function surround(text, miss) {
	const reach = 80;
	const flat = (s) => s.replace(/\s+/g, " ");
	const lead = flat(text.slice(Math.max(0, miss.start - reach), miss.start));
	const trail = flat(text.slice(miss.end, miss.end + reach));
	const isCutBefore = miss.start > reach && /\S/.test(text.charAt(miss.start - reach - 1));
	const isCutAfter = text.length > miss.end + reach && /\S/.test(text.charAt(miss.end + reach));
	return [isCutBefore ? lead.replace(/^\S*/, "").replace(/^ /, "") : lead, isCutAfter ? trail.replace(/\S*$/, "").replace(/ $/, "") : trail];
}
async function show($, text, miss) {
	const suggestions = isExtra(miss) ? [] : await suggest($, miss.word);
	const before = text.slice(Math.max(0, miss.start - 30), miss.start).replace(/\s+/g, " ");
	const after = text.slice(miss.end, miss.end + 30).replace(/\s+/g, " ");
	const [lead, trail] = surround(text, miss);
	const isAiDone = batch?.text === text && batch.result !== void 0;
	const shown = {
		word: miss.word,
		start: miss.start,
		end: miss.end,
		before,
		after,
		lead,
		trail,
		suggestions,
		isExtra: isExtra(miss),
		ai: isAiDone ? fixFor(miss) : null,
		isAiDone,
		wantsAi: false,
		wantsAll: false,
		summary: isAiDone ? summarize(await allMisses($, text)) : []
	};
	await update($, picker, () => shown);
}
/** Applies a pick made before its answer arrived; outside an edit, so the fill says where the cursor stays. */
async function applyLate($, p, choice) {
	const box = await $.prompt.read();
	if (box.text.slice(p.start, p.end) !== p.word) return;
	const fixed = splice(box, p, choice);
	noteSplice(box.text, p, choice);
	written = fixed.text;
	await $.prompt.fill({
		text: fixed.text,
		cursor: fixed.cursor,
		mode: "replace"
	});
	await advance($, fixed.text, p.start + choice.length);
}
async function closePicker($) {
	if (await read($, picker)) await update($, picker, () => null);
}
/** Moves the picker to the next misspelled word at or after `from`, wrapping; closes it when none are left. */
async function advance($, text, from) {
	const found = await allMisses($, text);
	const next = found.find((m) => m.start >= from) ?? found[0];
	if (next) {
		await show($, text, next);
		return;
	}
	await closePicker($);
	$.ui.toast("No misspellings left");
}
/** `p` replaced by `replacement` in `box`, the cursor kept on the same text. */
function splice(box, p, replacement) {
	const delta = replacement.length - (p.end - p.start);
	const cursor = box.cursor >= p.end ? box.cursor + delta : Math.min(box.cursor, p.start + replacement.length);
	return {
		text: `${box.text.slice(0, p.start)}${replacement}${box.text.slice(p.end)}`,
		cursor
	};
}
/** Every fix the landed batch has, applied to `box` and reported for undo; undefined with none. */
async function applyAll($, box) {
	const fixes = (await allMisses($, box.text)).flatMap((m) => {
		const fix = fixFor(m);
		return fix ? [{
			...m,
			fix
		}] : [];
	});
	await closePicker($);
	if (fixes.length === 0) {
		$.ui.toast("Nothing for Haiku to fix");
		return;
	}
	let fixed = box;
	for (const f of [...fixes].reverse()) {
		noteSplice(fixed.text, f, f.fix);
		fixed = splice(fixed, f, f.fix);
	}
	const done = {
		original: box,
		fixed: fixed.text,
		changes: fixes.map((f) => `${f.word}→${f.fix}`)
	};
	await update($, report, () => done);
	return fixed;
}
/** `a` pressed before the batch landed, applied now that it has. */
async function applyAllLate($) {
	const fixed = await applyAll($, await $.prompt.read());
	if (fixed) {
		written = fixed.text;
		await $.prompt.fill({
			text: fixed.text,
			cursor: fixed.cursor,
			mode: "replace"
		});
	}
}
/**
* Answers one picker key against the draft in `box`: the box afterwards, or undefined when `key`
* is not a picker key (the caller closes the picker).
*/
async function pick($, key, box) {
	const p = await read($, picker);
	if (!p || box.text.slice(p.start, p.end) !== p.word) return void 0;
	if (key === "s" || key === "d" && !p.isExtra && config.personal) {
		if (key === "d") await addWords($, [p.word]);
		else if (p.isExtra && batch?.result) batch.result.extras = batch.result.extras.filter((x) => x.start !== p.start);
		else ignored.add(p.word);
		await advance($, box.text, p.end);
		return box;
	}
	if (key === "8") {
		const words = await read($, added);
		if (words.length === 0) return void 0;
		await update($, added, () => []);
		await removeWords($, words);
		await advance($, box.text, p.start);
		return box;
	}
	if (key === "a") {
		if (p.isAiDone) return await applyAll($, box) ?? box;
		const waiting = {
			...p,
			wantsAll: true
		};
		await update($, picker, () => waiting);
		return box;
	}
	if (!/^[1-9]$/.test(key)) return void 0;
	if (key === "1" && !p.isAiDone) {
		const waiting = {
			...p,
			wantsAi: true
		};
		await update($, picker, () => waiting);
		return box;
	}
	const choice = key === "1" ? p.ai : p.suggestions[Number(key) - 2];
	if (!choice) return box;
	const fixed = splice(box, p, choice);
	noteSplice(box.text, p, choice);
	await advance($, fixed.text, p.start + choice.length);
	return fixed;
}
/** A picker key pressed on the band itself (a click, or its hotkey while the band holds the keys). */
async function pickFromBand($, key) {
	const box = await $.prompt.read();
	const fixed = await pick($, key, box);
	if (fixed && fixed.text !== box.text) {
		written = fixed.text;
		await $.prompt.fill({
			text: fixed.text,
			cursor: fixed.cursor,
			mode: "replace"
		});
	}
}
/**
* Answers a key while the fix-all report or auto-added notice shows, like a picker key: `8`
* takes back the fix-all (while the draft is still exactly what it produced) and the auto-added
* words, `9` dismisses. The box afterwards, or undefined for any other key.
*/
async function answerReport($, key, box) {
	if (key !== "8" && key !== "9") return void 0;
	const r = await read($, report);
	const words = await read($, added);
	if (!r && words.length === 0) return void 0;
	await dismiss($);
	if (key === "9") return box;
	if (words.length) await removeWords($, words);
	return r && box.text === r.fixed ? r.original : box;
}
/** A report key pressed on the band itself. */
async function answerFromBand($, key) {
	const box = await $.prompt.read();
	const answered = await answerReport($, key, box);
	if (answered && answered.text !== box.text) {
		written = answered.text;
		await $.prompt.fill({
			text: answered.text,
			cursor: answered.cursor,
			mode: "replace"
		});
	}
}
/** Clears the fix-all report and the auto-added notice. */
async function dismiss($) {
	if (await read($, report)) await update($, report, () => null);
	if ((await read($, added)).length) await update($, added, () => []);
}
/** What the band draws from, read from the atoms. */
async function bandView($) {
	return {
		picker: await read($, picker),
		report: await read($, report),
		added: await read($, added),
		isBusy: await read($, isBusy),
		count: await read($, count),
		hasPersonal: Boolean(config.personal),
		focus: await read($, focus)
	};
}
const register = (on, options) => {
	config = readConfig(options);
	isEventDriven = false;
	seen = "";
	written = "";
	on("prompt.edit", async ($, e, next) => {
		isEventDriven = true;
		if (await read($, focus)) await update($, focus, () => null);
		const key = e.key && !e.key.ctrl && !e.key.meta ? e.key.key : void 0;
		const box = {
			text: e.text,
			cursor: e.cursor
		};
		if (key && await read($, picker)) {
			const picked = await pick($, key, box);
			if (picked) {
				scheduleCheck($, picked);
				return picked;
			}
		}
		await closePicker($);
		const answered = key ? await answerReport($, key, box) : void 0;
		if (answered) {
			scheduleCheck($, answered);
			return answered;
		}
		await dismiss($);
		const edited = await next(e);
		scheduleCheck($, edited);
		return edited;
	});
	on("prompt.change", async ($, e, next) => {
		isEventDriven = true;
		if (e.origin.kind !== "plugin" && await read($, focus)) await update($, focus, () => null);
		if (e.origin.kind === "clear") {
			ignored.clear();
			unadded.clear();
		}
		if (!(e.origin.kind === "plugin" && e.origin.name === PLUGIN)) {
			await closePicker($);
			await dismiss($);
		}
		scheduleCheck($, e);
		return next(e);
	});
	on("ui.focus", async ($, e, next) => {
		const order = focusOrder(await bandView($));
		const move = ringMove(e.element, (hit) => order.includes(hit));
		const held = await read($, focus);
		let target;
		if (move && "hit" in move) target = move.hit;
		else if (move?.by) {
			const at = order.indexOf(held ?? "");
			target = order[((at < 0 ? move.by > 0 ? -1 : 0 : at) + move.by + order.length) % order.length];
		} else if (!move && e.element === RING.park) target = held && order.includes(held) ? held : order[0];
		if (target !== void 0 && target !== held) await update($, focus, () => target ?? null);
		return next(move ? {
			...e,
			element: RING.park
		} : e);
	});
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);
		const below = await next(e);
		await watchDraft($);
		const p = await read($, picker);
		const done = await read($, report);
		const words = await read($, added);
		const busy = await read($, isBusy);
		const n = await read($, count);
		const draft = await read($, hasDraft);
		const isQuiet = !p && !done && !busy && n === 0 && words.length === 0;
		if (isQuiet && !draft) return below;
		const els = $.ui.resolve(e);
		const view = await bandView($);
		const actions = {
			toggle: () => togglePicker($),
			pick: (key) => pickFromBand($, key),
			answer: (key) => answerFromBand($, key)
		};
		return forSurface(e, {
			tui: () => stack(els, below, actionKey(els, ACTION, actions.toggle), isQuiet ? null : terminalBand(els, view, actions, e.props.bodyColumns)),
			gui: () => isQuiet ? below : stack(els, below, guiBand(guiOf(els, e, bandPress(view, actions)), view))
		});
	});
};

export { register };