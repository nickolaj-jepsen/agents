/**
 * Icons that carry a meaning. A drawing names what a row or a state is (`priority:high`,
 * `kind:stale`, `decision:apply`, `state:error`) and never a mark: a graphical surface draws the
 * meaning as an `Svg` from the kit's set (`paint/gui.tsx`) in its role's colour, a terminal as a
 * glyph in the same role. No host imports.
 *
 * An `Svg` is drawn as an image, so its colour is fixed whatever the theme: the tones are
 * mid-tones that read on a light and a dark one (`tokens.gui.tone`). A neutral meaning is grey.
 */
import type { Role } from "./lines.ts";
import { tokens } from "./tokens.ts";

/** The drawings of the kit's set, which `paint/gui.tsx` holds. */
export type IconShape =
  | "wrong"
  | "stale"
  | "missing"
  | "warning"
  | "success"
  | "error"
  | "pending"
  | "open"
  | "chosen"
  | "dropped"
  | "note"
  | "question"
  | "write"
  | "status"
  | "priorityNone"
  | "priorityLow"
  | "priorityMedium"
  | "priorityHigh"
  | "priorityUrgent"
  | "project"
  | "label"
  | "draft";

/** What a meaning draws as. */
export type Meaning = {
  /** The drawing on a graphical surface. */
  shape: IconShape;
  /** Its colour on a graphical surface: a state's, or grey. */
  tone: keyof typeof tokens.gui.tone;
  /** The terminal's glyph, in `role`. */
  glyph: string;
  role: Role;
  /** What it says, for a reader that cannot see it. */
  alt: string;
};

const g = tokens.glyph;

/**
 * Every meaning the kit draws. Seeded from what `main`'s designs marked: a tracker's status and
 * priority, a doc suggestion's kind and what it is set to, and the states a notice has.
 */
export const meanings = {
  "state:success": {
    shape: "success",
    tone: "success",
    glyph: g.done,
    role: "success",
    alt: "Done",
  },
  "state:error": { shape: "error", tone: "error", glyph: g.times, role: "error", alt: "Failed" },
  "state:warning": {
    shape: "warning",
    tone: "warning",
    glyph: g.status.warning,
    role: "warning",
    alt: "Needs a look",
  },
  "state:pending": {
    shape: "pending",
    tone: "neutral",
    glyph: g.single.off,
    role: "dim",
    alt: "Pending",
  },
  "state:question": {
    shape: "question",
    tone: "neutral",
    glyph: "?",
    role: "dim",
    alt: "Waiting for an answer",
  },

  "kind:wrong": { shape: "wrong", tone: "error", glyph: "!", role: "error", alt: "Wrong" },
  "kind:stale": { shape: "stale", tone: "warning", glyph: "↻", role: "warning", alt: "Stale" },
  "kind:missing": { shape: "missing", tone: "neutral", glyph: "+", role: "text", alt: "Missing" },

  "decision:open": {
    shape: "open",
    tone: "neutral",
    glyph: g.single.off,
    role: "text",
    alt: "Not decided",
  },
  "decision:apply": {
    shape: "success",
    tone: "success",
    glyph: g.single.on,
    role: "accent",
    alt: "Set to apply",
  },
  "decision:dismiss": {
    shape: "dropped",
    tone: "neutral",
    glyph: g.dropped,
    role: "dim",
    alt: "Set to dismiss",
  },

  "choice:open": {
    shape: "open",
    tone: "neutral",
    glyph: g.single.off,
    role: "text",
    alt: "Not chosen",
  },
  "choice:chosen": {
    shape: "chosen",
    tone: "accent",
    glyph: g.single.on,
    role: "accent",
    alt: "Chosen",
  },

  "priority:none": {
    shape: "priorityNone",
    tone: "neutral",
    glyph: "-",
    role: "dim",
    alt: "No priority",
  },
  "priority:low": {
    shape: "priorityLow",
    tone: "neutral",
    glyph: "!",
    role: "dim",
    alt: "Low priority",
  },
  "priority:medium": {
    shape: "priorityMedium",
    tone: "neutral",
    glyph: "!!",
    role: "dim",
    alt: "Medium priority",
  },
  "priority:high": {
    shape: "priorityHigh",
    tone: "neutral",
    glyph: "!!!",
    role: "text",
    alt: "High priority",
  },
  "priority:urgent": {
    shape: "priorityUrgent",
    tone: "warning",
    glyph: g.status.warning,
    role: "warning",
    alt: "Urgent",
  },

  "field:status": {
    shape: "status",
    tone: "neutral",
    glyph: g.single.off,
    role: "dim",
    alt: "Status",
  },
  "field:project": {
    shape: "project",
    tone: "neutral",
    glyph: g.multi.off,
    role: "dim",
    alt: "Project",
  },
  "field:label": { shape: "label", tone: "neutral", glyph: g.single.on, role: "dim", alt: "Label" },
  "field:draft": { shape: "draft", tone: "neutral", glyph: "✎", role: "dim", alt: "Draft" },
} as const satisfies Record<string, Meaning>;

/** A meaning's name: `priority:high`. */
export type MeaningName = keyof typeof meanings;

/** The meanings of one family: `"priority"` gives `priority:none` to `priority:urgent`. */
export type MeaningOf<F extends string> = Extract<MeaningName, `${F}:${string}`>;

/** What a name draws as. */
export const meaningOf = (name: MeaningName): Meaning => meanings[name];
