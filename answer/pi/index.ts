import { randomUUID } from "node:crypto";
import { contentText } from "@earendil-works/pi-ai";
import { getMarkdownTheme, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import { Editor, Markdown, ScrollView, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// src/lib/parse/doc.ts
const FENCE$1 = /^\s*(`{3,}|~{3,})(.*)$/;
const RULE$1 = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^#{1,6}\s+/;
const BULLET = /^[-*+]\s+/;
const QUOTE = /^>\s*/;
const Q_LABEL = /^(?:❓\s*)?(\*\*)?Q(?:uestion)?\s*(\d{1,3})(\s*\([^)]*\))?(\*\*)?(?:[.:)]|\s*[—–-](?=\s))(\*\*)?\s+(.+)$/;
const N_LABEL = /^(\*\*)?(\d{1,3})[.:)](\*\*)?\s+(.+)$/;
const OPTION = /^(\*\*)?\(?([A-Ha-h])[.)](\*\*)?(?:\s+(.+))?$/;
const LEAN = /^\**(?:(?:My )?recommend(?:ed|ation)(?: answer)?\**\s*:\s*\**|➡️)\s*(.*)$/i;
const LEAN_SENTENCE = /^\**(?:My )?recommend(?:ed|ation)(?: answer)?\**\s+is\s/i;
const unbold = (text) => text.replaceAll("**", "").trim();
/**
* `**Title.** more words`: the bold a line leads with is its title and the rest follows, without
* the comma or colon that joined it on. `open` when a bold opened before the label and is still
* open. A line that leads with no bold is all title: `**A.** More **words**` stays whole.
*/
function titled(words, open) {
	const lead = open ? words : words.startsWith("**") ? words.slice(2) : void 0;
	const close = lead?.indexOf("**") ?? -1;
	if (lead === void 0 || close < 0) return {
		title: words.trim(),
		rest: ""
	};
	const rest = lead.slice(close + 2).replace(/^\s*[,;:–—]\s*/, "");
	return {
		title: lead.slice(0, close).trim(),
		rest: rest.trim()
	};
}
/** A label is unindented: a number under a list item is that item's own. */
function labelOf(line) {
	const words = line.replace(HEADING, "");
	const asked = Q_LABEL.exec(words);
	const [open, n = "", shut, after = ""] = asked ? [
		asked[1],
		asked[2],
		asked[4] ?? asked[5],
		asked[6]
	] : N_LABEL.exec(words)?.slice(1) ?? [];
	const { title, rest } = titled(after, Boolean(open) && !shut);
	if (!unbold(title)) return void 0;
	return {
		is: "label",
		q: Boolean(asked),
		n: Number(n),
		label: asked ? `Q${n}` : n,
		again: Boolean(asked?.[3]),
		title: unbold(title),
		rest
	};
}
function optionOf(item, bullet) {
	const [, open, letter, shut, after = ""] = OPTION.exec(item) ?? [];
	if (!letter) return void 0;
	const { title, rest } = titled(after, Boolean(open) && !shut);
	return {
		is: "option",
		key: letter.toUpperCase(),
		text: title,
		more: rest,
		bullet
	};
}
function leanOf(words) {
	const said = words.replace(QUOTE, "");
	const text = LEAN.exec(said)?.[1] ?? (LEAN_SENTENCE.test(said) ? said : void 0);
	return text === void 0 ? void 0 : {
		is: "lean",
		text
	};
}
/** A line's mark: a label first, then an option, and a recommendation only on a line that is no list item. */
function markOf(raw, indent) {
	const words = raw.trim();
	const item = words.replace(BULLET, "");
	const bullet = item !== words;
	return (indent === 0 ? labelOf(words) : void 0) ?? optionOf(item, bullet) ?? (bullet ? { is: "bullet" } : leanOf(words));
}
/**
* Whether each line is code. A fence closes on a line of at least as many of its own marks and
* nothing else, so a fence quoted inside a longer one does not end it.
*/
function codeLines(lines) {
	let open = "";
	return lines.map((line) => {
		const [, marks = "", said = ""] = FENCE$1.exec(line) ?? [];
		const isCode = open !== "" || marks !== "";
		if (open && marks.startsWith(open) && !said.trim()) open = "";
		else if (!open) open = marks;
		return isCode;
	});
}
function readDoc(text) {
	const raws = text.replace(/\r\n?/g, "\n").split("\n");
	const code = codeLines(raws);
	return {
		text,
		lines: raws.map((raw, at) => {
			const indent = raw.length - raw.trimStart().length;
			const quoted = raw.trimStart().startsWith(">");
			if (code[at]) return {
				at,
				raw,
				indent,
				quoted,
				kind: "code"
			};
			if (!raw.trim()) return {
				at,
				raw,
				indent,
				quoted,
				kind: "blank"
			};
			if (RULE$1.test(raw)) return {
				at,
				raw,
				indent,
				quoted,
				kind: "rule"
			};
			return {
				at,
				raw,
				indent,
				quoted,
				kind: HEADING.test(raw) ? "heading" : "text",
				mark: markOf(raw, indent)
			};
		})
	};
}
const isLabel = (line) => line?.mark?.is === "label";
const isOption = (line) => line?.mark?.is === "option";
/** What a line says after the marks that open it: a quote mark, heading marks, a list marker. */
const textOf = (line) => line.raw.trim().replace(QUOTE, "").replace(HEADING, "").replace(BULLET, "");
/** What a line says, with its bold taken off too. */
const wordsOf = (line) => unbold(textOf(line));
/** Lines as markdown: blank runs made one, the ends trimmed. */
const tidy = (lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
/** Lines with the indentation they all share taken off, and blank lines made empty. */
function dedent(lines) {
	const shared = Math.min(...lines.filter((line) => line.kind !== "blank").map((l) => l.indent));
	return lines.map((line) => line.kind === "blank" ? "" : line.raw.slice(shared));
}
/** The paragraphs of some lines, split where a line is blank. */
function paragraphs(lines) {
	const out = [];
	let open = [];
	for (const line of lines) if (line.kind !== "blank") open.push(line);
	else if (open.length) out.push(open.splice(0));
	if (open.length) out.push(open);
	return out;
}
/**
* Where the part of the message that starts on line `from` ends: the next rule or heading, which
* opens what follows the questions, or the end of the message.
*/
function sectionEnd(doc, from) {
	return doc.lines.find((line) => line.at > from && (line.kind === "rule" || line.kind === "heading"))?.at ?? doc.lines.length;
}
/**
* Where the list item on line `from` ends, looking no further than `end`: at its first unindented
* paragraph after a blank line, which is the message's own again.
*/
function itemEnd(doc, from, end) {
	for (let at = from + 1; at < end; at++) {
		const line = doc.lines[at];
		if (doc.lines[at - 1]?.kind === "blank" && line?.kind !== "blank" && line?.indent === 0) return at;
	}
	return end;
}
/** Lines `from` to `end`, without the blank lines and rules that only close them off. */
function linesIn(doc, from, end) {
	const lines = doc.lines.slice(from, end);
	while (lines.at(-1)?.kind === "blank" || lines.at(-1)?.kind === "rule") lines.pop();
	return lines;
}
/** The nearest line that says something within three lines above `at`. */
function lineAbove(doc, at) {
	for (let up = at - 1; up >= Math.max(0, at - 3); up--) {
		const line = doc.lines[up];
		if (line && wordsOf(line)) return line;
	}
}
/** A paragraph as what comes before its last question (a lean, often), the question, and what follows it. */
function splitClosing(paragraph) {
	const sentences = paragraph.trim().split(/(?<=[.!?])\s+/);
	let ask = sentences.length - 1;
	while (ask >= 0 && !sentences[ask]?.endsWith("?")) ask--;
	if (ask < 0) return {
		before: paragraph.trim(),
		ask: "",
		after: ""
	};
	return {
		before: sentences.slice(0, ask).join(" "),
		ask: sentences[ask] ?? "",
		after: sentences.slice(ask + 1).join(" ")
	};
}

// src/lib/parse/picks.ts
const ROUTES = [
	[/\/grill-me\b|\bgrill(?:ing)? (?:it )?first\b/i, "/grill-me"],
	[/\/brainstorm\b|\bbrainstorm(?:ing)? (?:it )?first\b/i, "/brainstorm"],
	[/(?:·|,)\s*build(?: it)?\b|^\s*build(?: it)?\.?\s*$/i, "build"]
];
const routeOf = (line) => ROUTES.find(([pattern]) => pattern.test(line))?.[1];
/** A row's own lines: the one it starts on and those indented under it. */
function rowLines(doc, start) {
	const under = doc.lines.slice(start.at + 1);
	const end = under.findIndex((line) => line.kind === "blank" || line.indent < 2);
	return [start, ...end < 0 ? under : under.slice(0, end)];
}
/** One row as an item: build it, or the route its last line names. Prose up to the next row stays with it. */
function rowOf(label, own, between, route) {
	const [title = "", ...fields] = [label.title, label.rest].filter(Boolean).join(" ").split(" · ");
	const said = between.filter((line) => line.kind !== "blank" && line.kind !== "rule");
	const body = [fields.join(" · "), ...[...own.slice(1), ...said].map((line) => line.raw.trim())];
	const options = [{
		key: "build",
		text: "Build it",
		detail: ""
	}];
	if (route !== "build") options.push({
		key: route,
		text: `Route to ${route}`,
		detail: ""
	});
	return {
		label: label.label,
		title: unbold(title),
		body: body.filter(Boolean).join("\n"),
		options,
		recommended: route === "build" ? "build it" : `route it to ${route}`,
		recommendedOption: options.length - 1
	};
}
/** The pick list a run of numbered rows is, or null when a row does not end on a route. */
function picksOf(doc, run) {
	const items = [];
	let tail = doc.lines.length;
	for (const [i, start] of run.entries()) {
		const own = rowLines(doc, start);
		const route = routeOf(own.at(-1)?.raw ?? "");
		if (!route) return null;
		const rowEnd = start.at + own.length;
		const next = run[i + 1]?.at;
		if (next === void 0) tail = rowEnd;
		items.push(rowOf(start.mark, own, doc.lines.slice(rowEnd, next ?? rowEnd), route));
	}
	const starts = run.map((start) => start.at);
	return items.length ? {
		form: {
			kind: "picks",
			items
		},
		starts,
		tail
	} : null;
}

// src/lib/parse/lean.ts
/**
* How a recommendation is worded, and which options its words name. Options are named by their
* keys, letters or numbers alike, so one reader serves a lettered list and a numbered one.
*/
const LEAN_START = /^(?:If\b[^.?!\n]*?,\s+)?(?:I(?:'d| would| recommend| lean| suggest)\b|My (?:recommendation|pick|lean)\b)/i;
const LEAN_WORDS = /\b(?:recommend(?:ed|ation)?:?|lean toward(?:s)?|(?:I'd|I would) (?:go with|pick|try|start with|choose|do))\s+/gi;
const YES_NO = /\b(?:I (?:recommend|suggest)|my recommendation is)\s+((?:yes|no)\b[^.\n]*\.?)/i;
const LINK = String.raw`\s*(?:,\s*and|,|and|&|\+|plus|through|to|–|-)\s*`;
const SPAN = /through|\bto\b|[–-]/;
const OPENING_END = /^(?:$|\s*[.,:;)]|\s+[—–-]\s|\s+(?:for now|first|initially|to start|today)\b)/;
const EDGE = "(?![A-Za-z0-9])";
/** Where the named keys sit among `keys`. Two joined as a span are everything between them, unless they run backwards ("C – A is…"). */
function indicesOf(named, keys, span) {
	const at = named.map((key) => keys.findIndex((k) => k.toLowerCase() === key.toLowerCase())).filter((index) => index >= 0);
	const [from, to] = at;
	if (span && at.length === 2 && from !== void 0 && to !== void 0) return from <= to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [from];
	return [...new Set(at)].sort((a, b) => a - b);
}
/**
* The options a text with no bold marks opens on: "A", "(a)", "Option 2", "A, B and D", "A through
* C", "1–3". `strict` is for the words of a recommendation, where a lone key must be followed by
* punctuation and may be lower case ("(a)"); after a lean word ("I'd go with A") a lower case "a"
* is a word, and the key need only end. The keys strung on after the first are always as printed.
*/
function opening(text, keys, strict) {
	const any = [...keys].sort((a, b) => b.length - a.length).map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	const first = new RegExp(String.raw`^(?:option\s+|number\s+)?\(?(${any})${EDGE}`, strict ? "i" : "").exec(text);
	if (!first) return [];
	const rest = text.slice(first[0].length);
	const chain = new RegExp(`^(?:${LINK}(?:${any})${EDGE})+`).exec(rest.replace(/^\)/, ""))?.[0];
	if (strict && !chain && !OPENING_END.test(rest)) return [];
	const linked = chain?.match(new RegExp(`(?<![A-Za-z0-9])(?:${any})${EDGE}`, "g")) ?? [];
	return indicesOf([first[1] ?? "", ...linked], keys, SPAN.test(chain ?? ""));
}
/** The options a recommendation's own words open on. */
const opensOn = (recommended, keys) => opening(unbold(recommended), keys, true);
/** The options a text leans on in passing: "I'd go with 1, 2 and 6". */
function leansOn(text, keys) {
	const said = text.replaceAll("**", "");
	for (const lean of said.matchAll(LEAN_WORDS)) {
		const named = opening(said.slice(lean.index + lean[0].length), keys, false);
		if (named.length) return named;
	}
	return [];
}
/**
* A question with options and no Recommended line may lean in a paragraph of its own, "I'd pick
* A, since…", or lean and then ask. The lean is the recommendation's words; the ask stays.
*/
function leanParagraph(title, body, keys) {
	const paras = body.split(/\n{2,}/);
	for (const [i, para] of paras.entries()) {
		const said = splitClosing(para);
		const lean = unbold(said.before);
		if (said.after || !LEAN_START.test(lean) || !leansOn(lean, keys).length) continue;
		paras[i] = said.ask;
		return {
			lean,
			title,
			body: paras.filter(Boolean).join("\n\n")
		};
	}
	return null;
}
/**
* A question with nothing to pick from may lean with a yes or no in passing. Said in the title,
* it ends the title: the question is what came before, the rest is the body.
*/
function yesNo(title, body) {
	const inTitle = YES_NO.exec(title);
	const before = inTitle ? title.slice(0, inTitle.index).trimEnd() : "";
	if (inTitle && before.endsWith("?")) {
		const after = title.slice(inTitle.index + inTitle[0].length).trim();
		return {
			lean: unbold(inTitle[1] ?? ""),
			title: before,
			body: tidy([after, body])
		};
	}
	const inBody = YES_NO.exec(body);
	return inBody ? {
		lean: unbold(inBody[1] ?? ""),
		title,
		body
	} : null;
}

// src/lib/parse/question.ts
const MARKED = /\([^)]*\b(?:my recommendation|recommended|my pick)\b[^)]*\)/i;
const MARKER = /\s*\((?:my recommendation|recommended|my pick)\)/gi;
/** The letter after `letter`. */
const nextLetter = (letter) => String.fromCharCode(letter.charCodeAt(0) + 1);
/** Adds an option printed as `words`, with the lines that continued it. */
function addOption(to, key, words, detail) {
	if (MARKED.test(words)) to.marked = to.options.length;
	const text = words.replace(MARKER, "").replace(/\s+([.,;:])/g, "$1");
	to.options.push({
		key,
		text,
		detail: tidy(detail)
	});
}
/**
* The lines that continue the option at `lines[i]`, up to a blank line: those indented deeper
* than it, and the bullets right under an option that is no bullet itself.
*/
function continuation(lines, i) {
	const option = lines[i];
	const under = [];
	if (!isOption(option)) return under;
	for (let next = lines[i + 1]; next && next.kind !== "blank"; next = lines[i + 1 + under.length]) {
		const bullet = !option.mark.bullet && next.mark?.is === "bullet";
		if (next.indent <= option.indent && !bullet) break;
		under.push(next);
	}
	return under;
}
/** A recommendation's words: its line and the quote lines that go on with it. */
function leanAt(lines, i) {
	const line = lines[i];
	const more = [];
	if (line?.quoted) for (let next = lines[i + 1]; next?.quoted; next = lines[i + 1 + more.length]) more.push(next.raw.trimStart().slice(1).trim());
	const first = line?.mark?.is === "lean" ? line.mark.text : "";
	return {
		text: unbold([first, ...more].filter(Boolean).join(" ")),
		used: more.length
	};
}
/**
* The lettered options among some lines, their Recommended line, and every other line. A list's
* letters run on from its first, which may be B. With `lettered` off no line is an option.
*/
function scan(lines, lettered) {
	const found = {
		options: [],
		marked: -1,
		rest: []
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const last = found.options.at(-1);
		const next = lettered && isOption(line) && (!last || line.mark.key === nextLetter(last.key));
		const under = next ? continuation(lines, i) : [];
		if (line?.mark?.is === "lean") {
			const lean = leanAt(lines, i);
			found.lean = lean.text;
			i += lean.used;
		} else if (next && (line.mark.text || under[0])) {
			const [first, ...below] = under;
			const lifted = !line.mark.text && first ? first : void 0;
			addOption(found, line.mark.key, lifted ? textOf(lifted) : line.mark.text, [line.mark.more, ...dedent(lifted ? below : under)]);
			i += under.length;
		} else if (line) found.rest.push(line.raw);
	}
	return found;
}
/** Which options an item leans on: its recommendation's opening, else what its words say, else the one marked. */
function leanedOptions({ options, marked }, recommended, body) {
	const keys = options.map((option) => option.key);
	const opened = opensOn(recommended, keys);
	const picked = opened.length ? opened : leansOn(`${recommended}\n${body}`, keys);
	if (picked.length > 1) return { recommendedOptions: picked };
	const only = picked[0] ?? (marked >= 0 ? marked : void 0);
	return only === void 0 ? {} : { recommendedOption: only };
}
/**
* A question from its stem and the lines under it. `listed` are options the caller found itself (a
* numbered list); without them the lettered options among the lines are read. `closing` are the
* paragraphs the lines closed on, which join the body.
*/
function readQuestion(stem, lines, closing = [], listed) {
	const read = scan(lines, !listed);
	const found = listed || read.options.length >= 2 ? read : scan(lines, false);
	const choices = listed ?? found;
	const keys = choices.options.map((option) => option.key);
	const said = tidy([
		stem.rest,
		...found.rest,
		...closing.flatMap((paragraph) => ["", paragraph])
	]);
	const leaning = found.lean !== void 0 ? null : keys.length ? leanParagraph(stem.title, said, keys) : yesNo(stem.title, said);
	const recommended = found.lean ?? leaning?.lean;
	const item = {
		label: stem.label,
		title: leaning?.title ?? stem.title,
		body: leaning?.body ?? said,
		options: choices.options
	};
	if (recommended !== void 0) item.recommended = recommended;
	return keys.length ? {
		...item,
		...leanedOptions(choices, recommended ?? "", item.body)
	} : item;
}

// src/lib/parse/round.ts
const DECISION_CUE = /\b(?:decisions?\s+(?:for you|to make|needed)|to decide|to confirm|need to know|choose between|questions?\s+(?:for you|before|to answer))\b[^.?!]*:?\s*$/i;
/**
* The run of labels a message ends on. A run restarts where the numbering goes back or repeats. A
* label printed with a note, `Q5 (again)`, is a question come back to: it may go back, and
* restarts the run only when the run already holds its number.
*/
function lastRun(labels) {
	let run = [];
	for (const label of labels) {
		const { n, again } = label.mark;
		if (!again && n <= (run.at(-1)?.mark.n ?? 0) || run.some((held) => held.mark.n === n)) run = [];
		run.push(label);
	}
	return run;
}
/**
* Where the last item of a run ends. A Q-labelled question runs on to the rule or heading that
* opens what follows the round, so a closing line stays with it; a numbered list item ends sooner,
* at its first paragraph that is the message's own again.
*/
function runEnd(doc, last) {
	const end = sectionEnd(doc, last.at);
	return last.mark.q ? end : itemEnd(doc, last.at, end);
}
const signals = (item) => item.title.includes("?") || item.options.length > 0 || item.recommended !== void 0;
/**
* Whether the items are questions. A Q-labelled run needs only the message to end on a question
* or one item to show a sign. A bare numbered list needs most of its items to ask (a `?` anywhere
* in one counting), or the line above to say it holds questions: a list that is half instructions
* or findings is prose, and so is a closing "Want me to…?" over a list of done steps.
*/
function asks(doc, first, items) {
	if (first.mark.q) return doc.text.trimEnd().endsWith("?") || items.some(signals);
	const asking = items.filter((item) => signals(item) || item.body.includes("?")).length;
	const above = lineAbove(doc, first.at);
	return asking * 2 > items.length || !!above && DECISION_CUE.test(wordsOf(above));
}
/** A run of labels as questions, or null when it asks nothing. Prose between two items is the earlier one's own. */
function read(doc, run) {
	const [first] = run;
	const last = run.at(-1);
	if (!first || !last) return null;
	const tail = runEnd(doc, last);
	const items = run.map((label, i) => readQuestion(label.mark, linesIn(doc, label.at + 1, run[i + 1]?.at ?? tail)));
	return asks(doc, first, items) ? {
		form: {
			kind: "round",
			items
		},
		starts: run.map((label) => label.at),
		tail
	} : null;
}
/**
* A run of labels as a round. `under` is a numbered list: when it sits under the round's last
* question and asks by itself ("Two checks to settle: 1. … 2. …"), its items are questions of
* their own after it.
*/
function roundOf(doc, run, under = []) {
	const round = read(doc, run);
	const last = run.at(-1);
	const [first] = under;
	const end = under.at(-1);
	if (!round || !last || !first || !end || first.at < last.at) return round;
	if (linesIn(doc, runEnd(doc, end), round.tail).length) return round;
	return (read(doc, under) && read(doc, [...run, ...under])) ?? round;
}

// src/lib/parse/single.ts
const ASKS = /\?\**\s*$/;
const BOLD = /^\*\*/;
const MENU_CUE = /(?:^|[.!?—–]\s+)((?:want me to|shall i|should i|do you want me to|would you like me to)\b[^?]*):\s*$/i;
const CHOOSING = /\b(?:which|pick|choose|prefer|go with|start with|one of|both|either|option\s*[0-9]|[0-9]\s*(?:or|\/)\s*[0-9])\b/i;
const WHICH = /\b(?:which|pick|choose|prefer)\b/i;
const CLOSER = /shared understanding/i;
const OPTION_REACH = 8;
const LEAD_REACH = 6;
const LONG_LINE = 160;
/** A card for one question: the reply to it is the answer alone, so it prints no label. */
function single(item, start, tail) {
	return {
		form: {
			kind: "round",
			items: [{
				...item,
				unlabelled: true
			}]
		},
		starts: [start],
		tail
	};
}
/** The paragraph some lines close on, when it asks: its words around the question, and the lines before it. */
function closingOf(lines) {
	const last = paragraphs(lines).at(-1);
	if (!last?.[0] || isOption(last[0]) || isLabel(last[0])) return null;
	const said = splitClosing(last.map((line) => line.raw).join(" "));
	return said.ask ? {
		...said,
		kept: lines.filter((line) => line.at < (last[0]?.at ?? 0))
	} : null;
}
/**
* The lead-in as a stem. A long line leads with its bold or its first sentence, and the rest is
* the question's body.
*/
function leadIn(line) {
	const lead = textOf(line);
	const cut = /^\*\*(.+?)\*\*\s*(.*)$/.exec(lead) ?? new RegExp(`^(.{20,${LONG_LINE}}?[.!?])\\s+(.*)$`).exec(lead);
	const [head = "", rest = ""] = lead.length <= LONG_LINE ? [lead] : cut ? cut.slice(1) : [lead.slice(0, LONG_LINE), lead.slice(LONG_LINE)];
	return {
		label: "Q1",
		title: unbold(head.replace(/:\s*$/, "")).replace(/^Q\s*[.:)]\s+/, ""),
		rest
	};
}
/**
* The lines that say something above `at`, nearest first and six at most. A rule ends the climb,
* and so does a heading, which is the top of its part of the message.
*/
function linesAbove(doc, at) {
	const said = [];
	for (let up = doc.lines[at - 1]; up && up.kind !== "rule" && said.length < LEAD_REACH; up = doc.lines[up.at - 1]) {
		if (up.kind === "text" || up.kind === "heading") said.push(up);
		if (up.kind === "heading") break;
	}
	return said;
}
const asking = (lines) => lines.find((line) => ASKS.test(line.raw));
/**
* One question over lettered options. A lead-in that is a heading, bold or itself a question is the
* title, and a closing question stays under it; a plain one gives way to the closing question,
* which is what the reader answers, and stays in the message's head. The options ask when the
* message closes on a question or leans on one of them.
*/
function letteredOf(doc) {
	const first = doc.lines.find((line, at) => isOption(line) && doc.lines.slice(at + 1, at + 1 + OPTION_REACH).some((next) => isOption(next) && next.mark.key === nextLetter(line.mark.key)));
	if (!first) return null;
	const above = linesAbove(doc, first.at);
	const lead = asking(above) ?? above[0];
	const stem = lead && leadIn(lead);
	if (!lead || !stem?.title || CLOSER.test(stem.title)) return null;
	const tail = sectionEnd(doc, lead.at);
	const closing = lead.kind === "heading" || BOLD.test(lead.raw) || ASKS.test(lead.raw) ? null : closingOf(linesIn(doc, first.at, tail));
	const item = closing ? readQuestion({
		label: "Q1",
		title: unbold(closing.ask),
		rest: ""
	}, closing.kept, [closing.before, closing.after]) : readQuestion(stem, linesIn(doc, lead.at + 1, tail));
	const leans = item.recommended !== void 0 || item.recommendedOption !== void 0;
	const closes = (paragraphs(doc.lines).at(-1) ?? []).some((line) => line.raw.includes("?"));
	return (item.options.length ? closing !== null || closes || leans : leans) ? single(item, closing ? first.at : lead.at, tail) : null;
}
/**
* One question and its recommendation, with nothing to pick from. The recommendation is what says
* the line above it is put to the reader, so a bare "Want me to push?" stays prose.
*/
function bareOf(doc) {
	const lean = doc.lines.find((line) => line.mark?.is === "lean");
	if (!lean) return null;
	const near = linesAbove(doc, lean.at).filter((line) => lean.at - line.at <= LEAD_REACH);
	const lead = asking(near);
	const stem = lead && leadIn(lead);
	if (!lead || !stem?.title || CLOSER.test(stem.title)) return null;
	const tail = sectionEnd(doc, lead.at);
	const item = readQuestion(stem, linesIn(doc, lead.at + 1, tail));
	return item.recommended === void 0 ? null : single(item, lead.at, tail);
}
/** A numbered list as options, keyed by its numbers: each item's words, and what is under it as its detail. */
function listed(doc, run, end) {
	const choices = {
		options: [],
		marked: -1
	};
	for (const [i, { at, mark }] of run.entries()) addOption(choices, String(mark.n), mark.title, [mark.rest, ...dedent(linesIn(doc, at + 1, run[i + 1]?.at ?? end))]);
	return choices;
}
/**
* A numbered list of alternatives as one question. `cued` reads only a list under a line that is
* itself the question, which makes the list its options before any item is read as a question of
* its own; otherwise the paragraph after the list must close on a question that picks among them.
*/
function menuOf(doc, run, cued) {
	const [first] = run;
	const last = run.at(-1);
	if (!first || !last || run.length < 2) return null;
	const tail = sectionEnd(doc, last.at);
	const listEnd = itemEnd(doc, last.at, tail);
	const lead = lineAbove(doc, first.at);
	const cue = lead && MENU_CUE.exec(wordsOf(lead))?.[1];
	const after = linesIn(doc, listEnd, tail);
	const closing = closingOf(after);
	const picking = closing && after.filter(isOption).length < 2 && (!closing.after || WHICH.test(closing.ask)) && CHOOSING.test(`${closing.before} ${closing.ask}`) ? closing : null;
	if (cued ? !cue : !picking) return null;
	return single(readQuestion({
		label: "Q1",
		title: unbold(picking?.ask ?? cue ?? ""),
		rest: ""
	}, picking?.kept ?? after, picking ? [picking.before, picking.after] : [], listed(doc, run, listEnd)), !picking && lead && wordsOf(lead) === cue ? lead.at : first.at, tail);
}

// src/lib/parse/index.ts
/**
* A numbered list, as the first of: a pick list; alternatives under a line that is the question
* ("Want me to:"); questions; alternatives that a closing question picks from.
*/
function listOf(doc, run) {
	return picksOf(doc, run) ?? menuOf(doc, run, true) ?? roundOf(doc, run) ?? menuOf(doc, run, false);
}
/** Where a message's lines went, or null when it asks nothing. */
function split$1(text) {
	const doc = readDoc(text);
	const labels = doc.lines.filter(isLabel);
	const asked = lastRun(labels.filter((label) => label.mark.q));
	const numbered = lastRun(labels.filter((label) => !label.mark.q));
	return roundOf(doc, asked, numbered) ?? listOf(doc, numbered) ?? letteredOf(doc) ?? bareOf(doc);
}
/** The round or pick list a message ends on, or null when it asks nothing. */
const parse = (text) => split$1(text)?.form ?? null;

// src/lib/forms.ts
/** JSON with its keys in order, so the same form always reads the same. */
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value).filter(([, field]) => field !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`).join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
/** FNV-1a over UTF-16 units from a seed; no harness offers a hash to a module with no imports. */
function fnv(text, seed) {
	let hash = seed;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
/**
* Names a form by what it asks: a turn that asks the same round again keeps its answers, and
* a step aimed at an older form lands on nothing.
*/
function formId(form) {
	const text = canonical(form);
	return fnv(text, 0x811c9dc5) + fnv(text, 19088743);
}
function newDraft(form) {
	const count = form.items.length;
	return {
		answers: Array.from({ length: count }, () => null),
		notes: Array.from({ length: count }, () => ""),
		note: "",
		step: 0
	};
}
const isReview = (form, draft) => draft.step >= form.items.length;
const go = (form, draft, step) => ({
	...draft,
	step: Math.max(0, Math.min(form.items.length, step))
});
const canAccept = (item) => item.recommended !== void 0 || item.recommendedOption !== void 0 || item.recommendedOptions !== void 0;
function accepted(item) {
	if (item.recommendedOptions) return {
		kind: "options",
		indices: item.recommendedOptions
	};
	if (item.recommendedOption !== void 0) return {
		kind: "option",
		index: item.recommendedOption
	};
	return { kind: "accept" };
}
/**
* What the form offers for one item: its options, or with none its recommendation,
* and a write-in. Beside options a recommendation is only said, never an entry of its own.
*/
function entries(item) {
	const rows = item.options.map((_, index) => ({
		kind: "option",
		index
	}));
	if (item.recommended !== void 0 && !rows.length) rows.push({ kind: "accept" });
	rows.push({ kind: "write" });
	return rows;
}
function isChosen(item, answer, entry) {
	if (!answer) return false;
	if (entry.kind === "write") return answer.kind === "text";
	if (entry.kind === "accept") return answer.kind === "accept";
	if (answer.kind === "option") return answer.index === entry.index;
	if (answer.kind === "options") return answer.indices.includes(entry.index);
	return answer.kind === "accept" && item.recommendedOption === entry.index;
}
/** The answer's entry, else the recommendation's, else the first. */
function startEntry(item, answer) {
	const rows = entries(item);
	const chosen = rows.findIndex((entry) => isChosen(item, answer, entry));
	if (chosen >= 0) return chosen;
	return Math.max(0, rows.findIndex((entry) => isChosen(item, { kind: "accept" }, entry)));
}
const withAnswer = (draft, value) => ({
	...draft,
	answers: draft.answers.map((answer, i) => i === draft.step ? value : answer)
});
const clear = (form, draft) => isReview(form, draft) ? draft : withAnswer(draft, null);
/** Records the shown item's answer and stays on it, so a note can follow. */
function record(form, draft, value) {
	const item = form.items[draft.step];
	if (!item) return draft;
	if (value.kind === "accept" && !canAccept(item)) return draft;
	if (value.kind === "option" && !(value.index >= 0 && value.index < item.options.length)) return draft;
	if (value.kind === "options" && !value.indices.length) return clear(form, draft);
	if (value.kind === "text") {
		const text = value.text.trim();
		return text ? withAnswer(draft, {
			kind: "text",
			text
		}) : clear(form, draft);
	}
	return withAnswer(draft, value);
}
/**
* After an answer: the next item still unanswered, looking on and then from the top, or the
* review when every item has one.
*/
function onward(form, draft) {
	const count = form.items.length;
	const order = [...Array.from({ length: Math.max(0, count - draft.step - 1) }, (_, i) => draft.step + 1 + i), ...Array.from({ length: Math.min(draft.step, count) }, (_, i) => i)];
	return go(form, draft, order.find((i) => !draft.answers[i]) ?? count);
}
/** The shown item's note, or on the review the whole round's. */
function setNote(form, draft, text) {
	const note = text.trim();
	if (isReview(form, draft)) return {
		...draft,
		note
	};
	return {
		...draft,
		notes: draft.notes.map((held, i) => i === draft.step ? note : held)
	};
}
/**
* The draft after one thing a person did; what can't apply changes nothing.
*
* `pick` takes `entry`, an index into the shown item's entries (a write-in has nothing to
* record until `write`); `write` records text and goes on;
* `accept` takes the item's recommendation, whatever it names; `next` goes on to the next item
* unanswered. Throws for a word it doesn't know.
*/
function apply(form, draft, action) {
	const { step } = draft;
	const item = form.items[step];
	switch (action.do) {
		case "pick": {
			const row = item ? entries(item)[action.entry] : void 0;
			if (!row || row.kind === "write") return draft;
			return record(form, draft, row);
		}
		case "write": {
			const written = record(form, draft, {
				kind: "text",
				text: action.text ?? ""
			});
			return written.answers[step] ? onward(form, written) : written;
		}
		case "note": return setNote(form, draft, action.text ?? "");
		case "accept": return item && canAccept(item) ? record(form, draft, accepted(item)) : draft;
		case "next": return isReview(form, draft) ? draft : onward(form, draft);
		case "go": return go(form, draft, action.step ?? step);
		case "back": return go(form, draft, step - 1);
		case "forward": return go(form, draft, step + 1);
		case "skip": return go(form, clear(form, draft), step + 1);
		case "clear": return clear(form, draft);
		case "review": return go(form, draft, form.items.length);
		default: throw new Error(`no such action: ${JSON.stringify(action.do)}`);
	}
}
const isSame = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
function isRecommended(item, answer) {
	if (!answer) return false;
	if (answer.kind === "options") return isSame(answer.indices, item.recommendedOptions ?? [item.recommendedOption]);
	return answer.kind === "accept" || answer.kind === "option" && answer.index === item.recommendedOption;
}
const keyAt = (item, index) => item.options[index]?.key ?? "";
/** A short button label and the prose beside it on native surfaces. */
function recommendationChoice(text) {
	const lead = /^(yes|no)(?:[.,:;!?]\s*|\s+[—–-]\s+|$)/i.exec(text);
	if (!lead) return {
		tag: "Accept",
		label: text
	};
	return {
		tag: lead[1]?.toLowerCase() === "yes" ? "Yes" : "No",
		label: text.slice(lead[0].length)
	};
}
const recommendationText = (item) => item.recommended || "As recommended";
/** What the reply says for one answer: a recommendation, option keys, a route, or the text. */
function said(item, answer) {
	if (answer.kind === "text") return answer.text;
	if (answer.kind === "options") return answer.indices.map((index) => keyAt(item, index)).join(", ");
	const index = answer.kind === "option" ? answer.index : item.recommendedOption;
	if (index !== void 0) return keyAt(item, index);
	const recommended = recommendationText(item);
	return recommendationChoice(recommended).tag === "Yes" ? "yes" : recommended;
}
const NO_ANSWER = "no answer yet";
/** A text's lines after the first, indented to sit under the first: one block in the reply. */
const under = (text, indent) => text.split("\n").join(`\n${" ".repeat(indent)}`);
const NOTE_LEAD = "    Note: ";
const noted = (line, note) => note ? [line, `${NOTE_LEAD}${under(note, 10)}`] : [line];
const saying = (label, said) => `${label}: ${under(said, label.length + 2)}`;
const rowsOf = (form, draft) => form.items.map((item, i) => ({
	item,
	answer: draft.answers[i] ?? null,
	note: draft.notes[i] ?? ""
}));
function roundReply(form, draft) {
	const rows = rowsOf(form, draft);
	if (!draft.note && rows.every(({ item, answer, note }) => !note && isRecommended(item, answer) && (answer?.kind !== "accept" || said(item, answer) === "yes"))) return ["yes"];
	return rows.flatMap(({ item, answer, note }) => {
		if (answer) {
			const words = said(item, answer);
			return noted(item.unlabelled ? words : saying(item.label, words), note);
		}
		return note ? noted(`${item.label}: ${NO_ANSWER}`, note) : [];
	});
}
function picksReply(form, draft) {
	const builds = [];
	const rest = [];
	for (const { item, answer, note } of rowsOf(form, draft)) {
		const { label } = item;
		if (!answer) {
			if (note) rest.push(...noted(`${label}: ${NO_ANSWER}`, note));
			continue;
		}
		const what = said(item, answer);
		if (what === "build" && !note) builds.push(label);
		else if (what === "build") rest.push(...noted(`do ${label}`, note));
		else if (answer.kind === "text") rest.push(...noted(saying(label, answer.text), note));
		else rest.push(...noted(`${label} → ${what}`, note));
	}
	return [...builds.length ? [`do ${builds.join(", ")}`] : [], ...rest];
}
/** The reply as the person would type it; "" when nothing was answered. */
function reply(form, draft) {
	const lines = form.kind === "round" ? roundReply(form, draft) : picksReply(form, draft);
	if (draft.note) lines.push(saying("Overall", draft.note));
	return lines.join("\n");
}
function entryText(form, item, entry) {
	if (entry.kind === "write") return form.kind === "round" ? "Write your own answer" : "Something else";
	if (entry.kind === "accept") return recommendationText(item);
	const option = item.options[entry.index];
	if (!option) return "";
	return form.kind === "round" ? `${option.key}. ${option.text}` : option.text;
}
const textAt = (item, index) => item.options[index]?.text ?? "";
/** Inline markdown as plain words: a surface that draws a line as text has no use for the marks. */
const plain = (text) => text.replace(/`+([^`]*)`+/g, "$1").replaceAll("**", "").replace(/\s+/g, " ").trim();
/** What an answer reads as on the review: the option's words, not just its key. */
function shown(item, answer) {
	if (!answer) return "skipped";
	if (answer.kind === "text") return `"${answer.text}"`;
	if (answer.kind === "options") return plain(`${said(item, answer)}: ${answer.indices.map((index) => textAt(item, index)).join("; ")}`);
	const index = answer.kind === "option" ? answer.index : item.recommendedOption;
	return plain(index === void 0 ? said(item, answer) : `${said(item, answer)}: ${textAt(item, index)}`);
}
function title(form) {
	const count = form.items.length;
	const plural = count === 1 ? "" : "s";
	return form.kind === "round" ? `Answer ${count} question${plural}` : `Pick from ${count} item${plural}`;
}
function itemView(form, draft) {
	const item = form.items[draft.step];
	if (!item) return null;
	const answer = draft.answers[draft.step] ?? null;
	const recommended = item.recommendedOptions ?? [item.recommendedOption];
	return {
		label: item.label,
		title: item.title,
		body: item.body,
		entries: entries(item).map((entry) => ({
			kind: entry.kind,
			key: entry.kind === "option" && form.kind === "round" ? item.options[entry.index]?.key ?? "" : "",
			text: entryText(form, item, entry),
			detail: entry.kind === "option" ? item.options[entry.index]?.detail ?? "" : "",
			isRecommended: entry.kind === "option" && recommended.includes(entry.index),
			isChosen: isChosen(item, answer, entry)
		})),
		start: startEntry(item, answer),
		recommended: item.options.length ? item.recommended ?? "" : "",
		isSeveral: answer ? answer.kind === "options" : item.recommendedOptions !== void 0,
		canAccept: canAccept(item),
		accepts: item.recommendedOption !== void 0 || item.recommendedOptions ? said(item, accepted(item)) : "",
		note: draft.notes[draft.step] ?? "",
		written: answer?.kind === "text" ? answer.text : ""
	};
}
function view(form, draft) {
	return {
		id: formId(form),
		kind: form.kind,
		title: title(form),
		count: form.items.length,
		answered: draft.answers.filter(Boolean).length,
		step: draft.step,
		isReview: isReview(form, draft),
		item: itemView(form, draft),
		review: rowsOf(form, draft).map(({ item, answer, note }) => ({
			label: item.label,
			title: plain(item.title),
			shown: shown(item, answer),
			isAnswered: Boolean(answer),
			note
		})),
		note: draft.note,
		reply: reply(form, draft)
	};
}
/**
* A turn ended on `text`. A new round replaces what was held and the same one keeps its
* answers; a turn that asks nothing leaves it, since a turn a background task woke ends on
* that task's news while the round still waits.
*/
function offer(held, text) {
	const form = parse(text);
	if (!form || held && formId(held.form) === formId(form)) return held;
	return {
		form,
		draft: newDraft(form)
	};
}
/**
* Whether a held round has something to lose: an answer, a per-item note or the round's own.
* A round with none of them is one a send can drop without setting anything aside.
*/
function hasWork(held) {
	const { draft } = held;
	return draft.answers.some(Boolean) || draft.notes.some(Boolean) || Boolean(draft.note);
}
/** One action on what is held, when `id` (if given) still names the form showing. */
function step(held, action, id) {
	if (id !== void 0 && id !== formId(held.form)) return held;
	const draft = apply(held.form, held.draft, action);
	return draft === held.draft ? held : {
		...held,
		draft
	};
}
const viewOf = (held) => held ? view(held.form, held.draft) : null;

// src/lib/offer.ts
/**
* The words beside the offer's title: how many answers are in, then the key that opens the
* form. The separator belongs to the note, so the title and the note never run together.
*/
const offerNote = (answered, shortcut) => `${answered ? ` · ${answered} answered` : ""} · ${shortcut} or /answer`;

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

// src/pi/offer.ts
var AnswerOffer = class {
	theme;
	title;
	note;
	open;
	isHover = false;
	constructor(theme, title, note, open) {
		this.theme = theme;
		this.title = title;
		this.note = note;
		this.open = open;
	}
	invalidate() {}
	render(width) {
		const spans = [
			span(" "),
			span(this.title, {
				role: "accent",
				bold: this.isHover
			}),
			span(this.note, { role: "dim" })
		];
		return paintLines(this.theme, [line(truncateSpans(spans, width))], width).lines;
	}
	handleMouse(event) {
		if (event.type === "move") {
			if (this.isHover) return { handled: true };
			this.isHover = true;
			return {
				handled: true,
				render: true
			};
		}
		if (event.type === "click" && event.button === "left") {
			this.open();
			return { handled: true };
		}
		return { handled: true };
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
/**
* The rail's colour: the success colour beside a card that has its answer, else bright beside
* the keyboard's card and quiet beside every other.
*/
const railRole = (state) => state.answered ? "success" : state.active ? "text" : "dim";
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
const FILL_LABEL = "Fill prompt";
/**
* The row after a round's last card: the pointer column, then how many questions have an
* answer, which goes to the first question, and Fill prompt, a button whose key (Enter on this
* step) is not printed. Fill takes the accent only when there is a reply to fill; once the round
* is sent the row says so instead. With no room beside the count, Fill goes under it.
*/
function closing(c, width) {
	const { hits } = c;
	const count = span(`${c.answered} of ${c.total} answered`, {
		...controlStyle({ highlighted: c.focused || c.hovered === "count" }),
		...hits ? { hit: hits.count } : {}
	});
	const head = [
		...pointerLead(c.focused),
		count,
		...c.sent ? [span(` ${tokens.glyph.done} Sent`, { role: "success" })] : []
	];
	if (!hits || c.sent) return [line(truncateSpans(head, width))];
	const fill = span(FILL_LABEL, {
		...controlStyle({
			primary: c.canFill,
			highlighted: c.hovered === "fill"
		}),
		hit: hits.fill
	});
	if (spansWidth(head) + tokens.gutter + cellWidth(FILL_LABEL) <= width) return [line([
		...head,
		span(GAP$1),
		fill
	])];
	return [line(truncateSpans(head, width)), line(truncateSpans([span(CARD_INSET), fill], width))];
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

// ../../lib/kits/prose/src/terminal.ts
/**
* Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
* here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
* that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
* needs syntax colours or runs as long as it likes.
*/
const GAP = " ".repeat(tokens.gutter);
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
				if (!isLast) spans.push(span(" ".repeat(Math.max(0, (widths[i] ?? 0) - used)) + GAP));
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
function prose({ text, width, isDim = false }) {
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
			for (const l of code) out.push(line([span(GAP), span(truncate(l, width - tokens.gutter), { role: "code" })]));
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

// src/pi/transcript.ts
/** The control at `x` on a row, if the pointer is over one. */
const cellAt = (cells, x) => cells.find((cell) => x >= cell.start && x < cell.end);
const atCell = (cells, x) => cellAt(cells, x)?.act;
const choiceLetters = (item) => {
	const unused = [...item.entries.some((entry) => /^[1-9]$/.test(entry.key)) ? "123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((letter) => !item.entries.some((entry) => entry.key === letter));
	return item.entries.map((entry) => entry.key || unused.shift() || "");
};
/** One entry per round. Redraw it from current state rather than appending copies as it changes. */
var Transcript = class {
	theme;
	read;
	onAction;
	hits = /* @__PURE__ */ new Map();
	stops = [];
	ends = [];
	/** The control under the mouse. */
	hovered;
	input;
	constructor(theme, read, onAction) {
		this.theme = theme;
		this.read = read;
		this.onAction = onAction;
	}
	invalidate() {}
	span(step) {
		if (this.input?.field.step === step) return [this.input.first, this.input.first + this.input.height];
		const start = this.stops[step];
		const end = this.ends[step];
		return start === void 0 || end === void 0 ? void 0 : [start, end];
	}
	render(columns) {
		this.hits.clear();
		this.stops = [];
		this.ends = [];
		this.input = void 0;
		const state = this.read();
		if (!state || columns < 20) return [];
		const { round, active, field } = state;
		const { theme } = this;
		const width = widthCap("reading", columns - tokens.gutter);
		const inner = Math.min(width - tokens.gutter, tokens.prose);
		const out = [];
		const room = inner - cellWidth(CARD_INSET);
		const inset = (spans) => line([span(CARD_INSET), ...spans]);
		const actions = /* @__PURE__ */ new Map();
		let rowHits = 0;
		const asRows = (lines, act) => lines.map((drawn) => {
			if (!act) return { line: drawn };
			const hit = `row:${rowHits++}`;
			actions.set(hit, act);
			return { line: {
				...drawn,
				spans: hitSpans(drawn.spans, hit)
			} };
		});
		const editRows = (step, kind, label) => {
			if (!field || field.step !== step || field.kind !== kind) return void 0;
			const labelWidth = cellWidth(label);
			const editorWidth = inner - labelWidth;
			return field.editor.render(editorWidth).slice(1, -1).map((text, i) => ({
				line: line([span(i ? " ".repeat(labelWidth) : label, { role: "dim" }), span(text)]),
				editorWidth
			}));
		};
		const section = (step, heading, body, state) => {
			if (out.length) out.push("", "");
			this.stops[step] = out.length;
			const append = (row) => {
				const painted = paintLine(theme, rail({
					active: state?.here,
					answered: state?.answered
				}, row.line), inner + 1 + tokens.gutter);
				if (row.editorWidth !== void 0 && field) {
					if (this.input) this.input.height++;
					else this.input = {
						field,
						first: out.length,
						x: 1 + tokens.gutter + inner - row.editorWidth,
						width: row.editorWidth,
						height: 1
					};
				}
				const cells = painted.cells.flatMap((cell) => {
					const act = actions.get(cell.hit);
					return act ? [{
						start: cell.start,
						end: cell.end,
						act
					}] : [];
				});
				if (cells.length) this.hits.set(out.length, {
					text: painted.text,
					cells
				});
				out.push(painted.text);
			};
			sectionsOf({ line: line([]) }, heading, body).forEach(append);
			this.ends[step] = out.length;
		};
		const current = view(round.form, round.draft);
		for (let step = 0; step < current.count; step++) {
			const item = view(round.form, {
				...round.draft,
				step
			}).item;
			if (!item) continue;
			const here = active && current.step === step;
			const answered = current.review[step]?.isAnswered ?? false;
			const heading$1 = asRows(heading({
				title: item.title,
				label: item.label,
				active: here,
				focused: here,
				answered
			}, inner));
			const rows = [];
			if (item.body) {
				const detail = markdownLines(theme, item.body, room);
				rows.push(...asRows(detail.slice(0, 3).map((text) => inset([span(text)]))));
				if (detail.length > 3) rows.push({ line: inset([span("… full context in the message above", { role: "dim" })]) });
				rows.push({ line: line([]) });
			}
			const letters = choiceLetters(item);
			item.entries.forEach((entry, index) => {
				if (!active && entry.kind === "write" && !entry.isChosen) return;
				const key = letters[index];
				const editing = entry.kind === "write" ? editRows(step, "write", `${CARD_INSET}${key || " "} › `) : void 0;
				if (editing) {
					rows.push(...editing);
					return;
				}
				const text = entry.kind === "write" && item.written ? item.written : entry.key && entry.text.startsWith(`${entry.key}. `) ? entry.text.slice(entry.key.length + 2) : entry.text;
				const action = !active ? void 0 : entry.isChosen && !item.isSeveral ? {
					kind: "clear",
					step
				} : {
					kind: "pick",
					step,
					entry: index
				};
				rows.push(...asRows(choice({
					key: key ?? "",
					text,
					detail: entry.detail,
					aside: entry.isRecommended ? "  Recommended" : void 0,
					chosen: entry.isChosen,
					hovered: active && this.hovered?.kind === "pick" && this.hovered.step === step && this.hovered.entry === index,
					active: here,
					multiple: item.isSeveral,
					literal: entry.kind === "write"
				}, inner), action));
			});
			const more = [];
			if (item.recommended) more.push(...asRows(markdownLines(theme, `Recommended: ${item.recommended}`, room, { color: (text) => paintSpan(theme, span(text, { role: "dim" })) }, 3).map((text) => inset([span(text)]))));
			if (active && item.accepts.includes(",")) more.push(...asRows(prose({
				text: `Take ${item.accepts}`,
				width: room,
				isDim: true
			}).map((drawn) => inset(drawn.spans)), {
				kind: "accept",
				step
			}));
			if (active || item.note) rows.push(...editRows(step, "note", CARD_INSET + "Note: ") ?? asRows(note({
				value: item.note,
				active: here,
				answered,
				hovered: this.hovered?.kind === "note" && this.hovered.step === step
			}, inner), active ? {
				kind: "note",
				step
			} : void 0));
			section(step, heading$1, sectionsOf({ line: line([]) }, rows, more), {
				here,
				answered
			});
		}
		const last = active && current.isReview;
		[
			{ kind: "top" },
			{ kind: "fill" },
			{
				kind: "note",
				step: current.count
			}
		].forEach((action, i) => actions.set(String(i), action));
		const hovered = this.hovered;
		const editingNote = editRows(current.count, "note", CARD_INSET + NOTE_LABEL);
		const closingRow = [...closing({
			answered: current.answered,
			total: current.count,
			focused: last,
			hovered: hovered?.kind === "top" ? "count" : hovered?.kind === "fill" ? "fill" : void 0,
			canFill: !!current.reply,
			sent: round.sent,
			hits: active ? {
				count: "0",
				fill: "1"
			} : void 0
		}, inner), ...current.note && !editingNote ? note({
			value: current.note,
			active: last,
			hovered: hovered?.kind === "note" && hovered.step === current.count,
			hit: active ? "2" : void 0
		}, inner) : []].map((drawn) => ({ line: drawn }));
		section(current.count, [...closingRow, ...editingNote ?? []], [], {
			here: last,
			answered: current.answered === current.count
		});
		return out;
	}
	handleMouse(event) {
		const input = this.input;
		if (input && event.y >= input.first && event.y < input.first + input.height && event.x >= 1 + tokens.gutter && event.x < input.x + input.width && event.type === "click" && event.button === "left") {
			this.onAction({ kind: "focus" });
			input.field.editor.handleMouse({
				...event,
				x: Math.max(0, event.x - input.x),
				y: event.y - input.first + 1,
				width: input.width,
				height: input.height + 2
			});
			return { handled: true };
		}
		const action = atCell(this.hits.get(event.y)?.cells ?? [], event.x);
		if (event.type === "move") {
			const changed = JSON.stringify(this.hovered) !== JSON.stringify(action);
			this.hovered = action;
			return changed ? {
				handled: true,
				render: true
			} : void 0;
		}
		if (!action || event.button !== "left") return void 0;
		if (event.type === "click") this.onAction(action);
		return event.type === "press" || event.type === "click" ? { handled: true } : void 0;
	}
};
/** The prompt normally owns the keyboard. Alt+a hands it to the guide until Esc or a prompt click. */
var AnswerGuide = class {
	tui;
	theme;
	read;
	onAction;
	onResize;
	hits = /* @__PURE__ */ new Map();
	hover;
	isFocused = false;
	size;
	field;
	get activeField() {
		return this.field;
	}
	constructor(tui, theme, read, onAction, onResize) {
		this.tui = tui;
		this.theme = theme;
		this.read = read;
		this.onAction = onAction;
		this.onResize = onResize;
	}
	get focused() {
		return this.isFocused;
	}
	set focused(value) {
		this.isFocused = value;
		if (this.field) this.field.editor.focused = value;
		this.tui.requestRender();
	}
	get editing() {
		return this.field !== void 0;
	}
	edit(kind, step, text, done) {
		const editor = new Editor(this.tui, {
			borderColor: (s) => paintSpan(this.theme, span(s, { role: "border" })),
			selectList: getSelectListTheme()
		});
		editor.setText(text);
		editor.focused = this.focused;
		editor.onSubmit = (value) => this.finishEdit(value);
		this.field = {
			kind,
			step,
			editor,
			done
		};
		this.tui.requestRender();
	}
	finishEdit(text) {
		const field = this.field;
		this.field = void 0;
		field?.done(text);
		this.tui.requestRender();
	}
	invalidate() {
		this.field?.editor.invalidate();
	}
	actionFor(data, v) {
		if (matchesKey(data, "escape") || matchesKey(data, "alt+a")) return { kind: "release" };
		if (data === "r") return { kind: "review" };
		if (data === "n") return {
			kind: "note",
			step: v.step
		};
		if (data === "j" || data === "k") return {
			kind: "move",
			delta: data === "j" ? 1 : -1
		};
		if (v.isReview) {
			if (matchesKey(data, "enter")) return v.reply ? { kind: "fill" } : { kind: "top" };
			if (v.reply && data === "f") return { kind: "fill" };
			if (v.reply && data === "s") return { kind: "send" };
		}
		if (v.item && v.review[v.step]?.isAnswered && data === "x") return {
			kind: "clear",
			step: v.step
		};
		if (v.item?.accepts.includes(",") && data === "y") return {
			kind: "accept",
			step: v.step
		};
		if (!v.item) return void 0;
		const digit = digitChoice(data);
		const entry = digit >= 0 ? digit : choiceLetters(v.item).indexOf(data.toUpperCase());
		return entry < 0 || !v.item.entries[entry] ? void 0 : {
			kind: "pick",
			step: v.step,
			entry
		};
	}
	handleInput(data) {
		if (this.field) {
			if (matchesKey(data, "escape")) this.finishEdit();
			else this.field.editor.handleInput(data);
			this.tui.requestRender();
			if (this.field) this.onResize();
			return;
		}
		const v = viewOf(this.read());
		if (!v) return;
		const action = this.actionFor(data, v);
		if (action) this.onAction(action);
	}
	render(columns) {
		this.hits.clear();
		const v = viewOf(this.read());
		if (!v) return [];
		const label = v.isReview ? "Review" : v.item?.label ?? "Answer";
		if (columns < 20) return [];
		const size = `${columns}x${this.tui.terminal.rows}`;
		if (this.size && size !== this.size) queueMicrotask(this.onResize);
		this.size = size;
		const gap = " ".repeat(tokens.gutter);
		if (this.field) {
			if (!this.focused) return this.offer(columns, "Resume editing", []);
			return this.shortcuts(columns, [
				{
					hotkey: "enter",
					label: "Save",
					hit: "key:0",
					isLit: true
				},
				{
					hotkey: "shift+enter",
					label: "newline"
				},
				{
					hotkey: "esc",
					label: "Cancel",
					hit: "key:1"
				}
			], [() => this.handleInput("\r"), () => this.finishEdit()]);
		}
		const progressText = `${label}  ${v.answered}/${v.count} answered`;
		if (!this.focused) return this.offer(columns, "Answer", [span(gap), span(progressText, { role: "dim" })]);
		const acts = [];
		const hint = (hotkey, label) => ({
			hotkey,
			label
		});
		const action = (hotkey, label, act) => {
			acts.push(() => this.onAction(act));
			return {
				hotkey,
				label,
				hit: `key:${acts.length - 1}`
			};
		};
		const hints = [];
		if (v.item) {
			const item = v.item;
			const letters = choiceLetters(item);
			const picks = letters.filter((key, i) => key && item.entries[i]?.kind !== "write");
			const write = letters.find((_, i) => item.entries[i]?.kind === "write");
			const consecutive = picks.every((key, i) => i === 0 || key.charCodeAt(0) === picks[i - 1].charCodeAt(0) + 1);
			if (picks.length) hints.push(hint(picks.length > 1 && consecutive ? `${picks[0]}–${picks.at(-1)}` : picks.join("/"), "pick"));
			if (write) hints.push(action(write, "Write", {
				kind: "pick",
				step: v.step,
				entry: letters.indexOf(write)
			}));
		} else {
			hints.push({
				...v.reply ? action("enter", "Fill", { kind: "fill" }) : action("enter", "First question", { kind: "top" }),
				isLit: true
			});
			if (v.reply) hints.push(action("s", "Send", { kind: "send" }));
		}
		hints.push(action("n", "Note", {
			kind: "note",
			step: v.step
		}), action("r", v.isReview ? "Back" : "Review", { kind: "review" }), action("esc", "Prompt", { kind: "release" }), hint("jk", "move"));
		if (v.item && v.review[v.step]?.isAnswered) hints.push(action("x", "Clear", {
			kind: "clear",
			step: v.step
		}));
		if (v.item?.accepts.includes(",")) hints.push(action("y", "Take recommendation", {
			kind: "accept",
			step: v.step
		}));
		const digits = String(v.count).length;
		const stop = `${String(v.step + 1).padStart(digits, "0")}/${v.count}`;
		const role = "text";
		return this.shortcuts(columns, hints, acts, [v.isReview ? span(progressText, {
			role,
			bold: true
		}) : span(` ${stop} `, {
			role,
			inverse: true
		})]);
	}
	/** The buttons as rows, and what each does: `acts` by the number in its `hit`. */
	shortcuts(columns, keys, acts, lead) {
		return buttonRow(keys, columns - 1, {
			wrap: true,
			lead,
			hover: this.hover
		}).map((row, y) => {
			const { text, cells } = paintLine(this.theme, row, columns - 1);
			this.hits.set(y, {
				text,
				cells: cells.flatMap((cell) => {
					const act = acts[Number(cell.hit.slice(4))];
					return act ? [{
						start: cell.start,
						end: cell.end,
						act
					}] : [];
				})
			});
			return ` ${text}`;
		});
	}
	/** The one row that offers the keys, with what follows it on the row, cut to the component. */
	offer(columns, label, suffix) {
		const act = () => this.onAction({ kind: "focus" });
		const [row] = buttonRow([{
			hotkey: "alt+a",
			label,
			hit: "key:0",
			essential: true
		}], columns - 1, { hover: this.hover });
		const painted = paintLine(this.theme, line(truncateSpans([...row?.spans ?? [], ...suffix], columns - 1)), columns - 1);
		this.hits.set(0, {
			text: painted.text,
			cells: painted.cells.map((cell) => ({
				start: cell.start,
				end: cell.end,
				act
			}))
		});
		return [` ${painted.text}`];
	}
	handleMouse(event) {
		const cell = cellAt(this.hits.get(event.y)?.cells ?? [], event.x - 1);
		if (event.type === "move") {
			const next = cell && {
				x: cell.start,
				y: event.y
			};
			const changed = this.hover?.x !== next?.x || this.hover?.y !== next?.y;
			this.hover = next;
			return changed ? {
				handled: true,
				render: true
			} : void 0;
		}
		if (!cell || event.button !== "left") return void 0;
		if (event.type === "click") cell.act();
		return event.type === "press" || event.type === "click" ? { handled: true } : void 0;
	}
};
/** Pi has no extension API for scrolling to an entry. If its viewport internals change, the
* cards are still reachable through ordinary scrollback, and the guide still works. */
function reveal(tui, card, step, align) {
	const primary = Reflect.get(tui, "getPrimaryScrollView");
	if (typeof primary !== "function") return true;
	tui.renderNow();
	const scroll = primary.call(tui);
	if (!(scroll instanceof ScrollView)) return true;
	const width = scroll.getContentWidth(tui.terminal.columns);
	function locate(component) {
		if (component === card) return 0;
		const children = component.children;
		if (!Array.isArray(children)) return void 0;
		let preceding = 0;
		for (const child of children) {
			const found = locate(child);
			if (found !== void 0) return preceding + found;
			preceding += child.render(width).length;
		}
	}
	const offset = locate(scroll);
	const span = card.span(step);
	if (offset === void 0 || !span) return false;
	const start = offset + span[0];
	const end = offset + span[1] - scroll.viewportHeight;
	if (align === "nearest" && end <= start) {
		const top = Math.max(end, Math.min(start, scroll.scrollTop));
		if (top !== scroll.scrollTop) scroll.scrollTo(top);
	} else scroll.scrollTo(align === "end" ? Math.max(start, end) : start);
	return true;
}

// src/pi.ts
/**
* A round of questions or a pick list lives in the transcript as cards, with its keys in a guide
* above the prompt. In pi's regular mode the terminal owns the scrollback: the cards and the
* keys work there, but pi reports no mouse and cannot scroll to a card.
*/
const WIDGET_KEY = "answer";
const SHORTCUT = "alt+a";
const ENTRY = "answer-form";
const CARD = "answer-round";
/** What has the keys now: the prompt, as the guide takes them. The TUI class has it; its interface doesn't. */
const focusedOf = (tui) => "getFocusedComponent" in tui && typeof tui.getFocusedComponent === "function" ? tui.getFocusedComponent() ?? null : null;
const hasEditor = (ctx) => ctx.mode === "tui" && ctx.hasUI;
function lastAssistantText(messages) {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role !== "assistant") continue;
		const text = contentText(m.content, "\n").trim();
		if (text) return text;
	}
	return "";
}
/** The reply above what the person had typed, never over it. */
const placeReply = (draft, text) => draft.trim() ? `${text}\n\n${draft}` : text;
/**
* Whether an input carries the round's own reply: the text is what the reply says, or what the
* form filled with the person's draft left under it (a fill puts the reply above the draft).
*/
const isReplyOf = (text, reply) => reply !== "" && (text === reply || text.startsWith(`${reply}\n`));
/** What a send that sets the round aside says, counting the answers it keeps. */
const asideNotice = (answered) => answered ? `${answered} answer${answered === 1 ? "" : "s"} set aside: /answer brings them back.` : "Answers set aside: /answer brings them back.";
/** Everything the widget draws of a view, so a step that changes none of it costs no redraw. */
const signature = (view) => view ? `${view.id}|${view.answered}` : "";
/** A round as the branch stored it: its form and an answer for each of its items. */
const isRound = (value) => {
	if (value === null) return true;
	if (typeof value !== "object" || value === null) return false;
	const { form, draft } = value;
	return Array.isArray(form?.items) && Array.isArray(draft?.answers) && Array.isArray(draft?.notes) && form.items.length === draft.answers.length && form.items.length === draft.notes.length;
};
/** A record another version wrote, or a corrupt one, is skipped rather than believed. */
const isSaved = (data) => {
	if (typeof data !== "object" || data === null || !("held" in data)) return false;
	const { held, aside, archived } = data;
	return isRound(held) && (aside === void 0 || isRound(aside)) && (archived === void 0 || isRound(archived));
};
function pi_default(pi) {
	let held = null;
	let aside = null;
	const rounds = /* @__PURE__ */ new Map();
	let ctxOf;
	let tui;
	let guide;
	let promptFocus = null;
	let reviewFrom = 0;
	let filled;
	let sending;
	const visibleCards = /* @__PURE__ */ new Set();
	/** The signature the widget last drew. */
	let shown = "";
	let lastText = "";
	const isTranscript = () => !!held?.anchor && visibleCards.has(held.anchor);
	const release = () => {
		if (guide?.focused) tui?.setFocus(promptFocus);
	};
	const draw = (ctx) => {
		const view = viewOf(held);
		if (tui?.children.length === 0) tui = void 0;
		const next = isTranscript() ? `round:${held?.anchor}` : signature(view);
		if (tui && guide && shown === next) {
			tui?.requestRender();
			return;
		}
		if (shown === next && tui) return;
		release();
		guide = void 0;
		shown = next;
		ctx.ui.setWidget(WIDGET_KEY, (surface, theme) => {
			tui = surface;
			if (isTranscript()) {
				shown = `round:${held?.anchor}`;
				const made = new AnswerGuide(surface, theme, () => held, (action) => act(ctx, action), () => {
					if (made === guide && held) locate(held.draft.step, made.editing ? "nearest" : "start");
				});
				guide = made;
				return guide;
			}
			shown = signature(view);
			if (!view) return {
				render: () => [],
				invalidate() {}
			};
			const { answered, title } = view;
			const note = offerNote(answered, SHORTCUT);
			return new AnswerOffer(theme, title, note, () => void open(ctx));
		});
	};
	const remember = (round) => {
		if (round?.anchor) rounds.set(round.anchor, round);
	};
	const save = (archived) => {
		remember(held);
		remember(aside);
		remember(archived);
		pi.appendEntry(ENTRY, {
			held,
			aside,
			archived
		});
	};
	const hold = (ctx, next, archived) => {
		const isSame = next === held;
		const isToLast = next?.draft.step === next?.form.items.length;
		if (next && isToLast && next.form === held?.form && held.draft.step !== next.draft.step) reviewFrom = held.draft.step;
		held = next;
		if (!isSame || archived) save(archived);
		draw(ctx);
	};
	const adopt = (ctx) => {
		if (held || !aside) return;
		held = aside;
		aside = null;
		save();
		draw(ctx);
	};
	const restore = (ctx) => {
		if (!hasEditor(ctx)) return;
		release();
		held = null;
		aside = null;
		filled = void 0;
		sending = void 0;
		guide = void 0;
		reviewFrom = 0;
		lastText = "";
		ctxOf = ctx;
		rounds.clear();
		cards.clear();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== ENTRY || !isSaved(entry.data)) continue;
			held = entry.data.held;
			aside = entry.data.aside ?? null;
			remember(held);
			remember(aside);
			remember(entry.data.archived);
		}
		shown = "";
		tui = void 0;
		refreshProjection(ctx);
	};
	function refreshProjection(ctx) {
		if (!hasEditor(ctx)) return;
		visibleCards.clear();
		for (const entry of ctx.sessionManager.buildContextEntries()) if (entry.type === "custom" && entry.customType === CARD && typeof entry.data === "string") visibleCards.add(entry.data);
		draw(ctx);
	}
	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_compact", (_event, ctx) => refreshProjection(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", () => {
		ctxOf = void 0;
	});
	const locate = (step, align = "start") => {
		if (!tui || !held?.anchor) return false;
		const card = cards.get(held.anchor);
		return !!card && reveal(tui, card, step, align);
	};
	const cards = /* @__PURE__ */ new Map();
	pi.registerEntryRenderer(CARD, (entry, _options, theme) => {
		const id = entry.data;
		if (typeof id !== "string") return void 0;
		const made = new Transcript(theme, () => {
			const round = rounds.get(id);
			return round && tui?.children.length ? {
				round,
				active: held?.anchor === id,
				field: held?.anchor === id ? guide?.activeField : void 0
			} : void 0;
		}, (action) => {
			if (ctxOf && held?.anchor === id) act(ctxOf, action);
		});
		cards.set(id, made);
		return made;
	});
	pi.on("agent_end", (event) => {
		lastText = lastAssistantText(event.messages);
	});
	pi.on("agent_settled", (event, ctx) => {
		if (!hasEditor(ctx) || event.aborted) return;
		const incoming = offer(held, lastText);
		if (!incoming || incoming === held) return;
		const previous = held;
		const anchor = place();
		reviewFrom = 0;
		filled = void 0;
		hold(ctx, {
			...incoming,
			anchor
		}, previous ?? void 0);
		if (isTranscript()) locate(0);
	});
	pi.on("input", (event, ctx) => {
		if (!held || !event.text.trim() || event.source === "extension") return;
		const answering = held;
		const submitted = filled && isReplyOf(event.text, filled.reply) ? filled.round : void 0;
		const v = viewOf(answering);
		const sent = submitted || isReplyOf(event.text, v?.reply ?? "");
		if (!sent && hasWork(answering)) {
			aside = answering;
			if (event.source === "interactive") ctx.ui.notify(asideNotice(v?.answered ?? 0), "info");
		}
		sending = void 0;
		filled = void 0;
		hold(ctx, null, sent ? {
			...submitted ?? answering,
			sent: true
		} : answering);
	});
	pi.on("message_start", (event, ctx) => {
		const pending = sending;
		if (!pending || event.message.role !== "user") return;
		const content = event.message.content;
		const text = typeof content === "string" ? content : contentText(content, "\n");
		sending = void 0;
		if (text !== pending.reply || held?.form !== pending.round.form) return;
		filled = void 0;
		hold(ctx, null, {
			...pending.round,
			sent: true
		});
	});
	/** A new card for a round at the end of the transcript; its anchor. */
	function place() {
		const anchor = randomUUID();
		visibleCards.add(anchor);
		pi.appendEntry(CARD, anchor);
		return anchor;
	}
	const open = async (ctx) => {
		if (!hasEditor(ctx)) return;
		if (tui?.children.length === 0) draw(ctx);
		adopt(ctx);
		if (!held || !viewOf(held)) {
			ctx.ui.notify("Nothing to answer: the last turn asked no questions.", "info");
			return;
		}
		if (!held.anchor || !visibleCards.has(held.anchor)) {
			hold(ctx, {
				...held,
				anchor: place()
			});
			locate(held.draft.step);
		}
		if (isTranscript() && guide) focusGuide();
	};
	function advance(ctx, round, action, id) {
		const next = step(round, action, id);
		if (next !== round) hold(ctx, {
			...round,
			...next
		});
	}
	function at(round, step$1) {
		return round.draft.step === step$1 ? round : {
			...round,
			...step(round, {
				do: "go",
				step: step$1
			})
		};
	}
	function focusGuide() {
		if (!tui || !guide || !held) return false;
		if (!guide.editing && !locate(held.draft.step, "nearest")) return false;
		if (!guide.focused) {
			promptFocus = focusedOf(tui);
			tui.setFocus(guide);
		}
		return true;
	}
	function submit(ctx, send) {
		const round = held;
		const reply = viewOf(round)?.reply;
		if (!round || !reply) return;
		if (!send) {
			const text = ctx.ui.getEditorText();
			const draft = filled && isReplyOf(text, filled.reply) ? text.slice(filled.reply.length).replace(/^\n\n?/, "") : text;
			ctx.ui.setEditorText(placeReply(draft, reply));
			filled = {
				reply,
				round
			};
			release();
			return;
		}
		if (!ctx.isIdle()) {
			ctx.ui.notify("Wait for the current turn to finish before sending answers.", "info");
			return;
		}
		release();
		sending = {
			round,
			reply
		};
		pi.sendUserMessage(reply);
	}
	function editText(ctx, field) {
		const round = held;
		const v = viewOf(round);
		const editingGuide = guide;
		if (!round || !v || !editingGuide) return;
		const wasFocused = editingGuide.focused;
		if (!focusGuide()) return;
		const prefill = field === "write" ? v.item?.written : v.item?.note ?? v.note;
		editingGuide.edit(field, v.step, prefill ?? "", (text) => {
			if (guide !== editingGuide || round !== held) return;
			if (text !== void 0) advance(ctx, round, {
				do: field,
				text
			});
			if (!wasFocused) release();
			locate(held?.draft.step ?? v.step, "nearest");
		});
		locate(v.step, "nearest");
	}
	function act(ctx, action) {
		if (!held || guide?.editing && action.kind !== "focus") return;
		const go = (step) => {
			if (held) hold(ctx, at(held, step));
		};
		const v = viewOf(held);
		if (!v) return;
		switch (action.kind) {
			case "focus":
				open(ctx);
				return;
			case "release": return release();
			case "fill": return submit(ctx, false);
			case "send": return submit(ctx, true);
			case "top":
				go(0);
				locate(0, "start");
				return;
			case "review":
				go(v.isReview ? reviewFrom : v.count);
				break;
			case "move":
				go(Math.max(0, Math.min(v.count, v.step + action.delta)));
				break;
			case "go":
				go(action.step);
				break;
			case "note":
				go(action.step);
				editText(ctx, "note");
				return;
			case "clear":
			case "accept":
				advance(ctx, at(held, action.step), { do: action.kind });
				break;
			case "pick": {
				const target = at(held, action.step);
				const entry = viewOf(target)?.item?.entries[action.entry];
				if (!entry) return;
				if (entry.kind === "write") {
					hold(ctx, target);
					editText(ctx, "write");
					return;
				}
				advance(ctx, target, entry.isChosen ? { do: "next" } : {
					do: "pick",
					entry: action.entry
				});
				if (!entry.isChosen) return;
				break;
			}
		}
		if (held) locate(held.draft.step, !v.isReview && held.draft.step === v.count ? "end" : "nearest");
	}
	pi.registerShortcut(SHORTCUT, {
		description: "Take the keys for the questions or pick list the last turn ended on",
		handler: (ctx) => open(ctx)
	});
	pi.registerCommand("answer", {
		description: "Take the keys for the question round or numbered pick list",
		handler: async (_args, ctx) => open(ctx)
	});
}

export { pi_default as default };