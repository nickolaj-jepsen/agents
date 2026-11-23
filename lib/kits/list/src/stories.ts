/** The list's stories. No host imports. */
import type { Story } from "@agents/kit-core/stories.ts";
import type { List, ListGroup, ListMark, ListRow } from "./contract.ts";

const row = (
  text: string,
  mark: ListMark = "open",
  aside = "",
  focused = false,
  icon?: ListRow["icon"],
): ListRow => ({
  text,
  mark,
  aside,
  focused,
  hit: `row:${text.slice(0, 12)}`,
  markHit: `mark:${text.slice(0, 12)}`,
  ...(icon ? { icon } : {}),
});

export const actions = [
  { label: "Apply all", hotkey: "", hit: "all:apply" },
  { label: "Dismiss all", hotkey: "", hit: "all:dismiss" },
];

export const GROUPS: ListGroup[] = [
  {
    label: "docs/agent-hub.md",
    done: true,
    rows: [
      row(
        "Unittest suite needs a short `TMPDIR` and markdown-it-py on the path",
        "chosen",
        "2×",
        false,
        "decision:apply",
      ),
      row("Socket tests fail with AF_UNIX path too long", "dropped", "", false, "decision:dismiss"),
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
        "kind:wrong",
      ),
      row("The hub migration plan is finished", "open", "", false, "kind:stale"),
      row("Agents never read the store README", "open", "", false, "kind:missing"),
    ],
  },
  {
    label: "skills/agent-plugin-dev/references/a-very-long-folder-name/style.md",
    rows: [row("東京の節は古くなっています。全角文字の説明文", "open", "12×", false, "kind:stale")],
  },
];

/** A menu of actions with digit keys, some not available now and saying why. */
export const MENU: ListGroup[] = [
  {
    label: "Actions",
    active: true,
    rows: [
      {
        text: "Commit the staged changes",
        key: "1",
        mark: "none",
        focused: true,
        hit: "menu:1",
        action: "Commit",
      },
      {
        text: "Push `main` to origin",
        key: "2",
        mark: "none",
        aside: "2 ahead",
        hit: "menu:2",
        action: "Push",
      },
      { text: "Open a worktree", key: "3", mark: "none", hit: "menu:3" },
      {
        text: "Land a worktree",
        key: "4",
        mark: "none",
        aside: "no worktree",
        disabled: true,
        hit: "menu:4",
      },
    ],
  },
];

/** Many groups of many rows, the keyboard on row `focus`. */
export const many = (focus: number): ListGroup[] =>
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

/** What the terminal adds: the window follows the keyboard down to row `follow`, as a client keeps it. */
export type TerminalExt = { extreme?: true; follow?: number };

/** What the graphical drawing adds: what a row opened in place holds, described as data. */
export type GuiExt = {
  opened?: {
    [hit: string]: {
      meta: string;
      sections: { heading: string; text: string }[];
      /** The Buttons under it, the chosen one standing out. */
      choices: { label: string; hit: string; isChosen?: boolean }[];
    };
  };
};

const model = (l: List): List => l;

export const listStories: Story<List, TerminalExt, GuiExt>[] = [
  {
    component: "grouped-list",
    state: "groups",
    about:
      "Rows under group rows behind rails: a decided group's rail green, the keyboard's bright with its label in the accent and its controls",
    settings: "list({groups, aside: 3})",
    model: model({ groups: GROUPS, aside: 3 }),
    ext: { terminal: { extreme: true } },
  },
  {
    component: "grouped-list",
    state: "opened",
    about:
      "A row opened in place sits in a panel with its detail and what to do with it; its Button says Close and the chosen decision stands out",
    settings: "list({groups, opened: {[hit]: …}})",
    model: model({ groups: GROUPS, opened: { [GROUPS[1]?.rows[0]?.hit ?? ""]: "detail" } }),
    ext: {
      gui: {
        opened: {
          [GROUPS[1]?.rows[0]?.hit ?? ""]: {
            meta: "seen 3× · 2 days ago",
            sections: [
              {
                heading: "Evidence",
                text: "The path projection resolves only `HOME` and `PWD`.",
              },
            ],
            choices: [
              { label: "apply", hit: "apply" },
              { label: "dismiss", hit: "dismiss", isChosen: true },
              { label: "skip", hit: "skip" },
            ],
          },
        },
      },
    },
  },
  {
    component: "grouped-list",
    state: "capped",
    about: "A long group shows a few rows, then a Show N more control",
    settings: "list({groups, lines: 1, maxItems: 3, more})",
    model: model({
      groups: many(13),
      lines: 1,
      maxItems: 3,
      more: { isAll: false, hit: "more" },
    }),
  },
  {
    component: "grouped-list",
    state: "window",
    about:
      "Taller than its room: a window that moved only as far as the keyboard needed, its last row saying how many rows are above and below",
    settings: "list({groups, height: 9, top})",
    model: model({ groups: many(13), height: 9, aside: 3 }),
    ext: { terminal: { follow: 13 } },
  },
  {
    component: "grouped-list",
    state: "sticky",
    about: "The keyboard's group row stands in for the window's first row when it is above it",
    settings: "list({groups, height: 6, top: 2})",
    model: model({ groups: many(4 + 3), height: 6, top: 7, aside: 3 }),
  },
  {
    component: "grouped-list",
    state: "spaced",
    about: "A blank row between groups, without a rail",
    settings: "list({groups, space: true})",
    model: model({ groups: GROUPS, aside: 3, space: true }),
  },
  {
    component: "grouped-list",
    state: "bare",
    about:
      "No rails, for a list that is not a form to complete: a group's label starts the row, groups a blank row apart, in a window",
    settings: "list({groups, rail: false, space: true, lines: 2, height: 9})",
    model: model({ groups: GROUPS, aside: 3, rail: false, space: true, lines: 2, height: 9 }),
  },
  {
    component: "grouped-list",
    state: "wrapped",
    about:
      "Rows of two lines at most: a long text wraps under its first line, which keeps the mark and the aside; the window counts lines",
    settings: "list({groups, lines: 2, height: 9})",
    model: model({ groups: GROUPS, aside: 3, lines: 2, height: 9 }),
  },
  {
    component: "grouped-list",
    state: "menu",
    about:
      "A menu of actions: a key before each, no mark, and a row that is not available dim, with its reason, and no control",
    settings:
      "list({groups: [{rows: [{key: '1', mark: 'none', disabled?}]}], rail: false, aside: 10})",
    model: model({ groups: MENU, rail: false, aside: 10 }),
  },
  {
    component: "grouped-list",
    state: "flat",
    about: "Little room: each row carries its group's label, dim, cut from the left",
    settings: "list({groups, height: 3, flat: true})",
    model: model({ groups: GROUPS, height: 3, flat: true, aside: 3 }),
  },
];
