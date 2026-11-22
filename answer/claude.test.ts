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
const GRILLING = `The bar and the funnel are independent, so this round asks both.

**Q1. Should every focus default to the same bar?**

- **A.** Yes, one default for every kind.
- **B.** Default by kind.
- **C.** Add the bar as a second pick.

> **Recommended:** A. A per-kind table is one more thing to keep in sync.

---

**Q2. Lower the per-generator target to 5–6?**

> **Recommended:** Yes. Four generators still give 20–24.

---

**Q3. What should happen to \`--quick\`?**

- **A.** Drop it.
- **B.** Keep it as an alias.
  Scripts may still call it.`;
const LONG = `**Q1. Keep the journal?**

${Array.from({ length: 12 }, (_, n) => `Line ${n + 1} of what it hangs on.`).join("\n")}

- **A.** Keep it.
- **B.** Drop it.`;
const MINE = `2 findings from 4 runs, saved to \`~/notes/FINDINGS.md\`

1. The default bar cuts the ideas you act on · 2/3 · S · build
2. The funnel is wide and slow for what survives · 3/3 · M · /grill-me

**Top pick: 1.** Make "worth doing" the default bar.`;
const PLAIN = `Done. What changed:

1. The parser takes \`Q\` labels and numbers.
2. The review screen fills the prompt.

Tests pass.`;
const BAND = {
	plugin: "answer",
	component: "AbovePrompt",
	props: {
		hasSurvey: false,
		isCollapsed: false,
		isWorking: false,
		maxRows: 40,
		bodyColumns: 100,
		scroll: {
			offset: 0,
			bodyRows: 40
		},
		view: {}
	}
};
const RUN = {
	command: "answer",
	args: "",
	origin: { kind: "composer" },
	presentation: {
		isFullscreen: true,
		columns: 160
	}
};
/** Stands in for the engine: the prompt box and the band beneath. */
function world(on, draft = "") {
	const w = {
		box: draft,
		submitted: [],
		toasts: [],
		refuses: false,
		clock: mock.clock(on)
	};
	on("prompt.read", () => ({ value: {
		text: w.box,
		cursor: w.box.length
	} }));
	on("prompt.fill", (_, e) => {
		w.box = e.text;
		return { isFilled: true };
	});
	on("prompt.submit", (_, e) => {
		if (w.refuses) return { drop: "the engine refused the submit" };
		w.submitted.push(e.text);
		return { text: e.text };
	});
	on("turn.complete", () => ({ text: "" }));
	on("command.register", () => ({ value: { command: "answer" } }));
	on("session.start", (_, e) => ({ cwd: e.cwd }));
	on("ui.focus", () => ({}));
	on("ui.toast", (_$, e) => {
		w.toasts.push(e.text);
		return { value: void 0 };
	});
	on("ui.log", () => ({ value: void 0 }));
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return /* @__PURE__ */ h(Text, null, e.component === "AssistantMessage" ? e.props.text : "engine");
	});
	return w;
}
/** Where the form a band opens is drawn: only a graphical surface has one. */
const FORM = "desktop";
const start = ($, surface = "terminal") => $.session.start({
	cwd: "/",
	surface,
	isInteractive: true
});
const ends = ($, answer) => $.turn.complete({
	answer,
	reason: "answer",
	turnId: "t",
	durationMs: 1,
	isAborted: false
});
const band = ($, surface = "terminal") => $.ui.mount({
	...BAND,
	surface
});
/** A press on an answer: it answers and the form goes on. */
const pick = (_w, drawn, key) => drawn.press({ key });
/** The form's one row, while it is folded: its words, beside its button. */
const hint = async ($, surface = FORM) => {
	const drawn = await band($, surface);
	const found = await drawn.find({ key: "answer" }) ? await offerSays(drawn) : void 0;
	await drawn.unmount();
	return found;
};
/** The band with the form open in it, as `/answer` opens it. */
const form = async ($, surface = FORM) => {
	await $.command.run(RUN);
	return band($, surface);
};
test("Desktop restores the latest round in the transcript and keeps the submitted round visible", async ($, on) => {
	const w = world(on, "Already typed");
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: ["desktop"] }));
	messages = [{
		role: "assistant",
		text: GRILLING,
		toolUses: [],
		uuid: "bc4b6cdd-4ccd-4e7c-92b4-b208e879b0ed"
	}];
	await start($, "desktop");
	const cards = await $.ui.mount({
		plugin: "answer",
		surface: "desktop",
		component: "AssistantMessage",
		requestId: "block-of-the-assistant-message",
		props: {
			text: GRILLING,
			isFirstOfReply: true
		}
	});
	expect(await cards.find({
		type: "Text",
		text: /0\/3 answered/
	})).toBeDefined();
	expect(await hint($, "desktop")).toBeUndefined();
	await cards.press({ key: "question-0-choose-1" });
	expect(await cards.find({
		type: "Text",
		text: /1\/3 answered/
	})).toBeDefined();
	expect(await cards.find({
		type: "Text",
		text: /^Sent$/
	})).toBeUndefined();
	expect(await cards.find({ key: "question-1-card" })).toBeDefined();
	expect(await cards.find({ key: "review-answer-0" })).toBeUndefined();
	await cards.press({ key: "review" });
	expect(await cards.find({ key: "review-answer-0" })).toBeDefined();
	await cards.press({ key: "review-answer-0" });
	expect(await cards.find({ key: "question-1-card" })).toBeDefined();
	expect(await cards.find({ key: "review-answer-0" })).toBeUndefined();
	await cards.press({ key: "review" });
	w.refuses = true;
	await cards.press({ key: "send" });
	expect(await cards.find({
		type: "Text",
		text: /^Sent$/
	})).toBeUndefined();
	expect(await cards.find({ key: "send" })).toBeDefined();
	w.refuses = false;
	await cards.press({ key: "send" });
	expect(w.submitted).toEqual(["Q1: B"]);
	expect(w.box).toBe("Already typed");
	expect(await cards.find({
		type: "Text",
		text: /^Sent$/
	})).toBeDefined();
	expect(await cards.find({ key: "question-0-choose-1" })).toBeUndefined();
	expect(await cards.find({
		type: "Text",
		text: /1\/3 answered/
	})).toBeDefined();
	await cards.unmount();
});
const CLOSING = "Have we reached a shared understanding? Say so and I will write the plan.";
const WITH_CLOSING = `${GRILLING}\n\n---\n\n${CLOSING}`;
for (const surface of ["terminal", "desktop"]) test(`${surface}: what the message says after its last question is still drawn`, async ($, on) => {
	world(on);
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: [surface] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($, surface);
	messages = [{
		role: "assistant",
		text: WITH_CLOSING,
		toolUses: [],
		uuid: "closing-round"
	}];
	await ends($, WITH_CLOSING);
	const cards = await $.ui.mount({
		plugin: "answer",
		surface,
		component: "AssistantMessage",
		requestId: "closing-round",
		props: {
			text: WITH_CLOSING,
			isFirstOfReply: true
		}
	});
	expect(await cards.find({
		type: "Markdown",
		text: CLOSING
	})).toBeDefined();
	await cards.unmount();
});
const MENU = `Ways to close the gap:

1. **Accept it and label it:** the smallest change.
2. **Read the hourly report:** about an hour behind.
3. **Use the session logs:** real time.

I'd go with 1. Which do you want?`;
test("a list of alternatives is one card that fills the prompt with the number", async ($, on) => {
	const w = world(on);
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($);
	messages = [{
		role: "assistant",
		text: MENU,
		toolUses: [],
		uuid: "menu-round"
	}];
	await ends($, MENU);
	const cards = await $.ui.mount({
		plugin: "answer",
		surface: "terminal",
		component: "AssistantMessage",
		requestId: "menu-round",
		props: {
			text: MENU,
			isFirstOfReply: true
		}
	});
	expect(await cards.find({ key: "question-0-choose-1" })).toBeDefined();
	await cards.press({ key: "question-0-choose-1" });
	await cards.press({ key: "round-fill" });
	expect(w.box).toBe("2");
	await cards.unmount();
});
test("Terminal cards can match a transcript row when the engine omits its UUID", async ($, on) => {
	world(on);
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($);
	messages = [{
		role: "assistant",
		text: GRILLING,
		toolUses: []
	}];
	await ends($, GRILLING);
	const cards = await $.ui.mount({
		plugin: "answer",
		surface: "terminal",
		component: "AssistantMessage",
		requestId: "assistant-row",
		props: {
			text: GRILLING,
			isFirstOfReply: true
		}
	});
	const count = async () => (await cards.find({ key: "round-count" }))?.props.label;
	expect(await count()).toBe("0 of 3 answered");
	await cards.press({ key: "question-0-choose-1" });
	expect(await count()).toBe("1 of 3 answered");
	await cards.press({ key: "round-fill" });
	expect(await cards.find({
		type: "Text",
		text: /✓ Sent/
	})).toBeUndefined();
	await cards.press({ key: "question-0-choose-0" });
	await $.prompt.submit({
		text: "Q1: B",
		origin: { kind: "composer" },
		wait: false
	});
	expect(await cards.find({
		type: "Text",
		text: /✓ Sent/
	})).toBeDefined();
	expect(await cards.find({ key: "round-count" })).toBeUndefined();
	expect(await cards.find({ key: "round-fill" })).toBeUndefined();
	await cards.unmount();
});
test("a turn that ends on questions offers the form; the person's next send drops it", async ($, on) => {
	world(on);
	await ends($, GRILLING);
	expect(await hint($)).toContain("Answer 3 questions");
	await $.prompt.submit({
		text: "never mind",
		wait: false,
		origin: { kind: "composer" }
	});
	expect(await hint($)).toBeUndefined();
	await ends($, PLAIN);
	expect(await hint($)).toBeUndefined();
});
test("a background task's turn leaves the round and its answers alone", async ($, on) => {
	const w = world(on);
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.unmount();
	await $.command.run(RUN);
	await $.prompt.submit({
		text: "<task-notification>build finished</task-notification>",
		wait: false,
		isMeta: true,
		origin: { kind: "task-notification" }
	});
	await ends($, PLAIN);
	expect(await hint($)).toContain("1 of 3");
	await ends($, GRILLING);
	expect(await hint($)).toContain("1 of 3");
});
const row = (plugin) => ({
	plugin,
	tree: {
		type: "Text",
		props: {},
		children: [`${plugin}'s row`]
	}
});
const LIST = {
	plugin: "answer",
	component: "AbovePromptList",
	props: {
		...BAND.props,
		rows: [row("neighbour"), row("answer")]
	},
	surface: "terminal"
};
test("send on the review submits the reply as a message and drops the round, keeping the draft", async ($, on) => {
	const w = world(on, "and keep it short");
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.press({ key: "review" });
	await drawn.press({ key: "send" });
	await drawn.unmount();
	expect(w.submitted).toEqual(["Q1: B"]);
	expect(w.box).toBe("and keep it short");
	expect(await hint($)).toBeUndefined();
});
test("a pick list routes each item to its own next step", async ($, on) => {
	const w = world(on);
	await start($);
	await ends($, MINE);
	expect(await hint($)).toContain("Pick from 2 items");
	await $.command.run(RUN);
	const drawn = await $.ui.mount({
		...BAND,
		surface: "desktop"
	});
	await pick(w, drawn, "e0");
	await typeIn(drawn, "note", "");
	await pick(w, drawn, "e1");
	await typeIn(drawn, "note", "");
	await drawn.press({ key: "fill" });
	await drawn.unmount();
	expect(w.box).toBe("do 1\n2 → /grill-me");
});
test("a new round replaces the one before it, answers and all", async ($, on) => {
	const w = world(on);
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.unmount();
	await ends($, MINE);
	expect(await hint($)).toBe("Pick from 2 items");
});
test("a resumed session gets the round its last reply ended on, unless the person spoke after it", async ($, on) => {
	world(on);
	let said = [
		{
			role: "user",
			text: "grill me",
			toolUses: []
		},
		{
			role: "assistant",
			text: GRILLING,
			toolUses: []
		},
		{
			role: "user",
			text: "<command-name>/answer</command-name>",
			toolUses: []
		},
		{
			role: "user",
			text: "Another Claude session sent a message: <cross-session-message from=\"x\">Heads up.</cross-session-message>",
			toolUses: []
		},
		{
			role: "assistant",
			text: "Noted.",
			toolUses: []
		}
	];
	on("session.messages", () => ({ value: said }));
	const guide = async () => {
		const bar = await band($, "terminal");
		const found = await bar.find({ key: "round-current" });
		await bar.unmount();
		return found?.props.label;
	};
	await start($);
	expect(await guide()).toBe("Q1/3");
	await $.prompt.submit({
		text: "never mind",
		wait: false,
		origin: { kind: "composer" }
	});
	said = [...said, {
		role: "user",
		text: "never mind",
		toolUses: []
	}];
	await $.command.run(RUN);
	expect(await guide()).toBeUndefined();
});
test("a send sets an answered round aside, and /answer brings it back with its answers", async ($, on) => {
	const w = world(on);
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.unmount();
	await $.prompt.submit({
		text: "wait, one more thing",
		wait: false,
		origin: { kind: "composer" }
	});
	expect(await hint($)).toBeUndefined();
	expect(w.toasts).toHaveLength(1);
	expect(w.toasts[0]).toMatch(/^1 answer set aside/);
	const back = await form($);
	expect((await back.find({ key: "q0" }))?.props.label).toContain("✓");
	expect(await asking(back, /Should every focus default/)).toBeDefined();
	await back.unmount();
});
test("a send with nothing in it leaves the round where it is", async ($, on) => {
	world(on);
	await start($);
	await ends($, GRILLING);
	await $.prompt.submit({
		text: "   ",
		wait: false,
		origin: { kind: "composer" }
	});
	expect(await hint($)).toContain("Answer 3 questions");
});
test("sending the reply the form filled answers the round", async ($, on) => {
	const w = world(on, "and keep it short");
	await start($);
	await ends($, GRILLING);
	const drawn = await band($, FORM);
	await drawn.press({ key: "answer" });
	await pick(w, drawn, "e1");
	await drawn.press({ key: "review" });
	await drawn.press({ key: "fill" });
	expect(w.box).toBe("Q1: B\n\nand keep it short");
	await drawn.unmount();
	await $.prompt.submit({
		text: w.box,
		wait: false,
		origin: { kind: "composer" }
	});
	expect(w.toasts).toEqual([]);
	expect(await hint($)).toBeUndefined();
	await $.command.run(RUN);
	expect(await hint($)).toBeUndefined();
});
test("a command's send sets the round aside too, and the aside wins over the transcript", async ($, on) => {
	const w = world(on);
	let said = [{
		role: "user",
		text: "grill me",
		toolUses: []
	}, {
		role: "assistant",
		text: GRILLING,
		toolUses: []
	}];
	on("session.messages", () => ({ value: said }));
	await start($);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.unmount();
	await $.prompt.submit({
		text: "/help",
		wait: false,
		origin: { kind: "composer" }
	});
	said = [...said, {
		role: "user",
		text: "<command-name>/help</command-name>",
		toolUses: []
	}];
	const back = await form($);
	expect((await back.find({ key: "q0" }))?.props.label).toContain("✓");
	await back.unmount();
});
test("a send the engine refuses keeps the round and its answers", async ($, on) => {
	const w = world(on, "and keep it short");
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.press({ key: "review" });
	w.refuses = true;
	await drawn.press({ key: "send" });
	expect(w.submitted).toEqual([]);
	expect(w.box).toBe("and keep it short");
	expect(w.toasts).toHaveLength(1);
	expect(w.toasts[0]).toMatch(/didn't send/);
	await drawn.press({ key: "quit" });
	expect(await offerSays(drawn)).toContain("1 of 3");
	await drawn.unmount();
});
test("nothing runs or is read outside the session: the form needs no hub", async ($, on) => {
	const w = world(on);
	const reached = [];
	on("process.run", (_, e) => {
		reached.push(e.argv.join(" "));
		throw new Error("no process");
	});
	on("fs.stat", () => {
		reached.push("fs.stat");
		throw new Error("no file");
	});
	await start($);
	await ends($, GRILLING);
	const drawn = await form($);
	await pick(w, drawn, "e1");
	await drawn.unmount();
	await $.command.run(RUN);
	expect(await hint($)).toContain("1 of 3");
	expect(reached).toEqual([]);
});
/** The open field, a write-in or a note: each opening of one has a key of its own. */
const field = async (drawn, name) => (await drawn.findAll({ type: "Input" })).find((e) => e.key?.startsWith(`${name}-field-`));
/** Types into the open field, as `input` does into a keyed one. */
const typeIn = async (drawn, name, text, kind) => drawn.input({
	key: (await field(drawn, name))?.key ?? `${name}-field`,
	text,
	...kind ? { kind } : {}
});
/** The offer's words, which a graphical surface sets beside its button rather than in it. */
const offerSays = async (drawn) => (await drawn.findAll({ type: "Text" })).map((e) => e.text).find((t) => /^(Answer|Pick from) /.test(t));
/** What an action row may carry hotkeys on: nothing else on a graphical surface does. */
const ACTIONS = [
	"skip",
	"note",
	"accept",
	"next",
	"send"
];
/** The question shown: its title, as the form's markdown heading draws it. */
const asking = (drawn, title) => drawn.find({
	type: "Markdown",
	text: title
});
test("in the round editor a digit answers the shown card's row, as its letter does", async ($, on) => {
	const w = world(on);
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($);
	messages = [{
		role: "assistant",
		text: GRILLING,
		toolUses: []
	}];
	await ends($, GRILLING);
	const bar = await band($);
	expect((await bar.find({ key: "round-key-1" }))?.props.hotkey).toBe("1");
	expect((await bar.find({ key: "round-key-3" }))?.props.hotkey).toBe("3");
	await bar.press({ key: "round-key-2" });
	await bar.unmount();
	const cards = await $.ui.mount({
		plugin: "answer",
		surface: "terminal",
		component: "AssistantMessage",
		requestId: "assistant-row",
		props: {
			text: GRILLING,
			isFirstOfReply: true
		}
	});
	expect((await cards.find({ key: "round-count" }))?.props.label).toBe("1 of 3 answered");
	await cards.press({ key: "round-fill" });
	expect(w.box).toBe("Q1: B");
	await cards.unmount();
});
test("the closing row's count goes back to the first question and scrolls to the round's top", async ($, on) => {
	world(on);
	let messages = [];
	on("session.messages", () => ({ value: messages }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($);
	messages = [{
		role: "assistant",
		text: GRILLING,
		toolUses: []
	}];
	await ends($, GRILLING);
	const bar = await band($);
	await bar.press({ key: "round-key-r" });
	expect((await bar.find({ key: "round-current" }))?.props.label).toBe("Review  0/3 answered");
	await bar.unmount();
	const cards = await $.ui.mount({
		plugin: "answer",
		surface: "terminal",
		component: "AssistantMessage",
		requestId: "assistant-row",
		props: {
			text: GRILLING,
			isFirstOfReply: true
		}
	});
	await cards.press({ key: "round-count" });
	const again = await band($);
	expect(await again.find({ key: "round-current" })).toBeDefined();
	expect((await again.find({ key: "round-current" }))?.props.label).toBe("Q1/3");
	await again.unmount();
	await cards.unmount();
});
/** A terminal session whose transcript holds `text`, as the last reply; its round's cards. */
async function terminalRound($, on, text) {
	on("session.messages", () => ({ value: [{
		role: "assistant",
		text,
		toolUses: []
	}] }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.place", () => ({ value: {
		isPlaced: false,
		reason: "no surface in the test"
	} }));
	await start($);
	await ends($, text);
	return $.ui.mount({
		plugin: "answer",
		surface: "terminal",
		component: "AssistantMessage",
		requestId: "assistant-row",
		props: {
			text,
			isFirstOfReply: true
		}
	});
}
test("a pick list is cards on a terminal: each row lettered, the write-in last", async ($, on) => {
	const w = world(on);
	const cards = await terminalRound($, on, MINE);
	expect((await cards.find({ key: "question-0-choose-0" }))?.props.label).toMatch(/^\s*A ○ Build it/);
	expect((await cards.find({ key: "question-0-write" }))?.props.label).toMatch(/^\s*B ○ Something else/);
	expect((await cards.find({ key: "question-1-choose-1" }))?.props.label).toMatch(/^\s*B ○ Route to \/grill-me/);
	await cards.press({ key: "question-0-choose-0" });
	await cards.press({ key: "question-1-choose-1" });
	await cards.press({ key: "round-fill" });
	expect(w.box).toBe("do 1\n2 → /grill-me");
	const bar = await band($);
	await bar.press({ key: "round-key-a" });
	await bar.unmount();
	expect((await cards.find({ key: "question-1-choose-0" }))?.props.label).toMatch(/^\s*A ● Build it/);
	await cards.unmount();
});
test("on a terminal the band is the cards' key guide, never a form", async ($, on) => {
	const w = world(on);
	await (await terminalRound($, on, GRILLING)).unmount();
	const guide = await $.ui.mount({
		...BAND,
		surface: "terminal",
		viewport: {
			columns: 100,
			rows: 40,
			isFullscreen: true
		}
	});
	expect((await guide.find({ key: "round-current" }))?.props.label).toBe("Q1/3");
	expect(await guide.find({ key: "answer" })).toBeUndefined();
	await guide.unmount();
	const run = $.command.run(RUN);
	await w.clock.advance(100);
	await run;
	const bar = await band($);
	expect(await bar.find({ key: "round-current" })).toBeDefined();
	expect(await bar.find({ key: "e0" })).toBeUndefined();
	await bar.unmount();
});
test("while the band writes a note it has the band to itself", async ($, on) => {
	world(on);
	let stacked;
	on("ui.render", {
		component: "AbovePromptList",
		plugin: "*"
	}, (_, e, next) => {
		if (!stacked) return next(e);
		stacked = e.props.rows.map((r) => r.plugin);
		return {
			type: "Box",
			props: {},
			children: []
		};
	});
	await (await terminalRound($, on, GRILLING)).unmount();
	const bar = await band($);
	await bar.press({ key: "round-key-n" });
	await bar.unmount();
	stacked = [];
	await (await $.ui.mount(LIST)).unmount();
	expect(stacked).toEqual(["answer"]);
});
for (const surface of ["desktop", "vscode"]) {
	test(`${surface}: the offer is a status band whose button opens the form`, async ($, on) => {
		world(on);
		await start($, surface);
		await ends($, GRILLING);
		const offer = await band($, surface);
		expect(await offerSays(offer)).toBe("Answer 3 questions");
		expect((await offer.find({ key: "answer" }))?.props.label).toBe("Answer");
		await expectNative(offer);
		await offer.press({ key: "answer" });
		expect(await asking(offer, /Should every focus default/)).toBeDefined();
		await offer.unmount();
	});
	test(`${surface}: each answer is a row led by its letter; the one chosen opens with its note and the way on`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, GRILLING);
		const drawn = await form($, surface);
		expect(await asking(drawn, /Should every focus default/)).toBeDefined();
		for (const [key, letter, words] of [
			[
				"e0",
				"A",
				"Yes, one default for every kind."
			],
			[
				"e1",
				"B",
				"Default by kind."
			],
			[
				"e2",
				"C",
				"Add the bar as a second pick."
			]
		]) {
			expect((await drawn.find({
				type: "Button",
				key
			}))?.props.label).toBe(letter);
			expect(await drawn.find({
				type: "Text",
				text: words
			})).toBeDefined();
		}
		expect(await drawn.find({
			type: "Text",
			text: /^Recommended$/
		})).toBeDefined();
		expect(await drawn.find({
			type: "Text",
			text: /^Recommended: A\. A per-kind table/
		})).toBeDefined();
		expect(await field(drawn, "write")).toBeDefined();
		expect(await drawn.find({
			type: "Button",
			key: "e3"
		})).toBeUndefined();
		for (const key of [
			"q0",
			"q1",
			"q2",
			"review"
		]) expect(await drawn.find({
			type: "Button",
			key
		})).toBeDefined();
		expect((await drawn.find({ key: "q0" }))?.props.variant).toBe("primary");
		expect((await drawn.find({ key: "q1" }))?.props.dimColor).toBe(true);
		expect((await drawn.find({ key: "quit" }))?.props.label).toBe("Close");
		expect(await drawn.find({ key: "next" })).toBeUndefined();
		expect(await drawn.find({ key: "accept" })).toBeUndefined();
		expect(await field(drawn, "note")).toBeUndefined();
		await expectNative(drawn, { hotkeys: ACTIONS });
		await pick(w, drawn, "e1");
		expect((await drawn.find({ key: "e1" }))?.props.variant).toBe("primary");
		expect((await drawn.find({ key: "e0" }))?.props.variant).not.toBe("primary");
		expect(await drawn.find({
			type: "Markdown",
			text: "**Default by kind.**"
		})).toBeDefined();
		expect(await field(drawn, "note")).toBeDefined();
		expect((await drawn.find({ key: "next" }))?.props.label).toBe("Next");
		expect((await drawn.find({ key: "next" }))?.props.variant).toBe("primary");
		expect((await drawn.find({ key: "q0" }))?.props.label).toBe("✓ Q1");
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.unmount();
	});
	test(`${surface}: a press on an answer, next, the yes and the review fill the prompt`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, GRILLING);
		const drawn = await form($, surface);
		await pick(w, drawn, "e1");
		await drawn.press({ key: "next" });
		expect(await asking(drawn, /Lower the per-generator/)).toBeDefined();
		expect((await drawn.find({ key: "e0" }))?.props.label).toBe("Yes");
		expect(await drawn.find({
			type: "Text",
			text: "Four generators still give 20–24."
		})).toBeDefined();
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.press({ key: "e0" });
		await drawn.press({ key: "next" });
		expect(await asking(drawn, /What should happen to/)).toBeDefined();
		await drawn.press({ key: "review" });
		expect(await drawn.find({
			type: "Text",
			text: /^Not answered$/
		})).toBeDefined();
		expect(await drawn.find({
			type: "Text",
			text: /^B: Default by kind\.$/
		})).toBeDefined();
		expect((await drawn.find({ key: "item2" }))?.props.label).toBe("Answer");
		expect((await drawn.find({ key: "item0" }))?.props.label).toBe("Change");
		expect((await drawn.find({ key: "send" }))?.props.variant).toBe("primary");
		expect((await drawn.find({ key: "fill" }))?.props.variant).toBeUndefined();
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.press({ key: "fill" });
		await drawn.unmount();
		expect(w.box).toBe("Q1: B\nQ2: yes");
	});
	test(`${surface}: a negative recommendation keeps its answer when filled`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, "**Q1. Show a separate card?**\n\n> **Recommended:** No. A plain reply is enough.");
		const drawn = await form($, surface);
		expect((await drawn.find({
			type: "Button",
			key: "e0"
		}))?.props.label).toBe("No");
		expect(await drawn.find({
			type: "Text",
			text: "A plain reply is enough."
		})).toBeDefined();
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.press({ key: "e0" });
		await drawn.press({ key: "review" });
		expect(await drawn.find({
			type: "Text",
			text: "No. A plain reply is enough."
		})).toBeDefined();
		await drawn.press({ key: "fill" });
		await drawn.unmount();
		expect(w.box).toBe("Q1: No. A plain reply is enough.");
	});
	test(`${surface}: the tabs, skip, the note and the review's rows are clicks too`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, GRILLING);
		const drawn = await form($, surface);
		await drawn.press({ key: "note" });
		expect(await field(drawn, "note")).toBeDefined();
		await drawn.press({ key: "q2" });
		expect(await asking(drawn, /What should happen to/)).toBeDefined();
		await drawn.press({ key: "q1" });
		expect(await asking(drawn, /Lower the per-generator/)).toBeDefined();
		await drawn.press({ key: "skip" });
		expect(await asking(drawn, /What should happen to/)).toBeDefined();
		await drawn.press({ key: "e0" });
		await drawn.press({ key: "e1" });
		expect((await drawn.find({ key: "e0" }))?.props.variant).not.toBe("primary");
		expect((await drawn.find({ key: "e1" }))?.props.variant).toBe("primary");
		expect((await drawn.find({ key: "next" }))?.props.variant).toBe("primary");
		await expectNative(drawn, { hotkeys: ACTIONS });
		await typeIn(drawn, "note", "use B", "change");
		await drawn.press({ key: "review" });
		expect(await drawn.find({
			type: "Text",
			text: /^B: /
		})).toBeDefined();
		expect(await drawn.find({
			type: "Text",
			text: "Note: use B"
		})).toBeDefined();
		await drawn.press({ key: "item0" });
		expect(await asking(drawn, /Should every focus default/)).toBeDefined();
		await drawn.press({ key: "review" });
		await drawn.press({ key: "send" });
		await drawn.unmount();
		expect(w.submitted).toHaveLength(1);
		expect(w.submitted[0]).toContain("Q3: B");
	});
	test(`${surface}: the write-in is a field always there; Enter keeps it and goes on`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, GRILLING);
		const drawn = await form($, surface);
		await typeIn(drawn, "write", "A per-kind table, but generated.");
		expect(await asking(drawn, /Lower the per-generator/)).toBeDefined();
		await drawn.press({ key: "q0" });
		expect((await field(drawn, "write"))?.props.value).toBe("A per-kind table, but generated.");
		expect((await drawn.find({ key: "next" }))?.props.variant).toBe("primary");
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.press({ key: "review" });
		await drawn.press({ key: "fill" });
		await drawn.unmount();
		expect(w.box).toBe("Q1: A per-kind table, but generated.");
	});
	test(`${surface}: the review's send submits the reply, and the way out folds the form`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, GRILLING);
		const drawn = await form($, surface);
		await pick(w, drawn, "e1");
		await drawn.press({ key: "review" });
		await drawn.press({ key: "send" });
		await drawn.unmount();
		expect(w.submitted).toEqual(["Q1: B"]);
		await ends($, GRILLING);
		const again = await form($, surface);
		await again.press({ key: "quit" });
		expect(await offerSays(again)).toBe("Answer 3 questions");
		await expectNative(again);
		await again.unmount();
	});
	test(`${surface}: an option of any length is one row, whole once chosen`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		const words = "an option that runs on well past what one button holds";
		await ends($, `**Q1. Which one?**\n\n- **A.** ${words}\n- **B.** Short`);
		const drawn = await form($, surface);
		expect((await drawn.find({ key: "e0" }))?.props.label).toBe("A");
		expect((await drawn.find({
			type: "Text",
			text: words
		}))?.props.wrap).toBe("truncate-end");
		expect((await drawn.find({ key: "e1" }))?.props.label).toBe("B");
		await expectNative(drawn, { hotkeys: ACTIONS });
		await pick(w, drawn, "e0");
		expect((await drawn.find({ key: "e0" }))?.props.variant).toBe("primary");
		expect(await drawn.find({
			type: "Markdown",
			text: words
		})).toBeDefined();
		expect((await drawn.find({ key: "next" }))?.props.label).toBe("Review");
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.unmount();
	});
	test(`${surface}: a recommendation of several options is one press`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, "**Q1. Which checks should run?**\n\n- **A.** lint\n- **B.** types\n- **C.** tests\n\n> **Recommended:** A, B and C.");
		const drawn = await form($, surface);
		expect((await drawn.find({ key: "accept" }))?.props.label).toBe("Take A, B, C");
		await drawn.press({ key: "accept" });
		expect(await drawn.find({
			type: "Text",
			text: "A, B, C: lint; types; tests"
		})).toBeDefined();
		await expectNative(drawn, { hotkeys: ACTIONS });
		await drawn.press({ key: "fill" });
		await drawn.unmount();
		expect(w.box).toBe("yes");
	});
	test(`${surface}: a pick list and a long body keep every entry, the whole body and the style`, async ($, on) => {
		const w = world(on);
		await start($, surface);
		await ends($, MINE);
		expect(await offerSays(await band($, surface))).toBe("Pick from 2 items");
		const list = await form($, surface);
		expect((await list.find({ key: "e0" }))?.props.label).toBe("Build it");
		await expectNative(list, { hotkeys: ACTIONS });
		await pick(w, list, "e0");
		await list.press({ key: "review" });
		await expectNative(list, { hotkeys: ACTIONS });
		await list.unmount();
		await ends($, `${LONG}\n  It is cheap to keep.`);
		await $.command.run(RUN);
		const long = await $.ui.mount({
			...BAND,
			props: {
				...BAND.props,
				maxRows: 16
			},
			surface
		});
		expect((await long.find({
			type: "Text",
			text: /^Line 1 of what it hangs on\. Line 2/
		}))?.props.wrap).toBe("truncate-end");
		expect((await long.find({ key: "more" }))?.props.label).toBe("More");
		await expectNative(long, { hotkeys: ACTIONS });
		await long.press({ key: "more" });
		expect(await long.find({
			type: "Markdown",
			text: /Line 12 of what it hangs on/
		})).toBeDefined();
		expect((await long.find({ key: "more" }))?.props.label).toBe("Less");
		expect((await long.find({ key: "e1" }))?.props.label).toBe("B");
		expect(await long.find({
			type: "Text",
			text: /^It is cheap to keep\.$/
		})).toBeDefined();
		await expectNative(long, { hotkeys: ACTIONS });
		await long.unmount();
	});
}
