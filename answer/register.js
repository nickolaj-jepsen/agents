import { atom, read as read$1, update } from "claude-code";
import { n as widthCap, t as tokens } from "./tokens-BWSk26Ae.js";

// src/lib/parse/doc.ts
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING$1 = /^#{1,6}\s+/;
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
function labelOf$1(line) {
	const words = line.replace(HEADING$1, "");
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
	return (indent === 0 ? labelOf$1(words) : void 0) ?? optionOf(item, bullet) ?? (bullet ? { is: "bullet" } : leanOf(words));
}
/**
* Whether each line is code. A fence closes on a line of at least as many of its own marks and
* nothing else, so a fence quoted inside a longer one does not end it.
*/
function codeLines(lines) {
	let open = "";
	return lines.map((line) => {
		const [, marks = "", said = ""] = FENCE.exec(line) ?? [];
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
			if (RULE.test(raw)) return {
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
				kind: HEADING$1.test(raw) ? "heading" : "text",
				mark: markOf(raw, indent)
			};
		})
	};
}
const isLabel = (line) => line?.mark?.is === "label";
const isOption = (line) => line?.mark?.is === "option";
/** What a line says after the marks that open it: a quote mark, heading marks, a list marker. */
const textOf$1 = (line) => line.raw.trim().replace(QUOTE, "").replace(HEADING$1, "").replace(BULLET, "");
/** What a line says, with its bold taken off too. */
const wordsOf = (line) => unbold(textOf$1(line));
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
function rowOf$2(label, own, between, route) {
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
		items.push(rowOf$2(start.mark, own, doc.lines.slice(rowEnd, next ?? rowEnd), route));
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
			addOption(found, line.mark.key, lifted ? textOf$1(lifted) : line.mark.text, [line.mark.more, ...dedent(lifted ? below : under)]);
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
const SELECTS = /^(?:\*\*)?(?:ok[,.]?\s+|so[,.]?\s+)?(?:which|what)\b/i;
const GO_AHEAD = /^(?:want|do you want|shall i|should i)\b[^?]*\b(?:go ahead|do (?:both|either|it|them|these|all)|make (?:these|those|both) changes?|implement (?:them|these))\b/i;
const ALTERNATIVES = /\s+or\s+(?!none\b)|:\s*\S/i;
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
	const lead = textOf$1(line);
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
/** Whether a closing question asks the person to answer with the list above it. */
const selects = (ask) => !ALTERNATIVES.test(ask) && (SELECTS.test(ask) || GO_AHEAD.test(ask));
/**
* A numbered list of alternatives as one question. `cued` reads only a list under a line that is
* itself the question, which makes the list its options before any item is read as a question of
* its own; otherwise the paragraph after the list must close on a question that picks among them.
* A list of steps under a report stays prose: a false card costs more than a lost one.
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
	const picking = closing && after.filter(isOption).length < 2 && (!closing.after || WHICH.test(closing.ask)) && selects(closing.ask) ? closing : null;
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
/** The line each item `parse` finds starts on, so a harness can cut the message up. */
const startLines = (text) => split$1(text)?.starts ?? [];
/** What the message says after its last item, which no card draws: markdown, "" when none. */
function tailOf(text) {
	const found = split$1(text);
	if (!found) return "";
	const lines = readDoc(text).lines.slice(found.tail);
	const from = lines.findIndex((line) => line.kind !== "blank" && line.kind !== "rule");
	return from < 0 ? "" : tidy(lines.slice(from).map((line) => line.raw));
}

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
function said$1(item, answer) {
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
/**
* The reply every answer is spelt out in, one line each: "yes" standing for the whole round is
* shorthand for someone typing it, and the form already knows which recommendation each line took.
*/
function roundReply(form, draft) {
	return rowsOf(form, draft).flatMap(({ item, answer, note }) => {
		if (answer) {
			const words = said$1(item, answer);
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
		const what = said$1(item, answer);
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
	if (answer.kind === "options") return plain(`${said$1(item, answer)}: ${answer.indices.map((index) => textAt(item, index)).join("; ")}`);
	const index = answer.kind === "option" ? answer.index : item.recommendedOption;
	return plain(index === void 0 ? said$1(item, answer) : `${said$1(item, answer)}: ${textAt(item, index)}`);
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
		accepts: item.recommendedOption !== void 0 || item.recommendedOptions ? said$1(item, accepted(item)) : "",
		note: draft.notes[draft.step] ?? "",
		written: answer?.kind === "text" ? answer.text : ""
	};
}
function view$5(form, draft) {
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
function step$1(held, action, id) {
	if (id !== void 0 && id !== formId(held.form)) return held;
	const draft = apply(held.form, held.draft, action);
	return draft === held.draft ? held : {
		...held,
		draft
	};
}

// src/claude/terminal.ts
/**
* The digits a terminal card takes: a row answers by its place on screen, as its letter does.
*/
/**
* The digits that answer a row by its place on screen, so a keyboard-driven client can take a
* number the reply never prints. The first nine rows take one each; the tenth on takes none.
*/
const POSITIONS = "123456789";
/** The place a key names, counting the rows drawn top down; -1 for anything but a digit. */
const rowOf$1 = (key) => key.length === 1 ? POSITIONS.indexOf(key) : -1;

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
/** A host-drawn block in the drawing's flow. */
const slotLine = (slot) => ({
	spans: [],
	slot
});
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
function typed$1(g, role, children, o = {}) {
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
* A column that has an address: what the host scrolls to or finds by `key`. Parts that are
* `null` are left out.
* @param o `gap` is the step between the parts. @default "sm". `isMeasured` sets it as wide as a
* line of prose (`tokens.prose`), shrinking in a narrower room: for the block a host sets in a
* message, which it sizes by its content, so text that wraps would otherwise be a few cells wide.
*/
function column(g, o, ...parts) {
	const { Box } = g.els;
	const body = /* @__PURE__ */ h(Box, {
		key: o.isMeasured ? void 0 : o.key,
		flexDirection: "column",
		width: o.isMeasured ? tokens.prose : void 0,
		flexShrink: o.isMeasured ? 1 : void 0,
		minWidth: o.isMeasured ? 0 : void 0,
		rowGap: tokens.gui.space[o.gap ?? "sm"],
		paddingX: o.isInset ? tokens.gui.across.inset : void 0
	}, parts.filter(Boolean));
	return o.isMeasured ? /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "row",
		minWidth: 0
	}, body) : body;
}
/** `word` with its first letter in capitals: a graphical button's label, which has no key beside it. */
const capital$2 = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
function view$4(model, surface) {
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
function buttonRow(g, props) {
	const { Box, Button } = g.els;
	const drawn = view$4(props, g.surface);
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

// ../../lib/kits/core/src/manifest.ts
/** A contract's model fields, checked against the model type: a field left out is an error. */
const modelFields = () => (keys) => keys;

// ../../lib/kits/card/src/contract.ts
/**
* The question card's contract: its model, what each drawing is given, and the intents a list of
* choices sends back. No host imports.
*/
/** The hit of the `line`th field of a write-in or a note that is one field per line. */
const lineHit = (hit, line) => line ? `${hit}#${line}` : hit;
/** A field's hit and its line, from what `g.input` or `g.submit` was given. */
function lineOf(hit) {
	const at = hit.lastIndexOf("#");
	const line = at < 0 ? NaN : Number(hit.slice(at + 1));
	return Number.isInteger(line) ? {
		hit: hit.slice(0, at),
		line
	} : {
		hit,
		line: 0
	};
}
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
/**
* The question: the pointer column, its label, then the title hanging from it. That it is
* answered is the rail's to say.
*/
function heading$1(h, width) {
	return block(inline(h.title, {
		role: "text",
		bold: true
	}), width, { lead: [...pointerLead(h.focused), ...h.label ? [span(h.label + GAP, { role: keyRole(h) })] : []] });
}
/**
* One answer: the pointer column, its key, its mark and its words, wrapped to hang under their
* first line. Only a chosen one takes a colour, the accent.
*/
function choice$1(c, width) {
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
function note$1(n, width) {
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
function closing$1(c, width) {
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
		span(GAP),
		fill
	])];
	return [line(truncateSpans(head, width)), line(truncateSpans([span(CARD_INSET), fill], width))];
}

// ../../lib/kits/card/src/gui.tsx
/**
* The question card on the graphical surfaces. A question's answers stand as rows, each a
* row of a mark (an icon: open or chosen), the key's Button and its words; the letter is a Button
* because a Box has no press handler, and a Button's label never wraps. The note is a panel with
* a full-width field; the steps are tabs, the current one a label; each answer in review is a
* label in a label column. A card draws no pointer or hover of its own: the host draws those.
* Rows keep the kit's beat (`rowOf`, `rows`).
*/
const { space, across, lead } = tokens.gui;
/** The column that leads a row of answers: the mark's icon and the key's Button. */
const LEAD = lead + 2.2;
const INVITATION = "Write your own answer";
/** A Button that presses its `hit`, quiet: the surface fills any other, and one button of a screen is lit. */
function control(g, o) {
	const { Button } = g.els;
	return /* @__PURE__ */ h(Button, {
		key: o.key,
		dimColor: true,
		label: o.label,
		onPress: () => o.hit ? g.press(o.hit) : void 0
	});
}
/**
* A field for the host's `Input`, the width of its room: one, or with `lines` (and a host whose
* field is one line) one per line of its text, the later ones at `lineHit(hit, i)`.
*/
function field(g, o, fp) {
	const { Box, Input } = g.els;
	const first = fp.autoFocus || void 0;
	if (!fp.lines || !can(g, "inputRows:1")) return /* @__PURE__ */ h(Input, {
		key: o.key,
		value: o.value,
		placeholder: o.placeholder,
		autoFocus: first,
		rows: o.rows ?? (fp.rows && fp.rows > 1 ? fp.rows : void 0),
		onInput: (text) => g.input(o.hit, text),
		onSubmit: (text) => g.submit(o.hit, text)
	});
	const parts = o.value.split("\n");
	const count = Math.max(fp.lines, parts.length);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.sm
	}, Array.from({ length: count }, (_, i) => /* @__PURE__ */ h(Input, {
		key: i ? `${o.key}:${i}` : o.key,
		autoFocus: !i && first || void 0,
		value: parts[i] ?? "",
		placeholder: i ? `Line ${i + 1}` : o.placeholder,
		onInput: (text) => g.input(lineHit(o.hit, i), text),
		onSubmit: (text) => g.submit(lineHit(o.hit, i), text)
	})));
}
/** The question: its label dim in the lead column, then its title as the heading. */
function heading(g, question) {
	const { Box, Markdown } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		columnGap: across.sm,
		paddingX: across.inset,
		alignItems: "flex-start"
	}, question.label ? /* @__PURE__ */ h(Box, {
		flexShrink: 0,
		minWidth: LEAD
	}, typed$1(g, "caption", question.label)) : null, /* @__PURE__ */ h(Box, {
		width: 0,
		flexGrow: 1,
		flexShrink: 1
	}, /* @__PURE__ */ h(Markdown, { text: `### ${question.title}` })), question.answered ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, meaning(g, "state:success", { alt: "Answered" })) : null);
}
/**
* One answer: the mark (an icon, filled where chosen), the letter on a quiet Button and its
* words beside them, the dim aside after them on their line and the detail under them. A
* write-in is the host's `Input` in place of the words. With no key the mark stands alone.
*/
function choice(g, c) {
	const { Box, Text, Markdown } = g.els;
	const invitation = c.invitation ?? INVITATION;
	const mark = meaning(g, c.chosen ? "choice:chosen" : "choice:open", { alt: c.chosen ? "Chosen" : "Not chosen" });
	const letter = c.key ? control(g, {
		key: `key:${c.hit ?? c.key}`,
		label: capital$2(c.key),
		hit: c.hit
	}) : null;
	const body = c.literal && can(g, "input") ? field(g, {
		key: `write:${c.hit ?? c.key}`,
		value: c.text === invitation ? "" : c.text,
		placeholder: invitation,
		hit: c.hit ?? ""
	}, c) : c.literal ? /* @__PURE__ */ h(Text, null, c.text) : c.aside ? /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.sm,
		alignItems: "flex-start"
	}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Markdown, { text: c.text })), /* @__PURE__ */ h(Text, { dimColor: true }, c.aside)) : /* @__PURE__ */ h(Markdown, { text: c.text });
	return /* @__PURE__ */ h(Box, {
		key: `choice:${c.hit ?? c.key}`,
		flexDirection: "row",
		alignItems: "flex-start",
		columnGap: across.sm,
		paddingY: tokens.gui.row.pad
	}, /* @__PURE__ */ h(Box, {
		key: "lead",
		flexDirection: "row",
		alignItems: "center",
		columnGap: across.xs,
		flexShrink: 0,
		minWidth: LEAD
	}, mark, letter), /* @__PURE__ */ h(Box, {
		key: "body",
		flexDirection: "column",
		width: 0,
		flexGrow: 1,
		flexShrink: 1,
		rowGap: space.xs
	}, body, c.aside && c.literal ? /* @__PURE__ */ h(Text, { dimColor: true }, c.aside) : null, c.detail ? /* @__PURE__ */ h(Markdown, {
		text: c.detail,
		dimColor: true
	}) : null));
}
/**
* The answers of one question as rows that keep one beat. They are tied together by their
* marks and the one left edge, not by a rail or an outline: the host draws no left border, and a
* visible round border is not allowed (`expectNative`), nor a fill for rows that are always there.
*/
function choices(g, all) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: "choices",
		flexDirection: "column",
		paddingX: across.inset
	}, rows(g, {}, ...all.map((c) => choice(g, c))));
}
/**
* The card's note, in a panel: a caption and a field the panel's whole width, under the answers.
* On a surface with no field the note is its words.
*/
function note(g, n) {
	const { Box } = g.els;
	const hit = n.hit ?? "note";
	const body = can(g, "input") ? field(g, {
		key: `note:${hit}`,
		value: n.value,
		placeholder: n.invitation ?? "Add a note",
		rows: n.max && n.max > 1 ? n.max : void 0,
		hit
	}, n) : typed$1(g, "body", n.value);
	return /* @__PURE__ */ h(Box, {
		key: `panel:${hit}`,
		flexDirection: "column",
		paddingX: across.inset
	}, panel(g, {}, typed$1(g, "caption", "Note"), body));
}
/**
* The steps of several questions as tabs: a done one marked with a tick, the others quiet
* Buttons, and the current one a label, which is where the person is and not a control. A name
* too long for a Button is left out for the step's short word.
*/
function steps(g, all) {
	const { Box } = g.els;
	if (all.length === 0) return void 0;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: across.sm,
		rowGap: space.xs,
		paddingX: across.inset
	}, all.map((step, i) => {
		const label = step.name && step.name.length <= tokens.gui.maxLabel ? `${step.short} ${step.name}` : step.short;
		return /* @__PURE__ */ h(Box, {
			key: `step:${step.hit ?? i}`,
			flexDirection: "row",
			alignItems: "center",
			columnGap: across.xs
		}, step.done && !step.current ? meaning(g, "state:success", { alt: "Done" }) : null, step.current ? typed$1(g, "body", label) : control(g, {
			key: `tab:${step.hit ?? i}`,
			label,
			hit: step.hit
		}));
	}));
}
/**
* A question's answers for review: its label in the label column, then its title, one line per
* answer and the note. The label is words, not a Button; where the question can be gone back to
* from here (a `hit`) a quiet Change stands at the row's far edge.
*/
function summary(g, s) {
	const { Box, Text, Markdown } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		columnGap: across.sm,
		paddingX: across.inset,
		alignItems: "flex-start"
	}, /* @__PURE__ */ h(Box, {
		flexShrink: 0,
		minWidth: LEAD
	}, typed$1(g, "caption", s.label)), /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		width: 0,
		flexGrow: 1,
		flexShrink: 1,
		rowGap: space.xs
	}, /* @__PURE__ */ h(Markdown, { text: `**${s.title.replaceAll("**", "")}**` }), s.values.length > 0 ? s.values.map(({ text, literal }, i) => literal ? /* @__PURE__ */ h(Text, { key: `${s.label}:v${i}` }, text) : /* @__PURE__ */ h(Markdown, {
		key: `${s.label}:v${i}`,
		text
	})) : /* @__PURE__ */ h(Text, { dimColor: true }, "Not answered"), s.note ? /* @__PURE__ */ h(Text, { dimColor: true }, `Note: ${s.note}`) : null), s.hit ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, control(g, {
		key: `go:${s.hit}`,
		label: "Change",
		hit: s.hit
	})) : null);
}
/**
* The row after a round's last card: the count, which goes to the first question, and Fill
* prompt. A sent round says so; one with no `hits` is the count only.
*/
function closing(g, c) {
	const { Box, Button } = g.els;
	const { hits } = c;
	const count = `${c.answered} of ${c.total} answered`;
	return rowOf(g, { key: "closing" }, /* @__PURE__ */ h(Box, {
		key: "count",
		paddingX: across.inset
	}, hits && !c.sent ? control(g, {
		key: "count",
		label: count,
		hit: hits.count
	}) : typed$1(g, "body", count, { tabular: true })), c.sent ? /* @__PURE__ */ h(Box, {
		key: "sent",
		flexDirection: "row",
		alignItems: "center",
		columnGap: across.xs
	}, meaning(g, "state:success", { alt: "Sent" }), typed$1(g, "body", "Sent")) : null, hits && !c.sent ? /* @__PURE__ */ h(Button, {
		key: "fill",
		variant: c.canFill ? "primary" : void 0,
		dimColor: !c.canFill || void 0,
		label: "Fill prompt",
		onPress: () => g.press(hits.fill)
	}) : null);
}
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
function view$3(model, surface) {
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
	const v = view$3({
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
/**
* A block behind the engine's quote border: the rail a card has in a transcript. The kit's rows
* are drawn inside it, so a pane that draws no rail (a terminal's band) never calls this.
* @param o `width` is the block's outer width in cells; `rail` the border's weight: `answered`
* in the success colour, `quiet` dim, `bright` the engine's own.
*/
function quoted(k, body, o) {
	const { Box } = k;
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		width: o.width,
		flexDirection: "column",
		borderStyle: "quote",
		borderColor: o.rail === "answered" ? "success" : void 0,
		borderDimColor: o.rail === "quiet" || void 0,
		paddingX: 1
	}, body);
}
/** The address of a button that carries one key and draws nothing. */
const keyAddress = (key) => `kit-key-${key}`;
/**
* Keys alone, on buttons that draw nothing, for a site that keeps no focus of its own: a row
* above the prompt, whose digits the engine presses from an empty prompt.
* @param keys One lowercase letter or digit each.
*/
function hotkeys(k, keys) {
	const { Box, Button } = k;
	return /* @__PURE__ */ h(Box, {
		width: 0,
		height: 0,
		overflow: "hidden"
	}, keys.map(({ key, press }) => /* @__PURE__ */ h(Button, {
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

// ../../lib/kits/prose/src/model.ts
/**
* Prose's view model: whether a passage is drawn whole, folded to its first line or opened. Pure
* and plain: the graphical drawing reads it, and so does the snapshot that holds it across
* surfaces. No host imports.
*/
/** A passage of one short line is never folded: there is nothing to give way. */
const isLong = (text) => text.includes("\n") || cellWidth(text) > tokens.gui.excerptCells;
function view$2(model, surface) {
	const shape = !(!holds(surface, "cells") && model.excerpt !== void 0 && isLong(model.text)) ? "whole" : model.excerpt?.isOpen ? "opened" : "folded";
	return {
		shape,
		isDim: !!model.isDim,
		first: shape === "folded" ? model.text.replace(/\s*\n\s*/g, " ") : void 0
	};
}

// ../../lib/kits/prose/src/gui.tsx
/** Prose on the graphical surfaces: the host's own `Markdown`, as it draws a reply. */
/**
* A text of several blocks, at the inset every block of a pane has. The host sets it and wraps
* it; the surface scrolls, so there is no window. An `excerpt` folds a long passage to its first
* line with a `More` Button.
*/
function prose(g, p) {
	const { Box, Button, Markdown, Text } = g.els;
	const { across } = tokens.gui;
	const v = view$2(p, g.surface);
	const words = /* @__PURE__ */ h(Markdown, {
		text: p.text,
		dimColor: v.isDim || void 0
	});
	if (v.shape === "whole" || !p.excerpt) return /* @__PURE__ */ h(Box, { paddingX: across.inset }, words);
	const { hit } = p.excerpt;
	const toggle = /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: v.shape === "opened" ? "Less" : "More",
		onPress: () => g.press?.(hit)
	});
	if (v.shape === "folded") return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: across.md,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Box, {
		flexGrow: 1,
		flexShrink: 1,
		width: 0
	}, /* @__PURE__ */ h(Text, {
		dimColor: true,
		wrap: "truncate-end"
	}, spans(g, inline(v.first ?? "")))), /* @__PURE__ */ h(Box, { flexShrink: 0 }, toggle));
	return panel(g, {}, words, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		justifyContent: "flex-end"
	}, toggle));
}

