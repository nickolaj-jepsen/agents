/**
 * What the frame's controls do. The folder, the git menu and the notes each have one owner, the
 * plugin that draws the experience (`apps/open` and `apps/notes`), so a control here invokes the
 * command its owner registered instead of keeping a copy: a click and a typed command open the
 * same sheet, and a draft in the prompt is left as it was. See `@agents/actions`.
 *
 * The model picker, the thinking cycle, the thinking block and the session tree are pi's own
 * actions, reached through the editor's handlers, so a click reads as one more key and the
 * keybinding stays authoritative.
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

/**
 * Runs one of pi's own keybinding actions, or says what to press when the editor has none: `hint`
 * is pi's default key, or the sentence to print for an action pi binds no key to.
 */
const appAction =
  (state: ChromeState, id: AppKeybinding, hint: string): ChromeAction =>
  (ctx) => {
    const handler = state.editor?.actionHandlers.get(id);
    if (handler) handler();
    else ctx.ui.notify(`chrome: ${hint}`, "info");
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
    return appAction(state, "app.model.select", "press ctrl+l")(ctx);
  }) as ChromeAction,
  effort: appAction(state, "app.thinking.cycle", "press shift+tab"),
  // The two chips on the editor's top border. Both flip a flag pi already owns, so ctrl+o and
  // ctrl+t keep their meaning and the click reads as one more key.
  tools: ((ctx) => ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded())) as ChromeAction,
  thinking: appAction(state, "app.thinking.toggle", "press ctrl+t"),
  // A full window is where the session tree earns its keep, so the context pill opens it. It is
  // pi's own handler, not the slash command: `/tree` is a built-in that only the interactive input
  // path runs.
  tree: appAction(state, "app.session.tree", "pi binds no key to its session tree here"),
});

export type Actions = ReturnType<typeof createActions>;
