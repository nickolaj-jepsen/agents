import { atom, read, update } from "claude-code";
import { t as tokens } from "./tokens-CBtsVN7m.js";

// src/lib/docfix.ts
const TOOL_NAME = "docfix";
const KINDS = [
	"wrong",
	"missing",
	"stale"
];
/** The store folder suggestions live in, under the checkout's `.agents/store`. */
const STORE_DIR = "docfix";
const TOOL_DESCRIPTION = [
	"File a suggestion that a doc in this repo is wrong, instead of editing it.",
	"Call it whenever this session has shown you that a git-tracked doc (AGENTS.md, CLAUDE.md, docs/**, a README) doesn't match reality, for example:",
	"you followed a doc's command or steps and they failed or needed changing;",
	"code or output you read contradicts a line in a doc;",
	"you hit a trap or needed a fact that the doc covering that area should have told you;",
	"a doc describes something removed or renamed, or a plan that is done or abandoned.",
	"It needs proof you saw in this session: a file and line you read, or a command and its output. A hunch, a guess or a style preference is not proof: don't file those, and don't go looking for problems.",
	"File it and carry on with your task. If the doc covers code you're changing in this task, update it in the same change instead.",
	"action \"suggest\": file is the doc's repo path; kind is wrong, missing or stale; claim is one line saying what the doc should say or why it is wrong; evidence quotes the doc's line and what you saw that contradicts it (a code location, or a command and its output).",
	"When the file already has suggestions the call lists them and files nothing: call again with same_as set to the one that says the same thing, or same_as \"none\" for a different one.",
	"action \"resolve\" with id is only for the person's /docfix apply prompt, after the edit is made."
].join(" ");
/** The input schema as JSON Schema, for harnesses that take one. */
const INPUT_SCHEMA = {
	type: "object",
	properties: {
		action: {
			type: "string",
			enum: ["suggest", "resolve"]
		},
		file: {
			type: "string",
			description: "Repo-relative path of the doc (suggest)."
		},
		kind: {
			type: "string",
			enum: [...KINDS],
			description: "suggest"
		},
		claim: {
			type: "string",
			description: "One line: what the doc should say, or why it is wrong (suggest)."
		},
		evidence: {
			type: "string",
			description: "The doc's line and what you saw that contradicts it: a code location, or a command and its output (suggest)."
		},
		same_as: {
			type: "string",
			description: "Id of the listed suggestion this repeats, or \"none\" for a new one (suggest)."
		},
		id: {
			type: "string",
			description: "The suggestion to resolve (resolve)."
		}
	},
	required: ["action"]
};
const CLAIM_MAX = 300;
const EVIDENCE_MAX = 4e3;
const SLUG_MAX = 48;
const oneLine = (text) => text.replace(/\s+/g, " ").trim();
/** Lowercase words joined by `-`, cut at a word boundary within `max`. */
function slugify(text, max = SLUG_MAX) {
	const full = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	if (full.length <= max) return full || "doc";
	const cut = full.slice(0, max + 1);
	const boundary = cut.lastIndexOf("-");
	return (boundary > 0 ? cut.slice(0, boundary) : full.slice(0, max)) || "doc";
}
/** `<target>--<claim>`, the target's folders folded so the id is one file name. */
function suggestionId(target, claim, taken) {
	const base = `${slugify(target.replace(/\.md$/i, ""), 40)}--${slugify(claim)}`;
	if (!taken.has(base)) return base;
	for (let n = 2;; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
const fileName = (id) => `${id}.md`;
function normalizeTarget(file, root) {
	let path = file.trim().replace(/\\/g, "/");
	const top = root.replace(/\/+$/, "");
	if (path.startsWith(`${top}/`)) path = path.slice(top.length + 1);
	path = path.replace(/^\.\//, "");
	if (!path) return {
		ok: false,
		error: "file is empty"
	};
	if (path.startsWith("/")) return {
		ok: false,
		error: `${file} is outside this repo`
	};
	if (path.split("/").includes("..")) return {
		ok: false,
		error: `${file} leaves the repo`
	};
	if (!/\.md$/i.test(path)) return {
		ok: false,
		error: `${path} is not a Markdown file`
	};
	return {
		ok: true,
		target: path
	};
}
/** Commands whose file arguments a shell call reads whole or in part. */
const READERS = /* @__PURE__ */ new Set([
	"cat",
	"head",
	"tail",
	"sed",
	"less",
	"more",
	"bat",
	"nl",
	"glow"
]);
/**
* The Markdown files a shell command reads with a plain reader, as written in it:
* `cd docs && sed -n 1,80p layout.md` gives `layout.md`.
*/
function readsInCommand(command) {
	const paths = [];
	for (const segment of command.split(/&&|\|\||[;|\n]/)) {
		const words = segment.trim().split(/\s+/).map((word) => word.replace(/^["']|["']$/g, ""));
		if (!READERS.has(words[0] ?? "")) continue;
		paths.push(...words.slice(1).filter((word) => !word.startsWith("-") && /\.md$/i.test(word)));
	}
	return [...new Set(paths)];
}
/**
* The repo-relative docs `paths` name, a relative one read against `cwd`; a path outside the
* repo or not Markdown is left out.
*/
function docTargets(paths, cwd, root) {
	const targets = paths.flatMap((path) => {
		const target = normalizeTarget(path.startsWith("/") ? path : `${cwd.replace(/\/+$/, "")}/${path}`, root);
		return target.ok ? [target.target] : [];
	});
	return [...new Set(targets)];
}
/**
* What the model reads the first time a session reads a doc: the tool, while the doc is in
* front of it. It files nothing by itself; the bar for proof stays the tool's.
*/
const readReminder = (targets) => `You read ${targets.join(", ")}. If this session shows ${targets.length > 1 ? "one of them" : "it"} is wrong, misses a trap you hit, or describes something gone, and that isn't part of your change, file it with the ${TOOL_NAME} tool, citing what you saw. Otherwise ignore this.`;
const EVIDENCE_HEADING = "## Evidence";
function serialize(s) {
	const front = [
		"---",
		`id: ${s.id}`,
		`target: ${s.target}`,
		`kind: ${s.kind}`,
		`status: ${s.status}`,
		`created: ${s.created}`,
		`updated: ${s.updated}`,
		...s.dismissed ? [`dismissed: ${s.dismissed}`] : [],
		`sessions: ${s.sessions.join(", ")}`,
		"---"
	];
	const evidence = s.evidence.flatMap((e) => [
		"",
		`### ${e.at} · ${e.session}`,
		"",
		e.text.trim()
	]);
	return [
		...front,
		"",
		s.claim,
		"",
		EVIDENCE_HEADING,
		...evidence,
		""
	].join("\n");
}
const isKind = (value) => KINDS.includes(value);
/** The suggestion `text` holds, or null for anything this version didn't write. */
function parse(text) {
	const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
	if (!match) return null;
	const fields = /* @__PURE__ */ new Map();
	for (const line of (match[1] ?? "").split("\n")) {
		const colon = line.indexOf(":");
		if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
	}
	const body = match[2] ?? "";
	const cut = body.indexOf(`\n${EVIDENCE_HEADING}`);
	const claim = oneLine(cut < 0 ? body : body.slice(0, cut));
	const id = fields.get("id") ?? "";
	const target = fields.get("target") ?? "";
	const kind = fields.get("kind") ?? "";
	const status = fields.get("status");
	if (!id || !target || !claim || !isKind(kind)) return null;
	if (status !== "open" && status !== "dismissed") return null;
	const evidence = [];
	if (cut >= 0) {
		const blocks = body.slice(cut + 11 + 1).split(/\n### /);
		for (const block of blocks.slice(1)) {
			const newline = block.indexOf("\n");
			const [at = "", session = ""] = (newline < 0 ? block : block.slice(0, newline)).split(" · ");
			evidence.push({
				at: at.trim(),
				session: session.trim(),
				text: block.slice(newline + 1).trim()
			});
		}
	}
	return {
		id,
		target,
		kind,
		claim,
		status,
		created: fields.get("created") ?? "",
		updated: fields.get("updated") ?? "",
		dismissed: fields.get("dismissed") ?? "",
		sessions: (fields.get("sessions") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
		evidence
	};
}
/** Labels an agent opens a paragraph with; the text after the colon is the paragraph. */
const LABELS = ["Why the repo didn't say it"];
const MIGRATED = /^Migrated from [\w-]+ memory `[^`]*`\.?$/;
function citationsOf(line) {
	const match = /^Citations:\s*(\[.*\])\s*$/.exec(line.trim());
	if (!match) return void 0;
	try {
		const raw = JSON.parse(match[1] ?? "");
		if (!Array.isArray(raw)) return void 0;
		const items = raw.flatMap((item) => {
			if (typeof item === "string") return [{
				kind: "ref",
				value: item
			}];
			if (typeof item !== "object" || item === null) return [];
			const { kind, value } = item;
			if (value === void 0) return [];
			const text = typeof value === "string" ? value : JSON.stringify(value);
			return [{
				kind: typeof kind === "string" && kind ? kind : "ref",
				value: text
			}];
		});
		return items.length > 0 ? items : void 0;
	} catch {
		return;
	}
}
/**
* Evidence text in parts: paragraphs, the labelled ones named, a `Citations:` JSON line as a
* list, and a `Migrated from` line dropped for the flag.
*/
function readEvidence(e) {
	const parts = [];
	let isMigrated = false;
	for (const paragraph of e.text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
		const lines = paragraph.split("\n");
		const at = lines.findIndex((line) => citationsOf(line) !== void 0);
		const before = (at < 0 ? lines : lines.slice(0, at)).join("\n").trim();
		if (MIGRATED.test(before)) isMigrated = true;
		else if (before) {
			const label = LABELS.find((l) => before.startsWith(`${l}:`));
			parts.push(label ? {
				kind: "labelled",
				label,
				text: before.slice(label.length + 1).trim()
			} : {
				kind: "text",
				text: before
			});
		}
		const items = at < 0 ? void 0 : citationsOf(lines[at] ?? "");
		if (items) parts.push({
			kind: "citations",
			items
		});
		const after = at < 0 ? "" : lines.slice(at + 1).join("\n").trim();
		if (after) parts.push({
			kind: "text",
			text: after
		});
	}
	const by = e.session.includes(":") ? e.session.slice(0, e.session.indexOf(":")) : "";
	return {
		when: e.at.slice(0, 10),
		by,
		isMigrated,
		parts
	};
}
/** Text longer than this is set one sentence to a line, so it is not a wall. */
const WALL = 140;
/**
* `text` in its own lines, a long one cut after each sentence. A full stop only ends a sentence
* before a capital letter, so `PYTHONPATH=. uv run` and `a.md` stay whole.
*/
function sentences(text) {
	return text.split("\n").flatMap((line) => line.length > WALL ? line.split(/(?<=[.!?])\s+(?=[A-Z"`“])/) : [line]);
}
/**
* One piece of evidence as blocks a person scans: the reason, the details, then what it points
* at, each under a heading. A one-paragraph piece has no heading to give.
*/
function evidenceBlocks(view) {
	const isStructured = view.parts.length > 1 || view.parts.some((p) => p.kind !== "text");
	const heading = (label) => isStructured ? label : "";
	const why = view.parts.flatMap((p) => p.kind === "labelled" ? [{
		heading: p.label,
		lines: sentences(p.text)
	}] : []);
	const details = view.parts.flatMap((p) => p.kind === "text" ? [{
		heading: heading("Details"),
		lines: sentences(p.text)
	}] : []);
	const points = view.parts.flatMap((p) => p.kind === "citations" ? [{
		heading: "Points at",
		lines: [],
		items: p.items
	}] : []);
	return [
		...why,
		...details,
		...points
	];
}
const seen = (s) => Math.max(1, s.sessions.length);
/** `3×` once a second session has hit the gap; nothing for the first, which every row has. */
const repeats = (s) => seen(s) > 1 ? `${seen(s)}×` : "";
/** One piece of evidence's line, `2026-11-05  pi  migrated`: when, by which harness, how filed. */
const evidenceLabel = (view) => [
	view.when,
	view.by,
	view.isMigrated ? "migrated" : ""
].filter(Boolean).join("  ");
const describe = (s) => s.status === "dismissed" ? `- ${s.id} (dismissed ${s.dismissed.slice(0, 10)}): ${s.claim}` : `- ${s.id} (open, seen ${seen(s)}×): ${s.claim}`;
function plan(call) {
	const { input, existing } = call;
	if (input.action === "resolve") {
		const id = (input.id ?? "").trim();
		const found = existing.find((s) => s.id === id);
		if (!id) return {
			kind: "error",
			text: "resolve needs the id of the suggestion"
		};
		if (!found) return {
			kind: "error",
			text: `no suggestion with id ${id}`
		};
		return {
			kind: "remove",
			suggestion: found,
			text: `Resolved ${id}.`
		};
	}
	if (input.action !== "suggest") return {
		kind: "error",
		text: "action is \"suggest\" or \"resolve\""
	};
	const target = call.target ?? {
		ok: false,
		error: "file is empty"
	};
	if (!target.ok) return {
		kind: "error",
		text: target.error
	};
	const kind = (input.kind ?? "").trim();
	if (!isKind(kind)) return {
		kind: "error",
		text: `kind is one of ${KINDS.join(", ")}`
	};
	const claim = oneLine(input.claim ?? "");
	if (!claim) return {
		kind: "error",
		text: "claim is empty"
	};
	if (claim.length > CLAIM_MAX) return {
		kind: "error",
		text: `claim is ${claim.length} chars; keep it under ${CLAIM_MAX} and put the rest in evidence`
	};
	const evidenceText = (input.evidence ?? "").trim().slice(0, EVIDENCE_MAX);
	if (!evidenceText) return {
		kind: "error",
		text: "evidence is empty: cite the doc's line and what contradicts it"
	};
	const evidence = {
		at: call.now,
		session: call.session,
		text: evidenceText
	};
	const sameAs = (input.same_as ?? "").trim();
	const siblings = existing.filter((s) => s.target === target.target);
	if (sameAs && sameAs !== "none") {
		const repeat = existing.find((s) => s.id === sameAs);
		if (!repeat) return {
			kind: "error",
			text: `no suggestion with id ${sameAs}`
		};
		if (repeat.status === "dismissed") return {
			kind: "answer",
			text: `${repeat.id} was dismissed on ${repeat.dismissed.slice(0, 10)}; not filed again. Carry on with your task.`
		};
		const isNewSession = !repeat.sessions.includes(call.session);
		const isNewEvidence = !repeat.evidence.some((e) => e.text === evidenceText);
		const bumped = {
			...repeat,
			updated: call.now,
			sessions: isNewSession ? [...repeat.sessions, call.session] : repeat.sessions,
			evidence: isNewEvidence ? [...repeat.evidence, evidence] : repeat.evidence
		};
		return {
			kind: "write",
			suggestion: bumped,
			isNew: false,
			text: `Added to ${repeat.id}: seen ${seen(bumped)}×, /docfix to review. Carry on with your task.`
		};
	}
	if (!sameAs && siblings.length > 0) return {
		kind: "answer",
		text: [
			`Not filed yet: ${target.target} already has these suggestions:`,
			...siblings.map(describe),
			`Call again with same_as: "<id>" if one says the same thing, or same_as: "none" if yours is different.`
		].join("\n")
	};
	const suggestion = {
		id: suggestionId(target.target, claim, new Set(existing.map((s) => s.id))),
		target: target.target,
		kind,
		claim,
		status: "open",
		created: call.now,
		updated: call.now,
		dismissed: "",
		sessions: [call.session],
		evidence: [evidence]
	};
	return {
		kind: "write",
		suggestion,
		isNew: true,
		text: `Filed ${suggestion.id}: seen 1×, /docfix to review. Carry on with your task.`
	};
}
/** The open suggestions as /docfix lists them: by doc, the most seen first. */
const openQueue = (all) => all.filter((s) => s.status === "open").sort((a, b) => a.target.localeCompare(b.target) || seen(b) - seen(a) || b.updated.localeCompare(a.updated));
const dismiss = (s, now) => ({
	...s,
	status: "dismissed",
	dismissed: now,
	updated: now
});
/** Sets each of `ids` to `choice`, or skips them all when every one already has it. */
function toggleChoice(choices, ids, choice) {
	const next = { ...choices };
	const isSet = choice !== void 0 && ids.every((id) => next[id] === choice);
	for (const id of ids) if (choice === void 0 || isSet) delete next[id];
	else next[id] = choice;
	return next;
}
/** `apply 2, dismiss 1`, or empty when every row is skipped. */
function choiceSummary(choices) {
	const counts = {
		apply: 0,
		dismiss: 0
	};
	for (const c of choices) if (c) counts[c] += 1;
	return ["apply", "dismiss"].filter((c) => counts[c] > 0).map((c) => `${c} ${counts[c]}`).join(", ");
}
/** The picked suggestions, one group per doc, in queue order. */
function byTarget(picked) {
	const groups = /* @__PURE__ */ new Map();
	for (const s of picked) groups.set(s.target, [...groups.get(s.target) ?? [], s]);
	return [...groups];
}
/** Where a checkout's suggestions are, as the agent reaches them from the repo root. */
const STORE_REF = `.agents/store/${STORE_DIR}`;
/**
* The prompt an apply drafts for the agent, which the person reads before sending: each doc
* under its path, each suggestion's claim then the file holding its evidence. The evidence stays
* in that file, which the agent reads; the id is not repeated because it is the file's name.
*/
function applyPrompt(picked) {
	return [
		`Apply these docfix suggestions. The file under each claim holds its evidence: read it first.`,
		...byTarget(picked).flatMap(([target, list]) => [
			"",
			target,
			...list.flatMap((s) => [`- ${s.kind}: ${s.claim}${seen(s) > 1 ? ` (seen ${seen(s)}×)` : ""}`, `  ${STORE_REF}/${fileName(s.id)}`])
		]),
		"",
		"For each one:",
		"1. Check the claim against this repo's code. One that no longer holds needs no edit.",
		"2. Edit the doc as it stands now, in its existing structure and voice. For a stale plan, delete or trim what is finished or gone.",
		"3. Search once for the outdated wording in the docs beside it (its folder, or the skill or plugin it belongs to). Where another doc states the same fact, fix it there too instead of filing a suggestion. Change only that fact, and leave records of the past, such as a changelog, as they are.",
		`4. Call ${TOOL_NAME} with action "resolve" and the id (the file's name without .md), whether you applied it or found it no longer true.`,
		"",
		"Name every doc you changed beyond the ones above. Anything else you notice gets filed with docfix as usual. Don't commit."
	].join("\n");
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
/** The glyph a cut text ends in. */
const ELLIPSIS = "…";
/** `text` cut to `width` cells with `…` when it is longer. */
function truncate(text, width) {
	if (cellWidth(text) <= width) return text;
	return split(text, Math.max(0, width - 1))[0] + "…";
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

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP$3 = " ".repeat(tokens.gutter);
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
/**
* The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
* before a row of its own, such as an input, to line it up with the card's.
*/
const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);
/** A line behind a card's rail, which still draws on a blank row. */
function rail(state, row) {
	const mark = span(tokens.glyph.rail, { role: railRole(state) });
	return {
		...row,
		spans: row.spans.length ? [
			mark,
			span(GAP$3),
			...row.spans
		] : [mark]
	};
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
function buttonRow$1(keys, width, { wrap = false, lead = [], hover } = {}) {
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

// ../../lib/kits/fields/src/terminal.ts
/** Fields as styled lines: the one drawing both terminals paint. */
const GAP$2 = " ".repeat(tokens.gutter);
/** What a person can press: in the accent where the keyboard is, quiet elsewhere. */
const keyRole = (isActive = false) => isActive ? "accent" : "dim";
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
					role: f.key ? keyRole(active) : "dim",
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
			if (spans.length) spans.push(span(GAP$2));
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
			...hasKeys ? [span((f.key ?? "").padEnd(keyed - tokens.gutter), { role: keyRole(active) }), span(GAP$2)] : [],
			...label,
			span(" ".repeat(labelled - spansWidth(label)) + GAP$2)
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
	return buttonRow$1(buttons, room, { lead })[0]?.spans;
}
/** Cells a title needs to be worth cutting into. */
const MIN_TITLE = 8;
const ruleSpan = (n) => span(tokens.glyph.rule.repeat(Math.max(0, n)), { role: "border" });
/** `words ── words`: the parts of a rule's caption, a short rule between two. */
const captionParts = (parts) => parts.filter((part) => part.length).flatMap((part, i) => i ? [
	span(" "),
	ruleSpan(tokens.gutter),
	span(" "),
	...part
] : part);
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
function frameTop$1(f) {
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
		frameTop$1(f),
		blank(),
		...f.body.map(row),
		row(f.notice),
		row(f.footer),
		line([ruleSpan(width)])
	];
}

// ../../lib/kits/prose/src/terminal.ts
/**
* Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
* here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
* that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
* needs syntax colours or runs as long as it likes.
*/
const GAP$1 = " ".repeat(tokens.gutter);
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
				if (!isLast) spans.push(span(" ".repeat(Math.max(0, (widths[i] ?? 0) - used)) + GAP$1));
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
function prose$1(text, width, { isDim = false } = {}) {
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
			for (const l of code) out.push(line([span(GAP$1), span(truncate(l, width - tokens.gutter), { role: "code" })]));
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

// ../../lib/kits/detail/src/terminal.ts
/** The detail as styled lines: the one drawing both terminals paint. */
/** An action at a rule's end, drawn as a button row draws one. */
const actionSpans$1 = (a) => buttonRow$1([a], Number.MAX_SAFE_INTEGER)[0]?.spans ?? [];
/** `─ words ── words ──── action`: the frame's rule, its words dim, across the detail. */
function ruleRow(words, action, width, tail = 0) {
	const parts = (typeof words === "string" ? [words] : words).filter(Boolean);
	return captionRule({
		width,
		caption: captionParts(parts.map((part) => [span(part, { role: "dim" })])),
		end: action ? actionSpans$1(action) : void 0,
		tail
	});
}
/** Keyed rows: the keys in one dim column, each value wrapped beside its key. */
const itemRows$1 = (items, width) => fields(items.map((item) => ({
	label: item.key,
	value: item.isQuote ? `“${item.value}”` : item.value
})), width, { valueLines: 1e400 });
/** A row of text set in to where a framed detail's rules have their words. */
const setIn = (row, by) => by && row.spans.length ? {
	...row,
	spans: [span(" ".repeat(by)), ...row.spans]
} : row;
/** The cells a framed detail's text is set in by on each side: a frame's body's. */
const insetOf$1 = (d) => d.framed ? captionFrameLayout.x : 0;
function section(s, d, width) {
	const x = insetOf$1(d);
	const room = Math.max(1, width - 2 * x);
	return [...s.rule !== void 0 ? [ruleRow(s.rule, s.action, width, x ? x - 1 : 0)] : [], ...[
		...s.heading ? block([span(s.heading, { role: "dim" })], room) : [],
		...s.text ? prose$1(s.text, room) : [],
		...s.items?.length ? itemRows$1(s.items, room) : []
	].map((row) => setIn(row, x))];
}
/** The title in one style, its code too: a title reads as one line of words, not as a mix of colours. */
const titleSpans = (title) => inline(title, TITLE$1).map((sp) => sp.role === "code" ? {
	...TITLE$1,
	text: sp.text
} : sp);
const TITLE$1 = {
	role: "text",
	bold: true
};
/** Every row of the detail, uncut. */
function rowsOf(d, width) {
	const x = insetOf$1(d);
	const room = Math.max(1, width - 2 * x);
	return [[...d.meta ? block([span(d.meta, {
		role: "dim",
		bold: d.hovered || void 0
	})], room) : [], ...d.title ? block(titleSpans(d.title), room, { max: d.titleMax }) : []].map((row) => setIn(row, x)), ...(d.sections ?? []).map((s) => section(s, d, width))].filter((part) => part.length > 0).flatMap((part, i) => i ? [blank(), ...part] : part);
}
/** Below this many rows a cut detail has no room to say so: its rows are all text. */
const MARKED$1 = 3;
/** The window a detail's height shows of its rows, from `offset`. */
function windowOf$1(d, all) {
	const height = d.height ?? 1e400;
	if (all.length <= height) return {
		rows: [...all],
		top: 0,
		max: 0
	};
	if (height < MARKED$1) {
		const max = all.length - height;
		const top = Math.max(0, Math.min(max, d.offset ?? 0));
		return {
			rows: all.slice(top, top + height),
			top,
			max
		};
	}
	return scrolled(all, {
		rows: height,
		top: d.offset,
		inset: insetOf$1(d)
	});
}
/** The furthest `offset` can scroll a detail at `width`: 0 when it fits its height. */
const detailRange = (d, width) => windowOf$1(d, rowsOf(d, width)).max;
/**
* One item read whole: a dim meta line, a bold title, then sections, each under a dim heading
* or a rule, of prose and of keyed rows, a blank row between. Taller than `height`, it is a
* window from `offset`, and where it has three rows or more its edges count what is out of sight
* (`↑ 3 more`, `↓ 12 more`), as every window in the kit does.
*/
function detail$1(d, width) {
	const { rows } = windowOf$1(d, rowsOf(d, width));
	if (d.hit === void 0) return rows;
	return rows.map((row) => row.spans.some((s) => s.hit) ? row : {
		...row,
		hit: d.hit
	});
}

// ../../lib/kits/list/src/terminal.ts
/** The list as styled lines: the one drawing both terminals paint. */
const GAP = " ".repeat(tokens.gutter);
/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
const LIST_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;
/** Cells of the pointer column and the space after it. */
const POINTER = cellWidth(tokens.glyph.pointer) + 1;
/** Cells of a mark and the space after it. */
const MARK = cellWidth(tokens.glyph.single.off) + 1;
const allRows = (l) => (l.groups ?? []).flatMap((g) => g.rows);
/** Cells the list's keys take, with the space after: the widest key, or none where no row has one. */
const keyCells = (l) => {
	const widest = Math.max(0, ...allRows(l).map((r) => cellWidth(r.key ?? "")));
	return widest ? widest + 1 : 0;
};
/** Cells the mark takes: none where every row says `none`, so a menu of keys starts at its keys. */
const markCells = (l) => {
	const rows = allRows(l);
	return rows.length && rows.every((r) => r.mark === "none") ? 0 : MARK;
};
/** Cells before a row's text: the pointer column, the key, the mark and their spaces. */
const leadCells = (l) => POINTER + keyCells(l) + markCells(l);
/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;
/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";
/** Cells before a group's label and a row's pointer: the rail and its gap, or none without rails. */
const insetOf = (l) => l.rail === false ? 0 : LIST_INSET;
/** Cells a row's text has at `width`, beside the list's aside column. */
function listTextRoom(width, l = {}) {
	const aside = l.aside ?? 0;
	return Math.max(1, width - insetOf(l) - leadCells(l) - (aside > 0 ? aside + tokens.gutter : 0));
}
/**
* Whether a row of the list shows all of `text` at `width`, in the lines its text may take: else
* show it elsewhere.
*/
const listShowsWhole = (text, width, l = {}) => (l.lines ?? 1) > 1 ? block(inline(text), listTextRoom(width, l)).length <= (l.lines ?? 1) : spansWidth(inline(text)) <= listTextRoom(width, l);
/** `label` cut from the left to `width` cells: whole folders first, then letters. */
function cutLeft(label, width) {
	if (cellWidth(label) <= width) return label;
	const parts = label.split("/");
	for (let i = 1; i < parts.length; i++) {
		const tail = `${"…"}/${parts.slice(i).join("/")}`;
		if (cellWidth(tail) <= width) return tail;
	}
	const chars = [...label];
	let out = "";
	for (let i = chars.length - 1; i >= 0; i--) {
		const next = (chars[i] ?? "") + out;
		if (cellWidth("…" + next) > width) break;
		out = next;
	}
	return width < 1 ? "" : "…" + out;
}
/** A flat row's group label: whole when it fits `width`, else its last part, cut from the left. */
function shortLabel(label, width) {
	if (cellWidth(label) <= width) return label;
	return cutLeft(label.split("/").pop() ?? label, width);
}
/** `left` and `right` on one row of `width` cells, `right` at its end. */
function spread(left, right, width) {
	const room = width - spansWidth(right) - (right.length ? tokens.gutter : 0);
	const cut = truncateSpans(left, Math.max(0, room));
	const pad = width - spansWidth(cut) - spansWidth(right);
	return right.length ? [
		...cut,
		span(" ".repeat(Math.max(1, pad))),
		...right
	] : cut;
}
const actionSpans = (actions) => buttonRow$1(actions.map((a) => ({
	...a,
	hotkey: "",
	isQuiet: true
})), Number.MAX_SAFE_INTEGER)[0]?.spans ?? [];
/** A line behind its group's rail, or as it is where the list draws none. */
const behind = (l, state, row) => l.rail === false ? row : rail(state, row);
/** A group's row: its label, cut from the left, and its controls at the right. */
function groupRow(g, l, width) {
	const room = width - insetOf(l);
	const all = g.actions?.length ? actionSpans(g.actions) : [];
	const actions = room - spansWidth(all) - tokens.gutter >= MIN_LABEL ? all : [];
	const labelRoom = room - (actions.length ? spansWidth(actions) + tokens.gutter : 0);
	const spans = spread([span(cutLeft(g.label, Math.max(1, labelRoom)), {
		role: g.active ? "accent" : "dim",
		...g.hit && actions.length ? { hit: g.hit } : {}
	})], actions, room);
	return behind(l, {
		active: g.active,
		answered: g.done
	}, line(spans, actions.length ? void 0 : g.hit));
}
/** Rows a row's text may take: one in a flat list, whose rows are for little room. */
const textRows = (l) => l.flat ? 1 : Math.max(1, l.lines ?? 1);
/**
* One row: the pointer column, the mark, the text and the aside at the right. The text is cut
* to the row, or with `rows` over one wrapped to as many, each later line hanging under the first.
*/
function itemRows(r, g, l, width, rows = textRows(l)) {
	const mark = r.mark ?? "open";
	const isLit = (r.focused || r.hovered) && !r.disabled;
	const hit = r.disabled ? void 0 : r.hit;
	const markHit = r.disabled ? void 0 : r.markHit;
	const words = r.disabled || mark === "dropped" ? {
		role: "dim",
		bold: isLit || void 0
	} : controlStyle({
		primary: mark === "chosen",
		highlighted: isLit
	});
	const glyph = mark === "chosen" ? span(tokens.glyph.single.on, {
		role: "accent",
		bold: true
	}) : mark === "dropped" ? span(tokens.glyph.dropped, { role: "dim" }) : span(tokens.glyph.single.off, { role: "dim" });
	const keys = keyCells(l);
	const key = keys ? [span((r.key ?? "").padEnd(keys - 1), { role: g.active && !r.disabled ? "accent" : "dim" }), span(" ")] : [];
	const hasMark = markCells(l) > 0;
	const pointer = r.focused ? [span(tokens.glyph.pointer, {
		role: "text",
		bold: true
	}), span(" ")] : [span(" ".repeat(cellWidth(tokens.glyph.pointer) + 1))];
	const room = width - insetOf(l);
	const aside = l.aside ?? 0;
	const textRoom = listTextRoom(width, l);
	let spans = (r.literal ? literal(r.text, words) : inline(r.text, words)).map((sp) => sp.role === "code" ? {
		...words,
		text: sp.text
	} : sp);
	if (l.flat) {
		const label = shortLabel(g.label, Math.max(4, Math.floor(textRoom / 3)));
		spans = [
			span(label, { role: "dim" }),
			span(SEPARATOR, { role: "dim" }),
			...spans
		];
	}
	const texts = rows > 1 ? block(spans, textRoom, { max: rows }).map((row) => row.spans) : [truncateSpans(spans, textRoom)];
	const lead = [
		...pointer,
		...key,
		...hasMark ? mark === "none" ? [span(" ".repeat(MARK))] : [glyph, span(" ")] : []
	];
	const right = aside > 0 ? [span(truncate(r.aside ?? "", aside).padStart(aside), { role: r.aside ? "dim" : void 0 })] : [];
	const state = {
		active: g.active,
		answered: g.done
	};
	return texts.map((text, i) => {
		if (i > 0) {
			const hang = span(" ".repeat(spansWidth(lead)));
			return behind(l, state, line([hang, ...hit ? hitSpans(text, hit) : text]));
		}
		const body = spread(text, right, room - spansWidth(lead));
		if (markHit === void 0) return behind(l, state, line([...lead, ...body], hit));
		return behind(l, state, line([...hitSpans(lead, markHit), ...hit ? hitSpans(body, hit) : body]));
	});
}
/**
* The group, row and line of each line of the list drawn whole at `width`: a group's row, each
* line of each of its rows, and with `space` a blank line before every group but the first.
*/
const entriesOf = (l, width) => l.groups.flatMap((g, group) => [
	...l.space && !l.flat && group > 0 ? [{
		group,
		isGap: true
	}] : [],
	...l.flat || !g.label ? [] : [{ group }],
	...g.rows.flatMap((r, row) => textRows(l) > 1 ? itemRows(r, g, l, width).map((_, part) => ({
		group,
		row,
		part
	})) : [{
		group,
		row,
		part: 0
	}])
]);
const isGroupRow = (e) => !!e && e.row === void 0 && !e.isGap;
const isFocused = (l, e) => e.row !== void 0 && Boolean(l.groups[e.group]?.rows[e.row]?.focused);
/** The first line of a row: what counts it, where its later lines do not. */
const isRow = (e) => e.row !== void 0 && !e.part;
const sameRow = (a, b) => !!a && !!b && a.row !== void 0 && a.group === b.group && a.row === b.row;
/** The window's rows, its more-row aside, and the furthest its top goes; none when all fits. */
function windowOf(l, entries) {
	const height = l.height ?? 1e400;
	if (entries.length <= height) return void 0;
	const rows = height >= 3 ? height - 1 : Math.max(1, height);
	const max = Math.max(0, entries.length - rows);
	let top = Math.max(0, Math.min(max, l.top ?? 0));
	while (entries[top]?.part || entries[top]?.isGap) top++;
	return {
		top,
		rows,
		max
	};
}
/**
* The top a window takes so the keyboard's row stays in it, every line of it, with `context`
* lines on either side: it moves only as far as that needs, and not at all while the row is well
* inside.
*/
function listFollow(l, width, context = 2) {
	const entries = entriesOf(l, width);
	const w = windowOf(l, entries);
	if (!w) return 0;
	const at = entries.findIndex((e) => isFocused(l, e));
	if (at < 0) return w.top;
	let end = at;
	while (end + 1 < entries.length && isFocused(l, entries[end + 1])) end++;
	const ctx = Math.min(context, Math.max(0, Math.floor((w.rows - (end - at + 1)) / 2)));
	let top = w.top;
	if (end > top + w.rows - 1 - ctx) top = end - (w.rows - 1 - ctx);
	if (at < top + ctx) top = at - ctx;
	return Math.max(0, Math.min(w.max, top));
}
/** Rows the list takes drawn whole at `width`: its lines, and with `space` those between groups. */
const listRows = (l, width) => entriesOf(l, width).length;
/** The furthest a window's `top` goes at `width`: 0 for a list drawn whole. */
function listTopMax(l, width) {
	return windowOf(l, entriesOf(l, width))?.max ?? 0;
}
/** How many rows a run of lines holds: a row counts where its first line is. */
const rowsIn = (entries) => entries.filter(isRow).length;
/**
* Groups of rows behind the card's rail: each group's row, then a row per item with its mark and
* its text, on one line or wrapped to `lines`. Taller than `height`, it is a window from `top`:
* the keyboard's group row stands in for its first row when it is above the window, a group row
* is never its last, a row its end cuts ends in `…` there, and its last row says how many rows
* are above it and below.
*/
function list$1(l, width) {
	const entries = entriesOf(l, width);
	/** Line `e.part` of its row, the row drawn in `rows` lines where the window has no more. */
	const draw = (e, rows) => {
		const g = l.groups[e.group];
		const r = e.row === void 0 ? void 0 : g.rows[e.row];
		if (e.isGap) return blank();
		return r ? itemRows(r, g, l, width, rows)[e.part ?? 0] ?? blank() : groupRow(g, l, width);
	};
	const w = windowOf(l, entries);
	if (!w) return entries.map((e) => draw(e));
	const shown = Array.from({ length: w.rows }, (_, i) => {
		const e = entries[w.top + i];
		return e && { e };
	});
	const at = entries.findIndex((e) => isFocused(l, e));
	const head = entries.findIndex((e) => isGroupRow(e) && e.group === entries[at]?.group);
	const stands = w.rows > 1 && head >= 0 && head < w.top && at > w.top && at < w.top + w.rows;
	let under = 0;
	if (stands) {
		const covered = entries[w.top];
		while (sameRow(shown[1 + under]?.e, covered)) under++;
		for (let i = 0; i < under; i++) shown[1 + i] = {
			e: {
				...covered,
				part: i
			},
			rows: under
		};
		shown[0] = { e: entries[head] };
	}
	const lastAt = shown.length - 1;
	if (w.rows > 1 && isGroupRow(shown[lastAt]?.e)) shown[lastAt] = void 0;
	const last = shown[lastAt]?.e;
	const cut = sameRow(last, entries[w.top + w.rows]) ? (last?.part ?? 0) + 1 : void 0;
	const lines = shown.map((x) => x ? draw(x.e, x.rows ?? (sameRow(x.e, last) ? cut : void 0)) : blank());
	if (w.rows >= (l.height ?? 0)) return lines;
	const up = rowsIn(entries.slice(0, w.top + (stands && !under ? 1 : 0)));
	const down = rowsIn(entries.slice(w.top + w.rows));
	const text = [up ? moreText(tokens.glyph.more.up, up) : "", down ? moreText(tokens.glyph.more.down, down) : ""].filter(Boolean).join(GAP);
	const more = line(text ? [span(" ".repeat(insetOf(l))), span(text, { role: "dim" })] : []);
	return [...lines, {
		...more,
		spans: truncateSpans(more.spans, width)
	}];
}

// src/lib/screen.ts
const TITLE = "Doc suggestions";
const rowHit = (id) => `row:${id}`;
const markHit = (id) => `mark:${id}`;
const docHit = (target) => `doc:${target}`;
const allHit = (choice, target) => `all:${choice}:${target}`;
const DETAIL = "detail";
const BUTTONS = {
	main: "main",
	apply: "apply",
	dismiss: "dismiss",
	evidence: "evidence",
	back: "back",
	next: "next"
};
const idOf = (hit, prefix) => hit.startsWith(prefix) ? hit.slice(prefix.length) : void 0;
const focused$1 = (s) => s.queue.find((q) => q.id === s.focus) ?? s.queue[0];
const isAnySet = (s) => s.queue.some((q) => s.set[q.id]);
const counts = (s) => {
	let apply = 0;
	let dismiss = 0;
	for (const q of s.queue) if (s.set[q.id] === "apply") apply++;
	else if (s.set[q.id] === "dismiss") dismiss++;
	return {
		apply,
		dismiss,
		left: s.queue.length - apply - dismiss
	};
};
const DAY = 864e5;
/** `today`, `yesterday`, `3 days ago`, `2 months ago`. */
function ageText(iso, now) {
	const days = Math.floor((now - Date.parse(iso)) / DAY);
	if (!Number.isFinite(days) || days < 1) return "today";
	if (days === 1) return "yesterday";
	if (days < 60) return `${days} days ago`;
	if (days < 730) return `${Math.floor(days / 30)} months ago`;
	return `${Math.floor(days / 365)} years ago`;
}
/** `wrong · seen 3× · 2 days ago`: the kind in a word, how often, how long ago. */
const metaText = (q, now) => [
	q.kind,
	seen(q) > 1 ? `seen ${seen(q)}×` : "",
	ageText(q.updated, now)
].filter(Boolean).join(" · ");
/** The main action: one of three, by what it will do. */
function mainLabel(s) {
	const { apply, dismiss } = counts(s);
	return apply ? "Draft prompt" : dismiss ? "Dismiss" : "Close";
}
/** Cells the text is set in by on both sides: where the caption rule has its words. */
const X = captionFrameLayout.x;
/** The seen count's column at the right of every row: `12×`. */
const ASIDE = 3;
/** Below this many rows the frame drops its blank row and the focused suggestion its meta line. */
const SHORT = 20;
/**
* Below this many rows the queue is all there is, its rows carrying their doc: Claude Code's
* pane above the prompt of a 24-row terminal, in its own box.
*/
const TINY = 9;
/**
* The queue's rows: the seen count's column, two lines of a claim at most, so most are read there
* without the reader, and no rails, since a queue is not a form with every row to decide.
*/
const ROWS = {
	aside: ASIDE,
	lines: 2,
	rail: false
};
/** Rows the focused suggestion's claim and evidence each take at most, when the queue needs room. */
const CLAIM_ROWS = 3;
const EVIDENCE_ROWS = 3;
const modeOf = (o) => o.height < TINY ? "tiny" : o.height < SHORT ? "short" : "tall";
/** Rows of the evidence text a suggestion has at `width`, uncut. */
const evidenceRows = (q, width) => detail$1({ sections: evidenceSections$1(q, 0) }, width).length;
/** Rows of the claim under the queue: none when the queue's row shows it whole. */
function claimRows(q, l) {
	if (listShowsWhole(q.claim, l.innerWidth, ROWS)) return 0;
	return Math.min(CLAIM_ROWS, detail$1({ title: q.claim }, l.innerWidth).length);
}
/**
* Rows the focused suggestion wants: the meta line, the claim, a blank row, the rule, and its
* evidence, `evidence` rows of it at most.
*/
function zoneNeed(q, mode, l, evidence = EVIDENCE_ROWS) {
	if (mode === "short") return claimRows(q, l) + 1;
	return 1 + claimRows(q, l) + 1 + 1 + Math.min(evidence, evidenceRows(q, l.innerWidth));
}
function layout(s, o) {
	const mode = modeOf(o);
	const widths = { innerWidth: Math.max(1, o.width - 2 * X) };
	const chrome = mode === "tiny" ? 2 : mode === "short" ? 3 : captionFrameLayout.chrome - 1;
	const body = Math.max(1, o.height - chrome);
	if (mode === "tiny") return {
		mode,
		body,
		list: body,
		zone: 0,
		...widths
	};
	const natural = listRows(listOf(s, { mode }), widths.innerWidth);
	const needs = (evidence) => Math.max(0, ...s.queue.map((q) => zoneNeed(q, mode, widths, evidence)));
	const reserve = Math.max(1, Math.min(needs(), body - 1 - Math.min(3, natural)));
	const rows = Math.max(1, Math.min(natural, body - 1 - reserve));
	return {
		mode,
		body,
		list: rows,
		zone: body - 1 - rows,
		...widths
	};
}
/** The queue as the kit's list, in the `list` rows the layout gives it: whole without. */
function listOf(s, l) {
	const at = focused$1(s);
	return {
		groups: byTarget(s.queue).map(([target, rows]) => {
			const isActive = rows.some((q) => q.id === at?.id);
			return {
				label: target,
				active: isActive,
				hit: docHit(target),
				actions: isActive ? ["apply", "dismiss"].map((choice) => ({
					label: choice === "apply" ? "Apply all" : "Dismiss all",
					hotkey: "",
					hit: allHit(choice, target),
					hovered: s.hover === allHit(choice, target)
				})) : void 0,
				rows: rows.map((q) => ({
					text: q.claim,
					mark: s.set[q.id] === "apply" ? "chosen" : s.set[q.id] === "dismiss" ? "dropped" : "open",
					aside: seen(q) > 99 ? "99+" : repeats(q),
					focused: q.id === at?.id,
					hovered: s.hover === rowHit(q.id) || s.hover === markHit(q.id),
					hit: rowHit(q.id),
					markHit: markHit(q.id)
				}))
			};
		}),
		height: l.list,
		top: s.scroll.list,
		...ROWS,
		flat: l.mode === "tiny",
		space: true
	};
}
/** A piece of evidence as sections in the order the core gives: the reason first. */
function evidenceSections$1(q, piece) {
	const e = [...q.evidence].reverse()[piece];
	if (!e) return [];
	return evidenceBlocks(readEvidence(e)).map((b) => ({
		heading: b.heading || void 0,
		text: b.lines.join("\n") || void 0,
		items: b.items?.map((c) => ({
			key: c.kind,
			value: c.value,
			isQuote: c.kind === "quote"
		}))
	}));
}
/** `Evidence ── 2 pieces`, or `Evidence ── 2 days ago` with one: the focused suggestion's rule. */
function evidenceRule(q, now) {
	const n = q.evidence.length;
	if (n === 0) return ["No evidence filed"];
	if (n > 1) return ["Evidence", `${n} pieces`];
	return ["Evidence", ageText(q.evidence[0]?.at ?? "", now)];
}
/**
* The focused suggestion at the bottom of the screen, in `rows` rows at most: its meta line, its
* claim when the queue's row cuts it, then the evidence rule, a control that opens the reader,
* and as much of the newest evidence as the rows hold. The rule is drawn whatever else gives way.
*/
function focusedZone(s, o, l, rows) {
	const q = focused$1(s);
	if (!q || rows < 1) return [];
	const isTall = l.mode === "tall";
	const read = {
		label: "Read",
		hotkey: "e",
		hit: BUTTONS.evidence,
		hovered: s.hover === BUTTONS.evidence
	};
	const rule = detail$1({
		sections: [{
			rule: evidenceRule(q, o.now),
			action: read
		}],
		framed: true
	}, o.width);
	let head = detail$1({
		meta: isTall ? metaText(q, o.now) : void 0,
		title: claimRows(q, l) ? q.claim : void 0,
		titleMax: CLAIM_ROWS,
		hit: DETAIL,
		hovered: s.hover === DETAIL,
		framed: true
	}, o.width);
	const gap = isTall && head.length ? [blank()] : [];
	let room = rows - rule.length;
	head = head.slice(0, Math.max(0, room));
	room -= head.length;
	const spacer = gap.slice(0, Math.max(0, room));
	room -= spacer.length;
	const evidence = isTall && room > 0 ? detail$1({
		sections: evidenceSections$1(q, 0),
		height: room,
		hit: DETAIL,
		framed: true
	}, o.width) : [];
	return [
		...head,
		...spacer,
		...rule,
		...evidence
	];
}
/** `● docs/agents.md · wrong · seen 3× · 2 days ago      Back [esc]`: where the reader is. */
function readerHead(s, q, o, width) {
	const choice = s.set[q.id];
	const style = choice === "apply" ? {
		role: "accent",
		bold: true
	} : choice === "dismiss" ? { role: "dim" } : { role: "text" };
	const glyph = choice === "apply" ? tokens.glyph.single.on : choice === "dismiss" ? tokens.glyph.dropped : tokens.glyph.single.off;
	const back = [
		span("Back", {
			role: "text",
			bold: s.hover === BUTTONS.back || void 0,
			hit: BUTTONS.back
		}),
		span(" ", { hit: BUTTONS.back }),
		span("[esc]", {
			role: "dim",
			hit: BUTTONS.back
		})
	];
	const room = width - spansWidth(back) - tokens.gutter;
	const mark = span(glyph, choice ? style : { role: "dim" });
	const meta = span(` · ${metaText(q, o.now)}`, { role: "dim" });
	const path = span(cutLeft(q.target, Math.max(1, room - 2)), style);
	const left = truncateSpans([
		mark,
		span(" "),
		path,
		meta
	], Math.max(0, room));
	const pad = width - spansWidth(left) - spansWidth(back);
	return line([
		...left,
		span(" ".repeat(Math.max(1, pad))),
		...back
	]);
}
/** The reader under its head row: the claim whole, then one piece of evidence. */
function readerDetail(s, o, l) {
	const q = focused$1(s);
	if (!q) return void 0;
	const count = q.evidence.length;
	const piece = Math.min(s.reader ?? 0, Math.max(0, count - 1));
	const e = [...q.evidence].reverse()[piece];
	const view = e ? readEvidence(e) : void 0;
	const next = count > 1 ? {
		label: "Next",
		hotkey: "n",
		hit: BUTTONS.next,
		hovered: s.hover === BUTTONS.next,
		isQuiet: piece >= count - 1
	} : void 0;
	const room = captionRoom({
		width: o.width,
		end: next ? [span(`${next.label} [${next.hotkey}]`)] : [],
		tail: 1
	});
	const fits = (parts) => spansWidth(captionParts(parts.map((part) => [span(part)]))) <= room;
	const which = count > 1 ? `Evidence ${piece + 1} of ${count}` : "Evidence";
	const short = count > 1 ? `Evidence ${piece + 1}/${count}` : "Evidence";
	const age = e ? ageText(e.at, o.now) : "";
	const notes = view?.isMigrated ? [...view.by ? [`migrated from ${view.by}`] : [], "migrated"] : [];
	const rule = e ? [...notes.map((note) => [
		which,
		age,
		note
	]), [which, age]].find(fits) ?? [short, age] : ["No evidence filed"];
	return {
		title: q.claim,
		sections: [{
			rule,
			action: next
		}, ...evidenceSections$1(q, piece)],
		height: Math.max(1, l.body - 1),
		offset: s.scroll.detail,
		framed: true
	};
}
/** The footer: the main action, then Apply and Dismiss. Dim and inert while Close asks. */
function footerRow(s, room) {
	const keys = [
		{
			hotkey: "enter",
			label: mainLabel(s),
			hit: BUTTONS.main,
			isLit: isAnySet(s),
			essential: true
		},
		{
			hotkey: "a",
			label: "Apply",
			hit: BUTTONS.apply,
			essential: true
		},
		{
			hotkey: "d",
			label: "Dismiss",
			hit: BUTTONS.dismiss,
			essential: true
		}
	];
	if (s.confirming) {
		const row = buttonRow$1(keys, room)[0] ?? line([]);
		return line(row.spans.map(({ text }) => span(text, { role: "dim" })));
	}
	const hovered = keys.map((k) => ({
		...k,
		hovered: k.hit !== void 0 && k.hit === s.hover
	}));
	return buttonRow$1(hovered, room)[0] ?? line([]);
}
/**
* `● 3 · – 2 · 23 left`, in the rows' own glyphs, the parts that are not zero: dim, what is set to
* apply in the accent.
*/
function tally(s) {
	const { apply, dismiss, left } = counts(s);
	return [
		...apply ? [span(`${tokens.glyph.single.on} ${apply}`, { role: "accent" })] : [],
		...dismiss ? [span(`${tokens.glyph.dropped} ${dismiss}`, { role: "dim" })] : [],
		...left ? [span(`${left} left`, { role: "dim" })] : []
	].flatMap((part, i) => i ? [span(" · ", { role: "dim" }), part] : [part]);
}
/** The title and the tally where both fit, else the tally alone, else the title. */
function caption(s, room) {
	const title = span(TITLE, {
		role: "accent",
		bold: true
	});
	return [
		captionParts([[title], tally(s)]),
		tally(s),
		[title]
	].find((tier) => spansWidth(tier) <= room) ?? [];
}
/** A row set in to where the text starts: the caption's words, the paths, the buttons. */
const inset = (l, by = X) => l.spans.length ? {
	...l,
	spans: [span(" ".repeat(by)), ...l.spans]
} : l;
const padTo = (rows, n) => [...rows.slice(0, n), ...Array.from({ length: Math.max(0, n - rows.length) }, blank)];
/**
* The screen at `width` by `height` cells: every row at most `width` cells. The buttons are its
* last row: what is under it, a prompt or the window's edge, closes it.
*/
function drawScreen(s, o) {
	const setCount = s.queue.filter((q) => s.set[q.id]).length;
	const close = {
		confirming: s.confirming,
		hover: closeOf(s.hover),
		question: `Discard ${setCount}?`
	};
	const { width } = o;
	if (s.queue.length === 0) {
		const said = `No open suggestions${s.dismissed ? ` · ${s.dismissed} dismissed` : ""}`;
		const body = [line([span(said, { role: "dim" })])];
		return {
			lines: captionFrame({
				width,
				title: TITLE,
				close,
				body
			}).slice(0, captionFrameLayout.y + 1),
			zones: {}
		};
	}
	const l = layout(s, o);
	const footer = footerRow(s, l.innerWidth);
	const notice = s.notice ? line([span(s.notice, { role: "error" })]) : void 0;
	const [top, gap, noticeRow, footerLine, rule] = captionFrame({
		width,
		title: TITLE,
		caption: (room) => caption(s, room),
		close,
		body: [],
		footer,
		notice
	});
	const at = l.mode === "tall" ? captionFrameLayout.y : 1;
	let body;
	let zones;
	const q = focused$1(s);
	if (s.reader !== void 0 && q) {
		const d = readerDetail(s, o, l);
		const rows = d ? detail$1(d, o.width) : [];
		body = padTo([inset(readerHead(s, q, o, l.innerWidth)), ...rows], l.body);
		zones = { detail: [at + 1, at + l.body] };
	} else {
		const rows = list$1(listOf(s, l), l.innerWidth).map((row) => inset(row));
		const under = l.mode === "tiny" ? [] : [rule, ...focusedZone(s, o, l, l.zone)];
		body = [...padTo(rows, l.body - under.length), ...under];
		zones = { list: [at, at + l.list] };
	}
	if (l.mode === "tiny") return {
		lines: [
			top,
			...notice ? [...body.slice(0, -1), noticeRow] : body,
			footerLine
		],
		zones
	};
	return {
		lines: [
			...l.mode === "tall" ? [top, gap] : [top],
			...body,
			noticeRow,
			footerLine
		],
		zones
	};
}
/** Every suggestion's id, in the order the queue draws them. */
const order = (s) => byTarget(s.queue).flatMap(([, rows]) => rows.map((q) => q.id));
/** `s` with the keyboard on `id`; the queue's window stays where it is. */
const focusOn = (s, id) => id === void 0 || id === s.focus ? s : {
	...s,
	focus: id,
	reader: s.reader === void 0 ? void 0 : 0,
	scroll: {
		...s.scroll,
		detail: 0
	}
};
/** The queue's window moved as little as keeps the keyboard's row in it, two rows round it. */
const follow = (s, o) => ({
	...s,
	scroll: {
		...s.scroll,
		list: listFollow(listOf(s, layout(s, o)), o.width - 2 * X)
	}
});
/** The next row after `id` still left alone, round to the top; `undefined` when none is. */
function nextOpen(s, id) {
	const ids = order(s);
	const from = id === void 0 ? -1 : ids.indexOf(id);
	for (let i = 1; i <= ids.length; i++) {
		const next = ids[(from + i) % ids.length];
		if (next !== void 0 && !s.set[next]) return next;
	}
}
/** The rows of the doc `target`: the first still left alone, else its first. */
function docEntry(s, target) {
	const rows = s.queue.filter((q) => q.target === target);
	return (rows.find((q) => !s.set[q.id]) ?? rows[0])?.id;
}
/** A click on a mark steps it: left alone, apply, dismiss, left alone. */
const stepped = (choice) => choice === void 0 ? "apply" : choice === "apply" ? "dismiss" : void 0;
function scrollZone(s, o, zone, by) {
	const l = layout(s, o);
	if (zone === "list") {
		const max = listTopMax(listOf(s, l), l.innerWidth);
		const next = Math.max(0, Math.min(max, s.scroll.list + by));
		return {
			...s,
			scroll: {
				...s.scroll,
				list: next
			}
		};
	}
	const d = s.reader !== void 0 ? readerDetail(s, o, l) : void 0;
	const max = d ? detailRange(d, o.width) : 0;
	const next = Math.max(0, Math.min(max, s.scroll.detail + by));
	return {
		...s,
		scroll: {
			...s.scroll,
			detail: next
		}
	};
}
const done = (state, effect) => ({
	state,
	effect
});
/** What a key or click does: the next state, and what the client does besides drawing. */
function reduce(s, intent, o) {
	if (intent.do === "hover") return done({
		...s,
		hover: intent.hit
	});
	if (s.queue.length === 0) {
		const isClose = intent.do === "main" || intent.do === "close" || intent.do === "escape" || intent.do === "press" && closeOf(intent.hit) === "close";
		return done(s, isClose ? "close" : void 0);
	}
	if (s.confirming) {
		if (intent.do === "press" && closeOf(intent.hit) === "discard") return done(s, "close");
		if (intent.do === "main") return done(s, "close");
		if (intent.do === "press" && closeOf(intent.hit) !== "keep") return done(s);
		if (intent.do === "focus" || intent.do === "scroll") return done(s);
		return done({
			...s,
			confirming: false
		});
	}
	const q = focused$1(s);
	const isReading = s.reader !== void 0;
	switch (intent.do) {
		case "move": {
			if (isReading) return done(scrollZone(s, o, "detail", intent.by));
			const ids = order(s);
			const at = ids.indexOf(q?.id ?? "");
			const to = ids[Math.max(0, Math.min(ids.length - 1, at + intent.by))];
			return done(follow(focusOn(s, to), o));
		}
		case "set": {
			if (!q) return done(s);
			const wasSet = s.set[q.id] === intent.choice;
			const next = {
				...s,
				set: toggleChoice(s.set, [q.id], intent.choice),
				notice: void 0
			};
			if (wasSet || isReading) return done(next);
			return done(follow(focusOn(next, nextOpen(next, q.id) ?? q.id), o));
		}
		case "doc": {
			const target = intent.target ?? q?.target;
			if (target === void 0) return done(s);
			const ids = s.queue.filter((r) => r.target === target).map((r) => r.id);
			const wasSet = ids.every((id) => s.set[id] === intent.choice);
			const next = {
				...s,
				set: toggleChoice(s.set, ids, intent.choice),
				notice: void 0
			};
			if (wasSet || intent.stay || isReading) return done(next);
			return done(follow(focusOn(next, nextOpen(next, ids[ids.length - 1]) ?? q?.id), o));
		}
		case "reader": return done({
			...s,
			reader: isReading ? void 0 : 0,
			scroll: {
				...s.scroll,
				detail: 0
			}
		});
		case "back": return done({
			...s,
			reader: void 0,
			scroll: {
				...s.scroll,
				detail: 0
			}
		});
		case "next": {
			const count = q?.evidence.length ?? 0;
			if (s.reader === void 0 || s.reader >= count - 1) return done(s);
			return done({
				...s,
				reader: s.reader + 1,
				scroll: {
					...s.scroll,
					detail: 0
				}
			});
		}
		case "scroll": return done(scrollZone(s, o, intent.zone, intent.by));
		case "main": return done(s, isAnySet(s) ? "submit" : "close");
		case "close": return isAnySet(s) ? done({
			...s,
			confirming: true,
			hover: void 0
		}) : done(s, "close");
		case "escape":
			if (isReading) return reduce(s, { do: "back" }, o);
			return reduce(s, { do: "close" }, o);
		case "focus":
		case "press": {
			const { hit } = intent;
			const row = idOf(hit, "row:") ?? idOf(hit, "mark:");
			if (row !== void 0) {
				const there = focusOn(s, row);
				if (intent.do === "focus" || !hit.startsWith("mark:")) return done(there);
				const choice = stepped(there.set[row]);
				const set = { ...there.set };
				if (choice) set[row] = choice;
				else delete set[row];
				return done({
					...there,
					set,
					notice: void 0
				});
			}
			const doc = idOf(hit, "doc:");
			if (doc !== void 0) return done(focusOn(s, docEntry(s, doc)));
			if (intent.do === "focus") return done(s);
			const all = /^all:(apply|dismiss):(.*)$/.exec(hit);
			if (all) return reduce(s, {
				do: "doc",
				choice: all[1],
				target: all[2],
				stay: true
			}, o);
			const next = {
				[DETAIL]: { do: "reader" },
				[BUTTONS.main]: { do: "main" },
				[BUTTONS.apply]: {
					do: "set",
					choice: "apply"
				},
				[BUTTONS.dismiss]: {
					do: "set",
					choice: "dismiss"
				},
				[BUTTONS.evidence]: { do: "reader" },
				[BUTTONS.back]: { do: "back" },
				[BUTTONS.next]: { do: "next" },
				"frame:close": { do: "close" }
			}[hit];
			return next ? reduce(s, next, o) : done(s);
		}
	}
}
/** A step the page keys take: a window less one row, so a line stays in view. */
const page = (s, o) => {
	const l = layout(s, o);
	return Math.max(1, (s.reader === void 0 ? l.list : l.body - 1) - 2);
};
/**
* What a key does, by name: `up`, `down`, `pageup`, `pagedown`, `enter`, `escape`, or the
* character typed. `undefined` for a key the screen does not take.
*/
function keyIntent(key, s, o) {
	if (s.confirming) {
		if (key === "enter") return {
			do: "press",
			hit: "frame:discard"
		};
		return {
			do: "press",
			hit: "frame:keep"
		};
	}
	const zone = s.reader === void 0 ? "list" : "detail";
	switch (key) {
		case "up":
		case "k": return {
			do: "move",
			by: -1
		};
		case "down":
		case "j": return {
			do: "move",
			by: 1
		};
		case "pageup": return {
			do: "scroll",
			zone,
			by: -page(s, o)
		};
		case "pagedown": return {
			do: "scroll",
			zone,
			by: page(s, o)
		};
		case "enter": return { do: "main" };
		case "escape": return { do: "escape" };
		case "a": return {
			do: "set",
			choice: "apply"
		};
		case "d": return {
			do: "set",
			choice: "dismiss"
		};
		case "A": return o.wholeDoc ? {
			do: "doc",
			choice: "apply"
		} : void 0;
		case "D": return o.wholeDoc ? {
			do: "doc",
			choice: "dismiss"
		} : void 0;
		case "e": return { do: "reader" };
		case "n": return { do: "next" };
	}
}
/** The zone of the screen row `y`, for the wheel. */
function zoneAt(zones, y) {
	if (zones.list && y >= zones.list[0] && y < zones.list[1]) return "list";
	if (zones.detail && y >= zones.detail[0] && y < zones.detail[1]) return "detail";
}
/** Every control's `hit` the screen draws, for a client that asks whether one is its own. */
const isScreenHit = (hit) => /^(row|mark|doc|all|frame):/.test(hit) || hit === "detail" || Object.values(BUTTONS).includes(hit);

// ../../lib/kits/band/src/terminal.ts
/** The status band as styled lines: the one drawing both terminals paint. */
/** The mark of each status in a terminal. */
const statusGlyph = (status) => status === "success" ? tokens.glyph.done : status === "error" ? tokens.glyph.times : tokens.glyph.status.warning;
/**
* The band's line: the status mark and the text in the status's role, the hint dim after it,
* and the whole line one control. The text is cut with `…` so the hint stays whole.
* @param width The room in cells.
*/
function statusBand$1({ text, hint, hit, status = "warning", hovered }, width) {
	const tail = ` ${hint}`;
	const room = Math.max(1, width - cellWidth(tail));
	const head = truncateSpans([span(`${statusGlyph(status)} ${text}`, {
		role: status,
		bold: hovered
	})], room);
	return [line([...head, span(tail, {
		role: "dim",
		bold: hovered
	})], hit)];
}

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
const CLAUDE_MD = "skills/agent-plugin-dev/references/claude.md, VS Code quirks (extension 2.1.327)";
const TYPES = "claude-code types, Elements (apps/*/dist/.claude-plugin/types/claude-code/index.d.ts, `pnpm drive types <app>`)";
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
		images: fact(false, "pi-tui has no image component", "pi-tui exports (no Image)")
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
		images: fact(true, "the terminal's table has an `Image`", TYPES + ", Elements.terminal")
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
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: fact(false, "a Button's label never wraps; a long one overflows a narrow pane", CLAUDE_MD),
		images: unverified("the table has no `Image`")
	},
	desktop: {
		drawing: "gui",
		keyFocus: unverified(),
		hover: unverified(),
		hotkeys: unverified(),
		window: unverified(),
		framesPane: unverified(),
		inputRows: unverified(),
		input: unverified("the table has an `Input`"),
		select: unverified("the table has a `Select`"),
		progress: unverified("the table has a `Progress`"),
		svg: fact(true, "drawn as an image, or in a sandboxed frame when `isInteractive`", TYPES + ", SvgProps; never driven"),
		textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
		boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
		labelWraps: unverified(),
		images: unverified("the table has no `Image`")
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
		images: unverified("the table has no `Image`")
	}
};
/** What the table says of one capability on one surface: `undefined` when unverified. */
const factOf = (surface, cap) => {
	const f = surfaces[surface][cap];
	return "unverified" in f ? void 0 : f;
};
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
* The arguments of `$.ui.open` for a pane: yours, with the house style's (transparent, no fill)
* added. A pane is always opened through this.
* @param extra `id`, `title`, `focus`, `rows` and the rest of what the pane takes.
*/
const paneOptions = (extra) => ({
	...extra,
	backgroundColor: tokens.pane.backgroundColor
});

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
/** Where the engine's focus ring is kept, and the stops either side that an arrow reaches. */
const RING = {
	up: "kit-ring-up",
	park: "kit-ring",
	down: "kit-ring-down"
};
/** The address of a button that carries one key and draws nothing. */
const keyAddress = (key) => `kit-key-${key}`;
/**
* The keyboard's half of a site where the kit draws its own focus: nothing here is drawn. Put
* it first in the site: the engine keeps its ring by a button's place among the site's buttons,
* so one drawn after rows that come and go ends up on a row. The
* engine's ring rests on the middle button, so Enter acts on what the kit drew focus on; the
* two round it are where an arrow or Tab would take the ring, which the mod's `ui.focus` hook
* turns into a move (see `ringMove`). The rest carry the keys the site binds: a plain Button
* that shows its own hotkey prints it before its label, so the visible rows cannot carry them.
* @param enter What Enter does: the action of the focused control.
* @param keys One lowercase letter or digit each.
*/
function ring(k, enter, keys = []) {
	const { Box, Button } = k;
	return /* @__PURE__ */ h(Box, {
		width: 0,
		height: 0,
		overflow: "hidden"
	}, /* @__PURE__ */ h(Button, {
		key: RING.up,
		plain: true,
		label: "previous",
		onPress: () => void 0
	}), /* @__PURE__ */ h(Button, {
		key: RING.park,
		plain: true,
		autoFocus: true,
		label: "act",
		onPress: enter
	}), /* @__PURE__ */ h(Button, {
		key: RING.down,
		plain: true,
		label: "next",
		onPress: () => void 0
	}), keys.map(({ key, press }) => /* @__PURE__ */ h(Button, {
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
/**
* What the ring trying to move onto `element` means for the kit's own focus, for a mod's
* `ui.focus` hook: a step up or down, a control the person clicked, or nothing (the ring was
* headed for the parked button, or for something that is not the kit's). Whenever this answers,
* the hook applies it to its state and lands the ring back: `next({ ...e, element: RING.park })`.
* @param isControl Whether `element` is one of the site's own controls: a painted `hit`.
*/
function ringMove(element, isControl) {
	if (!element || element === RING.park) return void 0;
	if (element === RING.up) return { by: -1 };
	if (element === RING.down) return { by: 1 };
	if (element.startsWith(keyAddress(""))) return { by: 0 };
	const hit = element.replace(/#\d+$/, "");
	return isControl(hit) ? { hit } : void 0;
}
/**
* One line saying how to move the keyboard between the prompt and the site that draws this,
* for wherever the kit's keys live. A click on a pane or the band gives it the keyboard too,
* so the line is itself somewhere to click.
* @param held Whether the site holds the keyboard, as far as the mod knows. The engine says
* when the ring moves in a site (`ui.focus`), when the person types in the prompt
* (`prompt.edit`, `prompt.change`) and when a transcript row is pressed (`ui.press` on a
* `Placed`), but not when Escape hands the keyboard back, so both ways stay on show and
* `held` only lights one.
* @param canLeave Whether Escape goes back to the prompt: true in the band, false in a pane
* that Escape closes, which then says nothing while it holds the keyboard.
*/
function keysHint(k, held, canLeave = false, indent = 0) {
	const { Box, Text } = k;
	if (held && !canLeave) return null;
	const way = (label, key, isLit) => /* @__PURE__ */ h(Text, { key }, /* @__PURE__ */ h(Text, {
		bold: isLit || void 0,
		dimColor: !isLit || void 0
	}, `${label} `), /* @__PURE__ */ h(Text, {
		backgroundColor: isLit ? HOVER_FILL : void 0,
		bold: isLit || void 0,
		dimColor: !isLit || void 0
	}, isLit ? ` ${key} ` : key));
	return /* @__PURE__ */ h(Box, {
		columnGap: 3,
		paddingLeft: indent
	}, way("Keys here", "ctrl+x tab", !held), canLeave ? way("Back to prompt", "esc", held) : null);
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
* Blocks of a pane under each other, a step apart: the column a mod lays the kit's drawings in.
* Parts that are `null` are left out.
*/
function blocks(g, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.md
	}, parts.filter(Boolean));
}
/** `word` with its first letter in capitals: a graphical button's label, which has no key beside it. */
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/**
* Styled spans as one `Text`: a nested run per span, in its role and face. A span's `hit` is not
* a control here: a graphical control is a `Button`, which a component draws itself.
* @param spans A caption or a line of a contract, as `terminal.ts` takes it.
*/
function spans(g, list) {
	const { Text } = g.els;
	return /* @__PURE__ */ h(Text, null, list.map((s, i) => /* @__PURE__ */ h(Text, {
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
	priorityLow: "<path d=\"M4 13v-2.6\"/><path d=\"M8 13V7.4\" stroke-opacity=\".35\"/><path d=\"M12 13V4.4\" stroke-opacity=\".35\"/>",
	priorityMedium: "<path d=\"M4 13v-2.6M8 13V7.4\"/><path d=\"M12 13V4.4\" stroke-opacity=\".35\"/>",
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

// ../../lib/kits/band/src/gui.tsx
/** The status band on the graphical surfaces: an icon, the text and quiet buttons. */
/**
* The band's line: the status mark, the text, a quiet way-in button (`hint`) and a quiet button
* per further action, at the inset. A button's `hit` goes to `g.press`.
*/
function statusBand(g, { text, hint, hit, status = "warning", actions = [] }, options = {}) {
	const { Box, Button, Text } = g.els;
	const isOneLine = Boolean(options.isOneLine);
	const mark = icon(g, options.icon ?? status, { tone: options.tone ?? status });
	const words = /* @__PURE__ */ h(Box, {
		flexShrink: 1,
		flexGrow: isOneLine ? 1 : void 0
	}, /* @__PURE__ */ h(Text, { wrap: isOneLine ? "truncate-end" : void 0 }, options.text ?? text));
	const buttons = [/* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: capital(hint),
		onPress: () => g.press?.(hit)
	}), ...actions.map((a) => /* @__PURE__ */ h(Button, {
		key: a.hit,
		dimColor: true,
		label: capital(a.label),
		onPress: () => g.press?.(a.hit)
	}))];
	const { across, space } = tokens.gui;
	if (actions.length === 0 || isOneLine) return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		columnGap: across.sm,
		alignItems: "center",
		paddingX: across.inset
	}, mark, words, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexShrink: 0,
		columnGap: across.xs
	}, buttons));
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.xs,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		columnGap: across.sm
	}, mark, words), /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.xs
	}, buttons));
}

// ../../lib/kits/buttons/src/gui.tsx
/**
* A row of actions at the inset: a Button each, the suggested one filled and the rest quiet
* (VS Code paints a Button by its `dimColor` alone, so the variant follows it). The host wraps
* the row, so nothing drops and `wrap`, `essential`, `isQuiet` and `hover` have nothing to do.
* A keyboard-only hint (no `hit`) is not drawn: a surface with a pointer has no use for a key
* and no place to show one.
* @param buttons The actions; a label is capitalised unless it is `isLiteral`.
* @param options `lead` is drawn as text before the first Button.
* @returns `null` when there is nothing to draw.
*/
function buttonRow(g, buttons, { lead } = {}) {
	const { Box, Button } = g.els;
	const drawn = buttons.filter((b) => b.hit !== void 0);
	if (drawn.length === 0 && !lead?.length) return null;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.gui.across.xs,
		rowGap: tokens.gui.space.xs,
		paddingX: tokens.gui.across.inset
	}, lead?.length ? spans(g, lead) : null, drawn.map((b) => /* @__PURE__ */ h(Button, {
		key: b.hit,
		variant: b.isLit ? "primary" : void 0,
		dimColor: !b.isLit || void 0,
		label: b.isLiteral ? b.label : capital(b.label),
		onPress: () => g.press?.(b.hit)
	})));
}

