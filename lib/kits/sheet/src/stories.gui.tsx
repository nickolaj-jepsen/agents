/** The sheet's graphical stories, drawn by `gui.tsx`. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { line, span } from "@agents/kit-core/lines.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { sheet, sheetHead } from "./gui.tsx";

const body = (g: Gui) => (
  <g.els.Box flexDirection="column" paddingX={tokens.gui.across.inset}>
    <g.els.Text weight="semibold">Honor Retry-After when the sync worker backs off</g.els.Text>
    <g.els.Text dimColor>Team Platform, priority Medium</g.els.Text>
  </g.els.Box>
);
const footer: Button[][] = [
  [
    { hotkey: "enter", label: "Create", hit: "create", isLit: true },
    { hotkey: "d", label: "Discard", hit: "discard" },
  ],
];

export const sheetGuiStories: GuiStories = {
  title: (g) => sheet(g, { title: "Linear draft", close: {} }, { body: body(g), footer }),
  confirm: (g) =>
    sheet(
      g,
      {
        title: "Linear draft",
        close: { confirming: true, question: "Discard draft?" },
        notice: line([span("PLT-212 may already cover this", { role: "warning" })]),
      },
      { body: body(g), footer },
    ),
  head: (g) => (
    <g.els.Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {sheetHead(g, { title: "Linear draft" })}
      {sheetHead(g, {
        title: "Linear draft",
        close: { confirming: true, question: "Discard draft?" },
      })}
    </g.els.Box>
  ),
};
