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

/** Where the terminal screen stands (`core/screen.ts`'s state, less what other atoms hold). */
export type View = {
  /** The suggestion the keyboard is on. */
  focus: string | null;
  /** The reader's piece of evidence, while it is open. */
  reader: number | null;
  scroll: { list: number; detail: number };
  /** Close asks before it throws away what is set. */
  confirming: boolean;
  /** How many are dismissed already, for the screen with nothing open. */
  dismissed: number;
};

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
      /** Whether the pane is up; the count above the prompt steps aside while it is. */
      paneShown: boolean;
      /** Whether a long queue shows every suggestion, not the first few (graphical surfaces). */
      showAll: boolean;
      /** One line under the title when something went wrong. */
      notice: Shaped<Said>;
      /** The terminal screen's focus, reader, scroll and close question. */
      view: Shaped<View>;
      /**
       * Whether the pane holds the keyboard, as far as the mod can tell: the engine says when the
       * ring moves in it and when the person types in the prompt, not when Escape leaves it.
       */
      keys: Shaped<boolean>;
    };
  }
}