// ../../lib/kits/prose/src/gui.tsx
/** Prose on the graphical surfaces: the host's own `Markdown`, as it draws a reply. */
/**
* A text of several blocks, at the inset every block of a pane has. The host sets it and wraps
* it; the surface scrolls, so there is no window.
* @param text Prose or Markdown.
* @param options `excerpt` folds a long passage to its first line with a `More` Button.
*/
function prose(g, text, { isDim, excerpt } = {}) {
	const { Box, Button, Markdown, Text } = g.els;
	const { across, space } = tokens.gui;
	const words = /* @__PURE__ */ h(Markdown, {
		text,
		dimColor: isDim || void 0
	});
	const isLong = text.includes("\n") || cellWidth(text) > tokens.gui.excerptCells;
	if (!excerpt || !isLong) return /* @__PURE__ */ h(Box, { paddingX: across.inset }, words);
	const { hit, isOpen } = excerpt;
	const toggle = /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: isOpen ? "Less" : "More",
		onPress: () => g.press?.(hit)
	});
	if (!isOpen) return /* @__PURE__ */ h(Box, {
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
	}, spans(g, inline(text.replace(/\s*\n\s*/g, " "))))), /* @__PURE__ */ h(Box, { flexShrink: 0 }, toggle));
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.sm,
		paddingX: across.inset,
		paddingY: space.sm,
		backgroundColor: tokens.gui.fill,
		borderStyle: "round",
		borderColor: "#00000000"
	}, words, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		justifyContent: "flex-end"
	}, toggle));
}

