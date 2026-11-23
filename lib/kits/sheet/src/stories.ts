/** The sheet's stories: the model as data, and what each drawing adds. No host imports. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { span } from "@agents/kit-core/lines.ts";
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { SheetBody, SheetModelOf } from "./model.ts";

const BODY: SheetBody = {
  heading: "Honor `Retry-After` when the sync worker backs off",
  fields: [
    { label: "Team", value: "Platform" },
    { label: "Priority", value: "Medium" },
  ],
};

const FOOTER: readonly (readonly Button[])[] = [
  [
    { hotkey: "enter", label: "Create", hit: "create", isLit: true },
    { hotkey: "d", label: "Discard", hit: "discard" },
  ],
];

const DIALOG: { terminal: StageExt } = { terminal: { stage: "dialog" } };

export const sheetStories: Story<SheetModelOf, StageExt, GuiExt>[] = [
  {
    component: "sheet",
    state: "title",
    about: "A panel laid over the screen: the title and Close in its top edge, buttons at its foot",
    settings: "sheet({title, close: {}, body, footer})",
    model: { title: "Linear draft", close: {}, body: BODY, footer: FOOTER },
    ext: { terminal: { extreme: true, stage: "dialog" } },
  },
  {
    component: "sheet",
    state: "confirm",
    about: "Close asks before the draft goes, in the place it stood; a notice above the buttons",
    settings: "sheet({close: {confirming: true, question}, notice})",
    model: {
      title: "Linear draft",
      close: { confirming: true, question: "Discard draft?" },
      body: BODY,
      notice: [span("PLT-212 may already cover this", { role: "warning" })],
      footer: FOOTER,
    },
    ext: DIALOG,
  },
  {
    component: "sheet",
    state: "standing",
    about: "No bottom edge: its sides run down to a rule the host draws, as behind pi's prompt",
    settings: 'sheet({foot: "none"})',
    model: { title: "Linear draft", close: {}, body: BODY, footer: FOOTER, foot: "none" },
    ext: DIALOG,
  },
  {
    component: "sheet",
    state: "head",
    about: "The top edge alone, for a host that frames the panel itself",
    settings: "sheetHead({title, close: {confirming: true, question}})",
    model: {
      title: "Linear draft",
      close: { confirming: true, question: "Discard draft?" },
      body: BODY,
    },
    ext: DIALOG,
  },
];
