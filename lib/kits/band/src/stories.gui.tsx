/** The status band's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { statusBand, type StatusBandGuiOptions } from "./gui.tsx";
import { statusBandProps } from "./stories.ts";

/** What only a graphical surface adds to each story: the words, a mark of its own, one line. */
const guiOptions: Record<keyof typeof statusBandProps, StatusBandGuiOptions> = {
  default: { text: "3 typos to review" },
  success: { text: "Filed LIN-482: Retry-After is ignored" },
  draft: {
    text: "The sync worker never reads Retry-After, so it retries sooner than the API allows",
    icon: "draft",
    tone: "neutral",
    isOneLine: true,
  },
  question: { text: "Which database?, 1 of 3 answered", icon: "question", tone: "neutral" },
  error: {},
};

const of =
  (state: keyof typeof statusBandProps): GuiStories[string] =>
  (g) =>
    statusBand(g, statusBandProps[state].band, guiOptions[state]);

export const statusBandGuiStories: GuiStories = {
  default: of("default"),
  success: of("success"),
  draft: of("draft"),
  question: of("question"),
  error: of("error"),
};