// src/claude/transcript.tsx
/**
* The drawing context with the events of the fields the kit's card draws: `fields` by their `hit`.
* A field of one line per line (`lines`) reports the line it was typed on; the others the text whole.
*/
function fieldEvents(g, fields) {
	const by = (hit) => {
		const at = lineOf(hit);
		const f = fields[at.hit];
		return f ? {
			f,
			line: f.lines ? at.line : void 0
		} : void 0;
	};
	return {
		...g,
		input: (hit, text) => {
			const w = by(hit);
			return w ? w.f.input(text, w.line) : g.input(hit, text);
		},
		submit: (hit, text) => {
			const w = by(hit);
			return w ? w.f.submit(text, w.line) : g.submit(hit, text);
		}
	};
}
/** A transcript's open field, as `fieldEvents` takes it. */
const eventsOf = (w) => ({ [w.hit]: {
	lines: w.props.lines,
	input: w.onInput,
	submit: w.onSubmit
} });
const labelOf = (text) => text.replace(/^[A-H0-9]{1,2}[.)]\s*/, "");
/** Markdown that `inlineMarkdown` cannot set: a list, a heading, a quote, a fence or a table. */
const BLOCKS = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|~~~|\|)/m;
/**
* The key a terminal card draws and binds: its own letter, `A` for a prose recommendation,
* or its place in a pick list.
*/
const entryLetter = (entry, index) => entry.kind === "accept" ? "A" : entry.key || (entry.kind === "option" ? String.fromCharCode(65 + index) : "");
/** The key a row of the card binds: a letter, or the number a list of alternatives printed. */
const isKey = (key) => /^[A-H1-9]$/.test(key);
function writeLetter(item) {
	const keys = item.entries.map((entry, i) => entryLetter(entry, i)).filter(isKey);
	const isNumbered = keys.length > 0 && keys.every((key) => /[1-9]/.test(key));
	const last = Math.max(isNumbered ? 48 : 64, ...keys.map((key) => key.charCodeAt(0)));
	return String.fromCharCode(last + 1);
}
/** Whether a recommendation of several options has its own press: `Take A, B`. */
const takesMany = (item) => item.canAccept && item.accepts.includes(",");
/** A markdown block the engine sets, in the card's room: `indent` cells in, `inner` wide in all. */
const markdown = (text, indent, inner, isDim) => slotLine({
	kind: "markdown",
	text,
	indent,
	width: Math.max(1, inner - indent),
	isDim
});
/** Blocks as lines with a blank row between them, as the card keeps them. */
const spaced = (blocks) => blocks.filter((rows) => rows.length).flatMap((rows, i) => i ? [blank(), ...rows] : rows);
/**
* A question's card in a terminal: the kit's lines behind the engine's quote rail, each control
* a Button named by its row (`question-<n>-choose-<i>`, `-write`, `-note`, `-activate`).
* @param columns The band's or pane's room in cells.
*/
function questionCard(els, columns, held, index, current, actions) {
	const v = view$5(held.form, {
		...held.draft,
		step: index
	});
	const item = v.item;
	if (!item) return null;
	const isActive = current?.view.step === index;
	const several = item.isSeveral;
	const width = widthCap("reading", columns);
	const room = Math.max(1, width - 4);
	const inner = room;
	const prefix = `question-${index}`;
	const answered = v.review[index]?.isAnswered;
	const hasChoices = item.entries.some((entry) => entry.kind !== "write");
	const state = {
		active: isActive,
		answered
	};
	const inset = cellWidth(CARD_INSET);
	const hit = (name) => `${prefix}-${name}`;
	const choices = [];
	item.entries.forEach((entry, i) => {
		if (entry.kind === "write") return;
		const words = entry.kind === "accept" ? entry.text : labelOf(entry.text);
		const isDetailInline = !!entry.detail && !BLOCKS.test(entry.detail);
		choices.push(...choice$1({
			...state,
			key: entryLetter(entry, i),
			text: words,
			aside: entry.isRecommended ? "  Recommended" : void 0,
			detail: isDetailInline ? entry.detail : void 0,
			detailLines: 1e400,
			chosen: entry.isChosen,
			multiple: several,
			hit: hit(`choose-${i}`)
		}, room));
		if (entry.detail && !isDetailInline) choices.push(markdown(entry.detail, 4 + inset, inner, true));
	});
	if (actions || item.written) choices.push(...choice$1({
		...state,
		key: writeLetter(item),
		text: item.written || item.entries.find((entry) => entry.kind === "write")?.text || "Write your own answer",
		literal: true,
		chosen: !!item.written,
		hit: hit("write")
	}, room));
	if (actions || item.note) choices.push(...note$1({
		...state,
		value: item.note,
		hit: hit("note")
	}, room));
	const rows = spaced([
		heading$1({
			...state,
			focused: isActive,
			label: item.label,
			title: item.title
		}, room).map((row) => ({
			...row,
			hit: hit("activate")
		})),
		item.body ? [markdown(item.body, inset, inner)] : [],
		hasChoices || actions || item.written || item.note ? choices : [],
		item.recommended ? [markdown(`**Recommended:** ${item.recommended}`, inset, inner, true)] : [],
		actions && takesMany(item) ? [line([span(CARD_INSET), span(`Take ${item.accepts}`, {
			role: "dim",
			hit: hit("accept")
		})])] : []
	]);
	const press = (name) => {
		if (name === hit("activate")) return actions?.go(index);
		if (name === hit("write")) return actions?.edit(index, "write");
		if (name === hit("note")) return actions?.edit(index, "note");
		if (name === hit("accept")) return actions?.accept(index);
		const at = Number(name.slice(hit("choose-").length));
		return item.entries[at]?.isChosen && !several ? actions?.clear(index) : actions?.pick(index, at);
	};
	return quoted(els, paintLines(els, rows, {
		press: actions ? press : void 0,
		width: room
	}), {
		key: item.label,
		width,
		rail: answered ? "answered" : isActive ? "bright" : "quiet"
	});
}
/** The closing row's controls, as the painter names their Buttons. */
const CLOSING = {
	count: "round-count",
	fill: "round-fill",
	note: "round-note"
};
/**
* The row after the last card, the kit's: the count goes back to the first question, Fill prompt
* puts the reply in the prompt, and the round's note stands under it once it has words.
*/
function closingRow(els, columns, view, current, actions, sent) {
	const width = widthCap("reading", columns);
	const room = Math.max(1, width - 4);
	const isActive = current?.view.isReview === true;
	const isNoting = isActive && (current.writer ? current.editing === "note" : current.pending?.field === "note");
	const press = (name) => name === CLOSING.count ? actions?.top() : name === CLOSING.fill ? actions?.fill() : actions?.edit(view.count, "note");
	const rows = [...closing$1({
		answered: view.answered,
		total: view.count,
		focused: isActive && !isNoting,
		canFill: !!view.reply,
		sent,
		hits: actions ? {
			count: CLOSING.count,
			fill: CLOSING.fill
		} : void 0
	}, room), ...view.note || isNoting ? note$1({
		active: isActive,
		value: view.note,
		focused: isNoting,
		hit: actions ? CLOSING.note : void 0
	}, room) : []];
	const rail = railRole({
		active: isActive,
		answered: view.answered === view.count
	});
	return quoted(els, paintLines(els, rows, {
		press: actions ? press : void 0,
		width: room
	}), {
		key: "round-closing",
		width,
		rail: rail === "success" ? "answered" : rail === "dim" ? "quiet" : "bright"
	});
}
/** One blank row between the blocks of a terminal reply. */
const spacer = (els) => paintLines(els, [blank()]);
/** A passage of the reply the engine sets, as wide as the room. */
const preamble = (els, columns, text) => paintLines(els, [markdown(text, 0, columns)], { width: columns });
const ROUND_FOCUS = "round-current";
const shortcuts = "abcdefghijklmnopqrstuvwxyz";
/**
* The guide above the prompt while the cards have the keys. The host sends unmatched printable
* keys back to the prompt, so while the band has the keys every letter is bound, and every digit
* so a row answers by its place on screen.
*/
function controlBar(els, current, home, press) {
	const { view } = current;
	const item = view.item;
	const letters = item?.entries.flatMap((entry, i) => entry.kind !== "write" && isKey(entryLetter(entry, i)) ? [entryLetter(entry, i)] : []).sort() ?? [];
	const write = item ? writeLetter(item) : "";
	const first = letters[0]?.charCodeAt(0) ?? 0;
	const picks = letters.length > 1 && letters.every((c, i) => c.charCodeAt(0) === first + i) ? `${letters[0]}–${letters.at(-1)}` : letters.join("");
	const position = view.isReview ? `Review  ${view.answered}/${view.count} answered` : `${view.item?.label}/${view.count}`;
	const hint = (hotkey, label) => [span(`${hotkey} ${label}`, { role: "dim" })];
	/** The parts of one row, a cell apart. */
	const row = (parts) => line(parts.flatMap((part, i) => i ? [span(" "), ...part] : part));
	const painted = (parts) => stack(els, paintLines(els, [row(parts)], {
		press: (name) => name === "round-current" ? home() : void 0,
		autoFocus: ROUND_FOCUS
	}), hotkeys(els, Array.from(`${shortcuts}${POSITIONS}`, (key) => ({
		key,
		press: () => press(key)
	}))));
	const here = [span(position.padEnd(Math.max(6, cellWidth(`Q${view.count}/${view.count}`))), {
		role: "accent",
		bold: true,
		hit: ROUND_FOCUS
	})];
	if (!current.hasKeys) return painted([here, hint("alt+a", "for the keys")]);
	if (view.isReview) return painted([
		[span(position, {
			role: "accent",
			bold: true
		})],
		hint("jk", "move"),
		[span(`enter ${view.reply ? "fill" : "first question"}`, { hit: ROUND_FOCUS })],
		hint("n", "note"),
		hint("r", "back"),
		[span("keys here", { role: "dim" })]
	]);
	return painted([
		here,
		hint("jk", "move"),
		...picks ? [hint(picks, "pick")] : [],
		hint(write, "write"),
		hint("n", "note"),
		hint("r", "review"),
		[span("keys here", { role: "dim" })]
	]);
}
/**
* The terminal's writer above the prompt: the question and, for a note, its answer, the engine's
* field and Save and Cancel. `input` is the field, which stands alone on its rows.
*/
function writerBand(els, columns, o) {
	const one = (text) => clamp(text, Math.max(1, columns - 6), { max: 1 }).join("");
	const rows = [
		line([span(one(o.caption), {
			role: "accent",
			bold: true
		})]),
		...o.answer ? [line([span(one(o.answer), { role: "dim" })])] : [],
		slotLine({
			kind: "input",
			lead: [],
			width: columns,
			rows: o.rows
		}),
		line([
			span("Save", {
				role: "dim",
				hit: "keep"
			}),
			span("  "),
			span("Cancel", {
				role: "dim",
				hit: "cancel"
			}),
			...o.isWaiting ? [span("  "), span(`Click field or ${o.chord}`, { role: "dim" })] : []
		])
	];
	return paintLines(els, rows, {
		press: (name) => name === "keep" ? o.save() : o.cancel(),
		width: columns,
		input: o.input
	});
}
/** What a press on a transcript card's control does, by its `hit`. */
function roundPress(actions, writing, count) {
	return (name) => {
		const own = writing?.act[name];
		if (own) return own();
		if (name === "review") return actions.go(count);
		if (name === "send") return actions.send();
		if (name === "fill") return actions.fill();
		if (name === "round-note") return actions.edit(count, "note");
		const answer = /^review-answer-(\d+)$/.exec(name);
		if (answer) return actions.go(Number(answer[1]));
		const card = /^question-(\d+)-(choose|write|note|clear|accept)(?:-(\d+))?$/.exec(name);
		if (!card) return void 0;
		const question = Number(card[1]);
		if (card[2] === "choose") return actions.pick(question, Number(card[3]));
		if (card[2] === "write" || card[2] === "note") return actions.edit(question, card[2]);
		return card[2] === "clear" ? actions.clear(question) : actions.accept(question);
	};
}
/** One question of the transcript, as the surface draws it: its heading, answers, field and actions. */
function question$1(g, held, index, actions, writing, sent) {
	const show = view$5(held.form, {
		...held.draft,
		step: index
	});
	const item = show.item;
	if (!item) return null;
	const prefix = `question-${index}`;
	const answered = show.review[index]?.isAnswered;
	const mine = writing?.question === index ? writing : void 0;
	const choices$2 = item.entries.flatMap((entry, i) => {
		if (entry.kind === "write") return [];
		const option = {
			tag: entryLetter(entry, i),
			label: entry.kind === "accept" ? entry.text : labelOf(entry.text)
		};
		return [{
			key: actions ? option.tag : "",
			text: option.label,
			aside: entry.isRecommended ? "Recommended" : void 0,
			detail: entry.detail || void 0,
			chosen: entry.isChosen,
			multiple: item.isSeveral,
			answered,
			hit: `${prefix}-choose-${i}`
		}];
	});
	const written = item.written ? notice(g, {
		text: [span("Answer: ", {
			bold: true,
			role: sent ? "success" : void 0
		}), span(item.written)],
		status: "text"
	}) : null;
	const write = mine?.field === "write" ? choice(fieldEvents(g, eventsOf(mine)), {
		key: writeLetter(item),
		text: mine.value,
		literal: true,
		chosen: true,
		hit: mine.hit,
		...mine.props
	}) : actions ? choice(g, {
		key: writeLetter(item),
		text: item.written ? "Edit answer" : "Write your own answer",
		chosen: Boolean(item.written),
		hit: `${prefix}-write`
	}) : null;
	const note$2 = mine?.field === "note" ? note(fieldEvents(g, eventsOf(mine)), {
		value: mine.value,
		hit: mine.hit,
		...mine.props
	}) : item.note ? notice(g, {
		text: `Note: ${item.note}`,
		status: "dim"
	}) : null;
	const controls = actions ? [
		...mine?.field === "note" ? [] : [{
			hotkey: "",
			label: item.note ? "Edit note" : "Add note",
			hit: `${prefix}-note`
		}],
		...answered && mine?.field !== "write" ? [{
			hotkey: "",
			label: "Clear answer",
			hit: `${prefix}-clear`
		}] : [],
		...takesMany(item) ? [{
			hotkey: "",
			label: `Take ${item.accepts}`,
			hit: `${prefix}-accept`,
			isLiteral: true
		}] : []
	] : [];
	return column(g, { key: `${prefix}-card` }, column(g, { gap: "xs" }, heading(g, {
		label: item.label,
		title: item.title,
		answered
	}), item.body ? prose(g, { text: item.body }) : null, item.recommended ? prose(g, {
		text: `**Recommended:** ${item.recommended}`,
		isDim: true
	}) : null), column(g, { gap: "sm" }, choices$2.length ? choices(g, choices$2) : null, write), mine?.field === "write" ? buttonRow(g, { rows: [mine.buttons] }) : written, note$2, mine?.field === "note" ? buttonRow(g, { rows: [mine.buttons] }) : null, buttonRow(g, { rows: [controls] }));
}
/**
* The transcript's cards and reply controls. Where the host can jump to a card by key,
* offer a review with links back to its answers; otherwise end with the count and reply buttons.
*/
function nativeRound(g, held, current, actions, writing, sent = false, epilogue = "") {
	const view = current?.view ?? view$5(held.form, held.draft);
	const open = sent || (current ? view.isReview : true);
	const reply = actions && view.reply ? [{
		hotkey: "",
		label: "Send reply",
		hit: "send",
		isLit: true
	}, {
		hotkey: "",
		label: "Fill prompt",
		hit: "fill"
	}] : [];
	const count = closing(g, {
		answered: view.answered,
		total: view.count,
		sent
	});
	const cards = held.form.items.map((_, index) => question$1(g, held, index, actions, writing, sent));
	const foot = !can(g, "transcriptKeyScroll") ? [
		count,
		view.note ? notice(g, {
			text: `Round note: ${view.note}`,
			status: "dim"
		}) : null,
		buttonRow(g, { rows: [reply] })
	] : [
		count,
		actions ? buttonRow(g, { rows: [[{
			hotkey: "",
			label: open ? "Hide review" : "Review answers",
			hit: "review"
		}]] }) : null,
		...open ? [
			column(g, { gap: "sm" }, ...view.review.map((row, i) => summary(g, {
				label: row.label,
				title: row.title,
				values: row.isAnswered ? [{
					text: row.shown,
					literal: true
				}] : [],
				note: row.note,
				hit: actions ? `review-answer-${i}` : void 0
			}))),
			writing?.question === view.count ? note(fieldEvents(g, eventsOf(writing)), {
				value: writing.value,
				hit: writing.hit,
				...writing.props
			}) : view.note ? notice(g, {
				text: `Round note: ${view.note}`,
				status: "dim"
			}) : null,
			writing?.question === view.count ? buttonRow(g, { rows: [writing.buttons] }) : actions ? buttonRow(g, { rows: [[{
				hotkey: "",
				label: view.note ? "Edit round note" : "Add round note",
				hit: "round-note"
			}, ...reply.toReversed()]] }) : null
		] : []
	];
	return column(g, { gap: "md" }, ...cards, epilogue ? prose(g, { text: epilogue }) : null, column(g, {
		key: "round-closing",
		gap: "sm"
	}, ...foot));
}

