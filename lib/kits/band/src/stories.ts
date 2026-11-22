/** The status band's stories. No host imports. */
import type { KitStory } from "@agents/kit-core/stories.ts";
import type { StatusBand } from "./contract.ts";
import { statusBand } from "./terminal.ts";

/** The props of each story, shared with `stories.gui.tsx`. */
export const statusBandProps = {
  default: {
    band: { text: "spellfix: 3 typos", hint: "review", hit: "open" },
  },
  success: {
    band: {
      text: "LIN-482 Retry-After is ignored",
      hint: "open",
      hit: "open",
      status: "success",
      actions: [
        { hit: "copy", label: "copy link" },
        { hit: "dismiss", label: "dismiss" },
      ],
    },
  },
  draft: {
    band: {
      text: "Linear draft",
      hint: "open",
      hit: "open",
      actions: [{ hit: "discard", label: "discard" }],
    },
  },
  question: {
    band: { text: "Which database?", hint: "answer", hit: "open" },
  },
  error: {
    band: { text: "docfix: the queue is stuck", hint: "retry", hit: "retry", status: "error" },
  },
} satisfies Record<string, { band: StatusBand }>;

const story = (state: keyof typeof statusBandProps, about: string, settings: string): KitStory => ({
  component: "status-band",
  state,
  about,
  settings,
  width: "dialog",
  gui: true,
  lines: (width) => statusBand(statusBandProps[state].band, width),
});

export const statusBandStories: KitStory[] = [
  story(
    "default",
    "A warning: a mark, the text, the hint dim; the whole line is one control",
    "statusBand({text, hint, hit}, width)",
  ),
  story(
    "success",
    "A state that is done; the terminal has only the way in",
    'statusBand({..., status: "success", actions}, width)',
  ),
  story(
    "draft",
    "A line that names what is already known",
    "statusBand({text, hint, hit, actions}, width)",
  ),
  story(
    "question",
    "A question waiting: the graphical band says it in words",
    "statusBand({text, hint, hit}, width)",
  ),
  story("error", "An error", 'statusBand({..., status: "error"}, width)'),
];
