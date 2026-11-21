import { describe, expect, test } from "vitest";

import {
  plain,
  type Action,
  apply,
  type Draft,
  entries,
  type Form,
  go,
  hasWork,
  type Held,
  isReview,
  newDraft,
  offer,
  parse,
  split,
  startLines,
  tailOf,
  reply,
  step,
  view,
  viewOf,
} from "./forms.ts";

// Turn endings in the shapes agents really write them, as seen across past Claude Code and pi
// sessions; the wording is made up.

// grilling's format: lettered options, a blockquoted recommendation per question.
const GRILLING_ROUND = `The bar and the funnel are independent, so this round asks both.

**Q1. Should every focus default to "worth doing, ranked by payoff per effort"?**

- **A.** Yes, one default for every kind. Big swings become an opt-in flag.
- **B.** Default by kind: features get "worth doing", refactors keep big swings.
- **C.** Add the bar as a second pick to the scope question.

> **Recommended:** A. A per-kind table is one more thing to keep in sync.

---

**Q2. Lower the per-generator target from 8–10 ideas to 5–6?**

> **Recommended:** Yes. Each run threw away about 85% of its candidates,
> and four generators still give 20–24.

---

**Q3. What should happen to \`--quick\`?**

- **A.** Drop it.
- **B.** Keep it as an alias.`;

// Research and a table before the round; bodies hold numbered lists of their own.
const ROUND_AFTER_RESEARCH = `I looked at how other tools keep ideas diverse:
- rotating methods from different categories;
- several critics rather than one.

1. Hotspots are churn × complexity.
2. Change coupling exposes hidden dependencies.

---

**Q19. Should the lenses come from this menu?**

| Lens | Asks |
|---|---|
| Hotspots | churn × size |
| Subtraction | what if X didn't exist |

The default trio per kind:
1. general: hotspots, subtraction, leverage;
2. perf: measure-first, hotspots.

> **Recommended:** Yes. It covers every kind of ask the mining found.

---

**Q25. Should the default be big swings, with \`--quick\` for the small bar?**

> **Recommended:** Yes. You said you'd almost always want big swings.

Sources: [one](https://example.com/one), [two](https://example.com/two).`;

// Numbered questions after a numbered list of ideas that asks nothing.
const NUMBERED_QUESTIONS = `## Ideas, grouped by what they're for

**1. Reminding you what you have**
- A hint of the day, weighted by neglect.

**2. Repo state worth knowing**
- Other agents already running in this repo.

## Questions before I propose approaches

1. **What should it do for you?** Help you discover things, or warn you about state?

2. **Who should see it?**
   > **Recommended:** both. A short motd for you, the hints for the model.

3. **How much space should it take?**
   > **Recommended:** one to three lines, and nothing when there's nothing to say.`;

// One question, its proposal in the bold title.
const SINGLE_QUESTION = `**Q18: What should the agent do with each note? I propose: it folds the note into the plan and removes it.**

The alternative is to answer everything in chat and keep the file clean.

> **Recommended:** yes. The file is the conversation.`;

// The legacy one-question format: a recommendation heading over bullets, then "Agree?".
const MY_RECOMMENDATION = `**Q4. What happens when you tap an app while the VM is off?**

The VM dies with the app's process, so this is common.

**My recommendation:**
- **The app list is cached**, so the launcher works with the VM off.
- **A tap starts the VM**, with a splash while it boots.

Agree?`;

// Options with bold titles and prose after them; the lean comes in the closing text.
const LEAN_TOWARD = `**Q10. The live interface: read-only, or can people steer?**

- **A. Read-only page (my recommendation for v1).** Steering stays in the tracker.
- **B. Interactive page:** steer, abort and approve from the UI.
- **C. Read-only plus a few buttons**, mirrored as tracker comments.

I lean toward **C**: it's A with the controls you'll want the first time an agent loops. Which do you want?`;

// ideate's chat summary before the one-line format: the route ends each item.
const IDEATE_SUMMARY = `3 ideas, saved to \`~/notes/ideas/IDEAS.md\`

1. Sample clocks throughout each bench run
   Explains the biggest unexplained number.
   Small, build it.
2. **Bench real clients by replaying their frames**
   Synthetic content already misled one idea.
   Medium, brainstorm first.
3. Keep fence waits outside the session lock
   The main thread takes the same lock on every touch.
   Small, grill first.

- The verifier rated idea 3 weak; I kept it, ranked last.

Start with 1: its result decides whether idea 3 is worth doing.`;

// The one-line summary ideate and mine share.
const MINE_SUMMARY = `2 findings from 4 runs, saved to \`~/notes/FINDINGS.md\`

1. The default bar cuts the ideas you act on · 2/3 · S · build
2. The funnel is wide and slow for what survives · 3/3 · M · /grill-me

**Top pick: 1.** Make "worth doing" the default bar.`;