// ../../lib/kits/band/src/internal.ts
/** The meaning each status marks the band with on a graphical surface. */
const statusMeaning = (status) => `state:${status}`;

// ../../lib/kits/band/src/model.ts
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
function view$1(model, surface) {
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
			label: capital(model.hint),
			hit: model.hit
		}, ...actions].map((b) => ({
			label: capital(b.label),
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
function statusBand(g, b) {
	const { Box, Button } = g.els;
	const v = view$1(b, g.surface);
	const { across } = tokens.gui;
	const isOneLine = Boolean(b.isOneLine);
	const mark = v.mark ? meaning(g, v.mark) : null;
	const words = /* @__PURE__ */ h(Box, {
		flexShrink: 1,
		flexGrow: isOneLine ? 1 : void 0
	}, typed$1(g, "body", v.text, { wrap: isOneLine ? "truncate-end" : void 0 }));
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

// ../../lib/kits/frame/src/model.ts
/**
* The frame's view model: what its head, its footer and its notice are on a surface. Pure and
* plain: the graphical drawing reads it, and so does the snapshot that holds it across surfaces.
* The footer is decided by the buttons' view model (`@agents/kit-buttons/model.ts`), which
* says what is lit and what goes quiet while Close asks. A frame has one lit button: the head's
* own actions come first, so the footer's lit one is quieted where they have one. No host imports.
*/
const words = (spans) => textOf({ spans: [...spans ?? []] });
function view(model, surface) {
	const isCells = holds(surface, "cells");
	const asks = !!model.close?.confirming;
	const hasCaption = (model.caption?.length ?? 0) > 0;
	const keep = model.close?.keep ?? "esc";
	const [acts = [], ...footer] = settle([model.actions ?? [], ...model.footer ?? []], asks);
	return {
		head: {
			title: isCells ? hasCaption ? void 0 : model.title : model.title && model.title !== model.hostTitle ? model.title : void 0,
			caption: words(model.caption),
			close: asks ? "question" : isCells ? "control" : "host",
			question: asks ? view$4({
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
			actions: !isCells && !asks && acts.length ? view$4({ rows: [acts] }, surface) : void 0
		},
		footer: view$4({
			rows: footer,
			confirming: asks
		}, surface),
		notice: words(model.notice)
	};
}

// ../../lib/kits/frame/src/gui.tsx
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
	}, v.head.title ? typed$1(g, "heading", v.head.title) : null, v.head.caption ? spans(g, f.caption ?? [], { type: "caption" }) : null) : null);
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
/**
* A frame's top: the pane's toolbar line. Its title is the `heading` and left out where it
* repeats `hostTitle`; a `caption` follows it as a `caption`. Close is the host's, so it appears
* only as the question it asks, with Discard and Keep.
*/
function frameTop(g, f) {
	return head(g, f, view(asModel(f), g.surface));
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
* Leaves only `plugin`'s own rows in an `AbovePromptList` event: an open form has the band to
* itself. Return it from the hook in place of `next(e)`'s input.
* @param e The event's input, with `props.rows`.
*/
function onlyOwnRows(e, plugin) {
	const rows = e.props.rows.filter((r) => r.plugin === plugin);
	return {
		...e,
		props: {
			...e.props,
			rows
		}
	};
}

// src/claude.tsx
const singleLineEditor = (surface) => surface !== "terminal" && holds(surface, "inputRows:1");
const PLUGIN = "answer";
const WRITE = "write";
const NOTE = "note";
/**
* A field's address; a key row button is already called `note`. An Input keeps what was typed
* until it is drawn with another value, so each opening gets an address of its own: one opened
* after a cancel would otherwise come back holding the cancelled text.
*/
const hitOf = (field) => `${field}-field-${opened}`;
/** The kit keys a field's Input from its hit; the terminal's Input is keyed alike. */
const keyOf = (field) => `${field}:${hitOf(field)}`;
let opened = 0;
const CHORD = "alt+a";
const current = atom({
	plugin: "answer",
	key: "current"
}, null, { shape: "current-11" });
/** The round a send set aside, for `/answer` to bring back. */
const aside = atom({
	plugin: "answer",
	key: "aside"
}, null, { shape: "aside-1" });
const transcript = atom({
	plugin: "answer",
	key: "transcript"
}, {}, { shape: "transcript-1" });
/** Origins that are the person speaking; a task's notification or a peer's message isn't. */
const PERSON = /* @__PURE__ */ new Set([
	"composer",
	"bridge",
	"sdk",
	"slack-ping"
]);
/**
* What a field holds that Enter hasn't saved, null while untouched. A button that leaves
* the item saves it first: a click must not lose what was typed.
*/
let typed = null;
/** The band's id for `$.ui.focus`, known once it has drawn. */
let band;
/** When a note was last asked for; the press that picked its answer moves the ring just after. */
let askedAt = 0;
const CLICK_MS = 500;
const transcriptRows = /* @__PURE__ */ new Map();
const complain = ($, error) => $.ui.log(`answer: ${String(error)}`, { to: "debug" });
/** What is held over what was shown: the same item keeps its field and mode, the same form stays open. */
const over = (c, held) => {
	const view = view$5(held.form, held.draft);
	const isSameForm = c?.view.id === view.id;
	const isSameItem = isSameForm && c?.view.step === view.step;
	return {
		held,
		view,
		editing: isSameItem ? c?.editing ?? null : null,
		isOpen: isSameForm ? c?.isOpen ?? false : false,
		filled: isSameForm ? c?.filled ?? null : null,
		filledRound: isSameForm ? c?.filledRound : void 0,
		transcript: isSameForm ? c?.transcript : void 0,
		writer: isSameItem ? c?.writer : void 0,
		hasKeys: isSameForm ? c?.hasKeys ?? false : false,
		pending: isSameItem ? c?.pending : void 0,
		reviewFrom: isSameForm ? c?.reviewFrom : void 0
	};
};
const edit = ($, fn) => update($, current, (c) => c ? fn(c) : c);
/** Moves the focus ring; the keyboard is the person's to give, so a band without it is left be. */
const focus = async ($, key) => band ? $.ui.focus({
	requestId: band,
	key
}).catch(() => void 0) : void 0;
/** Only a focus that moved into the band says it holds the keyboard; nothing reports it leaving. */
async function keysHeld($) {
	await edit($, (c) => c && !c.hasKeys ? {
		...c,
		hasKeys: true
	} : c);
}
/**
* A press in the transcript gives the prompt the keys. Keep the field visible but mark it as
* waiting for focus again.
*/
async function pressElsewhere($, id) {
	let wasWriting = false;
	await update($, current, (was) => {
		if (was?.transcript !== id) return was;
		const writer = was.writer?.surface === "terminal" ? was.writer : void 0;
		wasWriting = Boolean(writer && was.editing);
		return {
			...was,
			hasKeys: false,
			writer: void 0,
			editing: writer ? null : was.editing,
			pending: writer && was.editing ? {
				from: writer.from,
				field: was.editing
			} : void 0
		};
	});
	return wasWriting;
}
/** The ring's place on what is shown: the answer or the recommendation, or the review's button. */
/** The Button of an answer: the kit keys a letter's Button from its `hit`. */
const answerKey = (entry) => `key:e${entry}`;
const home = (view) => view.item ? answerKey(view.item.start) : "fill";
/** One step of the draft, and what it now shows; null with no form to step. */
async function step($, action) {
	typed = null;
	const shown = (await read$1($, current))?.view.id;
	return (await update($, current, (was) => was ? {
		...over(was, step$1(was.held, action, shown)),
		editing: null
	} : was))?.view ?? null;
}
async function move($, action) {
	const view = await step($, action);
	if (!view) return;
	await focus($, home(view));
}
/** Saves a field's typing as Enter there would; false when it couldn't be saved. */
async function keepTyped($) {
	const held = typed;
	if (!held) return true;
	return Boolean(await step($, {
		do: held.field,
		text: held.text
	}));
}
/** Leaves the shown item for another by a button, keeping what a field held. */
async function leave($, to) {
	const c = await read$1($, current);
	if (c && await keepTyped($)) await move($, to(c.view.step));
}
/** Opens a field and hands it the ring: a note under its answer, or the write-in. */
async function askAbout($, editing) {
	typed = null;
	opened++;
	await edit($, (c) => ({
		...c,
		editing
	}));
	if (editing === NOTE) askedAt = await $.clock.now();
	for (let tries = 0; tries < 4; tries++) {
		if (!(await focus($, keyOf(editing)))?.deny) return;
		await $.clock.sleep(60);
	}
}
/** Enter in the note: kept, and an answered question goes on to the next one unanswered. */
async function keepNote($, text) {
	const view = await step($, {
		do: "note",
		text
	});
	if (!view) return;
	if (view.item?.entries.some((entry) => entry.isChosen)) await move($, { do: "next" });
	else await focus($, home(view));
}
/**
* A press on an answer. A new one is taken and opens its note; a press on the answer already
* taken goes on to the next question, so a second click is the way on and no timer is needed.
* The write-in opens its field.
*/
async function choose($, entry, index) {
	if (entry.kind === "write") return askAbout($, WRITE);
	const c = await read$1($, current);
	if (!c) return;
	if (typed?.field === NOTE && !await keepTyped($)) return;
	if (entry.isChosen && !c.view.item?.isSeveral) return move($, { do: "next" });
	await focus($, answerKey(index + 1));
	if (await step($, {
		do: "pick",
		entry: index
	})) await askAbout($, NOTE);
}
/** Takes the question's recommendation, whatever it names, and goes on. */
async function accept($) {
	if (await step($, { do: "accept" })) await move($, { do: "next" });
}
/** Opens the graphical form and hands it the ring. */
async function openForm($) {
	const c = await read$1($, current);
	if (!c) return;
	await edit($, (was) => ({
		...was,
		isOpen: true
	}));
	await focus($, home(c.view));
}
/** The reply above what the person had typed, never over it. */
const placeReply = (draft, text) => draft.trim() ? `${text}\n\n${draft}` : text;
/** What the person typed themselves: the prompt's text less the reply an earlier fill put on it. */
const ownDraft = (text, filled) => filled && text.startsWith(filled) ? text.slice(filled.length).replace(/^\n+/, "") : text;
/**
* Whether a send carries the round's own reply: the text is what the reply says, or what the
* form filled with the person's draft left under it (a fill puts the reply above the draft).
*/
const isOwnReply = (c, text) => [c.view.reply, c.filled ?? ""].some((reply) => reply !== "" && (text === reply || text.startsWith(`${reply}\n`)));
/** What a send that sets the round aside says, counting the answers it keeps. */
const asideNotice = (answered) => answered ? `${answered} answer${answered === 1 ? "" : "s"} set aside: /answer brings them back.` : "Answers set aside: /answer brings them back.";
/** Folds the form back to its row, the answers kept. */
async function close($) {
	typed = null;
	await edit($, (was) => ({
		...was,
		isOpen: false,
		editing: null,
		pending: void 0
	}));
}
/**
* A user message the person didn't write: a slash command's record, another session's
* message or a background task's news. The transcript's messages carry no origin, so
* this goes by the wrapper each arrives in.
*/
const isNotPerson = (text) => /^\s*<(command-|local-command-|task-notification)/.test(text) || text.includes("<cross-session-message ");
/**
* The round a resumed session came back to. `turn.complete` fired in the process before
* this one, so the round is read from the transcript: the newest reply that holds one,
* past any turn something other than the person started, as a live session keeps a round
* through those. One the person has spoken after is left alone.
*/
async function recover($) {
	if (await read$1($, current)) return;
	const messages = await $.session.messages();
	if (!Array.isArray(messages)) return;
	for (const message of [...messages].reverse()) {
		if (message.role === "assistant") {
			const held = message.text ? offer(null, message.text) : null;
			if (!held) continue;
			const id = await captureRound($, held, message.text, formId(held.form), message, false);
			await update($, current, (c) => c ?? {
				...over(null, held),
				transcript: id
			});
			return;
		}
		if (!message.toolResults?.length && !isNotPerson(message.text)) return;
	}
}
/**
* `/answer`: on a terminal it brings the shown question's card into view; on a graphical surface
* it opens the form, or folds it when it is already up. A round set aside comes back.
*/
async function toggle($) {
	let c = await read$1($, current);
	if (c?.writer) return;
	if (!c) {
		const was = await read$1($, aside);
		if (was) {
			await update($, aside, () => null);
			c = await update($, current, () => ({
				...over(null, was),
				transcript: was.transcript
			}));
		}
	}
	if (!c) await recover($).catch((error) => complain($, error));
	c ??= await read$1($, current);
	if (!c) {
		$.ui.toast("Nothing to answer: the last turn asked no questions.");
		return;
	}
	if (!(await $.session.surfaces().catch(() => [])).includes("terminal")) await (c.isOpen ? close($) : openForm($));
	else if (!c.transcript) $.ui.toast("The round's message is not in the transcript to answer.");
	else {
		await $.clock.sleep(60);
		await revealRound($, c.transcript, c.view.step, "start").catch(() => void 0);
	}
}
/** Writes the reply into the prompt for the person to send: above their draft, in place of an earlier fill. */
async function fill($, text) {
	const c = await read$1($, current);
	const box = await $.prompt.read();
	const { isFilled } = await $.prompt.fill({
		text: placeReply(ownDraft(box.text, c?.filled ?? null), text),
		mode: "replace"
	});
	if (isFilled) {
		typed = null;
		await edit($, (was) => !c || was.view.id !== c.view.id || was.transcript !== c.transcript ? was : {
			...was,
			isOpen: false,
			editing: null,
			filled: text,
			filledRound: c.transcript ? c.held : void 0,
			hasKeys: false,
			pending: void 0
		});
	}
	return isFilled;
}
/**
* Sends the reply as the person's message, leaving what they had typed in the prompt. The
* round is answered, so it is dropped as their own send would drop it; a submit the engine
* refuses puts the round and the box back as they were.
*/
async function send($, text) {
	const c = await read$1($, current);
	if (!c) return false;
	const box = await $.prompt.read();
	const draft = ownDraft(box.text, c.filled);
	typed = null;
	await update($, current, () => null);
	await $.prompt.fill({
		text: "",
		mode: "replace"
	}).catch(() => void 0);
	if (!await $.prompt.submit({
		text,
		...c.transcript ? { asUser: true } : {}
	}).then((result) => !("drop" in result), (error) => {
		complain($, error);
		return false;
	})) {
		await update($, current, () => c);
		await update($, aside, () => null);
		await $.prompt.fill({
			text: box.text,
			mode: "replace"
		}).catch(() => void 0);
		$.ui.toast("The message didn't send: the answers are still here.");
		return false;
	}
	if (draft) await $.prompt.fill({
		text: draft,
		mode: "replace"
	}).catch(() => void 0);
	return true;
}
async function recentMessages($, last) {
	const range = {
		as: void 0,
		last
	};
	const messages = await $.session.messages(range).catch(() => $.session.messages());
	return Array.isArray(messages) ? messages : [];
}
async function captureRound($, held, answer, turnId, recovered, place = true) {
	const message = recovered ?? (await recentMessages($, 24)).findLast((row) => row.role === "assistant" && row.text.trim() === answer.trim());
	if (!message) return;
	const id = message.uuid ?? turnId;
	const starts = startLines(message.text);
	if (starts.length !== held.form.items.length) return;
	const preamble = message.text.replace(/\r\n?/g, "\n").split("\n").slice(0, starts[0]).join("\n").trimEnd();
	const placed = [];
	if (place && (await $.session.surfaces()).includes("terminal")) for (let index = 0; index <= starts.length; index++) {
		const row = await $.ui.place({ id: `round-${id}-${index}` });
		if (!row.isPlaced) break;
		placed.push(row.requestId);
	}
	const anchors = placed.length === starts.length + 1 ? placed : [id];
	await update($, transcript, (rounds) => ({
		...rounds,
		[id]: {
			source: message.text.trim(),
			preamble,
			epilogue: tailOf(message.text),
			anchors,
			matchByText: !message.uuid
		}
	}));
	return id;
}
async function findRound($, surface, requestId, text) {
	const rounds = await read$1($, transcript);
	const direct = rounds[requestId];
	if (direct) return {
		id: requestId,
		round: direct
	};
	const key = `${surface}:${requestId}`;
	const source = text.trim();
	const known = transcriptRows.get(key);
	if (known && rounds[known]?.source === source) return {
		id: known,
		round: rounds[known]
	};
	const claimed = new Set(Array.from(transcriptRows).flatMap(([row, id]) => row.startsWith(`${surface}:`) ? [id] : []));
	const match = Object.entries(rounds).findLast(([id, round]) => (surface !== "terminal" || round.matchByText) && !claimed.has(id) && round.source === source);
	if (!match) return;
	const [id, round] = match;
	transcriptRows.set(key, id);
	return {
		id,
		round
	};
}
async function freezeRound($, c, submitted) {
	const id = c.transcript;
	if (!id) return;
	await update($, transcript, (rounds) => rounds[id] ? {
		...rounds,
		[id]: {
			...rounds[id],
			frozen: submitted ?? c.held,
			sent: submitted ? true : void 0
		}
	} : rounds);
}
async function revealRound($, id, index, block = "nearest") {
	const round = (await read$1($, transcript))[id];
	const requestId = round?.anchors[index] ?? round?.anchors[0];
	if (requestId) await $.ui.scroll({
		to: { requestId },
		block
	});
}
async function changeRound($, id, index, action) {
	return update($, current, (c) => {
		if (c?.transcript !== id || c.writer) return c;
		const here = over(c, step$1(c.held, {
			do: "go",
			step: typeof index === "number" ? index : index(c.view)
		}));
		if (action && typeof action === "object" && "letter" in action) {
			const entry = here.view.item?.entries.findIndex((row, i) => row.kind !== "write" && entryLetter(row, i) === action.letter);
			return entry === void 0 || entry < 0 ? here : over(here, step$1(here.held, {
				do: "pick",
				entry
			}));
		}
		return action ? over(here, step$1(here.held, action)) : here;
	});
}
async function moveRound($, id, surface, index) {
	const c = await changeRound($, id, index);
	if (surface === "terminal" && c?.transcript === id && !c.writer) await revealRound($, id, c.view.step, c.view.isReview ? "start" : "nearest");
}
async function writeRound($, id, index, field, surface, from = index, isPress = false) {
	if (surface === "terminal" && isPress) {
		typed = null;
		opened++;
		await update($, current, (was) => {
			if (was?.transcript !== id || was.writer) return was;
			return {
				...over(was, step$1(was.held, {
					do: "go",
					step: index
				})),
				editing: null,
				writer: void 0,
				hasKeys: false,
				pending: {
					from,
					field
				}
			};
		});
		return;
	}
	const c = await update($, current, (was) => {
		if (was?.transcript !== id || was.writer) return was;
		typed = null;
		opened++;
		return {
			...over(was, step$1(was.held, {
				do: "go",
				step: index
			})),
			editing: field,
			writer: {
				from,
				surface
			},
			hasKeys: surface === "terminal" ? true : was.hasKeys,
			pending: void 0
		};
	});
	if (surface === "terminal" && c?.transcript === id && c.writer) await focus($, keyOf(field));
}
function savedField(c) {
	return c.editing === NOTE ? c.view.item?.note ?? c.view.note : c.view.item?.written ?? "";
}
async function finishWriting($, id, text) {
	const before = await read$1($, current);
	const surface = before?.writer?.surface ?? (before?.pending ? "terminal" : void 0);
	const c = await update($, current, (was) => {
		if (was?.transcript !== id) return was;
		const field = was.editing ?? was.pending?.field;
		const from = was.writer?.from ?? was.pending?.from;
		if (!field || from === void 0) return was;
		const draft = text === void 0 ? was.held : step$1(was.held, {
			do: field,
			text
		});
		const held = step$1(draft, {
			do: "go",
			step: from
		});
		typed = null;
		return {
			...over(was, held),
			writer: void 0,
			editing: null,
			pending: void 0
		};
	});
	if (surface === "terminal" && c?.transcript === id && !c.writer) {
		await focus($, ROUND_FOCUS);
		if (c.view.isReview) await revealReview($, id, c);
		else await revealRound($, id, c.view.step);
	}
}
async function replyToRound($, id, surface, action) {
	const c = await read$1($, current);
	if (c?.transcript !== id || c.writer || !c.view.reply) return;
	if (action === "fill") await fill($, c.view.reply);
	else {
		await freezeRound($, c);
		const sent = await send($, c.view.reply);
		if (sent) await freezeRound($, c, c.held);
		if (sent && surface === "terminal") {
			await $.clock.sleep(60);
			const messages = await recentMessages($, 8);
			const sentAt = messages.findLastIndex((row) => row.role === "user" && row.text === c.view.reply);
			if (sentAt < 0) return;
			const requestId = messages.slice(sentAt).findLast((row) => row.uuid)?.uuid;
			if (requestId) await $.ui.scroll({
				to: { requestId },
				block: "end"
			});
		}
	}
}
function roundActions($, id, surface) {
	const press = async (run) => {
		if (surface === "terminal") {
			if (await pressElsewhere($, id)) return;
		} else {
			const c = await read$1($, current);
			if (c?.transcript !== id) return;
			if (c.writer) await finishWriting($, id, typed?.field === c.editing ? typed?.text : void 0);
		}
		return run();
	};
	const edit = (question, field, from) => press(() => writeRound($, id, question, field, surface, from ?? question, true));
	return {
		go: (index) => press(async () => {
			const c = await read$1($, current);
			if (c?.transcript !== id) return;
			if (index === c.view.count) return toggleReview($, id, surface);
			await moveRound($, id, surface, index);
			if (c.view.isReview && surface !== "terminal" && holds(surface, "transcriptKeyScroll")) await $.ui.scroll({
				to: { key: `question-${index}-card` },
				block: "start"
			}).catch(() => void 0);
		}),
		pick: (question, entry) => press(() => changeRound($, id, question, {
			do: "pick",
			entry
		})),
		edit,
		clear: (question) => press(() => changeRound($, id, question, { do: "clear" })),
		accept: (question) => press(() => changeRound($, id, question, { do: "accept" })),
		fill: () => press(() => replyToRound($, id, surface, "fill")),
		send: () => press(() => replyToRound($, id, surface, "send")),
		top: () => press(() => toTop($, id, surface))
	};
}
/** The first question, scrolled to the top of the round. */
async function toTop($, id, surface) {
	const c = await changeRound($, id, 0);
	if (surface === "terminal" && c?.transcript === id && !c.writer) await revealRound($, id, 0, "start").catch(() => void 0);
}
async function revealReview($, id, c) {
	const round = (await read$1($, transcript))[id];
	const requestId = round?.anchors[c.view.count] ?? round?.anchors[0];
	if (!requestId) return;
	const closing = await $.ui.scroll({
		to: { key: "round-closing" },
		block: "nearest"
	}).catch(() => void 0);
	if (closing && !closing.deny) return;
	await $.ui.scroll({
		to: { requestId },
		block: "start"
	}).catch(() => void 0);
}
async function toggleReview($, id, surface = "terminal") {
	const c = await update($, current, (was) => {
		if (was?.transcript !== id || was.writer) return was;
		if (was.view.isReview) return over(was, step$1(was.held, {
			do: "go",
			step: was.reviewFrom ?? 0
		}));
		return {
			...over(was, step$1(was.held, {
				do: "go",
				step: was.view.count
			})),
			reviewFrom: was.view.step
		};
	});
	if (c?.transcript !== id || c.writer || surface !== "terminal") return;
	if (c.view.isReview) await revealReview($, id, c);
	else await revealRound($, id, c.view.step);
}
/**
* A key on the last step: `k` goes back to the last question, `n` writes the round's note, Enter
* fills the prompt.
*/
async function pressReview($, id, c, key) {
	if (key === "k") return moveRound($, id, "terminal", c.view.count - 1);
	if (key === "n") return writeRound($, id, c.view.count, NOTE, "terminal");
	if (!c.hasKeys) return;
	if (c.view.reply && (key === "f" || key === "enter")) return replyToRound($, id, "terminal", "fill");
	if (key === "enter") return toTop($, id, "terminal");
}
/**
* What a digit presses: the row at that place on screen, counting from the top of what is drawn:
* an option or the write-in. A click on the row does the same, so a number answers wherever the
* letters do. The last step has no rows to number.
*/
async function pressRowAt($, id, c, at) {
	const { view } = c;
	if (view.isReview) return;
	const entry = view.item?.entries[at];
	if (!entry) return;
	if (entry.kind === "write") return writeRound($, id, view.step, WRITE, "terminal");
	return changeRound($, id, view.step, {
		do: "pick",
		entry: at
	});
}
async function pressRoundKey($, id, key) {
	const c = await read$1($, current);
	if (c?.transcript !== id || c.writer) return;
	if (key === "r") return toggleReview($, id);
	const at = rowOf$1(key);
	if (at >= 0) return pressRowAt($, id, c, at);
	if (c.view.isReview) return pressReview($, id, c, key);
	if (key === "j" && c.view.step === c.view.count - 1) return toggleReview($, id, "terminal");
	if (key === "j" || key === "k") return moveRound($, id, "terminal", (view) => Math.max(0, Math.min(view.count - 1, view.step + (key === "j" ? 1 : -1))));
	if (key === "n") return writeRound($, id, c.view.step, NOTE, "terminal");
	if (c.view.item && key.toUpperCase() === writeLetter(c.view.item)) return writeRound($, id, c.view.step, WRITE, "terminal");
	if (c.view.item?.entries.some((entry, i) => entry.kind !== "write" && entryLetter(entry, i) === key.toUpperCase())) return changeRound($, id, (view) => view.step, { letter: key.toUpperCase() });
}
/** `text` with line `line` replaced: a one-line field's part of a longer text. */
function withLine(text, line, part) {
	const lines = text.split("\n");
	while (lines.length <= line) lines.push("");
	lines[line] = part;
	return lines.join("\n");
}
/**
* The field a graphical surface has open in the transcript: the field's options (what is typed is
* kept as it goes), and Save, Add line where the host's field is one line, and Cancel.
*/
function writingOf($, c) {
	const { view, editing, transcript: id, writer } = c;
	if (!id || !writer || !editing || writer.surface === "terminal") return null;
	const note = editing === NOTE;
	const saved = savedField(c);
	const value = () => typed?.field === editing ? typed.text : saved;
	const isSingleLine = singleLineEditor(writer.surface);
	/** What the field now holds, once `line` of it changed: the text whole. */
	const joined = (text, line) => line === void 0 ? text : withLine(value(), line, text);
	const lines = isSingleLine ? writer.lines ?? saved.split("\n").length : void 0;
	const addLine = () => edit($, (was) => was.transcript === id && was.view.step === view.step && was.editing === editing && was.writer?.surface === writer.surface ? {
		...was,
		writer: {
			...was.writer,
			lines: (was.writer.lines ?? saved.split("\n").length) + 1
		}
	} : was);
	return {
		question: view.step,
		field: editing,
		value: value(),
		hit: hitOf(editing),
		onInput: (text, line) => {
			typed = {
				field: editing,
				text: joined(text, line)
			};
		},
		onSubmit: (text, line) => finishWriting($, id, joined(text, line)),
		props: {
			invitation: note ? isSingleLine ? "Type a note" : "Add a condition or follow-up" : "Type an answer",
			autoFocus: !isSingleLine,
			lines,
			rows: isSingleLine ? void 0 : 3
		},
		buttons: [
			{
				hotkey: "",
				label: "Save",
				hit: "keep",
				isLit: true
			},
			...isSingleLine ? [{
				hotkey: "",
				label: "Add line",
				hit: "add-line"
			}] : [],
			{
				hotkey: "",
				label: "Cancel",
				hit: "cancel"
			}
		],
		act: {
			keep: () => finishWriting($, id, value()),
			"add-line": addLine,
			cancel: () => finishWriting($, id)
		}
	};
}
/**
* The terminal's writer, above the prompt: the field is the engine's, so it is drawn by the
* band and not the transcript.
*/
function writerOf($, els, columns, c, maxRows) {
	const { view, editing, transcript: id, writer } = c;
	if (!id || !writer || !editing) return null;
	const { Input } = els;
	const note = editing === NOTE;
	const saved = savedField(c);
	const value = () => typed?.field === editing ? typed.text : saved;
	const detail = view.item?.title ?? "Review answers";
	const answer = view.review[view.step];
	const hit = hitOf(editing);
	const field = ctxOf("claude-terminal", {
		input: (address, text) => {
			if (address === hit) typed = {
				field: editing,
				text
			};
		},
		submit: (address, text) => {
			if (address === hit) return finishWriting($, id, text);
		}
	});
	return writerBand(els, columns, {
		caption: view.item ? `${view.item.label}  ${detail}` : detail,
		answer: answer?.isAnswered && note ? answer.shown : void 0,
		input: /* @__PURE__ */ h(Input, {
			key: keyOf(editing),
			label: note ? "Note" : "Answer",
			rows: Math.min(2, Math.max(1, maxRows - 4)),
			autoFocus: true,
			value: value(),
			placeholder: note ? "Add a condition or follow-up" : "Write your own answer",
			submitLabel: "save",
			onInput: (text) => field.input(hit, text),
			onSubmit: (text) => field.submit(hit, text)
		}),
		rows: Math.min(2, Math.max(1, maxRows - 4)),
		isWaiting: Boolean(c.pending),
		chord: CHORD,
		save: () => finishWriting($, id, value()),
		cancel: () => finishWriting($, id)
	});
}
function roundBody(els, columns, held, current, index, actions, sent = false, epilogue = "") {
	if (index !== held.form.items.length) return questionCard(els, columns, held, index, current, actions);
	const closing = closingRow(els, columns, view$5(held.form, held.draft), current, current?.writer ? void 0 : actions, sent);
	return epilogue ? stack(els, preamble(els, columns, epilogue), spacer(els), closing) : closing;
}
/** The band's or pane's room in cells, as the event measured it. */
const columnsOf = (e) => Math.max(1, Math.floor(e.props?.bodyColumns ?? e.viewport?.columns ?? 80));
/** What each control of the graphical form does, by its `hit`. */
async function pressForm($, hit) {
	const c = await read$1($, current);
	if (!c) return;
	const { view } = c;
	const go = (to) => leave($, to);
	const index = (prefix) => Number(hit.slice(prefix.length));
	if (/^q\d+$/.test(hit)) return go(() => ({
		do: "go",
		step: index("q")
	}));
	if (/^item\d+$/.test(hit)) return go(() => ({
		do: "go",
		step: index("item")
	}));
	const entry = /^e\d+$/.test(hit) ? view.item?.entries[index("e")] : void 0;
	if (entry) return choose($, entry, index("e"));
	switch (hit) {
		case "answer": return openForm($);
		case "quit": return close($);
		case "review": return go(() => ({ do: "review" }));
		case "next": return go((shown) => ({
			do: "go",
			step: shown + 1
		}));
		case "accept": return accept($);
		case "skip": return move($, { do: "skip" });
		case "note": return askAbout($, NOTE);
		case "fill":
		case "send": {
			const held = typed;
			const kept = held ? await step($, {
				do: "note",
				text: held.text
			}) : view;
			if (!kept?.reply) return kept ? $.ui.toast("Nothing answered yet.") : void 0;
			return hit === "fill" ? fill($, kept.reply) : send($, kept.reply);
		}
	}
}
/**
* A graphical surface's form: the way out, the steps as tabs, then the question with its answers
* and note, or the review. A field is always drawn where it belongs, so a click lands in it: a
* press that reveals one would leave the focus on the press.
*/
function form($, c, base) {
	const { view, editing } = c;
	const { item } = view;
	/** What a field of the form does with what is typed, and with Enter. */
	const typing = (name, submit) => ({
		input: (text) => {
			typed = {
				field: name,
				text
			};
		},
		submit
	});
	const g = fieldEvents(base, {
		[hitOf(WRITE)]: typing(WRITE, (text) => move($, {
			do: "write",
			text
		})),
		[hitOf(NOTE)]: typing(NOTE, (text) => keepNote($, text))
	});
	const head = sections(g, frameTop(g, {
		title: view.title,
		actions: [{
			hotkey: "",
			label: "close",
			hit: "quit"
		}]
	}), steps(g, [...view.review.map((row, i) => ({
		short: row.label,
		done: row.isAnswered,
		current: !view.isReview && i === view.step,
		hit: `q${i}`
	})), {
		short: "Review",
		current: view.isReview,
		hit: "review"
	}]));
	/** An action of the row at the foot. */
	const act = (hit, label, isLit = false) => ({
		hotkey: "",
		label,
		hit,
		isLit
	});
	if (!item) return sections(g, head, ...view.review.map((row) => summary(g, {
		label: row.label,
		title: row.title,
		values: row.isAnswered ? [{
			text: row.shown,
			literal: true
		}] : [],
		note: row.note
	})), note(g, {
		value: view.note,
		hit: hitOf(NOTE),
		invitation: "Add a note on the whole round"
	}), buttonRow(g, { rows: [[act("send", "send", Boolean(view.reply)), act("fill", "fill the prompt")]] }));
	const several = item.isSeveral;
	const isChosen = item.entries.some((row) => row.isChosen);
	const isNoteShown = isChosen || editing === NOTE || !!item.note;
	const answered = view.review[view.step]?.isAnswered;
	const choices$1 = item.entries.map((row, k) => {
		if (row.kind === "write") return {
			key: "",
			text: item.written || row.text,
			literal: true,
			chosen: row.isChosen,
			answered,
			hit: hitOf(WRITE),
			invitation: row.text
		};
		return {
			key: entryLetter(row, k),
			text: row.kind === "accept" ? row.text : row.text.replace(/^[A-H0-9]{1,2}[.)]\s*/, ""),
			aside: row.isRecommended ? "Recommended" : void 0,
			detail: row.detail || void 0,
			chosen: row.isChosen,
			multiple: several,
			answered,
			hit: `e${k}`
		};
	});
	const body = [item.body, item.recommended ? `**Recommended:** ${item.recommended}` : ""].filter(Boolean).join("\n\n");
	return sections(g, head, heading(g, { title: item.title }), body ? prose(g, { text: body }) : null, choices(g, choices$1), isNoteShown ? note(g, {
		value: item.note,
		hit: hitOf(NOTE),
		invitation: "Add a note"
	}) : null, buttonRow(g, { rows: [[
		act("skip", "skip"),
		...isChosen || isNoteShown ? [] : [act("note", "add note")],
		...item.canAccept && item.accepts.includes(",") ? [act("accept", `Take ${item.accepts}`)] : [],
		...isChosen || several ? [act("next", view.answered === view.count ? "Review" : "Next", isChosen)] : []
	]] }));
}
const register = (on) => {
	on("session.start", async ($, e, next) => {
		await $.command.register({
			name: "answer",
			description: "Answer the questions or pick list the last turn ended on, from a form",
			immediate: true
		}).catch((error) => complain($, `/answer not registered: ${String(error)}`));
		const started = await next(e);
		await recover($).catch((error) => complain($, error));
		return started;
	});
	on("turn.complete", async ($, e, next) => {
		if (e.agentId !== void 0 || e.reason !== "answer") return next(e);
		const previous = await read$1($, current);
		if (previous?.writer) return next(e);
		const incoming = offer(null, e.answer);
		const id = incoming ? await captureRound($, incoming, e.answer, e.turnId).catch((error) => complain($, error)) : void 0;
		if (incoming && previous && previous.transcript !== id) await freezeRound($, previous);
		await update($, current, (c) => {
			const held = offer(c?.held ?? null, e.answer);
			if (!held) return null;
			const now = over(c, held);
			return id ? {
				...now,
				transcript: id
			} : now;
		}).catch((error) => complain($, error));
		return next(e);
	});
	on("prompt.submit", async ($, e, next) => {
		const c = PERSON.has(e.origin.kind) ? await read$1($, current) : null;
		if (!c) return next(e);
		if (c.transcript && c.writer && singleLineEditor(c.writer.surface) && e.origin.kind === "composer") return { drop: "Save or cancel the edit on the question card first" };
		if (e.origin.kind === "composer" && !e.command && c.transcript && c.pending && !c.pending.isWarned && e.text.trim()) {
			await edit($, (was) => was?.pending ? {
				...was,
				pending: {
					...was.pending,
					isWarned: true
				}
			} : was);
			$.ui.toast("An editor is waiting: click its field or press Alt+a. Send again to send your message.");
			return { drop: "The note is still waiting" };
		}
		const text = e.text;
		if (!text.trim()) return next(e);
		if (c.transcript) await freezeRound($, c);
		const own = isOwnReply(c, text);
		if (own) await update($, current, () => null);
		else {
			if (hasWork(c.held)) {
				await update($, aside, () => ({
					...c.held,
					transcript: c.transcript
				}));
				$.ui.toast(asideNotice(c.view.answered));
			}
			await update($, current, () => null);
		}
		const sent = await next(e);
		if (own && !("drop" in sent)) await freezeRound($, c, (c.filled && (text === c.filled || text.startsWith(`${c.filled}\n`)) ? c.filledRound : void 0) ?? c.held);
		return sent;
	}).catch((_$, e, next) => next.called ? void 0 : next(e));
	on("command.run", { command: "answer" }, async ($) => {
		await toggle($);
		return {};
	});
	on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
		const surface = e.surface;
		if (surface !== "terminal" && (!Object.hasOwn(surfaces, surface) || surfaces[surface].drawing !== "gui" || !holds(surface, "input"))) return next(e);
		if (e.props.isSummary) return next(e);
		const match = await findRound($, surface, e.requestId, e.props.text);
		if (!match) return next(e);
		const { id, round } = match;
		const c = await read$1($, current);
		const active = c?.transcript === id ? c : null;
		const held = active?.held ?? round.frozen;
		if (!held) return next(e);
		const els = $.ui.resolve(e);
		const actions = active ? roundActions($, id, surface) : void 0;
		return forSurface(e, {
			tui: () => {
				const columns = columnsOf(e);
				const cards = round.anchors.length > 1 ? [] : held.form.items.map((_, i) => i).concat(held.form.items.length);
				return stack(els, round.preamble ? preamble(els, columns, round.preamble) : null, ...cards.flatMap((index) => [round.preamble || index ? spacer(els) : null, roundBody(els, columns, held, active, index, actions, !active && round.sent, round.epilogue)]));
			},
			gui: () => {
				const writing = active?.writer?.surface === surface ? writingOf($, active) : null;
				const g = guiOf(els, e, actions && roundPress(actions, writing, held.form.items.length));
				return column(g, {
					gap: "sm",
					isMeasured: true
				}, round.preamble ? prose(g, { text: round.preamble }) : null, nativeRound(g, held, active, actions, writing, !active && round.sent, round.epilogue));
			}
		});
	});
	on("ui.render", { component: "Placed" }, async ($, e, next) => {
		if (e.surface !== "terminal" || e.props.plugin !== PLUGIN) return next(e);
		const match = Object.entries(await read$1($, transcript)).find(([, round]) => round.anchors.includes(e.requestId));
		if (!match) return next(e);
		const [id, round] = match;
		const index = round.anchors.indexOf(e.requestId);
		const c = await read$1($, current);
		const active = c?.transcript === id ? c : null;
		const held = active?.held ?? round.frozen;
		if (!held) return next(e);
		const actions = active ? roundActions($, id, "terminal") : void 0;
		return roundBody($.ui.resolve(e), columnsOf(e), held, active, index, actions, !active && round.sent, round.epilogue) ?? next(e);
	});
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);
		const c = await read$1($, current);
		if (!c) return next(e);
		band = e.requestId;
		const els = $.ui.resolve(e);
		if (e.surface === "terminal") {
			if (!c.transcript) return next(e);
			const columns = columnsOf(e);
			if (c.writer?.surface === "terminal") return writerOf($, els, columns, c, e.props.maxRows) ?? next(e);
			const id = c.transcript;
			if (c.pending) return writerOf($, els, columns, {
				...c,
				writer: {
					from: c.pending.from,
					surface: "terminal"
				},
				editing: c.pending.field
			}, e.props.maxRows) ?? next(e);
			return controlBar(els, c, () => c.view.isReview && c.hasKeys ? pressRoundKey($, id, "enter") : moveRound($, id, "terminal", (view) => view.step), (key) => pressRoundKey($, id, key));
		}
		if (c.transcript && !c.isOpen) return next(e);
		const g = guiOf(els, e, (hit) => pressForm($, hit));
		if (c.isOpen) return form($, c, g);
		const { view } = c;
		return statusBand(g, {
			text: view.title,
			hint: view.kind === "picks" ? "pick" : "answer",
			hit: "answer",
			words: view.answered ? `${view.title}, ${view.answered} of ${view.count} answered` : view.title,
			mark: "state:question"
		});
	});
	on("ui.render", {
		component: "AbovePromptList",
		plugin: "*"
	}, async ($, e, next) => {
		const c = await read$1($, current);
		if (e.props.hasSurvey || !(c?.isOpen || c?.pending || c?.writer?.surface === "terminal")) return next(e);
		return next(onlyOwnRows(e, PLUGIN));
	});
	on("ui.focus", async ($, e, next) => {
		const inBand = e.component === "AbovePrompt" && e.requestId === band;
		/** Only a move the chain allowed says the band has the keys. */
		const mark = async (moved) => {
			if (inBand && !moved.deny) await keysHeld($);
			return moved;
		};
		const c = e.component === "AbovePrompt" && e.origin.kind === "person" ? await read$1($, current) : null;
		if (inBand && c?.pending && e.element === keyOf(c.pending.field)) {
			const moved = await next(e);
			if (!moved.deny) await edit($, (was) => was.transcript === c.transcript && was.pending && e.element === keyOf(was.pending.field) ? {
				...was,
				writer: {
					from: was.pending.from,
					surface: "terminal"
				},
				editing: was.pending.field,
				pending: void 0,
				hasKeys: true
			} : was);
			return moved;
		}
		if (c?.transcript && !c.writer && e.element?.startsWith(keyAddress(""))) return mark(await next({
			...e,
			element: ROUND_FOCUS
		}));
		if (!c?.isOpen || !c.view.item || !e.element) return mark(await next(e));
		if (c.editing === NOTE && /^key:e\d+$/.test(e.element) && await $.clock.now() - askedAt < CLICK_MS) return mark(await next({
			...e,
			element: keyOf(NOTE)
		}));
		const moved = await next(e);
		if (moved.deny) return moved;
		if (c.editing === WRITE && e.element !== keyOf(WRITE) && typed === null) await edit($, (was) => ({
			...was,
			editing: null
		}));
		return mark(moved);
	}).catch((_$, e, next) => next.called ? void 0 : next(e));
	on("prompt.change", async ($, e, next) => {
		if (e.origin.kind !== "plugin") await edit($, (c) => c?.hasKeys ? {
			...c,
			hasKeys: false
		} : c);
		return next(e);
	});
};

export { register };