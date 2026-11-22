/** The text of the card a Linear issue was drafted from, hidden until another card replaces it. */
export type Hidden = string | null;

/** One choice of a form Select: what Linear is sent, and what the person reads. */
export type Option = { value: string; label: string };

/** An open issue that already covers the seed, and the comment proposed for it. */
export type Duplicate = {
  issue: string;
  title: string;
  comment: string;
  about?: string;
  team?: string;
  status?: string;
};

/** The draft. The same shape as the shared core's `Form`, which this file cannot import. */
export type Form = {
  // Tells a late duplicate check whether its draft is still the one open.
  draftId: string;
  phase: "drafting" | "ready" | "filing" | "failed";
  // While drafting, what is being waited for.
  stage: "linear" | "writing";
  error: string | null;
  // What it is drafted from, kept to draft a failed one again.
  seed: { kind: "insight" | "note"; text: string };
  // Appended to the description when filed: repository, branch and session.
  source: string;
  teams: Option[];
  statuses: Option[];
  labels: Option[];
  projects: Option[];
  team: string;
  title: string;
  // Bumped on Enter in the title's or the description's field, which remounts it.
  fieldRevision: number;
  description: string;
  priority: number;
  state: string;
  labelIds: string[];
  project: string;
  duplicate: Duplicate | null;
  isCheckingDuplicates: boolean;
  // When what Enter does last changed: an Enter right after is ignored.
  settledAt: number;
};

/** Where the terminal's screen is. The same shape as the shared core's `View`. */
export type View = {
  step:
    | "review"
    | "title"
    | "body"
    | "duplicate"
    | { pick: "team" | "status" | "priority" | "labels" | "project" };
  top: number;
  focus: number;
  isConfirming: boolean;
  opens: boolean;
  since: number;
};

/** The graphical surfaces' editing of the draft's fields, opened in place. */
export type Editing = {
  isOpen: boolean;
  // What is typed in the field that finds a label to add, and its remount count to empty it.
  query: string;
  queryRevision: number;
  // The labels offered as on-or-off: the chosen ones when editing opened, and any added since.
  shown: string[];
};

/** What the last filed issue used, the fallback for the next draft. */
export type Last = { team: string; priority: number; open?: boolean };

/** An issue filed this session, echoed above the prompt until dismissed. */
export type Filed = { key: string; title: string; url: string };

declare module "claude-code" {
  interface PluginState {
    "linear-issue": {
      hidden: Hidden;
      form: Form | null;
      filed: Filed[];
      // Whether the draft pane is shown; a hidden draft gets a chip above the prompt.
      isPaneOpen: boolean;
      // Where the terminal's screen is: its step, its scroll and the keyboard's row.
      view: View;
      // Whether the pane holds the keyboard, as far as the engine says.
      keys: boolean;
      // Set by the chip's first Discard press; a second within a few seconds discards.
      isDiscardArmed: boolean;
      // Whether the possible duplicate is opened in place (graphical surfaces).
      isDuplicateOpen: boolean;
      // Whether the fields are opened to edit, and the label search (graphical surfaces).
      editing: Editing;
    };
  }
}