// A question that spells out "Question", a recommendation said in prose, and a closing ask.
const QUESTION_WORD = `I checked what you already run, so this one is about the bar.

**Question 1: How strict should the filter be?**

- **A. Native only:** nothing that ships a browser.
- **B. Web is fine** if it feels instant on your biggest repo.

**My recommendation: B**, with a hands-on test on the repos you use.

Do you agree?`;

// A heading with a dash as its label, options, and the recommendation on its own line.
const DASH_HEADING = `## Q2 — How many workflows should there be?

- **A.** One, with a flag.
- **B.** Two, one per kind.

Recommendation: A, since the kinds share every step.

Does A match what you meant?`;

// Options lettered in lower case and in parentheses.
const LOWER_OPTIONS = `**Q3. Where should the cache live?**

- **(a)** In memory.
- **(b)** On disk.

**Recommended:** (a)`;

// A round and its summary after a rule: prose the cards must not swallow.
const ROUND_THEN_CLOSING = `**Q1. Should it retry?**

> **Recommended:** Yes, twice.

---

**Q2. Should it log the retries?**

> **Recommended:** Yes.

---

That is every open branch. Have we reached a shared understanding?

## Next

I will write the plan to the notes once you confirm.`;

// A heading and a rule between two questions belong to the question before.
const HEADING_BETWEEN = `**Q1. Should it retry?**

> **Recommended:** Yes.

## Round two

Only the logging is left.

**Q2. Should it log?**

> **Recommended:** Yes.`;

// grilling in its emoji form: the label closes its bold, the recommendation follows an arrow.
const EMOJI_ROUND = `❓ **Q1** - **Storage**: Should the cache use SQLite?

➡️ Yes, it is one file and needs no server.

---

❓ **Q2** - **Eviction**: Evict by age or by size?

- **A.** Age.
- **B.** Size.

➡️ A, the simpler rule.`;

// A "Q" heading that asks nothing, over numbered questions that do.
const HEADING_OVER_QUESTIONS = `## Q10 — Frontmatter policy

Layout is settled. Two actual choices:

1. **Can the model invoke it on its own?** Users-only, or routed by the description.
2. **Publish it, or keep it private?** It depends on a tool only you have.

Then the last branch is left.`;

// One question and no number: lettered options under a bold lead-in, a lean, a closing ask.
const LONE_LETTERED = `Here is the tradeoff.

**Your decision: where the cache lives.**

- **A.** In memory. Fast, lost on restart.
- **B.** On disk. Slower, survives restarts.

I'd pick **A**, since restarts are rare.

Which do you want?`;

// The same with no lean: the closing question is the sign it asks.
const LONE_LETTERED_NO_LEAN = `Two ways to cut the list.

- **A.** By age.
- **B.** By size.
- **C.** By both.

Which do you want?`;

// A revised list that drops its first option and keeps the letters.
const REVISED_OPTIONS = `Option A costs more than I said, so I'd now go another way.

- **B. Keep one process per window (my recommendation).** The tools stay as they are.
- **C. Do A anyway.** Every tool needs another way to tell windows apart.
- **D. Leave it as new windows.**

Which do you want?`;

// One question at a time: a question and its recommendation, nothing to pick from.
const ONE_AT_A_TIME = `**Should the cache live in memory?**

It is small and rebuilt on start.

My recommended answer: yes, since restarts are rare.`;

// A report that ends on one offer: prose.
const LONE_OFFER = "Rebased and pushed. The branch is clean.\n\nWant me to delete the old branch?";

// Steps, then "Go, or corrections?": a list of statements, not a round.
const STEPS_THEN_GO = `Plan:

1. Add the parser.
2. Wire the card.
3. Update the docs.

Go, or corrections?`;

// A cue line above the list says its items are decisions.
const DECISIONS_FOR_YOU = `Done with the spike.

Decisions for you:

1. Should retries be capped at three
2. Should the log keep failed attempts`;

// Alternatives, a lean and a closing choice: one question whose options are the list.
const MENU_CLOSING = `Ways to close the gap:

1. **Accept it and label it:** the smallest change.
2. **Read the hourly report:** about an hour behind.
3. **Use the session logs:** real time, no price table.

I'd go with 1, or 1 plus 3. Which do you want?`;

// A line that is itself the question, over a list of things it could do.
const MENU_CUE_LINE = `The disk is the loose end. Want me to:

1. Delete the old model?
2. Commit the lock bump?
3. Move on to the next model?`;

