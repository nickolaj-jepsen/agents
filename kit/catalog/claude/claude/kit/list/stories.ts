/** The list's stories. No host imports. */
import type { KitStory } from "../stories.ts";
import type { ListGroup, ListMark } from "./contract.ts";
import { list, listFollow } from "./terminal.ts";

const row = (text: string, mark: ListMark = "open", aside = "", focused = false) => ({
  text,
  mark,
  aside,
  focused,
  hit: `row:${text.slice(0, 12)}`,
  markHit: `mark:${text.slice(0, 12)}`,
});

const actions = [
  { label: "Apply all", hit: "all:apply" },
  { label: "Dismiss all", hit: "all:dismiss" },
];

const GROUPS: ListGroup[] = [
  {
    label: "docs/agent-hub.md",
    done: true,
    rows: [
      row("Unittest suite needs a short `TMPDIR` and markdown-it-py on the path", "chosen", "2×"),
      row("Socket tests fail with AF_UNIX path too long", "dropped"),
    ],
  },
  {
    label: "docs/agents.md",
    active: true,
    actions,
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
    rows: [row("東京の節は古くなっています。全角文字の説明文", "open", "12×")],
  },
];

/** Many groups of many rows, the keyboard on row `focus`. */
const many = (focus: number): ListGroup[] =>
  Array.from({ length: 8 }, (_, g) => ({
    label: `docs/page-${g + 1}.md`,
    active: Math.floor(focus / 4) === g,
    actions: Math.floor(focus / 4) === g ? actions : undefined,
    rows: Array.from({ length: 4 }, (_, r) =>
      row(
        `Claim ${g * 4 + r + 1} about page ${g + 1}`,
        "open",
        r % 2 ? "2×" : "",
        g * 4 + r === focus,
      ),
    ),
  }));

/** A window that has followed the keyboard down to row `focus`, as a client keeps it. */
const followed = (focus: number, height: number) => {
  const l = { groups: many(focus), height, noun: ["doc", "docs"] as const, aside: 3 };
  let top = 0;
  for (let f = 0; f <= focus; f++) top = listFollow({ ...l, groups: many(f), top });
  return { ...l, top };
};

export const listStories: KitStory[] = [
  {
    component: "grouped-list",
    state: "groups",
    about:
      "Rows under group rows behind rails: a decided group's rail green, the keyboard's bright with its label in the accent and its controls",
    settings: "list({groups, aside: 3})",
    extreme: true,
    lines: (width) => list({ groups: GROUPS, aside: 3 }, width),
  },
  {
    component: "grouped-list",
    state: "window",
    about:
      "Taller than its room: a window that moved only as far as the keyboard needed, its last row saying what is hidden",
    settings: 'list({groups, height: 9, top, noun: ["doc", "docs"]})',
    lines: (width) => list(followed(13, 9), width),
  },
  {
    component: "grouped-list",
    state: "sticky",
    about: "The keyboard's group row stands in for the window's first row when it is above it",
    settings: "list({groups, height: 6, top: 2})",
    lines: (width) =>
      list({ groups: many(4 + 3), height: 6, top: 7, noun: ["doc", "docs"], aside: 3 }, width),
  },
  {
    component: "grouped-list",
    state: "flat",
    about: "Little room: each row carries its group's label, dim, cut from the left",
    settings: "list({groups, height: 3, flat: true})",
    lines: (width) => list({ groups: GROUPS, height: 3, flat: true, aside: 3 }, width),
  },
];
