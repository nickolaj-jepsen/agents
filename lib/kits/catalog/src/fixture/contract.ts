/** A throwaway component the schema's checks are proved on; no real component uses it. */
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";

export type Row = {
  key: string;
  text: string;
  aside?: string;
  /** The keyboard's row. */
  focused?: boolean;
  /** The row under the pointer. */
  hovered?: boolean;
  /** Many lines of detail, in a window. */
  detailLines?: number;
};

export const rowNeeds = {
  focused: "keyFocus:kit|ring",
  hovered: "hover:kit|painter",
  detailLines: "window",
} as const;

export const rowFields = modelFields<Row>()([
  "key",
  "text",
  "aside",
  "focused",
  "hovered",
  "detailLines",
]);

export type RowProps<S extends Surface> = Props<Row, typeof rowNeeds, S>;
