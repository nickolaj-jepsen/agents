import { expect, mock, test } from "claude-code/testing";
import { b as tokens, r as paintLines, s as notice } from "./claude-B3pwfCuK.js";

// ../../lib/kits/core/src/paint/checks.tsx
/**
* The house style's graphical rules as test assertions, for a mod's `claude plugin test`: a mod's
* test imports it from `@agents/kit-core/paint/checks.tsx` and the build bundles it. A `.tsx` file
* so the package's `tsc -b`, which has no Claude types, leaves it out.
*/
/** The glyphs a graphical surface draws no controls with. */
const GLYPHS = /[□■☐☑○●✎▸▾❯↑↓╰│]/;
/**
* What a mounted tree shows, one string per element that shows text. A `Markdown`'s text is
* source the host draws (its table rules and code fences are not painted), so it is cut out of
* the elements that hold it too, a Box's text being its children's.
*/
async function shown(ui) {
	const all = await ui.findAll({});
	const sources = all.filter((e) => e.type === "Markdown" && e.text).map((e) => e.text);
	return all.filter((e) => e.type !== "Markdown").map((e) => sources.reduce((text, source) => text.replaceAll(source, ""), e.text ?? "")).filter(Boolean);
}
/**
* A tree drawn for a graphical surface keeps the style's rules (`style.md`, "Graphical
* surfaces"): no rule of repeated characters, no glyph standing in for a control, no text cut
* by the mod, no key hints, no hotkey but on an action row, and nothing sized to the viewport:
* no frame drawn in a colour, no width but a side rule's fraction of a cell or a message's
* reading measure (`tokens.prose`), no height but an icon's line, and only the surface cuts a
* line.
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
			if (e.props.width !== void 0 && e.props.width !== tokens.prose) expect(e.props.width).toBeLessThan(1);
			if (e.props.height !== void 0) expect(e.props.height).toBe(1);
		}
		if (e.type === "Text") expect([void 0, "truncate-end"]).toContain(e.props.wrap);
	}
}

// src/claude.test.tsx
const BAND = {
	plugin: "spellfix",
	component: "AbovePrompt",
	props: {
		hasSurvey: false,
		isCollapsed: false,
		isWorking: false,
		maxRows: 10,
		bodyColumns: 120,
		scroll: {
			offset: 0,
			bodyRows: 10
		},
		view: {}
	}
};
const OPTIONS = { options: { personalDictionary: "/personal.dic" } };
const usage = {
	input_tokens: 0,
	output_tokens: 0,
	cache_read_input_tokens: 0,
	cache_creation_input_tokens: 0
};
const DICT = {
	teh: ["the", "tech"],
	qiuck: ["quick", "quack"],
	recieve: ["receive"],
	Jepsen: ["Jensen"],
	claude: ["clause"]
};
/** Haiku's batch reply: each marked word fixed to hunspell's first suggestion, unless `say` has its own line. */
function haikuSays(say = {}, extras = "") {
	return (prompt) => [...prompt.matchAll(/⟦(.+?)⟧/g)].map(([, w = ""]) => say[w] ?? `<word text="${w}" verdict="fix">${DICT[w]?.[0]}</word>`).join("\n") + extras;
}
const personal = (w) => new Set((w.files.get("/personal.dic") ?? "").split("\n").filter(Boolean));
/** Stands in for the engine: the prompt box, files, hunspell (with its personal dictionary), Haiku and the band. */
function world(on, haiku = haikuSays()) {
	const w = {
		clock: mock.clock(on),
		box: {
			text: "",
			cursor: 0
		},
		files: /* @__PURE__ */ new Map()
	};
	const known = (word) => !(word in DICT) || personal(w).has(word);
	on("prompt.read", () => ({ value: w.box }));
	on("prompt.fill", (_, e) => {
		w.box = {
			text: e.text,
			cursor: e.cursor ?? e.text.length
		};
		return { isFilled: true };
	});
	on("prompt.edit", (_, e) => {
		return {
			text: `${e.text.slice(0, e.start)}${e.inputText}${e.text.slice(e.end)}`,
			cursor: e.start + e.inputText.length
		};
	});
	on("prompt.change", (_, e) => ({ text: e.text }));
	on("fs.read", (_, e) => {
		const text = w.files.get(e.path);
		if (text === void 0) throw new Error(`ENOENT: ${e.path}`);
		return { value: text };
	});
	on("fs.exists", (_, e) => ({ value: w.files.has(e.path) }));
	on("fs.write", (_, e) => {
		w.files.set(e.path, e.text);
		return { value: void 0 };
	});
	on("process.run", (_, e) => {
		const lines = (e.init?.stdin ?? "").split("\n").filter(Boolean);
		let stdout = "";
		if (e.argv[1] === "-l") stdout = lines.filter((word) => !known(word)).join("\n");
		else for (const line of lines) {
			if (line.startsWith("*")) w.files.set("/personal.dic", `${w.files.get("/personal.dic") ?? ""}${line.slice(1)}\n`);
			if (line.startsWith("^") && !known(line.slice(1))) stdout += `& ${line.slice(1)} 2 0: ${DICT[line.slice(1)]?.join(", ")}\n`;
		}
		return { value: {
			exitCode: 0,
			stdout,
			stderr: "",
			isStdoutTruncated: false,
			isStderrTruncated: false
		} };
	});
	on("model.complete", async (_, e) => ({ value: {
		isAnswered: true,
		text: await haiku(e.prompt),
		usage
	} }));
	on("ui.toast", () => ({ value: void 0 }));
	on("ui.render", ($, e) => paintLines($.ui.resolve(e), notice({
		text: "engine",
		width: 80,
		status: "text"
	})));
	return w;
}
function edit($, e) {
	return $.prompt.edit({
		origin: { kind: "composer" },
		...e
	});
}
/** Pastes `text` as the whole draft, the cursor left at `cursor` (its end by default). */
async function paste($, w, text, cursor = text.length) {
	await edit($, {
		text: "",
		cursor: 0,
		start: 0,
		end: 0,
		inputText: text
	});
	w.box = {
		text,
		cursor
	};
	await w.clock.advance(1e3);
}
/** Types one key at the cursor, as the person does. */
async function key($, w, k) {
	const { text, cursor } = w.box;
	w.box = await edit($, {
		key: { key: k },
		text,
		cursor,
		start: cursor,
		end: cursor,
		inputText: k
	});
	await w.clock.settle();
}
async function openPicker($, w, surface = "terminal") {
	const band = await $.ui.mount({
		...BAND,
		surface
	});
	await band.press({ key: await band.find({ key: "spellfix" }) ? "spellfix" : "kit-action" });
	await w.clock.settle();
	return band;
}
/** The misspelling count the band shows, or "" while it shows none. */
async function shownCount(band) {
	for (const e of await band.findAll({})) if (e.type === "Button" || e.type === "Text") {
		const n = /\d+ misspelled/.exec(e.text ?? "")?.[0];
		if (n) return n;
	}
	return "";
}
for (const surface of [
	"terminal",
	"desktop",
	"vscode"
]) test(`the band counts misspellings and shows none without them (${surface})`, async ($, on) => {
	const w = world(on);
	await paste($, w, "the quick fox");
	const clean = await $.ui.mount({
		...BAND,
		surface
	});
	expect(await shownCount(clean)).toBe("");
	await clean.unmount();
	await paste($, w, "teh qiuck fox");
	const band = await $.ui.mount({
		...BAND,
		surface
	});
	expect(await shownCount(band)).toBe("2 misspelled");
	await band.unmount();
});
test("code, paths, flags and the word still being typed are not counted", async ($, on) => {
	const w = world(on);
	await paste($, w, "`teh` /teh --teh @teh teh_x teh.ts teh2 tehQ recieve");
	const band = await $.ui.mount({
		...BAND,
		surface: "terminal"
	});
	expect(await shownCount(band)).toBe("");
	await paste($, w, "recieve it");
	expect(await shownCount(band)).toBe("1 misspelled");
	await band.unmount();
});
test("a picked suggestion replaces the word under the cursor and keeps the cursor in place", async ($, on) => {
	const w = world(on);
	await paste($, w, "the qiuck fox and teh dog", 6);
	const band = await openPicker($, w);
	expect(await band.find({
		type: "Text",
		text: /qiuck/
	})).toBeDefined();
	await key($, w, "2");
	expect(w.box).toEqual({
		text: "the quick fox and teh dog",
		cursor: 6
	});
	await key($, w, "1");
	expect(w.box).toEqual({
		text: "the quick fox and the dog",
		cursor: 6
	});
	expect(await band.find({ key: "ai" })).toBeUndefined();
	await band.unmount();
});
test("the terminal's keys sit on buttons that draw nothing, and the action key stays mounted", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await $.ui.mount({
		...BAND,
		surface: "terminal"
	});
	const action = await band.find({ key: "kit-action" });
	expect(action?.props.action).toBe("app:toggleDiffNoiseFilter");
	expect(await band.find({ key: "kit-key-1" })).toBeUndefined();
	await band.press({ key: "spellfix" });
	await w.clock.settle();
	for (const k of [
		"1",
		"2",
		"3",
		"s",
		"a"
	]) expect((await band.find({ key: `kit-key-${k}` }))?.props.hotkey).toBe(k);
	expect(await band.find({ key: "kit-key-d" })).toBeUndefined();
	expect(await band.find({ key: "kit-key-8" })).toBeUndefined();
	await band.unmount();
});
test("pressing 1 before Haiku answers applies its word once it lands", async ($, on) => {
	let clock;
	const w = world(on, async (prompt) => {
		await clock?.sleep(500);
		return haikuSays()(prompt);
	});
	clock = w.clock;
	await paste($, w, "a qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "1");
	expect(w.box.text).toBe("a qiuck fox");
	expect((await band.find({ key: "ai" }))?.text).toContain("waiting");
	await w.clock.advance(600);
	expect(w.box.text).toBe("a quick fox");
	await band.unmount();
});
test("one Haiku answer covers every word, so the next word's is there at once", async ($, on) => {
	let clock;
	const w = world(on, async (prompt) => {
		await clock?.sleep(500);
		return haikuSays()(prompt);
	});
	clock = w.clock;
	await paste($, w, "teh qiuck fox", 0);
	const band = await openPicker($, w);
	await w.clock.advance(600);
	expect((await band.find({ key: "ai" }))?.text).toContain("the");
	await key($, w, "1");
	expect((await band.find({ key: "ai" }))?.text).toContain("quick");
	expect(await band.find({
		type: "Text",
		text: /qiuck → quick/
	})).toBeDefined();
	await band.unmount();
});
test("skip moves to the next word and keeps skipped words out of the count", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await openPicker($, w);
	expect(await band.find({
		type: "Text",
		text: /qiuck/
	})).toBeDefined();
	await key($, w, "s");
	expect(await band.find({
		type: "Text",
		text: /teh/
	})).toBeDefined();
	await key($, w, "s");
	await w.clock.advance(1e3);
	expect(w.box.text).toBe("teh qiuck fox");
	expect(await shownCount(band)).toBe("");
	await band.unmount();
});
test("any other key closes the picker and is typed", async ($, on) => {
	const w = world(on);
	await paste($, w, "a qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "x");
	expect(w.box.text).toBe("a qiuck foxx");
	expect(await band.find({ key: "ai" })).toBeUndefined();
	await band.unmount();
});
test("add to dictionary keeps the word from being flagged again", OPTIONS, async ($, on) => {
	const w = world(on, haikuSays({ qiuck: `<word text="qiuck" verdict="unsure"/>` }));
	await paste($, w, "a qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "d");
	expect(personal(w).has("qiuck")).toBe(true);
	expect(w.box.text).toBe("a qiuck fox");
	await paste($, w, "one more qiuck here");
	expect(await shownCount(band)).toBe("");
	await band.unmount();
});
test("words Haiku calls correct are added to the dictionary and skipped, and 8 takes them back", OPTIONS, async ($, on) => {
	const w = world(on, haikuSays({ Jepsen: `<word text="Jepsen" verdict="correct"/>` }));
	await paste($, w, "ask Jepsen about teh fox", 0);
	const band = await openPicker($, w);
	expect(personal(w).has("Jepsen")).toBe(true);
	expect(await band.find({
		type: "Text",
		text: /teh/
	})).toBeDefined();
	expect(await band.find({
		type: "Text",
		text: /Added Jepsen to the dictionary/
	})).toBeDefined();
	await key($, w, "8");
	expect(personal(w).has("Jepsen")).toBe(false);
	expect(w.box.text).toBe("ask Jepsen about teh fox");
	expect(await band.find({
		type: "Text",
		text: /Jepsen/
	})).toBeDefined();
	await band.unmount();
});
test("a lowercase word Haiku calls correct whose capitalised form passes is fixed, not added", OPTIONS, async ($, on) => {
	const w = world(on, haikuSays({ claude: `<word text="claude" verdict="correct"/>` }));
	await paste($, w, "ask claude about it");
	const band = await openPicker($, w);
	expect(personal(w).has("claude")).toBe(false);
	expect((await band.find({ key: "ai" }))?.text).toContain("Claude");
	await key($, w, "1");
	expect(w.box.text).toBe("ask Claude about it");
	await band.unmount();
});
test("ctrl+q with nothing flagged offers the typos Haiku finds, and fix all applies them", async ($, on) => {
	const w = world(on, haikuSays({}, `<extra word="form" nth="2">from</extra>`));
	await paste($, w, "a form sent form home");
	const band = await openPicker($, w);
	expect(await band.find({
		type: "Text",
		text: /^form$/
	})).toBeDefined();
	expect((await band.find({ key: "ai" }))?.text).toContain("from");
	await key($, w, "a");
	expect(w.box.text).toBe("a form sent from home");
	expect(await band.find({
		type: "Text",
		text: /form → from/
	})).toBeDefined();
	await key($, w, "8");
	expect(w.box.text).toBe("a form sent form home");
	expect(await band.find({ key: "undo" })).toBeUndefined();
	await band.unmount();
});
test("typing after fix all just types, and drops the undo", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "a");
	await key($, w, "u");
	expect(w.box.text).toBe("the quick foxu");
	expect(await band.find({ key: "undo" })).toBeUndefined();
	await band.unmount();
});
test("the band's undo button takes back fix all", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "a");
	await band.press({ key: "undo" });
	await w.clock.settle();
	expect(w.box.text).toBe("teh qiuck fox");
	await band.unmount();
});
test("9 dismisses the fix-all report and keeps the fix", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "a");
	await key($, w, "9");
	expect(w.box.text).toBe("the quick fox");
	expect(await band.find({ key: "undo" })).toBeUndefined();
	await band.unmount();
});
test("an unmarked typo Haiku answers as a verdict is still offered", async ($, on) => {
	const w = world(on, () => `<word text="consice" verdict="fix">concise</word>`);
	await paste($, w, "dense/consice text");
	const band = await openPicker($, w);
	await key($, w, "a");
	expect(w.box.text).toBe("dense/concise text");
	await band.unmount();
});
test("fix all applies every word's answer at once", async ($, on) => {
	const w = world(on);
	await paste($, w, "teh qiuck fox");
	const band = await openPicker($, w);
	await key($, w, "a");
	expect(w.box.text).toBe("the quick fox");
	expect(await band.find({
		type: "Text",
		text: /teh → the, qiuck → quick/
	})).toBeDefined();
	await band.unmount();
});
test("Haiku's typos in words hunspell skips are offered, but never in code, URLs or commands", async ($, on) => {
	const w = world(on, haikuSays({}, [
		`<extra word="consice" nth="1">concise</extra>`,
		`<extra word="consice" nth="2">concise</extra>`,
		`<extra word="consice" nth="3">concise</extra>`,
		`<extra word="consice" nth="4">concise</extra>`
	].join("\n")));
	await paste($, w, "dense/consice text, `consice` https://x.io/consice /consice");
	const band = await openPicker($, w);
	expect(await band.find({
		type: "Text",
		text: /^consice$/
	})).toBeDefined();
	await key($, w, "a");
	expect(w.box.text).toBe("dense/concise text, `consice` https://x.io/consice /consice");
	await band.unmount();
});
for (const surface of ["desktop", "vscode"]) {
	const mount = ($) => $.ui.mount({
		...BAND,
		surface
	});
	test(`${surface}: the count is a status line with one quiet button`, async ($, on) => {
		await paste($, world(on), "teh qiuck fox");
		const band = await mount($);
		expect(await band.find({
			type: "Text",
			text: /^2 misspelled$/
		})).toBeDefined();
		const open = await band.find({
			type: "Button",
			key: "spellfix"
		});
		expect(open?.text).toBe("Review");
		expect(open?.props.dimColor).toBe(true);
		expect(open?.props.hotkey).toBeUndefined();
		await expectNative(band);
		await band.unmount();
	});
	test(`${surface}: with nothing flagged the band draws nothing`, async ($, on) => {
		await paste($, world(on, haikuSays({}, `<extra word="form" nth="1">from</extra>`)), "a form sent home");
		const band = await mount($);
		expect(await band.find({
			type: "Text",
			text: /misspell/i
		})).toBeUndefined();
		expect(await band.find({ type: "Button" })).toBeUndefined();
		await band.unmount();
	});
	test(`${surface}: the picker shows the word in its context and a button per suggestion`, async ($, on) => {
		const w = world(on);
		await paste($, w, "the qiuck fox and teh dog", 6);
		const band = await openPicker($, w, surface);
		const word = await band.find({
			type: "Text",
			text: /^qiuck$/
		});
		expect(word?.props.weight).toBe("bold");
		expect(await band.find({
			type: "Text",
			text: /^the $/
		})).toBeDefined();
		expect(await band.find({
			type: "Text",
			text: /^ fox and teh dog$/
		})).toBeDefined();
		expect((await band.find({ key: "ai" }))?.text).toBe("quick");
		expect(await band.find({
			type: "Text",
			text: /^Haiku$/
		})).toBeDefined();
		expect((await band.find({ key: "s0" }))?.text).toBe("quick");
		expect((await band.find({ key: "s1" }))?.text).toBe("quack");
		expect((await band.find({ key: "spellfix" }))?.text).toBe("Close");
		for (const key of [
			"ai",
			"s0",
			"s1"
		]) expect((await band.find({
			type: "Button",
			key
		}))?.props.dimColor).toBe(true);
		for (const key of ["skip", "all"]) expect(await band.find({
			type: "Button",
			key
		})).toBeDefined();
		expect(await band.find({ key: "add" })).toBeUndefined();
		await expectNative(band);
		await band.press({ key: "s1" });
		await w.clock.settle();
		expect(w.box.text).toBe("the quack fox and teh dog");
		expect(await band.find({
			type: "Text",
			text: /^teh$/
		})).toBeDefined();
		await band.press({ key: "ai" });
		await w.clock.settle();
		expect(w.box.text).toBe("the quack fox and the dog");
		await band.unmount();
	});
	test(`${surface}: a press fills the prompt and keeps the cursor where it was`, async ($, on) => {
		const w = world(on);
		await paste($, w, "the qiuck fox and teh dog", 6);
		const band = await openPicker($, w, surface);
		await band.press({ key: "s0" });
		await w.clock.settle();
		expect(w.box).toEqual({
			text: "the quick fox and teh dog",
			cursor: 6
		});
		await band.unmount();
	});
	test(`${surface}: a long context is the surface's to wrap, whole up to a sentence each way`, async ($, on) => {
		const w = world(on);
		await paste($, w, `${"word ".repeat(40)}qiuck${" more".repeat(40)}`, 0);
		const band = await openPicker($, w, surface);
		const lead = (await band.find({
			type: "Text",
			text: /^(word )+$/
		}))?.text ?? "";
		const trail = (await band.find({
			type: "Text",
			text: /^( more)+$/
		}))?.text ?? "";
		expect(lead.length).toBeGreaterThan(60);
		expect(lead.length).toBeLessThanOrEqual(80);
		expect(trail.length).toBeGreaterThan(60);
		expect(trail.length).toBeLessThanOrEqual(80);
		expect(lead.startsWith("word ")).toBe(true);
		expect(trail.endsWith(" more")).toBe(true);
		await expectNative(band);
		await band.unmount();
	});
	test(`${surface}: skip moves on, fix all applies the rest, and undo takes it back`, async ($, on) => {
		const w = world(on);
		await paste($, w, "teh qiuck fox");
		const band = await openPicker($, w, surface);
		await band.press({ key: "skip" });
		await w.clock.settle();
		expect(await band.find({
			type: "Text",
			text: /^teh$/
		})).toBeDefined();
		expect(await band.find({
			type: "Text",
			text: /^Fix all changes teh → the$/
		})).toBeDefined();
		await band.press({ key: "all" });
		await w.clock.settle();
		expect(w.box.text).toBe("the qiuck fox");
		expect(await band.find({
			type: "Text",
			text: /^Fixed teh → the$/
		})).toBeDefined();
		expect((await band.find({ key: "dismiss" }))?.text).toBe("Dismiss");
		await expectNative(band);
		await band.press({ key: "undo" });
		await w.clock.settle();
		expect(w.box.text).toBe("teh qiuck fox");
		await band.unmount();
	});
	test(`${surface}: dismiss keeps the fix and drops the report`, async ($, on) => {
		const w = world(on);
		await paste($, w, "teh qiuck fox");
		const band = await openPicker($, w, surface);
		await band.press({ key: "all" });
		await w.clock.settle();
		await band.press({ key: "dismiss" });
		await w.clock.settle();
		expect(w.box.text).toBe("the quick fox");
		expect(await band.find({ key: "undo" })).toBeUndefined();
		await band.unmount();
	});
	test(`${surface}: Close closes the picker`, async ($, on) => {
		const w = world(on);
		await paste($, w, "teh qiuck fox");
		const band = await openPicker($, w, surface);
		await band.press({ key: "spellfix" });
		await w.clock.settle();
		expect(await band.find({ key: "skip" })).toBeUndefined();
		expect((await band.find({ key: "spellfix" }))?.text).toBe("Review");
		await band.unmount();
	});
	test(`${surface}: the add button puts a word in the dictionary`, OPTIONS, async ($, on) => {
		const w = world(on, haikuSays({ qiuck: `<word text="qiuck" verdict="unsure"/>` }));
		await paste($, w, "a qiuck fox");
		const band = await openPicker($, w, surface);
		expect((await band.find({ key: "add" }))?.text).toBe("Add word");
		expect(await band.find({
			type: "Text",
			text: /^Haiku has no suggestion$/
		})).toBeDefined();
		await expectNative(band);
		await band.press({ key: "add" });
		await w.clock.settle();
		expect(personal(w).has("qiuck")).toBe(true);
		expect(w.box.text).toBe("a qiuck fox");
		await paste($, w, "one more qiuck here");
		expect(await band.find({
			type: "Text",
			text: /misspell/i
		})).toBeUndefined();
		await band.unmount();
	});
	test(`${surface}: words Haiku added are named, and Undo add takes them back`, OPTIONS, async ($, on) => {
		const w = world(on, haikuSays({ Jepsen: `<word text="Jepsen" verdict="correct"/>` }));
		await paste($, w, "ask Jepsen about teh fox", 0);
		const band = await openPicker($, w, surface);
		expect(await band.find({
			type: "Text",
			text: /^Added Jepsen to the dictionary$/
		})).toBeDefined();
		expect((await band.find({ key: "undo" }))?.text).toBe("Undo add");
		await expectNative(band);
		await band.press({ key: "undo" });
		await w.clock.settle();
		expect(personal(w).has("Jepsen")).toBe(false);
		await band.unmount();
	});
	test(`${surface}: a host with no prompt events is read on each redraw`, async ($, on) => {
		const w = world(on);
		w.box = {
			text: "teh qiuck fox ",
			cursor: 14
		};
		const band = await mount($);
		await w.clock.advance(1e3);
		expect(await shownCount(band)).toBe("2 misspelled");
		await band.press({ key: "spellfix" });
		await w.clock.settle();
		await band.press({ key: "all" });
		await w.clock.settle();
		expect(w.box.text).toBe("the quick fox ");
		expect(await band.find({
			type: "Text",
			text: /^Fixed teh → the, qiuck → quick$/
		})).toBeDefined();
		await w.clock.advance(1e3);
		expect(await shownCount(band)).toBe("");
		expect(await band.find({
			type: "Text",
			text: /^No misspellings$/
		})).toBeUndefined();
		expect(await band.find({ key: "spellfix" })).toBeUndefined();
		expect((await band.find({ key: "undo" }))?.text).toBe("Undo");
		expect((await band.find({ key: "dismiss" }))?.text).toBe("Dismiss");
		await expectNative(band);
		await band.press({ key: "undo" });
		await w.clock.advance(1e3);
		expect(w.box.text).toBe("teh qiuck fox ");
		expect(await band.find({
			type: "Text",
			text: /^Fixed/
		})).toBeUndefined();
		expect(await shownCount(band)).toBe("2 misspelled");
		await band.unmount();
	});
}
