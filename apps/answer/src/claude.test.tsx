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

/** Where the form a band opens is drawn: only a graphical surface has one. */
const FORM: Surface = "desktop";

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

/** The form's one row, while it is folded: its words, beside its button. */
const hint = async ($: Engine, surface: Surface = FORM) => {
  const drawn = await band($, surface);
  const found = (await drawn.find({ key: "answer" })) ? await offerSays(drawn) : undefined;
  await drawn.unmount();
  return found;
};

/** The band with the form open in it, as `/answer` opens it. */
const form = async ($: Engine, surface: Surface = FORM) => {
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

// A round that ends on prose after a rule: the cards replace the message, so they must draw it.
const CLOSING = "Have we reached a shared understanding? Say so and I will write the plan.";
const WITH_CLOSING = `${GRILLING}\n\n---\n\n${CLOSING}`;

for (const surface of ["terminal", "desktop"] as const)
  test(`${surface}: what the message says after its last question is still drawn`, async ($, on) => {
    world(on);
    let messages: Array<{ role: "assistant"; text: string; toolUses: []; uuid: string }> = [];
    on("session.messages", () => ({ value: messages }));
    on("session.surfaces", () => ({ value: [surface] }));
    on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
    await start($, surface);
    messages = [{ role: "assistant", text: WITH_CLOSING, toolUses: [], uuid: "closing-round" }];
    await ends($, WITH_CLOSING);
    const cards = await $.ui.mount({
      plugin: "answer",
      surface,
      component: "AssistantMessage",
      requestId: "closing-round",
      props: { text: WITH_CLOSING, isFirstOfReply: true },
    });
    expect(await cards.find({ type: "Markdown", text: CLOSING })).toBeDefined();
    await cards.unmount();
  });

// Alternatives with a closing choice, and one question with no number: one card each, the reply the answer alone.
const MENU = `Ways to close the gap:

1. **Accept it and label it:** the smallest change.
2. **Read the hourly report:** about an hour behind.
3. **Use the session logs:** real time.

I'd go with 1. Which do you want?`;

test("a list of alternatives is one card that fills the prompt with the number", async ($, on) => {
  const w = world(on);
  let messages: Array<{ role: "assistant"; text: string; toolUses: []; uuid: string }> = [];
  on("session.messages", () => ({ value: messages }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
  await start($);
  messages = [{ role: "assistant", text: MENU, toolUses: [], uuid: "menu-round" }];
  await ends($, MENU);
  const cards = await $.ui.mount({
    plugin: "answer",
    surface: "terminal",
    component: "AssistantMessage",
    requestId: "menu-round",
    props: { text: MENU, isFirstOfReply: true },
  });
  // The numbers the list printed are the row tags, and the row's words come without them.
  expect(await cards.find({ key: "question-0-choose-1" })).toBeDefined();
  await cards.press({ key: "question-0-choose-1" });
  await cards.press({ key: "round-fill" });
  expect(w.box).toBe("2");
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
  const count = async () => (await cards.find({ key: "round-count" }))?.props.label;
  expect(await count()).toBe("0 of 3 answered");
  await cards.press({ key: "question-0-choose-1" });
  expect(await count()).toBe("1 of 3 answered");

  // Filling the prompt doesn't mark the round as sent.
  await cards.press({ key: "round-fill" });
  expect(await cards.find({ type: "Text", text: /✓ Sent/ })).toBeUndefined();
  await cards.press({ key: "question-0-choose-0" });
  await $.prompt.submit({ text: "Q1: B", origin: { kind: "composer" }, wait: false });
  // The sent round's row says so and offers nothing more: no count to press, no Fill.
  expect(await cards.find({ type: "Text", text: /✓ Sent/ })).toBeDefined();
  expect(await cards.find({ key: "round-count" })).toBeUndefined();
  expect(await cards.find({ key: "round-fill" })).toBeUndefined();
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
  // Nothing of the round before is carried over: the offer counts no answers.
  expect(await hint($)).toBe("Pick from 2 items");
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
  const guide = async () => {
    const bar = await band($, "terminal");
    const found = await bar.find({ key: "round-current" });
    await bar.unmount();
    return found?.props.label;
  };
  await start($);
  expect(await guide()).toBe("Q1/3");
  await $.prompt.submit({ text: "never mind", wait: false, origin: { kind: "composer" } });
  said = [...said, { role: "user", text: "never mind", toolUses: [] }];
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
    origin: { kind: "composer" },
  });
  expect(await hint($)).toBeUndefined();
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/^1 answer set aside/);
  // The round comes back as it was left: its answer marked, its first question showing.
  const back = await form($);
  expect((await back.find({ key: "q0" }))?.props.label).toContain("✓");
  expect(await asking(back, /Should every focus default/)).toBeDefined();
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
  const drawn = await band($, FORM);
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
  // A refused submit resolves `{ drop }`, as a hook's or core's refusal does; it does not throw.
  w.refuses = true;
  await drawn.press({ key: "send" });
  expect(w.submitted).toEqual([]);
  expect(w.box).toBe("and keep it short");
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/didn't send/);
  // The round the hook dropped before the refusal is back, its answer with it.
  await drawn.press({ key: "quit" });
  expect(await offerSays(drawn)).toContain("1 of 3");
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
  expect((await cards.find({ key: "round-count" }))?.props.label).toBe("1 of 3 answered");
  await cards.press({ key: "round-fill" });
  expect(w.box).toBe("Q1: B");
  await cards.unmount();
});

