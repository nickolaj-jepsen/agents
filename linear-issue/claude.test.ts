import { expect, mock, test } from "claude-code/testing";

// ../../lib/kits/legacy/src/claude/checks.tsx
/**
* The house style's graphical rules as test assertions, for a mod's `claude plugin test`, which
* the build bundles into the mod's tests. A `.tsx` file so the pi build's `tsc -b`, which has no
* Claude types, leaves it out.
*/
/** The glyphs a graphical surface draws no controls with. */
const GLYPHS = /[□■☐☑○●✎▸▾❯↑↓╰│]/;
/** What a mounted tree shows, one string per element that shows text. */
async function shown(ui) {
	return (await ui.findAll({})).map((e) => e.text).filter(Boolean);
}
/**
* A tree drawn for a graphical surface keeps the style's rules (`style.md`, "Graphical
* surfaces"): no rule of repeated characters, no glyph standing in for a control, no text cut
* by the mod, no key hints, no hotkey but on an action row, and nothing sized to the viewport:
* no frame drawn in a colour, no width but a side rule's fraction of a cell, no height but an
* icon's line, and only the surface cuts a line.
*/
async function expectNative(ui, options = {}) {
	const hotkeys = new Set(options.hotkeys ?? []);
	for (const text of await shown(ui)) {
		expect(text).not.toMatch(/[─-]{3,}/);
		expect(text).not.toMatch(GLYPHS);
		expect(text).not.toMatch(/…$/m);
		expect(text).not.toMatch(/\b(?:ctrl\+|Enter\b|Esc\b)|\b[a-z]: /);
	}
	for (const e of await ui.findAll({})) {
		if (e.type === "Button" && !hotkeys.has(String(e.key))) expect(e.props.hotkey).toBeUndefined();
		if (e.type === "Box") {
			if (e.props.borderStyle !== void 0) expect(e.props.borderColor).toBe("#00000000");
			expect(e.props.minHeight).toBeUndefined();
			if (e.props.width !== void 0) expect(e.props.width).toBeLessThan(1);
			if (e.props.height !== void 0) expect(e.props.height).toBe(1);
		}
		if (e.type === "Text") expect([void 0, "truncate-end"]).toContain(e.props.wrap);
	}
}

