/**
 * The mod over the form's core, whose parser and steps have their own tests (`core/forms.spec.ts`).
 */
import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";

import { expectNative } from "./checks";

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
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const;

const RUN = {
  command: "answer",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;

type World = {
  box: string;
  submitted: string[];
  toasts: string[];
  /** Whether the engine refuses a submit, as it does when the prompt does not enter. */
  refuses: boolean;
  clock: ReturnType<typeof mock.clock>;
};

/** Stands in for the engine: the prompt box and the band beneath. */
function world(on: On, draft = ""): World {
  const w: World = {
    box: draft,
    submitted: [],
    toasts: [],
    refuses: false,
    clock: mock.clock(on),
  };
  on("prompt.read", () => ({ value: { text: w.box, cursor: w.box.length } }));
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
    return { value: undefined };
  });
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.component === "AssistantMessage" ? e.props.text : "engine"}</Text>;
  });
  return w;
}

type Surface = "terminal" | "desktop" | "vscode";

const start = ($: Engine, surface: Surface = "terminal") =>
  $.session.start({ cwd: "/", surface, isInteractive: true });

const ends = ($: Engine, answer: string) =>
  $.turn.complete({ answer, reason: "answer", turnId: "t", durationMs: 1, isAborted: false });

const band = ($: Engine, surface: Surface = "terminal") => $.ui.mount({ ...BAND, surface });

/** A press on an answer: it answers and the form goes on. */
const pick = (
  _w: World,
  drawn: { press: (target: { key: string }) => Promise<unknown> },
  key: string,
) => drawn.press({ key });

/** The form's one row, while it is folded. */
const hint = async ($: Engine, surface: Surface = "terminal") => {
  const drawn = await band($, surface);
  const found = await drawn.find({ key: "answer" });
  await drawn.unmount();
  return found?.text;
};

/** The band with the form open in it, as `/answer` opens it. */
const form = async ($: Engine, surface: Surface = "terminal") => {
  await $.command.run(RUN);
  return band($, surface);
};

test("Desktop restores the latest round in the transcript and keeps the submitted round visible", async ($, on) => {
  const w = world(on, "Already typed");
  let messages: Array<{ role: "assistant"; text: string; toolUses: []; uuid: string }> = [];
  on("session.messages", () => ({ value: messages }));
  on("session.surfaces", () => ({ value: ["desktop"] }));
  messages = [
    {
      role: "assistant",
      text: GRILLING,
      toolUses: [],
      uuid: "bc4b6cdd-4ccd-4e7c-92b4-b208e879b0ed",
    },
  ];
  await start($, "desktop");
  const cards = await $.ui.mount({
    plugin: "answer",
    surface: "desktop",
    component: "AssistantMessage",
    requestId: "block-of-the-assistant-message",
    props: { text: GRILLING, isFirstOfReply: true },
  });
  expect(await cards.find({ type: "Text", text: /0\/3 answered/ })).toBeDefined();
  expect(await hint($, "desktop")).toBeUndefined();
  await cards.press({ key: "question-0-choose-1" });
  expect(await cards.find({ type: "Text", text: /1\/3 answered/ })).toBeDefined();
  expect(await cards.find({ type: "Text", text: /^Sent$/ })).toBeUndefined();
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
  expect(await cards.find({ type: "Text", text: /^Sent$/ })).toBeUndefined();
  expect(await cards.find({ key: "send" })).toBeDefined();
  w.refuses = false;
  await cards.press({ key: "send" });
  expect(w.submitted).toEqual(["Q1: B"]);
  expect(w.box).toBe("Already typed");
  expect(await cards.find({ type: "Text", text: /^Sent$/ })).toBeDefined();
  expect(await cards.find({ key: "question-0-choose-1" })).toBeUndefined();
  expect(await cards.find({ type: "Text", text: /1\/3 answered/ })).toBeDefined();
  await cards.unmount();
});

