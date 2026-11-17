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

/**
 * What the line under the keys says after an action, and in which role. `undo` holds the ids
 * a dismiss just closed, so the notice can offer to open them again.
 */
export type Said = { text: string; status: "success" | "warning" | "error"; undo?: string[] };

declare module "claude-code" {
  interface PluginState {
    docfix: {
      /** The open queue as the pane last loaded it. */
      queue: Shaped<Suggestion[]>;
      /** Ids marked for apply or dismiss. */
      marked: string[];
      /** The key of the pane element holding the focus ring. */
      focused: string | null;
      /** Ids whose evidence the list shows. */
      expanded: string[];
      /** One line under the keys after an action. */
      notice: Shaped<Said>;
    };
  }
}
