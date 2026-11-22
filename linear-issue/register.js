import { atom, read, update } from "claude-code";

// src/lib/draft.ts
const NO_LINEAR = "Linear MCP unavailable or signed out, re-authenticate with /mcp";
const PRIORITIES = [
	{
		value: "1",
		label: "Urgent"
	},
	{
		value: "2",
		label: "High"
	},
	{
		value: "3",
		label: "Medium"
	},
	{
		value: "4",
		label: "Low"
	},
	{
		value: "0",
		label: "No priority"
	}
];
const FALLBACK_TEAM = "MSC";
const MESSAGE_CHARS = 2e3;
const SEARCH_HITS = 10;
const CANDIDATES = 20;
const CANDIDATE_CHARS = 300;
const CLOSED = [
	"completed",
	"canceled",
	"duplicate"
];
const SYSTEM = `You draft a Linear issue for the user to deal with later, from one of two seeds: an <insight> that a side agent flagged while it watched their session, or a <note> the user typed with /linear. The seed is what to file; the recent conversation is context for it. An empty <note> means: file what the recent conversation is about. The user reviews and edits your draft before it is created.

- team: the key of the team from <teams> that the repository and topic belong to; when unsure, the <defaults> team.
- title: short and specific, imperative, under 80 characters.
- description: Linear markdown that reads at a glance. Prefer structure to prose: one sentence saying what to do and why, then the details as bullets, never as a paragraph. Use the richer forms only when the content has that shape:
  - a table when comparing options, listing items that share attributes, or mapping before to after
  - a checklist (- [ ]) when the work splits into separate steps
  No diagrams: the draft cannot draw them.
  Then, leaving out a line you have nothing concrete for:
  **Where:** the file paths, symbols or commands named in the seed or conversation, in backticks
  **Done when:** one line saying how to tell it is finished
  No headings, no story of the session, no restating the title; about 120 words at most, a table not counted. Do not add a source or session line; it is appended for you.
- priority: 1 urgent, 2 high, 3 medium, 4 low. Reserve 1 for things that are breaking now; when unsure, the <defaults> priority.
- labels: names from <labels> that clearly fit, usually none.
- search: two or three short phrases, one to three words each, that an existing issue about the same problem would contain in its title or description; used to look for duplicates.
- Never copy secrets, tokens, credentials or .env contents into the draft.

Answer with one JSON object and nothing else:
{"team": "...", "title": "...", "description": "...", "priority": 4, "labels": [], "search": []}`;
const DUPLICATE_SYSTEM = `You check whether an open Linear issue already covers a <draft> the user is about to file. The <candidates> came from a keyword search, so most are unrelated. Only call one a duplicate when it is about the same problem or change, not merely the same area.

When one is, answer its key and a one-or-two-sentence comment for it adding what the draft knows that the issue does not. Never copy secrets, tokens, credentials or .env contents.

Answer with one JSON object and nothing else:
{"duplicate": null} or {"duplicate": {"issue": "KEY-1", "comment": "..."}}`;
const errorText = (error) => error instanceof Error ? error.message : String(error);
const oneLine$1 = (text) => text.replace(/\s*\n\s*/g, " ");
/** `owner/repo` from a git remote URL, or undefined when it names none. */
const repoName = (remote) => /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1];
/** The JSON object in a model reply, which may wrap it in prose or a fence. */
function replyJson(text) {
	return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}