test("Terminal cards can match a transcript row when the engine omits its UUID", async ($, on) => {
  world(on);
  let messages: Array<{ role: "assistant"; text: string; toolUses: [] }> = [];
  on("session.messages", () => ({ value: messages }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
  await start($);
  messages = [{ role: "assistant", text: GRILLING, toolUses: [] }];
  await ends($, GRILLING);
  const cards = await $.ui.mount({
    plugin: "answer",
    surface: "terminal",
    component: "AssistantMessage",
    requestId: "assistant-row",
    props: { text: GRILLING, isFirstOfReply: true },
  });
  expect(await cards.find({ type: "Text", text: /Answers\s+0 of 3 answered/ })).toBeDefined();
  await cards.press({ key: "question-0-choose-1" });
  expect(await cards.find({ type: "Text", text: /Answers\s+1 of 3 answered/ })).toBeDefined();

  // Filling the prompt doesn't mark the round as sent.
  await cards.press({ key: "review-fill" });
  expect(await cards.find({ type: "Text", text: /✓ Sent/ })).toBeUndefined();
  await cards.press({ key: "question-0-choose-0" });
  await $.prompt.submit({ text: "Q1: B", origin: { kind: "composer" }, wait: false });
  expect(await cards.find({ type: "Text", text: /✓ Sent/ })).toBeDefined();
  expect(await cards.find({ type: "Text", text: /B: Default by kind\.$/ })).toBeDefined();
  await cards.unmount();
});

test("a turn that ends on questions offers the form; the person's next send drops it", async ($, on) => {
  world(on);
  await ends($, GRILLING);
  expect(await hint($)).toContain("Answer 3 questions");
  await $.prompt.submit({ text: "never mind", wait: false, origin: { kind: "composer" } });
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
    origin: { kind: "task-notification" },
  });
  await ends($, PLAIN);
  expect(await hint($)).toContain("1 of 3");
  // The same round asked again keeps its answers too.
  await ends($, GRILLING);
  expect(await hint($)).toContain("1 of 3");
});

// The band as core hands it over once each plugin's row settled: this one's and another's.
const row = (plugin: string) => ({
  plugin,
  tree: { type: "Text" as const, props: {}, children: [`${plugin}'s row`] },
});
const LIST = {
  plugin: "answer",
  component: "AbovePromptList",
  props: { ...BAND.props, rows: [row("neighbour"), row("answer")] },
  surface: "terminal",
} as const;

test("the offer sits beside the other rows; the open form has the band to itself", async ($, on) => {
  world(on);
  // What core is left to stack.
  let stacked: string[] = [];
  on("ui.render", { component: "AbovePromptList", plugin: "*" }, (_, e) => {
    stacked = e.props.rows.map((r) => r.plugin);
    return { type: "Box", props: {}, children: [] };
  });
  await ends($, GRILLING);
  await (await $.ui.mount(LIST)).unmount();
  expect(stacked).toEqual(["neighbour", "answer"]);
  await $.command.run(RUN);
  await (await $.ui.mount(LIST)).unmount();
  expect(stacked).toEqual(["answer"]);
});

test("a draft that crowds the form is set aside while it is open, and a second fill takes the first one's place", async ($, on) => {
  const draft = "and keep it short\nplease";
  const w = world(on, draft);
  await start($);
  await ends($, GRILLING);
  // The band has few rows here, as under a tall prompt box on a small terminal.
  const drawn = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, maxRows: 10 },
    surface: "terminal",
  });
  await drawn.press({ key: "answer" });
  expect(w.box).toBe("");
  await drawn.press({ key: "quit" });
  expect(w.box).toBe(draft);
  await drawn.press({ key: "answer" });
  await pick(w, drawn, "e1");
  await drawn.press({ key: "review" });
  await drawn.press({ key: "fill" });
  expect(w.box).toBe(`Q1: B\n\n${draft}`);
  // Reopened, the reply and the draft are out of the way again.
  await drawn.press({ key: "answer" });
  expect(w.box).toBe("");
  await drawn.press({ key: "fill" });
  expect(w.box).toBe(`Q1: B\n\n${draft}`);
  await drawn.unmount();
});

test("a draft the form has room beside stays in the prompt", async ($, on) => {
  const w = world(on, "and keep it short\nplease");
  await start($);
  await ends($, GRILLING);
  const drawn = await band($);
  await drawn.press({ key: "answer" });
  expect(w.box).toBe("and keep it short\nplease");
  await drawn.unmount();
});

