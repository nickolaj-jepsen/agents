/**
 * The fields' view model: what each field's value cell is on a surface. Pure and plain: the
 * graphical drawing reads it, and so does the snapshot that holds it across surfaces. A graphical
 * surface always draws the two-column grid, whether a field is read or edited, so the cell is
 * the only thing that differs. No host imports.
 */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { Field, Fields, Option } from "./contract.ts";

/** What a screen of fields is, whatever its width. */
export type FieldsModel = Omit<Fields, "width">;

/** Matches a many-editor's search offers at most: it is for finding one, not for browsing all. */
export const MATCHES = 6;
/** A `Select` takes 1 to 64 options. */
export const SELECT_MAX = 64;

/** What a value cell holds. */
export type Cell =
  /** Words, quiet when `empty`; a read-only field, or an editor the surface cannot draw. */
  | { kind: "text"; text: string; empty: boolean; icon?: MeaningName }
  /** A quiet Button holding the value, which presses the field. */
  | { kind: "press"; text: string; empty: boolean; icon?: MeaningName }
  /** The terminal's lettered field: its value, whose choices open in place. */
  | { kind: "lettered"; text: string; empty: boolean }
  /** A `Select` showing the value, after the meaning icon of what it shows. */
  | { kind: "select"; value: string; icon?: MeaningName; options: readonly Option[] }
  /** Toggle chips, the search that finds more, and what it found as chips. */
  | {
      kind: "chips";
      chips: readonly { value: string; label: string; on: boolean }[];
      query: string;
      revision: number;
      matches: readonly Option[];
    }
  /** An `Input` at the value's width. */
  | { kind: "input"; value: string };

export type FieldsView = {
  /** The label column and the value column, or a terminal's rows or side by side. */
  layout: "grid" | "rows" | "inline";
  rows: readonly { label: string; key?: string; hit?: string; cell: Cell }[];
};

/** The cell of one field on a surface. */
export function cellOf(f: Field, surface: Surface): Cell {
  const e = f.editor;
  const quiet = !!f.empty;
  if (holds(surface, "cells")) return { kind: "lettered", text: f.value, empty: quiet };
  const edits = holds(surface, "input") && holds(surface, "select");
  if (!e || !edits)
    return f.hit && !e
      ? { kind: "press", text: f.value, empty: quiet, icon: f.icon }
      : { kind: "text", text: f.value, empty: quiet, icon: f.icon };
  if (e.kind === "text") return { kind: "input", value: e.value };
  if (e.kind === "one") {
    const at = e.options.find((o) => o.value === e.value);
    return {
      kind: "select",
      value: e.value,
      icon: at?.icon ?? f.icon,
      options: e.options.slice(0, SELECT_MAX),
    };
  }
  const shown = new Set([...(e.shown ?? []), ...e.chosen]);
  const query = (e.query ?? "").trim().toLowerCase();
  return {
    kind: "chips",
    chips: e.options
      .filter((o) => shown.has(o.value))
      .map((o) => ({ value: o.value, label: o.label, on: e.chosen.includes(o.value) })),
    query: e.query ?? "",
    revision: e.revision ?? 0,
    matches: query
      ? e.options
          .filter((o) => !shown.has(o.value) && o.label.toLowerCase().includes(query))
          .slice(0, MATCHES)
      : [],
  };
}

export function view(model: FieldsModel, surface: Surface): FieldsView {
  const isCells = holds(surface, "cells");
  return {
    layout: isCells ? (model.inline ? "inline" : "rows") : "grid",
    rows: model.fields.map((f) => ({
      label: f.label,
      key: isCells ? f.key : undefined,
      hit: f.hit,
      cell: cellOf(f, surface),
    })),
  };
}
