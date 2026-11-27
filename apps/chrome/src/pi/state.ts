import type { CustomEditor, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** What the frame asks of pi's screen: render again, and what holds the keyboard. */
export type Renderer = { requestRender(): void; getFocusedComponent?(): unknown };

/** State shared by the frame's modules; one instance per extension load. */
export type ChromeState = {
  /** Set once at session_start; its getters read the live session. */
  ctx: ExtensionContext | undefined;
  /**
   * Whether the session draws pi's TUI. A headless one (`pi -p`, RPC) shows none of this, so it
   * runs no git call and installs no editor or footer.
   */
  live: boolean;
  tui: Renderer | undefined;
  /** The prompt editor; pi copies its app keybinding handlers onto it, so controls can reuse them. */
  editor: CustomEditor | undefined;
  /** Group of the clickable thing under the pointer. */
  hover: string | undefined;
  /** Moves the hover; it lapses on its own because pi never reports the pointer leaving. */
  setHover(group: string | undefined): void;
};

// A resting pointer sends nothing, so this also bounds a hover whose exit pi never saw.
const HOVER_MS = 1500;

export const createState = (): ChromeState => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state: ChromeState = {
    ctx: undefined,
    live: false,
    tui: undefined,
    editor: undefined,
    hover: undefined,
    setHover: (group) => {
      if (timer) clearTimeout(timer);
      timer = group ? setTimeout(() => state.setHover(undefined), HOVER_MS) : undefined;
      timer?.unref?.();
      if (state.hover === group) return;
      state.hover = group;
      state.tui?.requestRender();
    },
  };
  return state;
};