test("a pick opens its note, a press on the taken answer goes on, and the review fills the prompt", async ($, on) => {
  const w = world(on, "and keep it short");
  await ends($, GRILLING);
  const drawn = await band($);
  await drawn.press({ key: "answer" });
  // Q1: B, which stays for its note; Enter there goes on.
  await pick(w, drawn, "e1");
  expect(await drawn.find({ type: "Text", text: /^Should every focus default/ })).toBeDefined();
  await typeIn(drawn, "note", "but keep the flag");
  // Q2 has a recommendation and no options: it is the first entry. A second press goes on.
  expect((await drawn.find({ key: "e0" }))?.text).toContain("Yes. Four generators");
  await pick(w, drawn, "e0");
  expect(await drawn.find({ type: "Text", text: /^Lower the per-generator/ })).toBeDefined();
  await pick(w, drawn, "e0");
  // Q3's write-in is a row like its options until it is picked; then it is a field.
  expect((await drawn.find({ key: "e2" }))?.text).toContain("Write your own answer");
  await pick(w, drawn, "e2");
  await typeIn(drawn, "write", "drop it");
  const reply = "Q1: B\n    Note: but keep the flag\nQ2: yes\nQ3: drop it";
  expect((await drawn.findAll({ type: "Text" })).some((t) => t.text === reply)).toBe(true);
  await drawn.press({ key: "fill" });
  // Filled, the form folds back to its row.
  expect(await drawn.find({ key: "answer" })).toBeDefined();
  await drawn.unmount();

  expect(w.box).toBe(`${reply}\n\nand keep it short`);
});

test("skip, back and forward move without answering; closing keeps the answers", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  await drawn.press({ key: "skip" });
  await drawn.press({ key: "back" });
  expect(await drawn.find({ type: "Text", text: /^Should every focus default/ })).toBeDefined();
  await drawn.press({ key: "next" });
  await pick(w, drawn, "e0");
  await typeIn(drawn, "note", "");
  expect(await drawn.find({ type: "Text", text: /^What should happen to/ })).toBeDefined();
  await drawn.press({ key: "quit" });
  expect((await drawn.find({ key: "answer" }))?.text).toContain("1 of 3");
  await drawn.unmount();

  await $.prompt.submit({ text: "something else", wait: false, origin: { kind: "composer" } });
  expect(await hint($)).toBeUndefined();
});

test("the mouse alone answers: buttons keep what a field held, and a click on an option's detail picks it", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  expect(
    await drawn.find({ type: "Markdown", text: /Recommended:.*A\. A per-kind table/ }),
  ).toBeDefined();
  // The strip jumps to Q3, whose second option carries its detail inside the button.
  await drawn.press({ key: "q2" });
  expect((await drawn.find({ key: "e1" }))?.text).toContain("Scripts may still call it.");
  await pick(w, drawn, "e2");
  await typeIn(drawn, "write", "drop it", "change");
  await drawn.press({ key: "next" });
  expect(await drawn.find({ type: "Text", text: /^Not answered: Q1, Q2\./ })).toBeDefined();
  await drawn.press({ key: "item0" });
  await pick(w, drawn, "e0");
  // A note typed and never entered is kept by the button that leaves.
  await drawn.press({ key: "q0" });
  await drawn.press({ key: "note-add" });
  await typeIn(drawn, "note", "for now", "change");
  await drawn.press({ key: "next" });
  expect(await drawn.find({ type: "Text", text: /^Lower the per-generator/ })).toBeDefined();
  await drawn.press({ key: "review" });
  await drawn.press({ key: "note" });
  await typeIn(drawn, "note", "thanks", "change");
  await drawn.press({ key: "fill" });
  await drawn.unmount();
  expect(w.box).toBe("Q1: A\n    Note: for now\nQ3: drop it\nOverall: thanks");
});

