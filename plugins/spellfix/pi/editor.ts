/**
 * The prompt editor a session draws its draft in, when another extension
 * publishes it on pi's shared event bus.
 *
 * Live underlining needs two things pi's editor API doesn't offer: a hook on
 * every drawn line, and a word when the draft changes. A package that has the
 * editor (nixos's chrome draws one) offers that pair instead of this half
 * importing it, which it can't: the two are built into different store paths.
 * Without an offer the commands, the shortcut and the review still work on
 * `ctx.ui.getEditorText()`; only the underlines are missing.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The draft as a publisher's editor exposes it. */
export type Draft = {
  getText(): string;
  getLines(): string[];
  getCursor(): { line: number; col: number };
  /** Replaces the whole draft, keeping the pastes its `[paste #n]` markers name. */
  replaceText(text: string): void;
  requestRender(): void;
};

/** What a publisher offers: how to decorate a drawn line, and how to hear an edit. */
export type Bridge = {
  add(decorator: { decorateLine?(line: string): string; onEdit?(draft: Draft): void }): void;
  /** The editor on screen now; a publisher builds a fresh one for every session. */
  current(): Draft | undefined;
};

/** Carries a bridge; whatever a listener is handed is the publisher's own object. */
export const OFFER = "fireproof:editor-hooks:offer";
/** Asked at session start, in case a bridge was offered before this half loaded. */
export const REQUEST = "fireproof:editor-hooks:request";

/**
 * Calls `use` once for each bridge a publisher offers, and asks for one at
 * session start: load order alone would leave whichever package loaded first
 * unheard.
 */
export const followEditor = (pi: ExtensionAPI, use: (bridge: Bridge) => void) => {
  const seen = new WeakSet<Bridge>();
  pi.events.on(OFFER, (data) => {
    if (!data || typeof data !== "object") return;
    const bridge = data as Bridge;
    if (seen.has(bridge) || typeof bridge.add !== "function") return;
    seen.add(bridge);
    use(bridge);
  });
  pi.on("session_start", () => pi.events.emit(REQUEST, undefined));
};
