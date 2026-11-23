/** The captioned frame's stories: the model as data, and what each drawing adds. No host imports. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { span } from "@agents/kit-core/lines.ts";
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { FrameModel } from "./model.ts";

/** A step of a form, as the terminal draws it in the room the rule has. */
export type StepData = { short: string; name?: string; done?: true; current?: true; hit: string };

/** What the terminal adds: the stage, and steps to draw as the caption in the room the rule has. */
export type TerminalExt = StageExt & { steps?: readonly StepData[] };

const FOOTER: readonly (readonly Button[])[] = [
  [
    { hotkey: "enter", label: "Choose", hit: "choose", isLit: true },
    { hotkey: "n", label: "Note", hit: "note" },
  ],
];

const BODY = { label: "Q1", question: "Where should the session store live?" };

/** A section's heading, as the graphical drawing too draws it. */
export const SECTION = {
  caption: [span("Evidence", { bold: true }), span("  3 sources", { role: "dim" })],
  end: [span("Add", { role: "accent", hit: "evidence:add" })],
};

export const frameStories: Story<FrameModel, TerminalExt, GuiExt>[] = [
  {
    component: "caption-frame",
    state: "title",
    about: "A form between two rules: its title in the top one, Close at the right",
    settings: "captionFrame({title, close: {}, body, footer})",
    model: {
      title: "Storage",
      close: {},
      body: BODY,
      footer: FOOTER,
      actions: [{ hotkey: "", label: "Skip all", hit: "skip" }],
    },
    ext: { terminal: { extreme: true } },
  },
  {
    component: "caption-frame",
    state: "steps",
    about: "Steps in place of the title, drawn in the room the rule has",
    settings: "captionFrame({caption: (width) => steps(...)})",
    model: {
      title: "Review",
      caption: [
        span("Step 2 of 3", { role: "dim" }),
        span(" ── ", { role: "dim" }),
        span("Retention", { bold: true }),
      ],
      close: {},
      body: BODY,
      footer: FOOTER,
    },
    ext: {
      terminal: {
        steps: [
          { short: "1", name: "Storage", done: true, hit: "step:0" },
          { short: "2", name: "Retention", current: true, hit: "step:1" },
          { short: "Review", hit: "step:2" },
        ],
      },
    },
  },
  {
    component: "caption-frame",
    state: "confirm",
    about: "Close asks before it throws the answers away, in the place it stood",
    settings: "captionFrame({close: {confirming: true}})",
    model: { title: "Storage", close: { confirming: true }, body: BODY, footer: FOOTER },
  },
  {
    component: "caption-frame",
    state: "section",
    about: "A section's heading: its words at the start and a control at the end",
    settings: "captionRule({caption, end})",
    model: { title: "Evidence", caption: SECTION.caption, end: SECTION.end, body: BODY },
  },
];
