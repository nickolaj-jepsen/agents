import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "grouped-list",
  name: "Grouped list",
  purpose:
    "Rows with a mark and a line or two each, under group rows, behind rails or bare; taller than its room, a window.",
  impl: {
    pi: ["list", "listFollow", "listTopMax", "listShowsWhole"],
    claude: ["list", "listFollow", "listTopMax", "listShowsWhole"],
  },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "list/src/terminal.ts",
  features: [
    {
      id: "groups",
      label:
        "Groups behind the card's rail: green once every row is decided, bright by the keyboard's group, whose label is in the accent",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "marks",
      label:
        "A row left alone, chosen (the accent, a filled mark) or set aside (the whole row dim); its mark a control apart from its text",
      story: "grouped-list/groups",
      pi: yes("the pointer column and the mark carry `markHit`, the text `hit`"),
      claude: yes("the pointer column and the mark are a Button of their own"),
    },
    {
      id: "aside",
      label: "An aside column every row keeps, blank where a row has none, so cut text lines up",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "actions",
      label: "Dim controls at the right of a group's row, bold under the mouse",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "window",
      label:
        "Taller than its room: a window from `top` that `listFollow` moves only when the keyboard would leave it, its last row saying how many rows are above and below",
      story: "grouped-list/window",
      pi: yes("the wheel moves `top`; `listTopMax` bounds it"),
      claude: yes("the wheel reaches the mod as `ui.scroll` with the row under the pointer"),
    },
    {
      id: "sticky",
      label: "The keyboard's group row stands in for the window's first row when it is above it",
      story: "grouped-list/sticky",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "space",
      label:
        "A blank row between groups, without a rail: a line of the list, which a window scrolls past",
      story: "grouped-list/spaced",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "bare",
      label:
        "No rails, where the list is not a form to complete: a group's label starts the row, and nothing says a group is decided",
      story: "grouped-list/bare",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "lines",
      label:
        "Rows of several lines: a text wraps under its first line up to `lines`, the window counts and follows lines, and a row its end cuts ends in `…`",
      story: "grouped-list/wrapped",
      pi: yes(),
      claude: yes("a later line is a Button of its own with the row's `hit`"),
    },
    {
      id: "flat",
      label: "Little room: rows carry their group's label, dim, and there are no group rows",
      story: "grouped-list/flat",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "hover",
      label: "The row under the pointer is shown",
      story: "grouped-list/groups",
      pi: yes("the row is bold, like the keyboard's, without its pointer; `hovered` names it"),
      claude: yes(
        "the row sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
    },
  ],
});
