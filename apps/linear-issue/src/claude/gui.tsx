/**
 * What the draft pane and the band above the prompt draw on the desktop app and in VS Code, from
 * the kit's components. The pane reads as the issue it will file: a possible duplicate first,
 * then the title and its properties (each opens in place to be set), the description, and the
 * actions where reading ends. The terminal's drawing is `core/screen.ts`; `forSurface` chooses.
 */
import { fieldRows, TITLE } from "../lib/screen.ts";
import { statusBand } from "@agents/kit-band/gui.tsx";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { sections } from "@agents/kit-card/gui.tsx";
import { detail } from "@agents/kit-detail/gui.tsx";
import { fieldOf, type Field } from "@agents/kit-fields/contract.ts";
import { fields } from "@agents/kit-fields/gui.tsx";
import { line, span } from "@agents/kit-core/lines.ts";
import { list } from "@agents/kit-list/gui.tsx";
import { emptyState, notice } from "@agents/kit-notice/gui.tsx";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { prose } from "@agents/kit-prose/gui.tsx";
import { sheet } from "@agents/kit-sheet/gui.tsx";
import type { Duplicate, Editing, Filed, Form, Option } from "./types.d.ts";

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
  priorities: Option[];
  /** The surface draws no Input or Select (the mobile app): the draft is shown as written. */
  isReadOnly?: boolean;
  on: PaneActions;
};

/** Labels a search offers at most: the field is for finding one, not for browsing them all. */
const MATCHES = 6;

/** The pane's controls; a property's is the kit's own (`fieldHit`). */
const HIT = {
  duplicate: "duplicate",
  comment: "act:comment",
  create: "act:create",
  createOpen: "act:create-open",
  discard: "act:discard",
  done: "act:done",
  title: "field:title",
  label: (id: string) => `label:${id}`,
  add: (id: string) => `label-add:${id}`,
};

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

const quiet = (label: string, hit: string): Button => ({ hotkey: "", label, hit });

/** What a press on one of the pane's controls does: the one reducer of its Buttons. */
export function press(hit: string, p: GuiPane) {
  const { on } = p;
  const field = fieldOf(hit);
  if (field) return on.open(field);
  if (hit.startsWith("label:")) return on.toggleLabel(hit.slice("label:".length));
  if (hit.startsWith("label-add:")) return on.addLabel(hit.slice("label-add:".length));
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
    case HIT.done:
      return on.close();
  }
}

/** The open issue that may already cover the draft: first in the pane, so it is not missed. */
function duplicateOf(g: Gui, d: Duplicate, p: GuiPane) {
  const isOpen = p.isDuplicateOpen;
  return sections(
    g,
    notice(g, `${d.issue} may already cover this`, "warning"),
    detail(
      g,
      {
        meta: d.title,
        hit: HIT.duplicate,
        sections: isOpen ? [{ heading: "The comment it would add", text: d.comment }] : [],
      },
      { action: isOpen ? "Close" : "Open", isActionAtEdge: true },
    ),
    isOpen ? buttonRow(g, [quiet("Comment instead", HIT.comment)]) : null,
  );
}

/** Labels to turn off or on, the field that finds another, and what it finds. */
function labelsEditor(g: Gui, f: Form, p: GuiPane) {
  const { Input } = g.els;
  const { editing, on } = p;
  const query = editing.query.trim().toLowerCase();
  const shown = [...new Set([...editing.shown, ...f.labelIds])].flatMap((id) => {
    const l = f.labels.find((o) => o.value === id);
    return l ? [l] : [];
  });
  const matches = query
    ? f.labels
        .filter((l) => !shown.includes(l) && l.label.toLowerCase().includes(query))
        .slice(0, MATCHES)
    : [];
  return sections(
    g,
    shown.length > 0
      ? list(g, {
          groups: [
            {
              label: "",
              rows: shown.map((l) => ({
                text: l.label,
                mark: f.labelIds.includes(l.value) ? ("chosen" as const) : ("open" as const),
                markHit: HIT.label(l.value),
              })),
            },
          ],
        })
      : null,
    <Input
      key={`label-search-${editing.queryRevision}`}
      value={editing.query}
      placeholder="Find a label to add"
      onInput={(text) => on.search(text)}
      onSubmit={(text) => {
        // Enter adds the first match.
        const first = matches[0];
        return first ? on.addLabel(first.value) : on.search(text);
      }}
    />,
    matches.length > 0
      ? list(g, {
          groups: [
            {
              label: "",
              rows: matches.map((l) => ({
                text: l.label,
                mark: "open" as const,
                markHit: HIT.add(l.value),
              })),
            },
          ],
        })
      : query
        ? notice(g, "No label matches", "dim")
        : null,
  );
}

/** The control that sets the property that is open, in place of its value. */
function editorOf(g: Gui, f: Form, p: GuiPane): Record<string, JSX.Element> {
  const { Input, Select } = g.els;
  const { on, editing } = p;
  // A Select takes 1 to 64 options.
  const select = (
    key: string,
    value: string,
    items: Option[],
    onSelect: (v: string) => unknown,
  ) => (
    <Select
      key={key}
      value={value}
      options={items.slice(0, 64)}
      onSelect={async (v) => {
        await onSelect(v);
        return on.close();
      }}
    />
  );
  switch (editing.field) {
    case "title":
      return {
        // Enter empties an Input unless the hook draws a different value, so a submit
        // remounts it under a new key, keeping the text.
        title: (
          <Input
            key={`title-${f.fieldRevision ?? 0}`}
            value={f.title}
            placeholder="What to do, in a line"
            onInput={(title) => on.set({ title: oneLine(title) })}
            onSubmit={async (title) => {
              await on.set({ title: oneLine(title), fieldRevision: (f.fieldRevision ?? 0) + 1 });
              return on.close();
            }}
          />
        ),
      };
    case "team":
      return { team: select("team", f.team, f.teams, on.switchTeam) };
    case "status":
      return { status: select("status", f.state, f.statuses, (state) => on.set({ state })) };
    case "priority":
      return {
        priority: select("priority", String(f.priority), p.priorities, (v) =>
          on.set({ priority: +v }),
        ),
      };
    case "project":
      return {
        project: select("project", f.project, f.projects, (project) => on.set({ project })),
      };
    case "labels":
      return { labels: labelsEditor(g, f, p) };
    default:
      return {};
  }
}