// Open items stated as findings: prose.
const STILL_OPEN = `Still open:

- Drop the two docs commits?
- Force-push or open a new PR?`;

// The closer of a grilling is answered with "yes", and gets no card.
const SHARED_UNDERSTANDING = `That empties the frontier.

> **Recommended:** yes, write it up.

Have we reached a shared understanding?`;

// Reasons, then a recommendation paragraph: the list is not the questions.
const REASONS_THEN_LEAN = `Why nothing simpler keeps it:

1. The sandbox would need a patch.
2. A different sandbox was ruled out.
3. The bundle is the current design.

**My recommendation:** keep it as written.`;

// A numbered list that asks nothing.
const PLAIN_LIST = `Done. What changed:

1. The parser takes \`Q\` labels and numbers.
2. The review screen fills the prompt.

Tests pass.`;

// A round's format quoted inside a fence is not a round.
const FENCED_FORMAT =
  "Format a round like so:\n\n```\n**Q1. <question>**\n\n> **Recommended:** <answer>\n```\n\nThat's the whole format.";

/** `label[option keys*recommended key]`, a bare `*` for a recommendation naming no option. */
function shape(form: Form | null): string {
  if (!form) return "null";
  const one = (item: Form["items"][number]) => {
    const keys = item.options.map((option) => option.key).join(form.kind === "picks" ? "," : "");
    if (item.recommendedOption !== undefined)
      return `${item.label}[${keys}*${item.options[item.recommendedOption]?.key}]`;
    return `${item.label}[${keys}${item.recommended !== undefined ? "*" : ""}]`;
  };
  return [form.kind, ...form.items.map(one)].join(" ");
}

function formOf(text: string): Form {
  const form = parse(text);
  if (!form) throw new Error("the text asks nothing");
  return form;
}

const steps = (form: Form, actions: Action[], start?: Draft) =>
  actions.reduce((draft, action) => apply(form, draft, action), start ?? newDraft(form));

const pick = (entry: number): Action => ({ do: "pick", entry });
const note = (text: string): Action => ({ do: "note", text });
const write = (text: string): Action => ({ do: "write", text });
const FORWARD: Action = { do: "forward" };
const NEXT: Action = { do: "next" };
const ACCEPT: Action = { do: "accept" };
const REVIEW: Action = { do: "review" };

const itemOf = (form: Form, draft: Draft) => {
  const { item } = view(form, draft);
  if (!item) throw new Error("the review shows no item");
  return item;
};