test("the closing row's count goes back to the first question and scrolls to the round's top", async ($, on) => {
  world(on);
  let messages: Array<{ role: "assistant"; text: string; toolUses: [] }> = [];
  on("session.messages", () => ({ value: messages }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
  await start($);
  messages = [{ role: "assistant", text: GRILLING, toolUses: [] }];
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
    props: { text: GRILLING, isFirstOfReply: true },
  });
  // Its scroll to the round's top is the engine's, seen in a real session (`count-click`).
  await cards.press({ key: "round-count" });
  const again = await band($);
  expect(await again.find({ key: "round-current" })).toBeDefined();
  expect((await again.find({ key: "round-current" }))?.props.label).toBe("Q1/3");
  await again.unmount();
  await cards.unmount();
});

/** A terminal session whose transcript holds `text`, as the last reply; its round's cards. */
async function terminalRound($: Engine, on: On, text: string) {
  on("session.messages", () => ({ value: [{ role: "assistant", text, toolUses: [] }] }));
  on("session.surfaces", () => ({ value: ["terminal"] }));
  on("ui.place", () => ({ value: { isPlaced: false, reason: "no surface in the test" } }));
  await start($);
  await ends($, text);
  return $.ui.mount({
    plugin: "answer",
    surface: "terminal",
    component: "AssistantMessage",
    requestId: "assistant-row",
    props: { text, isFirstOfReply: true },
  });
}

test("a pick list is cards on a terminal: each row lettered, the write-in last", async ($, on) => {
  const w = world(on);
  const cards = await terminalRound($, on, MINE);
  // Its rows print no letter of their own; the card gives them one by their place.
  expect((await cards.find({ key: "question-0-choose-0" }))?.props.label).toMatch(
    /^\s*A ○ Build it/,
  );
  expect((await cards.find({ key: "question-0-write" }))?.props.label).toMatch(
    /^\s*B ○ Something else/,
  );
  expect((await cards.find({ key: "question-1-choose-1" }))?.props.label).toMatch(
    /^\s*B ○ Route to \/grill-me/,
  );
  await cards.press({ key: "question-0-choose-0" });
  await cards.press({ key: "question-1-choose-1" });
  await cards.press({ key: "round-fill" });
  expect(w.box).toBe("do 1\n2 → /grill-me");
  // Its letters are the band's keys too.
  const bar = await band($);
  await bar.press({ key: "round-key-a" });
  await bar.unmount();
  expect((await cards.find({ key: "question-1-choose-0" }))?.props.label).toMatch(
    /^\s*A ● Build it/,
  );
  await cards.unmount();
});

test("on a terminal the band is the cards' key guide, never a form", async ($, on) => {
  const w = world(on);
  const cards = await terminalRound($, on, GRILLING);
  await cards.unmount();
  const guide = await $.ui.mount({
    ...BAND,
    surface: "terminal",
    viewport: { columns: 100, rows: 40, isFullscreen: true },
  });
  expect((await guide.find({ key: "round-current" }))?.props.label).toBe("Q1/3");
  expect(await guide.find({ key: "answer" })).toBeUndefined();
  await guide.unmount();
  // `/answer` brings the shown card into view and leaves the band as it was.
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
  // What core is left to stack, once asked: the band's own mount stacks its rows too.
  let stacked: string[] | undefined;
  on("ui.render", { component: "AbovePromptList", plugin: "*" }, (_, e, next) => {
    if (!stacked) return next(e);
    stacked = e.props.rows.map((r) => r.plugin);
    return { type: "Box", props: {}, children: [] };
  });
  await (await terminalRound($, on, GRILLING)).unmount();
  const bar = await band($);
  await bar.press({ key: "round-key-n" });
  await bar.unmount();
  stacked = [];
  await (await $.ui.mount(LIST)).unmount();
  expect(stacked).toEqual(["answer"]);
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

  test(`${surface}: a negative recommendation keeps its answer when filled`, async ($, on) => {
    const w = world(on);
    await start($, surface);
    await ends(
      $,
      "**Q1. Show a separate card?**\n\n> **Recommended:** No. A plain reply is enough.",
    );
    const drawn = await form($, surface);
    expect((await drawn.find({ type: "Button", key: "e0" }))?.props.label).toBe("No");
    expect(await drawn.find({ type: "Text", text: "A plain reply is enough." })).toBeDefined();
    await expectNative(drawn, { hotkeys: ACTIONS });
    await drawn.press({ key: "e0" });
    await drawn.press({ key: "review" });
    expect(await drawn.find({ type: "Text", text: "No. A plain reply is enough." })).toBeDefined();
    await drawn.press({ key: "fill" });
    await drawn.unmount();
    expect(w.box).toBe("Q1: No. A plain reply is enough.");
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
