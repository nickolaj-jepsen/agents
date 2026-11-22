import { defineComponent, no, partial, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "grouped-list",
  name: "Grouped list",
  purpose:
    "Rows with a mark and a line or two each, under group rows, behind rails or bare; taller than its room, a window.",
  impl: {
    pi: ["list", "listFollow", "listTopMax", "listShowsWhole"],
    claude: ["list", "listFollow", "listTopMax", "listShowsWhole"],
    gui: "list",
  },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "list/src/terminal.ts",
  features: [
    {
      id: "groups",
      label:
        "Groups behind the card's rail: green once every row is decided, bright by the keyboard's group, whose label is in the accent",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
      gui: partial(
        "no rail; the label is semibold, in the accent for the keyboard's group, with a check once every row is decided",
      ),
    },
    {
      id: "marks",
      label:
        "A row left alone, chosen (the accent, a filled mark) or set aside (the whole row dim); its mark a control apart from its text",
      story: "grouped-list/groups",
      pi: yes("the pointer column and the mark carry `markHit`, the text `hit`"),
      claude: yes("the pointer column and the mark are a Button of their own"),
      gui: yes(
        "an icon, the chosen one in the accent; a `markHit` adds a quiet Button naming what a press steps the mark to (`Choose`, `Set aside`, `Restore`), never filled",
      ),
    },
    {
      id: "aside",
      label: "An aside column every row keeps, blank where a row has none, so cut text lines up",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
      gui: yes("dim at the row's far edge; no column, since the text wraps"),
    },
    {
      id: "actions",
      label: "Dim controls at the right of a group's row, bold under the mouse",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
      gui: yes("quiet Buttons at the heading's far edge, those with a `hit`"),
    },
    {
      id: "window",
      label:
        "Taller than its room: a window from `top` that `listFollow` moves only when the keyboard would leave it, its last row saying how many rows are above and below",
      story: "grouped-list/window",
      pi: yes("the wheel moves `top`; `listTopMax` bounds it"),
      claude: yes("the wheel reaches the mod as `ui.scroll` with the row under the pointer"),
      gui: no("the surface scrolls the pane; a long group is capped by `more` instead"),
    },
    {
      id: "sticky",
      label: "The keyboard's group row stands in for the window's first row when it is above it",
      story: "grouped-list/sticky",
      pi: yes(),
      claude: yes(),
      gui: no("the surface scrolls, so there is no window for a group row to stand in"),
    },
    {
      id: "space",
      label:
        "A blank row between groups, without a rail: a line of the list, which a window scrolls past",
      story: "grouped-list/spaced",
      pi: yes(),
      claude: yes(),
      gui: yes("groups are always a step apart"),
    },
    {
      id: "bare",
      label:
        "No rails, where the list is not a form to complete: a group's label starts the row, and nothing says a group is decided",
      story: "grouped-list/bare",
      pi: yes(),
      claude: yes(),
      gui: yes("a graphical list has no rails"),
    },
    {
      id: "lines",
      label:
        "Rows of several lines: a text wraps under its first line up to `lines`, the window counts and follows lines, and a row its end cuts ends in `…`",
      story: "grouped-list/wrapped",
      pi: yes(),
      claude: yes("a later line is a Button of its own with the row's `hit`"),
      gui: partial(
        "`lines: 1` is one line the surface cuts at its edge, an opened row whole; more lines wrap whole, since the surface cannot clamp a count; the row's Button sits beside the text, as a Button cannot wrap",
      ),
    },
    {
      id: "flat",
      label: "Little room: rows carry their group's label, dim, and there are no group rows",
      story: "grouped-list/flat",
      pi: yes(),
      claude: yes(),
      gui: no("room is never little: the pane scrolls and wraps"),
    },
    {
      id: "key",
      label:
        "A key before a row's mark, dim and in the accent in the keyboard's group, one column for the widest; a row marked `none` draws no mark, and where every row does the list keeps no cell for it",
      story: "grouped-list/menu",
      pi: yes("the caller owns the binding"),
      claude: yes("the caller owns the binding"),
      gui: no("a key is a terminal's hint; the row is a Button, and no mark is drawn for `none`"),
    },
    {
      id: "unlabelled",
      label: "A group with no label draws no group row: a menu's rows are the whole list",
      story: "grouped-list/menu",
      pi: yes(),
      claude: yes(),
      gui: yes("no heading either"),
    },
    {
      id: "literal",
      label: "A row's text that is a name or a path: shown as it is, not read as Markdown",
      story: "grouped-list/menu",
      pi: yes(),
      claude: yes(),
      gui: yes(),
    },
    {
      id: "action",
      label:
        "The word on a row's control, where rows of one list do different things (`Open`, `Copy`)",
      story: "grouped-list/menu",
      pi: no("the row itself is the control"),
      claude: no("the row itself is the control"),
      gui: yes("a row's `action` is its quiet Button's label, else the gui option's"),
    },
    {
      id: "disabled",
      label: "A row that cannot be used now: dim, with its aside, and no control",
      story: "grouped-list/menu",
      pi: yes("no `hit` nor `markHit`; the key is dim too"),
      claude: yes("no `hit` nor `markHit`; the key is dim too"),
      gui: yes("dim text with no Button"),
    },
    {
      id: "more",
      label: "A long group shows `maxItems` rows, then an `N more` control",
      story: "grouped-list/window",
      pi: no("a window, with `↑`/`↓ more` counts, instead"),
      claude: no("a window, with `↑`/`↓ more` counts, instead"),
      gui: yes("the gui function's `more` option: a quiet `N more` Button that presses its `hit`"),
    },
    {
      id: "opened",
      label: "A row opened in place: what belongs to it under its text",
      story: "grouped-list/groups",
      pi: no("a terminal list opens nothing in place; the caller draws a reader instead"),
      claude: no("a terminal list opens nothing in place; the caller draws a reader instead"),
      gui: yes(
        "the gui function's `opened` option: the row and an element under it in a well (the fill and the inset), whose `hit` keys it, and that row's Button says `Close`",
      ),
    },
    {
      id: "hover",
      label: "The row under the pointer is shown",
      story: "grouped-list/groups",
      pi: yes("the row is bold, like the keyboard's, without its pointer; `hovered` names it"),
      claude: yes(
        "the row sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
      gui: yes("the host draws the pointer on a Button"),
    },
  ],
});