test("yes takes the recommendation and goes on", async ($, on) => {
  world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  // The key says what it takes.
  expect((await drawn.find({ key: "accept" }))?.props.label).toBe("take A");
  await drawn.press({ key: "accept" });
  expect((await drawn.find({ key: "q0" }))?.text).toContain("✓");
  expect(await drawn.find({ type: "Text", text: /^Lower the per-generator/ })).toBeDefined();
  // Q3 recommends nothing, so it offers no yes.
  await drawn.press({ key: "next" });
  expect(await drawn.find({ key: "accept" })).toBeUndefined();
  await drawn.unmount();
});

test("the form stands as tall as its tallest question, on every one of them", async ($, on) => {
  world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  const heightOf = async () =>
    (await drawn.findAll({ type: "Box" }))
      .map((box) => box.props.minHeight)
      .find((height): height is number => typeof height === "number");
  // Q1 is the tallest: a title, three options, the write-in, its recommendation and the keys.
  const tallest = await heightOf();
  expect(tallest).toBeGreaterThan(8);
  await drawn.press({ key: "next" });
  expect(await heightOf()).toBe(tallest);
  await drawn.press({ key: "review" });
  expect(await heightOf()).toBe(tallest);
  await drawn.unmount();
});

test("a long body gives way to the entries when the band is short", async ($, on) => {
  world(on);
  await start($);
  await ends($, LONG);
  await $.command.run(RUN);
  const short = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, maxRows: 16 },
    surface: "terminal",
  });
  expect(await short.find({ type: "Text", text: /^… more above$/ })).toBeDefined();
  expect(await short.find({ key: "e1" })).toBeDefined();
  await short.unmount();
  const tall = await band($);
  expect(await tall.find({ type: "Text", text: /^… more above$/ })).toBeUndefined();
  expect(await tall.find({ type: "Markdown", text: /Line 12 of what it hangs on/ })).toBeDefined();
  await tall.unmount();
});

test("a press on an answer opens its note; a press on it again goes on", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  await pick(w, drawn, "e1");
  expect(await field(drawn, "note")).toBeDefined();
  expect(await drawn.find({ type: "Text", text: /^Should every focus default/ })).toBeDefined();
  await pick(w, drawn, "e1");
  expect(await drawn.find({ type: "Text", text: /^Lower the per-generator/ })).toBeDefined();
  // Its tab says it is answered, and back on it the answer offers a note.
  expect((await drawn.find({ key: "q0" }))?.text).toContain("✓");
  await drawn.press({ key: "q0" });
  expect((await drawn.find({ key: "e1" }))?.text).toContain("●");
  expect(await drawn.find({ key: "note-add" })).toBeDefined();
  await drawn.unmount();
});

test("the review names each question and shows what its answer says in plain words", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  await pick(w, drawn, "e1");
  await drawn.press({ key: "review" });
  const row = await drawn.find({ key: "item0" });
  expect(row?.text).toContain("Should every focus default to the same bar?");
  expect(row?.text).toContain("→ B: Default by kind.");
  expect(await drawn.find({ type: "Text", text: /^The reply:$/ })).toBeDefined();
  await drawn.unmount();
});

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
  const drawn = await $.ui.mount({ ...BAND, surface: "desktop" });
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
  expect(await hint($)).toContain("Pick from 2 items");
  expect(await hint($)).toContain("0 of 2");
});

test("a resumed session gets the round its last reply ended on, unless the person spoke after it", async ($, on) => {
  world(on);
  let said: { role: "user" | "assistant"; text: string; toolUses: [] }[] = [
    { role: "user", text: "grill me", toolUses: [] },
    { role: "assistant", text: GRILLING, toolUses: [] },
    { role: "user", text: "<command-name>/answer</command-name>", toolUses: [] },
    {
      role: "user",
      text: 'Another Claude session sent a message: <cross-session-message from="x">Heads up.</cross-session-message>',
      toolUses: [],
    },
    { role: "assistant", text: "Noted.", toolUses: [] },
  ];
  on("session.messages", () => ({ value: said }));
  await start($);
  expect(await hint($)).toContain("Answer 3 questions");
  await $.prompt.submit({ text: "never mind", wait: false, origin: { kind: "composer" } });
  said = [...said, { role: "user", text: "never mind", toolUses: [] }];
  await $.command.run(RUN);
  expect(await hint($)).toBeUndefined();
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
    origin: { kind: "composer" },
  });
  expect(await hint($)).toBeUndefined();
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/^1 answer set aside/);
  // The round comes back as it was left: its answer marked, its first question showing.
  const back = await form($);
  expect((await back.find({ key: "q0" }))?.text).toContain("✓");
  expect(await back.find({ type: "Text", text: /^Should every focus default/ })).toBeDefined();
  await back.unmount();
});