// ../../lib/kits/detail/src/gui.tsx
/** The detail on the graphical surfaces: a meta line, a title, sections of text and keyed rows. */
const { across, space } = tokens.gui;
/** A rule's dim words, and its action at the far edge as a quiet Button: the style allows no drawn line across. */
function ruleOf(g, s, key) {
	const { Box, Button, Text } = g.els;
	const parts = (typeof s.rule === "string" ? [s.rule] : s.rule ?? []).filter(Boolean);
	const action = s.action?.hit === void 0 ? void 0 : s.action;
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: across.md,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Text, {
		dimColor: true,
		weight: "semibold"
	}, parts.join("  ·  "))), /* @__PURE__ */ h(Box, { flexGrow: 1 }), action ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, /* @__PURE__ */ h(Button, {
		key: action.hit,
		dimColor: true,
		label: capital(action.label),
		onPress: () => g.press?.(action.hit)
	})) : null);
}
/** Keyed rows: the keys in one dim column, each value wrapped beside its key. */
function itemsOf(g, items, key) {
	const { Box, Text } = g.els;
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "column",
		rowGap: space.xs,
		paddingX: across.inset
	}, items.map((item, i) => /* @__PURE__ */ h(Box, {
		key: `${key}:${i}`,
		flexDirection: "row",
		flexWrap: "nowrap",
		columnGap: across.md
	}, /* @__PURE__ */ h(Box, {
		flexShrink: 0,
		minWidth: tokens.gui.labelColumn
	}, /* @__PURE__ */ h(Text, { dimColor: true }, item.key)), /* @__PURE__ */ h(Box, {
		flexGrow: 1,
		flexShrink: 1
	}, /* @__PURE__ */ h(Text, { italic: item.isQuote || void 0 }, item.isQuote ? `“${item.value}”` : item.value)))));
}
function sectionOf(g, s, i) {
	const { Box, Text } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: `s${i}`,
		flexDirection: "column",
		rowGap: space.xs
	}, s.rule !== void 0 ? ruleOf(g, s, `s${i}:rule`) : null, s.heading ? /* @__PURE__ */ h(Box, {
		key: `s${i}:head`,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Text, {
		dimColor: true,
		weight: "semibold"
	}, s.heading)) : null, s.text ? prose(g, s.text) : null, s.items?.length ? itemsOf(g, s.items, `s${i}:items`) : null);
}
/**
* One item read whole: a dim meta line, a semibold title, then sections a step apart, each under
* a rule or a dim heading, of Markdown and of keyed rows. The surface scrolls, so there is no
* `height`, `offset` nor frame. With a `hit` a quiet Button, `action` ("Open") its word, sits
* under the title (a Button never wraps), or at the first row's far edge with `isActionAtEdge`.
*/
function detail(g, d, options = {}) {
	const { Box, Button, Text } = g.els;
	const hit = d.hit;
	const title = d.title ? /* @__PURE__ */ h(Text, { weight: "semibold" }, spans(g, inline(d.title))) : null;
	const isEdge = Boolean(options.isActionAtEdge) && hit !== void 0;
	const button = hit !== void 0 ? /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: options.action ?? "Open",
		onPress: () => g.press?.(hit)
	}) : null;
	const first = (words) => isEdge ? /* @__PURE__ */ h(Box, {
		key: "first",
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		justifyContent: "space-between",
		columnGap: across.md
	}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, words), /* @__PURE__ */ h(Box, { flexShrink: 0 }, button)) : words;
	const head = d.meta || d.title ? /* @__PURE__ */ h(Box, {
		key: "head",
		flexDirection: "column",
		rowGap: space.xs,
		paddingX: across.inset
	}, d.meta ? first(/* @__PURE__ */ h(Text, { dimColor: true }, d.meta)) : null, d.meta ? title : first(title ?? /* @__PURE__ */ h(Text, null))) : null;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.md
	}, head, hit !== void 0 && !isEdge ? /* @__PURE__ */ h(Box, {
		key: "open",
		paddingX: across.inset
	}, button) : null, (d.sections ?? []).map((s, i) => sectionOf(g, s, i)));
}

