/** The fields' contract: what a record holds, one named value each. No host imports. */

export type Field = {
  /** The letter that opens it, printed before its label. The caller owns the binding. */
  key?: string;
  label: string;
  /** What it holds, as plain text. */
  value: string;
  /** Nothing is set: the value, such as `None`, is quiet. */
  empty?: boolean;
  /** The control its row belongs to. Without one it is only read. */
  hit?: string;
};

export type FieldsOptions = {
  /** The keyboard is here: the keys are in the accent, as a question card's letters are. */
  active?: boolean;
  /** Values side by side, each after its key, in place of a row each: for a room short of rows. */
  inline?: boolean;
  /** Rows a value may take in a row of its own. @default 2 */
  valueLines?: number;
};

/** The control a field is, as a drawn row's `hit`. */
export const fieldHit = (id: string) => `field:${id}`;

/** The field a `hit` names. */
export const fieldOf = (hit: string | undefined) =>
  hit?.startsWith("field:") ? hit.slice(6) : undefined;
