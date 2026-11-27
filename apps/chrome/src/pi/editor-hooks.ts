/**
 * The editor bridge: how a feature of another plugin decorates this frame's prompt without the
 * frame knowing about it. Each decorator restyles the drawn prompt lines and hears every edit.
 *
 * A feature of another package (spellfix's pi half) can't import this, so the hooks are offered on
 * pi's event bus: a listener hears the offer, or asks for one at session start, and decorates the
 * editor it is handed. That plugin restates these channels and the shape in its own `pi/editor.ts`.
 * The names and the shape are the contract; an extraction changes neither.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The prompt draft as a decorator may read and rewrite it. */
export type PromptDraft = {
  getText(): string;
  getLines(): string[];
  getCursor(): { line: number; col: number };
  /** Replaces the whole draft, keeping the pastes its `[paste #n]` markers name. */
  replaceText(text: string): void;
  /** Adds a prompt to the up-arrow history, as a submitted one would be. */
  addToHistory(text: string): void;
  requestRender(): void;
};

export type EditorDecorator = {
  /** One drawn line of prompt text (never the border), with the editor's own escapes in it. */
  decorateLine?(line: string): string;
  /** The draft changed, by a keystroke, a paste or a `setText`. */
  onEdit?(draft: PromptDraft): void;
};

export type EditorHooks = ReturnType<typeof createEditorHooks>;

export const createEditorHooks = () => {
  const decorators: EditorDecorator[] = [];
  let current: PromptDraft | undefined;
  return {
    add: (decorator: EditorDecorator): void => {
      decorators.push(decorator);
    },
    /**
     * The editor on screen now, or undefined once its session has ended: pi builds a fresh one for
     * every session, and a decorator must not reach through the one that is gone.
     */
    attach: (draft: PromptDraft | undefined): void => {
      current = draft;
    },
    current: (): PromptDraft | undefined => current,
    decorateLine: (line: string): string =>
      decorators.reduce((drawn, d) => d.decorateLine?.(drawn) ?? drawn, line),
    edited: (draft: PromptDraft): void => {
      for (const d of decorators) d.onEdit?.(draft);
    },
  };
};

/** Carries the bridge; a listener is handed the publisher's own object. */
export const EDITOR_HOOKS_OFFER = "fireproof:editor-hooks:offer";
/** Emitted at session start by a listener that may have missed the offer. */
export const EDITOR_HOOKS_REQUEST = "fireproof:editor-hooks:request";

/** What another package may use of the editor. */
export type EditorBridge = Pick<EditorHooks, "add" | "current">;

/**
 * Offers the editor's hooks to the other packages, and again whenever one asks: packages load in
 * an order neither side controls, and an offer a listener was not yet there for would otherwise
 * leave it without the underlines.
 */
export const publishEditorHooks = (pi: ExtensionAPI, hooks: EditorHooks): void => {
  const bridge: EditorBridge = { add: hooks.add, current: hooks.current };
  pi.events.on(EDITOR_HOOKS_REQUEST, () => pi.events.emit(EDITOR_HOOKS_OFFER, bridge));
  pi.on("session_start", () => pi.events.emit(EDITOR_HOOKS_OFFER, bridge));
};
