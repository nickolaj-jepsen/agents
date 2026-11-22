import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "split",
  name: "Split",
  purpose: "A list beside the selected row's detail, in one border, stacked on a narrow terminal.",
  impl: {
    pi: ["splitLayout", "splitFrame"],
    claude: {
      none: "a docked pane is about 48 columns, so there is no room for two panes; rows carry their own metadata line and the detail follows the list",
    },
  },
  features: [
    {
      id: "two-pane",
      label: "Two panes with a divider",
      story: "split/two-pane",
      pi: yes("from 110 terminal columns, the list taking 55%"),
      claude: no(
        "a docked pane is about 48 columns; the surface, not the mod, chooses where a pane goes",
      ),
    },
    {
      id: "junction",
      label: "┬ and ┴ on the divider at every width",
      story: "split/hints-junction",
      pi: yes("hints stay left of the divider, the lowest priority dropped first, esc kept"),
      claude: no("no two-pane layout"),
    },
    {
      id: "stacked",
      label: "Stacked: list above detail",
      story: "split/stacked",
      pi: yes("below 110 columns"),
      claude: no(
        "there is no split component to stack: a pane is the only layout, and docfix puts the evidence under its list by hand (the story)",
      ),
    },
  ],
});
