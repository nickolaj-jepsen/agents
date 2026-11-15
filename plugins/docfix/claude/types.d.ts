// The mod's state contract. Claude Code wants it self-contained, so it restates the shapes
// `core/docfix.ts` owns; the module assigns the core's values to these, so `tsc` flags a drift.

export type Evidence = { at: string; session: string; text: string };

export type Suggestion = {
  id: string;
  target: string;
  kind: "wrong" | "missing" | "stale";
  claim: string;
  status: "open" | "dismissed";
  created: string;
  updated: string;
  dismissed: string;
  sessions: string[];
  evidence: Evidence[];
};

declare module "claude-code" {
  interface PluginState {
    docfix: {
      /** The open queue as the pane last loaded it. */
      queue: Shaped<Suggestion[]>;
      /** Ids marked for apply or dismiss. */
      marked: string[];
      /** The key of the pane element holding the focus ring. */
      focused: string | null;
      /** One line under the list after an action. */
      notice: string;
    };
  }
}