// ../../lib/kits/frame/src/gui.tsx
/**
* Close's question, once it asks: the words and a Button each for Discard and Keep, both quiet
* as the terminal draws them. Close itself is the host's, so it is not drawn while nothing is
* asked.
*/
function closeRow(g, close) {
	const { Box, Button, Text } = g.els;
	if (!close?.confirming) return null;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.gui.across.xs,
		rowGap: tokens.gui.space.xs
	}, /* @__PURE__ */ h(Text, { color: "warning" }, close.question ?? "Discard answers?"), /* @__PURE__ */ h(Button, {
		label: capital("discard"),
		dimColor: true,
		onPress: () => g.press?.(closeHit("discard"))
	}), /* @__PURE__ */ h(Button, {
		label: capital("keep"),
		dimColor: true,
		onPress: () => g.press?.(closeHit("keep"))
	}));
}
/** The words of a head: its caption, or its title unless it repeats the host's. */
function words(g, f, o) {
	const { Text } = g.els;
	if (o.head) return o.head;
	const caption = typeof f.caption === "function" ? f.caption(1e400) : f.caption;
	if (caption?.length) return spans(g, caption);
	if (!f.title || f.title === o.hostTitle) return null;
	return /* @__PURE__ */ h(Text, { weight: "semibold" }, f.title);
}
/** The toolbar line both heads are: words at the start, Close's question at the far edge. */
function head(g, f, options = {}) {
	const { Box, Button } = g.els;
	const left = words(g, f, options);
	const asked = closeRow(g, f.close);
	const acts = (options.actions ?? []).filter((b) => b.hit !== void 0);
	if (!left && !asked && acts.length === 0) return null;
	const right = asked || acts.length > 0 ? /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.gui.across.xs,
		rowGap: tokens.gui.space.xs
	}, asked, f.close?.confirming ? null : acts.map((b) => /* @__PURE__ */ h(Button, {
		key: b.hit,
		variant: b.isLit ? "primary" : void 0,
		dimColor: !b.isLit || void 0,
		label: capital(b.label),
		onPress: () => g.press?.(b.hit)
	}))) : null;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "space-between",
		columnGap: tokens.gui.across.md,
		rowGap: tokens.gui.space.xs,
		paddingX: tokens.gui.across.inset
	}, left, right);
}
/**
* A frame's top: the pane's toolbar line. Its title is semibold and left out where it repeats
* `hostTitle`; a `caption` replaces it, drawn in its own roles. Close is the host's, so it
* appears only as the question it asks, with Discard and Keep.
*/
function frameTop(g, f, options = {}) {
	return head(g, f, options);
}

