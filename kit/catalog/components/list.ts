import { defineComponent, no, partial, planned, yes } from "../manifest.ts";

export default defineComponent({
  id: "list",
  name: "List",
  purpose: "A grouped, scrolling list with a cursor, marks and metadata columns.",
  impl: { pi: "List", claude: ["list", "listRow"] },
  features: [
    {
      id: "keyboard",
      label: "Keyboard selection",
      story: "list/grouped",
      pi: yes("every key is the plugin's; the list moves a cursor"),
      claude: partial(
        "Button focus and hotkeys; the arrows scroll the pane, and a mod cannot bind a plain arrow key",
      ),
    },
    {
      id: "mouse-click",
      label: "Mouse click selects, a click on the mark toggles it",
      story: { pi: "list/selected", claude: "list/marks-multi" },
      pi: yes("hit-tested by the list from the overlay's mouse events"),
      claude: partial("a click presses the row, which docfix makes a toggle; free on Button"),
    },
    {
      id: "hover",
      label: "Hover lights a row",
      story: "list/selected",
      pi: yes("the hovered row is bold"),
      claude: planned("not documented for Button; confirm in a session before designing on it"),
    },
    {
      id: "pointer",
      label: "Selection pointer and accent title",
      story: "list/selected",
      pi: yes("a ❯ in the gutter, no inverse video"),
      claude: no(
        "the engine inverts the focused Button's text and offers no way to turn that off, so a pointer the kit drew would double it (tried in docfix)",
      ),
    },
    {
      id: "wrap",
      label: "Titles wrap and clamp",
      story: "list/extreme-titles",
      pi: yes("through `clamp`; every row keeps one height"),
      claude: yes("through `clamp`"),
    },
    {
      id: "scroll",
      label: "Scroll window follows the cursor",
      story: "list/scrolling",
      pi: yes("blank rows between groups drop first"),
      claude: no("a pane scrolls as a whole; there is no scroll element"),
    },
    {
      id: "more",
      label: "Whole rows only; hidden rows counted",
      story: "list/more",
      pi: yes("a dim `↑ n more` / `↓ n more` line stands in for the hidden rows"),
      claude: no("a pane scrolls as a whole, so no rows are hidden to count"),
    },
    {
      id: "groups",
      label: "Groups under a header rule",
      story: "list/grouped",
      pi: yes(),
      claude: yes("the rule is drawn text"),
    },
    {
      id: "marks",
      label: "Marks, several-of-many and one-of-many",
      story: "list/marks-multi",
      pi: yes("□ ■ and ○ ●"),
      claude: yes('□ ■, and ○ ● with `marks: "single"`'),
    },
    {
      id: "columns",
      label: "Right-aligned metadata columns",
      story: "list/column-drop",
      pi: yes("fixed width each; the lowest priority drops first"),
      claude: yes(
        "a docked pane is narrow, so metadata takes its own dim line there; columns show inline and wide",
      ),
    },
    {
      id: "predicate-colour",
      label: "Colour on a field by predicate",
      story: "list/coloured-metadata",
      pi: yes("a threshold or state, dim otherwise"),
      claude: yes("a Cell's `role`"),
    },
    {
      id: "wide-chars",
      label: "Wide characters measured in cells",
      story: "list/wide-chars",
      pi: yes(),
      claude: yes("measured with `cellWidth`"),
    },
  ],
});
