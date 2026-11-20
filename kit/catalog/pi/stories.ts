/**
 * The catalogue's stories: one per kit component per state, as data. Adding a component to
 * the kit means adding its stories here in the same change (see ../../README.md).
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import {
  bandShell,
  buttonRow,
  captionFrame,
  captionFrameLayout,
  cardChoice,
  cardHeading,
  cardNote,
  cardRail,
  cardSections,
  cardSteps,
  cardSummary,
  chipRow,
  clamp,
  emptyState,
  entries,
  fit,
  List,
  modalFrame,
  note,
  notice,
  paint,
  prose,
  section,
  splitFrame,
  splitLayout,
  tokens,
  type BandRow,
  type Column,
  type Hint,
  type WidthClass,
} from "../../pi/ui.ts";
import {
  CJK,
  EVIDENCE,
  EXTREME,
  GROUPED,
  LOG,
  LONG,
  LONG_ENTRY,
  SCROLLING,
  SENTENCE,
  WIDE,
  type Row,
} from "../samples.ts";

export type Env = { columns: number; rows: number };

/** What a story draws and, for some, how it reacts. */
export type Live = {
  /** Lines for `width` cells: the body inside a frame, or the whole frame for `frame: true` stories. */
  render(theme: Theme, width: number, env: Env): string[];
  input?(data: string): boolean;
  /** Coordinates are the body's own. */
  mouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
};

export type Story = {
  /** `<component>/<state>`: the id in `/kit`, the scenario name and the catalogue's heading. */
  component: string;
  state: string;
  about: string;
  /** What was passed to the component, shown as the caption. */
  settings?: string;
  /** Snapshot at four sizes, for the state with the most text. */
  extreme?: boolean;
  /** The overlay's width class. */
  width: WidthClass;
  /** `auto` only: the content's width in cells. */
  content?: number;
  /** True when the story is a frame itself, so the catalogue adds none round it. */
  frame?: boolean;
  make(): Live;
};

export const storyId = (s: Pick<Story, "component" | "state">) => `${s.component}/${s.state}`;

const pure = (render: Live["render"]): Live => ({ render });
const text = (s: string, ...more: string[]) => [s, ...more];

const HINTS: Hint[] = [
  { key: "↑↓", label: "move" },
  { key: "space", label: "mark" },
  { key: "a", label: "apply" },
  { key: "d", label: "dismiss" },
  { key: "esc", label: "later", essential: true },
];
const MANY_HINTS: Hint[] = [
  { key: "↑↓", label: "move" },
  { key: "space", label: "mark" },
  { key: "enter", label: "open" },
  { key: "tab", label: "next pane" },
  { key: "a", label: "apply" },
  { key: "d", label: "dismiss" },
  { key: "/", label: "filter" },
  { key: "?", label: "help" },
  { key: "esc", label: "close", essential: true },
];
const CLOSE: Hint[] = [{ key: "esc", label: "close", essential: true }];

const columns = (seenWarn: boolean): Column<Row>[] => [
  {
    width: 1,
    priority: 3,
    text: (r) => tokens.glyph.kind[r.kind],
    role: (r) => (r.kind === "wrong" ? "error" : "text"),
  },
  {
    width: 4,
    priority: 2,
    text: (r) => `${r.seen}${tokens.glyph.times}`,
    role: seenWarn ? (r) => (r.seen >= 3 ? "warning" : undefined) : undefined,
  },
  { width: 5, priority: 1, text: (r) => r.age },
];

const makeList = (
  rows: Row[],
  o: { marks?: "multi" | "single"; warn?: boolean; lines?: { min?: number; max?: number } } = {},
) => {
  const list = new List<Row>({
    id: (r) => r.id,
    group: (r) => r.group,
    title: (r) => r.title,
    titleLines: o.lines ?? { min: 1, max: 2 },
    columns: columns(o.warn ?? false),
    ...(o.marks ? { marks: o.marks } : {}),
  });
  list.setItems(rows);
  return list;
};

