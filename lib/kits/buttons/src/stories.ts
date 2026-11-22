/** The button row's stories. No host imports. */
import { span } from "@agents/kit-core/lines.ts";
import type { KitStory } from "@agents/kit-core/stories.ts";
import type { Button } from "./contract.ts";
import { buttonRow } from "./terminal.ts";

const KEYS: Button[] = [
  { hotkey: "enter", label: "Send", hit: "send", isLit: true },
  { hotkey: "n", label: "Note", hit: "note" },
  { hotkey: "space", label: "toggle" },
  { hotkey: "r", label: "Review", hit: "review" },
  { hotkey: "esc", label: "Back", hit: "back", essential: true },
];

export const buttonStories: KitStory[] = [
  {
    component: "button-row",
    state: "row",
    about: "Actions label first, the suggested one in the accent; a keyboard-only hint is dim",
    settings: "buttonRow(keys)",
    lines: (width) => buttonRow(KEYS, width),
  },
  {
    component: "button-row",
    state: "fit",
    about: "One row with no room drops what is neither suggested nor essential, last first",
    settings: "buttonRow(keys, 30)",
    lines: (width) => buttonRow(KEYS, Math.min(width, 30)),
  },
  {
    component: "button-row",
    state: "wrap",
    about: "Wrapped, nothing drops; words before the first entry are not a control",
    settings: "buttonRow(keys, 30, {wrap: true, lead})",
    lines: (width) =>
      buttonRow(KEYS, Math.min(width, 30), {
        wrap: true,
        lead: [span("2 of 3", { role: "dim" })],
      }),
  },
];
