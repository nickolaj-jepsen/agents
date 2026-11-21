/**
 * The Claude catalogue's stories as data, one per kit component per state, so `build.ts` and the
 * scenarios can read them under plain Node. What each one draws is `claude/render.tsx`, keyed by
 * `<component>/<state>`. Adding a component to the kit means adding its stories here and there
 * in the same change (see ../../README.md). Ids match the pi stories where the component exists
 * in both.
 */

export type Story = {
  /** `<component>/<state>`'s first half: `list` for `list/grouped`. */
  component: string;
  state: string;
  about: string;
  /** What was passed to the component, shown as the caption. */
  settings?: string;
  /** Snapshot at four sizes, for the state with the most text. */
  extreme?: boolean;
  /**
   * Where it is drawn: a `pane` whose body is the component and nothing else, or the `band`
   * above the prompt for what only a band has.
   */
  surface: "pane" | "band";
  /** The width class the stage caps the component at. */
  width: "reading" | "dialog" | "wide";
};

export const storyId = (s: Pick<Story, "component" | "state">) => `${s.component}/${s.state}`;

const pane = (
  component: string,
  state: string,
  about: string,
  settings: string,
  more: Partial<Story> = {},
): Story => ({ component, state, about, settings, surface: "pane", width: "reading", ...more });

const band = (
  state: string,
  about: string,
  settings: string,
  more: Partial<Story> = {},
): Story => ({
  component: "band",
  state,
  about,
  settings,
  surface: "band",
  width: "wide",
  ...more,
});