/** A list story: arrow keys, space and the mouse work on it. */
function listLive(
  list: List<Row>,
  o: { rows?: number; marks?: boolean; before?: (l: List<Row>) => void } = {},
): Live {
  o.before?.(list);
  let rowsShown = 0;
  return {
    render: (theme, width, env) => {
      rowsShown = o.rows ?? Math.max(3, env.rows - 8);
      return list.render(theme, width, Math.min(rowsShown, list.naturalRows(theme, width)));
    },
    input: (data) => {
      if (data === "j" || data === "\x1b[B") list.move(1);
      else if (data === "k" || data === "\x1b[A") list.move(-1);
      else if (data === " " && o.marks) list.toggle();
      else return false;
      return true;
    },
    mouse: (event) => list.mouse(event),
  };
}

/** Columns side by side, each its own width; as many as fit. */
function sideBySide(
  theme: Theme,
  width: number,
  cols: { width: number; head: string; lines: string[] }[],
): string[] {
  const used: typeof cols = [];
  let total = 0;
  for (const c of cols) {
    const next = total + (used.length ? 2 : 0) + c.width;
    if (next > width) break;
    used.push(c);
    total = next;
  }
  const height = Math.max(0, ...used.map((c) => c.lines.length));
  const out = [used.map((c) => fit(paint(theme, "dim", c.head), c.width)).join("  ")];
  for (let i = 0; i < height; i++)
    out.push(used.map((c) => fit(c.lines[i] ?? "", c.width)).join("  "));
  return out;
}

const bandStory = (
  state: string,
  about: string,
  settings: string,
  o: { title: string; stops: boolean; lines: number; height?: number; isJoined?: boolean },
  more: Partial<Story> = {},
): Story => ({
  component: "band",
  state,
  about,
  settings,
  width: "wide",
  frame: true,
  ...more,
  make: () =>
    pure((theme, width, env) => {
      const stops = (): BandRow<never> => {
        const labels = ["Q1", "Q2", "Q3"];
        const text = labels
          .map(
            (label, i) =>
              `${i === 0 ? paint(theme, "success", tokens.glyph.done) : paint(theme, "dim", tokens.glyph.single.off)} ${paint(theme, i === 1 ? "accent" : "dim", label)}`,
          )
          .join("  ");
        return { text };
      };
      return bandShell(theme, {
        width,
        title: o.title,
        right: o.stops ? [stops()] : undefined,
        maxRows: env.rows,
        height: o.height,
        body: [
          { text: theme.bold("Which of these does the page get wrong?") },
          ...Array.from({ length: o.lines }, (_, i) => ({ text: `${i + 1}: option ${i + 1}` })),
        ],
        footer: chipRow(theme, [
          { key: "b", label: "back", act: undefined as never },
          { key: "f", label: "forward", act: undefined as never },
          { key: "s", label: "skip", act: undefined as never },
        ]),
        keys: "esc closes",
        isJoined: o.isJoined,
        // The line the band stands on is the prompt's rule, drawn by pi; here, one of ours.
      }).lines.concat(o.isJoined ? [paint(theme, "dim", tokens.glyph.rule.repeat(width))] : []);
    }),
});

const clampStory = (
  state: string,
  about: string,
  label: string,
  source: string,
  opts: Parameters<typeof clamp>[2],
  extreme = false,
): Story => ({
  component: "clamp",
  state,
  about,
  settings: `clamp(text, width, ${label})`,
  extreme,
  width: "reading",
  make: () =>
    pure((theme, width) =>
      sideBySide(
        theme,
        width,
        [22, 30, 36].map((w) => ({
          width: w,
          head: `width ${w}`,
          lines: clamp(source, w, opts),
        })),
      ),
    ),
});

const classStory = (cls: WidthClass, cap: string): Story => ({
  component: "frame",
  state: cls,
  about: `A modal in the ${cls} width class: ${cap}`,
  settings: `width class ${cls}, ${cap}`,
  width: cls,
  frame: true,
  make: () =>
    pure((theme, width) =>
      modalFrame(theme, {
        width,
        title: `Width class ${cls}`,
        count: 3,
        body: [
          ...prose(
            theme,
            width - 4,
            `${cap}. The panel is as wide as the terminal allows up to the cap, never wider.`,
          ),
          "",
          paint(theme, "dim", `${width} columns here`),
        ],
        hints: HINTS,
      }),
    ),
});

const evidence = (theme: Theme, width: number) => [
  section(theme, width, "Evidence"),
  ...entries(theme, width, EVIDENCE),
];