// ../../lib/kits/list/src/gui.tsx
/** The list on the graphical surfaces: groups under a heading, rows as full-width Buttons. */
/** What each mark is called for a reader who cannot see its icon. */
const MARK_TEXT = {
	open: "Left alone",
	chosen: "Chosen",
	dropped: "Set aside"
};
/** What a press on a `markHit` Button does: it steps the mark on, in the order of `ListMark`. */
const STEP_TEXT = {
	open: "Choose",
	chosen: "Set aside",
	dropped: "Restore"
};
/** A row's mark: an icon. */
function markOf(g, mark) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		key: "mark",
		flexShrink: 0,
		height: 1,
		alignItems: "center"
	}, icon(g, mark, {
		tone: mark === "chosen" ? "accent" : "neutral",
		alt: MARK_TEXT[mark]
	}));
}
/** The control a `markHit` is: a quiet Button naming what a press changes the row to (never filled: many rows may be chosen). */
function markButton(g, r, mark) {
	const { Box, Button } = g.els;
	const hit = r.markHit;
	if (hit === void 0 || r.disabled) return null;
	return /* @__PURE__ */ h(Box, {
		key: "markHit",
		flexShrink: 0
	}, /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: STEP_TEXT[mark],
		onPress: () => g.press?.(hit)
	}));
}
/** One row: its mark, its text wrapped, its aside and Buttons dim at the far edge. */
function rowOf(g, r, key, hasMarks, action, isCut) {
	const { Box, Button, Text } = g.els;
	const mark = r.mark ?? "open";
	const isDim = r.disabled || mark === "dropped";
	const words = spans(g, r.literal ? literal(r.text) : inline(r.text));
	const hit = r.hit;
	const open = hit !== void 0 && !r.disabled ? /* @__PURE__ */ h(Box, {
		key: "open",
		flexShrink: 0
	}, /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: r.action ?? action,
		onPress: () => g.press?.(hit)
	})) : null;
	const stepper = mark === "none" ? null : markButton(g, r, mark);
	const twoButtons = open !== null && stepper !== null;
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "flex-start",
		columnGap: tokens.gui.across.sm,
		paddingX: tokens.gui.across.inset
	}, hasMarks && mark !== "none" ? markOf(g, mark) : null, /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		flexGrow: 1,
		flexShrink: 1,
		rowGap: tokens.gui.space.xs
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "flex-start",
		columnGap: tokens.gui.across.md
	}, /* @__PURE__ */ h(Box, {
		width: 0,
		flexGrow: 1,
		flexShrink: 1,
		overflow: "hidden"
	}, /* @__PURE__ */ h(Text, {
		dimColor: isDim || void 0,
		wrap: isCut ? "truncate-end" : void 0
	}, words)), r.aside ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, /* @__PURE__ */ h(Text, { dimColor: true }, r.aside)) : null, twoButtons ? null : open ?? stepper), twoButtons ? /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: tokens.gui.across.xs
	}, open, stepper) : null));
}
/** A group's heading: its label semibold, its controls quiet Buttons at the far edge. */
function headingOf(g, group, key, action) {
	const { Box, Button, Text } = g.els;
	const label = /* @__PURE__ */ h(Text, {
		weight: "semibold",
		color: group.active ? "claude" : void 0
	}, group.label);
	const hit = group.hit;
	const actions = (group.actions ?? []).filter((a) => a.hit);
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: tokens.gui.across.md,
		paddingX: tokens.gui.across.inset
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexGrow: 1,
		flexShrink: 1,
		alignItems: "center",
		columnGap: tokens.gui.across.sm
	}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, label), group.done ? /* @__PURE__ */ h(Box, { flexShrink: 0 }, icon(g, "success", {
		tone: "success",
		alt: "Decided"
	})) : null), hit !== void 0 ? /* @__PURE__ */ h(Box, {
		key: "open",
		flexShrink: 0
	}, /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: action,
		onPress: () => g.press?.(hit)
	})) : null, actions.map((a) => /* @__PURE__ */ h(Box, {
		key: `a:${a.hit}`,
		flexShrink: 0
	}, /* @__PURE__ */ h(Button, {
		key: a.hit,
		dimColor: true,
		label: capital(a.label),
		onPress: () => g.press?.(a.hit)
	}))));
}
/**
* Groups of rows under a heading, a step apart. The host scrolls the pane, so there is no window
* (`height`, `top`), no rails, no flat rows and no key; a row's text wraps whole, or with `lines: 1`
* is one line the surface cuts at its edge. A group of more
* than `maxItems` rows shows that many, then an `N more` Button (`more`).
*/
function list(g, l, options = {}) {
	const { Box, Button } = g.els;
	const { space, across } = tokens.gui;
	const action = options.action ?? "Open";
	const max = options.maxItems ?? tokens.gui.maxItems;
	const opened = options.opened ?? {};
	const closeAction = options.closeAction ?? "Close";
	const isCut = l.lines === 1;
	const hasMarks = l.groups.some((group) => group.rows.some((r) => r.mark !== "none"));
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.md
	}, l.groups.map((group, i) => {
		const capped = options.more && !options.more.isAll && group.rows.length > max;
		const isOpened = (r) => r.hit !== void 0 && opened[r.hit] !== void 0;
		const shown = capped ? group.rows.filter((r, n) => n < max || isOpened(r)) : group.rows;
		const left = group.rows.length - shown.length;
		return /* @__PURE__ */ h(Box, {
			key: `g${i}`,
			flexDirection: "column",
			rowGap: space.xs
		}, group.label ? headingOf(g, group, `g${i}:head`, action) : null, /* @__PURE__ */ h(Box, {
			flexDirection: "column",
			rowGap: space.xs
		}, shown.flatMap((r, n) => {
			const under = r.hit === void 0 ? void 0 : opened[r.hit];
			const row = rowOf(g, r, `g${i}:r${n}`, hasMarks, under ? closeAction : action, isCut && !under);
			return under ? [/* @__PURE__ */ h(Box, {
				key: `g${i}:r${n}:opened`,
				flexDirection: "column",
				rowGap: space.sm,
				paddingY: space.sm,
				backgroundColor: tokens.gui.fill,
				borderStyle: "round",
				borderColor: "#00000000"
			}, row, under)] : [row];
		})), capped && options.more ? /* @__PURE__ */ h(Box, {
			key: `g${i}:more`,
			paddingX: across.inset
		}, /* @__PURE__ */ h(Button, {
			key: `g${i}:more:${options.more.hit}`,
			dimColor: true,
			label: `${left} more`,
			onPress: () => g.press?.(options.more.hit)
		})) : null);
	}));
}

