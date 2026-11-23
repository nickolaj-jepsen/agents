/**
 * What the draft pane and the band above the prompt draw on the desktop app and in VS Code, from
 * the kit's components. The pane reads as the issue it will file: a possible duplicate first,
 * then the title and its properties (each opens in place to be set), the description, and the
 * actions where reading ends. The terminal's drawing is `core/screen.ts`; `forSurface` chooses.
 */
import { fieldRows, TITLE } from "../lib/screen.ts";
import { statusBand } from "@agents/kit-band/gui.tsx";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { sections } from "@agents/kit-card/gui.tsx";
import { fieldHit, optionOf, searchHit, type Field } from "@agents/kit-fields/contract.ts";
import { MATCHES } from "@agents/kit-fields/model.ts";
import { fields, input } from "@agents/kit-fields/gui.tsx";
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { span } from "@agents/kit-core/lines.ts";
import { can } from "@agents/kit-core/surfaces.ts";
import { emptyState, notice } from "@agents/kit-notice/gui.tsx";
import {
  column,
  hasHeadingGap,
  meaning,
  panel,
  rowOf,
  spans,
  typed,
  type Gui,
} from "@agents/kit-core/paint/gui.tsx";
import { prose } from "@agents/kit-prose/gui.tsx";
import { sheet } from "@agents/kit-sheet/gui.tsx";
import type { Duplicate, Editing, Filed, Form } from "./types.d.ts";

/** What the pane does, as the mod wires it. */
export type PaneActions = {
  create(): unknown;
  createOpen(): unknown;
  comment(): unknown;
  discard(): unknown;
  toggleDuplicate(): unknown;
  set(patch: Partial<Form>): unknown;
  switchTeam(team: string): unknown;
  /** Opens a property (or the title) to be set; the one open before is closed. */
  open(field: string): unknown;
  /** Closes the property that is open. */
  close(): unknown;
  /** What is typed in the field that finds a label. */
  search(query: string): unknown;
  /** Adds a label found by the search. */
  addLabel(id: string): unknown;
  /** Turns a shown label on or off. */
  toggleLabel(id: string): unknown;
};

export type GuiPane = {
  form: Form | null;
  isDuplicateOpen: boolean;
  editing: Editing;
  on: PaneActions;
};

/** The pane's controls; a property's is the kit's own (`fieldHit`, `optionHit`). */
const HIT = {
  duplicate: "duplicate",
  comment: "act:comment",
  create: "act:create",
  createOpen: "act:create-open",
  discard: "act:discard",
  title: fieldHit("title"),
  titleEdit: "act:title",
};

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

const quiet = (label: string, hit: string): Button => ({ hotkey: "", label, hit });

/** What a press on one of the pane's controls does: the one reducer of its Buttons. */
export function press(hit: string, p: GuiPane) {
  const { on, form: f } = p;
  const picked = optionOf(hit);
  if (picked && f) {
    const { field, value } = picked;
    if (field === "team") return on.switchTeam(value);
    if (field === "status") return on.set({ state: value });
    if (field === "priority") return on.set({ priority: +value });
    if (field === "project") return on.set({ project: value });
    // A label drawn as a chip is turned on or off; one the search found is added.
    if (field === "labels")
      return f.labelIds.includes(value) || p.editing.shown.includes(value)
        ? on.toggleLabel(value)
        : on.addLabel(value);
  }
  switch (hit) {
    case HIT.duplicate:
      return on.toggleDuplicate();
    case HIT.comment:
      return on.comment();
    case HIT.create:
      return on.create();
    case HIT.createOpen:
      return on.createOpen();
    case HIT.discard:
      return on.discard();
    case HIT.titleEdit:
      return p.editing.field === "title" ? on.close() : on.open("title");
  }
}

