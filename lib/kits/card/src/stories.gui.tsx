/** The question card's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { choice, choiceList, closing, heading, note, sections, steps, summary } from "./gui.tsx";
import { ITEMS, QUESTION, WRITTEN, liveChoices } from "./stories.ts";

const hits = { count: "count", fill: "fill" };

export const cardGuiStories: GuiStories = {
  choices: (g) => choiceList(g, { items: ITEMS, chosen: [1] }),
  checkboxes: (g) => choiceList(g, { items: ITEMS, multiple: true, chosen: [0, 2], focus: 1 }),
  live: (g) => choiceList(g, liveChoices),
  form: (g) =>
    sections(
      g,
      heading(g, { label: "Q1", title: QUESTION, answered: true }),
      choice(g, {
        key: "A",
        text: "The whole transcript",
        aside: "Recommended",
        chosen: true,
        hit: "a",
      }),
      choiceList(g, { items: ITEMS.slice(1), chosen: [] }),
      note(g, { value: "" }),
    ),
  fields: (g) => {
    // One field per line, as VS Code needs: the answer's second line and the note's, still empty.
    const options = { lines: 2, invitation: "Type an answer" };
    return sections(
      g,
      choice(
        g,
        { key: "D", text: WRITTEN.answer, literal: true, chosen: true, hit: "write" },
        options,
      ),
      note(g, { value: WRITTEN.note, hit: "note" }, { lines: 2, invitation: "Type a note" }),
    );
  },
  closing: (g) =>
    sections(
      g,
      closing(g, { answered: 0, total: 3, hits }),
      closing(g, { answered: 2, total: 3, canFill: true, hits }),
      note(g, { value: "Ship the 東京 cluster last.", hit: "note" }),
      closing(g, { answered: 3, total: 3, sent: true }),
    ),
  review: (g) =>
    sections(
      g,
      steps(g, [
        { short: "1", name: "Storage", done: true, hit: "step:0" },
        { short: "2", name: "Retention", done: true, hit: "step:1" },
        { short: "Review", current: true, hit: "step:2" },
      ]),
      summary(g, {
        label: "1",
        title: "Storage",
        values: [{ text: "Postgres beside the app" }],
        hit: "summary:0",
      }),
      summary(g, {
        label: "2",
        title: "Retention with **bold** and `code`",
        values: [{ text: "The last turn only" }, { text: "Until the disk fills", literal: true }],
        note: "履歴は保存されますが、古い出力は要約されます。",
        hit: "summary:1",
      }),
      summary(g, { label: "3", title: "Backups", values: [], hit: "summary:2" }),
    ),
};
