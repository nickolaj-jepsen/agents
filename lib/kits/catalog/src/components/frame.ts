import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's caption-frame now.");

export default defineComponent({
  id: "frame",
  name: "Frame",
  purpose: "The border round a panel: title and count in the top, key hints in the bottom.",
  impl: {
    pi: ["modalFrame", "captionFrame"],
    claude: { none: "Claude Code draws this with the kit's caption-frame now." },
  },
  features: [
    {
      id: "own-border",
      label: "Draws its own rounded border",
      story: { pi: "frame/reading" },
      pi: yes("one border round a modal, none inside"),
      claude: gone,
    },
    {
      id: "caption",
      label: "Open-sided form with a caption in the top rule",
      story: { pi: "frame/caption" },
      pi: yes("two rules frame the form, with hints above the lower rule"),
      claude: gone,
    },
    {
      id: "caption-close",
      label: "Close and discard confirmation in the top rule",
      story: { pi: "frame/caption-confirm" },
      pi: yes("Close becomes Discard and Keep in place, with hit ranges for both"),
      claude: gone,
    },
    {
      id: "width-cap",
      label: "Width class as a cap",
      story: { pi: "frame/dialog" },
      pi: yes("reading, split, dialog, wide and auto, chosen with the overlay"),
      claude: gone,
    },
    {
      id: "fit-content",
      label: "Fits its content (auto)",
      story: { pi: "frame/auto" },
      pi: yes("within the dialog cap"),
      claude: gone,
    },
    {
      id: "title-count",
      label: "Title with a dim count",
      story: { pi: "frame/title-count" },
      pi: yes("in the top border"),
      claude: gone,
    },
    {
      id: "hints-border",
      label: "Hints in the border",
      story: { pi: "frame/hints-fit" },
      pi: yes("left-aligned, the border running on"),
      claude: gone,
    },
    {
      id: "hints-drop",
      label: "Hints drop lowest priority first, the way out stays",
      story: { pi: "frame/hints-drop" },
      pi: yes(),
      claude: gone,
    },
  ],
});
