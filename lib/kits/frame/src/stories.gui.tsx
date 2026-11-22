/** The captioned frame's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { span } from "@agents/kit-core/lines.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { captionFrame, captionParts, captionRule } from "./gui.tsx";
import { SECTION } from "./stories.ts";

const body = (g: Gui) => <g.els.Text>Where should the session store live?</g.els.Text>;
const footer: Button[] = [
  { hotkey: "enter", label: "Choose", hit: "choose", isLit: true },
  { hotkey: "n", label: "Note", hit: "note" },
];

export const frameGuiStories: GuiStories = {
  title: (g) =>
    captionFrame(
      g,
      { title: "Storage", close: {} },
      { body: body(g), footer, actions: [{ hotkey: "", label: "Skip all", hit: "skip" }] },
    ),
  steps: (g) =>
    captionFrame(
      g,
      {
        title: "Review",
        caption: captionParts(g, [
          [span("Step 2 of 3", { role: "dim" })],
          [span("Retention", { bold: true })],
        ]),
        close: {},
      },
      { body: body(g), footer },
    ),
  confirm: (g) =>
    captionFrame(g, { title: "Storage", close: { confirming: true } }, { body: body(g), footer }),
  section: (g) => captionRule(g, SECTION) ?? <g.els.Box />,
};