const splitStory = (
  state: string,
  about: string,
  columnsOverride?: number,
  cls: WidthClass = "split",
  hints: Hint[] = HINTS,
): Story => ({
  component: "split",
  state,
  about,
  settings:
    columnsOverride === undefined
      ? "splitLayout(width, terminal columns)"
      : `splitLayout(width, ${columnsOverride})`,
  width: cls,
  frame: true,
  make: () => {
    const list = makeList(GROUPED, { warn: true });
    list.cursor = 1;
    return {
      ...listLive(list),
      render: (theme, width, env) => {
        const layout = splitLayout(width, columnsOverride ?? env.columns);
        const row = list.current!;
        const detail = [
          ...prose(theme, layout.right, row.title),
          "",
          `${tokens.glyph.kind[row.kind]} ${row.kind}   seen ${row.seen}${tokens.glyph.times}`,
          "",
          ...evidence(theme, layout.right),
        ];
        const rows = Math.max(4, env.rows - 2 * tokens.margin - 4);
        if (layout.stacked) {
          const shown = list.render(
            theme,
            layout.left,
            Math.max(3, Math.min(list.naturalRows(theme, layout.left), rows - detail.length - 1)),
          );
          return modalFrame(theme, {
            width,
            title: "Split frame",
            count: list.items.length,
            body: [...shown, "", ...detail],
            hints,
          });
        }
        const left = list.render(
          theme,
          layout.left,
          Math.min(rows, list.naturalRows(theme, layout.left)),
        );
        return splitFrame(theme, {
          layout,
          width,
          title: "Split frame",
          count: list.items.length,
          left,
          right: detail,
          hints,
        });
      },
    };
  },
});

const listStory = (
  state: string,
  about: string,
  settings: string,
  make: () => Live,
  extreme = false,
): Story => ({
  component: "list",
  state,
  about,
  settings,
  extreme,
  width: "reading",
  make,
});

const noticeStory = (
  state: string,
  status: "success" | "warning" | "error" | "dim",
  message: string,
): Story => ({
  component: "notice",
  state,
  about: `A one-line notice, ${status}`,
  settings: `notice(theme, width, text, "${status}")`,
  width: "dialog",
  make: () => pure((theme, width) => [notice(theme, width, message, status)]),
});

