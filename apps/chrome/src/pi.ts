/**
 * The frame around pi's prompt: the editor's top border naming the session, the terminal title and
 * the footer with the model and the checkout it is working in. The pieces are the frame's own
 * (`./pi/`); what a control does belongs to the plugin that draws the experience, and is invoked
 * through `@agents/actions` rather than copied here.
 *
 * Only the session a person started draws it: a headless session, and a plugin manifest that does
 * not offer its tools to subagents, leave it out.
 */
import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { liveFrame } from "./lib/frame.ts";
import { createActions } from "./pi/actions.ts";
import { createBorder } from "./pi/border.ts";
import { PromptEditor, type Painters } from "./pi/editor.ts";
import { createEditorHooks, publishEditorHooks } from "./pi/editor-hooks.ts";
import { createFooter } from "./pi/footer.ts";
import { createGit } from "./pi/git.ts";
import { createIdentity } from "./pi/identity.ts";
import { createState } from "./pi/state.ts";
import { createTitle } from "./pi/title.ts";
import { createUserWait } from "./pi/user-wait.ts";

// pi's root types omit EditorFactory, so it comes from the one API that takes it.
type EditorFactory = NonNullable<Parameters<ExtensionUIContext["setEditorComponent"]>[0]>;

export default function chrome(pi: ExtensionAPI) {
  const state = createState();
  const userWait = createUserWait(pi);
  const identity = createIdentity(pi, userWait);
  // The editor's hooks are offered at load and again whenever a listener asks: spellfix may load
  // before or after this, and it decorates whichever editor the session builds.
  const hooks = createEditorHooks();
  publishEditorHooks(pi, hooks);

  const git = createGit(state);
  const actions = createActions(pi, state);

  // Registered before the pieces, so their handlers already see the session. pi builds a fresh
  // runtime, and so a fresh instance of this, for every session.
  pi.on("session_start", (_event, ctx) => {
    state.ctx = ctx;
    state.live = liveFrame(ctx.mode, ctx.hasUI);
  });

  createTitle(pi, state, identity, userWait);
  const border = createBorder(state, identity);
  createFooter(pi, state, actions, git);
  const painters: Painters = {
    top: (width, hidden, paint, status) => border.drawTop(width, hidden, paint, status),
  };

  const factory: EditorFactory = (tui, theme, keybindings) => {
    const editor = new PromptEditor(tui, theme, keybindings, state, painters, hooks);
    state.tui = tui;
    state.editor = editor;
    return editor;
  };

  // pi puts its default editor back when a session ends, so this installs once per session.
  pi.on("session_start", (_event, ctx) => {
    if (state.live && ctx.ui.getEditorComponent() !== factory) ctx.ui.setEditorComponent(factory);
  });
  pi.on("session_shutdown", () => {
    // Until pi swaps it out, the editor draws plainly rather than through a dead ctx, and the
    // bridge hands no decorator an editor whose session is gone.
    state.live = false;
    state.tui = undefined;
    state.editor = undefined;
    hooks.attach(undefined);
  });
}
