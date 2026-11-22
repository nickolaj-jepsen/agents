/** The captioned frame's stories. No host imports. */
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import { heading, steps } from "@agents/kit-card/terminal.ts";
import type { KitStory } from "@agents/kit-core/stories.ts";
import { captionFrameLayout } from "./contract.ts";
import { captionFrame } from "./terminal.ts";

const body = (width: number) =>
  heading(
    { active: true, label: "Q1", title: "Where should the session store live?" },
    width - 2 * captionFrameLayout.x,
  );

const footer = (width: number) =>
  buttonRow(
    [
      { hotkey: "enter", label: "Choose", hit: "choose", isLit: true },
      { hotkey: "n", label: "Note", hit: "note" },
    ],
    width - 2 * captionFrameLayout.x,
  )[0];

export const frameStories: KitStory[] = [
  {
    component: "caption-frame",
    state: "title",
    about: "A form between two rules: its title in the top one, Close at the right",
    settings: "captionFrame({title, close: {}, body, footer})",
    extreme: true,
    lines: (width) =>
      captionFrame({
        width,
        title: "Storage",
        close: {},
        body: body(width),
        footer: footer(width),
      }),
  },
  {
    component: "caption-frame",
    state: "steps",
    about: "Steps in place of the title, drawn in the room the rule has",
    settings: "captionFrame({caption: (width) => steps(...)})",
    lines: (width) =>
      captionFrame({
        width,
        title: "Review",
        caption: (room) =>
          steps(
            [
              { short: "1", name: "Storage", done: true, hit: "step:0" },
              { short: "2", name: "Retention", current: true, hit: "step:1" },
              { short: "Review", hit: "step:2" },
            ],
            room,
          )?.spans,
        close: {},
        body: body(width),
        footer: footer(width),
      }),
  },
  {
    component: "caption-frame",
    state: "confirm",
    about: "Close asks before it throws the answers away, in the place it stood",
    settings: "captionFrame({close: {confirming: true}})",
    lines: (width) =>
      captionFrame({
        width,
        title: "Storage",
        close: { confirming: true },
        body: body(width),
        footer: footer(width),
      }),
  },
];
