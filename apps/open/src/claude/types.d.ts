// The mod's state contract. Claude Code wants it self-contained, so it restates the shapes
// `lib/menus.ts` owns; the module assigns the lib's values to these, so `tsc` flags a drift.

export type MenuKind = "git" | "folder";

/** What a row does when pressed; plain data, so the menu survives a reload. */
export type Action =
  | { kind: "url"; url: string }
  | { kind: "copy"; text: string; what: string }
  | { kind: "launch"; argv: string[]; cwd?: string };

export type Row = {
  id: string;
  label: string;
  /** A short note beside the label: a host, a state, a destination. */
  description?: string;
  /** Why the row cannot run; it keeps its place and says this when pressed. */
  unavailable?: string;
  action?: Action;
};

export type Menu = {
  kind: MenuKind;
  title: string;
  /** Beside the title, e.g. the repository the rows act on. */
  context?: string;
  /** Null while git and gh are still answering. */
  rows: Row[] | null;
  /** The row the focus starts on. */
  preferred?: string;
  /** Why the menu has no rows, e.g. not a repository. */
  error?: string;
};

declare module "claude-code" {
  interface PluginState {
    open: {
      menu: Menu | null;
      showAll: boolean;
      /** The row the terminal's keyboard is on. */
      focus: string | null;
      /** The terminal list's first line. */
      top: number;
      /** Whether the pane has the keyboard. */
      held: boolean;
    };
  }
}
