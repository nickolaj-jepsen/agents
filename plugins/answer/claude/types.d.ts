// The mod's state contract. Claude Code wants it self-contained, so it restates the shapes
// `core/forms.ts` owns; the module assigns the core's values to these, so `tsc` flags a drift.

export type Action =
  | { do: "pick"; entry: number }
  | { do: "write" | "note"; text: string }
  | { do: "go"; step: number }
  | {
      do: "accept" | "next" | "back" | "forward" | "skip" | "clear" | "review";
    };

export type Entry = {
  kind: "option" | "accept" | "write";
  /** The option's letter as the message printed it ("B"); "" for any other entry, and in a pick list. */
  key: string;
  text: string;
  /** The lines that continued it, drawn under it. */
  detail: string;
  isRecommended: boolean;
  isChosen: boolean;
};

export type Item = {
  /** As printed ("Q3", "2"). */
  label: string;
  title: string;
  /** Markdown: what the item said besides its title, options and recommendation. */
  body: string;
  entries: Entry[];
  /** The entry the cursor starts on. */
  start: number;
  /** What it recommends among its options and why, "" with none. */
  recommended: string;
  /** Whether the recommendation or answer is a bundle of options. */
  isSeveral: boolean;
  /** Whether it recommends something a yes can take. */
  canAccept: boolean;
  /** What a yes takes, as the reply says it: "B", "B, C" or "yes"; "" when it takes nothing. */
  accepts: string;
  note: string;
  /** The write-in answer, "" for none. */
  written: string;
};

/** All there is to draw of the draft (`view` in the core). */
export type View = {
  id: string;
  kind: "round" | "picks";
  title: string;
  count: number;
  answered: number;
  /** The item shown, or `count` for the review. */
  step: number;
  isReview: boolean;
  item: Item | null;
  review: {
    label: string;
    title: string;
    shown: string;
    isAnswered: boolean;
    note: string;
  }[];
  /** Said last, about the whole round. */
  note: string;
  reply: string;
};

export type Answer =
  | { kind: "option"; index: number }
  | { kind: "options"; indices: number[] }
  | { kind: "accept" }
  | { kind: "text"; text: string };

/** The form and the answers so far, as the core parses and steps them. */
export type Held = {
  form: {
    kind: "round" | "picks";
    items: {
      label: string;
      title: string;
      body: string;
      options: { key: string; text: string; detail: string }[];
      recommended?: string;
      recommendedOption?: number;
      recommendedOptions?: number[];
    }[];
  };
  draft: {
    answers: (Answer | null)[];
    notes: string[];
    note: string;
    step: number;
  };
};

/** The field being typed in: the shown item's write-in, or a note. */
export type Editing = "write" | "note" | null;

export type TranscriptRound = {
  source: string;
  preamble: string;
  matchByText?: boolean;
  /** One anchor per question plus review, or one shared message anchor. */
  anchors: string[];
  /** A transcript anchor per review question, then one for the footer. */
  frozen?: Held;
  sent?: true;
};

export type RoundEditor = {
  from: number;
  surface: "terminal" | "desktop" | "vscode";
  /** Number of single-line fields in the VS Code inline editor, if extended. */
  lines?: number;
};

/** The last turn's form, while it can still be answered. */
export type Current = {
  /** The session's own, kept nowhere else. */
  held: Held;
  /** What `held` draws as. */
  view: View;
  editing: Editing;
  /** The shown item's body opened whole on a graphical surface; it folds to a line otherwise. */
  isBodyOpen: boolean;
  /**
   * Whether the band holds the keyboard on a terminal: true only after a `ui.focus` that moved
   * the ring into it. A click in the transcript gives the keys back to the prompt and the band
   * is not told, so the actions that take them say so themselves.
   */
  hasKeys?: boolean;
  /** The question the last step was opened from, where `r` goes back to. */
  reviewFrom?: number;
  /**
   * A field shown above the prompt that has not received keyboard focus yet.
   */
  pending?: { from: number; field: NonNullable<Editing>; isWarned?: true };
  /** Drawn as the form, not its one row. */
  isOpen: boolean;
  /** The reply the last fill put in the prompt, so the next one takes its place. */
  filled: string | null;
  /** The answers placed in the prompt, which may differ from the latest picks. */
  filledRound?: Held;
  transcript?: string;
  writer?: RoundEditor;
};

declare module "claude-code" {
  interface PluginState {
    answer: {
      current: Shaped<Current | null>;
      /** The round a send set aside, which `/answer` brings back. */
      aside: Shaped<(Held & { transcript?: string }) | null>;
      transcript: Shaped<Record<string, TranscriptRound>>;
    };
  }
}