/** What the title's field and the label search send: the `input` and `submit` of the pane's context. */
function typing(p: GuiPane) {
  const { on, form: f } = p;
  return {
    input: (hit: string, text: string) => {
      if (hit === HIT.title) return on.set({ title: oneLine(text) });
      if (hit === searchHit("labels")) return on.search(text);
    },
    submit: async (hit: string, text: string) => {
      if (hit === HIT.title) {
        // Enter empties an Input unless the hook draws a different value, so a submit
        // remounts it under a new key, keeping the text.
        await on.set({ title: oneLine(text), fieldRevision: (f?.fieldRevision ?? 0) + 1 });
        return on.close();
      }
      if (hit === searchHit("labels")) {
        // Enter adds the first match.
        const first = matchesOf(p)[0];
        return first ? on.addLabel(first.value) : on.search(text);
      }
    },
  };
}

/** The labels the search offers now: what the grid's own view model would show. */
function matchesOf(p: GuiPane) {
  const f = p.form;
  const q = p.editing.query.trim().toLowerCase();
  if (!f || !q) return [];
  const shown = new Set([...p.editing.shown, ...f.labelIds]);
  return f.labels
    .filter((l) => !shown.has(l.value) && l.label.toLowerCase().includes(q))
    .slice(0, MATCHES);
}

/**
 * The open issue that may already cover the draft, in a panel above it: the warning and its one
 * control on the first row, and, opened, its title and the comment it would add, in the panel.
 */
function duplicateOf(g: Gui, d: Duplicate, p: GuiPane) {
  const isOpen = p.isDuplicateOpen;
  const warning = rowOf(
    g,
    { key: "warning" },
    meaning(g, "state:warning"),
    spans(g, [span(`${d.issue} may already cover this`, { role: "warning" })], { type: "body" }),
  );
  return panel(
    g,
    { key: "duplicate-panel" },
    rowOf(
      g,
      { justify: "space-between" },
      warning,
      buttonRow(g, { rows: [[quiet(isOpen ? "Close" : "Open", HIT.duplicate)]] }),
    ),
    isOpen ? typed(g, "body", d.title) : null,
    isOpen ? typed(g, "section", "The comment it would add") : null,
    isOpen ? prose(g, { text: d.comment }) : null,
    isOpen ? buttonRow(g, { rows: [[quiet("Comment instead", HIT.comment)]] }) : null,
  );
}

/**
 * The record's head: a caption, then its title as a heading, or, once its quiet Edit is pressed,
 * a full-width field in the same place. The control stays on the caption's row, so nothing above
 * or beside the title moves.
 */
function titleOf(g: Gui, f: Form, p: GuiPane) {
  // A surface that draws no `Input` (the mobile app) shows the title as it will be filed: the
  // capability says so, not its name. The properties need no guard of their own: the fields' view
  // model draws a value as text where the surface has no `Input` or `Select`.
  const canEdit = can(g, "input");
  const isOpen = canEdit && (p.editing.field === "title" || f.title.trim() === "");
  return column(
    g,
    { key: "head", gap: "xs", isInset: true },
    rowOf(
      g,
      { justify: "space-between" },
      typed(g, "caption", "New issue"),
      canEdit && f.title.trim() !== ""
        ? buttonRow(g, { rows: [[quiet(isOpen ? "Done" : "Edit", HIT.titleEdit)]] })
        : null,
    ),
    isOpen
      ? input(g, {
          hit: HIT.title,
          value: f.title,
          placeholder: "What to do, in a line",
          revision: f.fieldRevision,
        })
      : typed(g, "heading", f.title),
  );
}