test("a send with nothing in it leaves the round where it is", async ($, on) => {
  world(on);
  await start($);
  await ends($, GRILLING);
  await $.prompt.submit({ text: "   ", wait: false, origin: { kind: "composer" } });
  expect(await hint($)).toContain("Answer 3 questions");
});

test("sending the reply the form filled answers the round", async ($, on) => {
  const w = world(on, "and keep it short");
  await start($);
  await ends($, GRILLING);
  const drawn = await band($);
  await drawn.press({ key: "answer" });
  await pick(w, drawn, "e1");
  await drawn.press({ key: "review" });
  await drawn.press({ key: "fill" });
  expect(w.box).toBe("Q1: B\n\nand keep it short");
  await drawn.unmount();
  // The reply, with the person's own draft under it, answers the round: nothing is set aside.
  await $.prompt.submit({ text: w.box, wait: false, origin: { kind: "composer" } });
  expect(w.toasts).toEqual([]);
  expect(await hint($)).toBeUndefined();
  await $.command.run(RUN);
  expect(await hint($)).toBeUndefined();
});

test("a command's send sets the round aside too, and the aside wins over the transcript", async ($, on) => {
  const w = world(on);
  let said: { role: "user" | "assistant"; text: string; toolUses: [] }[] = [
    { role: "user", text: "grill me", toolUses: [] },
    { role: "assistant", text: GRILLING, toolUses: [] },
  ];
  on("session.messages", () => ({ value: said }));
  await start($);
  const drawn = await form($);
  await pick(w, drawn, "e1");
  await drawn.unmount();
  await $.prompt.submit({ text: "/help", wait: false, origin: { kind: "composer" } });
  // The transcript keeps the round behind the command, which `recover` reads as a fresh one.
  said = [...said, { role: "user", text: "<command-name>/help</command-name>", toolUses: [] }];
  const back = await form($);
  expect((await back.find({ key: "q0" }))?.text).toContain("✓");
  await back.unmount();
});

test("a send the engine refuses keeps the round and its answers", async ($, on) => {
  const w = world(on, "and keep it short");
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  await pick(w, drawn, "e1");
  await drawn.press({ key: "review" });
  // A refused submit resolves `{ drop }`, as a hook's or core's refusal does; it does not throw.
  w.refuses = true;
  await drawn.press({ key: "send" });
  expect(w.submitted).toEqual([]);
  expect(w.box).toBe("and keep it short");
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/didn't send/);
  // The round the hook dropped before the refusal is back, its answer with it.
  await drawn.press({ key: "quit" });
  expect((await drawn.find({ key: "answer" }))?.text).toContain("1 of 3");
  await drawn.unmount();
});

