import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "sheet",
  name: "Sheet",
  purpose:
    "A panel laid over the screen, closed on every side: the title and Close in its top edge, buttons at its foot.",
  impl: { pi: ["sheet", "sheetHead"], claude: ["sheet", "sheetHead"], gui: ["sheet", "sheetHead"] },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "sheet/src/terminal.ts",
  features: [
    {
      id: "edges",
      label: "Closed on every side, the title and Close in the top edge",
      story: "sheet/title",
      pi: yes("an overlay anchored to the bottom, at the width of a Claude Code pane"),
      claude: no(
        "the engine frames a pane itself, a box above the prompt or a rule beside the transcript, with its own Close; a mod draws `sheetHead` in it",
      ),
      gui: no("the host frames the pane and owns its Close, so no edge is drawn"),
    },
    {
      id: "confirm",
      label: "Close asks before it throws the work away, in the place it stood",
      story: "sheet/confirm",
      pi: yes("Discard and Keep are controls with a `hit` each"),
      claude: yes("in `sheetHead`: the question stands at the right of the title"),
      gui: yes("the question with a Discard and a Keep Button, at the far edge of the head"),
    },
    {
      id: "notice",
      label: "A notice in a row of its own above the buttons",
      story: "sheet/confirm",
      pi: yes(),
      claude: no("without the edges a mod sets the row itself, above its button row"),
      gui: yes(
        "its own row between the body and the button rows; a body given as a list is groups, parted from each other and from it by the same space",
      ),
    },
    {
      id: "standing",
      label: "No bottom edge, where it stands on a rule the host draws",
      story: "sheet/standing",
      pi: yes("on the rule over the prompt, so the sheet reads as behind it"),
      claude: no("a pane is framed by the engine, which also places it"),
      gui: no("the host frames and places the pane; there is no edge to leave off"),
    },
    {
      id: "head",
      label: "The top edge alone: the title, and the question Close asks",
      story: "sheet/head",
      pi: yes(),
      claude: yes(),
      gui: yes("the title and the question, as `frameTop` draws them"),
    },
  ],
});
