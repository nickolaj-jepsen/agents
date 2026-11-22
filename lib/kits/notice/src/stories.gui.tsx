/** The notice's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { emptyState, notice } from "./gui.tsx";
import { noticeProps } from "./stories.ts";

export const noticeLineGuiStories: GuiStories = {
  success: (g) => notice(g, noticeProps.success.text, noticeProps.success.status),
  warning: (g) => notice(g, noticeProps.warning.text, noticeProps.warning.status),
  error: (g) => notice(g, noticeProps.error.text, noticeProps.error.status),
  long: (g) => notice(g, noticeProps.long.text, noticeProps.long.status, { isCut: true }),
  context: (g) => notice(g, noticeProps.context.gui, "dim", { isCut: true }),
  empty: (g) => emptyState(g, noticeProps.empty.text, { text: noticeProps.empty.gui }),
};