describe("parse", () => {
  test.each([
    [GRILLING_ROUND, "round Q1[ABC*A] Q2[*] Q3[AB]"],
    [ROUND_AFTER_RESEARCH, "round Q19[*] Q25[*]"],
    [NUMBERED_QUESTIONS, "round 1[] 2[*] 3[*]"],
    [SINGLE_QUESTION, "round Q18[*]"],
    [MY_RECOMMENDATION, "round Q4[*]"],
    [LEAN_TOWARD, "round Q10[ABC*C]"],
    [
      IDEATE_SUMMARY,
      "picks 1[build*build] 2[build,/brainstorm*/brainstorm] 3[build,/grill-me*/grill-me]",
    ],
    [MINE_SUMMARY, "picks 1[build*build] 2[build,/grill-me*/grill-me]"],
    [QUESTION_WORD, "round Q1[AB*B]"],
    [DASH_HEADING, "round Q2[AB*A]"],
    [LOWER_OPTIONS, "round Q3[AB*A]"],
    [ROUND_THEN_CLOSING, "round Q1[*] Q2[*]"],
    [HEADING_BETWEEN, "round Q1[*] Q2[*]"],
    [EMOJI_ROUND, "round Q1[*] Q2[AB*A]"],
    [HEADING_OVER_QUESTIONS, "round 1[] 2[]"],
    [LONE_LETTERED, "round Q1[AB*A]"],
    [LONE_LETTERED_NO_LEAN, "round Q1[ABC]"],
    [REVISED_OPTIONS, "round Q1[BCD*B]"],
    [ONE_AT_A_TIME, "round Q1[*]"],
    [LONE_OFFER, "null"],
    [STEPS_THEN_GO, "null"],
    [DECISIONS_FOR_YOU, "round 1[] 2[]"],
    [MENU_CLOSING, "round Q1[123*1]"],
    [MENU_CUE_LINE, "round Q1[123]"],
    [STILL_OPEN, "null"],
    [SHARED_UNDERSTANDING, "null"],
    [REASONS_THEN_LEAN, "null"],
    [PLAIN_LIST, "null"],
    [FENCED_FORMAT, "null"],
  ])("each ending parses to its shape (%#)", (text, expected) => {
    expect(shape(parse(text))).toBe(expected);
  });

  test("a question keeps its context and drops what the form draws itself", () => {
    const [q1, q2] = formOf(GRILLING_ROUND).items;
    expect(q1?.title).toBe(
      'Should every focus default to "worth doing, ranked by payoff per effort"?',
    );
    expect(q1?.options[1]?.text).toBe(
      'Default by kind: features get "worth doing", refactors keep big swings.',
    );
    expect(q1?.body).toBe("");
    expect(q2?.recommended).toBe(
      "Yes. Each run threw away about 85% of its candidates, and four generators still give 20–24.",
    );
    const first = formOf(NUMBERED_QUESTIONS).items[0];
    expect(first?.title).toBe("What should it do for you?");
    expect(first?.body).toBe("Help you discover things, or warn you about state?");
    expect(formOf(ROUND_AFTER_RESEARCH).items[0]?.body).toContain("| Hotspots | churn × size |");
  });

  test("a label bolded apart from its title keeps the whole title", () => {
    const options = "- **A.** Yes\n- **B.** No\n\n";
    const form = formOf(
      `**Q1.** **Should X?**\n\n${options}**Q2.** Use **bold** word here?\n\n${options}`,
    );
    expect(form.items.map((item) => item.title)).toEqual(["Should X?", "Use bold word here?"]);
  });

  test("a bold option title leaves its prose as detail", () => {
    const [a, b] = formOf(LEAN_TOWARD).items[0]?.options ?? [];
    expect(a?.text).toBe("Read-only page (my recommendation for v1).");
    expect(a?.detail).toBe("Steering stays in the tracker.");
    expect(b?.text).toBe("Interactive page:");
  });

  test("a pick keeps its title apart from its fields", () => {
    const [one, two] = formOf(MINE_SUMMARY).items;
    expect(one?.title).toBe("The default bar cuts the ideas you act on");
    expect(one?.body).toBe("2/3 · S · build");
    expect(formOf(IDEATE_SUMMARY).items[1]?.title).toBe(
      "Bench real clients by replaying their frames",
    );
    expect(two?.recommended).toBe("route it to /grill-me");
  });

  test("reads a pick said in passing", () => {
    const options = "- **A.** Flatten it.\n- **B.** Keep the grouping.\n";
    for (const text of [
      `**Q1. Which?**\n\nI'd go with A, since B buys nothing.\n\n${options}`,
      "**Q1. Which?**\n\n- **A.** Flatten it (my pick, and the smaller change).\n- **B.** Keep it.\n",
    ])
      expect(formOf(text).items[0]?.recommendedOption).toBe(0);
  });

  test("a bold in an option's words leaves the option whole", () => {
    const item = formOf(
      "**Q1. Which?**\n\n- **A.** Read the `Location` header: **simpler** for callers.\n- **B. Keep it.** It works.\n",
    ).items[0];
    expect(item?.options[0]).toMatchObject({
      text: "Read the `Location` header: **simpler** for callers.",
      detail: "",
    });
    expect(item?.options[1]).toMatchObject({ text: "Keep it.", detail: "It works." });
  });

  test("line endings from another system parse the same", () => {
    expect(shape(parse(GRILLING_ROUND.replaceAll("\n", "\r\n")))).toBe(
      shape(parse(GRILLING_ROUND)),
    );
  });
});