/** The draft pane on a graphical surface. */
export function guiPane(base: Gui, p: GuiPane): JSX.Element {
  const g: Gui = { ...base, press: (hit) => press(hit, p), ...typing(p) };
  const { form: f } = p;
  const frame = { title: TITLE };
  const discard = quiet("Discard", HIT.discard);
  if (!f) return emptyState(g, { text: "No Linear draft open." });
  // Nothing to read yet: the state and its one way out.
  if (f.phase === "drafting" || f.phase === "failed")
    return sheet(g, {
      ...frame,
      hostTitle: TITLE,
      body:
        f.phase === "drafting"
          ? notice(g, { text: "Drafting the issue", status: "pending" })
          : notice(g, { text: `Linear draft failed: ${f.error}`, status: "error" }),
      footer: [[discard]],
    });

  const isFiling = f.phase === "filing";
  const canFile = f.phase === "ready" && f.title.trim() !== "";
  const wait = f.isCheckingDuplicates
    ? "Checking for an open issue that covers this"
    : isFiling
      ? "Sending to Linear…"
      : undefined;
  // A status the team no longer has reads as unset.
  const rows: Field[] = fieldRows(f, undefined, {
    shown: p.editing.shown,
    query: p.editing.query,
    revision: p.editing.queryRevision,
  }).map(({ key: _key, hovered: _hovered, ...row }) =>
    row.value === "" ? { ...row, value: "None", empty: true } : row,
  );
  return sheet(g, {
    ...frame,
    notice: wait ? [span(wait, { role: "dim" })] : undefined,
    hostTitle: TITLE,
    body: [
      f.duplicate ? duplicateOf(g, f.duplicate, p) : null,
      // The host's own heading leaves its space under the title: the step to the properties is that.
      column(
        g,
        { gap: hasHeadingGap(g) ? "xs" : "sm" },
        titleOf(g, f, p),
        fields(g, { fields: rows }),
      ),
      // Whole: the surface scrolls. The source line is appended to it when filed.
      sections(
        g,
        prose(g, { text: f.description }),
        f.source
          ? notice(g, { text: f.source.replace(/`/g, ""), status: "dim", isCut: true })
          : null,
      ),
      f.error ? notice(g, { text: f.error, status: "error" }) : null,
    ],
    footer: [
      [
        { hotkey: "", label: isFiling ? "Creating" : "Create", hit: HIT.create, isLit: canFile },
        quiet("Create & open", HIT.createOpen),
        discard,
      ],
    ],
  });
}

/** What the band above the prompt shows on a graphical surface: the draft chip, the filed issues. */
export function guiBand(
  base: Gui,
  p: {
    draft: Form | null;
    issues: Filed[];
    onOpen(): unknown;
    onDiscard(): unknown;
    onOpenUrl(url: string): unknown;
    onCopy(url: string): unknown;
    onDismiss(key: string): unknown;
  },
): JSX.Element {
  const { draft } = p;
  // A comment's echo is titled `commented: …`.
  const filedText = (i: Filed) =>
    i.title.startsWith("commented: ")
      ? `Commented on ${i.key}: ${i.title.slice("commented: ".length)}`
      : `Filed ${i.key}: ${i.title}`;
  const g: Gui = {
    ...base,
    press: (hit) => {
      if (hit === "draft-open") return p.onOpen();
      if (hit === "draft-discard") return p.onDiscard();
      for (const i of p.issues) {
        if (hit === `open-${i.key}`) return p.onOpenUrl(i.url);
        if (hit === `copy-${i.key}`) return p.onCopy(i.url);
        if (hit === `dismiss-${i.key}`) return p.onDismiss(i.key);
      }
    },
  };
  return sections(
    g,
    draft
      ? statusBand(g, {
          text: "Linear draft",
          hint: "Open",
          hit: "draft-open",
          actions: [{ hit: "draft-discard", label: "Discard" }],
          // The host names the mod over the band, so the line is the draft's own title.
          words:
            draft.phase === "drafting"
              ? "Drafting a Linear issue"
              : draft.phase === "failed"
                ? "The Linear draft failed"
                : draft.title || "Untitled Linear draft",
          mark: "field:draft",
          isOneLine: true,
        })
      : null,
    ...p.issues.map((i) =>
      i.url !== ""
        ? statusBand(g, {
            text: `${i.key} ${i.title}`,
            hint: "Open",
            hit: `open-${i.key}`,
            status: "success",
            actions: [
              { hit: `copy-${i.key}`, label: "Copy link" },
              { hit: `dismiss-${i.key}`, label: "Dismiss" },
            ],
            words: filedText(i),
          })
        : statusBand(g, {
            text: `${i.key} ${i.title}`,
            hint: "Dismiss",
            hit: `dismiss-${i.key}`,
            status: "success",
            words: filedText(i),
          }),
    ),
  );
}
