/** The list's stories. No host imports. */
import type { KitStory } from "../stories.ts";
import type { ListGroup, ListMark } from "./contract.ts";
import { list } from "./terminal.ts";

const row = (text: string, mark: ListMark = "open", aside = "", focused = false) => ({
  text,
  mark,
  aside,
  focused,
  hit: `row:${text.slice(0, 12)}`,
});

const GROUPS: ListGroup[] = [
  {
    label: "docs/agent-hub.md",
    count: "2",
    done: true,
    rows: [
      row("Unittest suite needs a short `TMPDIR` and markdown-it-py on the path", "chosen", "2×"),
      row("Socket tests fail with AF_UNIX path too long", "dropped"),
    ],
  },
  {
    label: "docs/agents.md",
    count: "3",
    active: true,
    rows: [
      row(
        "pi's permission gate cannot resolve shell variables, so a path in one is read",
        "open",
        "3×",
        true,
      ),
      row("The hub migration plan is finished"),
      row("Agents never read the store README"),
    ],
  },
  {
    label: "skills/agent-plugin-dev/references/a-very-long-folder-name/style.md",
    count: "1",
    rows: [row("東京の節は古くなっています。全角文字の説明文", "open", "12×")],
  },
];

/** Many groups of many rows, the keyboard well down the list. */
const many = (focus: number): ListGroup[] =>
  Array.from({ length: 8 }, (_, g) => ({
    label: `docs/page-${g + 1}.md`,
    count: "4",
    active: Math.floor(focus / 4) === g,
    rows: Array.from({ length: 4 }, (_, r) =>
      row(
        `Claim ${g * 4 + r + 1} about page ${g + 1}`,
        "open",
        r % 2 ? "2×" : "",
        g * 4 + r === focus,
      ),
    ),
  }));

export const listStories: KitStory[] = [
  {
    component: "grouped-list",
    state: "groups",
    about:
      "Rows under group rows behind rails: a decided group's rail green, the keyboard's bright, its label in the accent",
    settings: "list({groups})",
    extreme: true,
    lines: (width) => list({ groups: GROUPS }, width),
  },
  {
    component: "grouped-list",
    state: "window",
    about:
      "Taller than its room: the keyboard's group row stays at the top, the last row says what is hidden",
    settings: 'list({groups, height: 9, noun: ["doc", "docs"]})',
    lines: (width) => list({ groups: many(13), height: 9, noun: ["doc", "docs"] }, width),
  },
  {
    component: "grouped-list",
    state: "sticky",
    about: "The keyboard below its group's room: the group row stays on top of the rows it scrolls",
    settings: "list({groups, height: 5})",
    lines: (width) => list({ groups: many(3), height: 5, noun: ["doc", "docs"] }, width),
  },
];
