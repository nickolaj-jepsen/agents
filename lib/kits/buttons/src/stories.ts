/** The button row's stories: the model as data, and what each drawing adds. No host imports. */
import { span } from "@agents/kit-core/lines.ts";
import type { GuiExt, Story } from "@agents/kit-core/stories.ts";
import type { Button, Buttons } from "./contract.ts";

export const KEYS: Button[] = [
  { hotkey: "enter", label: "Send", hit: "send", isLit: true },
  { hotkey: "n", label: "Note", hit: "note" },
  { hotkey: "space", label: "toggle" },
  { hotkey: "r", label: "Review", hit: "review" },
  { hotkey: "esc", label: "Back", hit: "back", essential: true },
];

/** What the terminal adds: the room the row is set in, in cells, when it is narrower than the stage. */
export type TerminalExt = { width?: number };

export const buttonStories: Story<Buttons, TerminalExt, GuiExt>[] = [
  {
    component: "button-row",
    state: "row",
    about: "Actions label first, the suggested one in the accent; a keyboard-only hint is dim",
    settings: "buttonRow(keys)",
    model: { rows: [KEYS] },
  },
  {
    component: "button-row",
    state: "fit",
    about: "One row with no room drops what is neither suggested nor essential, last first",
    settings: "buttonRow(keys, 30)",
    model: { rows: [KEYS] },
    ext: { terminal: { width: 30 } },
  },
  {
    component: "button-row",
    state: "wrap",
    about: "Wrapped, nothing drops; words before the first entry are not a control",
    settings: "buttonRow(keys, 30, {wrap: true, lead})",
    model: { rows: [KEYS], wrap: true, lead: [span("2 of 3", { role: "dim" })] },
    ext: { terminal: { width: 30 } },
  },
  {
    component: "button-row",
    state: "rows",
    about: "A footer of two rows starts both at one edge; one button is lit, though two ask",
    settings: "buttonRow({rows: [[…], […]]})",
    model: {
      rows: [
        [
          { hotkey: "enter", label: "Create", hit: "create", isLit: true },
          { hotkey: "o", label: "Create & open", hit: "create-open", isLit: true },
        ],
        [{ hotkey: "d", label: "Discard", hit: "discard" }],
      ],
    },
  },
  {
    component: "button-row",
    state: "chosen",
    about: "A row that sets something: the chosen button carries a check, none is filled",
    settings: "buttonRow({rows: [[{isChosen: true, …}, …]], isFlush: true})",
    model: {
      isFlush: true,
      rows: [
        [
          { hotkey: "", label: "apply", hit: "apply" },
          { hotkey: "", label: "dismiss", hit: "dismiss", isChosen: true },
          { hotkey: "", label: "skip", hit: "skip" },
        ],
      ],
    },
  },
  {
    component: "button-row",
    state: "confirm",
    about: "While Close asks, nothing is lit and every control goes quiet",
    settings: "buttonRow({confirming: true})",
    model: {
      confirming: true,
      rows: [
        [
          { hotkey: "enter", label: "Create", hit: "create", isLit: true },
          { hotkey: "d", label: "Discard", hit: "discard" },
        ],
      ],
    },
  },
];
