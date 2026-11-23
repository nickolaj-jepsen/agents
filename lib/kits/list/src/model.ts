/**
 * The list's view model: what each row and group is on a surface. Pure and plain: the graphical
 * drawing reads it, and so does the snapshot that holds it across surfaces. A terminal's rows
 * are its own lines (`terminal.ts`), so its view says only what they are marked with. No host
 * imports.
 */
import { tokens } from "@agents/kit-core/tokens.ts";
import { surfaces, type Surface } from "@agents/kit-core/surfaces.ts";
import type { MeaningName } from "@agents/kit-core/icons.ts";
import type { List, ListMark, ListRow } from "./contract.ts";

/** What a row's `markHit` Button says a press steps the mark to. */
const STEP_TEXT: Record<Exclude<ListMark, "none">, string> = {
  open: "Choose",
  chosen: "Set aside",
  dropped: "Restore",
};

/** What leads a row: a meaning on a graphical surface that was given one, else the bare mark. */
export type Lead = { meaning: MeaningName } | { mark: Exclude<ListMark, "none"> };

export type ControlView = { hit: string; label: string };

export type RowView = {
  text: string;
  isLiteral: boolean;
  /** Set aside or not usable: the words are dim. */
  isDim: boolean;
  lead?: Lead;
  aside?: string;
  /**
   * Where the aside sits: a short count or time (it starts with a digit) in the list's shared,
   * right-aligned column before the row's Button; any other, a word, follows the text.
   */
  asideIn?: "column" | "text";
  /** The Button that does what the row's text is: where a graphical surface has one. */
  action?: ControlView;
  /** The Button that steps the row's mark. */
  step?: ControlView;
  /** The row is opened in place: it sits in a panel with what belongs to it. */
  isOpened: boolean;
  hit?: string;
};

export type GroupView = {
  /** Empty: the group draws no heading, its rows are the whole list. */
  label: string;
  /** The keyboard's group: its label is in the accent. */
  isActive: boolean;
  /** Every row is decided: the heading says so with an icon. */
  isDone: boolean;
  /** The Button the heading itself is. */
  action?: ControlView;
  /** Controls at the heading's far edge. */
  actions: ControlView[];
  rows: RowView[];
  /** "Show N more", where the group is capped. */
  more?: ControlView;
};

export type ListView = {
  groups: GroupView[];
  /** Cells the shared aside column takes: the widest count or time of the list; 0 for none. */
  asideCells: number;
};

/** The longest an aside is, in cells, to scan as a column. */
const COLUMN_MAX = 8;

/** A count or a time: it starts with a digit and is short. */
const isColumn = (aside: string) => /^\d/.test(aside) && [...aside].length <= COLUMN_MAX;

const words = (text: string | undefined, fallback: string) => text ?? fallback;

/** How a row is drawn on `surface`. */
function rowView(r: ListRow, l: List<unknown>, isGui: boolean, isOpened: boolean): RowView {
  const mark = r.mark ?? "open";
  const isDisabled = Boolean(r.disabled);
  const lead: Lead | undefined =
    mark === "none" ? undefined : isGui && r.icon ? { meaning: r.icon } : { mark };
  const hasHit = isGui && r.hit !== undefined && !isDisabled;
  return {
    text: r.text,
    isLiteral: Boolean(r.literal),
    isDim: isDisabled || mark === "dropped",
    ...(lead ? { lead } : {}),
    ...(r.aside
      ? { aside: r.aside, ...(isGui ? { asideIn: isColumn(r.aside) ? "column" : "text" } : {}) }
      : {}),
    ...(hasHit
      ? {
          action: {
            hit: r.hit as string,
            label: isOpened ? words(l.closeAction, "Close") : words(r.action ?? l.action, "Open"),
          },
        }
      : {}),
    ...(isGui && r.markHit !== undefined && !isDisabled && mark !== "none"
      ? { step: { hit: r.markHit, label: STEP_TEXT[mark] } }
      : {}),
    isOpened,
    ...(r.hit !== undefined ? { hit: r.hit } : {}),
  };
}

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** What the list is on `surface`: rows with their leads and controls, groups capped. */
export function view(model: List<unknown>, surface: Surface): ListView {
  const isGui = surfaces[surface].drawing === "gui";
  const max = model.maxItems ?? tokens.gui.maxItems;
  const opened = model.opened ?? {};
  const isOpened = (r: ListRow) => r.hit !== undefined && opened[r.hit] !== undefined;
  const groups: GroupView[] = model.groups.map((g) => {
    const capped = isGui && model.more && !model.more.isAll && g.rows.length > max;
    const shown = capped ? g.rows.filter((r, n) => n < max || isOpened(r)) : g.rows;
    const left = g.rows.length - shown.length;
    return {
      label: g.label,
      isActive: Boolean(g.active),
      isDone: Boolean(g.done),
      ...(isGui && g.hit !== undefined
        ? { action: { hit: g.hit, label: words(model.action, "Open") } }
        : {}),
      actions: isGui
        ? (g.actions ?? []).flatMap((a) => (a.hit ? [{ hit: a.hit, label: capital(a.label) }] : []))
        : [],
      rows: shown.map((r) => rowView(r, model, isGui, isOpened(r))),
      ...(capped && left > 0 && model.more
        ? { more: { hit: model.more.hit, label: `Show ${left} more` } }
        : {}),
    };
  });
  const asideCells = Math.max(
    0,
    ...groups.flatMap((g) =>
      g.rows.flatMap((r) => (r.asideIn === "column" ? [[...(r.aside ?? "")].length] : [])),
    ),
  );
  return { groups, asideCells };
}