describe("what the cards leave out", () => {
  const ALL = [
    GRILLING_ROUND,
    ROUND_AFTER_RESEARCH,
    NUMBERED_QUESTIONS,
    SINGLE_QUESTION,
    MY_RECOMMENDATION,
    LEAN_TOWARD,
    IDEATE_SUMMARY,
    MINE_SUMMARY,
    QUESTION_WORD,
    DASH_HEADING,
    LOWER_OPTIONS,
    ROUND_THEN_CLOSING,
    HEADING_BETWEEN,
    EMOJI_ROUND,
    HEADING_OVER_QUESTIONS,
    LONE_LETTERED,
    LONE_LETTERED_NO_LEAN,
    REVISED_OPTIONS,
    ONE_AT_A_TIME,
    DECISIONS_FOR_YOU,
    MENU_CLOSING,
    MENU_CUE_LINE,
  ];
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];

  /** The lines of a message whose words the head, the items and the tail do not carry. */
  function hidden(text: string): string[] {
    const form = formOf(text);
    const lines = text.split("\n");
    const head = lines.slice(0, startLines(text)[0] ?? 0).join("\n");
    const drawn = [head, tailOf(text)];
    for (const item of form.items) {
      drawn.push(item.label, item.title, item.body, item.recommended ?? "");
      for (const option of item.options) drawn.push(option.text, option.detail);
    }
    const have = new Set(words(drawn.join("\n")));
    return lines.filter((line) => {
      const ws = words(line);
      return ws.length >= 3 && ws.filter((word) => !have.has(word)).length / ws.length > 0.5;
    });
  }

  test.each(ALL.map((text, i) => [i, text] as const))(
    "every line of a parsed message is drawn somewhere (%#)",
    (_, text) => {
      expect(hidden(text)).toEqual([]);
    },
  );

  test("what follows the last question after a rule or heading is the tail", () => {
    expect(tailOf(ROUND_THEN_CLOSING)).toBe(
      "That is every open branch. Have we reached a shared understanding?\n\n## Next\n\nI will write the plan to the notes once you confirm.",
    );
    expect(tailOf(GRILLING_ROUND)).toBe("");
    expect(tailOf(PLAIN_LIST)).toBe("");
  });

  test("a heading between two questions stays with the question before", () => {
    const [q1] = formOf(HEADING_BETWEEN).items;
    expect(q1?.body).toContain("## Round two");
    expect(q1?.body).toContain("Only the logging is left.");
    expect(tailOf(HEADING_BETWEEN)).toBe("");
  });

  test("the lines after a pick list are the tail", () => {
    expect(tailOf(IDEATE_SUMMARY)).toBe(
      "- The verifier rated idea 3 weak; I kept it, ranked last.\n\nStart with 1: its result decides whether idea 3 is worth doing.",
    );
  });

  test("a message cut at its items, head and tail covers every line once", () => {
    for (const text of ALL) {
      const lines = text.split("\n");
      const found = split(text);
      expect(found?.starts).toEqual(startLines(text));
      expect(found?.tail).toBeGreaterThan(found?.starts.at(-1) ?? lines.length);
      expect(found?.tail).toBeLessThanOrEqual(lines.length);
    }
  });
});

describe("a question with no number of its own", () => {
  test("the lead-in is the title, the closing ask stays with it, and the reply is the answer alone", () => {
    const item = formOf(LONE_LETTERED).items[0];
    expect(item?.title).toBe("Your decision: where the cache lives.");
    expect(item?.unlabelled).toBe(true);
    expect(item?.body).toContain("Which do you want?");
    const form = formOf(LONE_LETTERED);
    expect(reply(form, steps(form, [pick(1)]))).toBe("B");
    expect(reply(form, steps(form, [pick(1), note("restarts happen weekly")]))).toBe(
      "B\n    Note: restarts happen weekly",
    );
    expect(reply(form, steps(form, [ACCEPT]))).toBe("yes");
    expect(reply(form, steps(form, [write("neither, use redis")]))).toBe("neither, use redis");
  });

  test("a numbered question keeps its label in the reply", () => {
    const form = formOf(SINGLE_QUESTION);
    expect(reply(form, steps(form, [write("no")]))).toBe("Q18: no");
  });

  test("a question and a recommendation with no options is a yes", () => {
    const form = formOf(ONE_AT_A_TIME);
    expect(form.items[0]?.title).toBe("Should the cache live in memory?");
    expect(form.items[0]?.recommended).toBe("yes, since restarts are rare.");
    expect(reply(form, steps(form, [ACCEPT]))).toBe("yes");
  });

  test("a revised list keeps its letters and the lean counts from the first of them", () => {
    const [item] = formOf(REVISED_OPTIONS).items;
    expect(item?.options.map((option) => option.key)).toEqual(["B", "C", "D"]);
    expect(item?.recommendedOption).toBe(0);
  });
});

describe("a list of alternatives", () => {
  test("is one question whose options keep the numbers the list printed", () => {
    const [item] = formOf(MENU_CLOSING).items;
    expect(item?.title).toBe("Which do you want?");
    expect(item?.recommended).toBe("I'd go with 1, or 1 plus 3.");
    expect(item?.options.map((option) => option.key)).toEqual(["1", "2", "3"]);
    expect(item?.options[0]?.text).toBe("Accept it and label it:");
    expect(item?.options[0]?.detail).toBe("the smallest change.");
    expect(item?.recommendedOption).toBe(0);
    const form = formOf(MENU_CLOSING);
    expect(reply(form, steps(form, [pick(2)]))).toBe("3");
  });

  test("several are answered through the write-in: there is no pick-several", () => {
    const form = formOf(MENU_CLOSING);
    expect(reply(form, steps(form, [write("1 and 3")]))).toBe("1 and 3");
    expect(form.items[0]?.recommendedOptions).toBeUndefined();
  });

  test("a line that is the question over the list is its title", () => {
    const [item] = formOf(MENU_CUE_LINE).items;
    expect(item?.title).toBe("Want me to");
    expect(item?.options.map((option) => option.text)).toEqual([
      "Delete the old model?",
      "Commit the lock bump?",
      "Move on to the next model?",
    ]);
  });

  test("every item has a start the harness can cut the message at", () => {
    for (const text of [
      MENU_CLOSING,
      MENU_CUE_LINE,
      LONE_LETTERED,
      ONE_AT_A_TIME,
      GRILLING_ROUND,
    ]) {
      const form = formOf(text);
      expect(startLines(text)).toHaveLength(form.items.length);
    }
  });
});

