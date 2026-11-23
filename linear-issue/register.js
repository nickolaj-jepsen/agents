import { atom, read, update } from "claude-code";
import { t as tokens } from "./tokens-B6LwkIOZ.js";

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
const labelOf = (options, value) => options.find((o) => o.value === value)?.label;
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
			const usual = labelOf(PRIORITIES, String(last?.priority ?? 4)) ?? "Low";
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
					const name = labelOf(cur.labels, id);
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
/** `top` after a step of `by` lines, for a window that was drawn with `scrolled`. */
const scrollBy = (window, by) => Math.max(0, Math.min(window.max, window.top + by));
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
/** The row id of a list's item, as a drawn line's `hit`. */
const choiceHit = (index) => `choice:${index}`;
/** The item a `hit` names, or -1. */
const choiceOf = (hit) => hit?.startsWith("choice:") ? Number(hit.slice(7)) : -1;

// ../../lib/kits/card/src/terminal.ts
/** The question card's parts as styled lines: the one drawing both terminals paint. */
const GAP$5 = " ".repeat(tokens.gutter);
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
const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);
/** The pointer column of one row: the pointer where the keyboard is, else blank. */
const pointerLead = (isFocused = false) => isFocused ? [span(tokens.glyph.pointer, {
	role: "text",
	bold: true
}), span(" ")] : [span(CARD_INSET)];
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
	return list.items.flatMap((item, i) => choice({
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
function view$6(model, surface) {
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

// ../../lib/kits/buttons/src/terminal.ts
/** The button row as styled lines: the one drawing both terminals paint. */
/**
* Actions left to right, label first with the key dim after it, the suggested one in the
* accent; and dim keyboard-only hints, key first. One row drops what is neither suggested nor
* essential, last first, until it fits; with `wrap` nothing drops. One button is lit: the
* first that asks (`settle`).
*/
function buttonRow$1(keys, width, { wrap = false, lead = [], hover } = {}) {
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

// ../../lib/kits/fields/src/contract.ts
/** The fields' contract: what a record holds, one named value each, and how each is edited. No host imports. */
const fieldsFields = modelFields()([
	"fields",
	"active",
	"inline",
	"valueLines",
	"width"
]);
/** The control a field is, as a drawn row's `hit`. */
const fieldHit = (id) => `field:${id}`;
/** The field a `hit` names. */
const fieldOf = (hit) => hit?.startsWith("field:") ? hit.slice(6) : void 0;
/** The control that picks an option of a field's editor: a chip, a match, or a `Select`'s choice. */
const optionHit = (field, value) => `option:${field}:${value}`;
/** The field and value an option `hit` names. */
function optionOf(hit) {
	if (!hit?.startsWith("option:")) return void 0;
	const rest = hit.slice(7);
	const at = rest.indexOf(":");
	return at < 0 ? void 0 : {
		field: rest.slice(0, at),
		value: rest.slice(at + 1)
	};
}
/** The control a many-editor's search is, as an `input` hit: `field:labels:search`. */
const searchHit = (field) => `${fieldHit(field)}:search`;

// ../../lib/kits/fields/src/terminal.ts
/** Fields as styled lines: the one drawing both terminals paint. */
const GAP$4 = " ".repeat(tokens.gutter);
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
			if (spans.length && spansWidth(spans) + tokens.gutter + spansWidth(entry) > width) {
				rows.push(line(spans));
				spans = [];
			}
			if (spans.length) spans.push(span(GAP$4));
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
			...hasKeys ? [span((f.key ?? "").padEnd(keyed - tokens.gutter), { role: keyRole$1(active) }), span(GAP$4)] : [],
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
/** The capability each gated field needs. The rest of the model is for every surface. */
const frameNeeds = {
	width: "cells",
	hostTitle: "cells:false",
	head: "cells:false",
	actions: "cells:false"
};
const frameFields = modelFields()([
	"title",
	"caption",
	"end",
	"close",
	"body",
	"footer",
	"notice",
	"width",
	"hostTitle",
	"head",
	"actions"
]);

// ../../lib/kits/prose/src/terminal.ts
/**
* Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
* here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
* that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
* needs syntax colours or runs as long as it likes.
*/
const GAP$3 = " ".repeat(tokens.gutter);
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
function prose$1({ text, width, isDim = false }) {
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
			for (const l of code) out.push(line([span(GAP$3), span(truncate(l, width - tokens.gutter), { role: "code" })]));
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
const HIT$1 = {
	title: "title",
	duplicate: "duplicate",
	up: "scroll:up",
	down: "scroll:down",
	done: "act:done",
	opens: "act:opens",
	act: (name) => `act:${name}`
};
const GAP$2 = " ".repeat(tokens.gutter);
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
/** The meaning icon of a priority, as the graphical grid draws it before its Select. */
const PRIORITY_ICON = {
	"0": "priority:none",
	"1": "priority:urgent",
	"2": "priority:high",
	"3": "priority:medium",
	"4": "priority:low"
};
/**
* The draft's fields as the kit's data: each value, its icon and its editor. The terminal opens
* an editor's options as lettered choices in place; a graphical surface draws it in the value's
* own cell. `labels` is what the label search holds, where a surface draws one.
*/
function fieldRows(f, hover, labels = {}) {
	const chosen = f.labels.filter((l) => f.labelIds.includes(l.value)).map((l) => l.label);
	const withIcons = PRIORITIES.map((p) => ({
		...p,
		icon: PRIORITY_ICON[p.value]
	}));
	const values = {
		team: {
			value: labelOf(f.teams, f.team) ?? f.team,
			editor: {
				kind: "one",
				options: f.teams,
				value: f.team
			}
		},
		status: {
			value: labelOf(f.statuses, f.state) ?? "",
			icon: "field:status",
			editor: {
				kind: "one",
				options: f.statuses,
				value: f.state
			}
		},
		priority: {
			value: labelOf(PRIORITIES, String(f.priority)) ?? "No priority",
			empty: f.priority === 0,
			icon: PRIORITY_ICON[String(f.priority)],
			editor: {
				kind: "one",
				options: withIcons,
				value: String(f.priority)
			}
		},
		labels: {
			value: chosen.join(", ") || "None",
			empty: chosen.length === 0,
			editor: {
				kind: "many",
				options: f.labels,
				chosen: f.labelIds,
				shown: labels.shown,
				query: labels.query,
				revision: labels.revision
			}
		},
		project: {
			...f.project ? { value: labelOf(f.projects, f.project) ?? "" } : {
				value: "None",
				empty: true
			},
			icon: "field:project",
			editor: {
				kind: "one",
				options: f.projects,
				value: f.project
			}
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
const editorOf = (f, id) => fieldRows(f).find((r) => fieldOf(r.hit) === id)?.editor;
/** Labels are the one field of several: its editor is `many`, which `fieldRows` builds. */
const isMultiple = (id) => id === "labels";
const optionsOf = (f, id) => {
	const e = editorOf(f, id);
	return e && e.kind !== "text" ? e.options : [];
};
const chosenOf = (f, id) => {
	const e = editorOf(f, id);
	return e?.kind === "one" ? [e.value] : e?.kind === "many" ? e.chosen : [];
};
/** The keys a list of choices has: a letter each while they last. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const choiceItems = (options) => options.map((o, i) => ({
	key: LETTERS[i] ?? "",
	text: o.label
}));
/** The column a pointer stands in, kept by every row so each step has one left edge. */
const MARGIN = CARD_INSET;
const KEYED = 1 + tokens.gutter;
/** The cells a row's words have: the room less the pointer's column. */
const innerOf = (room) => Math.max(8, room.width - MARGIN.length);
const set = (l, lead = span(MARGIN)) => l.spans.length ? {
	...l,
	spans: [lead, ...l.spans]
} : l;
const setAll = (lines) => lines.map((l) => set(l));
const keyRole = (isActive) => isActive ? "accent" : "dim";
const buttons = (all, room, lead = []) => setAll(buttonRow$1(all.filter((b) => Boolean(b)).map((b) => ({
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
const said$1 = (text, role = "dim") => set(line([span(text, { role })]));
/** The title after its key, hanging from its first line. */
const titleLines = (f, room, max, isActive) => setAll(block(literal(f.title || "Untitled", {
	role: "text",
	bold: true
}), innerOf(room), {
	lead: [span(TITLE_KEY, room.hover === HIT$1.title ? {
		role: "text",
		bold: true
	} : { role: keyRole(isActive) }), span(GAP$2)],
	max,
	hit: HIT$1.title
}));
/** The description as it is filed, the line saying where it came from quiet under it. */
function description(f, room) {
	const text = prose$1({
		text: f.description,
		width: innerOf(room)
	});
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
		const words = [`${issue} may already cover this`, `${issue} may cover this`].find((w) => cellWidth(w) <= inner) ?? truncate(`${issue}?`, inner);
		const left = inner - cellWidth(words) - tokens.gutter;
		return set(line([span(words, {
			role: "warning",
			bold: room.hover === HIT$1.duplicate || void 0
		}), ...left > 8 ? [span(GAP$2 + truncate(title, left), { role: "dim" })] : []], HIT$1.duplicate));
	}
	return said$1(truncate(f.isCheckingDuplicates ? "Looking for an issue that already covers it…" : "No open issue seems to cover this", inner));
}
const errorLines = (f, room) => f.error ? clamp(f.error, innerOf(room), { max: 2 }).map((t) => said$1(t, "error")) : [];
const sending = () => [said$1("Sending to Linear…")];
/** Whether the issue is opened once it is filed: a box to tick, never a way to file. */
const opensButton = (view) => ({
	hotkey: "o",
	label: `${view.opens ? tokens.glyph.multi.on : tokens.glyph.multi.off} Then open in Linear`,
	hit: HIT$1.opens
});
/** The box of `opensButton` in the accent while it is ticked, as a chosen answer's mark is. */
const ticked = (lines) => lines.map((l) => ({
	...l,
	spans: l.spans.flatMap((s) => s.hit === HIT$1.opens && s.text.startsWith(tokens.glyph.multi.on) ? [{
		...s,
		text: tokens.glyph.multi.on,
		role: "accent",
		bold: true
	}, {
		...s,
		text: s.text.slice(tokens.glyph.multi.on.length)
	}] : [s])
}));
function reviewFooter(f, view, room) {
	if (f.phase === "filing") return sending();
	return [...errorLines(f, room), ...ticked(buttons([
		{
			hotkey: "enter",
			label: f.duplicate ? "Create…" : "Create",
			hit: HIT$1.act("create"),
			isLit: true
		},
		{
			hotkey: "x",
			label: "Edit text",
			hit: HIT$1.act("edit")
		},
		{
			hotkey: "d",
			label: "Discard",
			hit: HIT$1.act("discard")
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
			text: truncate(item.text, Math.max(1, width - 8))
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
	hit: HIT$1.done,
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "space" : TICK_KEY,
	label: "Tick",
	hit: HIT$1.act("choose")
}], room) : buttons([{
	hotkey: "enter",
	label: "Choose",
	hit: HIT$1.act("choose"),
	isLit: true
}, {
	hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
	label: "Back",
	hit: HIT$1.act("back")
}], room);
function review(f, view, room) {
	const isTyping = view.step === "title";
	const open = typeof view.step === "object" ? view.step.pick : void 0;
	const footer = isTyping ? buttons([{
		hotkey: "enter",
		label: "Save",
		hit: HIT$1.act("save"),
		isLit: true
	}, {
		hotkey: room.hasAllKeys ? "esc" : "",
		label: "Cancel",
		hit: HIT$1.act("back")
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
	const titled = head.filter((l) => l.hit === HIT$1.title).length;
	if (isTyping) rest -= (room.fieldRows ?? 1) + 1 - titled;
	rest = Math.max(0, rest);
	const textRows = Math.max(0, rest - choices.length);
	const nested = span(MARGIN + " ".repeat(KEYED));
	const list = open ? following(choices, textRows ? choices.length : rest + over(layout), view.focus).rows.map((l) => set(l, nested)) : [];
	const window = scrolled(text, {
		rows: textRows,
		top: view.top,
		hits: {
			up: HIT$1.up,
			down: HIT$1.down
		},
		hovered: room.hover === HIT$1.up ? "up" : room.hover === HIT$1.down ? "down" : void 0
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
			line([span(" ".repeat(spansWidth(lead))), span(tokens.glyph.rule.repeat(width), { role: "border" })]),
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
			hit: HIT$1.act("save"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : "",
			label: "Cancel",
			hit: HIT$1.act("back")
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
			hit: HIT$1.act("send"),
			isLit: true
		},
		{
			hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
			label: "Back",
			hit: HIT$1.act("back")
		},
		opensButton(view)
	], room))];
	const inner = innerOf(room);
	const gap = room.rows - footer.length >= 7 ? 1 : 0;
	const budget = Math.max(1, room.rows - gap - footer.length);
	const answer = (index, text, detail) => choice({
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
	const under = [span(" ".repeat(6)), span(`${tokens.glyph.rail} `, { role: "dim" })];
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
			said$1(truncate(warning, inner), "warning"),
			...title(2),
			...meta ? [said$1(meta)] : [],
			...d.about ? setAll(block(literal(d.about, { role: "dim" }), inner, { max: 3 })) : [],
			blank()
		],
		[
			said$1(truncate(warning, inner), "warning"),
			...title(2),
			...meta ? [said$1(meta)] : [],
			blank()
		],
		[said$1(truncate(warning, inner), "warning"), ...title(1)],
		[set(line([span(d.issue, { role: "warning" }), span(GAP$2 + truncate(d.title, Math.max(1, inner - cellWidth(d.issue) - GAP$2.length)), { role: "dim" })]))]
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
	if (!text) return [said$1("From the recent conversation")];
	return [said$1(f.seed.kind === "note" ? "From your note" : "From what was flagged"), ...clamp(text, innerOf(room), { max }).map((t) => said$1(t))];
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
	const step = (label, state) => set(line([state === "done" ? span(`${tokens.glyph.done} `, { role: "success" }) : span(state === "now" ? `${tokens.glyph.bullet} ` : "  ", {
		role: "text",
		bold: true
	}), span(truncate(label, innerOf(room) - 2), state === "now" ? {
		role: "text",
		bold: true
	} : { role: "dim" })]));
	const isWriting = f.stage === "writing";
	const footer = buttons([{
		hotkey: "d",
		label: "Discard",
		hit: HIT$1.act("discard")
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
		hit: HIT$1.act("retry"),
		isLit: true
	}, {
		hotkey: "d",
		label: "Discard",
		hit: HIT$1.act("discard")
	}], room);
	return {
		body: withSeed([set(line([span("The draft was not written", {
			role: "error",
			bold: true
		})])), ...clamp(f.error ?? "Something went wrong", innerOf(room), { max: 4 }).map((t) => said$1(t, "text"))], f, room, footer.length),
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
			body: [said$1("No Linear draft open.")],
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
	if (hit === HIT$1.act("discard")) return {
		view: {
			...view,
			isConfirming: true,
			since: now ?? 0
		},
		effects: []
	};
	if (form.phase === "drafting" || form.phase === "failed") {
		if ("escape" in intent) return hide;
		if (form.phase === "failed" && ("enter" in intent || hit === HIT$1.act("retry"))) return {
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
	if (hit === HIT$1.opens) return {
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
		if ("escape" in intent || hit === HIT$1.done || hit === HIT$1.act("back")) return back;
		if (key === BACK_KEY) return back;
		if ("enter" in intent) return multiple ? back : choose(view.focus);
		if ("space" in intent || hit === HIT$1.act("choose")) return choose(view.focus);
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
		if (hit === HIT$1.title) return to("title");
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
		if ("escape" in intent || "enter" in intent || hit === HIT$1.act("back")) return {
			...to("review"),
			effects: [{
				do: "set",
				patch: { fieldRevision: form.fieldRevision + 1 }
			}]
		};
		return none;
	}
	if (view.step === "duplicate" && form.duplicate) {
		if ("escape" in intent || hit === HIT$1.act("back") || key === BACK_KEY) return to("review");
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
		if ("enter" in intent || hit === HIT$1.act("send")) return isEarly(view.since) ? none : {
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
	if ("enter" in intent || hit === HIT$1.act("create")) {
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
	if (hit === HIT$1.duplicate && form.duplicate) return to("duplicate", { focus: 0 });
	if ("move" in intent) return step(intent.move * 3);
	if ("scroll" in intent) return step(intent.scroll);
	if (hit === HIT$1.up) return step(-window.page);
	if (hit === HIT$1.down) return step(window.page);
	if (key === TITLE_KEY.toLowerCase() || hit === HIT$1.title) return to("title");
	if (key === "x" || hit === HIT$1.act("edit")) return to("body");
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
const isControl = (hit) => hit === HIT$1.title || hit === HIT$1.duplicate || hit.startsWith("scroll:") || hit.startsWith("act:") || hit.startsWith("field:") || hit.startsWith("frame:") || choiceOf(hit) >= 0;

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
* Whether a `title` or `heading` is drawn as the host's Markdown heading, which leaves about an
* em of its own space below it: what follows takes no further step, so the gap under a title is
* the gap between two groups and no more.
*/
const hasHeadingGap = (g) => !can(g, "textSize");
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
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
function view$5(model, surface) {
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
	const v = view$5(b, g.surface);
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

// ../../lib/kits/card/src/gui.tsx
const { space: space$1, across: across$1, lead } = tokens.gui;
/** The column that leads a row of answers: the mark's icon and the key's Button. */
const LEAD = lead + 2.2;
/** The nonempty parts of a card, a gap between them. */
function sections(g, ...parts) {
	const { Box } = g.els;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: space$1.sm
	}, parts.filter(Boolean));
}

// ../../lib/kits/fields/src/model.ts
/** Matches a many-editor's search offers at most: it is for finding one, not for browsing all. */
const MATCHES = 6;
/** A `Select` takes 1 to 64 options. */
const SELECT_MAX = 64;
/** The cell of one field on a surface. */
function cellOf(f, surface) {
	const e = f.editor;
	const quiet = !!f.empty;
	if (holds(surface, "cells")) return {
		kind: "lettered",
		text: f.value,
		empty: quiet
	};
	const edits = holds(surface, "input") && holds(surface, "select");
	if (!e || !edits) return f.hit && !e ? {
		kind: "press",
		text: f.value,
		empty: quiet,
		icon: f.icon
	} : {
		kind: "text",
		text: f.value,
		empty: quiet,
		icon: f.icon
	};
	if (e.kind === "text") return {
		kind: "input",
		value: e.value
	};
	if (e.kind === "one") {
		const at = e.options.find((o) => o.value === e.value);
		return {
			kind: "select",
			value: e.value,
			icon: at?.icon ?? f.icon,
			options: e.options.slice(0, 64)
		};
	}
	const shown = /* @__PURE__ */ new Set([...e.shown ?? [], ...e.chosen]);
	const query = (e.query ?? "").trim().toLowerCase();
	return {
		kind: "chips",
		chips: e.options.filter((o) => shown.has(o.value)).map((o) => ({
			value: o.value,
			label: o.label,
			on: e.chosen.includes(o.value)
		})),
		query: e.query ?? "",
		revision: e.revision ?? 0,
		matches: query ? e.options.filter((o) => !shown.has(o.value) && o.label.toLowerCase().includes(query)).slice(0, 6) : []
	};
}
function view$4(model, surface) {
	const isCells = holds(surface, "cells");
	return {
		layout: isCells ? model.inline ? "inline" : "rows" : "grid",
		rows: model.fields.map((f) => ({
			label: f.label,
			key: isCells ? f.key : void 0,
			hit: f.hit,
			cell: cellOf(f, surface)
		}))
	};
}

// ../../lib/kits/fields/src/gui.tsx
const { space, across, labelColumn, maxLabel } = tokens.gui;
/** The longest a chip's words are, with its mark beside it, before a 420-pixel pane runs out. */
const CHIP$1 = 22;
/** An icon and the gap after it, in cells. */
const ICON = 2;
/**
* A chip: a quiet Button, with the chosen mark before it where it is on. A Button never wraps and
* is never cut, so words too long for one are text beside a quiet Button that turns it off, on or adds it.
*/
function chip$1(g, key, label, hit, on) {
	const { Box, Button, Text } = g.els;
	const isLong = label.length > CHIP$1;
	return /* @__PURE__ */ h(Box, {
		key,
		flexDirection: "row",
		alignItems: "center",
		columnGap: across.xs
	}, on ? meaning(g, "state:success", { alt: "Chosen" }) : null, isLong ? /* @__PURE__ */ h(Box, { flexShrink: 1 }, /* @__PURE__ */ h(Text, null, label)) : null, /* @__PURE__ */ h(Button, {
		key: hit,
		dimColor: true,
		label: isLong ? on ? "Turn off" : on === false ? "Turn on" : "Add" : label,
		onPress: () => g.press(hit)
	}));
}
/**
* The cell of one field: its meaning icon, which stands in the icon slot, and its control, which
* starts at the column's one edge.
*/
function cell(g, id, hit, c) {
	const { Box, Text, Button, Input, Select } = g.els;
	switch (c.kind) {
		case "select": return {
			icon: c.icon,
			body: /* @__PURE__ */ h(Select, {
				key: `select:${id}`,
				value: c.value,
				options: c.options.map((o) => ({
					value: o.value,
					label: o.label
				})),
				onSelect: (value) => g.press(optionHit(id, value))
			})
		};
		case "input": return { body: /* @__PURE__ */ h(Input, {
			key: `input:${id}`,
			value: c.value,
			onInput: (text) => g.input(fieldHit(id), text),
			onSubmit: (text) => g.submit(fieldHit(id), text)
		}) };
		case "chips": return { body: /* @__PURE__ */ h(Box, {
			key: `cell:${id}`,
			flexDirection: "column",
			rowGap: space.sm
		}, c.chips.length > 0 ? /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "wrap",
			columnGap: across.xs,
			rowGap: space.xs
		}, c.chips.map((o) => chip$1(g, `chip:${o.value}`, o.label, optionHit(id, o.value), o.on))) : null, /* @__PURE__ */ h(Input, {
			key: `search:${id}:${c.revision}`,
			value: c.query,
			placeholder: "Find one to add",
			onInput: (text) => g.input(searchHit(id), text),
			onSubmit: (text) => g.submit(searchHit(id), text)
		}), c.matches.length > 0 ? /* @__PURE__ */ h(Box, {
			flexDirection: "row",
			flexWrap: "wrap",
			columnGap: across.xs,
			rowGap: space.xs
		}, c.matches.map((o) => chip$1(g, `match:${o.value}`, o.label, optionHit(id, o.value)))) : c.query.trim() ? /* @__PURE__ */ h(Text, {
			dimColor: true,
			italic: true
		}, "No match") : null) };
		case "press": return {
			icon: c.icon,
			body: c.text.length > maxLabel ? /* @__PURE__ */ h(Text, null, c.text) : /* @__PURE__ */ h(Button, {
				dimColor: true,
				label: c.text,
				onPress: () => hit ? g.press(hit) : void 0
			})
		};
		case "text": return {
			icon: c.icon,
			body: /* @__PURE__ */ h(Text, {
				dimColor: c.empty || void 0,
				italic: c.empty || void 0
			}, c.text)
		};
		case "lettered": return { body: /* @__PURE__ */ h(Text, { key: `cell:${id}` }, c.text) };
	}
}
/**
* One value each, named, in a grid of a label column and a value column. A label and its value
* never wrap together like words: the label column is `tokens.gui.labelColumn` cells and the
* value takes the rest. Each row is a `rowOf`, so a field with a Select is no taller than one
* with words by more than its control.
*/
function fields(g, props) {
	const { Box, Text } = g.els;
	const v = view$4({ fields: props.fields }, g.surface);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: across.inset
	}, rows(g, {}, ...v.rows.map((row, i) => {
		const id = fieldOf(row.hit) ?? `${i}`;
		const slot = cell(g, id, row.hit, row.cell);
		return /* @__PURE__ */ h(Box, {
			key: `field:${id}`,
			flexDirection: "row",
			alignItems: "flex-start",
			columnGap: across.sm
		}, /* @__PURE__ */ h(Box, {
			flexShrink: 0,
			minWidth: labelColumn,
			paddingTop: .45
		}, /* @__PURE__ */ h(Text, { dimColor: true }, row.label)), /* @__PURE__ */ h(Box, {
			width: 0,
			flexGrow: 1,
			flexShrink: 1,
			flexDirection: "row",
			flexWrap: "nowrap",
			alignItems: "flex-start",
			columnGap: across.sm,
			paddingY: tokens.gui.row.pad
		}, /* @__PURE__ */ h(Box, {
			flexShrink: 0,
			paddingTop: .2
		}, slot.icon ? meaning(g, slot.icon) : /* @__PURE__ */ h(Box, { paddingLeft: ICON })), /* @__PURE__ */ h(Box, {
			flexGrow: 1,
			flexShrink: 1,
			minWidth: 0
		}, slot.body)));
	})));
}
/**
* One text field the width of its room, for a value that is not in the grid: a record's title,
* edited in the place it is read. Its events are the context's: `g.input(hit, text)` and
* `g.submit(hit, text)`. A new `revision` starts the host's field afresh.
*/
function input(g, props) {
	const { Input } = g.els;
	return /* @__PURE__ */ h(Input, {
		key: `input:${props.hit}:${props.revision ?? 0}`,
		value: props.value,
		placeholder: props.placeholder,
		onInput: (text) => g.input(props.hit, text),
		onSubmit: (text) => g.submit(props.hit, text)
	});
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
	const drawn = view$6(props, g.surface);
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
function notice$1(g, n) {
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
/**
* What a list says when there is nothing in it: a caption-role line at the inset, wrapped by the
* surface. `words` is the fuller sentence a graphical surface says in its place.
*/
function emptyState(g, e) {
	const { Box } = g.els;
	const v = view$3({
		...e,
		isEmpty: true
	}, g.surface);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		paddingX: tokens.gui.across.inset
	}, said(g, v));
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

// ../../lib/kits/frame/src/model.ts
/**
* The frame's view model: what its head, its footer and its notice are on a surface. Pure and
* plain: the graphical drawing reads it, and so does the snapshot that holds it across surfaces.
* The footer is decided by the buttons' view model (`@agents/kit-buttons/model.ts`), which
* says what is lit and what goes quiet while Close asks. A frame has one lit button: the head's
* own actions come first, so the footer's lit one is quieted where they have one. No host imports.
*/
const words = (spans) => textOf({ spans: [...spans ?? []] });
function view$1(model, surface) {
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
			question: asks ? view$6({
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
			actions: !isCells && !asks && acts.length ? view$6({ rows: [acts] }, surface) : void 0
		},
		footer: view$6({
			rows: footer,
			confirming: asks
		}, surface),
		notice: words(model.notice)
	};
}

// ../../lib/kits/frame/src/gui.tsx
/**
* The captioned frame on the graphical surfaces. The host frames a pane and owns its Close, so
* there are no rules and no edges: the frame's top is a toolbar line, its body a column.
*
* The body and the notice are elements and spans here, in the props of `captionFrame`, drawn with
* the kit's own `gui.tsx` functions; the footer is the model's `Button[][]`, which the buttons'
* view model decides: one lit, and every control quiet while Close asks.
*/
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
	}, v.head.title ? typed(g, "heading", v.head.title) : null, v.head.caption ? spans(g, f.caption ?? [], { type: "caption" }) : null) : null);
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
/** A notice's row: an icon for the state its words are in, then the words. */
function notice(g, words) {
	const { Box } = g.els;
	if (!words?.length) return null;
	const role = words[0]?.role;
	const state = role === "warning" ? "state:warning" : role === "error" ? "state:error" : void 0;
	return /* @__PURE__ */ h(Box, { paddingX: tokens.gui.across.inset }, rowOf(g, {}, state ? meaning(g, state) : null, spans(g, words, { type: state ? "body" : "caption" })));
}
/**
* An inline form: its head, its body, a notice and its footer in a column, a space between. The
* footer's buttons are the model's rows, decided by the buttons' view model.
*/
function captionFrame(g, f) {
	const { Box } = g.els;
	const v = view$1(asModel(f), g.surface);
	const [, ...footer] = settle([f.actions ?? [], ...f.footer ?? []], !!f.close?.confirming);
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: tokens.gui.space.md
	}, head(g, f, v), Array.isArray(f.body) ? f.body.filter(Boolean) : f.body, notice(g, f.notice), buttonRow(g, {
		rows: footer,
		confirming: !!f.close?.confirming
	}));
}

// ../../lib/kits/sheet/src/gui.tsx
/**
* The sheet on the graphical surfaces. The host frames the pane and owns its Close, so there
* are no edges: a head, a body, a notice and the buttons, in a column. It is the frame's drawing:
* a sheet is a frame whose footer is several rows, and whose body may be a list of groups.
*/
/** A panel: head, body (groups parted by one space), a notice of its own row, then the button rows. */
function sheet(g, s) {
	return captionFrame(g, s);
}

// src/claude/gui.tsx
/**
* What the draft pane and the band above the prompt draw on the desktop app and in VS Code, from
* the kit's components. The pane reads as the issue it will file: a possible duplicate first,
* then the title and its properties (each opens in place to be set), the description, and the
* actions where reading ends. The terminal's drawing is `core/screen.ts`; `forSurface` chooses.
*/
/** The pane's controls; a property's is the kit's own (`fieldHit`, `optionHit`). */
const HIT = {
	duplicate: "duplicate",
	comment: "act:comment",
	create: "act:create",
	createOpen: "act:create-open",
	discard: "act:discard",
	title: fieldHit("title"),
	titleEdit: "act:title"
};
const oneLine = (text) => text.replace(/\s*\n\s*/g, " ");
const quiet = (label, hit) => ({
	hotkey: "",
	label,
	hit
});
/** What a press on one of the pane's controls does: the one reducer of its Buttons. */
function press(hit, p) {
	const { on, form: f } = p;
	const picked = optionOf(hit);
	if (picked && f) {
		const { field, value } = picked;
		if (field === "team") return on.switchTeam(value);
		if (field === "status") return on.set({ state: value });
		if (field === "priority") return on.set({ priority: +value });
		if (field === "project") return on.set({ project: value });
		if (field === "labels") return f.labelIds.includes(value) || p.editing.shown.includes(value) ? on.toggleLabel(value) : on.addLabel(value);
	}
	switch (hit) {
		case HIT.duplicate: return on.toggleDuplicate();
		case HIT.comment: return on.comment();
		case HIT.create: return on.create();
		case HIT.createOpen: return on.createOpen();
		case HIT.discard: return on.discard();
		case HIT.titleEdit: return p.editing.field === "title" ? on.close() : on.open("title");
	}
}
/** What the title's field and the label search send: the `input` and `submit` of the pane's context. */
function typing(p) {
	const { on, form: f } = p;
	return {
		input: (hit, text) => {
			if (hit === HIT.title) return on.set({ title: oneLine(text) });
			if (hit === searchHit("labels")) return on.search(text);
		},
		submit: async (hit, text) => {
			if (hit === HIT.title) {
				await on.set({
					title: oneLine(text),
					fieldRevision: (f?.fieldRevision ?? 0) + 1
				});
				return on.close();
			}
			if (hit === searchHit("labels")) {
				const first = matchesOf(p)[0];
				return first ? on.addLabel(first.value) : on.search(text);
			}
		}
	};
}
/** The labels the search offers now: what the grid's own view model would show. */
function matchesOf(p) {
	const f = p.form;
	const q = p.editing.query.trim().toLowerCase();
	if (!f || !q) return [];
	const shown = /* @__PURE__ */ new Set([...p.editing.shown, ...f.labelIds]);
	return f.labels.filter((l) => !shown.has(l.value) && l.label.toLowerCase().includes(q)).slice(0, 6);
}
/**
* The open issue that may already cover the draft, in a panel above it: the warning and its one
* control on the first row, and, opened, its title and the comment it would add, in the panel.
*/
function duplicateOf(g, d, p) {
	const isOpen = p.isDuplicateOpen;
	const warning = rowOf(g, { key: "warning" }, meaning(g, "state:warning"), spans(g, [span(`${d.issue} may already cover this`, { role: "warning" })], { type: "body" }));
	return panel(g, { key: "duplicate-panel" }, rowOf(g, { justify: "space-between" }, warning, buttonRow(g, { rows: [[quiet(isOpen ? "Close" : "Open", HIT.duplicate)]] })), isOpen ? typed(g, "body", d.title) : null, isOpen ? typed(g, "section", "The comment it would add") : null, isOpen ? prose(g, { text: d.comment }) : null, isOpen ? buttonRow(g, { rows: [[quiet("Comment instead", HIT.comment)]] }) : null);
}
/**
* The record's head: a caption, then its title as a heading, or, once its quiet Edit is pressed,
* a full-width field in the same place. The control stays on the caption's row, so nothing above
* or beside the title moves.
*/
function titleOf(g, f, p) {
	const canEdit = can(g, "input");
	const isOpen = canEdit && (p.editing.field === "title" || f.title.trim() === "");
	return column(g, {
		key: "head",
		gap: "xs",
		isInset: true
	}, rowOf(g, { justify: "space-between" }, typed(g, "caption", "New issue"), canEdit && f.title.trim() !== "" ? buttonRow(g, { rows: [[quiet(isOpen ? "Done" : "Edit", HIT.titleEdit)]] }) : null), isOpen ? input(g, {
		hit: HIT.title,
		value: f.title,
		placeholder: "What to do, in a line",
		revision: f.fieldRevision
	}) : typed(g, "heading", f.title));
}
/** The draft pane on a graphical surface. */
function guiPane(base, p) {
	const g = {
		...base,
		press: (hit) => press(hit, p),
		...typing(p)
	};
	const { form: f } = p;
	const frame = { title: TITLE };
	const discard = quiet("Discard", HIT.discard);
	if (!f) return emptyState(g, { text: "No Linear draft open." });
	if (f.phase === "drafting" || f.phase === "failed") return sheet(g, {
		...frame,
		hostTitle: TITLE,
		body: f.phase === "drafting" ? notice$1(g, {
			text: "Drafting the issue",
			status: "pending"
		}) : notice$1(g, {
			text: `Linear draft failed: ${f.error}`,
			status: "error"
		}),
		footer: [[discard]]
	});
	const isFiling = f.phase === "filing";
	const canFile = f.phase === "ready" && f.title.trim() !== "";
	const wait = f.isCheckingDuplicates ? "Checking for an open issue that covers this" : isFiling ? "Sending to Linear…" : void 0;
	const rows = fieldRows(f, void 0, {
		shown: p.editing.shown,
		query: p.editing.query,
		revision: p.editing.queryRevision
	}).map(({ key: _key, hovered: _hovered, ...row }) => row.value === "" ? {
		...row,
		value: "None",
		empty: true
	} : row);
	return sheet(g, {
		...frame,
		notice: wait ? [span(wait, { role: "dim" })] : void 0,
		hostTitle: TITLE,
		body: [
			f.duplicate ? duplicateOf(g, f.duplicate, p) : null,
			column(g, { gap: hasHeadingGap(g) ? "xs" : "sm" }, titleOf(g, f, p), fields(g, { fields: rows })),
			sections(g, prose(g, { text: f.description }), f.source ? notice$1(g, {
				text: f.source.replace(/`/g, ""),
				status: "dim",
				isCut: true
			}) : null),
			f.error ? notice$1(g, {
				text: f.error,
				status: "error"
			}) : null
		],
		footer: [[
			{
				hotkey: "",
				label: isFiling ? "Creating" : "Create",
				hit: HIT.create,
				isLit: canFile
			},
			quiet("Create & open", HIT.createOpen),
			discard
		]]
	});
}
/** What the band above the prompt shows on a graphical surface: the draft chip, the filed issues. */
function guiBand(base, p) {
	const { draft } = p;
	const filedText = (i) => i.title.startsWith("commented: ") ? `Commented on ${i.key}: ${i.title.slice(11)}` : `Filed ${i.key}: ${i.title}`;
	const g = {
		...base,
		press: (hit) => {
			if (hit === "draft-open") return p.onOpen();
			if (hit === "draft-discard") return p.onDiscard();
			for (const i of p.issues) {
				if (hit === `open-${i.key}`) return p.onOpenUrl(i.url);
				if (hit === `copy-${i.key}`) return p.onCopy(i.url);
				if (hit === `dismiss-${i.key}`) return p.onDismiss(i.key);
			}
		}
	};
	return sections(g, draft ? statusBand(g, {
		text: "Linear draft",
		hint: "Open",
		hit: "draft-open",
		actions: [{
			hit: "draft-discard",
			label: "Discard"
		}],
		words: draft.phase === "drafting" ? "Drafting a Linear issue" : draft.phase === "failed" ? "The Linear draft failed" : draft.title || "Untitled Linear draft",
		mark: "field:draft",
		isOneLine: true
	}) : null, ...p.issues.map((i) => i.url !== "" ? statusBand(g, {
		text: `${i.key} ${i.title}`,
		hint: "Open",
		hit: `open-${i.key}`,
		status: "success",
		actions: [{
			hit: `copy-${i.key}`,
			label: "Copy link"
		}, {
			hit: `dismiss-${i.key}`,
			label: "Dismiss"
		}],
		words: filedText(i)
	}) : statusBand(g, {
		text: `${i.key} ${i.title}`,
		hint: "Dismiss",
		hit: `dismiss-${i.key}`,
		status: "success",
		words: filedText(i)
	})));
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
* The arguments of `$.ui.open` for a pane: yours, with the house style's (transparent, no fill)
* added. A pane is always opened through this.
* @param extra `id`, `title`, `focus`, `rows` and the rest of what the pane takes.
*/
const paneOptions = (extra) => ({
	...extra,
	backgroundColor: tokens.pane.backgroundColor
});

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
const GAP$1 = " ".repeat(tokens.gutter);
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
	const actions = buttonRow$1(buttons, width)[0]?.spans ?? [];
	const room = width - spansWidth(mark) - spansWidth(actions) - tokens.gutter;
	return line([
		...mark,
		span(truncate(words, Math.max(4, room)), { role: "text" }),
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

// ../../lib/kits/sheet/src/contract.ts
/** The sheet's contract: its model and what each drawing is given. No host imports. */
/** The capability each gated field needs: a frame's, and the cells `foot` is set in. */
const sheetNeeds = {
	...frameNeeds,
	foot: "cells"
};
const sheetFields = modelFields()([...frameFields.filter((k) => k !== "end"), "foot"]);

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
	const room = s.width - spansWidth(title) - tokens.gutter;
	const action = s.close?.confirming ? closeSpans(room + 7, s.close) : void 0;
	if (!action) return line(title);
	return line([
		...title,
		...padding([...title, ...action], s.width),
		...action
	]);
}

// src/claude/terminal.tsx
const GAP = " ".repeat(tokens.gutter);
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
	const hit = typing && fieldKey(p.form, typing);
	const g = ctxOf("claude-terminal", {
		press: (key) => p.send({ hit: key }, drawn),
		input: (key, text) => {
			if (typing === "body" && key === hit) return p.typed(text);
		},
		submit: (key, text) => {
			if (key === hit) return p.send({ text }, drawn);
		}
	});
	const field = lines.find((l) => l.slot?.kind === "input")?.slot;
	const fieldRows = field?.kind === "input" ? field.rows ?? 1 : 1;
	const fieldWidth = field?.kind === "input" ? field.width : 0;
	const { Input } = k;
	const rule = () => paintLines(k, [line([span(tokens.glyph.rule.repeat(fieldWidth), { role: "border" })])]);
	return {
		tree: stack(k, ring(k, () => p.send({ enter: true }, drawn), keysOf(p.form, p.view).map((key) => ({
			key,
			press: () => p.send({ key }, drawn)
		}))), paintLines(k, lines, {
			width: p.width,
			press: g.press,
			input: !hit ? void 0 : typing === "body" ? stack(k, rule(), /* @__PURE__ */ h(Input, {
				key: hit,
				value: p.form?.description ?? "",
				label: "x".toUpperCase(),
				rows: Math.max(2, fieldRows - RULES),
				submitLabel: "",
				autoFocus: true,
				onInput: (text) => g.input(hit, text),
				onSubmit: (text) => g.submit(hit, text)
			}), rule()) : /* @__PURE__ */ h(Input, {
				key: hit,
				value: p.form?.title ?? "",
				label: "E",
				rows: fieldRows,
				submitLabel: "",
				autoFocus: true,
				onSubmit: (text) => g.submit(hit, text)
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
		lines.push(chip([span(`${tokens.glyph.done} `, { role: "success" }), span(`${issue.key}${GAP}`, { bold: true })], issue.title, [...issue.url ? [{
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
			label: tokens.glyph.times,
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
	field: null,
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
		const f = await read($, form);
		const isOpen = await read($, isDuplicateOpen);
		const edit = await read($, editing);
		const v = await read($, view);
		const held = await read($, keys);
		const set = (patch) => patchForm($, patch);
		const setEditing = (patch) => update($, editing, (cur) => ({
			...cur,
			...patch(cur)
		}));
		const gui = () => guiPane(guiOf(els, e), {
			form: f,
			isDuplicateOpen: isOpen,
			editing: edit,
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
				open: (field) => setEditing(() => ({ field })),
				close: () => setEditing(() => ({ field: null })),
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
				toggleLabel: async (id) => {
					await setEditing((cur) => ({ shown: [.../* @__PURE__ */ new Set([...cur.shown, id])] }));
					await update($, form, (cur) => cur && {
						...cur,
						labelIds: cur.labelIds.includes(id) ? cur.labelIds.filter((l) => l !== id) : [...cur.labelIds, id]
					});
				}
			}
		});
		return forSurface(e, {
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
			gui
		});
	});
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);
		const els = $.ui.resolve(e);
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
		return forSurface(e, {
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
			gui: () => guiBand(guiOf(els, e), {
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
		const { Box, Button } = $.ui.resolve(e);
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
			hotkey: forSurface(e, {
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