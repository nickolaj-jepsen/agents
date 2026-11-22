import { spawn } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { contentText } from "@earendil-works/pi-ai";

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
const MODEL = "anthropic/claude-haiku-5-5";
const CHECK_DELAY_MS = 300;
/** Lines one finding takes in the review: its kind, then the draft with the fix in place. */
const FINDING_LINES = 2;
/** Frame lines around the findings: two borders, the header's blank line, the hints. */
const CHROME_LINES = 6;
const MAX_FINDINGS = 9;
const CONTEXT = 28;
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
/** `findings` from hunspell's misses and the model's extras, at their first occurrence in the draft. */
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
* A rounded box whose every line is filled to `width`. Padding is what keeps
* the editor underneath from showing through the overlay's short lines.
*/
function box(theme, width, title, body) {
	const inner = Math.max(1, width - 2);
	const fill = (line) => truncateToWidth(line, inner, "…", true);
	const label = truncateToWidth(` ${title} `, inner);
	const rest = Math.max(0, inner - visibleWidth(label));
	const left = Math.floor(rest / 2);
	return [
		theme.fg("border", `╭${"─".repeat(left)}`) + theme.fg("accent", label) + theme.fg("border", `${"─".repeat(rest - left)}╮`),
		...body.map((line) => theme.fg("border", "│") + fill(` ${line}`) + theme.fg("border", "│")),
		theme.fg("border", `╰${"─".repeat(inner)}╯`)
	];
}
/** Splits `items` into rows joined by `sep` that fit `width` instead of truncating them. */
function rows(items, width, sep) {
	const out = [];
	let row = "";
	for (const item of items) {
		const next = row ? `${row}${sep}${item}` : item;
		if (row && visibleWidth(next) > width) {
			out.push(row);
			row = item;
		} else row = next;
	}
	if (row) out.push(row);
	return out;
}
/**
* How many findings fit the overlay: pi clips an overlay at the bottom, so the
* frame and the hints are budgeted before the list and a long one scrolls.
*/
function windowSize(rows) {
	const room = Math.floor(rows * .8) - CHROME_LINES - 1;
	return Math.max(3, Math.min(MAX_FINDINGS, Math.floor(room / FINDING_LINES)));
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
	abort = new AbortController();
	constructor(tui, gen, ctx, ui, text, cursor, done) {
		this.tui = tui;
		this.gen = gen;
		this.ctx = ctx;
		this.ui = ui;
		this.cursor = cursor;
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
	invalidate() {}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.close();
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
			const finding = this.findings[this.index];
			if (finding) this.applyOne(finding);
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
	/** The focused finding's line of the draft, with `word` struck and its fix in green. */
	diffLine(finding, width) {
		const theme = this.ui.theme;
		const at = finding.offsets[0];
		const lead = this.text.slice(Math.max(0, at.start - CONTEXT), at.start).replace(/\s+/g, " ");
		const tail = this.text.slice(at.end, Math.min(this.text.length, at.end + CONTEXT)).replace(/\s+/g, " ");
		const diff = finding.fix === null ? theme.style(finding.word, {
			fg: "warning",
			underline: true
		}) : wordDiff(finding.word, finding.fix).map((run) => run.kind === "removed" ? theme.style(run.text, {
			fg: "error",
			strikethrough: true
		}) : run.kind === "added" ? theme.style(run.text, { fg: "success" }) : run.text).join(" ");
		const line = theme.fg("dim", `${at.start > CONTEXT ? "…" : ""}${lead}`) + diff + theme.fg("dim", `${tail}${at.end + CONTEXT < this.text.length ? "…" : ""}`);
		return truncateToWidth(line, width - 4, "…");
	}
	render(width) {
		const theme = this.ui.theme;
		const checked = this.findings.filter((f) => f.checked && f.fix !== null).length;
		const title = this.findings.length ? `spellfix · ${checked} to apply · ${this.findings.length} found` : "spellfix";
		const body = [""];
		if (this.findings.length === 0) {
			body.push(theme.fg("muted", this.checking ? "Checking for misspellings…" : "No misspellings left."));
			body.push("");
			body.push(theme.fg("dim", "esc close"));
			return box(theme, width, title, body);
		}
		const window = windowSize(this.tui.terminal.rows);
		if (this.index - this.top >= window) this.top = this.index - window + 1;
		if (this.index < this.top) this.top = this.index;
		this.findings.slice(this.top, this.top + window).forEach((finding, offset) => {
			const mark = this.top + offset === this.index ? theme.fg("accent", "❯") : " ";
			const check = finding.checked ? theme.fg("success", "☑") : theme.fg("dim", "☐");
			const count = finding.offsets.length > 1 ? ` ×${finding.offsets.length}` : "";
			body.push(`${mark} ${check} ${theme.fg("dim", `[${finding.kind}]`)}${count}`);
			const keeps = finding.fix === null ? theme.fg("dim", " · d keeps it") : "";
			body.push(`  ${this.diffLine(finding, width)}${keeps}`);
		});
		const below = this.findings.length - (this.top + window);
		if (below > 0) body.push(theme.fg("dim", `  ${below} more below`));
		body.push(theme.fg("dim", `${this.index + 1}/${this.findings.length}`));
		const hints = [];
		if (checked) hints.push("a apply all");
		hints.push("enter apply");
		hints.push("space toggle");
		if (this.findings[this.index]?.kind !== "real word") hints.push("d keep word");
		if (this.added.size) hints.push("u undo add");
		hints.push("esc close");
		const notes = [];
		if (this.checking) notes.push("asking the model…");
		if (this.pendingAll) notes.push("waiting for the model…");
		if (this.aiError) notes.push(`model: ${this.aiError}`);
		if (this.added.size) notes.push(`added: ${[...this.added].join(", ")}`);
		for (const row of rows([...notes, ...hints], width - 4, " · ")) body.push(theme.fg("dim", row));
		return box(theme, width, title, body);
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
	try {
		await ctx.ui.custom((tui, _theme, _kb, done) => {
			const review = new Review(tui, gen, ctx, ctx.ui, text, cursor, done);
			review.start();
			return review;
		}, {
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				width: "85%",
				maxHeight: "80%",
				margin: 1
			}
		});
	} finally {
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