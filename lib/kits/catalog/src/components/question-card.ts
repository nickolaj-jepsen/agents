import { defineLegacyComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's card now.");

export default defineLegacyComponent({
  id: "question-card",
  name: "Question card",
  purpose: "A question and its choices on a left rail, with wrapped Markdown and selection marks.",
  impl: {
    pi: [
      "cardHeading",
      "cardChoice",
      "cardNote",
      "cardSections",
      "cardRail",
      "cardSteps",
      "cardSummary",
    ],
    claude: { none: "Claude Code draws this with the kit's card now." },
  },
  features: [
    {
      id: "choices",
      label:
        "Markdown headings, choices with focus and selection marks, literal write-ins, and notes",
      story: { pi: "question-card/choices" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "checkboxes",
      label: "A neutral focus chevron, independent of the accent on checked choices",
      story: { pi: "question-card/checkboxes" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "review",
      label: "Named steps in the caption and readable answer summaries",
      story: { pi: "question-card/review" },
      pi: yes(),
      claude: gone,
    },
  ],
});
