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

/** What the line under the title says when something went wrong, and in which role. */
export type Said = { text: string; status: "success" | "warning" | "error" };

declare module "claude-code" {
  interface PluginState {
    docfix: {
      /** The open queue as the pane last loaded it. */
      queue: Shaped<Suggestion[]>;
      /** What each row is set to; a row not in it is skipped. Closing the pane carries it out. */
      choices: Shaped<Record<string, "apply" | "dismiss">>;
      /** The key of the pane element holding the focus ring. */
      focused: string | null;
      /** Ids whose evidence the list shows. */
      expanded: Shaped<string[]>;
      /** One line under the title when something went wrong. */
      notice: Shaped<Said>;
    };
  }
}
