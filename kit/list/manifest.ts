import { defineComponent, yes } from "../catalog/manifest.ts";

export default defineComponent({
  id: "grouped-list",
  name: "Grouped list",
  purpose:
    "Rows with a mark and one line each, under group rows, behind rails; taller than its room, a window.",
  impl: {
    pi: ["list", "listRange", "listShowsWhole"],
    claude: ["list", "listRange", "listShowsWhole"],
  },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "list/terminal.ts",
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
        "A row left alone, chosen (the accent, a filled mark) or set aside (the whole row dim)",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "narrow",
      label: "A long label cut from the left, a row cut to one line, its aside dropped first",
      story: "grouped-list/groups",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "window",
      label:
        "Taller than its room: the keyboard's group row on top, the last row saying what is hidden above and below",
      story: "grouped-list/window",
      pi: yes("the wheel moves the window by `scroll`; `listRange` bounds it"),
      claude: yes("the wheel reaches the mod as `ui.scroll` with the row under the pointer"),
    },
    {
      id: "sticky",
      label: "The group row stays on top of the rows it scrolls past",
      story: "grouped-list/sticky",
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