test("nothing runs or is read outside the session: the form needs no hub", async ($, on) => {
  const w = world(on);
  const reached: string[] = [];
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
const field = async (drawn: Pick<Mounted, "findAll">, name: "write" | "note") =>
  (await drawn.findAll({ type: "Input" })).find((e) => e.key?.startsWith(`${name}-field-`));

/** Types into the open field, as `input` does into a keyed one. */
const typeIn = async (
  drawn: Pick<Mounted, "findAll" | "input">,
  name: "write" | "note",
  text: string,
  kind?: "change",
) =>
  drawn.input({
    key: (await field(drawn, name))?.key ?? `${name}-field`,
    text,
    ...(kind ? { kind } : {}),
  });

/** The offer's words, which a graphical surface sets beside its button rather than in it. */
const offerSays = async (drawn: Pick<Mounted, "findAll">) =>
  (await drawn.findAll({ type: "Text" }))
    .map((e) => e.text)
    .find((t) => /^(Answer|Pick from) /.test(t));

/** What an action row may carry hotkeys on: nothing else on a graphical surface does. */
const ACTIONS = ["skip", "note", "accept", "next", "send"];

/** The question shown: its title, as the form's markdown heading draws it. */
const asking = (drawn: Pick<Mounted, "find">, title: RegExp) =>
  drawn.find({ type: "Markdown", text: title });

test("a digit answers the row at its place on screen, the write-in's place included", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, GRILLING);
  const drawn = await form($);
  // The aliases take no cells: the card reads as it always has, and its letters still press it.
  expect((await drawn.find({ key: "digits" }))?.props).toMatchObject({
    width: 0,
    height: 0,
    overflow: "hidden",
  });
  expect((await drawn.find({ key: "e0" }))?.props.hotkey).toBe("a");
  expect((await drawn.find({ key: "d0" }))?.props.hotkey).toBe("1");
  expect((await drawn.find({ key: "d1" }))?.props.hotkey).toBe("2");
  expect((await drawn.find({ key: "d2" }))?.props.hotkey).toBe("3");
  // The second row's number picks what its letter does.
  await pick(w, drawn, "d1");
  expect((await drawn.find({ key: "e1" }))?.text).toContain("●");
  await drawn.press({ key: "review" });
  expect(await drawn.find({ type: "Text", text: /→ B: Default by kind\./ })).toBeDefined();
  // Q2 has one row and the write-in: the write-in's own place opens it.
  await drawn.press({ key: "q1" });
  await pick(w, drawn, "d1");
  expect(await field(drawn, "write")).toBeDefined();
  await typeIn(drawn, "write", "no");
  await drawn.press({ key: "review" });
  await drawn.press({ key: "fill" });
  await drawn.unmount();
  expect(w.box).toBe("Q1: B\nQ2: no");
});

test("a pick list's rows keep their own digits, and its write-in takes the next", async ($, on) => {
  const w = world(on);
  await start($);
  await ends($, MINE);
  const drawn = await form($);
  // `Build it` is already pressed by `1`, so it takes no second button on the same key.
  expect((await drawn.find({ key: "e0" }))?.props.hotkey).toBe("1");
  expect(await drawn.find({ key: "d0" })).toBeUndefined();
  expect((await drawn.find({ key: "d1" }))?.props.hotkey).toBe("2");
  await pick(w, drawn, "d1");
  expect(await field(drawn, "write")).toBeDefined();
  await drawn.unmount();
});