// ../../lib/kits/notice/src/gui.tsx
const MARKED = {
	success: "success",
	warning: "warning",
	error: "error"
};
/**
* One line telling the person what just happened: an icon for a state (success, warning,
* error) and the text in its role at the inset. The surface wraps it; width is not a prop.
* @param text Words, or spans where part of the line stands out; a span with no role takes the status's.
* @param status Success, warning and error only for an actual state. @default "warning"
*/
function notice(g, text, status = "warning", { isCut, isFlush } = {}) {
	const { Box, Text } = g.els;
	const mark = MARKED[status];
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: tokens.gui.across.sm,
		paddingX: isFlush ? void 0 : tokens.gui.across.inset
	}, mark ? icon(g, mark, {
		tone: status,
		alt: status
	}) : null, /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Text, {
		wrap: isCut ? "truncate-end" : void 0,
		...roleProps(status)
	}, typeof text === "string" ? text : spans(g, text))));
}
/**
* What a list says when there is nothing in it: dim, at the inset, wrapped by the surface.
* @param text Say what is missing and, if it helps, what makes rows appear.
*/
function emptyState(g, text, options = {}) {
	const { Box, Text } = g.els;
	return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, /* @__PURE__ */ h(Text, { dimColor: true }, options.text ?? text));
}

