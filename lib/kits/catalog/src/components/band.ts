import { defineLegacyComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's status-band now.");

export default defineLegacyComponent({
  id: "band",
  name: "Band shell",
  purpose:
    "The wrapper of a form that takes the strip above the prompt: a divider with a title and a slot, the body, a footer pinned below, and the room to itself while open.",
  impl: {
    pi: ["bandShell", "bandRows", "bandAct", "chipRow"],
    claude: { none: "Claude Code draws this with the kit's status-band now." },
  },
  features: [
    {
      id: "divider",
      label: "Top divider with a title on the left and a slot after it",
      story: { pi: "band/default" },
      pi: yes(
        "in the rounded border: the slot's forms are given widest first, the first that fits is drawn, its cells clickable",
      ),
      claude: gone,
    },
    {
      id: "title-only",
      label: "A title and no slot",
      story: { pi: "band/title-only" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "height",
      label: "Stands as tall as its tallest state",
      story: { pi: "band/height" },
      pi: yes(
        "`bandRows` counts body rows within the terminal's rows less the transcript's, the frame's own and a minimum of four; a taller body scrolls above the footer",
      ),
      claude: gone,
    },
    {
      id: "joined",
      label: "Stands on the line below it: no bottom border, the keys in a last row",
      story: { pi: "band/joined" },
      pi: yes("`isJoined`: the answer form stands on the prompt's rule, so the two read as one"),
      claude: gone,
    },
    {
      id: "sole",
      label: "Hides every other mod's row while open",
      story: { pi: "band/default" },
      pi: no("the form replaces the editor, so nothing else shares its place"),
      claude: gone,
    },
  ],
});
