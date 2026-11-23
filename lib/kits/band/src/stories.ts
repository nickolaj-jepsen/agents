/** The status band's stories: the model as data, and what each drawing adds. No host imports. */
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { StatusBandModel } from "./model.ts";

const DIALOG: { terminal: StageExt } = { terminal: { stage: "dialog" } };

export const statusBandStories: Story<StatusBandModel, StageExt, GuiExt>[] = [
  {
    component: "status-band",
    state: "default",
    about: "A warning: a mark, the text, the hint dim; the whole line is one control",
    settings: "statusBand({text, hint, hit, width})",
    // A graphical surface says it in words, not the terminal's shorthand.
    model: { text: "spellfix: 3 typos", hint: "review", hit: "open", words: "3 typos to review" },
    ext: DIALOG,
  },
  {
    component: "status-band",
    state: "success",
    about: "A state that is done; the terminal has only the way in",
    settings: 'statusBand({..., status: "success", actions, width})',
    model: {
      text: "LIN-482 Retry-After is ignored",
      hint: "open",
      hit: "open",
      status: "success",
      actions: [
        { hit: "copy", label: "copy link" },
        { hit: "dismiss", label: "dismiss" },
      ],
      words: "Filed LIN-482: Retry-After is ignored",
    },
    ext: DIALOG,
  },
  {
    component: "status-band",
    state: "draft",
    about: "A line that names what is already known",
    settings: "statusBand({text, hint, hit, actions, mark, isOneLine, width})",
    model: {
      text: "Linear draft",
      hint: "open",
      hit: "open",
      actions: [{ hit: "discard", label: "discard" }],
      words: "The sync worker never reads Retry-After, so it retries sooner than the API allows",
      mark: "field:draft",
      isOneLine: true,
    },
    ext: DIALOG,
  },
  {
    component: "status-band",
    state: "question",
    about: "A question waiting: the graphical band says it in words",
    settings: "statusBand({text, hint, hit, words, mark, width})",
    model: {
      text: "Which database?",
      hint: "answer",
      hit: "open",
      words: "Which database?, 1 of 3 answered",
      mark: "state:question",
    },
    ext: DIALOG,
  },
  {
    component: "status-band",
    state: "error",
    about: "An error",
    settings: 'statusBand({..., status: "error", width})',
    model: { text: "docfix: the queue is stuck", hint: "retry", hit: "retry", status: "error" },
    ext: DIALOG,
  },
];
