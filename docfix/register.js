import { atom, read, update } from "claude-code";

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

// ../../lib/kits/core/src/tokens.ts
/** The style's numbers and glyphs, shared by every client; one edit here restyles them all. No host imports. */
const tokens$1 = {
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
const cellsOf$2 = (c) => {
	if (c < 32 || c >= 127 && c < 160) return 0;
	if (c < 768) return 1;
	if (c >= 768 && c <= 879 || c >= 8203 && c <= 8207 || c >= 8400 && c <= 8447 || c >= 65024 && c <= 65039 || c === 65279 || c >= 917760 && c <= 917999) return 0;
	return c >= 4352 && c <= 4447 || c === 9001 || c === 9002 || c >= 8986 && c <= 8987 || c >= 9193 && c <= 9196 || c === 9200 || c === 9203 || c >= 9725 && c <= 9726 || c >= 9748 && c <= 9749 || c >= 9800 && c <= 9811 || c === 9855 || c === 9875 || c === 9889 || c >= 9898 && c <= 9899 || c >= 9917 && c <= 9918 || c >= 9924 && c <= 9925 || c === 9934 || c === 9940 || c === 9962 || c >= 9970 && c <= 9971 || c === 9973 || c === 9978 || c === 9981 || c === 9989 || c >= 9994 && c <= 9995 || c === 10024 || c === 10060 || c === 10062 || c >= 10067 && c <= 10069 || c === 10071 || c >= 10133 && c <= 10135 || c === 10160 || c === 10175 || c >= 11035 && c <= 11036 || c === 11088 || c === 11093 || c >= 11904 && c <= 12350 || c >= 12353 && c <= 13311 || c >= 13312 && c <= 19903 || c >= 19968 && c <= 42191 || c >= 43360 && c <= 43391 || c >= 44032 && c <= 55203 || c >= 63744 && c <= 64255 || c >= 65040 && c <= 65049 || c >= 65072 && c <= 65135 || c >= 65280 && c <= 65376 || c >= 65504 && c <= 65510 || c >= 127744 && c <= 128591 || c >= 128640 && c <= 128767 || c >= 129280 && c <= 129535 || c >= 129648 && c <= 129791 || c >= 131072 && c <= 262141 ? 2 : 1;
};
/** Cells `text` takes: wide characters two, marks and joiners none. Never `.length`. */
function cellWidth$1(text) {
	let n = 0;
	for (const ch of text) n += cellsOf$2(ch.codePointAt(0) ?? 0);
	return n;
}
/** The longest start of `text` that fits `cells`, and the rest. */
function split$1(text, cells) {
	let used = 0;
	let at = 0;
	for (const ch of text) {
		const w = cellsOf$2(ch.codePointAt(0) ?? 0);
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
		const w = cellsOf$2(ch.codePointAt(0) ?? 0);
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
function truncate$1(text, width) {
	if (cellWidth$1(text) <= width) return text;
	return split$1(text, Math.max(0, width - 1))[0] + "…";
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
		used += cellWidth$1(text);
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
				if (used > 0 && used + cellWidth$1(unit) > width) end();
				while (cellWidth$1(unit) > width) {
					const [head, rest] = split$1(unit, width);
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
const spansWidth = (spans) => spans.reduce((n, s) => n + cellWidth$1(s.text), 0);
/**
* Spans as lines of `width` cells: wrapped by word after a `lead`, later lines hanging under
* the first line's text.
*/
function block$1(spans, width, options = {}) {
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
			if (over > 0) tail.text = split$1(tail.text, Math.max(0, cellWidth$1(tail.text) - over))[0];
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
		const [head] = split$1(s.text, room);
		if (head) out.push({
			...s,
			text: head
		});
		room -= cellWidth$1(head);
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
		const glyph = tokens$1.glyph.more[side];
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
const GAP$3 = " ".repeat(tokens$1.gutter);
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
const CARD_INSET = " ".repeat(cellWidth$1(tokens$1.glyph.pointer) + 1);
/** A line behind a card's rail, which still draws on a blank row. */
function rail(state, row) {
	const mark = span(tokens$1.glyph.rail, { role: railRole(state) });
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
const shortcutOf = (b) => b.hit === void 0 || !b.hotkey ? b.hotkey : b.hotkey === "enter" ? tokens$1.glyph.enter : `[${b.hotkey}]`;
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
			width: cellWidth$1(shortcut ? `${key.label} ${shortcut}` : key.label)
		};
	});
	const prefix = truncateSpans(lead, width);
	if (!wrap) {
		let remaining = spansWidth(prefix) + chips.reduce((n, chip) => n + chip.width + tokens$1.gutter, 0) - (prefix.length || !chips.length ? 0 : tokens$1.gutter);
		while (remaining > width) {
			const index = chips.map((chip) => !chip.essential && !chip.isLit).lastIndexOf(true);
			if (index < 0) break;
			remaining -= (chips.splice(index, 1)[0]?.width ?? 0) + tokens$1.gutter;
		}
	}
	const rows = [];
	let spans = [...prefix];
	for (const chip of chips) {
		if (wrap && spans.length && spansWidth(spans) + tokens$1.gutter + chip.width > width) {
			rows.push(line(spans));
			spans = [];
		}
		const start = spansWidth(spans) + (spans.length ? tokens$1.gutter : 0);
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
		if (spans.length) spans.push(span(" ".repeat(tokens$1.gutter)));
		spans.push(...truncateSpans(entry, width - start));
	}
	rows.push(line(spans));
	return rows;
}

// ../../lib/kits/fields/src/terminal.ts
/** Fields as styled lines: the one drawing both terminals paint. */
const GAP$2 = " ".repeat(tokens$1.gutter);
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
			if (spans.length && spansWidth(spans) + tokens$1.gutter + spansWidth(entry) > width) {
				rows.push(line(spans));
				spans = [];
			}
			if (spans.length) spans.push(span(GAP$2));
			spans.push(...entry);
		}
		if (spans.length) rows.push(line(spans));
		return rows;
	}
	const keyed = hasKeys ? Math.max(...all.map((f) => cellWidth$1(f.key ?? ""))) + tokens$1.gutter : 0;
	const widest = Math.max(0, ...all.map((f) => cellWidth$1(f.label)));
	const labelled = Math.min(widest, Math.max(4, Math.floor((width - keyed) / 2) - tokens$1.gutter));
	return all.flatMap((f) => {
		const label = truncateSpans([span(f.label, { role: "dim" })], labelled);
		const lead = [
			...hasKeys ? [span((f.key ?? "").padEnd(keyed - tokens$1.gutter), { role: keyRole(active) }), span(GAP$2)] : [],
			...label,
			span(" ".repeat(labelled - spansWidth(label)) + GAP$2)
		];
		return block$1(literal(f.value, valueStyle(f)), width, {
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
		const label = width < 40 ? tokens$1.glyph.times : `Close ${tokens$1.glyph.times}`;
		if (cellWidth$1(label) > room) return void 0;
		return [span(label, {
			...controlStyle({ highlighted: hover === "close" }),
			hit: closeHit("close")
		})];
	}
	const buttonsWidth = cellWidth$1(`Discard ${tokens$1.glyph.enter}`) + tokens$1.gutter + cellWidth$1(`Keep [${keep}]`);
	if (room < buttonsWidth) return void 0;
	const prompt = question;
	const lead = room >= buttonsWidth + tokens$1.gutter + cellWidth$1(prompt) ? [span(prompt, { role: "warning" })] : [];
	const buttons = confirmButtons(keep).map((b) => ({
		...b,
		hovered: hover !== void 0 && b.hit === closeHit(hover)
	}));
	return buttonRow(buttons, room, { lead })[0]?.spans;
}
/** Cells a title needs to be worth cutting into. */
const MIN_TITLE = 8;
const ruleSpan = (n) => span(tokens$1.glyph.rule.repeat(Math.max(0, n)), { role: "border" });
/** `words ── words`: the parts of a rule's caption, a short rule between two. */
const captionParts = (parts) => parts.filter((part) => part.length).flatMap((part, i) => i ? [
	span(" "),
	ruleSpan(tokens$1.gutter),
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
const GAP$1 = " ".repeat(tokens$1.gutter);
const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const ROW = /^\s*\|.*\|\s*$/;
const DIVIDER = /^:?-{2,}:?$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
/** A table row's cells. */
const cellsOf$1 = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
/**
* A table to `width` cells: columns two apart, each as wide as its widest cell while they fit
* and sharing the room in proportion when they do not, cells wrapped, the first row bold.
*/
function table(rows, width, base) {
	const all = rows.map(cellsOf$1).filter((cells) => !cells.every((cell) => DIVIDER.test(cell)));
	const count = Math.max(0, ...all.map((cells) => cells.length));
	if (!count) return [];
	const plain = (cell) => inline(cell).reduce((n, s) => n + cellWidth$1(s.text), 0);
	const natural = Array.from({ length: count }, (_, i) => Math.max(1, ...all.map((cells) => plain(cells[i] ?? ""))));
	const room = Math.max(count, width - (count - 1) * tokens$1.gutter);
	const total = natural.reduce((n, w) => n + w, 0);
	const widths = natural.map((w) => total <= room ? w : Math.max(1, Math.floor(room * w / total)));
	return all.flatMap((cells, r) => {
		const style = r === 0 ? {
			...base,
			role: base.role ?? "text",
			bold: true
		} : base;
		const columns = widths.map((w, i) => block$1(inline(cells[i] ?? "", style), w));
		const height = Math.max(1, ...columns.map((column) => column.length));
		return Array.from({ length: height }, (_, y) => {
			const spans = [];
			columns.forEach((column, i) => {
				const cell = column[y]?.spans ?? [];
				const used = cell.reduce((n, s) => n + cellWidth$1(s.text), 0);
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
		for (const words of paragraph) out.push(...block$1(inline(words, base), width));
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
			for (const l of code) out.push(line([span(GAP$1), span(truncate$1(l, width - tokens$1.gutter), { role: "code" })]));
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
			out.push(line([span(tokens$1.glyph.rule.repeat(width), { role: "border" })]));
			wasItem = false;
			continue;
		}
		const heading = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/.exec(row);
		if (heading) {
			flush();
			gap();
			out.push(...block$1(inline(heading[1] ?? "", {
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
			const lead = [span(tokens$1.glyph.rail, quiet), span(" ")];
			if (!wasItem) gap();
			out.push(...block$1(inline(quote[1] ?? "", quiet), width, {
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
			const mark = tick !== void 0 ? span(tick === " " ? "[ ]" : "[x]", tick === " " ? quiet : { role: "success" }) : span(number ? `${number}.` : tokens$1.glyph.bullet, quiet);
			out.push(...block$1(inline(rest, base), width, { lead: [
				span(" ".repeat(depth * tokens$1.gutter)),
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
function section$1(s, d, width) {
	const x = insetOf$1(d);
	const room = Math.max(1, width - 2 * x);
	return [...s.rule !== void 0 ? [ruleRow(s.rule, s.action, width, x ? x - 1 : 0)] : [], ...[
		...s.heading ? block$1([span(s.heading, { role: "dim" })], room) : [],
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
function rowsOf$1(d, width) {
	const x = insetOf$1(d);
	const room = Math.max(1, width - 2 * x);
	return [[...d.meta ? block$1([span(d.meta, {
		role: "dim",
		bold: d.hovered || void 0
	})], room) : [], ...d.title ? block$1(titleSpans(d.title), room, { max: d.titleMax }) : []].map((row) => setIn(row, x)), ...(d.sections ?? []).map((s) => section$1(s, d, width))].filter((part) => part.length > 0).flatMap((part, i) => i ? [blank(), ...part] : part);
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
const detailRange = (d, width) => windowOf$1(d, rowsOf$1(d, width)).max;
/**
* One item read whole: a dim meta line, a bold title, then sections, each under a dim heading
* or a rule, of prose and of keyed rows, a blank row between. Taller than `height`, it is a
* window from `offset`, and where it has three rows or more its edges count what is out of sight
* (`↑ 3 more`, `↓ 12 more`), as every window in the kit does.
*/
function detail(d, width) {
	const { rows } = windowOf$1(d, rowsOf$1(d, width));
	if (d.hit === void 0) return rows;
	return rows.map((row) => row.spans.some((s) => s.hit) ? row : {
		...row,
		hit: d.hit
	});
}

// ../../lib/kits/list/src/terminal.ts
/** The list as styled lines: the one drawing both terminals paint. */
const GAP = " ".repeat(tokens$1.gutter);
/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
const LIST_INSET = cellWidth$1(tokens$1.glyph.rail) + tokens$1.gutter;
/** Cells before a row's text: the pointer column, the mark and a space. */
const LEAD = cellWidth$1(tokens$1.glyph.pointer) + 1 + cellWidth$1(tokens$1.glyph.single.off) + 1;
/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;
/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";
/** Cells before a group's label and a row's pointer: the rail and its gap, or none without rails. */
const insetOf = (l) => l.rail === false ? 0 : LIST_INSET;
/** Cells a row's text has at `width`, beside the list's aside column. */
function listTextRoom(width, l = {}) {
	const aside = l.aside ?? 0;
	return Math.max(1, width - insetOf(l) - LEAD - (aside > 0 ? aside + tokens$1.gutter : 0));
}
/**
* Whether a row of the list shows all of `text` at `width`, in the lines its text may take: else
* show it elsewhere.
*/
const listShowsWhole = (text, width, l = {}) => (l.lines ?? 1) > 1 ? block$1(inline(text), listTextRoom(width, l)).length <= (l.lines ?? 1) : spansWidth(inline(text)) <= listTextRoom(width, l);
/** `label` cut from the left to `width` cells: whole folders first, then letters. */
function cutLeft(label, width) {
	if (cellWidth$1(label) <= width) return label;
	const parts = label.split("/");
	for (let i = 1; i < parts.length; i++) {
		const tail = `${"…"}/${parts.slice(i).join("/")}`;
		if (cellWidth$1(tail) <= width) return tail;
	}
	const chars = [...label];
	let out = "";
	for (let i = chars.length - 1; i >= 0; i--) {
		const next = (chars[i] ?? "") + out;
		if (cellWidth$1("…" + next) > width) break;
		out = next;
	}
	return width < 1 ? "" : "…" + out;
}
/** A flat row's group label: whole when it fits `width`, else its last part, cut from the left. */
function shortLabel(label, width) {
	if (cellWidth$1(label) <= width) return label;
	return cutLeft(label.split("/").pop() ?? label, width);
}
/** `left` and `right` on one row of `width` cells, `right` at its end. */
function spread(left, right, width) {
	const room = width - spansWidth(right) - (right.length ? tokens$1.gutter : 0);
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
	const actions = room - spansWidth(all) - tokens$1.gutter >= MIN_LABEL ? all : [];
	const labelRoom = room - (actions.length ? spansWidth(actions) + tokens$1.gutter : 0);
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
	const glyph = mark === "chosen" ? span(tokens$1.glyph.single.on, {
		role: "accent",
		bold: true
	}) : mark === "dropped" ? span(tokens$1.glyph.dropped, { role: "dim" }) : span(tokens$1.glyph.single.off, { role: "dim" });
	const pointer = r.focused ? [span(tokens$1.glyph.pointer, {
		role: "text",
		bold: true
	}), span(" ")] : [span(" ".repeat(cellWidth$1(tokens$1.glyph.pointer) + 1))];
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
	const texts = rows > 1 ? block$1(spans, textRoom, { max: rows }).map((row) => row.spans) : [truncateSpans(spans, textRoom)];
	const lead = [
		...pointer,
		glyph,
		span(" ")
	];
	const right = aside > 0 ? [span(truncate$1(r.aside ?? "", aside).padStart(aside), { role: r.aside ? "dim" : void 0 })] : [];
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
	const text = [up ? moreText(tokens$1.glyph.more.up, up) : "", down ? moreText(tokens$1.glyph.more.down, down) : ""].filter(Boolean).join(GAP);
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
const DAY$1 = 864e5;
/** `today`, `yesterday`, `3 days ago`, `2 months ago`. */
function ageText(iso, now) {
	const days = Math.floor((now - Date.parse(iso)) / DAY$1);
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
	const q = focused$1(s);
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
	const glyph = choice === "apply" ? tokens$1.glyph.single.on : choice === "dismiss" ? tokens$1.glyph.dropped : tokens$1.glyph.single.off;
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
	const room = width - spansWidth(back) - tokens$1.gutter;
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
		...apply ? [span(`${tokens$1.glyph.single.on} ${apply}`, { role: "accent" })] : [],
		...dismiss ? [span(`${tokens$1.glyph.dropped} ${dismiss}`, { role: "dim" })] : [],
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
function paintLines(k, lines, { press, width = 0, input } = {}) {
	const { Box, Text, Button, Markdown } = k;
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
			label,
			onPress: () => press?.(hit)
		}, body));
	};
	const wordsOf = (spans) => spans.map((s) => s.text).join("");
	const block = (rows, at, isControl = false) => /* @__PURE__ */ h(Text, { key: `rows${at}` }, rows.flatMap((l, r) => {
		const drawn = l.spans.length ? cellWidth$1(wordsOf(l.spans)) : 1;
		const room = isControl ? width - drawn : 0;
		return [
			...r ? ["\n"] : [],
			...l.spans.length ? [] : [" "],
			...l.spans.map((s, i) => run(s, `${at}-${r}-${i}`, isControl)),
			...room > 0 ? [run({ text: " ".repeat(room) }, `${at}-${r}-pad`, isControl)] : []
		];
	}));
	return /* @__PURE__ */ h(Box, { flexDirection: "column" }, groups(lines).map((g, at) => {
		const [first] = g.lines;
		if (first?.slot?.kind === "input") {
			const blankLead = first.slot.lead.findIndex((s) => s.text.trim() !== "");
			const indent = first.slot.lead.slice(0, blankLead < 0 ? void 0 : blankLead).reduce((n, s) => n + cellWidth$1(s.text), 0);
			return /* @__PURE__ */ h(Box, {
				key: `field${at}`,
				flexDirection: "column",
				paddingLeft: indent
			}, input);
		}
		if (first?.slot) return /* @__PURE__ */ h(Box, {
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
/** The same kit in a room of `columns` cells: what a narrower region of the terminal draws at. */
const withColumns = (k, columns) => ({
	...k,
	columns: Math.max(1, Math.floor(columns))
});
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
/**
* The class's cap in columns in a pane `columns` wide, or the content width for `auto`.
* Box has no `maxWidth`, so a mod draws to this width instead of the pane's.
* @param columns The pane's `bodyColumns`.
* @param content The widest line in cells; only `auto` reads it.
*/
function widthCap(cls, columns, content = 0) {
	const cap = (n) => Math.max(1, Math.min(n, columns));
	if (cls === "wide") return cap(columns - tokens.width.wideMargin);
	if (cls === "auto") return cap(Math.min(content, tokens.width.dialog));
	return cap(tokens.width[cls]);
}
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
/**
* How many rows a text takes at a width, each line wrapped: a guess, since words wrap early,
* but measured in cells.
* @param columns The width in cells.
*/
const rowsOf = (text, columns) => text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(cellWidth(line) / columns)), 0);
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
* A pane's body: the blocks of the screen in a column. On the terminal it caps the width to a
* class (`blocks` gets a kit of that width), pads the docked pane by one cell and drops the blank
* rows between blocks in a pane too short for them; a graphical surface has its own gap, and the
* surface scrolls.
* @param blocks The screen's blocks, given the kit to draw them with; `null` ones are left out.
*/
function pane(k, blocks, options = {}) {
	const { Box } = k;
	if (k.isNative) return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.md
	}, blocks(k));
	const padding = k.placement === "inline" ? 0 : tokens.padding;
	const width = widthCap(options.width ?? "reading", k.columns - 2 * padding);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: k.isTight ? 0 : 1,
		paddingX: padding
	}, blocks(withColumns(k, width)));
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
/**
* The heading of a part inside an item: dim on the terminal; a graphical surface sets it in the
* heavier weight too, so it reads apart from a dim label that says when and who.
*/
function subhead(k, text) {
	const { Text } = k;
	return /* @__PURE__ */ h(Text, {
		dimColor: true,
		weight: k.isNative ? "semibold" : void 0
	}, text);
}
/** The evidence's rule: a dim label, with a dim rule after it to the edge on the terminal. */
function rule(k, label) {
	const { Text } = k;
	if (k.isNative) return /* @__PURE__ */ h(Text, {
		dimColor: true,
		size: "caption"
	}, label);
	const fill = tokens.glyph.rule.repeat(Math.max(0, k.columns - cellWidth(label) - 1));
	return /* @__PURE__ */ h(Text, { dimColor: true }, fill ? `${label} ${fill}` : label);
}
/** Cells a set-in block is set in from its heading on the terminal. */
const INDENT = 2;
/**
* Sets `children` in from what they belong to. The terminal gives them a kit two cells narrower.
* @param children Given the kit to draw with.
*/
function indent(k, children) {
	const { Box } = k;
	if (k.isNative) return children(k);
	return /* @__PURE__ */ h(Box, {
		paddingLeft: INDENT,
		flexDirection: "column"
	}, children(withColumns(k, k.columns - INDENT)));
}
/** Cells between a fact's label and its value on the terminal. */
const FACT_GAP = 2;
/**
* Labelled values under an optional heading. The terminal sets the labels in one dim column
* with the values hanging beside it; a graphical surface sets each as a line, its label dim.
*/
function facts(k, items, heading) {
	const { Box, Text } = k;
	const head = heading ? subhead(k, heading) : null;
	const shown = (f) => f.isQuote ? `“${f.value}”` : f.value;
	if (k.isNative) return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.xs
	}, head, items.map((f, i) => /* @__PURE__ */ h(Box, {
		key: `f${i}`,
		flexWrap: "nowrap",
		columnGap: tokens.gui.across.md
	}, /* @__PURE__ */ h(Text, { dimColor: true }, f.label), /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Text, { mono: f.isCode || void 0 }, shown(f))))));
	const width = k.columns;
	const kinds = Math.min(Math.max(...items.map((f) => cellWidth(f.label))), Math.max(4, Math.floor(width / 3)));
	const room = Math.max(1, width - kinds - FACT_GAP);
	return /* @__PURE__ */ h(Box, { flexDirection: "column" }, head, /* @__PURE__ */ h(Text, null, items.flatMap((f, i) => {
		const [first = "", ...rest] = clamp(shown(f), room);
		return [
			i > 0 ? "\n" : "",
			/* @__PURE__ */ h(Text, {
				key: `k${i}`,
				dimColor: true
			}, fit(f.label, kinds)),
			`${" ".repeat(FACT_GAP)}${first}`,
			...rest.map((line) => `\n${" ".repeat(kinds + FACT_GAP)}${line}`)
		];
	})));
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
/** What a reviewed item is: a kind and the colour role it is drawn in. */
const KIND_TONE = {
	wrong: "error",
	stale: "warning",
	missing: "neutral"
};
const KIND_ROLE = {
	wrong: "error",
	stale: "warning",
	missing: "text"
};
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
* The graphical card: a row, opened in place (`guiRow`). Its mark is the kind's icon, or what it
* is set to; opened, its body is the kind and its history, the evidence, and the keys that set it.
*/
function cardGui(k, o) {
	const { Text } = k;
	const times = o.seen ?? 1;
	const kind = capital(o.kind);
	const mark = o.tone === "apply" ? icon(k, "success", {
		tone: "success",
		alt: "Set to apply"
	}) : o.tone === "dismiss" ? icon(k, "error", { alt: "Set to dismiss" }) : icon(k, o.kind, {
		tone: KIND_TONE[o.kind],
		alt: kind
	});
	const history = [times > 1 ? `seen ${times} times` : "", o.age ? `${o.age} ago` : ""].filter(Boolean);
	return guiRow(k, {
		key: o.key,
		mark,
		text: o.claim,
		isStruck: o.tone === "dismiss",
		isOpen: o.isOpen,
		button: {
			key: o.details.key,
			label: o.isOpen ? "Close" : "Open",
			onPress: () => o.onToggle({ isAlone: true })
		},
		body: [
			/* @__PURE__ */ h(Text, { key: "meta" }, /* @__PURE__ */ h(Text, roleProps(KIND_ROLE[o.kind]), kind), history.length ? /* @__PURE__ */ h(Text, { dimColor: true }, `  ·  ${history.join("  ·  ")}`) : null),
			o.details.render(k),
			choice(k, o.choice.options, o.choice)
		]
	});
}
/**
* One reviewed item: its claim, its kind, how often and how long ago, its keys and its details.
* The terminal cuts a folded claim and sets the keys at the right of the meta line; a graphical
* surface draws a row that opens in place (`cardGui`).
*/
function card(k, o) {
	const { Box, Button, Text } = k;
	const times = o.seen ?? 1;
	if (k.isNative) return cardGui(k, o);
	const width = k.columns;
	const state = o.tone;
	const lines = clamp(o.claim, width, o.isOpen ? {} : { max: o.tui?.foldedLines ?? tokens.foldedLines });
	const repeats = times > 1 ? `${times}×` : "";
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column"
	}, /* @__PURE__ */ h(Button, {
		key: o.claimKey,
		plain: true,
		autoFocus: o.autoFocus ? true : void 0,
		onPress: () => o.onToggle()
	}, /* @__PURE__ */ h(Text, {
		weight: state === "dismiss" ? void 0 : "semibold",
		strikethrough: state === "dismiss" || void 0,
		...state === "dismiss" ? roleProps("dim") : state === "apply" ? roleProps("success") : {}
	}, lines.join("\n"))), /* @__PURE__ */ h(Box, {
		flexWrap: "wrap",
		columnGap: tokens.gutter,
		justifyContent: "space-between"
	}, /* @__PURE__ */ h(Box, {
		flexWrap: "wrap",
		columnGap: tokens.gutter
	}, /* @__PURE__ */ h(Text, {
		weight: "bold",
		...roleProps(KIND_ROLE[o.kind])
	}, `${tokens.glyph.kind[o.kind]} ${o.kind}`), /* @__PURE__ */ h(Text, { dimColor: true }, [repeats, o.age ?? ""].filter(Boolean).join("  ")), /* @__PURE__ */ h(Button, {
		key: o.details.key,
		plain: true,
		dimColor: true,
		onPress: () => o.onToggle()
	}, `${o.isOpen ? tokens.glyph.fold.open : tokens.glyph.fold.closed} evidence${o.details.count > 1 ? ` ${o.details.count}` : ""}`)), choice(k, o.choice.options, {
		...o.choice,
		key: `chips:${o.key}`
	})), o.isOpen ? /* @__PURE__ */ h(Box, {
		key: `e:${o.key}`,
		flexDirection: "column",
		paddingTop: 1,
		paddingLeft: INDENT
	}, o.details.render(withColumns(k, Math.max(1, width - INDENT)))) : null);
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

// src/claude/evidence.tsx
/**
* A suggestion's evidence as a person reads it: each piece under a dim label that says when and
* who, its paragraphs at the full width of the room, the labelled ones named, and the
* citations as a list of what they point at instead of the JSON an agent wrote them as.
* What is in the text is the core's (`readEvidence`); this only says what goes where, and the
* kit draws it for the surface.
*/
function block(k, b, key) {
	const { Box } = k;
	if (b.items) return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "column"
	}, facts(k, b.items.map((c) => ({
		label: c.kind,
		value: c.value,
		isQuote: c.kind === "quote",
		isCode: c.kind !== "quote"
	})), b.heading || void 0));
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "column"
	}, b.heading ? subhead(k, b.heading) : null, prose(k, b.lines.join("\n")));
}
/**
* The evidence, newest first: one piece has no label of its own, its age saying when; several
* each get a dated label.
*/
function evidence(k, items) {
	const { Box } = k;
	const isSingle = items.length === 1;
	return stack(k, [...items].reverse().map((e, i) => {
		const view = readEvidence(e);
		const blocks = (inner) => stack(inner, evidenceBlocks(view).map((b, n) => block(inner, b, `p${n}`)), { gui: { gap: "sm" } });
		return /* @__PURE__ */ h(Box, {
			key: `ev${i}`,
			flexDirection: "column"
		}, isSingle ? null : rule(k, evidenceLabel(view)), isSingle ? blocks(k) : indent(k, blocks));
	}), { gui: { gap: "sm" } });
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
const queue = atom({
	plugin: "docfix",
	key: "queue"
}, [], { shape: "queue-1" });
const choices = atom({
	plugin: "docfix",
	key: "choices"
}, {}, { shape: "choices-1" });
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
/**
* Rows the pane takes with every row folded, a guess at `WANTED_COLUMNS`: what it asks an inline
* pane to open at, so a short queue is not a box of a few rows to scroll.
*/
function wantedRows(list) {
	const text = WANTED_COLUMNS;
	return 6 + byTarget(list).reduce((n, [, rows]) => n + 3 + rows.reduce((m, s) => m + Math.min(tokens.foldedLines, rowsOf(s.claim, text)) + 2, 0), 0);
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
* The element keys the pane draws. The ring stops only on a row's claim and the submit key; the
* rest (a row's evidence key, its apply, dismiss and skip) are for the mouse, and the keyboard
* reaches them by their hotkeys.
*/
const rowKey = (id) => `row:${id}`;
const evidenceKey = (id) => `ev:${id}`;
const chipKey = (choice, owner) => `${choice}:${owner}`;
const SUBMIT = "submit";
/** The stops in the order the pane draws them. */
const stopsOf = (list) => [...byTarget(list).flatMap(([, rows]) => rows.map((s) => rowKey(s.id))), SUBMIT];
/** The stop an element belongs to: a chip or an evidence line to its row. */
function ownerOf(element) {
	const [kind, ...rest] = element.split(":");
	const id = rest.join(":");
	if (kind === "row" || element === SUBMIT) return element;
	if (kind === "ev") return rowKey(id);
	if (kind === "apply" || kind === "dismiss" || kind === "skip") return id;
}
/**
* Where a move of the ring onto `element` should land instead, or undefined to let it be: past
* a row's extras, on to the next stop going down and back to their owner going up.
*/
function landing(stops, from, element) {
	const owner = ownerOf(element);
	if (owner === element) return void 0;
	if (owner === void 0) return void 0;
	const at = stops.indexOf(owner);
	if (at < 0) return void 0;
	const was = from === null ? -1 : stops.indexOf(ownerOf(from) ?? "");
	return was <= at && was >= 0 ? stops[at + 1] ?? owner : owner;
}
const DAY = 864e5;
/** `5m`, `3h`, `40d`: how long ago, in at most four cells. */
const age = (iso, now) => {
	const ms = Math.max(0, now - Date.parse(iso));
	if (Number.isNaN(ms)) return "";
	if (ms >= DAY) return `${Math.floor(ms / DAY)}d`;
	if (ms >= 36e5) return `${Math.floor(ms / 36e5)}h`;
	return `${Math.floor(ms / 6e4)}m`;
};
/** The row a stop stands for, as a list: none for the submit key or a row gone from the queue. */
function idsOf(list, stop) {
	if (!stop.startsWith("row:")) return [];
	const id = stop.slice(4);
	return list.some((s) => s.id === id) ? [id] : [];
}
const CHOICES = [
	"apply",
	"dismiss",
	"skip"
];
const HOTKEY = {
	apply: "a",
	dismiss: "d",
	skip: "s"
};
/**
* The apply, dismiss and skip options of a row, the one it is set to on. Every row offers all
* three whatever the ring is on: the engine keeps the ring at its place among
* the Buttons across a redraw, so a Button that came and went with the ring would move it. Only
* the hotkeys follow the ring.
*/
function optionsOf(r, owner, ids, state) {
	const isKeyed = r.keyed === owner;
	return CHOICES.map((choice) => ({
		key: chipKey(choice, owner),
		label: choice,
		isOn: state === choice,
		isQuiet: choice === "skip",
		hotkey: isKeyed ? HOTKEY[choice] : void 0,
		onPress: () => isKeyed ? r.chooseFocused(choice === "skip" ? void 0 : choice) : r.choose(ids, choice === "skip" ? void 0 : choice)
	}));
}
/** One suggestion: its claim, kind, age, keys and evidence; what it is set to colours the claim. */
function row(k, r, s) {
	const state = r.set[s.id];
	return card(k, {
		key: `s:${s.id}`,
		claim: s.claim,
		claimKey: rowKey(s.id),
		kind: s.kind,
		seen: seen(s),
		age: age(s.updated, r.now),
		tone: state,
		isOpen: r.open.has(s.id),
		onToggle: (how) => r.toggleOpen(s.id, how?.isAlone),
		autoFocus: s.id === r.first,
		details: {
			key: evidenceKey(s.id),
			count: s.evidence.length,
			render: (inner) => evidence(inner, s.evidence)
		},
		choice: {
			options: optionsOf(r, rowKey(s.id), [s.id], state ?? "skip"),
			gui: { layout: "row" }
		}
	});
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
		const { Box } = $.ui.resolve(e);
		const kit = kitOf($.ui.resolve(e), e);
		return /* @__PURE__ */ h(Box, { flexDirection: "column" }, below, statusBand(kit, {
			key: "docfix:open",
			text: `docfix: docs ${n}`,
			hint: "review",
			gui: { text: n === 1 ? "1 doc suggestion to review" : `${n} doc suggestions to review` },
			status: "warning",
			onPress: () => openPane($)
		}));
	});
	on("ui.render", {
		component: "Pane",
		requestId: PANE
	}, async ($, e) => {
		paneSurface = e.surface;
		if (e.surface === "terminal") {
			const els = $.ui.resolve(e);
			const { Box } = els;
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
			return /* @__PURE__ */ h(Box, {
				flexDirection: "column",
				paddingLeft: pad
			}, paintLines(els, drawnScreen.lines, {
				press: (hit) => act($, {
					do: "press",
					hit
				}),
				width
			}), /* @__PURE__ */ h(Box, { paddingLeft: captionFrameLayout.x }, keysHint(els, held) ?? paintLines(els, [blank()])), ring(els, () => act($, { do: "main" }), SCREEN_KEYS.map((key) => ({
				key,
				press: () => press($, key)
			}))));
		}
		const kit = kitOf($.ui.resolve(e), e);
		const queued = await read($, queue);
		const set = await read($, choices);
		const focus = await read($, focused);
		const open = new Set(await read($, expanded));
		const isAll = await read($, showAll);
		const { text: noted, status } = await read($, said);
		const now = await $.clock.now();
		const stops = stopsOf(queued);
		const first = queued[0]?.id;
		const rows = {
			now,
			set,
			open,
			keyed: focus === SUBMIT ? void 0 : focus && stops.includes(focus) ? focus : first ? rowKey(first) : void 0,
			first,
			choose: async (ids, choice) => {
				await update($, choices, (cur) => toggleChoice(cur, ids, choice));
				await say($, "");
			},
			chooseFocused: async (choice) => {
				const at = await read($, focused);
				if (at === SUBMIT) return;
				const stop = at && stops.includes(at) ? at : first ? rowKey(first) : "";
				const ids = idsOf(await read($, queue), stop);
				if (ids.length === 0) return;
				await update($, choices, (cur) => toggleChoice(cur, ids, choice));
				await say($, "");
			},
			toggleOpen: (id, isAlone) => update($, expanded, (cur) => cur.includes(id) ? cur.filter((at) => at !== id) : isAlone ? [id] : [...cur, id])
		};
		const summary = choiceSummary(queued.map((s) => set[s.id]));
		const actions = [{
			key: SUBMIT,
			label: "submit",
			isPrimary: true,
			gui: { isPrimary: Boolean(summary) },
			onPress: async () => {
				if (!await settle($)) return;
				await update($, paneShown, () => false);
				await $.ui.close({ id: PANE });
			}
		}];
		return pane(kit, (k) => {
			const head = paneTitle(k, "Doc suggestions", queued.length || void 0, { gui: {
				count: queued.length ? `${queued.length} open` : void 0,
				summary: summary ? `On close: ${summary}` : void 0,
				actions: queued.length ? actions : void 0
			} });
			const said_ = noted ? notice(k, noted, status, { isWrapped: true }) : null;
			if (queued.length === 0) return [
				head,
				said_,
				emptyState(k, "Nothing to review: no open doc suggestions in this repo. An agent files one when a doc it reads no longer matches the code.")
			];
			const bar = summary ? notice(k, `On close: ${summary}`, "text", {
				isWrapped: true,
				gui: { isHidden: true }
			}) : notice(k, "Submit or close to carry out apply and dismiss", "dim", {
				isWrapped: true,
				gui: { isHidden: true }
			});
			const { shown, more } = capped(k, queued, {
				isAll,
				onMore: () => update($, showAll, () => true)
			});
			const submit = actionBar(k, actions, { gui: { isHidden: true } });
			return [
				head,
				bar,
				said_,
				stack(k, byTarget(shown).map(([target, list]) => stack(k, [section(k, target, {
					isCode: true,
					isWrapped: true
				}), stack(k, list.map((s) => row(k, rows, s)), { gui: { gap: "none" } })], {
					isTight: true,
					gui: { gap: "xs" }
				}))),
				more,
				submit
			];
		});
	});
};

export { register };