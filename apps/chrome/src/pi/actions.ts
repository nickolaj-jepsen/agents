/**
 * What the frame's controls do. The folder, the git menu and the notes each have one owner, the
 * plugin that draws the experience (`apps/open` and `apps/notes`), so a control here invokes the
 * command its owner registered instead of keeping a copy: a click and a typed command open the
 * same sheet, and a draft in the prompt is left as it was. See `@agents/actions`.
 *
 * The model picker and the thinking cycle are pi's own actions, reached through the editor's
 * handlers, so a click reads as one more key and the keybinding stays authoritative.
 */
import type {
  AppKeybinding,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { invokeAction, type Action as CheckoutAction } from "@agents/actions/invoke.ts";
import type { ChromeState } from "./state.ts";

/** What a control on the frame does when it is clicked. */
export type ChromeAction = (ctx: ExtensionContext) => void | Promise<void>;

/** Runs one of pi's own keybinding actions, or names the key when the editor has none. */
const appAction =
  (state: ChromeState, id: AppKeybinding, key: string): ChromeAction =>
  (ctx) => {
    const handler = state.editor?.actionHandlers.get(id);
    if (handler) handler();
    else ctx.ui.notify(`chrome: press ${key}`, "info");
  };

/**
 * Invokes the checkout action another plugin owns, through pi's own command path. Ignored while
 * another overlay has the keyboard: the dispatched command would stack a second one on it.
 */
const checkout =
  (pi: ExtensionAPI, state: ChromeState, action: CheckoutAction): ChromeAction =>
  (ctx) => {
    const focus = state.tui?.getFocusedComponent?.();
    if (focus && focus !== state.editor) return;
    if (!invokeAction(pi, action))
      ctx.ui.notify(`chrome: no /${action} plugin is installed`, "warning");
  };

export const createActions = (pi: ExtensionAPI, state: ChromeState) => ({
  /** Where the session is: the folder in an editor, a terminal or the file manager, and its path. */
  folder: checkout(pi, state, "open"),
  /** The branch, its repository and its pull request: the git menu. */
  git: checkout(pi, state, "git"),
  /**
   * The checkout's notes. The frame draws no control for it: its owner lists the notes, and the
   * entry point is the `/notes` command.
   */
  notes: checkout(pi, state, "notes"),
  // pi's own picker. A click while it or any other dialog holds focus closes that instead of
  // stacking the picker on top: pi closes those on Escape without telling anyone.
  model: ((ctx) => {
    const focus = state.tui?.getFocusedComponent?.();
    if (focus && focus !== state.editor) {
      (focus as { handleInput?(data: string): void }).handleInput?.("\x1b");
      return;
    }
    return appAction(state, "app.model.select", "ctrl+l")(ctx);
  }) as ChromeAction,
  effort: appAction(state, "app.thinking.cycle", "shift+tab"),
});

export type Actions = ReturnType<typeof createActions>;
