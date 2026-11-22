import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "fields",
  name: "Fields",
  purpose: "What a record holds, one named value each: a row per field, or side by side.",
  impl: { pi: "fields", claude: "fields", gui: "fields" },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "fields/src/terminal.ts",
  features: [
    {
      id: "rows",
      label: "A row per field, the labels in one column; a long value hangs under its start",
      story: "fields/rows",
      pi: yes(),
      claude: yes(),
      gui: yes("a label column beside each value; a long value wraps"),
    },
    {
      id: "keys",
      label: "A key before each field, in the accent where the keyboard is",
      story: "fields/rows",
      pi: yes("the caller binds the letters"),
      claude: yes("the caller binds the letters, on buttons that draw nothing (`ring`)"),
      gui: no("a graphical field is pressed, so its letter is not drawn"),
    },
    {
      id: "inline",
      label: "Values side by side after their keys, wrapped whole, where rows are short",
      story: "fields/inline",
      pi: yes(),
      claude: yes(),
      gui: yes("a wrapping row of label and value"),
    },
    {
      id: "press",
      label: "A field is a control: its row, or its cells when side by side",
      story: "fields/rows",
      pi: yes("the row carries the `hit`; `hovered` in `lines.ts` draws the pointer's"),
      claude: yes("a press lands on the row's Button; the engine's hover is the soft fill"),
      gui: yes(
        "a quiet Button holding the value (an empty one is dim italic text and a Set Button); `editors` shows an Input or Select in its place, with a quiet Done under it (`done`); a long value is text with a Change Button",
      ),
    },
    {
      id: "read",
      label: "Read only: no keys and nothing to press",
      story: "fields/read",
      pi: yes(),
      claude: yes(),
      gui: yes("text only"),
    },
  ],
});
