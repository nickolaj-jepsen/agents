import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's grouped-list now.");

export default defineComponent({
  id: "list",
  name: "List",
  purpose: "A grouped, scrolling list with a cursor, marks and metadata columns.",
  impl: { pi: "List", claude: { none: "Claude Code draws this with the kit's grouped-list now." } },
  features: [
    {
      id: "keyboard",
      label: "Keyboard selection",
      story: { pi: "list/grouped" },
      pi: yes("every key is the plugin's; the list moves a cursor"),
      claude: gone,
    },
    {
      id: "mouse-click",
      label: "Mouse click selects, a click on the mark toggles it",
      story: { pi: "list/selected" },
      pi: yes("hit-tested by the list from the overlay's mouse events"),
      claude: gone,
    },
    {
      id: "hover",
      label: "Hover lights a row",
      story: { pi: "list/selected" },
      pi: yes("the hovered row is bold"),
      claude: gone,
    },
    {
      id: "pointer",
      label: "Selection pointer and accent title",
      story: { pi: "list/selected" },
      pi: yes("a ❯ in the gutter, no inverse video"),
      claude: gone,
    },
    {
      id: "wrap",
      label: "Titles wrap and clamp",
      story: { pi: "list/extreme-titles" },
      pi: yes("through `clamp`; every row keeps one height"),
      claude: gone,
    },
    {
      id: "scroll",
      label: "Scroll window follows the cursor",
      story: { pi: "list/scrolling" },
      pi: yes("blank rows between groups drop first"),
      claude: gone,
    },
    {
      id: "more",
      label: "Whole rows only; hidden rows counted",
      story: { pi: "list/more" },
      pi: yes("a dim `↑ n more` / `↓ n more` line stands in for the hidden rows"),
      claude: gone,
    },
    {
      id: "groups",
      label: "Groups under a header rule",
      story: { pi: "list/grouped" },
      pi: yes("a name longer than the list wraps, its rule on the last line"),
      claude: gone,
    },
    {
      id: "marks",
      label: "Marks, several-of-many and one-of-many",
      story: { pi: "list/marks-multi" },
      pi: yes("□ ■ and ○ ●"),
      claude: gone,
    },
    {
      id: "columns",
      label: "Right-aligned metadata columns",
      story: { pi: "list/column-drop" },
      pi: yes("fixed width each; the lowest priority drops first"),
      claude: gone,
    },
    {
      id: "predicate-colour",
      label: "Colour on a field by predicate",
      story: { pi: "list/coloured-metadata" },
      pi: yes("a threshold or state, dim otherwise"),
      claude: gone,
    },
    {
      id: "wide-chars",
      label: "Wide characters measured in cells",
      story: { pi: "list/wide-chars" },
      pi: yes(),
      claude: gone,
    },
  ],
});
