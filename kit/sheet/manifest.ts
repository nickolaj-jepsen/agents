import { defineComponent, no, yes } from "../catalog/manifest.ts";

export default defineComponent({
  id: "sheet",
  name: "Sheet",
  purpose:
    "A panel laid over the screen, closed on every side: the title and Close in its top edge, buttons at its foot.",
  impl: { pi: ["sheet", "sheetHead"], claude: ["sheet", "sheetHead"] },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "sheet/terminal.ts",
  features: [
    {
      id: "edges",
      label: "Closed on every side, the title and Close in the top edge",
      story: "sheet/title",
      pi: yes("an overlay anchored to the bottom, at the width of a Claude Code pane"),
      claude: no(
        "the engine frames a pane itself, a box above the prompt or a rule beside the transcript, with its own Close; a mod draws `sheetHead` in it",
      ),
    },
    {
      id: "confirm",
      label: "Close asks before it throws the work away, in the place it stood",
      story: "sheet/confirm",
      pi: yes("Discard and Keep are controls with a `hit` each"),
      claude: yes("in `sheetHead`: the question stands at the right of the title"),
    },
    {
      id: "notice",
      label: "A notice in a row of its own above the buttons",
      story: "sheet/confirm",
      pi: yes(),
      claude: no("without the edges a mod sets the row itself, above its button row"),
    },
    {
      id: "standing",
      label: "No bottom edge, where it stands on a rule the host draws",
      story: "sheet/standing",
      pi: yes("on the rule over the prompt, so the sheet reads as behind it"),
      claude: no("a pane is framed by the engine, which also places it"),
    },
    {
      id: "head",
      label: "The top edge alone: the title, and the question Close asks",
      story: "sheet/head",
      pi: yes(),
      claude: yes(),
    },
  ],
});
