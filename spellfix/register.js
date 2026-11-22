import { atom, read, update } from "claude-code";
import { a as kitOf, i as forSurface, n as guiBand, r as terminalBand } from "./band-DwKKy9Eu.js";

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
const register = (on, options) => {
	config = readConfig(options);
	isEventDriven = false;
	seen = "";
	written = "";
	on("prompt.edit", async ($, e, next) => {
		isEventDriven = true;
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
		const kit = kitOf($.ui.resolve(e), e);
		const { Box, Button, Text } = kit;
		const stacked = (tree) => /* @__PURE__ */ h(Box, { flexDirection: "column" }, below, tree);
		const view = {
			picker: p,
			report: done,
			added: words,
			isBusy: busy,
			count: n,
			hasPersonal: Boolean(config.personal)
		};
		const actions = {
			toggle: () => togglePicker($),
			pick: (key) => pickFromBand($, key),
			answer: (key) => answerFromBand($, key)
		};
		return stacked(forSurface(kit, {
			tui: () => {
				const toggle = /* @__PURE__ */ h(Button, {
					key: "spellfix",
					plain: true,
					action: ACTION,
					onPress: () => togglePicker($)
				}, p ? "close" : busy ? "Checking spelling…" : n ? `${n} misspelled` : "check spelling", /* @__PURE__ */ h(Text, { dimColor: true }, " ctrl+q"));
				return terminalBand(kit, view, actions, toggle, /* @__PURE__ */ h(Box, {
					key: "hidden",
					width: 0,
					height: 0,
					overflow: "hidden"
				}, toggle), isQuiet);
			},
			gui: () => guiBand(kit, view, actions)
		}));
	});
};

export { register };