describe("startLines", () => {
  test("names the line each of the form's items starts on", () => {
    const lines = GRILLING_ROUND.split("\n");
    const starts = startLines(GRILLING_ROUND);
    expect(starts.map((line) => lines[line]?.slice(0, 6))).toEqual(["**Q1. ", "**Q2. ", "**Q3. "]);
    expect(starts).toHaveLength(parse(GRILLING_ROUND)?.items.length ?? 0);
  });
});

describe("apply", () => {
  test("answering steps through the items to the review", () => {
    const form = formOf(GRILLING_ROUND);
    let draft = steps(form, [pick(1), FORWARD]);
    expect(draft.step).toBe(1);
    // Q3 recommends nothing, so its entries are its options and a write-in.
    draft = steps(form, [pick(0), FORWARD, write("  keep it  ")], draft);
    expect(isReview(form, draft)).toBe(true);
    expect(go(form, draft, 99).step).toBe(3);
    expect(go(form, draft, -1).step).toBe(0);
    expect(reply(form, draft)).toBe("Q1: B\nQ2: yes\nQ3: keep it");
  });

  test("picking a write-in records nothing until it is written", () => {
    const form = formOf(GRILLING_ROUND);
    const writeIn = entries(form.items[0]!).length - 1;
    expect(steps(form, [pick(writeIn)])).toEqual(newDraft(form));
  });

  test("a note, an overall note and a write-in of several lines stay one block in the reply", () => {
    const form = formOf(GRILLING_ROUND);
    expect(reply(form, steps(form, [note("a\nb\nc"), write("first\nsecond")]))).toBe(
      "Q1: first\n    second\n    Note: a\n          b\n          c",
    );
    expect(reply(form, steps(form, [pick(0), REVIEW, note("x\ny")]))).toBe(
      "Q1: A\nOverall: x\n         y",
    );
  });

  test("a round of recommendations collapses to yes unless something else is said", () => {
    const form = formOf(ROUND_AFTER_RESEARCH);
    const draft = steps(form, [pick(0), FORWARD, pick(0), FORWARD]);
    expect(reply(form, draft)).toBe("yes");
    expect(reply(form, apply(form, draft, note("also look at subtraction")))).toBe(
      "Q19: yes\nQ25: yes\nOverall: also look at subtraction",
    );
  });

  test.each(["No. A plain reply is enough.", "Not yet, wait for the results."])(
    "a prose recommendation keeps its words in the card, review and reply: %s",
    (recommendation) => {
      const form = formOf(`**Q10. Show a separate card?**\n\n> **Recommended:** ${recommendation}`);
      const draft = steps(form, [pick(0)]);
      const current = view(form, draft);
      expect(current.item?.entries[0]).toMatchObject({ text: recommendation, isChosen: true });
      expect(current.item?.accepts).toBe("");
      expect(current.review[0]?.shown).toBe(recommendation);
      expect(reply(form, draft)).toBe(`Q10: ${recommendation}`);
    },
  );

  test("a skipped question stays out of the reply and a note rides on its answer", () => {
    const form = formOf(GRILLING_ROUND);
    // Picking the recommended letter is still the recommendation.
    const draft = steps(form, [
      pick(0),
      note("but keep the flag"),
      FORWARD,
      { do: "skip" },
      pick(1),
    ]);
    expect(reply(form, draft)).toBe("Q1: A\n    Note: but keep the flag\nQ3: B");
    // A note with no answer says so, so it can't read as a write-in.
    expect(reply(form, steps(form, [note("depends on Q3")]))).toBe(
      "Q1: no answer yet\n    Note: depends on Q3",
    );
    expect(reply(form, newDraft(form))).toBe("");
  });

  test("picks group the builds and route the rest", () => {
    const form = formOf(IDEATE_SUMMARY);
    const draft = steps(form, [pick(0), FORWARD, pick(0), FORWARD, pick(1), FORWARD]);
    expect(reply(form, draft)).toBe("do 1, 2\n3 → /grill-me");
    const other = steps(form, [pick(0), note("measure first"), FORWARD, write("merge with 3")]);
    expect(reply(form, other)).toBe("do 1\n    Note: measure first\n2: merge with 3");
  });

  test("going on finds the next item unanswered and then the review", () => {
    const form = formOf(GRILLING_ROUND);
    const answer = (entry: number) => [pick(entry), NEXT];
    let draft = steps(form, [FORWARD, ...answer(0)]);
    expect(draft.step).toBe(2);
    // Nothing is left after Q3, so it looks from the top; with nothing there either, the review.
    draft = apply(form, draft, write("keep"));
    expect(draft.step).toBe(0);
    expect(isReview(form, steps(form, answer(1), draft))).toBe(true);
    // A pick that stayed for its note goes on the same way; the review has nowhere to go.
    expect(steps(form, [pick(0), NEXT]).step).toBe(1);
    expect(isReview(form, steps(form, [REVIEW, NEXT]))).toBe(true);
    // An empty write-in clears and stays.
    expect(steps(form, [write(" ")]).step).toBe(0);
  });

  test("a recommendation naming several letters is accepted as all of them", () => {
    const options = [..."ABCDEF"].map((letter) => `- **${letter}.** Item ${letter}.\n`).join("");
    for (const [saying, keys] of [
      ["A, B and D now; C is cosmetic and E can wait.", "A, B, D"],
      ["A through C now; F goes to later.", "A, B, C"],
      ["**A** and **C**.", "A, C"],
    ] as const) {
      const form = formOf(`**Q1. Which go in?**\n\n${options}\n> **Recommended:** ${saying}\n`);
      const item = itemOf(form, newDraft(form));
      expect(item.isSeveral && item.canAccept).toBe(true);
      expect(
        item.entries
          .filter((entry) => entry.isRecommended)
          .map((entry) => entry.key)
          .join(", "),
      ).toBe(keys);
      expect(reply(form, steps(form, [pick(0)]))).toBe("Q1: A");
      expect(reply(form, steps(form, [ACCEPT]))).toBe("yes");
      expect(reply(form, steps(form, [ACCEPT, pick(5)]))).toBe("Q1: F");
    }
    // One letter is still one pick, and a sentence that starts on "A" names none.
    const single = formOf(GRILLING_ROUND);
    expect(reply(single, steps(single, [ACCEPT]))).toBe("Q1: A");
    expect(itemOf(single, newDraft(single)).isSeveral).toBe(false);
    expect(steps(single, [FORWARD, FORWARD, ACCEPT])).toEqual(steps(single, [FORWARD, FORWARD]));
  });

  test("what cannot apply changes nothing and an unknown word is refused", () => {
    const form = formOf(GRILLING_ROUND);
    expect(steps(form, [pick(99)])).toEqual(newDraft(form));
    // The review shows no item to write an answer for.
    expect(steps(form, [REVIEW, write("late")])).toEqual(steps(form, [REVIEW]));
    expect(() => steps(form, [{ do: "explode" } as unknown as Action])).toThrow("no such action");
  });
});