test("in the round editor a digit answers the shown card's row, as its letter does", async ($, on) => {
  const w = world(on);
  let messages: Array<{ role: "assistant"; text: string; toolUses: [] }> = [];
  on("session.messages", () => ({ value: messages }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
  await start($);
  messages = [{ role: "assistant", text: GRILLING, toolUses: [] }];
  await ends($, GRILLING);
  const bar = await band($);
  // The bar binds the digits in the same hidden box as the letters.
  expect((await bar.find({ key: "round-key-1" }))?.props.hotkey).toBe("1");
  expect((await bar.find({ key: "round-key-3" }))?.props.hotkey).toBe("3");
  await bar.press({ key: "round-key-2" });
  await bar.unmount();
  const cards = await $.ui.mount({
    plugin: "answer",
    surface: "terminal",
    component: "AssistantMessage",
    requestId: "assistant-row",
    props: { text: GRILLING, isFirstOfReply: true },
  });
  expect(await cards.find({ type: "Text", text: /Answers\s+1 of 3 answered/ })).toBeDefined();
  await cards.press({ key: "review-fill" });
  expect(w.box).toBe("Q1: B");
  await cards.unmount();
});

// A graphical surface draws the form from the kit's patterns, not the terminal's rows: the offer
// is a status band; the tabs and the way out a toolbar; each answer a one-line row led by a Button
// of its letter, the chosen one opened in place with its note and the way on; the write-in a field
// that is always there. Every state is held to the style's rules (`expectNative`).
for (const surface of ["desktop", "vscode"] as const) {
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
      ["e0", "A", "Yes, one default for every kind."],
      ["e1", "B", "Default by kind."],
      ["e2", "C", "Add the bar as a second pick."],
    ] as const) {
      expect((await drawn.find({ type: "Button", key }))?.props.label).toBe(letter);
      expect(await drawn.find({ type: "Text", text: words })).toBeDefined();
    }
    // The recommendation is marked on its row, and its reason is in the body's line.
    expect(await drawn.find({ type: "Text", text: /^Recommended$/ })).toBeDefined();
    expect(
      await drawn.find({ type: "Text", text: /^Recommended: A\. A per-kind table/ }),
    ).toBeDefined();
    // The write-in is a field on its own row, ready for a click; no Button stands in for it.
    expect(await field(drawn, "write")).toBeDefined();
    expect(await drawn.find({ type: "Button", key: "e3" })).toBeUndefined();
    // One tab per question and the review, the current one filled; the way out at the far edge.
    for (const key of ["q0", "q1", "q2", "review"])
      expect(await drawn.find({ type: "Button", key })).toBeDefined();
    expect((await drawn.find({ key: "q0" }))?.props.variant).toBe("primary");
    expect((await drawn.find({ key: "q1" }))?.props.dimColor).toBe(true);
    expect((await drawn.find({ key: "quit" }))?.props.label).toBe("Close");
    // Nothing is chosen: no way on is drawn yet, and nothing is filled but the tab.
    expect(await drawn.find({ key: "next" })).toBeUndefined();
    expect(await drawn.find({ key: "accept" })).toBeUndefined();
    expect(await field(drawn, "note")).toBeUndefined();
    await expectNative(drawn, { hotkeys: ACTIONS });

    await pick(w, drawn, "e1");
    expect((await drawn.find({ key: "e1" }))?.props.variant).toBe("primary");
    expect((await drawn.find({ key: "e0" }))?.props.variant).not.toBe("primary");
    // The chosen row: its words whole, a note's field and Next, filled, in its well.
    expect(await drawn.find({ type: "Markdown", text: "**Default by kind.**" })).toBeDefined();
    expect(await field(drawn, "note")).toBeDefined();
    expect((await drawn.find({ key: "next" }))?.props.label).toBe("Next");
    expect((await drawn.find({ key: "next" }))?.props.variant).toBe("primary");
    // The tab says the question is answered.
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
    // A recommendation with no options is one row, its Button the yes.
    expect((await drawn.find({ key: "e0" }))?.props.label).toBe("Yes");
    expect(
      await drawn.find({ type: "Text", text: "Four generators still give 20–24." }),
    ).toBeDefined();
    await expectNative(drawn, { hotkeys: ACTIONS });
    await drawn.press({ key: "e0" });
    await drawn.press({ key: "next" });
    expect(await asking(drawn, /What should happen to/)).toBeDefined();
    await drawn.press({ key: "review" });
    // The review: each question a row of its answer, the question beside it; Send filled.
    expect(await drawn.find({ type: "Text", text: /^Not answered$/ })).toBeDefined();
    expect(await drawn.find({ type: "Text", text: /^B: Default by kind\.$/ })).toBeDefined();
    expect((await drawn.find({ key: "item2" }))?.props.label).toBe("Answer");
    expect((await drawn.find({ key: "item0" }))?.props.label).toBe("Change");
    expect((await drawn.find({ key: "send" }))?.props.variant).toBe("primary");
    expect((await drawn.find({ key: "fill" }))?.props.variant).toBeUndefined();
    await expectNative(drawn, { hotkeys: ACTIONS });
    await drawn.press({ key: "fill" });
    await drawn.unmount();
    expect(w.box).toBe("Q1: B\nQ2: yes");
  });

  test(`${surface}: the tabs, skip, the note and the review's rows are clicks too`, async ($, on) => {
    const w = world(on);
    await start($, surface);
    await ends($, GRILLING);
    const drawn = await form($, surface);
    // A note on a question with no answer: asked for, it is a field under the answers.
    await drawn.press({ key: "note" });
    expect(await field(drawn, "note")).toBeDefined();
    await drawn.press({ key: "q2" });
    expect(await asking(drawn, /What should happen to/)).toBeDefined();
    await drawn.press({ key: "q1" });
    expect(await asking(drawn, /Lower the per-generator/)).toBeDefined();
    await drawn.press({ key: "skip" });
    expect(await asking(drawn, /What should happen to/)).toBeDefined();
    // Picking B replaces A.
    await drawn.press({ key: "e0" });
    await drawn.press({ key: "e1" });
    expect((await drawn.find({ key: "e0" }))?.props.variant).not.toBe("primary");
    expect((await drawn.find({ key: "e1" }))?.props.variant).toBe("primary");
    expect((await drawn.find({ key: "next" }))?.props.variant).toBe("primary");
    await expectNative(drawn, { hotkeys: ACTIONS });
    await typeIn(drawn, "note", "use B", "change");
    await drawn.press({ key: "review" });
    expect(await drawn.find({ type: "Text", text: /^B: / })).toBeDefined();
    expect(await drawn.find({ type: "Text", text: "Note: use B" })).toBeDefined();
    // A review row goes back to its question.
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
    // Written, it is the answer: its row opens with the way on, the field holding the words.
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
    expect((await drawn.find({ type: "Text", text: words }))?.props.wrap).toBe("truncate-end");
    expect((await drawn.find({ key: "e1" }))?.props.label).toBe("B");
    await expectNative(drawn, { hotkeys: ACTIONS });
    await pick(w, drawn, "e0");
    expect((await drawn.find({ key: "e0" }))?.props.variant).toBe("primary");
    // A sentence is not set in the heavier weight; the only question's way on is the review.
    expect(await drawn.find({ type: "Markdown", text: words })).toBeDefined();
    expect((await drawn.find({ key: "next" }))?.props.label).toBe("Review");
    await expectNative(drawn, { hotkeys: ACTIONS });
    await drawn.unmount();
  });

  test(`${surface}: a recommendation of several options is one press`, async ($, on) => {
    const w = world(on);
    await start($, surface);
    await ends(
      $,
      "**Q1. Which checks should run?**\n\n- **A.** lint\n- **B.** types\n- **C.** tests\n\n> **Recommended:** A, B and C.",
    );
    const drawn = await form($, surface);
    expect((await drawn.find({ key: "accept" }))?.props.label).toBe("Take A, B, C");
    // It takes them all and goes on, here to the review.
    await drawn.press({ key: "accept" });
    expect(await drawn.find({ type: "Text", text: "A, B, C: lint; types; tests" })).toBeDefined();
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
    // A pick's routes have no letter: each Button carries its own words.
    expect((await list.find({ key: "e0" }))?.props.label).toBe("Build it");
    await expectNative(list, { hotkeys: ACTIONS });
    await pick(w, list, "e0");
    await list.press({ key: "review" });
    await expectNative(list, { hotkeys: ACTIONS });
    await list.unmount();

    // A body is one line until More opens it whole; its options follow it either way.
    await ends($, `${LONG}\n  It is cheap to keep.`);
    await $.command.run(RUN);
    const long = await $.ui.mount({
      ...BAND,
      props: { ...BAND.props, maxRows: 16 },
      surface,
    });
    expect(
      (await long.find({ type: "Text", text: /^Line 1 of what it hangs on\. Line 2/ }))?.props.wrap,
    ).toBe("truncate-end");
    expect((await long.find({ key: "more" }))?.props.label).toBe("More");
    await expectNative(long, { hotkeys: ACTIONS });
    await long.press({ key: "more" });
    expect(
      await long.find({ type: "Markdown", text: /Line 12 of what it hangs on/ }),
    ).toBeDefined();
    expect((await long.find({ key: "more" }))?.props.label).toBe("Less");
    // An option's detail is beside its words, not part of its Button.
    expect((await long.find({ key: "e1" }))?.props.label).toBe("B");
    expect(await long.find({ type: "Text", text: /^It is cheap to keep\.$/ })).toBeDefined();
    await expectNative(long, { hotkeys: ACTIONS });
    await long.unmount();
  });
}
