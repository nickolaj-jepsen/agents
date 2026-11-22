import { Type } from "typebox";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

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
const statusText = (open) => open > 0 ? `docs ${open}` : void 0;
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
const draw = (theme, lines, width) => paintLines(theme, lines, width).lines;
/** One run of text in a style of the kit. */
const paintText = (theme, text, style = {}) => paintSpan(theme, {
	...style,
	text
});

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
	return buttonRow(buttons, room, { lead })[0]?.spans;
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
		frameTop(f),
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
const DIVIDER$1 = /^:?-{2,}:?$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
/** A table row's cells. */
const cellsOf = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
/**
* A table to `width` cells: columns two apart, each as wide as its widest cell while they fit
* and sharing the room in proportion when they do not, cells wrapped, the first row bold.
*/
function table(rows, width, base) {
	const all = rows.map(cellsOf).filter((cells) => !cells.every((cell) => DIVIDER$1.test(cell)));
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
const actionSpans$1 = (a) => buttonRow([a], Number.MAX_SAFE_INTEGER)[0]?.spans ?? [];
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
		...s.text ? prose(s.text, room) : [],
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
const MARKED = 3;
/** The window a detail's height shows of its rows, from `offset`. */
function windowOf$1(d, all) {
	const height = d.height ?? 1e400;
	if (all.length <= height) return {
		rows: [...all],
		top: 0,
		max: 0
	};
	if (height < MARKED) {
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
function detail(d, width) {
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
/** Cells before a row's text: the pointer column, the mark and a space. */
const LEAD = cellWidth(tokens.glyph.pointer) + 1 + cellWidth(tokens.glyph.single.off) + 1;
/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;
/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";
/** Cells before a group's label and a row's pointer: the rail and its gap, or none without rails. */
const insetOf = (l) => l.rail === false ? 0 : LIST_INSET;
/** Cells a row's text has at `width`, beside the list's aside column. */
function listTextRoom(width, l = {}) {
	const aside = l.aside ?? 0;
	return Math.max(1, width - insetOf(l) - LEAD - (aside > 0 ? aside + tokens.gutter : 0));
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
const actionSpans = (actions) => buttonRow(actions.map((a) => ({
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
	const isLit = r.focused || r.hovered;
	const words = mark === "dropped" ? {
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
	const pointer = r.focused ? [span(tokens.glyph.pointer, {
		role: "text",
		bold: true
	}), span(" ")] : [span(" ".repeat(cellWidth(tokens.glyph.pointer) + 1))];
	const room = width - insetOf(l);
	const aside = l.aside ?? 0;
	const textRoom = listTextRoom(width, l);
	let spans = inline(r.text, words).map((sp) => sp.role === "code" ? {
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
		glyph,
		span(" ")
	];
	const right = aside > 0 ? [span(truncate(r.aside ?? "", aside).padStart(aside), { role: r.aside ? "dim" : void 0 })] : [];
	const state = {
		active: g.active,
		answered: g.done
	};
	return texts.map((text, i) => {
		if (i > 0) {
			const hang = span(" ".repeat(spansWidth(lead)));
			return behind(l, state, line([hang, ...r.hit ? hitSpans(text, r.hit) : text]));
		}
		const body = spread(text, right, room - spansWidth(lead));
		if (r.markHit === void 0) return behind(l, state, line([...lead, ...body], r.hit));
		return behind(l, state, line([...hitSpans(lead, r.markHit), ...r.hit ? hitSpans(body, r.hit) : body]));
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
	...l.flat ? [] : [{ group }],
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
function list(l, width) {
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
const startState = (queue, dismissed = 0) => ({
	queue,
	set: {},
	dismissed,
	focus: queue[0]?.id,
	scroll: {
		list: 0,
		detail: 0
	}
});
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
const focused = (s) => s.queue.find((q) => q.id === s.focus) ?? s.queue[0];
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
const evidenceRows = (q, width) => detail({ sections: evidenceSections(q, 0) }, width).length;
/** Rows of the claim under the queue: none when the queue's row shows it whole. */
function claimRows(q, l) {
	if (listShowsWhole(q.claim, l.innerWidth, ROWS)) return 0;
	return Math.min(CLAIM_ROWS, detail({ title: q.claim }, l.innerWidth).length);
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
	const at = focused(s);
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
function evidenceSections(q, piece) {
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
	const q = focused(s);
	if (!q || rows < 1) return [];
	const isTall = l.mode === "tall";
	const read = {
		label: "Read",
		hotkey: "e",
		hit: BUTTONS.evidence,
		hovered: s.hover === BUTTONS.evidence
	};
	const rule = detail({
		sections: [{
			rule: evidenceRule(q, o.now),
			action: read
		}],
		framed: true
	}, o.width);
	let head = detail({
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
	const evidence = isTall && room > 0 ? detail({
		sections: evidenceSections(q, 0),
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
	const q = focused(s);
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
		}, ...evidenceSections(q, piece)],
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
		const row = buttonRow(keys, room)[0] ?? line([]);
		return line(row.spans.map(({ text }) => span(text, { role: "dim" })));
	}
	const hovered = keys.map((k) => ({
		...k,
		hovered: k.hit !== void 0 && k.hit === s.hover
	}));
	return buttonRow(hovered, room)[0] ?? line([]);
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
	const q = focused(s);
	if (s.reader !== void 0 && q) {
		const d = readerDetail(s, o, l);
		const rows = d ? detail(d, o.width) : [];
		body = padTo([inset(readerHead(s, q, o, l.innerWidth)), ...rows], l.body);
		zones = { detail: [at + 1, at + l.body] };
	} else {
		const rows = list(listOf(s, l), l.innerWidth).map((row) => inset(row));
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
	const q = focused(s);
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
/** The ids the main action carries out, apply and dismiss apart. */
function decided(s) {
	return {
		applied: s.queue.filter((q) => s.set[q.id] === "apply"),
		dismissed: s.queue.filter((q) => s.set[q.id] === "dismiss")
	};
}

// src/pi/panel.ts
/** Cells left of the screen: the divider, a blank cell on either side of it. */
const GUTTER = 3;
/** The divider's cell in the gutter. */
const DIVIDER = 1;
/** Rows under the sidebar: the editor between its rules, and the footer. */
const BELOW = 6;
/** The narrowest the screen is, and the least a drag leaves of the transcript beside it. */
const NARROWEST = 44;
const BESIDE = 20;
/** The width a drag of the divider left the screen at, kept while pi runs. */
let dragged;
/**
* The screen's width: where a drag of the divider left it, else 64 columns or 45% of the
* terminal, whichever is smaller; never under 44, nor wider than leaves the transcript 20.
*/
const sidebarWidth = (columns) => {
	const widest = Math.max(NARROWEST, columns - GUTTER - BESIDE);
	return Math.max(NARROWEST, Math.min(widest, dragged ?? Math.min(64, Math.floor(columns * .45))));
};
/**
* The overlay's options: on the right from the top. Its width is read at each render, so it
* follows the terminal when it is resized, and the divider while it is dragged.
*/
function sidebarOptions(columns) {
	return {
		anchor: "top-right",
		get width() {
			return Math.min(columns(), sidebarWidth(columns()) + GUTTER);
		}
	};
}
/** A key as the screen names it: `up`, `enter`, or the character typed. */
function keyName(data) {
	if (matchesKey(data, Key.up)) return "up";
	if (matchesKey(data, Key.down)) return "down";
	if (matchesKey(data, Key.pageUp)) return "pageup";
	if (matchesKey(data, Key.pageDown)) return "pagedown";
	if (matchesKey(data, Key.enter)) return "enter";
	if (matchesKey(data, Key.escape)) return "escape";
	return [...data].length === 1 ? data : void 0;
}
var DocsPanel = class {
	tui;
	theme;
	deps;
	done;
	state;
	width = 0;
	cells = [];
	zones = {};
	isBusy = false;
	/** The pointer is on the divider, or dragging it: it is drawn bright. */
	grip;
	constructor(tui, theme, deps, initial, done) {
		this.tui = tui;
		this.theme = theme;
		this.deps = deps;
		this.done = done;
		this.state = startState(openQueue(initial), initial.filter((s) => s.status === "dismissed").length);
	}
	invalidate() {}
	options() {
		return {
			width: this.width,
			height: Math.max(12, this.tui.terminal.rows - BELOW),
			now: Date.now(),
			wholeDoc: true
		};
	}
	act(intent) {
		if (this.isBusy) return;
		const { state, effect } = reduce(this.state, intent, this.options());
		this.state = state;
		if (effect === "close") this.done(void 0);
		else if (effect === "submit") this.submit();
		this.tui.requestRender();
	}
	/** Dismisses the dismissed ones, then closes with the applied ones; a failure stays open. */
	submit() {
		const { applied, dismissed } = decided(this.state);
		if (dismissed.length === 0) return this.done({ applied });
		this.isBusy = true;
		this.deps.dismiss(dismissed).then(() => this.done({ applied }), (error) => {
			this.isBusy = false;
			this.state = {
				...this.state,
				notice: `Dismiss failed: ${String(error)}`
			};
			this.tui.requestRender();
		});
	}
	handleInput(data) {
		if (this.state.hover) this.state = {
			...this.state,
			hover: void 0
		};
		if (matchesKey(data, "ctrl+c")) return this.done(void 0);
		const key = keyName(data);
		const intent = key === void 0 ? void 0 : keyIntent(key, this.state, this.options());
		if (intent) this.act(intent);
		else this.tui.requestRender();
	}
	/** The divider follows the pointer: the screen takes what is right of it. */
	drag(screenX) {
		const before = sidebarWidth(this.tui.terminal.columns);
		dragged = this.tui.terminal.columns - screenX - 2;
		dragged = sidebarWidth(this.tui.terminal.columns);
		return dragged !== before;
	}
	/** A press on the divider takes the pointer until it is let go; `undefined` for any other event. */
	handleGrip(event) {
		if (this.grip === "dragging") {
			if (event.type === "drag") return {
				handled: true,
				render: this.drag(event.screenX)
			};
			this.grip = "over";
			return {
				handled: true,
				render: true
			};
		}
		const was = this.grip;
		this.grip = event.x >= DIVIDER && event.x < GUTTER ? "over" : void 0;
		if (!this.grip) {
			if (was) this.tui.requestRender();
			return;
		}
		if (this.state.hover) this.act({
			do: "hover",
			hit: void 0
		});
		if (event.type === "press" && event.button === "left") {
			this.grip = "dragging";
			return {
				capture: true,
				focus: true
			};
		}
		return {
			handled: true,
			render: was !== this.grip
		};
	}
	handleMouse(event) {
		const grip = this.handleGrip(event);
		if (grip) return grip;
		const x = event.x - GUTTER;
		const hit = x >= 0 ? cellAt(this.cells[event.y], x)?.hit : void 0;
		if (hit !== this.state.hover) this.act({
			do: "hover",
			hit
		});
		if (event.type === "move") return { handled: true };
		if (event.type === "wheel") {
			const zone = zoneAt(this.zones, event.y);
			if (zone && event.wheelDelta) this.act({
				do: "scroll",
				zone,
				by: Math.sign(event.wheelDelta) * 3
			});
			return { handled: true };
		}
		if (event.button !== "left") return { handled: true };
		if (event.type === "press") return {
			handled: true,
			focus: true
		};
		if (event.type === "click" && hit) this.act({
			do: "press",
			hit
		});
		return { handled: true };
	}
	render(width) {
		this.width = Math.max(1, width - GUTTER);
		const drawn = drawScreen(this.state, this.options());
		const lines = [...drawn.lines, ...Array.from({ length: Math.max(0, this.options().height - drawn.lines.length) }, blank)];
		const painted = paintLines(this.theme, lines, this.width, { fill: true });
		this.cells = painted.cells;
		this.zones = drawn.zones;
		const divider = paintText(this.theme, tokens.glyph.rail, {
			role: this.grip ? "text" : "border",
			bold: this.grip === "dragging" || void 0
		});
		const gutter = " ".repeat(DIVIDER) + divider + " ".repeat(1);
		return painted.lines.map((row) => gutter + row);
	}
};

// src/pi/store.ts
/**
* Where a checkout's suggestions live and the file IO on them:
* `<repo>/.agents/store/docfix/`, the note store every worktree of the repo
* shares, so a gap one worktree hit is in the next one's queue too.
*/
const run = promisify(execFile);
const git = async (cwd, args) => {
	try {
		const { stdout } = await run("git", args, {
			cwd,
			timeout: 1e4
		});
		return {
			ok: true,
			out: stdout.trim()
		};
	} catch {
		return {
			ok: false,
			out: ""
		};
	}
};
/** The checkout's top level, or undefined outside git. */
const repoRoot = async (cwd) => {
	const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
	return top.ok && top.out ? top.out : void 0;
};
const isTracked = async (root, target) => (await git(root, [
	"ls-files",
	"--error-unmatch",
	"--",
	target
])).ok;
/** Whether the checkout has a note store, without repairing its links. */
const hasStore = (root) => existsSync(join(root, ".agents", "store"));
/** The suggestions folder, the note store's links repaired first when they are missing. */
async function storeDir(root) {
	const store = join(root, ".agents", "store");
	if (!existsSync(store)) {
		await run("agent-notes", [
			"root",
			"--ensure",
			"--path",
			root
		], { timeout: 1e4 }).catch(() => void 0);
		if (!existsSync(store)) return void 0;
	}
	return join(store, STORE_DIR);
}
async function loadAll(dir) {
	const names = await readdir(dir).catch(() => []);
	return (await Promise.all(names.filter((name) => name.endsWith(".md")).map(async (name) => parse(await readFile(join(dir, name), "utf8").catch(() => ""))))).filter((s) => s !== null);
}
async function save(dir, suggestion) {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, fileName(suggestion.id)), serialize(suggestion));
}
const remove = (dir, suggestion) => rm(join(dir, fileName(suggestion.id)), { force: true });

// src/pi.ts
const STATUS_KEY = "docfix";
const stringEnum = (values) => Type.Unsafe({
	type: "string",
	enum: [...values]
});
async function place(cwd) {
	const root = await repoRoot(cwd);
	if (!root) return "not inside a git repository, so there are no repo docs to file against";
	const dir = await storeDir(root);
	if (!dir) return "this checkout has no note store (.agents/store); run `agent-notes root --ensure`";
	return {
		root,
		dir
	};
}
function pi_default(pi) {
	async function refresh(ctx) {
		if (!ctx.hasUI) return;
		const where = await place(ctx.cwd);
		const open = typeof where === "string" ? 0 : openQueue(await loadAll(where.dir)).length;
		ctx.ui.setStatus(STATUS_KEY, statusText(open));
	}
	const reminded = /* @__PURE__ */ new Set();
	pi.on("session_start", (_event, ctx) => {
		reminded.clear();
		return refresh(ctx);
	});
	pi.on("agent_end", (_event, ctx) => refresh(ctx));
	pi.on("tool_result", async (event, ctx) => {
		if (event.isError) return;
		const paths = event.toolName === "read" ? [String(event.input.path ?? "")] : event.toolName === "bash" ? readsInCommand(String(event.input.command ?? "")) : [];
		if (paths.length === 0) return;
		const root = await repoRoot(ctx.cwd);
		if (!root || !hasStore(root)) return;
		const tracked = [];
		for (const target of docTargets(paths, ctx.cwd, root)) if (!reminded.has(target) && await isTracked(root, target)) tracked.push(target);
		if (tracked.length === 0) return;
		for (const target of tracked) reminded.add(target);
		return { content: [...event.content, {
			type: "text",
			text: readReminder(tracked)
		}] };
	});
	pi.registerTool({
		name: TOOL_NAME,
		label: "Doc fix",
		description: TOOL_DESCRIPTION,
		parameters: Type.Object({
			action: stringEnum(["suggest", "resolve"]),
			file: Type.Optional(Type.String({ description: "Repo-relative path of the doc (suggest)." })),
			kind: Type.Optional(stringEnum(KINDS)),
			claim: Type.Optional(Type.String({ description: "One line: what the doc should say, or why it is wrong." })),
			evidence: Type.Optional(Type.String({ description: "The doc's line and what you saw that contradicts it: a code location, or a command and its output." })),
			same_as: Type.Optional(Type.String({ description: "Id of the listed suggestion this repeats, or \"none\"." })),
			id: Type.Optional(Type.String({ description: "The suggestion to resolve." }))
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			openWorldHint: false
		},
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const fail = (text) => ({
				content: [{
					type: "text",
					text
				}],
				details: { ok: false },
				isError: true
			});
			const where = await place(ctx.cwd);
			if (typeof where === "string") return fail(where);
			let target = params.file ? normalizeTarget(params.file, where.root) : void 0;
			if (target?.ok && !await isTracked(where.root, target.target)) target = {
				ok: false,
				error: `${target.target} is not a file git tracks in this repo`
			};
			const outcome = plan({
				input: params,
				existing: await loadAll(where.dir),
				target,
				now: (/* @__PURE__ */ new Date()).toISOString(),
				session: `pi:${ctx.sessionManager.getSessionId()}`
			});
			if (outcome.kind === "error") return fail(outcome.text);
			if (outcome.kind === "write") await save(where.dir, outcome.suggestion);
			if (outcome.kind === "remove") await remove(where.dir, outcome.suggestion);
			await refresh(ctx);
			return {
				content: [{
					type: "text",
					text: outcome.text
				}],
				details: { ok: true }
			};
		},
		renderResult(result, _options, theme) {
			const first = result.content[0];
			const text = first?.type === "text" ? first.text.split("\n")[0] ?? "" : "";
			const ok = result.details?.ok !== false;
			const row = line([span(text, { role: ok ? "dim" : "warning" })]);
			return {
				render: (width) => draw(theme, [row], width),
				invalidate() {}
			};
		}
	});
	pi.registerCommand("docfix", {
		description: "Review the doc suggestions agents filed for this repo",
		handler: async (_args, ctx) => {
			const where = await place(ctx.cwd);
			if (typeof where === "string") return ctx.ui.notify(where, "warning");
			const load = () => loadAll(where.dir);
			if (!ctx.hasUI || ctx.mode !== "tui") {
				const queue = openQueue(await load());
				ctx.ui.notify(queue.length === 0 ? "No open doc suggestions." : queue.map((s) => `${s.target}: ${s.claim} (${s.id})`).join("\n"), "info");
				return;
			}
			const initial = await load();
			let columns = () => process.stdout.columns || 80;
			const picked = await ctx.ui.custom((tui, theme, _keybindings, done) => {
				columns = () => tui.terminal.columns;
				return new DocsPanel(tui, theme, { dismiss: async (list) => {
					const now = (/* @__PURE__ */ new Date()).toISOString();
					for (const s of list) await save(where.dir, dismiss(s, now));
					await refresh(ctx);
				} }, initial, done);
			}, {
				overlay: true,
				overlayOptions: sidebarOptions(() => columns())
			});
			await refresh(ctx);
			if (!picked?.applied.length) return;
			const draft = ctx.ui.getEditorText();
			const text = applyPrompt(picked.applied);
			ctx.ui.setEditorText(draft.trim() ? `${draft}\n\n${text}` : text);
			ctx.ui.notify("The apply prompt is in the editor: read it, then Enter to send", "info");
		}
	});
}

export { pi_default as default };