import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "band",
  name: "Band shell",
  purpose:
    "The wrapper of a form that takes the strip above the prompt: a divider with a title and a slot, the body, a footer pinned below, and the room to itself while open.",
  impl: {
    pi: ["bandShell", "bandRows", "bandAct", "chipRow"],
    claude: ["bandShell", "bandRows", "onlyOwnRows"],
  },
  features: [
    {
      id: "divider",
      label: "Top divider with a title on the left and a slot after it",
      story: "band/default",
      pi: yes(
        "in the rounded border: the slot's forms are given widest first, the first that fits is drawn, its cells clickable",
      ),
      claude: yes("the rule fills what the title and the slot leave"),
    },
    {
      id: "title-only",
      label: "A title and no slot",
      story: "band/title-only",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "height",
      label: "Stands as tall as its tallest state",
      story: "band/height",
      pi: yes(
        "`bandRows` counts body rows within the terminal's rows less the transcript's, the frame's own and a minimum of four; a taller body scrolls above the footer",
      ),
      claude: yes(
        "`bandRows` keeps `reserved` rows for another mod; a native surface has no heights in rows",
      ),
    },
    {
      id: "joined",
      label: "Stands on the line below it: no bottom border, the keys in a last row",
      story: "band/joined",
      pi: yes("`isJoined`: the answer form stands on the prompt's rule, so the two read as one"),
      claude: no("the band is a divider and rows, with no frame to join to the prompt"),
    },
    {
      id: "sole",
      label: "Hides every other mod's row while open",
      story: "band/default",
      pi: no("the form replaces the editor, so nothing else shares its place"),
      claude: yes(
        "`onlyOwnRows` in the `AbovePromptList` hook; the catalogue draws its stories through it",
      ),
    },
  ],
});
