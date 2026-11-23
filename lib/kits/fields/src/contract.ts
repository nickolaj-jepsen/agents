/** The fields' contract: what a record holds, one named value each, and how each is edited. No host imports. */
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { MeaningName } from "@agents/kit-core/icons.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

/** One choice of an editor: what it sets, what it says, and the icon that names its meaning. */
export type Option = {
  value: string;
  label: string;
  /** A meaning that stands before the label where an icon is drawn (`priority:high`). */
  icon?: MeaningName;
};

/**
 * How a field is edited, as data. A graphical surface draws it in the value's own cell: a
 * `Select` for one, toggle chips and a search for many, an `Input` for text. A terminal opens
 * `one` and `many` as lettered choices in place; a surface with no `Input` or `Select` (the
 * mobile app) shows the value as text.
 */
export type Editor =
  /** One of several: no read or edit state of its own, a pick sets it. */
  | { kind: "one"; options: readonly Option[]; value: string }
  /**
   * Several of many, as chips. `shown` are options that stay drawn when turned off, so one can be
   * turned back on; `query` is what the search holds, and the options it finds are offered as chips.
   */
  | {
      kind: "many";
      options: readonly Option[];
      chosen: readonly string[];
      shown?: readonly string[];
      query?: string;
      /** Changes when the search is emptied, so the host starts its field afresh. */
      revision?: number;
    }
  | { kind: "text"; value: string };

export type Field = {
  /** The letter that opens it, printed before its label. The caller owns the binding. */
  key?: string;
  label: string;
  /** What it holds, as plain text: what a terminal and a read-only surface show. */
  value: string;
  /** Nothing is set: the value, such as `None`, is quiet. */
  empty?: boolean;
  /** A meaning icon before the value on a graphical surface (`field:status`, `priority:high`). */
  icon?: MeaningName;
  /** How it is edited. Without one the field is read, or, with a `hit`, pressed. */
  editor?: Editor;
  /** The control its row belongs to. Without one it is only read. */
  hit?: string;
  /** Under the pointer: its value bold in the text colour. */
  hovered?: boolean;
};

/**
 * The fields' model: a record's named values and how they are laid out. A graphical surface
 * always draws the two-column grid; `inline` and `valueLines` are for a terminal short of rows.
 */
export type Fields = {
  fields: readonly Field[];
  /** The keyboard is here: the keys are in the accent, as a question card's letters are. */
  active?: boolean;
  /** Values side by side, each after its key, in place of a row each: for a room short of rows. */
  inline?: boolean;
  /** Rows a value may take in a row of its own. @default 2 */
  valueLines?: number;
  /** The room in cells. */
  width: number;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const fieldsNeeds = {
  width: "cells",
  inline: "cells",
  valueLines: "cells",
  active: "keyFocus:kit|ring",
} as const;

export const fieldsFields = modelFields<Fields>()([
  "fields",
  "active",
  "inline",
  "valueLines",
  "width",
]);

export type FieldsProps<S extends Surface> = Props<Fields, typeof fieldsNeeds, S>;

/** What a terminal draws besides its width: `fields(all, width, options)`. */
export type FieldsOptions = Pick<
  FieldsProps<"pi" | "claude-terminal">,
  "active" | "inline" | "valueLines"
>;

/** The control a field is, as a drawn row's `hit`. */
export const fieldHit = (id: string) => `field:${id}`;

/** The field a `hit` names. */
export const fieldOf = (hit: string | undefined) =>
  hit?.startsWith("field:") ? hit.slice(6) : undefined;

/** The control that picks an option of a field's editor: a chip, a match, or a `Select`'s choice. */
export const optionHit = (field: string, value: string) => `option:${field}:${value}`;

/** The field and value an option `hit` names. */
export function optionOf(hit: string | undefined): { field: string; value: string } | undefined {
  if (!hit?.startsWith("option:")) return undefined;
  const rest = hit.slice(7);
  const at = rest.indexOf(":");
  return at < 0 ? undefined : { field: rest.slice(0, at), value: rest.slice(at + 1) };
}

/** The control a many-editor's search is, as an `input` hit: `field:labels:search`. */
export const searchHit = (field: string) => `${fieldHit(field)}:search`;