/** The label a field's value has among its options. */
const labelOf$1 = (options, value) => options.find((o) => o.value === value)?.label;
/** The description as it is filed: with the line saying where it came from. */
const filedDescription = (f) => f.source ? `${f.description.trimEnd()}\n\n---\n${f.source}` : f.description;
/** The drafter's brief: the seed with where it came from, and the trailing source line. */
function brief(seed, o) {
	const recent = o.messages.filter((m) => m.text.trim() !== "").slice(-8).map((m) => {
		const text = m.text.length > MESSAGE_CHARS ? `${m.text.slice(0, MESSAGE_CHARS)}…` : m.text;
		return `<${m.role}>\n${text}\n</${m.role}>`;
	}).join("\n");
	const name = o.repo ?? o.cwd.split("/").pop() ?? o.cwd;
	return {
		text: [
			`<${seed.kind}>\n${seed.text}\n</${seed.kind}>`,
			`<source>\ndirectory: ${o.cwd}\nrepository: ${name}\nbranch: ${o.branch}\n</source>`,
			`<recent_conversation>\n${recent}\n</recent_conversation>`
		].join("\n\n"),
		source: `Source: \`${name}\` · ${o.branch} · session ${o.sessionId}`
	};
}
const blankForm = (draftId, seed) => ({
	draftId,
	phase: "drafting",
	stage: "linear",
	error: null,
	seed,
	source: "",
	teams: [],
	statuses: [],
	labels: [],
	projects: [],
	team: "",
	title: "",
	fieldRevision: 0,
	description: "",
	priority: 0,
	state: "",
	labelIds: [],
	project: "",
	duplicate: null,
	isCheckingDuplicates: false,
	settledAt: 0
});
/** The draft's own verbs, bound to one client's `Host`. */
function drafter(host, teamOptions = /* @__PURE__ */ new Map()) {
	const patch = (change) => host.update((cur) => cur && {
		...cur,
		...change
	});
	const call = (tool, args) => host.linear(tool, args);
	function loadTeam(team) {
		let options = teamOptions.get(team);
		if (!options) {
			options = (async () => {
				const [statuses, labels, projects] = await Promise.all([
					call("list_issue_statuses", { team }),
					call("list_issue_labels", {
						team,
						limit: 250
					}),
					call("list_projects", {
						team,
						limit: 50
					})
				]);
				const todo = statuses.find((s) => s.name === "Todo") ?? statuses.find((s) => s.type === "unstarted");
				return {
					statuses: statuses.map((s) => ({
						value: s.id,
						label: s.name
					})),
					labels: labels.labels.filter((l) => !l.archivedAt).map((l) => ({
						value: l.id,
						label: l.parent ? `${l.parent}/${l.name}` : l.name
					})),
					projects: [{
						value: "",
						label: "No project"
					}, ...projects.projects.map((p) => ({
						value: p.id,
						label: p.name
					}))],
					todo: todo?.id ?? statuses[0]?.id ?? ""
				};
			})();
			teamOptions.set(team, options);
			options.catch(() => teamOptions.delete(team));
		}
		return options;
	}
	/** Open issues anywhere in the workspace that any of `terms` finds, most hits first. */
	async function searchOpen(terms) {
		const found = await Promise.all(terms.map((query) => call("list_issues", {
			query,
			limit: SEARCH_HITS,
			fields: [
				"title",
				"statusType",
				"team",
				"description"
			]
		}).then((r) => r.issues, () => [])));
		const hits = /* @__PURE__ */ new Map();
		for (const issue of found.flat()) {
			if (CLOSED.includes(issue.statusType)) continue;
			const seen = hits.get(issue.id);
			hits.set(issue.id, {
				issue,
				count: (seen?.count ?? 0) + 1
			});
		}
		return [...hits.values()].sort((a, b) => b.count - a.count).slice(0, CANDIDATES).map((h) => h.issue);
	}
	/**
	* Looks for an open issue covering the draft `draftId` and offers commenting on it. Runs
	* after the form is ready, so a slow search never holds up Create; a result for a draft that
	* has since been filed or discarded is dropped.
	*/
	async function checkDuplicates(draftId, draft) {
		const settle = async (duplicate) => {
			const now = await host.now();
			await host.update((cur) => cur?.draftId === draftId ? {
				...cur,
				duplicate,
				isCheckingDuplicates: false,
				settledAt: duplicate ? now : cur.settledAt
			} : cur);
		};
		try {
			const terms = (draft.search ?? []).filter((t) => t.trim() !== "").slice(0, 3);
			const candidates = await searchOpen(terms.length > 0 ? terms : [draft.title]);
			if (candidates.length === 0) return await settle(null);
			const reply = await host.complete({
				system: DUPLICATE_SYSTEM,
				maxTokens: 1e3,
				prompt: [`<draft>\n${draft.title}\n\n${draft.description}\n</draft>`, `<candidates>\n${candidates.map((i) => {
					const about = oneLine$1(i.description ?? "").slice(0, CANDIDATE_CHARS);
					return `${i.id} [${i.team}] ${i.title}${about && `\n  ${about}`}`;
				}).join("\n")}\n</candidates>`].join("\n\n")
			});
			if ("error" in reply) return await settle(null);
			const v = replyJson(reply.text).duplicate;
			const dup = v && candidates.find((i) => i.id === v.issue);
			const about = oneLine$1(dup?.description ?? "").slice(0, CANDIDATE_CHARS);
			await settle(dup && v ? {
				issue: dup.id,
				title: dup.title,
				comment: v.comment,
				team: dup.team,
				status: dup.statusType,
				...about && { about }
			} : null);
		} catch (error) {
			host.log(`linear-issue: duplicate check failed: ${errorText(error)}`);
			await settle(null);
		}
	}
	/** Drafts from the open form's seed and fills it. */
	async function fill(draftId, seed) {
		const mine = async () => (await host.read())?.draftId === draftId;
		const fail = async (error) => {
			if (await mine()) await patch({
				phase: "failed",
				error
			});
		};
		try {
			const b = brief(seed, await host.origin());
			await patch({ source: b.source });
			const teams = (await call("get_user", { query: "me" })).teams.map((t) => ({
				value: t.key,
				label: `${t.name} (${t.key})`
			}));
			const last = await host.last().catch(() => void 0);
			const fallback = [last?.team, FALLBACK_TEAM].find((k) => teams.some((t) => t.value === k)) ?? teams[0]?.value ?? "";
			const usual = labelOf$1(PRIORITIES, String(last?.priority ?? 4)) ?? "Low";
			const guess = await loadTeam(fallback);
			if (!await mine()) return;
			await patch({ stage: "writing" });
			const reply = await host.complete({
				system: SYSTEM,
				maxTokens: 4e3,
				prompt: [
					b.text,
					`<defaults>\nteam: ${fallback}\npriority: ${usual}\n</defaults>`,
					`<teams>\n${teams.map((t) => t.label).join("\n")}\n</teams>`,
					`<labels>\n${guess.labels.map((l) => l.label).join("\n")}\n</labels>`
				].join("\n\n")
			});
			if ("error" in reply) return await fail(`drafting failed: ${reply.error}`);
			const d = replyJson(reply.text);
			const team = teams.some((t) => t.value === d.team) ? d.team : fallback;
			const options = await loadTeam(team);
			const labelIds = (d.labels ?? []).flatMap((name) => {
				const l = options.labels.find((o) => o.label === name || o.label.endsWith(`/${name}`));
				return l ? [l.value] : [];
			});
			if (!await mine()) return;
			await patch({
				settledAt: await host.now(),
				phase: "ready",
				error: null,
				teams,
				statuses: options.statuses,
				labels: options.labels,
				projects: options.projects,
				team,
				title: oneLine$1(d.title),
				description: d.description,
				priority: PRIORITIES.some((p) => p.value === String(d.priority)) ? d.priority : 0,
				state: options.todo,
				labelIds,
				project: "",
				isCheckingDuplicates: true
			});
			checkDuplicates(draftId, d);
		} catch (error) {
			await fail(errorText(error));
		}
	}
	return {
		/**
		* A new draft for `seed`, which drafting then fills; undefined while another is open, which
		* the client shows again instead. A failed draft gives way to a new one.
		*/
		async start(seed) {
			const open = await host.read();
			if (open && open.phase !== "failed") return void 0;
			const now = await host.now();
			const f = blankForm(`${now}-${Math.random().toString(36).slice(2)}`, seed);
			await host.update(() => f);
			fill(f.draftId, seed);
			return f;
		},
		/** Drafts a failed draft again, from the same seed. */
		async retry() {
			const f = await host.read();
			if (!f || f.phase !== "failed") return;
			await patch({
				phase: "drafting",
				stage: "linear",
				error: null
			});
			fill(f.draftId, f.seed);
		},
		/** Moves the draft to `team`: its statuses and projects, and the labels it has by name. */
		async switchTeam(team) {
			const options = await loadTeam(team).catch(() => void 0);
			if (!options) return;
			await host.update((cur) => {
				if (!cur) return cur;
				const keep = (ids) => ids.flatMap((id) => {
					const name = labelOf$1(cur.labels, id);
					const same = options.labels.find((l) => l.label === name);
					return same ? [same.value] : [];
				});
				return {
					...cur,
					team,
					statuses: options.statuses,
					labels: options.labels,
					projects: options.projects,
					state: options.todo,
					labelIds: keep(cur.labelIds),
					project: ""
				};
			});
		},
		/**
		* Writes the draft to Linear: the issue, or with `asComment` the duplicate's comment. Gives
		* what was filed, and leaves the draft open for the client to close; on an error the draft
		* says why and nothing is given.
		*/
		async submit({ asComment = false, open = false } = {}) {
			const f = await host.read();
			if (!f || f.phase !== "ready") return void 0;
			await patch({
				phase: "filing",
				error: null
			});
			try {
				if (asComment && f.duplicate) {
					const r = await call("save_comment", {
						issueId: f.duplicate.issue,
						body: f.duplicate.comment
					});
					const url = /https:\/\/linear\.app\/[^"'\s)]+/.exec(JSON.stringify(r))?.[0] ?? "";
					const last = await host.last().catch(() => void 0);
					if (last) await host.remember({
						...last,
						open
					}).catch(() => void 0);
					return {
						key: f.duplicate.issue,
						title: `commented: ${f.duplicate.title}`,
						url
					};
				}
				const r = await call("save_issue", {
					team: f.team,
					title: f.title,
					description: filedDescription(f),
					assignee: "me",
					state: f.state,
					priority: f.priority,
					...f.labelIds.length > 0 && { labels: f.labelIds },
					...f.project && { project: f.project }
				});
				const text = JSON.stringify(r);
				const key = r.identifier ?? r.id ?? /\b[A-Z][A-Z0-9]+-\d+\b/.exec(text)?.[0] ?? "";
				const url = r.url ?? /https:\/\/linear\.app\/[^"'\s)]+/.exec(text)?.[0] ?? "";
				await host.remember({
					team: f.team,
					priority: f.priority,
					open
				}).catch(() => void 0);
				return {
					key,
					title: f.title,
					url
				};
			} catch (error) {
				await patch({
					phase: "ready",
					error: errorText(error)
				});
				return;
			}
		}
	};
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
/** A host-drawn block in the drawing's flow. */
const slotLine = (slot) => ({
	spans: [],
	slot
});
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
/**
* Greedy word wrap in cells: a line ends at a space or between wide characters, a narrow word
* longer than the width is broken, and a `\n` ends a line.
*/
function wrap$1(text, width) {
	const out = [];
	for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
		let line = "";
		let used = 0;
		const words = paragraph.split(/[ \t]+/).filter(Boolean);
		if (words.length === 0) out.push("");
		for (const word of words) {
			let gap = used > 0 ? 1 : 0;
			for (let unit of units(word)) {
				let w = cellWidth$1(unit);
				if (used > 0 && used + gap + w > width) {
					out.push(line);
					line = "";
					used = 0;
					gap = 0;
				}
				while (w > width) {
					const [head, rest] = split$1(unit, width);
					out.push(head);
					unit = rest;
					w = cellWidth$1(unit);
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
function truncate$1(text, width) {
	if (cellWidth$1(text) <= width) return text;
	return split$1(text, Math.max(0, width - 1))[0] + "…";
}
/**
* Plain text wrapped to `width` cells and bounded in lines: `{min: 1, max: 1}` truncates to one
* line; no options wraps without limit.
*/
function clamp$1(text, width, options = {}) {
	if (width < 1) return [];
	const { min = 0, max = 1e400 } = options;
	const cap = Math.max(min, max);
	let lines = wrap$1(text, width);
	if (lines.length > cap) {
		if (cap === 0) return [];
		const rest = lines.slice(cap - 1).join(" ");
		lines = [...lines.slice(0, cap - 1), truncate$1(rest, width)];
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
			if (over > 0) tail.text = split$1(tail.text, Math.max(0, cellWidth$1(tail.text) - over))[0];
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
/** Spaces that bring `spans` to `width` cells, as one unstyled span; none when they are wider. */
const padding = (spans, width) => {
	const room = width - spansWidth(spans);
	return room > 0 ? [span(" ".repeat(room))] : [];
};
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
/** `top` after a step of `by` lines, for a window that was drawn with `scrolled`. */
const scrollBy = (window, by) => Math.max(0, Math.min(window.max, window.top + by));

// ../../lib/kits/card/src/contract.ts
/** The row id of a list's item, as a drawn line's `hit`. */
const choiceHit = (index) => `choice:${index}`;
/** The item a `hit` names, or -1. */
const choiceOf = (hit) => hit?.startsWith("choice:") ? Number(hit.slice(7)) : -1;

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP$5 = " ".repeat(tokens$1.gutter);
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
/** What a person can press on a card: in the accent on the keyboard's card, quiet elsewhere. */
const keyRole$2 = (state) => state.active ? "accent" : "dim";
/**
* The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
* before a row of its own, such as an input, to line it up with the card's.
*/
const CARD_INSET = " ".repeat(cellWidth$1(tokens$1.glyph.pointer) + 1);
/** The pointer column of one row: the pointer where the keyboard is, else blank. */
const pointerLead = (isFocused = false) => isFocused ? [span(tokens$1.glyph.pointer, {
	role: "text",
	bold: true
}), span(" ")] : [span(CARD_INSET)];
/**
* One answer: the pointer column, its key, its mark and its words, wrapped to hang under their
* first line. Only a chosen one takes a colour, the accent.
*/
function choice$1(c, width) {
	const { chosen = false, literal: isLiteral = false, focused = false, hovered = false } = c;
	const marks = c.multiple ? tokens$1.glyph.multi : tokens$1.glyph.single;
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
		span(c.key || " ", { role: keyRole$2(c) }),
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
/** A list of answers the keyboard moves through: `choice` rows, each a control. */
function choiceList(list, width) {
	return list.items.flatMap((item, i) => choice$1({
		active: list.active,
		key: item.key,
		text: item.text,
		detail: item.detail,
		chosen: list.chosen.includes(i),
		focused: list.focus === i,
		hovered: list.hover === i,
		multiple: list.multiple,
		literal: item.writeIn,
		hit: choiceHit(i)
	}, width));
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

// ../../lib/kits/fields/src/contract.ts
/** The control a field is, as a drawn row's `hit`. */
const fieldHit = (id) => `field:${id}`;
/** The field a `hit` names. */
const fieldOf = (hit) => hit?.startsWith("field:") ? hit.slice(6) : void 0;

// ../../lib/kits/fields/src/terminal.ts
/** Fields as styled lines: the one drawing both terminals paint. */
const GAP$4 = " ".repeat(tokens$1.gutter);
/** What a person can press: in the accent where the keyboard is, quiet elsewhere. */
const keyRole$1 = (isActive = false) => isActive ? "accent" : "dim";
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
function fields$1(all, width, options = {}) {
	const { active, inline: isInline = false, valueLines = 2 } = options;
	const hasKeys = all.some((f) => f.key);
	if (isInline) {
		const rows = [];
		let spans = [];
		for (const f of all) {
			const lead = f.key ?? f.label;
			const entry = truncateSpans([
				span(lead, {
					role: f.key ? keyRole$1(active) : "dim",
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
			if (spans.length) spans.push(span(GAP$4));
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
			...hasKeys ? [span((f.key ?? "").padEnd(keyed - tokens$1.gutter), { role: keyRole$1(active) }), span(GAP$4)] : [],
			...label,
			span(" ".repeat(labelled - spansWidth(label)) + GAP$4)
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

// ../../lib/kits/prose/src/terminal.ts
/**
* Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
* here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
* that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
* needs syntax colours or runs as long as it likes.
*/
const GAP$3 = " ".repeat(tokens$1.gutter);
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
		const columns = widths.map((w, i) => block(inline(cells[i] ?? "", style), w));
		const height = Math.max(1, ...columns.map((column) => column.length));
		return Array.from({ length: height }, (_, y) => {
			const spans = [];
			columns.forEach((column, i) => {
				const cell = column[y]?.spans ?? [];
				const used = cell.reduce((n, s) => n + cellWidth$1(s.text), 0);
				const isLast = i === columns.length - 1;
				spans.push(...cell);
				if (!isLast) spans.push(span(" ".repeat(Math.max(0, (widths[i] ?? 0) - used)) + GAP$3));
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
			for (const l of code) out.push(line([span(GAP$3), span(truncate$1(l, width - tokens$1.gutter), { role: "code" })]));
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
			const lead = [span(tokens$1.glyph.rail, quiet), span(" ")];
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
			const mark = tick !== void 0 ? span(tick === " " ? "[ ]" : "[x]", tick === " " ? quiet : { role: "success" }) : span(number ? `${number}.` : tokens$1.glyph.bullet, quiet);
			out.push(...block(inline(rest, base), width, { lead: [
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

// src/lib/screen.ts
const TITLE = "Linear draft";
const DISCARD_PROMPT = "Discard draft?";
const FIELDS = [
	"team",
	"status",
	"priority",
	"labels",
	"project"
];
/** The letter that opens each field: Linear's own for status, priority and labels. */
const FIELD_KEY = {
	team: "T",
	status: "S",
	priority: "P",
	labels: "L",
	project: "J"
};
const FIELD_LABEL = {
	team: "Team",
	status: "Status",
	priority: "Priority",
	labels: "Labels",
	project: "Project"
};
const TITLE_KEY = "E";
const startView = (opens = false) => ({
	step: "review",
	top: 0,
	focus: 0,
	isConfirming: false,
	opens,
	since: 0
});
const HIT = {
	title: "title",
	duplicate: "duplicate",
	up: "scroll:up",
	down: "scroll:down",
	done: "act:done",
	opens: "act:opens",
	act: (name) => `act:${name}`
};
const GAP$2 = " ".repeat(tokens$1.gutter);
/** An Enter this soon after what it does changed was meant for what stood there before. */
const GRACE_MS = 600;
/** The key that keeps the draft, and the one that goes back, where Escape is not the screen's. */
const KEEP_KEY = "k";
/**
* Where letters are the answers' own, digits are free: one goes back, and one ticks the row
* under the pointer in a list with more rows than there are letters.
*/
const BACK_KEY = "0";
const TICK_KEY = "1";
/** The key that opens the description to be typed: the x of its button's "text". */
const BODY_KEY = "x";
/**
* Rows the description's field is given at least, its rules included, while the room has them:
* a short draft grows to be written in.
*/
const FIELD_ROWS = 12;
const isMultiple = (id) => id === "labels";
const optionsOf = (f, id) => id === "team" ? f.teams : id === "status" ? f.statuses : id === "priority" ? PRIORITIES : id === "labels" ? f.labels : f.projects;
const chosenOf = (f, id) => id === "team" ? [f.team] : id === "status" ? [f.state] : id === "priority" ? [String(f.priority)] : id === "labels" ? f.labelIds : [f.project];
function fieldRows(f, hover) {
	const chosen = f.labels.filter((l) => f.labelIds.includes(l.value)).map((l) => l.label);
	const values = {
		team: { value: labelOf$1(f.teams, f.team) ?? f.team },
		status: { value: labelOf$1(f.statuses, f.state) ?? "" },
		priority: {
			value: labelOf$1(PRIORITIES, String(f.priority)) ?? "No priority",
			empty: f.priority === 0
		},
		labels: {
			value: chosen.join(", ") || "None",
			empty: chosen.length === 0
		},
		project: f.project ? { value: labelOf$1(f.projects, f.project) ?? "" } : {
			value: "None",
			empty: true
		}
	};
	return FIELDS.map((id) => ({
		key: FIELD_KEY[id],
		label: FIELD_LABEL[id],
		hit: fieldHit(id),
		hovered: hover === fieldHit(id),
		...values[id]
	}));
}
/** The keys a list of choices has: a letter each while they last. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const choiceItems = (options) => options.map((o, i) => ({
	key: LETTERS[i] ?? "",
	text: o.label
}));
/** The column a pointer stands in, kept by every row so each step has one left edge. */
const MARGIN = CARD_INSET;
const KEYED = 1 + tokens$1.gutter;
/** The cells a row's words have: the room less the pointer's column. */
const innerOf = (room) => Math.max(8, room.width - MARGIN.length);
const set = (l, lead = span(MARGIN)) => l.spans.length ? {
	...l,
	spans: [lead, ...l.spans]
} : l;
const setAll = (lines) => lines.map((l) => set(l));
const keyRole = (isActive) => isActive ? "accent" : "dim";
const buttons = (all, room, lead = []) => setAll(buttonRow(all.filter((b) => Boolean(b)).map((b) => ({
	...b,
	hovered: b.hit !== void 0 && b.hit === room.hover
})), innerOf(room), {
	wrap: true,
	lead
}));
/** Rows a line takes: one, but for the client's text field, which may have several. */
const rowsOf = (l) => l.slot?.kind === "input" ? l.slot.rows ?? 1 : 1;
/** Lines to exactly `rows` rows: cut, or blank ones added, so the buttons under them stay put. */
function pad(lines, rows) {
	const out = [];
	let used = 0;
	for (const l of lines) {
		if (used + rowsOf(l) > rows) break;
		out.push(l);
		used += rowsOf(l);
	}
	for (; used < rows; used++) out.push(blank());
	return out;
}
const said = (text, role = "dim") => set(line([span(text, { role })]));
/** The title after its key, hanging from its first line. */
const titleLines = (f, room, max, isActive) => setAll(block(literal(f.title || "Untitled", {
	role: "text",
	bold: true
}), innerOf(room), {
	lead: [span(TITLE_KEY, room.hover === HIT.title ? {
		role: "text",
		bold: true
	} : { role: keyRole(isActive) }), span(GAP$2)],
	max,
	hit: HIT.title
}));
/** The description as it is filed, the line saying where it came from quiet under it. */
function description(f, room) {
	const text = prose$1(f.description, innerOf(room));
	const source = f.source ? block(inline(f.source.replace(/ · session \S+$/, ""), { role: "dim" }), innerOf(room), { max: 1 }) : [];
	return source.length ? [
		...text,
		blank(),
		...source
	] : text;
}
/** The row over the buttons: a duplicate found, the search for one, or that there is none. */
function noticeOf(f, room) {
	const inner = innerOf(room);
	if (f.duplicate) {
		const { issue, title } = f.duplicate;
		const words = [`${issue} may already cover this`, `${issue} may cover this`].find((w) => cellWidth$1(w) <= inner) ?? truncate$1(`${issue}?`, inner);
		const left = inner - cellWidth$1(words) - tokens$1.gutter;
		return set(line([span(words, {
			role: "warning",
			bold: room.hover === HIT.duplicate || void 0
		}), ...left > 8 ? [span(GAP$2 + truncate$1(title, left), { role: "dim" })] : []], HIT.duplicate));
	}
	return said(truncate$1(f.isCheckingDuplicates ? "Looking for an issue that already covers it…" : "No open issue seems to cover this", inner));
}
const errorLines = (f, room) => f.error ? clamp$1(f.error, innerOf(room), { max: 2 }).map((t) => said(t, "error")) : [];
const sending = () => [said("Sending to Linear…")];
/** Whether the issue is opened once it is filed: a box to tick, never a way to file. */
const opensButton = (view) => ({
	hotkey: "o",
	label: `${view.opens ? tokens$1.glyph.multi.on : tokens$1.glyph.multi.off} Then open in Linear`,
	hit: HIT.opens
});
/** The box of `opensButton` in the accent while it is ticked, as a chosen answer's mark is. */
const ticked = (lines) => lines.map((l) => ({
	...l,
	spans: l.spans.flatMap((s) => s.hit === HIT.opens && s.text.startsWith(tokens$1.glyph.multi.on) ? [{
		...s,
		text: tokens$1.glyph.multi.on,
		role: "accent",
		bold: true
	}, {
		...s,
		text: s.text.slice(tokens$1.glyph.multi.on.length)
	}] : [s])
}));
function reviewFooter(f, view, room) {
	if (f.phase === "filing") return sending();
	return [...errorLines(f, room), ...ticked(buttons([
		{
			hotkey: "enter",
			label: f.duplicate ? "Create…" : "Create",
			hit: HIT.act("create"),
			isLit: true
		},
		{
			hotkey: "x",
			label: "Edit text",
			hit: HIT.act("edit")
		},
		{
			hotkey: "d",
			label: "Discard",
			hit: HIT.act("discard")
		},
		opensButton(view)
	], room))];
}
const LAYOUTS = [
	{
		isInline: false,
		hasGap: true,
		bodyMin: 5
	},
	{
		isInline: true,
		hasGap: true,
		bodyMin: 3
	},
	{
		isInline: true,
		hasGap: false,
		bodyMin: 2
	},
	{
		isInline: true,
		hasGap: false,
		bodyMin: 0,
		isTight: true
	}
];
/** Rows a layout keeps over the description, and under it: a blank one, and the notice's. */
const over = (l) => l.isTight ? 0 : 1;
const under = (l, hasNotice) => (l.isTight ? 0 : 1) + (hasNotice ? 1 : 0);
/**
* Whether the draft's notice has its row: always, so the search ending moves nothing, but in
* the tightest room, where only a duplicate or the search for one is worth a row.
*/
const noticed = (f, l) => !l.isTight || Boolean(f.duplicate) || f.isCheckingDuplicates;
/**
* The fields side by side: all of them on one row, else without those that hold nothing. The
* tightest room never gives a row to a field that holds nothing.
*/
function inlineFields(f, room, isActive, isTight = false) {
	const all = fieldRows(f, room.hover).map((row) => row.hit === fieldHit("team") ? {
		...row,
		value: f.team
	} : row);
	const whole = fields$1(all, innerOf(room), {
		active: isActive,
		inline: true
	});
	if (whole.length <= 1 && !isTight) return whole;
	const held = fields$1(all.filter((row) => !row.empty), innerOf(room), {
		active: isActive,
		inline: true
	});
	return isTight || held.length < whole.length ? held : whole;
}
/** The rows over the description in a layout: the title and the fields. */
function headOf(f, room, l, reserved, open) {
	const isActive = room.isActive && !open;
	const rows = open ? fields$1(fieldRows(f, room.hover).filter((row) => !l.isInline || row.hit === fieldHit(open)), innerOf(room), { active: isActive }) : l.isInline ? inlineFields(f, room, isActive, l.isTight) : fields$1(fieldRows(f, room.hover), innerOf(room), { active: isActive });
	const cue = l.isTight && !open && f.description.trim() ? 1 : 0;
	const max = Math.max(1, room.rows - rows.length - (l.hasGap ? 1 : 0) - reserved - cue);
	return [
		...open && l.isTight ? [] : titleLines(f, room, max, isActive),
		...l.hasGap ? [blank()] : [],
		...setAll(rows)
	];
}
/** The rows the draft takes in this room, which its own steps keep so nothing jumps. */
function heightOf(f, view, room) {
	const footer = reviewFooter({
		...f,
		phase: "ready",
		error: null
	}, {
		...view,
		isConfirming: false
	}, room);
	const text = description(f, room);
	let height = room.rows;
	for (const l of LAYOUTS) {
		const reserved = under(l, noticed(f, l)) + footer.length;
		const fixed = headOf(f, room, l, reserved).length + over(l) + reserved;
		height = fixed + Math.min(text.length, Math.max(0, room.rows - fixed));
		if (room.rows - fixed >= Math.min(l.bodyMin, text.length)) break;
	}
	return Math.max(1, Math.min(room.rows, height));
}
/** The window of `lines` that keeps `at` in sight. */
function following(lines, rows, at) {
	if (rows <= 2) return scrolled(lines, {
		rows,
		top: at
	});
	let top = Math.max(0, at - Math.floor(rows / 2));
	for (let tries = 0; tries < 4; tries++) {
		const w = scrolled(lines, {
			rows,
			top
		});
		const from = w.top > 0 ? w.top + 1 : 0;
		const to = from + w.rows.length - (w.top > 0 ? 1 : 0) - (w.top < w.max ? 1 : 0);
		if (at < from) top = Math.max(0, w.top - 1);
		else if (at >= to) top = w.top + 1;
		else return w;
	}
	return scrolled(lines, {
		rows,
		top
	});
}
/** A field's choices, set in under its row, a row each so their window counts answers. */
function choicesOf(f, id, view, room) {
	const options = optionsOf(f, id);
	const chosen = chosenOf(f, id);
	const width = innerOf(room) - KEYED;
	return choiceList({
		items: choiceItems(options).map((item) => ({
			...item,
			text: truncate$1(item.text, Math.max(1, width - 8))
		})),
		chosen: options.flatMap((o, i) => chosen.includes(o.value) ? [i] : []),
		focus: view.focus,
		hover: choiceOf(room.hover) >= 0 ? choiceOf(room.hover) : void 0,
		multiple: isMultiple(id),
		active: room.isActive
	}, width);
}
const pickFooter = (id, room) => isMultiple(id) ? buttons([{
	hotkey: "enter",
	label: "Done",
	hit: HIT.done,
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "space" : TICK_KEY,
	label: "Tick",
	hit: HIT.act("choose")
}], room) : buttons([{
	hotkey: "enter",
	label: "Choose",
	hit: HIT.act("choose"),
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
	label: "Back",
	hit: HIT.act("back")
}], room);
function review(f, view, room) {
	const isTyping = view.step === "title";
	const open = typeof view.step === "object" ? view.step.pick : void 0;
	const footer = isTyping ? buttons([{
		hotkey: "enter",
		label: "Save",
		hit: HIT.act("save"),
		isLit: true
	}, {
		hotkey: room.hasAllKeys ? "esc" : "",
		label: "Cancel",
		hit: HIT.act("back")
	}], room) : open ? pickFooter(open, room) : reviewFooter(f, view, room);
	const isOwn = !isTyping && !open;
	let hasNotice = isOwn;
	const height = heightOf(f, view, room);
	const text = description(f, room);
	const choices = open ? choicesOf(f, open, view, room) : [];
	let head = [];
	let rest = 0;
	let budget = 1;
	let layout = LAYOUTS[0];
	for (const l of LAYOUTS) {
		layout = l;
		hasNotice = isOwn && noticed(f, l);
		head = headOf(f, room, l, under(l, hasNotice) + footer.length, open);
		const wanted = head.length + choices.length + under(l, hasNotice) + footer.length;
		budget = Math.max(1, Math.min(room.rows, Math.max(height, wanted)) - under(l, hasNotice) - footer.length);
		rest = budget - head.length - over(l);
		if (rest >= (open ? Math.min(3, choices.length) : Math.min(l.bodyMin, text.length))) break;
	}
	const titled = head.filter((l) => l.hit === HIT.title).length;
	if (isTyping) rest -= (room.fieldRows ?? 1) + 1 - titled;
	rest = Math.max(0, rest);
	const textRows = Math.max(0, rest - choices.length);
	const nested = span(MARGIN + " ".repeat(KEYED));
	const list = open ? following(choices, textRows ? choices.length : rest + over(layout), view.focus).rows.map((l) => set(l, nested)) : [];
	const window = scrolled(text, {
		rows: textRows,
		top: view.top,
		hits: {
			up: HIT.up,
			down: HIT.down
		},
		hovered: room.hover === HIT.up ? "up" : room.hover === HIT.down ? "down" : void 0
	});
	if (isTyping) {
		const lead = [
			span(MARGIN),
			span(TITLE_KEY, { role: keyRole(room.isActive) }),
			span(GAP$2)
		];
		const width = Math.max(1, room.width - spansWidth(lead));
		head = [
			slotLine({
				kind: "input",
				lead,
				width,
				rows: room.fieldRows ?? 1
			}),
			line([span(" ".repeat(spansWidth(lead))), span(tokens$1.glyph.rule.repeat(width), { role: "border" })]),
			...head.slice(titled)
		];
	}
	const at = open ? head.map((l) => l.hit).lastIndexOf(fieldHit(open)) + 1 : head.length;
	return {
		body: [...pad([
			...head.slice(0, at),
			...list,
			...head.slice(at),
			...textRows ? [...layout.isTight ? [] : [blank()], ...setAll(window.rows)] : []
		], budget), ...layout.isTight ? [] : [blank()]],
		notice: hasNotice ? noticeOf(f, room) : void 0,
		footer,
		window: {
			top: window.top,
			max: window.max,
			page: Math.max(1, textRows - 2)
		}
	};
}
/**
* The description being typed, as the Markdown it is filed as: the client's own field of
* several rows, under the title alone so it has every row the fields and the notice gave up.
* The client draws the field's rules with it, since each field has its own.
*/
function writing(f, view, room) {
	const footer = buttons([
		{
			hotkey: "enter",
			label: "Save",
			hit: HIT.act("save"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : "",
			label: "Cancel",
			hit: HIT.act("back")
		},
		...room.newline ? [{
			hotkey: room.newline,
			label: "new line"
		}] : []
	], room);
	const gap = room.rows - footer.length >= 7 ? 1 : 0;
	const title = (max) => titleLines(f, room, max, false);
	const wanted = title(2).length + gap + FIELD_ROWS + gap + footer.length;
	const height = Math.min(room.rows, Math.max(heightOf(f, view, room), wanted));
	const budget = Math.max(1, height - gap - footer.length);
	const head = budget >= 6 ? [...title(budget >= 9 ? 2 : 1), ...gap ? [blank()] : []] : [];
	const lead = room.isFieldFlush ? [] : [span(MARGIN)];
	return {
		body: [
			...head,
			slotLine({
				kind: "input",
				lead,
				width: Math.max(1, room.width - spansWidth(lead)),
				rows: Math.max(1, budget - head.length)
			}),
			...gap ? [blank()] : []
		],
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** How far along an issue is, from Linear's kind of status. */
const STATUS = {
	triage: "In triage",
	backlog: "Backlog",
	unstarted: "Not started",
	started: "In progress"
};
/** The answers to a duplicate: a comment on the issue there is, or the new one anyway. */
const ANSWERS = 2;
/**
* The page a duplicate is decided on. What Enter sends is always in sight: both answers and the
* comment come first, and what the issue says of itself gives way to them row by row.
*/
function duplicate(f, view, room) {
	const d = f.duplicate;
	if (!d) return review(f, {
		...view,
		step: "review"
	}, room);
	const footer = f.phase === "filing" ? sending() : [...errorLines(f, room), ...ticked(buttons([
		{
			hotkey: "enter",
			label: view.focus === 0 ? "Send comment" : "Create issue",
			hit: HIT.act("send"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
			label: "Back",
			hit: HIT.act("back")
		},
		opensButton(view)
	], room))];
	const inner = innerOf(room);
	const gap = room.rows - footer.length >= 7 ? 1 : 0;
	const budget = Math.max(1, room.rows - gap - footer.length);
	const answer = (index, text, detail) => choice$1({
		key: LETTERS[index] ?? "",
		text,
		detail,
		detailLines: 1,
		chosen: view.focus === index,
		focused: view.focus === index,
		active: room.isActive,
		hovered: room.hover === choiceHit(index),
		hit: choiceHit(index)
	}, room.width);
	const under = [span(" ".repeat(6)), span(`${tokens$1.glyph.rail} `, { role: "dim" })];
	const posted = block(inline(d.comment, { role: "text" }), room.width, {
		lead: under,
		hang: under,
		hit: choiceHit(0)
	});
	const comment = (max) => posted.length <= max ? posted : [...posted.slice(0, Math.max(0, max - 1)), line([...under, span(`${posted.length - Math.max(0, max - 1)} more rows`, { role: "dim" })], choiceHit(0))];
	const answers = (max = 1e400, hasDetail = true) => [
		...answer(0, `Comment on ${d.issue} instead`),
		...comment(max),
		...answer(1, "Create the new issue anyway", hasDetail ? f.title : void 0)
	];
	const warning = `${d.issue} may already cover this`;
	const meta = [d.team, STATUS[d.status ?? ""]].filter(Boolean).join(" · ");
	const title = (max) => setAll(block(literal(d.title, {
		role: "text",
		bold: true
	}), inner, { max }));
	const heads = [
		[
			said(truncate$1(warning, inner), "warning"),
			...title(2),
			...meta ? [said(meta)] : [],
			...d.about ? setAll(block(literal(d.about, { role: "dim" }), inner, { max: 3 })) : [],
			blank()
		],
		[
			said(truncate$1(warning, inner), "warning"),
			...title(2),
			...meta ? [said(meta)] : [],
			blank()
		],
		[said(truncate$1(warning, inner), "warning"), ...title(1)],
		[set(line([span(d.issue, { role: "warning" }), span(GAP$2 + truncate$1(d.title, Math.max(1, inner - cellWidth$1(d.issue) - GAP$2.length)), { role: "dim" })]))]
	];
	const cut = Array.from({ length: Math.max(1, budget) }, (_, i) => Math.max(1, budget - i));
	return {
		body: [...[
			...heads.map((head) => [...head, ...answers()]),
			answers(),
			answers(1e400, false),
			...cut.map((max) => answers(max, false))
		].find((l, i, all) => l.length <= budget || i === all.length - 1) ?? [], ...gap ? [blank()] : []],
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** What is being filed from, quiet, so the wait shows it was heard. */
const seedLines = (f, room, max) => {
	const text = f.seed.text.trim();
	if (!text) return [said("From the recent conversation")];
	return [said(f.seed.kind === "note" ? "From your note" : "From what was flagged"), ...clamp$1(text, innerOf(room), { max }).map((t) => said(t))];
};
/**
* A page that waits or failed: what it says, then the note it has, then a blank row over the
* buttons. A room too short for the note's words leaves its heading out too.
*/
function withSeed(lines, f, room, footerRows) {
	const rows = Math.max(1, room.rows - footerRows);
	const said_ = lines.slice(0, rows);
	const left = rows - said_.length - 2;
	const seed = left >= 2 ? seedLines(f, room, left - 1) : [];
	return [
		...said_,
		...seed.length ? [blank(), ...seed] : [],
		...rows > said_.length ? [blank()] : []
	];
}
function drafting(f, view, room) {
	const step = (label, state) => set(line([state === "done" ? span(`${tokens$1.glyph.done} `, { role: "success" }) : span(state === "now" ? `${tokens$1.glyph.bullet} ` : "  ", {
		role: "text",
		bold: true
	}), span(truncate$1(label, innerOf(room) - 2), state === "now" ? {
		role: "text",
		bold: true
	} : { role: "dim" })]));
	const isWriting = f.stage === "writing";
	const footer = buttons([{
		hotkey: "d",
		label: "Discard",
		hit: HIT.act("discard")
	}], room);
	return {
		body: withSeed([step("Reading your teams and labels", isWriting ? "done" : "now"), step("Writing the issue", isWriting ? "now" : "next")], f, room, footer.length),
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
function failed(f, view, room) {
	const footer = buttons([{
		hotkey: "enter",
		label: "Try again",
		hit: HIT.act("retry"),
		isLit: true
	}, {
		hotkey: "d",
		label: "Discard",
		hit: HIT.act("discard")
	}], room);
	return {
		body: withSeed([set(line([span("The draft was not written", {
			role: "error",
			bold: true
		})])), ...clamp$1(f.error ?? "Something went wrong", innerOf(room), { max: 4 }).map((t) => said(t, "text"))], f, room, footer.length),
		footer,
		window: {
			top: 0,
			max: 0,
			page: 1
		}
	};
}
/** The screen for `form` in `room`. */
function draw(form, view, room) {
	const quiet = view.isConfirming ? {
		...room,
		isActive: false,
		hover: void 0
	} : room;
	const calm = {
		...view,
		isConfirming: false
	};
	const drawn = (() => {
		if (!form) return {
			body: [said("No Linear draft open.")],
			footer: [],
			window: {
				top: 0,
				max: 0,
				page: 1
			}
		};
		if (form.phase === "drafting") return drafting(form, calm, quiet);
		if (form.phase === "failed") return failed(form, calm, quiet);
		if (view.step === "duplicate") return duplicate(form, calm, quiet);
		if (view.step === "body") return writing(form, calm, quiet);
		return review(form, calm, quiet);
	})();
	return {
		...drawn,
		footer: view.isConfirming ? stilled(drawn.footer) : drawn.footer,
		close: {
			confirming: view.isConfirming,
			question: DISCARD_PROMPT,
			keep: room.hasAllKeys ? "esc" : KEEP_KEY
		}
	};
}
/** Rows that stand quiet while a question elsewhere waits for its answer: dim, and no controls. */
const stilled = (lines) => lines.map((l) => line(l.spans.map(({ text }) => span(text, { role: "dim" }))));
/** The letters and digits the screen takes now, lowercase: what a client has to bind. */
function keysOf(form, view) {
	if (!form || form.phase === "filing") return [];
	if (view.isConfirming) return [KEEP_KEY];
	if (form.phase === "drafting" || form.phase === "failed") return ["d"];
	if (view.step === "title" || view.step === "body") return [];
	if (view.step === "duplicate") return [
		"a",
		"b",
		"o",
		BACK_KEY
	];
	if (typeof view.step === "object") return [
		...choiceItems(optionsOf(form, view.step.pick)).flatMap((item) => item.key ? [item.key.toLowerCase()] : []),
		BACK_KEY,
		...isMultiple(view.step.pick) ? [TICK_KEY] : []
	];
	return [
		TITLE_KEY.toLowerCase(),
		...FIELDS.map((id) => FIELD_KEY[id].toLowerCase()),
		"x",
		"o",
		"d"
	];
}
/** What choosing `option` of a field does to the draft. */
function chooseEffect(f, id, option) {
	switch (id) {
		case "team": return {
			do: "team",
			team: option.value
		};
		case "status": return {
			do: "set",
			patch: { state: option.value }
		};
		case "priority": return {
			do: "set",
			patch: { priority: Number(option.value) }
		};
		case "project": return {
			do: "set",
			patch: { project: option.value }
		};
		case "labels": return {
			do: "set",
			patch: { labelIds: f.labelIds.includes(option.value) ? f.labelIds.filter((l) => l !== option.value) : [...f.labelIds, option.value] }
		};
	}
}
/**
* What `intent` does on the screen as it was `drawn`: the view after it, and what the client
* has to do.
* @param now The time, where the client has one: an Enter that would write to Linear is
* ignored for a moment after what it does changed, as one typed for what stood there before.
*/
function act(form, view, intent, drawn, now) {
	const none = {
		view,
		effects: []
	};
	const to = (step, more = {}) => ({
		view: {
			...view,
			...more,
			step,
			since: now ?? 0
		},
		effects: []
	});
	const isEarly = (...since) => now !== void 0 && since.some((at) => now - at < GRACE_MS && now >= at);
	const hide = {
		view: {
			...view,
			isConfirming: false
		},
		effects: [{ do: "hide" }]
	};
	if (!form) return "escape" in intent ? hide : none;
	const hit = "hit" in intent ? intent.hit : void 0;
	const key = "key" in intent ? intent.key : void 0;
	const close = closeOf(hit);
	if (close === "close") return hide;
	if (view.isConfirming) {
		if (("enter" in intent || close === "discard") && !isEarly(view.since)) return {
			view: startView(view.opens),
			effects: [{ do: "discard" }]
		};
		if ("enter" in intent || close === "discard" || "move" in intent || "scroll" in intent) return none;
		return {
			view: {
				...view,
				isConfirming: false
			},
			effects: []
		};
	}
	if (form.phase === "filing") return "escape" in intent ? hide : none;
	const isTyping = view.step === "title" || view.step === "body";
	if (key === "d" && view.step !== "duplicate" && typeof view.step !== "object") {
		if (!isTyping) return {
			view: {
				...view,
				isConfirming: true,
				since: now ?? 0
			},
			effects: []
		};
	}
	if (hit === HIT.act("discard")) return {
		view: {
			...view,
			isConfirming: true,
			since: now ?? 0
		},
		effects: []
	};
	if (form.phase === "drafting" || form.phase === "failed") {
		if ("escape" in intent) return hide;
		if (form.phase === "failed" && ("enter" in intent || hit === HIT.act("retry"))) return {
			view: startView(view.opens),
			effects: [{ do: "retry" }]
		};
		return none;
	}
	if (key === "o" && (view.step === "review" || view.step === "duplicate")) return {
		view: {
			...view,
			opens: !view.opens
		},
		effects: []
	};
	if (hit === HIT.opens) return {
		view: {
			...view,
			opens: !view.opens
		},
		effects: []
	};
	if (typeof view.step === "object") {
		const id = view.step.pick;
		const options = optionsOf(form, id);
		const multiple = isMultiple(id);
		const back = to("review", { focus: 0 });
		const choose = (index) => {
			const option = options[index];
			if (!option) return none;
			const effect = chooseEffect(form, id, option);
			return multiple ? {
				view: {
					...view,
					focus: index
				},
				effects: [effect]
			} : {
				...back,
				effects: chosenOf(form, id).includes(option.value) ? [] : [effect]
			};
		};
		const count = Math.max(1, options.length);
		if ("move" in intent) return {
			view: {
				...view,
				focus: ((view.focus + intent.move) % count + count) % count
			},
			effects: []
		};
		if ("scroll" in intent) return act(form, view, { move: Math.sign(intent.scroll) }, drawn, now);
		if ("escape" in intent || hit === HIT.done || hit === HIT.act("back")) return back;
		if (key === BACK_KEY) return back;
		if ("enter" in intent) return multiple ? back : choose(view.focus);
		if ("space" in intent || hit === HIT.act("choose")) return choose(view.focus);
		if (key === TICK_KEY && multiple) return choose(view.focus);
		if (key !== void 0) {
			const at = choiceItems(options).findIndex((item) => item.key.toLowerCase() === key);
			return at < 0 ? none : choose(at);
		}
		const at = choiceOf(hit);
		if (at >= 0) return choose(at);
		const other = fieldOf(hit);
		if (other === id) return back;
		if (other && FIELDS.includes(other)) return openPick(form, to("review").view, other);
		if (hit === HIT.title) return to("title");
		return none;
	}
	if (isTyping) {
		if ("text" in intent) return {
			...to("review", view.step === "body" ? { top: 0 } : {}),
			effects: [{
				do: "set",
				patch: {
					...view.step === "body" ? { description: intent.text.replace(/\r\n?/g, "\n").trim() } : { title: intent.text.replace(/\s*\n\s*/g, " ").trim() || form.title },
					fieldRevision: form.fieldRevision + 1
				}
			}]
		};
		if ("escape" in intent || "enter" in intent || hit === HIT.act("back")) return {
			...to("review"),
			effects: [{
				do: "set",
				patch: { fieldRevision: form.fieldRevision + 1 }
			}]
		};
		return none;
	}
	if (view.step === "duplicate" && form.duplicate) {
		if ("escape" in intent || hit === HIT.act("back") || key === BACK_KEY) return to("review");
		if ("move" in intent) return {
			view: {
				...view,
				focus: (view.focus + 1) % ANSWERS
			},
			effects: []
		};
		if (key === "a" || key === "b") return {
			view: {
				...view,
				focus: key === "a" ? 0 : 1
			},
			effects: []
		};
		const at = choiceOf(hit);
		if (at >= 0 && at < ANSWERS) return {
			view: {
				...view,
				focus: at
			},
			effects: []
		};
		if ("enter" in intent || hit === HIT.act("send")) return isEarly(view.since) ? none : {
			view,
			effects: [{
				do: view.focus === 0 ? "comment" : "create",
				open: view.opens
			}]
		};
		return none;
	}
	const window = drawn?.window ?? {
		top: view.top,
		max: 1e400,
		page: 3
	};
	const step = (by) => ({
		view: {
			...view,
			top: scrollBy(window, by)
		},
		effects: []
	});
	if ("escape" in intent) return hide;
	if ("enter" in intent || hit === HIT.act("create")) {
		if (isEarly(form.settledAt, view.since)) return none;
		if (form.duplicate) return to("duplicate", { focus: 0 });
		return {
			view,
			effects: [{
				do: "create",
				open: view.opens
			}]
		};
	}
	if (hit === HIT.duplicate && form.duplicate) return to("duplicate", { focus: 0 });
	if ("move" in intent) return step(intent.move * 3);
	if ("scroll" in intent) return step(intent.scroll);
	if (hit === HIT.up) return step(-window.page);
	if (hit === HIT.down) return step(window.page);
	if (key === TITLE_KEY.toLowerCase() || hit === HIT.title) return to("title");
	if (key === "x" || hit === HIT.act("edit")) return to("body");
	const field = FIELDS.find((id) => FIELD_KEY[id].toLowerCase() === key) ?? fieldOf(hit);
	if (field && FIELDS.includes(field)) return openPick(form, to("review").view, field);
	return none;
}
function openPick(f, view, id) {
	const at = optionsOf(f, id).findIndex((o) => chosenOf(f, id).includes(o.value));
	return {
		view: {
			...view,
			step: { pick: id },
			focus: Math.max(0, at)
		},
		effects: []
	};
}
/** Whether `hit` is one of the screen's own controls: what a client's focus hook asks. */
const isControl = (hit) => hit === HIT.title || hit === HIT.duplicate || hit.startsWith("scroll:") || hit.startsWith("act:") || hit.startsWith("field:") || hit.startsWith("frame:") || choiceOf(hit) >= 0;

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
/** Cells a set-in block is set in from its heading on the terminal. */
const INDENT = 2;
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
function stack$1(k, children, options = {}) {
	const { Box } = k;
	const gap = options.gui?.gap ?? "md";
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: k.isNative ? gap === "none" ? 0 : tokens.gui.space[gap] : options.isTight && k.isTight ? 0 : options.tui?.gap ?? 1
	}, children);
}
/**
* A row that opens in place, for what is not a reviewed suggestion (`card`'s kinds): a graphical
* surface draws the folded row, one line with a quiet `Open`, and the opened row in its well with
* the body set in under the text; the terminal a plain button and the body under it.
*/
function foldedRow(k, o) {
	const { Box, Button, Text } = k;
	if (!k.isNative) return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column"
	}, /* @__PURE__ */ h(Button, {
		key: o.toggleKey,
		plain: true,
		onPress: () => o.onToggle()
	}, /* @__PURE__ */ h(Text, { weight: "semibold" }, o.text)), o.isOpen ? /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingLeft: INDENT
	}, o.body?.(withColumns(k, Math.max(1, k.columns - INDENT))), o.actions ? choice(k, o.actions) : null) : null);
	return guiRow(k, {
		key: o.key,
		mark: icon(k, o.icon.name, {
			tone: o.icon.tone,
			alt: o.icon.alt
		}),
		text: o.text,
		meta: o.meta,
		tone: o.tone,
		isOpen: o.isOpen,
		button: {
			key: o.toggleKey,
			label: o.isOpen ? "Close" : "Open",
			onPress: o.onToggle
		},
		body: [o.body?.(k) ?? null, o.actions ? choice(k, o.actions, {
			key: `${o.key}:actions`,
			gui: { layout: "row" }
		}) : null]
	});
}
/**
* A form: each field's name and its control. A graphical surface sets the names in a dim column
* whose controls start at one edge, and an `isWide` field's name over a control the form's whole
* width; the terminal a dim line over each control.
*/
function fields(k, items) {
	const { Box, Text } = k;
	if (!k.isNative) return /* @__PURE__ */ h(Box, { flexDirection: "column" }, items.map((f) => /* @__PURE__ */ h(Box, {
		key: `field:${f.key}`,
		flexDirection: "column"
	}, /* @__PURE__ */ h(Text, { dimColor: true }, f.label), f.control)));
	const { space, across } = tokens.gui;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space.sm
	}, items.map((f) => f.isWide ? /* @__PURE__ */ h(Box, {
		key: `field:${f.key}`,
		flexDirection: "column",
		rowGap: space.xs,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Text, { dimColor: true }, f.label), f.control) : /* @__PURE__ */ h(Box, {
		key: `field:${f.key}`,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "flex-start",
		columnGap: across.md,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Box, {
		flexShrink: 0,
		minWidth: tokens.gui.labelColumn,
		paddingTop: .1
	}, /* @__PURE__ */ h(Text, { dimColor: true }, f.label)), /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		flexGrow: 1,
		flexShrink: 1
	}, f.control))));
}
/**
* A record's properties on one line, as a tracker shows an issue's status, priority and labels: a
* graphical surface sets each value after its icon, wrapping; the terminal the values dim, two
* cells apart.
*/
function properties(k, items) {
	const { Box, Text } = k;
	if (!k.isNative) return /* @__PURE__ */ h(Text, { dimColor: true }, clamp(items.map((p) => p.text).join(" ".repeat(tokens.gutter)), k.columns).join("\n"));
	const { space, across } = tokens.gui;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: across.md * 1.5,
		rowGap: space.xs,
		paddingX: across.inset
	}, items.map((p) => /* @__PURE__ */ h(Box, {
		key: p.key,
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		columnGap: across.sm * .6
	}, p.icon ? icon(k, p.icon, {
		alt: p.alt ?? p.key,
		size: 14
	}) : null, /* @__PURE__ */ h(Text, { dimColor: true }, p.text))));
}
/**
* A summary that opens to edit: the values as they read, with a quiet Edit at the far edge of a dim
* first line; opened, the same place says Done and the controls sit in a well, as an opened row's
* body does. For a short form whose values are mostly right: it reads as the record, not as a wall
* of controls.
*/
function editable(k, o) {
	const { Box, Button, Text } = k;
	const head = o.isOpen ? o.head.opened : o.head.folded;
	const toggle = o.isReadOnly ? null : /* @__PURE__ */ h(Button, {
		key: o.toggleKey,
		plain: k.isNative ? void 0 : true,
		dimColor: true,
		label: o.isOpen ? "Done" : "Edit",
		onPress: () => o.onToggle()
	});
	if (!k.isNative) return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column"
	}, /* @__PURE__ */ h(Box, {
		flexDirection: "row",
		columnGap: tokens.gutter
	}, /* @__PURE__ */ h(Text, { dimColor: true }, head), toggle), o.isOpen ? o.edit(k) : o.view(k));
	const { space, across } = tokens.gui;
	const line = /* @__PURE__ */ h(Box, {
		key: "head",
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "center",
		justifyContent: "space-between",
		columnGap: across.md,
		height: 1,
		paddingX: across.inset
	}, /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Text, {
		dimColor: true,
		wrap: "truncate-end"
	}, head)), toggle);
	if (!o.isOpen) return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column",
		rowGap: space.xs
	}, line, o.view(k));
	return /* @__PURE__ */ h(Box, {
		key: o.key,
		flexDirection: "column",
		rowGap: space.sm,
		paddingY: space.sm,
		backgroundColor: tokens.gui.fill,
		borderStyle: "round",
		borderColor: "#00000000"
	}, line, o.edit(k));
}

// src/claude/gui.tsx
/** Labels a search offers at most: the field is for finding one, not for browsing them all. */
const MATCHES = 6;
const PRIORITY_ICON = {
	"0": "priorityNone",
	"1": "priorityUrgent",
	"2": "priorityHigh",
	"3": "priorityMedium",
	"4": "priorityLow"
};
const oneLine = (text) => text.replace(/\s*\n\s*/g, " ");
const labelOf = (items, value) => items.find((o) => o.value === value)?.label;
/** A team's name without the key the Select shows beside it: `Platform (PLT)` reads `Platform`. */
const teamName = (f) => {
	const label = labelOf(f.teams, f.team) ?? f.team;
	return label.replace(/\s*\([^)]*\)$/, "") || label;
};
/** The open issue that may already cover the draft: first in the pane, so it is not missed. */
const duplicateRow = (k, d, p) => foldedRow(k, {
	key: "duplicate",
	text: `${d.issue} may already cover this`,
	meta: d.title,
	icon: {
		name: "warning",
		tone: "warning",
		alt: "Possible duplicate"
	},
	tone: "warning",
	isOpen: p.isDuplicateOpen,
	toggleKey: "duplicate-toggle",
	onToggle: () => p.on.toggleDuplicate(),
	body: (inner) => stack$1(inner, [prose(inner, d.title), stack$1(inner, [subhead(inner, "The comment it would add"), prose(inner, d.comment)], { gui: { gap: "xs" } })], { gui: { gap: "sm" } }),
	actions: [{
		key: "comment",
		label: "Comment instead",
		onPress: () => p.on.comment()
	}]
});
/** The draft's properties as read: status, priority, project, labels. */
function summary(f, p) {
	const priority = String(f.priority);
	const project = f.project ? labelOf(f.projects, f.project) : void 0;
	return [
		{
			key: "status",
			text: labelOf(f.statuses, f.state) ?? "No status",
			icon: "status",
			alt: "Status"
		},
		{
			key: "priority",
			text: labelOf(p.priorities, priority) ?? "No priority",
			icon: PRIORITY_ICON[priority] ?? "priorityNone",
			alt: "Priority"
		},
		...project ? [{
			key: "project",
			text: project,
			icon: "project",
			alt: "Project"
		}] : [],
		...f.labels.filter((l) => f.labelIds.includes(l.value)).map((l) => ({
			key: `label:${l.value}`,
			text: l.label,
			icon: "label",
			alt: "Label"
		}))
	];
}
/** The controls that set the draft's fields, opened in place of its summary. */
function editFields(k, f, p) {
	const { Input, Select, on, editing } = p;
	const select = (key, value, items, onSelect) => /* @__PURE__ */ h(Select, {
		key,
		value,
		options: items.slice(0, 64),
		onSelect: (v) => onSelect(v)
	});
	const query = editing.query.trim().toLowerCase();
	const shown = [.../* @__PURE__ */ new Set([...editing.shown, ...f.labelIds])].flatMap((id) => {
		const l = f.labels.find((o) => o.value === id);
		return l ? [l] : [];
	});
	const matches = query ? f.labels.filter((l) => !shown.includes(l) && l.label.toLowerCase().includes(query)).slice(0, MATCHES) : [];
	const labels = stack$1(k, [
		shown.length > 0 ? choice(k, shown.map((l) => ({
			key: `label-${l.value}`,
			label: l.label,
			isLiteral: true,
			isOn: f.labelIds.includes(l.value),
			onPress: () => on.toggleLabel(l.value)
		})), {
			key: "labels",
			isMulti: true,
			gui: { layout: "row" }
		}) : null,
		/* @__PURE__ */ h(Input, {
			key: `label-search-${editing.queryRevision}`,
			value: editing.query,
			placeholder: "Find a label to add",
			onInput: (text) => on.search(text),
			onSubmit: (text) => {
				const first = matches[0];
				return first ? on.addLabel(first.value) : on.search(text);
			}
		}),
		matches.length > 0 ? choice(k, matches.map((l) => ({
			key: `label-add-${l.value}`,
			label: l.label,
			isLiteral: true,
			onPress: () => on.addLabel(l.value)
		})), {
			key: "label-matches",
			gui: { layout: "row" }
		}) : query ? notice(k, "No label matches", "dim", { gui: { isFlush: true } }) : null
	], { gui: { gap: "xs" } });
	return [fields(k, [
		{
			key: "title",
			label: "Title",
			isWide: true,
			control: /* @__PURE__ */ h(Input, {
				key: `title-${f.fieldRevision ?? 0}`,
				value: f.title,
				placeholder: "What to do, in a line",
				onInput: (title) => on.set({ title: oneLine(title) }),
				onSubmit: (title) => on.set({
					title: oneLine(title),
					fieldRevision: (f.fieldRevision ?? 0) + 1
				})
			})
		},
		{
			key: "team",
			label: "Team",
			control: select("team", f.team, f.teams, on.switchTeam)
		},
		{
			key: "priority",
			label: "Priority",
			control: select("priority", String(f.priority), p.priorities, (v) => on.set({ priority: +v }))
		},
		{
			key: "status",
			label: "Status",
			control: select("status", f.state, f.statuses, (state) => on.set({ state }))
		},
		{
			key: "project",
			label: "Project",
			control: select("project", f.project, f.projects, (project) => on.set({ project }))
		},
		{
			key: "labels",
			label: "Labels",
			control: labels
		}
	])];
}
/** The draft pane on a graphical surface. */
function guiPane(k, p) {
	const { form: f, on } = p;
	const discard = {
		key: "discard",
		label: "Discard",
		onPress: () => on.discard()
	};
	if (!f) return pane(k, () => [emptyState(k, "No Linear draft open.")]);
	if (f.phase === "drafting") return pane(k, (inner) => [notice(inner, "Drafting the issue", "dim"), actionBar(inner, [discard])]);
	if (f.phase === "failed") return pane(k, (inner) => [notice(inner, `Linear draft failed: ${f.error}`, "error"), actionBar(inner, [discard])]);
	const isFiling = f.phase === "filing";
	const canFile = f.phase === "ready" && f.title.trim() !== "";
	const actions = [
		{
			key: "create",
			label: isFiling ? "Creating" : "Create",
			gui: { isPrimary: canFile },
			onPress: () => on.create()
		},
		{
			key: "create-open",
			label: "Create & open",
			onPress: () => on.createOpen()
		},
		discard
	];
	return pane(k, (inner) => [
		f.duplicate ? duplicateRow(inner, f.duplicate, p) : null,
		editable(inner, {
			key: "fields",
			toggleKey: "edit",
			isOpen: p.editing.isOpen && !p.isReadOnly,
			isReadOnly: p.isReadOnly,
			onToggle: () => on.toggleEditing(),
			head: {
				folded: `New issue in ${teamName(f)}`,
				opened: "Edit the issue"
			},
			view: (k) => [f.title.trim() ? section(k, f.title, { isWrapped: true }) : notice(k, "No title yet", "dim"), properties(k, summary(f, p))],
			edit: (k) => editFields(k, f, p)
		}),
		stack$1(inner, [prose(inner, f.description, { gui: { isInset: true } }), f.source ? notice(inner, f.source.replace(/`/g, ""), "dim", { gui: { isCut: true } }) : null], { gui: { gap: "sm" } }),
		stack$1(inner, [
			f.isCheckingDuplicates ? notice(inner, "Checking for an open issue that covers this", "dim") : null,
			f.error ? notice(inner, f.error, "error") : null,
			actionBar(inner, actions)
		], { gui: { gap: "sm" } })
	]);
}
/** What the band above the prompt shows on a graphical surface: the draft chip, the filed issues. */
function guiBand(k, p) {
	const { draft } = p;
	const filedText = (i) => i.title.startsWith("commented: ") ? `Commented on ${i.key}: ${i.title.slice(11)}` : `Filed ${i.key}: ${i.title}`;
	return stack$1(k, [draft ? statusBand(k, {
		key: "draft-open",
		text: "Linear draft",
		hint: "Open",
		gui: {
			text: draft.phase === "drafting" ? "Drafting a Linear issue" : draft.phase === "failed" ? "The Linear draft failed" : draft.title || "Untitled Linear draft",
			icon: "draft",
			tone: "neutral",
			isOneLine: true,
			actions: [{
				key: "draft-discard",
				label: "Discard",
				onPress: () => p.onDiscard()
			}]
		},
		onPress: () => p.onOpen()
	}) : null, ...p.issues.map((i) => i.url !== "" ? statusBand(k, {
		key: `open-${i.key}`,
		text: `${i.key} ${i.title}`,
		hint: "Open",
		status: "success",
		onPress: () => p.onOpenUrl(i.url),
		gui: {
			text: filedText(i),
			actions: [{
				key: `copy-${i.key}`,
				label: "Copy link",
				onPress: () => p.onCopy(i.url)
			}, {
				key: `dismiss-${i.key}`,
				label: "Dismiss",
				onPress: () => p.onDismiss(i.key)
			}]
		}
	}) : statusBand(k, {
		key: `dismiss-${i.key}`,
		text: `${i.key} ${i.title}`,
		hint: "Dismiss",
		status: "success",
		gui: { text: filedText(i) },
		onPress: () => p.onDismiss(i.key)
	}))], { gui: { gap: "sm" } });
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

// src/claude/linear.ts
const LINEAR_TOOL = /^mcp__(.*linear.*)__([^_].*)$/i;
const SERVER_WAIT_S = 10;
const LINEAR_SEEN_MS = 6e4;
const LINEAR_MISSING_MS = 5e3;
let linearSeen;
/** True when an MCP server named like Linear has a tool here, its auth stub included. */
async function hasLinear($) {
	const now = await $.clock.now();
	const ttl = linearSeen?.isSeen ? LINEAR_SEEN_MS : LINEAR_MISSING_MS;
	if (linearSeen && now - linearSeen.at < ttl) return linearSeen.isSeen;
	linearSeen = {
		at: now,
		isSeen: (await $.tool.list().catch(() => [])).some((t) => /^mcp__.*linear.*__/i.test(t.name))
	};
	return linearSeen.isSeen;
}
/** The first connected Linear server that can write issues, in tool-name spelling. */
async function linearServer($) {
	for (let attempt = 0; attempt < SERVER_WAIT_S; attempt++) {
		for (const { name } of await $.tool.list()) {
			const m = LINEAR_TOOL.exec(name);
			if (m?.[2] === "save_issue") return m[1];
		}
		await $.clock.sleep(1e3);
	}
}
/** Calls a Linear tool and parses its JSON answer; throws with the server's text on an error. */
async function call($, tool, args) {
	const server = await linearServer($);
	if (!server) throw new Error(NO_LINEAR);
	const result = await $.mcp.call(server, tool, args);
	const text = result.content.map((c) => "text" in c ? c.text : "").join("\n");
	if (result.isError) throw new Error(text.slice(0, 200) || `${tool} failed`);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
async function gitBranch($, cwd) {
	try {
		const r = await $.process.run([
			"git",
			"-C",
			cwd,
			"branch",
			"--show-current"
		], { timeoutMs: 2e3 });
		return r.exitCode === 0 ? r.stdout.trim() || "(detached)" : "(none)";
	} catch {
		return "(none)";
	}
}
function hostFor($, draft) {
	return {
		now: () => $.clock.now(),
		linear: (tool, args) => call($, tool, args),
		async complete({ system, prompt, maxTokens }) {
			const reply = await $.model.complete({
				model: "sonnet",
				system,
				maxTokens,
				prompt
			});
			return reply.isAnswered ? { text: reply.text } : { error: reply.reason };
		},
		async origin() {
			const cwd = await $.session.cwd();
			const [repo, branch, sessionId, messages] = await Promise.all([
				$.session.repo().catch(() => null),
				gitBranch($, cwd),
				$.session.id(),
				$.session.messages().catch(() => [])
			]);
			return {
				cwd,
				repo: (repo?.remote && repoName(repo.remote)) ?? repo?.root?.split("/").pop(),
				branch,
				sessionId,
				messages: messages.map((m) => ({
					role: m.role,
					text: m.text
				}))
			};
		},
		last: async () => await $.store.get("last").catch(() => void 0),
		remember: (last) => $.store.set("last", last),
		...draft,
		log: (message) => $.ui.log(message, { to: "debug" })
	};
}
async function openUrl($, url) {
	for (const opener of ["xdg-open", "open"]) try {
		if ((await $.process.run([opener, url], { timeoutMs: 5e3 })).exitCode === 0) return;
	} catch {}
	$.ui.toast(`Couldn't open ${url}`);
}

// src/lib/chip.ts
const GAP$1 = " ".repeat(tokens$1.gutter);
/** The glyph a draft put aside is marked with. */
const DRAFT_MARK = "✎";
/** Below this many columns the line drops its name for the draft's title. */
const NARROW = 80;
/** The line's controls. */
const CHIP = {
	open: "chip:open",
	discard: "chip:discard"
};
/** A mark, what it is about cut to the room the buttons leave, and the buttons. */
function chip(mark, words, buttons, width) {
	const actions = buttonRow(buttons, width)[0]?.spans ?? [];
	const room = width - spansWidth(mark) - spansWidth(actions) - tokens$1.gutter;
	return line([
		...mark,
		span(truncate$1(words, Math.max(4, room)), { role: "text" }),
		span(GAP$1),
		...actions
	]);
}
/** A draft put aside: its title, Open and Discard. */
function draftChip(form, width, o) {
	const what = form.phase === "drafting" ? "being written…" : form.phase === "failed" ? "was not written" : form.title || "Untitled";
	return chip([span(`${"✎"} `, { role: "dim" }), ...width < NARROW ? [] : [span(`Linear draft${GAP$1}`, { bold: true })]], what, [{
		hotkey: o.openKey,
		label: "Open",
		hit: CHIP.open,
		essential: true,
		hovered: o.hover === CHIP.open
	}, {
		hotkey: o.discardKey,
		label: o.isArmed ? "Sure? Discard" : "Discard",
		hit: CHIP.discard,
		essential: true,
		hovered: o.hover === CHIP.discard
	}], width);
}

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

// ../../lib/kits/sheet/src/terminal.ts
/** The sheet as styled lines: the one drawing both terminals paint. */
/**
* The sheet's top edge without the edge: its title at the left, and at the right the question
* Close asks. For a host that frames the panel itself, as Claude Code does a pane, and draws
* its own Close there.
*/
function sheetHead(s) {
	const title = truncateSpans([span(s.title, {
		role: "accent",
		bold: true
	})], Math.max(0, s.width));
	const room = s.width - spansWidth(title) - tokens$1.gutter;
	const action = s.close?.confirming ? closeSpans(room + 7, s.close) : void 0;
	if (!action) return line(title);
	return line([
		...title,
		...padding([...title, ...action], s.width),
		...action
	]);
}

// src/claude/terminal.tsx
const GAP = " ".repeat(tokens$1.gutter);
/** The rows the pane gives to the head, and to the hint for the keyboard, not to the screen. */
const HEAD = 2;
const HINT = 2;
/** From this many rows the pane has room for the head. */
const ROOMY = 16;
/** The rows of the description's field its two rules take. */
const RULES = 2;
/** The step a text field is open in: the title's, or the description's. */
const typingOf = (view) => view.step === "title" || view.step === "body" ? view.step : void 0;
/** The key a step's field is drawn under, for the hook that moves the ring onto it. */
const fieldKey = (form, step) => `${step}-${form?.fieldRevision ?? 0}`;
/** The draft in the pane. Also gives what was drawn, for a hook that acts on it later. */
function terminalPane(k, p) {
	const hasHead = p.rows >= ROOMY || p.view.isConfirming;
	const drawn = draw(p.form, p.view, {
		width: p.width,
		rows: Math.max(4, p.rows - (hasHead ? HEAD : 0) - (p.held ? 0 : HINT)),
		isActive: p.held,
		hasAllKeys: false,
		fieldRows: 2,
		isFieldFlush: true
	});
	const head = sheetHead({
		width: p.width - CARD_INSET.length,
		title: TITLE,
		close: drawn.close
	});
	const lines = [
		...hasHead ? [{
			...head,
			spans: [span(CARD_INSET), ...head.spans]
		}, blank()] : [],
		...drawn.body,
		...drawn.notice ? [drawn.notice] : [],
		...drawn.footer,
		...p.held ? [] : [blank()]
	];
	const typing = p.form?.phase === "ready" && !p.view.isConfirming ? typingOf(p.view) : void 0;
	const field = lines.find((l) => l.slot?.kind === "input")?.slot;
	const fieldRows = field?.kind === "input" ? field.rows ?? 1 : 1;
	const fieldWidth = field?.kind === "input" ? field.width : 0;
	const { Input } = k;
	const rule = () => paintLines(k, [line([span(tokens$1.glyph.rule.repeat(fieldWidth), { role: "border" })])]);
	return {
		tree: stack(k, ring(k, () => p.send({ enter: true }, drawn), keysOf(p.form, p.view).map((key) => ({
			key,
			press: () => p.send({ key }, drawn)
		}))), paintLines(k, lines, {
			width: p.width,
			press: (hit) => p.send({ hit }, drawn),
			input: !typing ? void 0 : typing === "body" ? stack(k, rule(), /* @__PURE__ */ h(Input, {
				key: fieldKey(p.form, "body"),
				value: p.form?.description ?? "",
				label: "x".toUpperCase(),
				rows: Math.max(2, fieldRows - RULES),
				submitLabel: "",
				autoFocus: true,
				onInput: (text) => p.typed(text),
				onSubmit: (text) => p.send({ text }, drawn)
			}), rule()) : /* @__PURE__ */ h(Input, {
				key: fieldKey(p.form, "title"),
				value: p.form?.title ?? "",
				label: "E",
				rows: fieldRows,
				submitLabel: "",
				autoFocus: true,
				onSubmit: (text) => p.send({ text }, drawn)
			})
		}), keysHint(k, p.held, false, CARD_INSET.length)),
		drawn
	};
}
/** The rows above the prompt: the draft put aside, with its digits, and each issue filed. */
function terminalBand(k, p) {
	const press = {};
	const lines = [];
	if (p.draft) {
		press[CHIP.open] = p.on.open;
		press[CHIP.discard] = p.on.discard;
		lines.push(draftChip(p.draft, p.width, {
			openKey: "8",
			discardKey: "9",
			isArmed: p.isArmed
		}));
	}
	for (const issue of p.issues) {
		const id = (verb) => `filed:${verb}:${issue.key}`;
		press[id("open")] = () => p.on.openUrl(issue.url);
		press[id("copy")] = () => p.on.copy(issue.url);
		press[id("dismiss")] = () => p.on.dismiss(issue.key);
		lines.push(chip([span(`${tokens$1.glyph.done} `, { role: "success" }), span(`${issue.key}${GAP}`, { bold: true })], issue.title, [...issue.url ? [{
			hotkey: "",
			label: "Open",
			hit: id("open"),
			essential: true
		}, {
			hotkey: "",
			label: "Copy link",
			hit: id("copy")
		}] : [], {
			hotkey: "",
			label: tokens$1.glyph.times,
			hit: id("dismiss"),
			essential: true
		}], p.width));
	}
	return stack(k, paintLines(k, lines, { press: (hit) => press[hit]?.() }), p.draft ? hotkeys(k, [{
		key: "8",
		press: p.on.open
	}, {
		key: "9",
		press: p.on.discard
	}]) : null);
}

// src/claude/ysk.tsx
const ANCHOR = "Chat in main session";
const LEARN_MORE = "Learn more";
const isElement = (node) => typeof node === "object" && node !== null;
const childrenOf = (node) => "children" in node && Array.isArray(node.children) ? node.children : [];
const isButton = (node, label) => isElement(node) && node.type === "Button" && node.props.label === label;
const isDismiss = (node) => isElement(node) && node.type === "Button" && node.props.role === "dismiss";
/** The nodes from `root` down to the first node `match` accepts, both included; undefined when none does. */
function pathTo(root, match) {
	if (match(root)) return [root];
	if (!isElement(root)) return void 0;
	for (const child of childrenOf(root)) {
		const path = pathTo(child, match);
		if (path) return [root, ...path];
	}
}
/** `root` with `target` (by identity) swapped for `replacement`. */
function replace(root, target, replacement) {
	if (root === target) return replacement;
	if (!isElement(root) || childrenOf(root).length === 0) return root;
	return {
		...root,
		children: childrenOf(root).map((c) => replace(c, target, replacement))
	};
}
/**
* `tree` with `button` beside the anchor button: in a copy of the anchor's wrapper, before the
* dismiss button when one shares a row with it. Undefined when the tree holds no anchor.
*/
function insertButton(tree, button) {
	const toAnchor = pathTo(tree, (n) => isButton(n, ANCHOR));
	const anchor = toAnchor?.at(-1);
	if (!toAnchor || !anchor || toAnchor.length < 2) return void 0;
	const toDismiss = pathTo(tree, isDismiss);
	let depth = toAnchor.length - 2;
	if (toDismiss) {
		depth = 0;
		while (depth + 2 < toAnchor.length && toAnchor[depth + 1] === toDismiss[depth + 1]) depth++;
	}
	const row = toAnchor[depth];
	const wrapper = toAnchor[depth + 1];
	const kids = childrenOf(row);
	const dismissAt = toDismiss?.[depth + 1] === void 0 ? -1 : kids.indexOf(toDismiss[depth + 1]);
	const at = dismissAt >= 0 ? dismissAt : kids.indexOf(wrapper) + 1;
	const copy = replace(wrapper, anchor, button);
	return replace(tree, row, {
		...row,
		children: [
			...kids.slice(0, at),
			copy,
			...kids.slice(at)
		]
	});
}
/** The card's text, one line per Text, Markdown or Code, buttons left out. */
function cardText(node) {
	const lines = [];
	const flat = (n) => typeof n === "string" ? n : isElement(n) ? childrenOf(n).map(flat).join("") : "";
	const walk = (n) => {
		if (typeof n === "string") lines.push(n);
		else if (!isElement(n) || n.type === "Button") return;
		else if (n.type === "Text") lines.push(flat(n));
		else if (n.type === "Markdown") lines.push(n.props.text);
		else if (n.type === "Code") lines.push(n.props.source);
		else childrenOf(n).forEach(walk);
	};
	walk(node);
	return lines.map((l) => l.trim()).filter(Boolean).join("\n");
}
const hasButtons = (node) => pathTo(node, (n) => isElement(n) && n.type === "Button") !== void 0;
function hotkeysIn(node) {
	const taken = /* @__PURE__ */ new Set();
	const walk = (n) => {
		if (!isElement(n)) return;
		if (n.type === "Button" && typeof n.props.hotkey === "string") taken.add(n.props.hotkey);
		childrenOf(n).forEach(walk);
	};
	walk(node);
	return taken;
}

// src/claude.tsx
const YSK = "cc-plugin-you-should-know";
const PANE = "linear-draft";
const HOTKEYS = [
	"3",
	"4",
	"5",
	"6",
	"7"
];
const DISCARD_ARM_MS = 5e3;
const hidden = atom({
	plugin: "linear-issue",
	key: "hidden"
}, null);
const form = atom({
	plugin: "linear-issue",
	key: "form"
}, null);
const view = atom({
	plugin: "linear-issue",
	key: "view"
}, startView());
const keys = atom({
	plugin: "linear-issue",
	key: "keys"
}, false);
const filed = atom({
	plugin: "linear-issue",
	key: "filed"
}, []);
const isPaneOpen = atom({
	plugin: "linear-issue",
	key: "isPaneOpen"
}, false);
const isDiscardArmed = atom({
	plugin: "linear-issue",
	key: "isDiscardArmed"
}, false);
const isDuplicateOpen = atom({
	plugin: "linear-issue",
	key: "isDuplicateOpen"
}, false);
const CLOSED_EDITING = {
	isOpen: false,
	query: "",
	queryRevision: 0,
	shown: []
};
const editing = atom({
	plugin: "linear-issue",
	key: "editing"
}, CLOSED_EDITING);
let isExpanding = false;
const teams = /* @__PURE__ */ new Map();
let isSending = false;
let lastDrawn;
let typedBody;
let isRingInBody = false;
/** One toast per Claude Code version, when the expanded card no longer has the anchor. */
async function warnDrift($) {
	const { version } = await $.session.version();
	if (await $.store.get("warnedVersion").catch(() => void 0) === version) return;
	await $.store.set("warnedVersion", version);
	$.ui.toast(`linear-issue: the You should know card no longer has "${ANCHOR}", so its Linear button is hidden; update apps/linear-issue`);
}
/** What the shared drafting asks of a client, with the draft this file keeps. */
function host($) {
	return hostFor($, {
		read: () => read($, form),
		update: async (change) => {
			await update($, form, change);
		}
	});
}
/** Merges `patch` into the open form; nothing when no draft is open. */
const patchForm = ($, patch) => update($, form, (cur) => cur && {
	...cur,
	...patch
});
async function hold($, held) {
	if (await read($, keys) !== held) await update($, keys, () => held);
}
async function openPane($) {
	const opened = await $.ui.open(paneOptions({
		id: PANE,
		title: "Linear draft",
		focus: true,
		closeOnEscape: true,
		rows: 30
	}));
	await update($, isPaneOpen, () => true);
	await hold($, opened.isPlaced);
	if (!opened.isPlaced) $.ui.toast(`The Linear draft pane can't show yet: ${opened.reason}`);
}
/** Closes the pane and leaves the draft for the chip. A mod's own close skips its `ui.close` hook. */
async function hidePane($) {
	await update($, isPaneOpen, () => false);
	await hold($, false);
	await $.ui.close({ id: PANE });
}
/**
* Opens the draft pane for `seed` and starts drafting into it; one draft at a time.
* Call it from the press or command hook itself: a pane opened after that hook returned
* counts as unasked and stays hidden below 144 columns.
*/
async function start($, kind, seed) {
	const started = await drafter(host($), teams).start({
		kind,
		text: seed
	});
	if (started) {
		const last = await $.store.get("last").catch(() => void 0);
		await update($, view, () => startView(last?.open));
	}
	await openPane($);
	if (!started) $.ui.toast("Reopened your Linear draft; Discard it to start another");
}
async function discard($) {
	await update($, isDiscardArmed, () => false);
	await update($, isDuplicateOpen, () => false);
	await update($, editing, () => CLOSED_EDITING);
	await update($, view, (v) => startView(v.opens));
	await update($, form, () => null);
	await hidePane($);
}
/**
* Writes the draft to Linear (the issue, or the duplicate's comment) and echoes the result
* above the prompt; `open` then opens it in the browser.
*/
async function file($, { asComment = false, open = false }) {
	if (isSending) return;
	isSending = true;
	const echo = await drafter(host($), teams).submit({
		asComment,
		open
	}).finally(() => {
		isSending = false;
	});
	if (!echo) return;
	await update($, filed, (list) => [...list.filter((x) => x.key !== echo.key), echo]);
	await discard($);
	if (open && echo.url) await openUrl($, echo.url);
}
/** What a key or a click on the terminal's screen asked for, beyond the view's own change. */
async function runEffect($, effect) {
	switch (effect.do) {
		case "hide": return hidePane($);
		case "discard": return discard($);
		case "retry": return drafter(host($), teams).retry();
		case "team": return drafter(host($), teams).switchTeam(effect.team);
		case "set": return patchForm($, effect.patch);
		case "create": return file($, { open: effect.open });
		case "comment": return file($, {
			asComment: true,
			open: effect.open
		});
	}
}
/** A key or a click on the terminal's screen. */
async function send($, given, drawn = lastDrawn) {
	const v = await read($, view);
	const f = await read($, form);
	const intent = v.step === "body" && "enter" in given && typedBody !== void 0 ? { text: typedBody } : given;
	const acted = act(f, v, intent, drawn, await $.clock.now());
	if (acted.view !== v) await update($, view, () => acted.view);
	for (const effect of acted.effects) await runEffect($, effect);
	const typing = typingOf(acted.view);
	if (typing !== typingOf(v)) {
		typedBody = void 0;
		isRingInBody = typing === "body";
		await $.ui.focus({
			requestId: PANE,
			key: typing ? fieldKey(f, typing) : RING.park
		}).catch(() => void 0);
	}
}
const register = (on) => {
	on("session.start", async ($, e, next) => {
		await $.command.register({
			name: "linear",
			description: "Draft a Linear issue from the text after it (or the recent conversation) for approval",
			argumentHint: "[what to file]",
			immediate: true
		}).catch((error) => $.ui.log(`linear-issue: /linear not registered: ${String(error)}`, { to: "debug" }));
		return next(e);
	});
	on("command.run", { command: "linear" }, async ($, e) => {
		if (!await hasLinear($)) return { text: "No Linear MCP server is configured in this session." };
		await start($, "note", e.args.trim());
		return { text: "Drafting a Linear issue in the draft pane." };
	});
	on("ui.close", { id: PANE }, async ($, e, next) => {
		await update($, isPaneOpen, () => false);
		await hold($, false);
		await update($, view, (v) => v.isConfirming || typingOf(v) ? {
			...v,
			isConfirming: false,
			step: "review"
		} : v);
		typedBody = void 0;
		return next(e);
	});
	on("ui.focus", { requestId: PANE }, async ($, e, next) => {
		const move = ringMove(e.element, isControl);
		const typing = typingOf(await read($, view));
		const field = typing === "body" ? fieldKey(await read($, form), "body") : void 0;
		const target = () => {
			if (!field || !move) return move ? RING.park : void 0;
			const isBelow = "hit" in move && move.hit.startsWith("act:");
			return (isRingInBody ? isBelow : "by" in move && move.by !== 0) ? field : RING.park;
		};
		const element = target();
		if (field) isRingInBody = (element ?? e.element) === field;
		if (move && "by" in move && move.by && !field) await send($, typing ? { escape: true } : { move: move.by });
		const moved = await next(element ? {
			...e,
			element
		} : e);
		if (!moved.deny) await hold($, true);
		return moved;
	});
	on("prompt.edit", async ($, e, next) => {
		await hold($, false);
		return next(e);
	});
	on("prompt.change", async ($, e, next) => {
		if (e.origin.kind !== "plugin") await hold($, false);
		return next(e);
	});
	on("ui.press", { plugin: YSK }, async (_$, e, next) => {
		if (e.element === "Learn more") isExpanding = true;
		return next(e);
	});
	on("ui.render", {
		component: "Pane",
		requestId: PANE
	}, async ($, e) => {
		const els = $.ui.resolve(e);
		const k = kitOf(els, e);
		const f = await read($, form);
		const isOpen = await read($, isDuplicateOpen);
		const edit = await read($, editing);
		const set = (patch) => patchForm($, patch);
		const setEditing = (patch) => update($, editing, (cur) => ({
			...cur,
			...patch(cur)
		}));
		const gui = (isReadOnly) => guiPane(k, {
			form: f,
			isDuplicateOpen: isOpen,
			editing: edit,
			priorities: PRIORITIES,
			isReadOnly,
			Input: els.Input,
			Select: els.Select,
			on: {
				create: () => file($, { open: false }),
				createOpen: () => file($, { open: true }),
				comment: () => file($, {
					asComment: true,
					open: false
				}),
				discard: () => discard($),
				toggleDuplicate: () => update($, isDuplicateOpen, (open) => !open),
				set,
				switchTeam: (team) => drafter(host($), teams).switchTeam(team),
				toggleEditing: () => setEditing((cur) => cur.isOpen ? {
					isOpen: false,
					query: "",
					queryRevision: cur.queryRevision + 1
				} : {
					isOpen: true,
					shown: f?.labelIds ?? []
				}),
				search: (query) => setEditing(() => ({ query })),
				addLabel: async (id) => {
					await update($, form, (cur) => cur && {
						...cur,
						labelIds: [...cur.labelIds.filter((l) => l !== id), id]
					});
					await setEditing((cur) => ({
						query: "",
						queryRevision: cur.queryRevision + 1,
						shown: [...cur.shown.filter((l) => l !== id), id]
					}));
				},
				toggleLabel: (id) => update($, form, (cur) => cur && {
					...cur,
					labelIds: cur.labelIds.includes(id) ? cur.labelIds.filter((l) => l !== id) : [...cur.labelIds, id]
				})
			}
		});
		const v = await read($, view);
		const held = await read($, keys);
		return forSurface(k, {
			tui: () => {
				const pane = terminalPane(els, {
					form: f,
					view: v,
					held,
					width: e.props.bodyColumns,
					rows: e.props.scroll.bodyRows,
					send: (intent, drawn) => send($, intent, drawn),
					typed: (text) => {
						typedBody = text;
					}
				});
				lastDrawn = pane.drawn;
				return pane.tree;
			},
			gui: () => gui(false),
			mobile: () => gui(true)
		});
	});
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);
		const els = $.ui.resolve(e);
		const k = kitOf(els, e);
		const issues = await read($, filed);
		const draft = await read($, isPaneOpen) ? null : await read($, form);
		const isArmed = await read($, isDiscardArmed);
		if (issues.length === 0 && !draft) return next(e);
		const handlers = {
			onOpen: () => openPane($),
			onOpenUrl: (url) => openUrl($, url),
			onCopy: async (url) => {
				const r = await $.ui.copy({ text: url });
				$.ui.toast(r.isCopied ? `Copied ${url}` : `Couldn't copy: ${r.reason}`);
			},
			onDismiss: (key) => update($, filed, (list) => list.filter((x) => x.key !== key))
		};
		return forSurface(k, {
			tui: () => terminalBand(els, {
				draft,
				issues,
				isArmed,
				width: e.props.bodyColumns,
				on: {
					open: handlers.onOpen,
					discard: async () => {
						if (await read($, isDiscardArmed)) return discard($);
						await update($, isDiscardArmed, () => true);
						$.clock.after(DISCARD_ARM_MS, () => void update($, isDiscardArmed, () => false));
					},
					openUrl: handlers.onOpenUrl,
					copy: handlers.onCopy,
					dismiss: handlers.onDismiss
				}
			}),
			gui: () => guiBand(k, {
				draft,
				issues,
				onDiscard: () => discard($),
				...handlers
			})
		});
	});
	on("ui.render", {
		component: "AbovePrompt",
		plugin: YSK
	}, async ($, e, next) => {
		const tree = await next(e);
		if (e.props.hasSurvey) return tree;
		const els = $.ui.resolve(e);
		const { Box, Button } = els;
		const k = kitOf(els, e);
		const card = cardText(tree);
		if (card !== "" && card === await read($, hidden)) return /* @__PURE__ */ h(Box, null);
		const anchor = pathTo(tree, (n) => isButton(n, ANCHOR))?.at(-1);
		if (!anchor) {
			if (isExpanding && hasButtons(tree) && pathTo(tree, (n) => isButton(n, "Learn more")) === void 0) {
				isExpanding = false;
				await warnDrift($);
			}
			return tree;
		}
		isExpanding = false;
		if (!await hasLinear($)) return tree;
		const style = isElement(anchor) && anchor.type === "Button" ? anchor.props : void 0;
		const taken = hotkeysIn(tree);
		const button = /* @__PURE__ */ h(Button, {
			key: "linear-issue",
			label: "Linear issue",
			hotkey: forSurface(k, {
				tui: () => HOTKEYS.find((h) => !taken.has(h)),
				gui: () => void 0
			}),
			plain: style?.plain,
			dimColor: style?.dimColor,
			onPress: async () => {
				await update($, hidden, () => card);
				await start($, "insight", card);
			}
		});
		return insertButton(tree, button) ?? tree;
	});
};

export { register };