export const stories: Story[] = [
  pane("clamp", "unbounded", "No options: wrap without limit", "{}"),
  pane(
    "clamp",
    "truncate",
    "One line, cut with a full last line before the ellipsis",
    "{min: 1, max: 1}",
  ),
  pane("clamp", "max-lines", "At most two lines", "{max: 2}"),
  pane("clamp", "min-lines", "Padded to three lines so rows keep one height", "{min: 3}"),
  pane(
    "clamp",
    "target",
    "A length in characters: a narrow pane gets more lines than a wide one",
    "{target: 90}",
  ),
  pane("clamp", "target-bounded", "Target inside bounds", "{target: 90, min: 2, max: 3}"),
  pane("clamp", "wide-chars", "Cells, not characters: CJK counts two", "{max: 3}", {
    extreme: true,
  }),
  pane(
    "clamp",
    "markdown",
    "Inline markdown as Text runs, wrapped with a hanging indent",
    "inlineMarkdown(kit, text, {width, indent: 2, aside})",
  ),

  pane(
    "image",
    "landscape",
    "One inline PNG with a clickable local path",
    "imageGallery(kit, [image], {columns: width})",
  ),
  pane(
    "image",
    "gallery",
    "Landscape, portrait and unknown dimensions, a caption and an extreme escaped path",
    "imageGallery(kit, images, {columns: width, rows: 12, caption})",
    { extreme: true },
  ),

  pane(
    "detail",
    "block",
    "The selected claim in full, a meta line, then a section with dated entries",
    "Text + section + entries",
  ),
  pane("detail", "prose-measure", "Prose wraps at 80 even in a wider pane", "width class wide", {
    width: "wide",
  }),
  pane(
    "detail",
    "section",
    "Bold header and a dim rule to the edge, short and cut",
    "section(kit, width, title)",
  ),
  pane(
    "detail",
    "notes",
    "A note's gutter: │ on each line but the last, ╰▸ on the last; a one-liner is ╰▸ alone",
    "note(kit, text, {width: 48})",
  ),

  pane(
    "entries",
    "wide",
    "A pane of 50 columns or more: the date in a dim column, the text hanging beside it",
    "entries(kit, width, items)",
  ),
  pane(
    "entries",
    "narrow",
    "Below 50 columns: a dim date line, the text beneath at full width",
    "entries(kit, 40, items)",
  ),
  pane("entries", "one", "A single entry", "entries(kit, width, [item])"),
  pane(
    "entries",
    "long-text",
    "Long text cut to three lines, the last filled before the ellipsis",
    "entries(kit, width, items, {lines: {max: 3}})",
  ),
  pane(
    "entries",
    "wide-chars",
    "CJK and full-width text wraps by cells in the hanging column",
    "entries(kit, width, items, {lines: {max: 3}})",
    { extreme: true },
  ),

  pane(
    "empty",
    "default",
    "What a list says when there is nothing in it",
    "emptyState(kit, width, text)",
    { width: "dialog" },
  ),
  pane("empty", "long", "Wrapped and dim", "emptyState(kit, width, long text)", {
    width: "dialog",
  }),

  pane("notice", "success", "A one-line notice, success", 'notice(kit, width, text, "success")', {
    width: "dialog",
  }),
  pane("notice", "warning", "A one-line notice, warning", 'notice(kit, width, text, "warning")', {
    width: "dialog",
  }),
  pane("notice", "error", "A one-line notice, error", 'notice(kit, width, text, "error")', {
    width: "dialog",
  }),
  pane("notice", "long", "A long notice cut to one line", 'notice(kit, width, text, "dim")', {
    width: "dialog",
  }),

  pane(
    "list",
    "empty",
    "No rows: the empty state stands in",
    "emptyState(...) in place of list(...)",
    { width: "dialog" },
  ),
  pane("list", "one", "A single row", "1 item"),
  pane(
    "list",
    "grouped",
    "Three groups: a header rule, a blank row between groups, metadata on its own dim line",
    "6 items, 3 groups",
  ),
  pane("list", "marks-multi", "Several-of-many: □ and ■", "isMarked: false | true"),
  pane("list", "marks-single", "One-of-many: ○ and ●", 'marks: "single"'),
  pane(
    "list",
    "coloured-metadata",
    "Colour on one field by predicate: seen from 3× is warning, wrong is error",
    "meta: [{role: kind === wrong ? error : dim}, {role: seen >= 3 ? warning : dim}]",
  ),
  pane(
    "list",
    "column-drop",
    "The same rows with metadata in columns (inline and wide) and on a line of their own (docked)",
    "isColumns: true | false",
  ),
  pane(
    "list",
    "extreme-titles",
    "Titles, groups and counts far longer than expected",
    "title: {target: 120, max: 3}",
    { extreme: true },
  ),
  pane(
    "list",
    "wide-chars",
    "CJK, full-width and emoji in titles and group names",
    "title: {target: 120, max: 3}",
    { extreme: true },
  ),

  pane(
    "frame",
    "title-count",
    "The pane's title line with its dim count",
    "paneTitle(kit, width, title, count)",
    { width: "dialog" },
  ),
  pane("frame", "title-bare", "The title alone, no count", "paneTitle(kit, width, title)", {
    width: "dialog",
  }),
  pane(
    "frame",
    "reading",
    "The title line and prose at the reading cap, in a pane wider than it",
    "widthCap('reading', columns)",
  ),
  pane(
    "frame",
    "dialog",
    "The title line and prose at the dialog cap",
    "widthCap('dialog', columns)",
    {
      width: "dialog",
    },
  ),

  pane(
    "split",
    "stacked",
    "The only layout a pane has: the list, then the selected row's detail under it",
    "list(...) then section + entries",
  ),

  pane(
    "buttons",
    "row",
    "Key chips in one row, dim but for the lit one",
    "buttonRow(kit, [{hotkey, label, press, isLit}])",
    { width: "dialog" },
  ),
  pane(
    "buttons",
    "wrap",
    "A row wider than the pane wraps and keeps its gap",
    "buttonRow(kit, nine keys)",
    { width: "dialog", extreme: true },
  ),

  band(
    "default",
    "The shell: a divider with a title and a slot, the body, and a footer pinned to the bottom",
    "bandShell(kit, {title, right, body, footer})",
  ),
  band(
    "title-only",
    "A divider with a title and the rule running on",
    "bandShell(kit, {title, body})",
  ),
  band(
    "height",
    "Standing as tall as its tallest state: a short body, the footer still at the bottom",
    "bandShell(kit, {height: 9, ...})",
    { extreme: true },
  ),
  // The choice list's stories are the kit's own (`kit/choice/stories.ts`), restated because the
  // scenarios read this file under plain Node and a mod cannot import outside its folder.
  pane("choice", "single", "One of many: the chosen answer in the accent with a filled mark", "", {
    extreme: true,
  }),
  pane("choice", "multiple", "Several of many, with square marks", ""),
  pane("choice", "live", "Keys and clicks pick; the engine inverts the focused row", ""),
];

/**
 * The stage's width on a pane `columns` wide: the story's class as a cap (the kit's
 * `widthCap`, restated because the scenarios read this file under plain Node).
 */
export const stageWidth = (s: Pick<Story, "width">, columns: number) =>
  Math.max(1, Math.min(columns, { reading: 96, dialog: 72, wide: columns - 2 }[s.width]));
