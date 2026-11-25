/**
 * /notes on Desktop and VS Code, drawn with the kit's `gui.tsx` functions: the toolbar from
 * `frame`, the notes from `list` (a row's button reads it, or opens an HTML note), the reader's
 * text from `prose`, and what went wrong from `notice`. The host frames and scrolls the pane, so
 * there are no rows to count here; every control is a `hit` that `g.press` hands to the mod.
 */
import { statusBand } from "@agents/kit-band/gui.tsx";
import { span } from "@agents/kit-core/lines.ts";
import { blocks, column, typed, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { frameTop } from "@agents/kit-frame/gui.tsx";
import type { ListGroup } from "@agents/kit-list/contract.ts";
import { list } from "@agents/kit-list/gui.tsx";
import { emptyState, notice } from "@agents/kit-notice/gui.tsx";
import { prose } from "@agents/kit-prose/gui.tsx";
import {
  artefactsText,
  BAND,
  BUTTONS,
  countLabel,
  emptyText,
  pathOf,
  rowHit,
  TITLE,
  type Band,
} from "../lib/screen.ts";
import { age, notesOf, type Group } from "../lib/shelf.ts";
import type { Place, Reader } from "./types.d.ts";

/** The control that shows the rest of a long group. */
export const MORE = "more";

/**
 * The most of a note's text one tree draws: the host draws the first 100,000 characters of a
 * tree, so a longer note is cut here and says so.
 */
const MAX_SHOWN = 90_000;

export type PaneView = {
  groups: readonly Group[];
  place: Place;
  notice?: string;
  reader?: Reader;
  said?: string;
  /** Every note of a long group, not the first few. */
  isAll: boolean;
  now: number;
};

/** The notes under their folders, a button on each: Read, or Open for an HTML note. */
function notesList(g: Gui, v: PaneView): JSX.Element {
  const groups: ListGroup[] = v.groups
    .filter((group) => group.notes.length > 0)
    .map((group) => ({
      label: group.label,
      rows: group.notes.map((n) => ({
        text: n.name,
        literal: true,
        mark: "none" as const,
        aside: age(v.now - n.at),
        hit: rowHit(n.id),
        action: n.kind === "html" ? "Open" : "Read",
      })),
    }));
  return list(g, { groups, lines: 1, more: { isAll: v.isAll, hit: MORE } });
}

function listPane(g: Gui, v: PaneView): JSX.Element {
  const count = notesOf(v.groups).length;
  // The list's headings take no count, so the folders' other files are counted under it.
  const others = artefactsText(v.groups);
  const empty = emptyText(v.place);
  return blocks(
    g,
    frameTop(g, {
      title: TITLE,
      hostTitle: TITLE,
      caption: count ? [span(countLabel(count), { role: "dim" })] : undefined,
    }),
    v.notice ? notice(g, { text: v.notice, status: "warning" }) : null,
    v.said ? notice(g, { text: v.said, status: "warning" }) : null,
    count ? notesList(g, v) : empty ? emptyState(g, { text: empty }) : null,
    others ? notice(g, { text: others, status: "dim" }) : null,
  );
}

/** One note read whole: Back and Open in the toolbar, its folder and age, its path, its text. */
function readerPane(g: Gui, v: PaneView, reader: Reader): JSX.Element {
  const note = notesOf(v.groups).find((n) => n.id === reader.id);
  if (!note) return listPane(g, v);
  const group = v.groups.find((x) => x.notes.includes(note));
  const body = reader.body;
  const isRefused = body !== undefined && "problem" in body;
  const text = body && "text" in body ? body.text : undefined;
  const isCut = text !== undefined && text.length > MAX_SHOWN;
  return blocks(
    g,
    frameTop(g, {
      title: TITLE,
      hostTitle: TITLE,
      actions: [
        { hotkey: "", label: "Back", hit: BUTTONS.back },
        { hotkey: "", label: "Open", hit: BUTTONS.open, isLit: isRefused },
      ],
    }),
    v.said ? notice(g, { text: v.said, status: "warning" }) : null,
    column(
      g,
      { key: "head", gap: "xs", isInset: true },
      typed(g, "caption", [group?.label, age(v.now - note.at)].filter(Boolean).join(" · "), {
        tabular: true,
      }),
      typed(g, "heading", pathOf(v.groups, note)),
    ),
    body === undefined
      ? emptyState(g, { text: "Reading the note" })
      : "problem" in body
        ? notice(g, { text: body.problem, status: "warning" })
        : (text ?? "").trim()
          ? prose(g, { text: isCut ? (text ?? "").slice(0, MAX_SHOWN) : (text ?? "") })
          : emptyState(g, { text: "This note is empty." }),
    isCut
      ? notice(g, {
          text: "The rest of this note is not shown here: Open shows it whole.",
          status: "dim",
        })
      : null,
  );
}

/** The pane: the reader while a note is read, else the list or why it has none. */
export function notesPane(g: Gui, v: PaneView): JSX.Element {
  return v.reader ? readerPane(g, v, v.reader) : listPane(g, v);
}

/** The band: what was written, Read for the newest, and Dismiss. */
export function notesBand(g: Gui, band: Band): JSX.Element {
  return statusBand(g, {
    text: band.text,
    hint: "read",
    hit: BAND.read,
    status: "success",
    actions: [{ hit: BAND.dismiss, label: "Dismiss" }],
  });
}