describe("view", () => {
  test("says all a surface draws of an item", () => {
    const form = formOf(GRILLING_ROUND);
    const shown = view(form, steps(form, [pick(1)]));
    expect([shown.title, shown.count, shown.answered, shown.isReview]).toEqual([
      "Answer 3 questions",
      3,
      1,
      false,
    ]);
    const rows = shown.item?.entries ?? [];
    expect(rows.map((entry) => entry.kind)).toEqual(["option", "option", "option", "write"]);
    expect(rows[1]?.text).toBe(
      'B. Default by kind: features get "worth doing", refactors keep big swings.',
    );
    expect(rows.map((entry) => entry.isRecommended)).toEqual([true, false, false, false]);
    expect(rows.map((entry) => entry.isChosen)).toEqual([false, true, false, false]);
    expect(shown.item?.start).toBe(1);
  });

  test("starts on the recommendation and words a review", () => {
    const form = formOf(GRILLING_ROUND);
    expect(itemOf(form, newDraft(form)).start).toBe(0);
    // Its recommendation already says yes, so the entry does not say it again.
    expect(itemOf(form, steps(form, [FORWARD])).entries[0]?.text).toBe(
      "Yes. Each run threw away about 85% of its candidates, and four generators still give 20–24.",
    );
    const review = view(form, steps(form, [pick(1), FORWARD, FORWARD, write("keep"), REVIEW]));
    expect(review.item).toBeNull();
    expect(review.isReview).toBe(true);
    expect(review.review.map((row) => row.isAnswered)).toEqual([true, false, true]);
    expect(review.review[2]?.shown).toBe('"keep"');
  });

  test("the review names each question and shows its answer as plain words", () => {
    const form = formOf(GRILLING_ROUND);
    const row = view(form, steps(form, [pick(1), REVIEW])).review[0];
    expect(row?.title).toBe(
      'Should every focus default to "worth doing, ranked by payoff per effort"?',
    );
    expect(plain("a `429` with **Retry-After**,\n  now")).toBe("a 429 with Retry-After, now");
    expect(row?.shown).not.toMatch(/[`*]/);
  });

  test("an option's entry carries its printed letter; a write-in, a yes and a pick list's rows carry none", () => {
    const form = formOf(GRILLING_ROUND);
    const keys = itemOf(form, newDraft(form)).entries.map((entry) => entry.key);
    expect(keys[0]).toBe("A");
    expect(keys.at(-1)).toBe("");
    expect(itemOf(form, steps(form, [FORWARD])).entries[0]?.key).toBe("");
    const picks = formOf(IDEATE_SUMMARY);
    expect(itemOf(picks, newDraft(picks)).entries.every((entry) => entry.key === "")).toBe(true);
  });

  test("only recommendations that name options have recommended option keys", () => {
    const form = formOf(GRILLING_ROUND);
    expect(itemOf(form, newDraft(form)).accepts).toMatch(/^[A-H](, [A-H])*$/);
    expect(itemOf(form, steps(form, [FORWARD])).accepts).toBe("");
  });

  test("shows why an option is recommended", () => {
    const form = formOf(GRILLING_ROUND);
    expect(itemOf(form, newDraft(form)).recommended.startsWith("A. ")).toBe(true);
    // With no options the recommendation is the accept entry, not said twice.
    expect(itemOf(form, steps(form, [FORWARD])).recommended).toBe("");
  });

  test("a recommendation beside options is said and never an entry", () => {
    const form = formOf(
      "**Q1. Which go in?**\n\n- **A.** Log.\n- **B.** Cooldown.\n- **C.** Canary.\n\n> **Recommended:** A and B now, C later.\n",
    );
    const item = itemOf(form, newDraft(form));
    expect(item.entries.map((entry) => entry.kind)).toEqual([
      "option",
      "option",
      "option",
      "write",
    ]);
    expect(item.recommended).toBe("A and B now, C later.");
  });

  test("is plain data a harness can keep between turns", () => {
    const form = formOf(GRILLING_ROUND);
    const shown = view(form, steps(form, [pick(1), note("why")]));
    expect(JSON.parse(JSON.stringify(shown))).toEqual(shown);
  });
});

describe("what a session holds", () => {
  const held = (text: string, was: Held | null = null) => {
    const now = offer(was, text);
    if (!now) throw new Error("nothing is held");
    return now;
  };

  test("a new round replaces the form and the same one keeps its answers", () => {
    const answered = step(held(GRILLING_ROUND), pick(1));
    expect(viewOf(offer(answered, GRILLING_ROUND))?.answered).toBe(1);
    expect(viewOf(offer(answered, MINE_SUMMARY))?.answered).toBe(0);
  });

  test("a turn that asks nothing leaves the round waiting", () => {
    const answered = step(held(GRILLING_ROUND), pick(1));
    expect(viewOf(offer(answered, PLAIN_LIST))?.answered).toBe(1);
    expect(offer(null, PLAIN_LIST)).toBeNull();
  });

  test("a step aimed at an older form lands on nothing", () => {
    const old = viewOf(held(GRILLING_ROUND))?.id;
    const next = held(MINE_SUMMARY, held(GRILLING_ROUND));
    expect(viewOf(step(next, pick(0), old))?.answered).toBe(0);
    expect(viewOf(step(next, pick(0), viewOf(next)?.id))?.answered).toBe(1);
  });

  test("the same round is named the same, and another differently", () => {
    expect(viewOf(held(GRILLING_ROUND))?.id).toBe(viewOf(held(GRILLING_ROUND))?.id);
    expect(viewOf(held(GRILLING_ROUND))?.id).not.toBe(viewOf(held(LEAN_TOWARD))?.id);
  });

  test("has work only once something is answered or noted", () => {
    expect(hasWork(held(GRILLING_ROUND))).toBe(false);
    expect(hasWork(step(held(GRILLING_ROUND), pick(1)))).toBe(true);
    expect(hasWork(step(held(GRILLING_ROUND), note("depends on Q3")))).toBe(true);
    expect(hasWork(step(step(held(GRILLING_ROUND), REVIEW), note("thanks")))).toBe(true);
    // A skip and a whitespace-only write-in say nothing; a pick list's own pick says something.
    expect(hasWork(step(held(GRILLING_ROUND), { do: "skip" }))).toBe(false);
    expect(hasWork(step(held(GRILLING_ROUND), write("   ")))).toBe(false);
    expect(hasWork(step(held(MINE_SUMMARY), pick(0)))).toBe(true);
  });
});