// src/claude/evidence.ts
/**
* The evidence, newest first: one piece under a rule that says `Evidence`, the row's meta line
* saying how old it is; several each start under a dated rule.
*/
function evidenceSections(items) {
	const isSingle = items.length === 1;
	return [...items].reverse().flatMap((e) => {
		const view = readEvidence(e);
		const sections = evidenceBlocks(view).map((b) => ({
			heading: b.heading || void 0,
			text: b.lines.join("\n") || void 0,
			items: b.items?.map((c) => ({
				key: c.kind,
				value: c.value,
				isQuote: c.kind === "quote"
			}))
		}));
		const rule = isSingle ? "Evidence" : evidenceLabel(view);
		if (sections.length === 0) return [{ rule }];
		return sections.map((s, i) => i === 0 ? {
			...s,
			rule
		} : s);
	});
}

// src/claude/queue.tsx
/**
* The queue on Desktop and VS Code, drawn with the kit's `gui.tsx` functions: the toolbar from
* `frame`, the rows from `list` (a row opens in place), the opened claim's evidence from
* `detail`, the actions from `buttons`, and a message from `notice`. The host scrolls the pane
* and frames it, so there are no rows to count here. Every control is a `hit` that `g.press`
* hands to the mod's reducer.
*/
const SUBMIT = "submit";
const MORE = "more";
const CHOICES = [
	"apply",
	"dismiss",
	"skip"
];
/** The control that sets suggestion `id` to a choice, or back to none. */
const choiceHit = (choice, id) => `${choice}:${id}`;
/** What a `hit` of the queue is, or undefined for one that is not its own. */
function readHit(hit) {
	if (hit === "submit" || hit === "more") return { kind: hit };
	const at = hit.indexOf(":");
	if (at < 0) return void 0;
	const head = hit.slice(0, at);
	const id = hit.slice(at + 1);
	if (head === "row") return {
		kind: "row",
		id
	};
	const choice = CHOICES.find((c) => c === head);
	return choice ? {
		kind: "choice",
		choice,
		id
	} : void 0;
}
/** `seen 3× · 2 days ago`: the row says its kind, so the meta line does not. */
const metaOf = (q, now) => [seen(q) > 1 ? `seen ${seen(q)}×` : "", ageText(q.updated, now)].filter(Boolean).join(" · ");
/** One opened suggestion: its meta line and evidence, then what to do with it. */
function opened(g, q, now) {
	return blocks(g, detail(g, {
		meta: metaOf(q, now),
		sections: evidenceSections(q.evidence)
	}), buttonRow(g, CHOICES.map((choice) => ({
		hotkey: "",
		label: choice,
		hit: choiceHit(choice, q.id)
	}))));
}
/** The queue grouped by doc. A row says what it is set to by its mark, and what it is by its kind. */
function queueList(g, v) {
	const groups = byTarget(v.queue).map(([target, rows]) => ({
		label: target,
		rows: rows.map((q) => ({
			text: q.claim,
			mark: v.set[q.id] === "apply" ? "chosen" : v.set[q.id] === "dismiss" ? "dropped" : "open",
			aside: q.kind,
			hit: rowHit(q.id)
		}))
	}));
	const open = Object.fromEntries(v.queue.filter((q) => v.open.has(q.id)).map((q) => [rowHit(q.id), opened(g, q, v.now)]));
	return list(g, {
		groups,
		lines: 1
	}, {
		more: {
			isAll: v.isAll,
			hit: MORE
		},
		opened: open
	});
}
/**
* The pane: the toolbar (the count, what closing will do, and Submit, which is filled only once
* something is set), a message when something went wrong, then the queue or why it is empty.
*/
function queuePane(g, v) {
	const summary = choiceSummary(v.queue.map((s) => v.set[s.id]));
	const caption = v.queue.length ? [span(`${v.queue.length} open`, { role: "dim" }), ...summary ? [span(` · On close: ${summary}`)] : []] : [];
	return blocks(g, frameTop(g, {
		title: TITLE,
		caption
	}, {
		hostTitle: TITLE,
		actions: v.queue.length ? [{
			hotkey: "",
			label: "submit",
			hit: SUBMIT,
			isLit: Boolean(summary)
		}] : void 0
	}), v.said.text ? notice(g, v.said.text, v.said.status) : null, v.queue.length ? queueList(g, v) : emptyState(g, "Nothing to review: no open doc suggestions in this repo. An agent files one when a doc it reads no longer matches the code."));
}