// src/claude.test.tsx
const BAND = {
	plugin: "linear-issue",
	component: "AbovePrompt",
	props: {
		hasSurvey: false,
		isCollapsed: false,
		isWorking: false,
		maxRows: 20,
		bodyColumns: 120,
		scroll: {
			offset: 0,
			bodyRows: 20
		},
		view: {}
	},
	surface: "terminal"
};
const YSK = {
	name: "cc-plugin-you-should-know",
	tier: "builtin",
	register(on) {
		let view = "collapsed";
		on("ui.render", { component: "AbovePrompt" }, async ($, e) => {
			const { Box, Text, Button } = $.ui.resolve(e);
			const anchor = await $.env.get("FAKE_ANCHOR") ?? "Chat in main session";
			const extra = await $.env.get("FAKE_EXTRA");
			const go = (next) => () => {
				view = next;
				$.ui.invalidate("ui.render");
			};
			if (view === "gone") return /* @__PURE__ */ h(Box, null);
			if (view === "collapsed") return /* @__PURE__ */ h(Box, { flexDirection: "column" }, /* @__PURE__ */ h(Text, null, "Heads up · Prompt caching makes one-off /ask questions cost more."), /* @__PURE__ */ h(Box, null, /* @__PURE__ */ h(Button, {
				key: "Learn more",
				label: "Learn more",
				hotkey: "1",
				plain: true,
				onPress: go("expanded")
			}), /* @__PURE__ */ h(Button, {
				key: "Dismiss",
				label: "Dismiss",
				hotkey: "0",
				plain: true,
				role: "dismiss",
				onPress: go("gone")
			})));
			return /* @__PURE__ */ h(Box, { flexDirection: "column" }, /* @__PURE__ */ h(Text, { bold: true }, "One-off /ask questions now cost more"), /* @__PURE__ */ h(Text, null, "Saving the cache costs 1.25x, so a question with no follow-up pays 25% more."), /* @__PURE__ */ h(Box, { flexDirection: "row" }, /* @__PURE__ */ h(Box, { marginRight: 2 }, /* @__PURE__ */ h(Button, {
				key: "Understood",
				label: "Understood",
				hotkey: "1",
				plain: true,
				onPress: go("gone")
			})), /* @__PURE__ */ h(Box, { marginRight: 2 }, /* @__PURE__ */ h(Button, {
				key: anchor,
				label: anchor,
				hotkey: "2",
				plain: true,
				onPress: go("gone")
			})), extra && /* @__PURE__ */ h(Box, { marginRight: 2 }, /* @__PURE__ */ h(Button, {
				key: extra,
				label: extra,
				hotkey: "3",
				plain: true,
				onPress: go("gone")
			})), /* @__PURE__ */ h(Box, { marginRight: 2 }, /* @__PURE__ */ h(Button, {
				key: "Dismiss",
				label: "Dismiss",
				hotkey: "0",
				plain: true,
				role: "dismiss",
				onPress: go("collapsed")
			}))));
		});
	}
};
const PANE = {
	plugin: "linear-issue",
	component: "Pane",
	requestId: "linear-draft",
	props: {
		title: "Linear draft",
		isFocused: true,
		bodyColumns: 100,
		placement: "inline",
		scroll: {
			offset: 0,
			bodyRows: 30
		},
		view: {}
	},
	surface: "terminal"
};
const LINEAR_TOOLS = [
	{
		name: "Read",
		description: "",
		mcp: false
	},
	{
		name: "mcp__claude_ai_Linear__list_issues",
		description: "",
		mcp: true
	},
	{
		name: "mcp__claude_ai_Linear__save_issue",
		description: "",
		mcp: true
	}
];
const DRAFT = {
	team: "MSC",
	title: "Cap get_rate outage latency",
	description: "During an outage one call blocks ~16.5 s.",
	priority: 4,
	labels: ["Bug"],
	search: ["exchange rates"]
};
const usage = {
	input_tokens: 0,
	output_tokens: 0,
	cache_read_input_tokens: 0,
	cache_creation_input_tokens: 0
};
/** Stands in for the engine beneath both plugins. */
function world(on, tools = LINEAR_TOOLS, env = {}) {
	const w = {
		clock: mock.clock(on),
		toasts: [],
		calls: [],
		prompts: [],
		checks: [],
		runs: [],
		draft: DRAFT,
		verdict: { duplicate: null },
		tools
	};
	mock.store(on);
	mock.env(on, env);
	on("tool.list", () => ({ value: w.tools }));
	on("ui.toast", (_, e) => {
		w.toasts.push(e.text);
		return { value: void 0 };
	});
	on("ui.open", () => ({ value: { isPlaced: true } }));
	on("ui.close", () => ({ value: void 0 }));
	on("ui.copy", () => ({ value: { isCopied: true } }));
	on("session.cwd", () => ({ value: "/repo" }));
	on("session.id", () => ({ value: "sess-1" }));
	on("session.repo", () => ({ value: {
		root: "/repo",
		remote: "git@github.com:me/repo.git",
		internal: false,
		name: null
	} }));
	on("session.version", () => ({ value: { version: "9.9.9" } }));
	on("session.messages", () => ({ value: [{
		role: "user",
		text: "make /ask take follow-ups",
		toolUses: []
	}, {
		role: "assistant",
		text: "Adding prompt caching to /ask.",
		toolUses: []
	}] }));
	on("process.run", (_, e) => {
		w.runs.push([...e.argv]);
		return { value: {
			exitCode: 0,
			stdout: "feat/ask\n",
			stderr: "",
			isStdoutTruncated: false,
			isStderrTruncated: false
		} };
	});
	on("model.complete", (_, e) => {
		const prompt = String(e.prompt);
		const isCheck = prompt.includes("<candidates>");
		(isCheck ? w.checks : w.prompts).push(prompt);
		const answer = isCheck ? w.verdict : w.draft;
		return { value: {
			isAnswered: true,
			text: JSON.stringify(answer),
			usage
		} };
	});
	on("mcp.call", (_, e) => {
		w.calls.push({
			tool: e.tool,
			args: e.args
		});
		const team = String(e.args.team ?? "");
		const answers = {
			get_user: { teams: [{
				name: "Misc",
				key: "MSC"
			}, {
				name: "Webshop",
				key: "SHP"
			}] },
			list_issues: { issues: [{
				id: "SHP-1",
				title: "Cache exchange rates",
				statusType: "backlog",
				team: "Webshop"
			}, {
				id: "SHP-2",
				title: "Cache rates daily",
				statusType: "completed",
				team: "Webshop"
			}] },
			list_issue_statuses: [{
				id: `${team}-backlog`,
				type: "backlog",
				name: "Backlog"
			}, {
				id: `${team}-todo`,
				type: "unstarted",
				name: "Todo"
			}],
			list_issue_labels: { labels: [{
				id: `${team}-bug`,
				name: "Bug",
				parent: null,
				archivedAt: null
			}, ...Array.from({ length: 70 }, (_, i) => ({
				id: `${team}-area${i}`,
				name: `area${i}`,
				parent: "Area",
				archivedAt: null
			}))] },
			list_projects: { projects: [{
				id: `${team}-p`,
				name: `${team} project`
			}] },
			save_issue: {
				identifier: "MSC-900",
				url: "https://linear.app/x/issue/MSC-900/cap"
			},
			save_comment: {
				id: "c1",
				url: "https://linear.app/x/issue/SHP-1#comment-c1"
			}
		};
		return { value: {
			content: [{
				type: "text",
				text: JSON.stringify(answers[e.tool] ?? {})
			}],
			isError: false
		} };
	});
	return w;
}
const RUN = {
	command: "linear",
	origin: { kind: "composer" },
	presentation: {
		isFullscreen: false,
		columns: 120
	}
};
async function startSession($, on, surface = "terminal") {
	on("command.register", () => ({ value: { command: "linear" } }));
	on("session.start", (_, e) => ({ cwd: e.cwd }));
	await $.session.start({
		cwd: "/repo",
		surface,
		isInteractive: true
	});
}
async function expand(band, w) {
	await band.press({
		plugin: "cc-plugin-you-should-know",
		key: "Learn more"
	});
	await w.clock.settle();
}
const saved = (w, tool) => w.calls.find((c) => c.tool === tool)?.args;
/** Whether the terminal's drawing says `words` somewhere. */
const shows = async (site, words) => await site.find({
	type: "Text",
	text: words
}) !== void 0;
/**
* Opens a field of the terminal's draft and presses the choice that reads `words`, or the one
* at `index`: a kit choice list under the field's row, each row keyed `choice:<n>`.
*/
async function pick(pane, w, field, words, index) {
	await pane.press({ key: `field:${field}` });
	await w.clock.settle();
	for (let i = index ?? 0; i < 30; i++) {
		const row = await pane.find({ key: `choice:${i}` });
		if (!row) break;
		if (index !== void 0 || words.test(String(row.props.label ?? ""))) {
			await pane.press({ key: `choice:${i}` });
			return;
		}
	}
	throw new Error(`no choice of ${field} reads ${String(words)}`);
}
test("the button shows in the expanded card only, before Dismiss", { plugins: [YSK] }, async ($, on) => {
	const w = world(on);
	const band = await $.ui.mount(BAND);
	expect(await band.find({ key: "linear-issue" })).toBeUndefined();
	await expand(band, w);
	const buttons = (await band.findAll({ type: "Button" })).map((b) => b.key);
	expect(buttons).toEqual([
		"Understood",
		"Chat in main session",
		"linear-issue",
		"Dismiss"
	]);
	await band.unmount();
});
test("no Linear server, no button", { plugins: [YSK] }, async ($, on) => {
	const w = world(on, [{
		name: "Read",
		description: "",
		mcp: false
	}]);
	const band = await $.ui.mount(BAND);
	await expand(band, w);
	expect(await band.find({ key: "linear-issue" })).toBeUndefined();
	expect(await band.find({ key: "Chat in main session" })).toBeDefined();
	await band.unmount();
});
test("a renamed anchor leaves the card as drawn and warns once per version", { plugins: [YSK] }, async ($, on) => {
	const w = world(on, LINEAR_TOOLS, { FAKE_ANCHOR: "Discuss in chat" });
	const band = await $.ui.mount(BAND);
	for (let i = 0; i < 2; i++) {
		await expand(band, w);
		const buttons = (await band.findAll({ type: "Button" })).map((b) => b.key);
		expect(buttons).toEqual([
			"Understood",
			"Discuss in chat",
			"Dismiss"
		]);
		await band.press({
			plugin: "cc-plugin-you-should-know",
			key: "Dismiss"
		});
		await w.clock.settle();
	}
	await band.unmount();
	expect(w.toasts.filter((t) => t.includes("linear-issue:"))).toHaveLength(1);
});
test("pressing it hides the card, drafts into the pane, and Create files it and echoes the link", { plugins: [YSK] }, async ($, on) => {
	const w = world(on);
	const band = await $.ui.mount(BAND);
	await expand(band, w);
	await band.press({ key: "linear-issue" });
	await w.clock.settle();
	expect(await band.find({ type: "Button" })).toBeUndefined();
	expect(w.prompts[0]).toContain("One-off /ask questions now cost more");
	const pane = await $.ui.mount(PANE);
	expect(await shows(pane, /Cap get_rate outage latency/)).toBe(true);
	expect(await shows(pane, /Status\s+Todo/)).toBe(true);
	expect(await shows(pane, /Labels\s+Bug/)).toBe(true);
	await pick(pane, w, "priority", /High/);
	expect(await shows(pane, /Priority\s+High/)).toBe(true);
	await pane.press({ key: "title" });
	await pane.input({
		key: "title-0",
		text: "Cap outage latency",
		kind: "submit"
	});
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(saved(w, "save_issue")).toEqual({
		team: "MSC",
		title: "Cap outage latency",
		description: "During an outage one call blocks ~16.5 s.\n\n---\nSource: `me/repo` · feat/ask · session sess-1",
		assignee: "me",
		state: "MSC-todo",
		priority: 2,
		labels: ["MSC-bug"]
	});
	await pane.unmount();
	expect((await band.find({
		type: "Text",
		text: /MSC-900/
	}))?.text).toContain("Cap outage latency");
	await band.press({ key: "filed:open:MSC-900" });
	await w.clock.settle();
	expect(w.runs).toContainEqual(["xdg-open", "https://linear.app/x/issue/MSC-900/cap"]);
	await band.press({ key: "filed:dismiss:MSC-900" });
	expect(await band.find({ key: "filed:open:MSC-900" })).toBeUndefined();
	await band.unmount();
});
test("switching team reloads its statuses and keeps labels by name", { plugins: [YSK] }, async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "cache rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	await pick(pane, w, "team", /SHP/);
	await w.clock.settle();
	expect(await shows(pane, /Labels\s+Bug/)).toBe(true);
	await pick(pane, w, "project", /./, 1);
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(saved(w, "save_issue")).toMatchObject({
		team: "SHP",
		state: "SHP-todo",
		project: "SHP-p",
		labels: ["SHP-bug"]
	});
	await pane.unmount();
});
test("/linear drafts from the typed note without a subagent", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	const { text } = await $.command.run({
		...RUN,
		args: " cache rates per day "
	});
	await w.clock.settle();
	expect(text).toContain("draft pane");
	expect(w.prompts[0]).toContain("<note>\ncache rates per day\n</note>");
	expect(w.prompts[0]).toContain("Adding prompt caching to /ask.");
});
test("an open issue the search finds can be commented on instead", async ($, on) => {
	const w = world(on);
	w.verdict = { duplicate: {
		issue: "SHP-1",
		comment: "Seen again in rates.py."
	} };
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	expect(await shows(pane, /Create…/)).toBe(true);
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(await pane.find({ key: "choice:1" })).toBeDefined();
	expect(saved(w, "save_comment")).toBeUndefined();
	expect(saved(w, "save_issue")).toBeUndefined();
	await w.clock.advance(700);
	await pane.press({ key: "act:send" });
	await w.clock.settle();
	expect(saved(w, "save_comment")).toEqual({
		issueId: "SHP-1",
		body: "Seen again in rates.py."
	});
	expect(saved(w, "save_issue")).toBeUndefined();
	await pane.unmount();
});
test("/linear without a Linear server says so and drafts nothing", async ($, on) => {
	const w = world(on, [{
		name: "Read",
		description: "",
		mcp: false
	}]);
	await startSession($, on);
	const { text } = await $.command.run({
		...RUN,
		args: "anything"
	});
	expect(text).toContain("No Linear MCP server");
	expect(w.prompts).toHaveLength(0);
});
test("/linear right after start waits for the Linear server to connect", async ($, on) => {
	const w = world(on, [{
		name: "mcp__claude_ai_Linear__authenticate",
		description: "",
		mcp: true
	}]);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.advance(2e3);
	w.tools = LINEAR_TOOLS;
	await w.clock.advance(2e3);
	const pane = await $.ui.mount(PANE);
	expect(await shows(pane, /Cap get_rate outage latency/)).toBe(true);
	await pane.unmount();
});
test("an open draft is reopened by /linear until Discard drops it", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	await $.command.run({
		...RUN,
		args: "something else"
	});
	await w.clock.settle();
	expect(w.prompts).toHaveLength(1);
	const pane = await $.ui.mount(PANE);
	await pane.press({ key: "act:discard" });
	expect(await shows(pane, /Discard draft\?/)).toBe(true);
	await w.clock.advance(700);
	await pane.press({ key: "frame:discard" });
	await w.clock.settle();
	await pane.unmount();
	await $.command.run({
		...RUN,
		args: "something else"
	});
	await w.clock.settle();
	expect(w.prompts).toHaveLength(2);
	expect(w.prompts[1]).toContain("something else");
});
test("a pasted multi-line title is filed as one line, without a removed label", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	await pane.press({ key: "title" });
	await pane.input({
		key: "title-0",
		text: "Cap outage\nlatency",
		kind: "submit"
	});
	await pick(pane, w, "labels", /Bug/);
	await pane.press({ key: "act:done" });
	expect(await shows(pane, /Labels\s+None/)).toBe(true);
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(saved(w, "save_issue")).toMatchObject({ title: "Cap outage latency" });
	expect(saved(w, "save_issue")).not.toHaveProperty("labels");
	await pane.unmount();
});
test("a description taller than its room scrolls and is filed whole", async ($, on) => {
	const w = world(on);
	const long = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n");
	w.draft = {
		...DRAFT,
		description: long
	};
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	expect(await shows(pane, /↓ \d+ more/)).toBe(true);
	expect(await shows(pane, /Line 59/)).toBe(false);
	await pane.press({ key: "scroll:down" });
	expect(await shows(pane, /↑ \d+ more/)).toBe(true);
	expect(await pane.find({ key: "act:create" })).toBeDefined();
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(String(saved(w, "save_issue")?.description)).toContain("Line 59");
	await pane.unmount();
});
test("the last filed team is the next draft's fallback", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	await pick(pane, w, "team", /SHP/);
	await w.clock.settle();
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	await pane.unmount();
	w.draft = {
		...DRAFT,
		team: "nope"
	};
	await $.command.run({
		...RUN,
		args: "again"
	});
	await w.clock.settle();
	const defaults = /<defaults>([\s\S]*?)<\/defaults>/.exec(w.prompts[1] ?? "")?.[1] ?? "";
	expect(defaults).toContain("team: SHP");
	expect(defaults).toContain("priority: Low");
	const again = await $.ui.mount(PANE);
	expect(await shows(again, /Team\s+.*SHP/)).toBe(true);
	await again.unmount();
});
test("Enter in the title keeps its text", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	expect(await pane.find({ key: "title-0" })).toBeUndefined();
	await pane.press({ key: "title" });
	await pane.input({
		key: "title-0",
		text: "Cap outage latency",
		kind: "submit"
	});
	expect(await pane.find({ key: "title-0" })).toBeUndefined();
	expect(await shows(pane, /Cap outage latency/)).toBe(true);
	await pane.unmount();
});
test("the description is typed as its Markdown: Enter saves it, in the field or once the ring has left it", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	expect(await pane.find({ key: "body-0" })).toBeUndefined();
	await pane.press({ key: "act:edit" });
	await pane.input({
		key: "body-0",
		text: "Cap it.\n\n- at the gateway\n- per tenant"
	});
	expect(await pane.find({ key: "body-0" })).toBeUndefined();
	expect(await shows(pane, /at the gateway/)).toBe(true);
	await pane.press({ key: "act:edit" });
	await pane.input({
		key: "body-1",
		text: "Cap it per tenant.",
		kind: "change"
	});
	await pane.press({ key: "kit-ring" });
	expect(await pane.find({ key: "body-1" })).toBeUndefined();
	await pane.press({ key: "act:edit" });
	await pane.input({
		key: "body-2",
		text: "Thrown away.",
		kind: "change"
	});
	await pane.press({ key: "act:back" });
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(String(saved(w, "save_issue")?.description)).toMatch(/^Cap it per tenant\.\n\n---\n/);
	await pane.unmount();
});
test("a closed issue is never offered as the duplicate", async ($, on) => {
	const w = world(on);
	w.verdict = { duplicate: {
		issue: "SHP-2",
		comment: "Seen again."
	} };
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	expect(await pane.find({ key: "duplicate" })).toBeUndefined();
	expect(await shows(pane, /No open issue seems to cover this/)).toBe(true);
	expect(await pane.find({ key: "act:create" })).toBeDefined();
	await pane.unmount();
});
test("Create & open files the issue and opens it", async ($, on) => {
	const w = world(on);
	await startSession($, on);
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount(PANE);
	await pane.press({ key: "act:opens" });
	expect(saved(w, "save_issue")).toBeUndefined();
	await w.clock.advance(700);
	await pane.press({ key: "act:create" });
	await w.clock.settle();
	expect(saved(w, "save_issue")).toMatchObject({ title: "Cap get_rate outage latency" });
	expect(w.runs).toContainEqual(["xdg-open", "https://linear.app/x/issue/MSC-900/cap"]);
	await pane.unmount();
});
test("the button takes the next free digit when the card uses 3", { plugins: [YSK] }, async ($, on) => {
	const w = world(on, LINEAR_TOOLS, { FAKE_EXTRA: "Show me" });
	const band = await $.ui.mount(BAND);
	await expand(band, w);
	expect((await band.find({ key: "Show me" }))?.props.hotkey).toBe("3");
	expect((await band.find({ key: "linear-issue" }))?.props.hotkey).toBe("4");
	await band.unmount();
});
test("a Linear server added later shows the button", { plugins: [YSK] }, async ($, on) => {
	const w = world(on, [{
		name: "Read",
		description: "",
		mcp: false
	}]);
	const band = await $.ui.mount(BAND);
	await expand(band, w);
	expect(await band.find({ key: "linear-issue" })).toBeUndefined();
	w.tools = LINEAR_TOOLS;
	await w.clock.advance(1e4);
	await band.press({
		plugin: "cc-plugin-you-should-know",
		key: "Dismiss"
	});
	await expand(band, w);
	expect(await band.find({ key: "linear-issue" })).toBeDefined();
	await band.unmount();
});
const CARD_KEYS = [
	"Understood",
	"Chat in main session",
	"Dismiss"
];
/** The keys of the pane's Buttons, top to bottom. */
const buttonKeys = async (ui) => (await ui.findAll({ type: "Button" })).map((b) => String(b.key));
for (const surface of ["desktop", "vscode"]) {
	test(`${surface}: the button shows in the expanded card, and a press drafts into the pane and files it`, { plugins: [YSK] }, async ($, on) => {
		const w = world(on);
		await startSession($, on, surface);
		const band = await $.ui.mount({
			...BAND,
			surface
		});
		expect(await band.find({ key: "linear-issue" })).toBeUndefined();
		await expand(band, w);
		const buttons = (await band.findAll({ type: "Button" })).map((b) => b.key);
		expect(buttons).toEqual([
			"Understood",
			"Chat in main session",
			"linear-issue",
			"Dismiss"
		]);
		expect((await band.find({ key: "linear-issue" }))?.props.hotkey).toBeUndefined();
		await expectNative(band, { hotkeys: CARD_KEYS });
		await band.press({ key: "linear-issue" });
		await w.clock.settle();
		expect(w.prompts[0]).toContain("One-off /ask questions now cost more");
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		await expectNative(pane);
		expect(await pane.find({
			type: "Text",
			text: "New issue in Misc"
		})).toBeDefined();
		expect(await pane.find({
			type: "Text",
			text: "Cap get_rate outage latency"
		})).toBeDefined();
		for (const text of [
			"Todo",
			"Low",
			"Bug"
		]) expect(await pane.find({
			type: "Text",
			text
		})).toBeDefined();
		expect(await pane.find({
			type: "Markdown",
			text: /blocks ~16.5 s/
		})).toBeDefined();
		expect(await pane.find({ type: "Input" })).toBeUndefined();
		expect(await pane.find({ type: "Select" })).toBeUndefined();
		expect(await buttonKeys(pane)).toEqual([
			"edit",
			"create",
			"create-open",
			"discard"
		]);
		const create = await pane.find({ key: "create" });
		expect(create?.props.variant).toBe("primary");
		expect(create?.props.dimColor).toBeUndefined();
		expect((await pane.find({ key: "edit" }))?.props.label).toBe("Edit");
		await pane.press({ key: "edit" });
		await expectNative(pane);
		expect((await pane.find({ key: "edit" }))?.props.label).toBe("Done");
		expect((await pane.find({ key: "title-0" }))?.props.value).toBe("Cap get_rate outage latency");
		expect(await pane.find({ key: "team" })).toBeDefined();
		expect((await pane.find({ key: "status" }))?.props.value).toBe("MSC-todo");
		const bug = await pane.find({ key: "label-MSC-bug" });
		expect(bug?.props.label).toBe("Bug");
		expect(bug?.props.dimColor).toBeUndefined();
		await pane.select({
			key: "priority",
			value: "2"
		});
		await pane.input({
			key: "title-0",
			text: "Cap outage latency",
			kind: "change"
		});
		await pane.press({ key: "edit" });
		expect(await pane.find({
			type: "Text",
			text: "Cap outage latency"
		})).toBeDefined();
		expect(await pane.find({
			type: "Text",
			text: "High"
		})).toBeDefined();
		await pane.press({ key: "create" });
		await w.clock.settle();
		expect(saved(w, "save_issue")).toMatchObject({
			team: "MSC",
			title: "Cap outage latency",
			state: "MSC-todo",
			priority: 2,
			labels: ["MSC-bug"]
		});
		await pane.unmount();
		await expectNative(band, { hotkeys: CARD_KEYS });
		expect((await band.find({
			type: "Text",
			text: /Filed MSC-900/
		}))?.text).toContain("Cap outage latency");
		await band.press({ key: "open-MSC-900" });
		await w.clock.settle();
		expect(w.runs).toContainEqual(["xdg-open", "https://linear.app/x/issue/MSC-900/cap"]);
		await band.press({ key: "copy-MSC-900" });
		expect(w.toasts).toContain("Copied https://linear.app/x/issue/MSC-900/cap");
		await band.press({ key: "dismiss-MSC-900" });
		expect(await band.find({ key: "open-MSC-900" })).toBeUndefined();
		await band.unmount();
	});
	test(`${surface}: Create is quiet until the draft can be filed`, async ($, on) => {
		const w = world(on);
		await startSession($, on, surface);
		await $.command.run({
			...RUN,
			args: "rates"
		});
		await w.clock.settle();
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		await pane.press({ key: "edit" });
		await pane.input({
			key: "title-0",
			text: "  ",
			kind: "change"
		});
		const create = await pane.find({ key: "create" });
		expect(create?.props.variant).toBeUndefined();
		expect(create?.props.dimColor).toBe(true);
		await expectNative(pane);
		await pane.press({ key: "edit" });
		expect(await pane.find({
			type: "Text",
			text: "No title yet"
		})).toBeDefined();
		await expectNative(pane);
		await pane.unmount();
	});
	test(`${surface}: a possible duplicate comes first, folded, and opens in place to comment on it instead; discard drops the draft`, async ($, on) => {
		const w = world(on);
		w.verdict = { duplicate: {
			issue: "SHP-1",
			comment: "Seen again in rates.py."
		} };
		await startSession($, on, surface);
		await $.command.run({
			...RUN,
			args: "rates"
		});
		await w.clock.settle();
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		expect(await buttonKeys(pane)).toEqual([
			"duplicate-toggle",
			"edit",
			"create",
			"create-open",
			"discard"
		]);
		expect((await pane.find({ key: "duplicate-toggle" }))?.props.label).toBe("Open");
		const line = await pane.find({
			type: "Text",
			text: "SHP-1 may already cover this"
		});
		expect(line?.props.color).toBe("#d4962a");
		expect(await pane.find({
			type: "Text",
			text: "Cache exchange rates"
		})).toBeDefined();
		await expectNative(pane);
		await pane.press({ key: "duplicate-toggle" });
		expect((await pane.find({ key: "duplicate-toggle" }))?.props.label).toBe("Close");
		expect(await pane.find({
			type: "Markdown",
			text: /Seen again in rates.py/
		})).toBeDefined();
		expect((await pane.find({ key: "comment" }))?.props.label).toBe("Comment instead");
		await expectNative(pane);
		await pane.press({ key: "comment" });
		await w.clock.settle();
		expect(saved(w, "save_comment")).toEqual({
			issueId: "SHP-1",
			body: "Seen again in rates.py."
		});
		expect(saved(w, "save_issue")).toBeUndefined();
		await pane.unmount();
		await $.command.run({
			...RUN,
			args: "again"
		});
		await w.clock.settle();
		expect(w.prompts).toHaveLength(2);
		await $.command.run({
			...RUN,
			args: "once more"
		});
		await w.clock.settle();
		expect(w.prompts).toHaveLength(2);
		const again = await $.ui.mount({
			...PANE,
			surface
		});
		await again.press({ key: "discard" });
		await w.clock.settle();
		await again.unmount();
		await $.command.run({
			...RUN,
			args: "once more"
		});
		await w.clock.settle();
		expect(w.prompts).toHaveLength(3);
	});
	test(`${surface}: a long description is shown whole, and a team can be picked`, async ($, on) => {
		const w = world(on);
		const long = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n");
		w.draft = {
			...DRAFT,
			description: long
		};
		await startSession($, on, surface);
		await $.command.run({
			...RUN,
			args: "rates"
		});
		await w.clock.settle();
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		expect(await pane.find({
			type: "Text",
			text: /continues/
		})).toBeUndefined();
		expect(await pane.find({
			type: "Markdown",
			text: /Line 59/
		})).toBeDefined();
		await expectNative(pane);
		await pane.press({ key: "edit" });
		await pane.select({
			key: "team",
			value: "SHP"
		});
		await w.clock.settle();
		expect((await pane.find({ key: "status" }))?.props.value).toBe("SHP-todo");
		await pane.press({ key: "edit" });
		expect(await pane.find({
			type: "Text",
			text: "New issue in Webshop"
		})).toBeDefined();
		await pane.press({ key: "create-open" });
		await w.clock.settle();
		expect(saved(w, "save_issue")).toMatchObject({
			team: "SHP",
			state: "SHP-todo"
		});
		expect(String(saved(w, "save_issue")?.description)).toContain("Line 59");
		expect(w.runs).toContainEqual(["xdg-open", "https://linear.app/x/issue/MSC-900/cap"]);
		await pane.unmount();
	});
	test(`${surface}: a label is turned off and on, and one is found and added`, async ($, on) => {
		const w = world(on);
		await startSession($, on, surface);
		await $.command.run({
			...RUN,
			args: "rates"
		});
		await w.clock.settle();
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		await pane.press({ key: "edit" });
		await pane.press({ key: "label-MSC-bug" });
		expect((await pane.find({ key: "label-MSC-bug" }))?.props.dimColor).toBe(true);
		await pane.press({ key: "label-MSC-bug" });
		expect((await pane.find({ key: "label-MSC-bug" }))?.props.dimColor).toBeUndefined();
		await pane.press({ key: "label-MSC-bug" });
		await pane.input({
			key: "label-search-0",
			text: "area1",
			kind: "change"
		});
		expect(await pane.find({ key: "label-add-MSC-area1" })).toBeDefined();
		const offered = (await buttonKeys(pane)).filter((k) => k.startsWith("label-add-"));
		expect(offered).toHaveLength(6);
		await expectNative(pane);
		await pane.press({ key: "label-add-MSC-area12" });
		expect(await pane.find({ key: "label-add-MSC-area1" })).toBeUndefined();
		expect((await pane.find({ key: "label-search-1" }))?.props.value).toBe("");
		expect((await pane.find({ key: "label-MSC-area12" }))?.props.dimColor).toBeUndefined();
		await pane.input({
			key: "label-search-1",
			text: "area3",
			kind: "change"
		});
		await pane.input({
			key: "label-search-1",
			text: "area3",
			kind: "submit"
		});
		await pane.input({
			key: "label-search-2",
			text: "nothing like it",
			kind: "change"
		});
		expect(await pane.find({
			type: "Text",
			text: "No label matches"
		})).toBeDefined();
		await expectNative(pane);
		await pane.press({ key: "edit" });
		expect(await pane.find({
			type: "Text",
			text: "Area/area12"
		})).toBeDefined();
		expect(await pane.find({
			type: "Text",
			text: "Bug"
		})).toBeUndefined();
		await pane.press({ key: "create" });
		await w.clock.settle();
		expect(saved(w, "save_issue")?.labels).toEqual(["MSC-area12", "MSC-area3"]);
		await pane.unmount();
	});
	test(`${surface}: the drafting and failed states`, async ($, on) => {
		const w = world(on, [{
			name: "mcp__claude_ai_Linear__authenticate",
			description: "",
			mcp: true
		}]);
		await startSession($, on, surface);
		await $.command.run({
			...RUN,
			args: "rates"
		});
		const pane = await $.ui.mount({
			...PANE,
			surface
		});
		await expectNative(pane);
		expect(await pane.find({
			type: "Text",
			text: "Drafting the issue"
		})).toBeDefined();
		expect(await buttonKeys(pane)).toEqual(["discard"]);
		await w.clock.advance(11e3);
		await expectNative(pane);
		expect(await pane.find({
			type: "Text",
			text: /Linear draft failed/
		})).toBeDefined();
		expect(await buttonKeys(pane)).toEqual(["discard"]);
		await pane.unmount();
	});
}
test("mobile: the draft is shown as written, to create or discard", async ($, on) => {
	const w = world(on);
	await startSession($, on, "desktop");
	await $.command.run({
		...RUN,
		args: "rates"
	});
	await w.clock.settle();
	const pane = await $.ui.mount({
		...PANE,
		surface: "mobile"
	});
	await expectNative(pane);
	expect(await pane.find({ type: "Input" })).toBeUndefined();
	expect(await pane.find({ type: "Select" })).toBeUndefined();
	expect(await pane.find({ key: "edit" })).toBeUndefined();
	expect(await pane.find({
		type: "Text",
		text: "Cap get_rate outage latency"
	})).toBeDefined();
	expect(await pane.find({
		type: "Markdown",
		text: /blocks ~16.5 s/
	})).toBeDefined();
	await pane.press({ key: "create" });
	await w.clock.settle();
	expect(saved(w, "save_issue")).toMatchObject({
		team: "MSC",
		title: "Cap get_rate outage latency"
	});
	await pane.unmount();
});
