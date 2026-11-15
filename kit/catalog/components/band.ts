import { defineComponent, no, yes } from "../manifest.ts";

export default defineComponent({
  id: "band",
  name: "Band shell",
  purpose:
    "The wrapper of a form that takes the strip above the prompt: a divider with a title and a slot, the body, a footer pinned below, and the room to itself while open.",
  impl: {
    pi: {
      none: "pi has no band; a form there replaces the editor, framed by modalFrame (see frame)",
    },
    claude: ["bandShell", "bandRows", "onlyOwnRows"],
  },
  features: [
    {
      id: "divider",
      label: "Top divider with a title on the left and a slot after it",
      story: "band/default",
      pi: no("the editor-replacing component has a border with a title and hints, not a band"),
      claude: yes("the rule fills what the title and the slot leave"),
    },
    {
      id: "title-only",
      label: "A title and no slot",
      story: "band/title-only",
      pi: no("no band"),
      claude: yes(),
    },
    {
      id: "height",
      label: "Stands as tall as its tallest state",
      story: "band/height",
      pi: no("a pi form is sized by its own component"),
      claude: yes(
        "`bandRows` keeps `reserved` rows for another mod; a native surface has no heights in rows",
      ),
    },
    {
      id: "sole",
      label: "Hides every other mod's row while open",
      story: "band/default",
      pi: no("no band"),
      claude: yes(
        "`onlyOwnRows` in the `AbovePromptList` hook; the catalogue draws its stories through it",
      ),
    },
  ],
});