export const stories: Story[] = [
  {
    component: "question-card",
    state: "choices",
    about: "A wrapped Markdown title, selected and unselected choices, and a literal write-in.",
    width: "reading",
    make: () =>
      pure((theme, width) => {
        const inner = Math.min(width - 3, tokens.prose);
        const heading = cardHeading(theme, inner, SENTENCE, "Q1", true, true);
        const choices = [
          ...cardChoice(theme, inner, {
            key: "A",
            text: GROUPED[0]!.title,
            detail: CJK,
            chosen: true,
            active: true,
            focused: true,
          }),
          ...cardChoice(theme, inner, { key: "B", text: GROUPED[1]!.title, multiple: true }),
          ...cardChoice(theme, inner, {
            key: "C",
            text: GROUPED[2]!.title,
            multiple: true,
            chosen: true,
          }),
          ...cardChoice(theme, inner, { key: "D", text: GROUPED[0]!.title, literal: true }),
        ];
        return cardSections("", heading, choices, cardNote(theme, inner, "", true, true)).map(
          (line) => cardRail(theme, true, true, line),
        );
      }),
  },
  {
    component: "question-card",
    state: "checkboxes",
    about: "A neutral chevron and bold label show focus; checked choices keep their accent.",
    width: "reading",
    make: () =>
      pure((theme, width) => {
        const inner = Math.min(width - 3, tokens.prose);
        const form = { multiple: true, presentation: "form" } as const;
        return [
          ...cardChoice(theme, inner, { ...form, key: "A", text: GROUPED[0]!.title, chosen: true }),
          ...cardChoice(theme, inner, {
            ...form,
            key: "B",
            text: GROUPED[1]!.title,
            focused: true,
          }),
          ...cardChoice(theme, inner, { ...form, key: "C", text: GROUPED[2]!.title }),
          ...cardChoice(theme, inner, {
            ...form,
            key: "D",
            text: "Write your own answer",
            literal: true,
          }),
        ];
      }),
  },
  {
    component: "question-card",
    state: "review",
    about: "Named steps, followed by numbered answers and their notes.",
    width: "reading",
    make: () =>
      pure((theme, width) => {
        const inner = width - 2 * captionFrameLayout.x;
        const steps = cardSteps(theme, width - captionFrameLayout.caption.reserved, [
          { short: "1", name: GROUPED[0]!.group, done: true, hovered: true, act: 0 },
          { short: "2", name: GROUPED[1]!.group, done: true, act: 1 },
          { short: "Review", current: true, act: 2 },
        ]);
        const first = cardSummary(theme, inner, {
          label: "1",
          title: GROUPED[0]!.group,
          values: [{ text: GROUPED[0]!.title }],
        });
        const second = cardSummary(theme, inner, {
          label: "2",
          title: GROUPED[1]!.group,
          values: [{ text: GROUPED[1]!.title }, { text: GROUPED[2]!.title }],
          note: CJK,
        });
        return captionFrame(theme, {
          width,
          title: "Review",
          caption: steps.text || undefined,
          body: cardSections("", first, second),
        }).lines;
      }),
  },
  {
    component: "buttons",
    state: "row",
    about: "Primary and hovered actions, alongside a dim keyboard-only label.",
    width: "dialog",
    make: () =>
      pure((theme, width) =>
        buttonRow(
          theme,
          width,
          [
            { hotkey: "enter", label: "Apply", act: true, isLit: true },
            { hotkey: "d", label: "Dismiss", act: true },
            { hotkey: "↑↓", label: "move" },
            { hotkey: "q", label: "Later", act: true, essential: true },
          ],
          { hover: { x: 9, y: 0 } },
        ).map(({ text }) => text),
      ),
  },
  {
    component: "buttons",
    state: "wrap",
    about: "Actions and labels wrap at chip boundaries rather than cutting across a key.",
    width: "dialog",
    extreme: true,
    make: () =>
      pure((theme, width) =>
        buttonRow(
          theme,
          Math.min(width, 40),
          [
            { hotkey: "b", label: "back", act: true },
            { hotkey: "n", label: "next", act: true },
            { hotkey: "s", label: "skip", act: true },
            { hotkey: "↑↓", label: "move" },
            { hotkey: "q", label: "quit", act: true },
            { hotkey: "r", label: "review", act: true },
            { hotkey: "y", label: "yes", act: true },
            { hotkey: "m", label: "more", act: true },
          ],
          { wrap: true },
        ).map(({ text }) => text),
      ),
  },
  classStory("reading", "96 columns, prose wrapped at 80"),
  classStory("split", "124 columns"),
  classStory("dialog", "72 columns"),
  classStory("wide", "the terminal less a 2-column margin"),
  ...[false, true].map((confirming): Story => ({
    component: "frame",
    state: confirming ? "caption-confirm" : "caption",
    about: confirming
      ? "Discard and Keep replace Close in the top rule without covering the form."
      : "A composer form with Close on the top rule and a primary action below the choices.",
    settings: confirming ? "close: { confirming: true }" : "close: {}",
    width: "reading",
    make: () =>
      pure((theme, width) => {
        const inner = width - 2 * captionFrameLayout.x;
        const heading = cardHeading(theme, inner, SENTENCE, "Q1", true, false, "form");
        const choices = GROUPED.slice(0, 2).flatMap((row, i) =>
          cardChoice(theme, inner, {
            key: i === 0 ? "A" : "B",
            text: row.title,
            active: true,
            focused: i === 0,
          }),
        );
        return captionFrame(theme, {
          width,
          title: "Question",
          close: { confirming },
          body: cardSections("", heading, choices),
          footer: confirming
            ? undefined
            : buttonRow(theme, inner, [
                { hotkey: "enter", label: "Choose", isLit: true, act: true },
              ])[0]?.text,
        }).lines;
      }),
  })),
  {
    component: "frame",
    state: "auto",
    about: "Fits its content, within the dialog cap",
    settings: 'overlayOptions("auto", content)',
    width: "auto",
    content: 24,
    frame: true,
    make: () =>
      pure((theme, width) =>
        modalFrame(theme, { width, title: "Auto", body: text("Little content."), hints: CLOSE }),
      ),
  },
  {
    component: "frame",
    state: "title-count",
    about: "The title with its dim count in the top border",
    settings: 'title: "Doc suggestions", count: 28',
    width: "dialog",
    frame: true,
    make: () =>
      pure((theme, width) =>
        modalFrame(theme, {
          width,
          title: "Doc suggestions",
          count: 28,
          body: text("A count follows the title."),
          hints: HINTS,
        }),
      ),
  },
  {
    component: "frame",
    state: "title-bare",
    about: "The title alone, no count",
    settings: 'title: "Settings", count: undefined',
    width: "dialog",
    frame: true,
    make: () =>
      pure((theme, width) =>
        modalFrame(theme, { width, title: "Settings", body: text("No count."), hints: HINTS }),
      ),
  },
  {
    component: "frame",
    state: "hints-fit",
    about: "Every hint fits, left-aligned with the border running on",
    settings: "5 hints, width 124",
    width: "split",
    frame: true,
    make: () =>
      pure((theme, width) =>
        modalFrame(theme, {
          width,
          title: "Hints fit",
          body: text("Key in normal weight, label dim."),
          hints: HINTS,
        }),
      ),
  },
  {
    component: "frame",
    state: "hints-drop",
    about: "Nine hints in a dialog: the lowest priority go first, esc stays",
    settings: "9 hints, esc essential, width 72 (narrower on a small terminal)",
    extreme: true,
    width: "dialog",
    frame: true,
    make: () =>
      pure((theme, width) =>
        modalFrame(theme, {
          width,
          title: "Hints drop",
          body: text("Lowest priority first."),
          hints: MANY_HINTS,
        }),
      ),
  },
  splitStory(
    "two-pane",
    "List left, the selected row's detail right, ┬ and ┴ on the divider (two panes from 110 columns)",
  ),
  splitStory(
    "hints-junction",
    "Hints flow along the whole border; one that would touch the divider starts after the ┴, and only the lowest priority drop when the border is full",
    120,
    "reading",
    MANY_HINTS,
  ),
  splitStory("stacked", "Forced below 110 columns: list above detail", 80),

  listStory(
    "empty",
    "No rows: the empty state stands in",
    "List with no items, emptyState(...)",
    () =>
      pure((theme, width) =>
        emptyState(theme, width, "Nothing to review: no open items in this repo."),
      ),
  ),
  listStory("one", "A single row", "1 item", () =>
    listLive(makeList(GROUPED.slice(0, 1), { warn: true })),
  ),
  listStory(
    "grouped",
    "Three groups: header rule, blank rows between groups while it fits",
    "6 items, 3 groups, marks off",
    () => listLive(makeList(GROUPED, { warn: true })),
  ),
  listStory(
    "scrolling",
    "30 rows in 10 lines: blank rows dropped, window follows the cursor",
    "30 items, rows: 10, cursor on 13",
    () =>
      listLive(makeList(SCROLLING, { warn: true }), { rows: 10, before: (l) => (l.cursor = 12) }),
  ),
  listStory(
    "more",
    "Rows hidden above and below: whole rows only, a dim line says how many",
    "30 items, rows: 11, cursor on 13",
    () =>
      listLive(makeList(SCROLLING, { warn: true }), { rows: 11, before: (l) => (l.cursor = 12) }),
  ),
  listStory("marks-multi", "Several-of-many: □ and ■", 'marks: "multi"', () =>
    listLive(makeList(GROUPED, { marks: "multi" }), {
      marks: true,
      before: (l) => {
        l.toggle(0);
        l.toggle(2);
        l.cursor = 1;
      },
    }),
  ),
  listStory("marks-single", "One-of-many: ○ and ●", 'marks: "single"', () =>
    listLive(makeList(GROUPED, { marks: "single" }), {
      marks: true,
      before: (l) => {
        l.toggle(1);
        l.cursor = 3;
      },
    }),
  ),
  listStory(
    "selected",
    "The ❯ pointer and the accent title on the cursor; the hovered row bold",
    "cursor 2, hover 4",
    () =>
      listLive(makeList(GROUPED), {
        before: (l) => {
          l.cursor = 2;
          l.hover = 4;
        },
      }),
  ),
  listStory(
    "coloured-metadata",
    "Colour on one field by predicate: seen from 3× is warning, wrong is error",
    'role: (r) => r.seen >= 3 ? "warning"',
    () => listLive(makeList(GROUPED, { warn: true, marks: "multi" }), { marks: true }),
  ),
  listStory(
    "column-drop",
    "The same list at 44, 32 and 24 cells: lowest priority column goes first",
    "widths 44 / 32 / 24",
    () =>
      pure((theme, width) =>
        [44, 32, 24].flatMap((w) => [
          paint(theme, "dim", `width ${w}`),
          ...makeList(GROUPED.slice(0, 2), { warn: true }).render(theme, Math.min(w, width), 8),
          "",
        ]),
      ),
  ),
  listStory(
    "extreme-titles",
    "Titles, groups and counts far longer than expected",
    "titleLines {min:1,max:2}",
    () => listLive(makeList(EXTREME, { warn: true, marks: "multi" }), { marks: true }),
    true,
  ),
  listStory(
    "wide-chars",
    "CJK, full-width and emoji in titles and group names",
    "titleLines {min:1,max:2}",
    () => listLive(makeList(WIDE, { warn: true, marks: "multi" }), { marks: true }),
    true,
  ),

  clampStory(
    "truncate",
    "One line, cut with a full last line before the ellipsis",
    "{min: 1, max: 1}",
    LONG,
    { min: 1, max: 1 },
  ),
  clampStory("max-lines", "At most two lines", "{max: 2}", LONG, { max: 2 }),
  clampStory(
    "min-lines",
    "Padded to three lines so rows keep one height",
    "{min: 3}",
    "A short title.",
    { min: 3 },
  ),
  clampStory(
    "target",
    "A length in characters: a narrow pane gets more lines than a wide one",
    "{target: 90}",
    LONG,
    { target: 90 },
  ),
  clampStory("target-bounded", "Target inside bounds", "{target: 90, min: 2, max: 3}", LONG, {
    target: 90,
    min: 2,
    max: 3,
  }),
  clampStory("unbounded", "No options: wrap without limit", "{}", SENTENCE, {}),
  clampStory(
    "wide-chars",
    "Cells, not characters: CJK counts two",
    "{max: 3}",
    CJK,
    { max: 3 },
    true,
  ),

  {
    component: "detail",
    state: "block",
    about: "The selected claim in full, a meta line, then a section with notes",
    settings: "prose + section + note",
    width: "reading",
    make: () =>
      pure((theme, width) => [
        ...prose(theme, width, GROUPED[0]!.title),
        "",
        `${paint(theme, "error", "!")} ${paint(theme, "dim", "wrong")}   ${paint(theme, "warning", "seen 3×")}   ${paint(theme, "dim", "2 days ago")}`,
        "",
        ...evidence(theme, width),
      ]),
  },
  {
    component: "detail",
    state: "prose-measure",
    about: "Prose wraps at 80 even in a wider pane",
    settings: "prose(theme, 120, text); width class wide",
    width: "wide",
    make: () =>
      pure((theme, width) => [
        section(theme, width, `Prose at width ${width}`),
        ...prose(theme, width, LONG),
      ]),
  },
  {
    component: "detail",
    state: "notes",
    about: "A note's gutter: │ on each line but the last, ╰▸ on the last; a one-liner is ╰▸ alone",
    settings: "note(theme, 48, text)",
    width: "reading",
    make: () =>
      pure((theme, width) => [
        ...note(theme, Math.min(48, width), SENTENCE),
        "",
        ...note(theme, Math.min(48, width), "One line."),
      ]),
  },
  {
    component: "detail",
    state: "section",
    about: "Bold header and a dim rule to the edge, short and cut",
    settings: "section(theme, width, title)",
    width: "reading",
    make: () =>
      pure((theme, width) => [
        section(theme, width, "Evidence"),
        "",
        section(
          theme,
          width,
          "docs/a-very-long-directory-name/with/several/nested/levels/and-an-equally-long-file-name-for-the-guide.md",
        ),
        "",
        section(theme, 12, "docs/agents.md"),
      ]),
  },

  {
    component: "entries",
    state: "wide",
    about: "A pane of 50 columns or more: the date in a dim column, the text hanging beside it",
    settings: "entries(theme, width, items)",
    width: "reading",
    make: () => pure((theme, width) => entries(theme, width, LOG)),
  },
  {
    component: "entries",
    state: "narrow",
    about: "Below 50 columns: a dim date line, the text beneath at full width",
    settings: "entries(theme, 40, items)",
    width: "reading",
    make: () => pure((theme, width) => entries(theme, Math.min(40, width), LOG)),
  },
  {
    component: "entries",
    state: "one",
    about: "A single entry",
    settings: "entries(theme, width, [item])",
    width: "reading",
    make: () => pure((theme, width) => entries(theme, width, LOG.slice(0, 1))),
  },
  {
    component: "entries",
    state: "long-text",
    about: "Long text cut to three lines, the last filled before the ellipsis",
    settings: "entries(theme, width, items, {lines: {max: 3}})",
    width: "reading",
    make: () =>
      pure((theme, width) =>
        entries(theme, width, [LONG_ENTRY, ...LOG.slice(1)], { lines: { max: 3 } }),
      ),
  },
  {
    component: "entries",
    state: "few-rows",
    about:
      "Given fewer rows than it needs: the last entry cut with … on its last text line, the rest counted on ↓ n more",
    settings: "entries(theme, width, items, {rows: 8}) at width 60 and 40",
    width: "reading",
    make: () =>
      pure((theme, width) => [
        paint(theme, "dim", "width 60, rows 8"),
        ...entries(theme, Math.min(60, width), [LONG_ENTRY, ...LOG.slice(1)], { rows: 8 }),
        "",
        paint(theme, "dim", "width 40, rows 6"),
        ...entries(theme, Math.min(40, width), [LONG_ENTRY, ...LOG.slice(1)], { rows: 6 }),
      ]),
  },
  {
    component: "entries",
    state: "wide-chars",
    about: "CJK and full-width text wraps by cells in the hanging column",
    settings: "entries(theme, width, items, {lines: {max: 3}})",
    extreme: true,
    width: "reading",
    make: () =>
      pure((theme, width) =>
        entries(
          theme,
          width,
          [
            { date: "2026-11-13", text: CJK },
            { date: "2026-10-16", text: `混在 mixed ＡＢＣ ${CJK}` },
          ],
          { lines: { max: 3 } },
        ),
      ),
  },

  noticeStory("success", "success", "Dismissed 2"),
  noticeStory("warning", "warning", "Two of the files changed on disk since the queue loaded"),
  noticeStory(
    "error",
    "error",
    "Dismiss failed: EACCES: permission denied, open '/home/user/.agents/store/docfix/x.md'",
  ),
  noticeStory("long", "dim", `${SENTENCE} ${SENTENCE}`),

  bandStory(
    "default",
    "The shell: a title and the question stops in the border, the body, and a footer of keys pinned to the bottom",
    "bandShell(theme, {title, right, body, footer, keys})",
    { title: "2 of 3", stops: true, lines: 3, height: 6 },
  ),
  bandStory(
    "title-only",
    "A title and no slot: the rule runs on",
    "bandShell(theme, {title, body, footer, keys})",
    { title: "Review", stops: false, lines: 3, height: 6 },
  ),
  bandStory(
    "joined",
    "Standing on the line below it, as the prompt's rule: no bottom border, the sides run down to it and the keys take a last row",
    "bandShell(theme, {isJoined: true, ...})",
    { title: "2 of 3", stops: true, lines: 3, height: 6, isJoined: true },
  ),
  bandStory(
    "height",
    "Standing as tall as its tallest state: a short body, the footer still at the bottom",
    "bandShell(theme, {height: 9, ...})",
    { title: "2 of 3", stops: true, lines: 2, height: 9 },
    { extreme: true },
  ),

  {
    component: "empty",
    state: "default",
    about: "What a list says when there is nothing in it",
    settings: "emptyState(theme, width, text)",
    width: "dialog",
    make: () =>
      pure((theme, width) =>
        emptyState(theme, width, "Nothing to review: no open doc suggestions in this repo."),
      ),
  },
  {
    component: "empty",
    state: "long",
    about: "Wrapped and dim",
    settings: "emptyState(theme, width, long text)",
    width: "dialog",
    make: () => pure((theme, width) => emptyState(theme, width, `${SENTENCE} ${SENTENCE}`)),
  },
];

/** The body rows a story may use under a frame: the terminal less margins and the frame. */
export const bodyRows = (terminalRows: number) => Math.max(3, terminalRows - 2 * tokens.margin - 4);