// src/claude.tsx
/**
* The Claude Code half of docfix: the tool, the /docfix pane, the status-line count and the read
* reminder. What a call does to the queue is the core's (`../core/docfix.ts`), the one pi's half
* runs.
*
* While any are open, a band above the prompt counts them; a click on it opens the pane.
*
* In the terminal the pane is the screen pi draws too (`../core/screen.ts`), painted by the kit
* with its own focus: each suggestion is set to apply, dismiss or neither, and the main action
* carries that out: the dismissed ones are kept as dismissed, and the applied ones are drafted as
* one prompt in the person's prompt box, never sent. Close asks before it throws the choices away.
*
* Desktop and VS Code keep their graphical pane: a row starts folded and opens to its claim and
* evidence, and closing the pane carries the choices out.
*/
const PANE = "docfix";
/** The control the band above the prompt is: a click on it opens the pane. */
const BAND = "docfix:open";
const queue = atom({
	plugin: "docfix",
	key: "queue"
}, [], { shape: "queue-1" });
const choices = atom({
	plugin: "docfix",
	key: "choices"
}, {}, { shape: "choices-1" });
/** The key of the pane element holding the focus ring, on a graphical surface. */
const focused = atom({
	plugin: "docfix",
	key: "focused"
}, null);
const expanded = atom({
	plugin: "docfix",
	key: "expanded"
}, [], { shape: "expanded-3" });
/** Whether the rest of a long queue is shown: a graphical surface lists the first few. */
const showAll = atom({
	plugin: "docfix",
	key: "showAll"
}, false);
/** Whether the pane is up: the band above the prompt steps aside while it is. */
const paneShown = atom({
	plugin: "docfix",
	key: "paneShown"
}, false);
const said = atom({
	plugin: "docfix",
	key: "notice"
}, {
	text: "",
	status: "warning"
}, { shape: "notice-4" });
/** The terminal screen's own state; what is set lives in `choices`, as on a graphical surface. */
const view = atom({
	plugin: "docfix",
	key: "view"
}, {
	focus: null,
	reader: null,
	scroll: {
		list: 0,
		detail: 0
	},
	confirming: false,
	dismissed: 0
}, { shape: "view-1" });
/** Whether the pane holds the keyboard, as far as the engine says: it lights the keyboard hint. */
const keys = atom({
	plugin: "docfix",
	key: "keys"
}, false, { shape: "keys-1" });
const say = ($, text, status = "warning") => update($, said, () => ({
	text,
	status
}));
async function rootOf($, cwd) {
	const top = await $.process.run([
		"git",
		"rev-parse",
		"--show-toplevel"
	], { cwd }).catch(() => null);
	return top?.exitCode === 0 ? top.stdout.trim() : "";
}
async function place($) {
	const root = await rootOf($, await $.session.cwd());
	if (!root) return "not inside a git repository, so there are no repo docs to file against";
	const store = `${root}/.agents/store`;
	if (!await $.fs.exists(store)) {
		await $.process.run([
			"agent-notes",
			"root",
			"--ensure",
			"--path",
			root
		]).catch(() => null);
		if (!await $.fs.exists(store)) return "this checkout has no note store (.agents/store); run `agent-notes root --ensure`";
	}
	return {
		root,
		dir: `${store}/${STORE_DIR}`
	};
}
/** `<session>\0<doc>` for each doc a session was reminded of, so each gets one reminder. */
const reminded = /* @__PURE__ */ new Set();
/**
* The reminder for docs this session hasn't read yet, or undefined; only in a checkout with a
* store, since without one there is nowhere to file.
*/
async function reminderFor($, paths) {
	if (paths.length === 0) return void 0;
	const cwd = await $.session.cwd();
	const root = await rootOf($, cwd);
	if (!root || !await $.fs.exists(`${root}/.agents/store`)) return void 0;
	const session = await $.session.id();
	const fresh = docTargets(paths, cwd, root).filter((t) => !reminded.has(`${session}\0${t}`));
	const tracked = [];
	for (const target of fresh) if ((await $.process.run([
		"git",
		"ls-files",
		"--error-unmatch",
		"--",
		target
	], { cwd: root })).exitCode === 0) tracked.push(target);
	for (const target of tracked) reminded.add(`${session}\0${target}`);
	return tracked.length > 0 ? readReminder(tracked) : void 0;
}
/** `done` with the reminder after it, when the call read a doc for the first time. */
async function withReminder($, done, paths) {
	if (done.deny !== void 0 || done.isError) return done;
	const text = await reminderFor($, paths).catch(() => void 0);
	return text ? {
		...done,
		context: [...done.context ?? [], text]
	} : done;
}
async function loadAll($, dir) {
	const entries = await $.fs.list(dir).catch(() => []);
	return (await Promise.all(entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".md")).map(async (entry) => parse(await $.fs.read(`${dir}/${entry.name}`).catch(() => ""))))).filter((s) => s !== null);
}
const save = ($, dir, s) => $.fs.write(`${dir}/${fileName(s.id)}`, serialize(s));
const removeFile = ($, dir, s) => $.process.run([
	"rm",
	"-f",
	"--",
	`${dir}/${fileName(s.id)}`
]);
async function refresh($, where) {
	const at = where ?? await place($);
	const all = typeof at === "string" ? [] : await loadAll($, at.dir);
	const open = openQueue(all);
	await update($, queue, () => open);
	return {
		open,
		dismissed: all.length - open.length
	};
}
/** The width a pane is asked to open at, docked or inline; the surface caps it. */
const WANTED_COLUMNS = 80;
/** Lines of a claim the terminal shows before the reader. */
const FOLDED_LINES = 3;
/**
* Rows the pane takes with every row folded, a guess at `WANTED_COLUMNS`: what it asks an inline
* pane to open at, so a short queue is not a box of a few rows to scroll.
*/
function wantedRows(list) {
	const text = WANTED_COLUMNS;
	return 6 + byTarget(list).reduce((n, [, rows]) => n + 3 + rows.reduce((m, s) => m + Math.min(FOLDED_LINES, Math.max(1, Math.ceil(cellWidth(s.claim) / text))) + 2, 0), 0);
}
/** The pane as `$.ui.open` asks for it, the first time and when it takes the keyboard back. */
const openArgs = (list) => paneOptions({
	id: PANE,
	title: "Doc suggestions",
	focus: true,
	closeOnEscape: true,
	rows: Math.max(wantedRows(list), 40),
	columns: WANTED_COLUMNS
});
/**
* Takes the keyboard back for the pane after an Escape it refused to close on: the engine hands
* the keys to the prompt either way, and asking to open the open pane with focus brings them back
* while the prompt is empty.
*/
async function reclaim($) {
	await $.ui.open(openArgs(await read($, queue))).catch(() => void 0);
}
async function openPane($) {
	await say($, "");
	const { open: list, dismissed } = await refresh($);
	await update($, choices, () => ({}));
	await update($, view, () => ({
		focus: list[0]?.id ?? null,
		reader: null,
		scroll: {
			list: 0,
			detail: 0
		},
		confirming: false,
		dismissed
	}));
	await update($, keys, () => false);
	await update($, expanded, () => []);
	await update($, showAll, () => false);
	await update($, paneShown, () => true);
	const opened = await $.ui.open(openArgs(list));
	if (opened.isPlaced) return;
	await update($, paneShown, () => false);
	$.ui.toast(`The doc suggestions pane can't show yet: ${opened.reason}`);
}
/**
* Carries out what the rows are set to, as the pane closes: dismisses the dismissed ones and
* drafts one prompt for the applied ones in the person's prompt box, after what they typed.
* False when the draft could not be placed: the pane then stays open, its apply rows still set.
*/
async function settle($, retry = "close again to retry, or set those rows back to skip") {
	const list = await read($, queue);
	const set = await read($, choices);
	const applied = list.filter((s) => set[s.id] === "apply");
	const dismissed = list.filter((s) => set[s.id] === "dismiss");
	if (dismissed.length > 0) {
		const where = await place($);
		if (typeof where === "string") {
			await say($, where, "error");
			return false;
		}
		const now = new Date(await $.clock.now()).toISOString();
		for (const s of dismissed) await save($, where.dir, dismiss(s, now));
		await update($, choices, (cur) => toggleChoice(cur, dismissed.map((s) => s.id), void 0));
		await refresh($, where);
	}
	if (applied.length > 0) {
		const text = applyPrompt(applied);
		const draft = await $.prompt.read();
		if (!(await $.prompt.fill(draft.text.trim() ? {
			text: `\n\n${text}`,
			mode: "append"
		} : { text })).isFilled) {
			await say($, `${dismissed.length > 0 ? `Dismissed ${dismissed.length}. ` : ""}The prompt box can't take the apply draft right now: ${retry}.`, "error");
			return false;
		}
	}
	await update($, choices, () => ({}));
	const done = [dismissed.length > 0 ? `Dismissed ${dismissed.length}.` : "", applied.length > 0 ? "The apply prompt is in the prompt box: read it, then Enter to send." : ""].filter(Boolean);
	if (done.length > 0) $.ui.toast(done.join(" "));
	return true;
}
/** Where the pane was last drawn: the graphical surfaces keep their own pane and close. */
let paneSurface = "terminal";
/** The screen's size as last drawn, for a key or a wheel that comes between two draws. */
let drawnAt = {
	width: 80,
	height: 24,
	now: 0
};
let drawnScreen = {
	lines: [],
	zones: {}
};
/** The screen's state from the atoms that hold it. */
async function screenState($) {
	const v = await read($, view);
	const noted = await read($, said);
	return {
		queue: await read($, queue),
		set: await read($, choices),
		dismissed: v.dismissed,
		focus: v.focus ?? void 0,
		reader: v.reader ?? void 0,
		scroll: v.scroll,
		confirming: v.confirming,
		notice: noted.status === "error" && noted.text ? noted.text : void 0
	};
}
async function closeScreen($) {
	await update($, paneShown, () => false);
	await update($, keys, () => false);
	await $.ui.close({ id: PANE });
}
/**
* A key or a click on the screen: the reducer's next state into the atoms, then what it asks
* for. The main action settles first, since a close the mod raises skips its own `ui.close`.
*/
async function act($, intent) {
	if (!intent) return;
	const before = await screenState($);
	const { state, effect } = reduce(before, intent, {
		...drawnAt,
		now: await $.clock.now()
	});
	if (state.set !== before.set) await update($, choices, () => ({ ...state.set }));
	if (state.notice === void 0 && before.notice !== void 0) await say($, "");
	await update($, view, (v) => ({
		...v,
		focus: state.focus ?? null,
		reader: state.reader ?? null,
		scroll: state.scroll,
		confirming: state.confirming ?? false
	}));
	if (effect === "close") return closeScreen($);
	if (effect === "submit" && await settle($, "press Enter to try again")) await closeScreen($);
}
/** A hotkey of the screen's, read against the state as it is when it lands. */
async function press($, key) {
	await act($, keyIntent(key, await screenState($), drawnAt));
}
async function hold($, held) {
	if (await read($, keys) !== held) await update($, keys, () => held);
}
/** The keys the screen binds besides Enter and the arrows: one lowercase letter each. */
const SCREEN_KEYS = [
	"a",
	"d",
	"e",
	"n",
	"j",
	"k"
];
/** Rows under the screen: the keyboard hint's, and the ring's, which draws nothing. */
const ROWS_UNDER = 2;
/**
* The ring stops only on a row's Open button and on Submit; a row's choices are for the mouse,
* and the focus ring skips them.
*/
const stopsOf = (list) => [...byTarget(list).flatMap(([, rows]) => rows.map((s) => rowHit(s.id))), SUBMIT];
/** The stop an element belongs to: a choice to its row; none for what is not a stop's. */
function ownerOf(element) {
	const it = readHit(element);
	if (it?.kind === "row") return element;
	if (it?.kind === "submit") return element;
	return it?.kind === "choice" ? rowHit(it.id) : void 0;
}
/**
* Where a move of the ring onto `element` should land instead, or undefined to let it be: past
* a row's choices, on to the next stop going down and back to their owner going up.
*/
function landing(stops, from, element) {
	const owner = ownerOf(element);
	if (owner === void 0 || owner === element) return void 0;
	const at = stops.indexOf(owner);
	if (at < 0) return void 0;
	const was = from === null ? -1 : stops.indexOf(ownerOf(from) ?? "");
	return was <= at && was >= 0 ? stops[at + 1] ?? owner : owner;
}
const register = (on) => {
	on("session.start", async ($, e, next) => {
		const started = await next(e);
		await $.tool.register({
			name: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			inputSchema: structuredClone(INPUT_SCHEMA),
			isDeferred: false
		});
		await $.command.register({
			name: "docfix",
			description: "Review the doc suggestions agents filed for this repo"
		}).catch((error) => $.ui.log(`docfix: /docfix not registered: ${String(error)}`, { to: "debug" }));
		await refresh($).catch(() => void 0);
		return started;
	});
	on("turn.complete", async ($, e, next) => {
		const done = await next(e);
		if (e.agentId === void 0) await refresh($).catch(() => void 0);
		return done;
	});
	on("tool.call", { tool: "mcp__docfix__docfix" }, async ($, e) => {
		const input = e;
		const where = await place($);
		if (typeof where === "string") return { deny: where };
		let target = input.file ? normalizeTarget(input.file, where.root) : void 0;
		if (target?.ok) {
			if ((await $.process.run([
				"git",
				"ls-files",
				"--error-unmatch",
				"--",
				target.target
			], { cwd: where.root })).exitCode !== 0) target = {
				ok: false,
				error: `${target.target} is not a file git tracks in this repo`
			};
		}
		const outcome = plan({
			input,
			existing: await loadAll($, where.dir),
			target,
			now: new Date(await $.clock.now()).toISOString(),
			session: `claude:${await $.session.id()}`
		});
		if (outcome.kind === "error") return { deny: outcome.text };
		if (outcome.kind === "write") await save($, where.dir, outcome.suggestion);
		if (outcome.kind === "remove") await removeFile($, where.dir, outcome.suggestion);
		await refresh($, where);
		return { result: outcome.text };
	}).catch((_$, _e, next) => ({ deny: `docfix failed: ${String(next.error)}` }));
	on("tool.call", { tool: "Read" }, async ($, e, next) => withReminder($, await next(e), [e.file_path]));
	on("tool.call", { tool: "Bash" }, async ($, e, next) => withReminder($, await next(e), readsInCommand(e.command)));
	on("command.run", { command: "docfix" }, async ($) => {
		await openPane($);
		return { text: "Opened the doc suggestions pane." };
	}).catch((_$, _e, next) => ({ text: `docfix: ${String(next.error)}` }));
	on("ui.close", { id: PANE }, async ($, e, next) => {
		if (e.origin.kind !== "unload") {
			if (paneSurface === "terminal") {
				const s = await screenState($);
				if (s.reader !== void 0 || s.confirming || s.queue.some((q) => s.set[q.id])) {
					await act($, { do: "escape" });
					$.clock.after(50, () => void reclaim($));
					return { value: void 0 };
				}
			} else if (!await settle($)) return { value: void 0 };
		}
		await update($, paneShown, () => false);
		await update($, keys, () => false);
		return next(e);
	});
	on("ui.focus", { requestId: PANE }, async ($, e, next) => {
		if (paneSurface === "terminal") {
			const move = ringMove(e.element, isScreenHit);
			if (move && "hit" in move) await act($, {
				do: "focus",
				hit: move.hit
			});
			else if (move?.by) await act($, {
				do: "move",
				by: move.by
			});
			const moved = await next(move ? {
				...e,
				element: RING.park
			} : e);
			if (!moved.deny) await hold($, true);
			return moved;
		}
		const element = e.element ?? null;
		const to = element && e.origin.kind === "person" ? landing(stopsOf(await read($, queue)), await read($, focused), element) : void 0;
		await update($, focused, () => to ?? element);
		return next(to ? {
			...e,
			element: to
		} : e);
	}).catch((_$, e, next) => next(e));
	on("ui.scroll", { requestId: PANE }, async ($, e, next) => {
		if (paneSurface !== "terminal") return next(e);
		const reading = (await read($, view)).reader !== null;
		const zone = e.pointer ? zoneAt(drawnScreen.zones, e.pointer.row) : reading ? "detail" : "list";
		const by = e.pointer ? 3 * Math.sign(e.by) : e.by;
		if (zone) await act($, {
			do: "scroll",
			zone,
			by
		});
		return {};
	}).catch((_$, e, next) => next(e));
	on("prompt.edit", async ($, e, next) => {
		await hold($, false);
		return next(e);
	});
	on("prompt.change", async ($, e, next) => {
		if (e.origin.kind !== "plugin") await hold($, false);
		return next(e);
	});
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);
		const below = await next(e);
		const n = (await read($, queue)).length;
		if (n === 0 || await read($, paneShown)) return below;
		const els = $.ui.resolve(e);
		const open = () => openPane($);
		const band = isGui(e) ? statusBand(guiOf(els, e, open), {
			text: `docfix: docs ${n}`,
			hint: "review",
			hit: BAND,
			status: "warning"
		}, { text: n === 1 ? "1 doc suggestion to review" : `${n} doc suggestions to review` }) : paintLines(els, statusBand$1({
			text: `docfix: docs ${n}`,
			hint: "review",
			hit: BAND,
			status: "warning"
		}, e.props.bodyColumns), {
			press: open,
			width: e.props.bodyColumns
		});
		return stack(els, below, band);
	});
	on("ui.render", {
		component: "Pane",
		requestId: PANE
	}, async ($, e) => {
		paneSurface = e.surface;
		if (e.surface === "terminal") {
			const els = $.ui.resolve(e);
			const pad = e.props.placement === "inline" ? 0 : 1;
			const width = Math.max(20, e.props.bodyColumns - pad);
			const now = await $.clock.now();
			drawnAt = {
				width,
				height: Math.max(4, e.props.scroll.bodyRows - ROWS_UNDER),
				now
			};
			const state = await screenState($);
			drawnScreen = drawScreen(state, drawnAt);
			const held = await read($, keys);
			return stack(els, paintLines(els, drawnScreen.lines, {
				press: (hit) => act($, {
					do: "press",
					hit
				}),
				width,
				indent: pad
			}), keysHint(els, held, false, pad + captionFrameLayout.x) ?? paintLines(els, [blank()], { indent: pad }), ring(els, () => act($, { do: "main" }), SCREEN_KEYS.map((key) => ({
				key,
				press: () => press($, key)
			}))));
		}
		const view_ = {
			queue: await read($, queue),
			set: await read($, choices),
			open: new Set(await read($, expanded)),
			isAll: await read($, showAll),
			now: await $.clock.now(),
			said: await read($, said)
		};
		const choose = async (id, choice) => {
			await update($, choices, (cur) => toggleChoice(cur, [id], choice));
			await say($, "");
		};
		const g = guiOf($.ui.resolve(e), e, async (hit) => {
			const it = readHit(hit);
			if (it?.kind === "submit") {
				if (!await settle($)) return;
				await update($, paneShown, () => false);
				await $.ui.close({ id: PANE });
			} else if (it?.kind === "more") await update($, showAll, () => true);
			else if (it?.kind === "row") await update($, expanded, (cur) => cur.includes(it.id) ? [] : [it.id]);
			else if (it?.kind === "choice") await choose(it.id, it.choice === "skip" ? void 0 : it.choice);
		});
		return queuePane(g, view_);
	});
};

export { register };