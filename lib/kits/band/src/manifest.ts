import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "status-band",
  name: "Status band",
  purpose:
    "The one line above the prompt that says there is something to open: a status mark and the text, then a way in and further actions.",
  impl: { pi: "statusBand", claude: "statusBand", gui: "statusBand" },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "band/src/terminal.ts",
  features: [
    {
      id: "line",
      label: "A status mark and the text, the hint dim; the whole line is the way in",
      story: "status-band/default",
      pi: yes("the line carries the `hit`, so a click anywhere on it opens"),
      claude: yes("one plain Button over the whole line"),
      gui: yes("an icon, the text and a quiet `hint` Button, on one line"),
    },
    {
      id: "status",
      label: "Warning, error and success, only for an actual state",
      story: "status-band/error",
      pi: yes("the glyph and the text in the role"),
      claude: yes("the glyph and the text in the role"),
      gui: yes("the icon's own tone"),
    },
    {
      id: "cut",
      label: "The text is cut so the hint stays whole",
      story: "status-band/default",
      pi: yes("`…` before the hint"),
      claude: yes("`…` before the hint"),
      gui: yes("with `isOneLine` the surface cuts the text at the edge; otherwise it wraps"),
    },
    {
      id: "actions",
      label: "Further actions after the way in",
      story: "status-band/success",
      pi: no("the band is one line that is one control; the mod offers further actions as keys"),
      claude: no(
        "the band is one line that is one control; the mod offers further actions as keys",
      ),
      gui: yes("a quiet Button each, wrapped under the text, or after it with `isOneLine`"),
    },
    {
      id: "focus",
      label: "The keyboard's focus on the line",
      story: "status-band/default",
      pi: yes("`hovered` makes the line bold"),
      claude: yes("`hovered` makes the line bold; the mod keeps the focus (`ringMove`)"),
      gui: no("the host draws a Button's focus itself"),
    },
    {
      id: "words",
      label: "The text in words, with its own icon",
      story: "status-band/question",
      pi: no("the terminal's line has one mark per status and the short text"),
      claude: no("the terminal's line has one mark per status and the short text"),
      gui: yes("the graphical options `text`, `icon` and `tone`"),
    },
  ],
});
