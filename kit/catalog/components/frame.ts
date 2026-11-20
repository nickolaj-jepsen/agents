import { defineComponent, no, partial, yes } from "../manifest.ts";

export default defineComponent({
  id: "frame",
  name: "Frame",
  purpose: "The border round a panel: title and count in the top, key hints in the bottom.",
  impl: { pi: ["modalFrame", "captionFrame"], claude: "paneTitle" },
  features: [
    {
      id: "own-border",
      label: "Draws its own rounded border",
      story: "frame/reading",
      pi: yes("one border round a modal, none inside"),
      claude: no(
        "a pane already has the engine's frame; the kit draws the title line, a band uses its own divider",
      ),
    },
    {
      id: "caption",
      label: "Open-sided form with a caption in the top rule",
      story: { pi: "frame/caption", claude: "frame/title-count" },
      pi: yes("two rules frame the form, with hints above the lower rule"),
      claude: partial("the kit draws the title rule; the host frames the pane"),
    },
    {
      id: "width-cap",
      label: "Width class as a cap",
      story: "frame/dialog",
      pi: yes("reading, split, dialog, wide and auto, chosen with the overlay"),
      claude: partial(
        "`widthCap` computes the cap; Box has no `maxWidth` and the surface sizes a pane, so a mod draws to it",
      ),
    },
    {
      id: "fit-content",
      label: "Fits its content (auto)",
      story: "frame/auto",
      pi: yes("within the dialog cap"),
      claude: no("a pane and a band take the width the surface gives them"),
    },
    {
      id: "title-count",
      label: "Title with a dim count",
      story: "frame/title-count",
      pi: yes("in the top border"),
      claude: yes("drawn as `─ Title  count ─────` text"),
    },
    {
      id: "hints-border",
      label: "Hints in the border",
      story: "frame/hints-fit",
      pi: yes("left-aligned, the border running on"),
      claude: no(
        "Box borders carry no text; the keys are a button row under the body (see buttons)",
      ),
    },
    {
      id: "hints-drop",
      label: "Hints drop lowest priority first, the way out stays",
      story: "frame/hints-drop",
      pi: yes(),
      claude: no("the button row wraps and drops nothing"),
    },
  ],
});
