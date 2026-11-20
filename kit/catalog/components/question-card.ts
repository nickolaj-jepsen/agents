import { defineComponent, planned, yes } from "../manifest.ts";

export default defineComponent({
  id: "question-card",
  name: "Question card",
  purpose: "A question and its choices on a left rail, with wrapped Markdown and selection marks.",
  impl: {
    pi: ["cardHeading", "cardChoice", "cardNote", "cardSections", "cardRail"],
    claude: { none: "The Claude terminal Answer cards have their own renderer." },
  },
  features: [
    {
      id: "choices",
      label:
        "Markdown headings, choices with focus and selection marks, literal write-ins, and notes",
      story: { pi: "question-card/choices" },
      pi: yes(),
      claude: planned("Reuse the native Answer card drawing when migrating the Claude kit."),
    },
  ],
});
