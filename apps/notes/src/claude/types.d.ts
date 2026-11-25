// The mod's state contract. Claude Code wants it self-contained, so it restates the shapes
// `lib/shelf.ts` and `lib/screen.ts` own; the module assigns the lib's values to these, so `tsc`
// flags a drift.

export type Note = {
  id: string;
  name: string;
  file: string;
  kind: "markdown" | "html";
  at: number;
};

export type Group = {
  label: string;
  notes: Note[];
  artefacts: number;
  isMemory?: boolean;
};

/** What the folder the session runs in has: a store, no repository, or a store that failed. */
export type Place = "store" | "outside" | "none";

/** The store's groups as the list last loaded them, and what the link has to say. */
export type Shelf = { groups: Group[]; place: Place; notice: string | null };

export type Body = { text: string } | { problem: string };

/** The reader: the note it is on, how far it is scrolled, and its text once read. */
export type Reader = { id: string; offset: number; body?: Body };

/** Where the screen stands (`lib/screen.ts`'s state, less what `Shelf` holds). */
export type View = {
  focus: string | null;
  /** The list window's first line. */
  top: number;
  reader: Reader | null;
  /** What the last action has to say. */
  said: string | null;
};

/** What the band above the prompt says, and the note its way in opens. */
export type Band = { text: string; newest: string };

declare module "claude-code" {
  interface PluginState {
    notes: {
      shelf: Shaped<Shelf>;
      view: Shaped<View>;
      /** Notes written since the person last looked; none while there are none. */
      band: Shaped<Band | null>;
      /** The band's control the keyboard is on, once the band has it. */
      bandFocus: string | null;
      /** Whether the pane is up: the band steps aside while it is. */
      paneShown: boolean;
      /** Whether a long group shows every note, not the first few (graphical surfaces). */
      showAll: boolean;
      /**
       * Whether the pane holds the keyboard, as far as the mod can tell: the engine says when the
       * ring moves in it and when the person types in the prompt, not when Escape leaves it.
       */
      keys: Shaped<boolean>;
    };
  }
}
