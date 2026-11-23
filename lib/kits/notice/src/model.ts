/**
 * The notice's view model: the icon, the type role and the words a surface draws. Pure and plain:
 * the graphical drawing reads it, and so does the snapshot that holds it across surfaces. A
 * terminal has no icon and one size, so its mark is none and its role is the status's colour.
 * No host imports.
 */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import type { Role, Span } from "@agents/kit-core/lines.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { TypeRole } from "@agents/kit-core/tokens.ts";
import type { Notice, NoticeStatus } from "./contract.ts";

/** What a screen of the notice is, whatever its width. */
export type NoticeModel = Omit<Notice, "width">;

/** The meaning a state is marked with, on a surface that draws icons. */
const MARKS: Partial<Record<NoticeStatus, MeaningName>> = {
  success: "state:success",
  warning: "state:warning",
  error: "state:error",
  pending: "state:pending",
};

/** The colour role each status's words take: a pending one is quiet, as the dim words are. */
const TONES: Record<NoticeStatus, Role> = {
  success: "success",
  warning: "warning",
  error: "error",
  pending: "dim",
  dim: "dim",
  text: "text",
};

export type NoticeView = {
  /** The state's icon, where the surface draws icons. */
  mark: MeaningName | undefined;
  /** The type role of its words: a state is read (`body`), a footnote and an empty list are `caption`. */
  type: TypeRole;
  /** Cut to one line, or wrapped whole. */
  rows: "cut" | "wrap";
  /** The words, each span in a role: the status's where it has none. */
  text: Span[];
};

export function view(model: NoticeModel, surface: Surface): NoticeView {
  const isCells = holds(surface, "cells");
  const status = model.isEmpty ? "dim" : (model.status ?? "warning");
  const tone = TONES[status];
  const said = isCells ? model.text : (model.words ?? model.text);
  const text: Span[] =
    typeof said === "string"
      ? [{ text: said, role: tone }]
      : said.map((s) => ({ ...s, role: s.role ?? tone }));
  return {
    mark: !isCells && !model.isEmpty ? MARKS[status] : undefined,
    type: model.isEmpty || tone === "dim" ? "caption" : "body",
    rows: model.isEmpty ? "wrap" : (isCells ? model.isWrapped : !model.isCut) ? "wrap" : "cut",
    text,
  };
}