/** The draft's properties, each a control that opens in place; only read where nothing can be set. */
function propertiesOf(g: Gui, f: Form, p: GuiPane) {
  const rows: Field[] = fieldRows(f).map(({ key: _key, hovered: _hovered, ...row }) => ({
    ...row,
    // A status the team no longer has reads as unset.
    ...(row.value === "" ? { value: "None", empty: true } : {}),
    hit: p.isReadOnly ? undefined : row.hit,
  }));
  const editors = p.isReadOnly ? {} : editorOf(g, f, p);
  // At rest they wrap in a row, each value its own Button; one that is open takes rows.
  return fields(g, rows, {
    editors,
    done: HIT.done,
    inline: Object.keys(editors).length === 0,
  });
}

/** A team's name without the key the Select shows beside it: `Platform (PLT)` reads `Platform`. */
const teamName = (f: Form) => {
  const label = f.teams.find((o) => o.value === f.team)?.label ?? f.team;
  return label.replace(/\s*\([^)]*\)$/, "") || label;
};

/** The title, whole, with the control that opens it; or the field it is set in. */
function titleOf(g: Gui, f: Form, p: GuiPane) {
  const isTitled = f.title.trim() !== "";
  const isOpen = p.editing.field === "title" && !p.isReadOnly;
  const hit = p.isReadOnly ? undefined : HIT.title;
  if (isTitled && !isOpen)
    return detail(
      g,
      { meta: `New issue in ${teamName(f)}`, title: f.title, hit },
      { action: "Edit", isActionAtEdge: true },
    );
  return fields(g, [{ label: "Title", value: "None", empty: true, hit }], {
    editors: isOpen ? editorOf(g, f, p) : {},
    done: HIT.done,
  });
}

/** The draft pane on a graphical surface. */
export function guiPane(base: Gui, p: GuiPane): JSX.Element {
  const g: Gui = { ...base, press: (hit) => press(hit, p) };
  const { form: f } = p;
  const frame = { title: TITLE };
  const discard = quiet("Discard", HIT.discard);
  if (!f) return emptyState(g, "No Linear draft open.");
  // Nothing to read yet: the state and its one way out.
  if (f.phase === "drafting" || f.phase === "failed")
    return sheet(g, frame, {
      hostTitle: TITLE,
      body:
        f.phase === "drafting"
          ? notice(g, "Drafting the issue", "dim")
          : notice(g, `Linear draft failed: ${f.error}`, "error"),
      footer: [[discard]],
    });

  const isFiling = f.phase === "filing";
  const canFile = f.phase === "ready" && f.title.trim() !== "";
  const wait = f.isCheckingDuplicates
    ? "Checking for an open issue that covers this"
    : isFiling
      ? "Sending to Linear…"
      : undefined;
  return sheet(
    g,
    { ...frame, notice: wait ? line([span(wait, { role: "dim" })]) : undefined },
    {
      hostTitle: TITLE,
      body: [
        f.duplicate ? duplicateOf(g, f.duplicate, p) : null,
        sections(g, titleOf(g, f, p), propertiesOf(g, f, p)),
        // Whole: the surface scrolls. The source line is appended to it when filed.
        sections(
          g,
          prose(g, f.description),
          f.source ? notice(g, f.source.replace(/`/g, ""), "dim", { isCut: true }) : null,
        ),
        f.error ? notice(g, f.error, "error") : null,
      ],
      footer: [
        [
          { hotkey: "", label: isFiling ? "Creating" : "Create", hit: HIT.create, isLit: canFile },
          quiet("Create & open", HIT.createOpen),
          discard,
        ],
      ],
    },
  );
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
      ? statusBand(
          g,
          {
            text: "Linear draft",
            hint: "Open",
            hit: "draft-open",
            actions: [{ hit: "draft-discard", label: "Discard" }],
          },
          {
            // The host names the mod over the band, so the line is the draft's own title.
            text:
              draft.phase === "drafting"
                ? "Drafting a Linear issue"
                : draft.phase === "failed"
                  ? "The Linear draft failed"
                  : draft.title || "Untitled Linear draft",
            icon: "draft",
            tone: "neutral",
            isOneLine: true,
          },
        )
      : null,
    ...p.issues.map((i) =>
      i.url !== ""
        ? statusBand(
            g,
            {
              text: `${i.key} ${i.title}`,
              hint: "Open",
              hit: `open-${i.key}`,
              status: "success",
              actions: [
                { hit: `copy-${i.key}`, label: "Copy link" },
                { hit: `dismiss-${i.key}`, label: "Dismiss" },
              ],
            },
            { text: filedText(i) },
          )
        : statusBand(
            g,
            {
              text: `${i.key} ${i.title}`,
              hint: "Dismiss",
              hit: `dismiss-${i.key}`,
              status: "success",
            },
            { text: filedText(i) },
          ),
    ),
  );
}
