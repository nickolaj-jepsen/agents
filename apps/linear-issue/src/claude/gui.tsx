/**
 * What the draft pane and the band above the prompt draw on the desktop app and in VS Code, from
 * the kit's functions. The pane reads as the issue it will file: a possible duplicate first, then
 * the title and its properties (which open in place to edit), the description, and the actions
 * where reading ends. The terminal's drawing stays in `register.tsx`; `forSurface` chooses.
 */
import type { ElementTable } from "claude-code";

import type { Duplicate, Editing, Filed, Form, Option } from "./types.d.ts";
import {
  actionBar,
  choice,
  editable,
  emptyState,
  fields,
  foldedRow,
  notice,
  pane,
  properties,
  prose,
  section,
  stack,
  statusBand,
  subhead,
  type Action,
  type IconName,
  type Kit,
  type Property,
} from "@agents/kit-legacy/claude/ui.tsx";

type Els = ElementTable<"desktop">;

/** What the pane does, as the mod wires it. */
export type PaneActions = {
  create(): unknown;
  createOpen(): unknown;
  comment(): unknown;
  discard(): unknown;
  toggleDuplicate(): unknown;
  set(patch: Partial<Form>): unknown;
  switchTeam(team: string): unknown;
  toggleEditing(): unknown;
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
  Input: Els["Input"];
  Select: Els["Select"];
  on: PaneActions;
};

/** Labels a search offers at most: the field is for finding one, not for browsing them all. */
const MATCHES = 6;

const PRIORITY_ICON: Record<string, IconName> = {
  "0": "priorityNone",
  "1": "priorityUrgent",
  "2": "priorityHigh",
  "3": "priorityMedium",
  "4": "priorityLow",
};

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

const labelOf = (items: Option[], value: string) => items.find((o) => o.value === value)?.label;

/** A team's name without the key the Select shows beside it: `Platform (PLT)` reads `Platform`. */
const teamName = (f: Form) => {
  const label = labelOf(f.teams, f.team) ?? f.team;
  return label.replace(/\s*\([^)]*\)$/, "") || label;
};

/** The open issue that may already cover the draft: first in the pane, so it is not missed. */
const duplicateRow = (k: Kit, d: Duplicate, p: GuiPane) =>
  foldedRow(k, {
    key: "duplicate",
    text: `${d.issue} may already cover this`,
    meta: d.title,
    icon: { name: "warning", tone: "warning", alt: "Possible duplicate" },
    tone: "warning",
    isOpen: p.isDuplicateOpen,
    toggleKey: "duplicate-toggle",
    onToggle: () => p.on.toggleDuplicate(),
    body: (inner) =>
      stack(
        inner,
        [
          prose(inner, d.title),
          stack(inner, [subhead(inner, "The comment it would add"), prose(inner, d.comment)], {
            gui: { gap: "xs" },
          }),
        ],
        { gui: { gap: "sm" } },
      ),
    actions: [{ key: "comment", label: "Comment instead", onPress: () => p.on.comment() }],
  });

/** The draft's properties as read: status, priority, project, labels. */
function summary(f: Form, p: GuiPane): Property[] {
  const priority = String(f.priority);
  const project = f.project ? labelOf(f.projects, f.project) : undefined;
  return [
    {
      key: "status",
      text: labelOf(f.statuses, f.state) ?? "No status",
      icon: "status",
      alt: "Status",
    },
    {
      key: "priority",
      text: labelOf(p.priorities, priority) ?? "No priority",
      icon: PRIORITY_ICON[priority] ?? "priorityNone",
      alt: "Priority",
    },
    ...(project
      ? [{ key: "project", text: project, icon: "project" as const, alt: "Project" }]
      : []),
    ...f.labels
      .filter((l) => f.labelIds.includes(l.value))
      .map((l) => ({
        key: `label:${l.value}`,
        text: l.label,
        icon: "label" as const,
        alt: "Label",
      })),
  ];
}

/** The controls that set the draft's fields, opened in place of its summary. */
function editFields(k: Kit, f: Form, p: GuiPane) {
  const { Input, Select, on, editing } = p;
  const select = (
    key: string,
    value: string,
    items: Option[],
    onSelect: (v: string) => unknown,
  ) => (
    // A Select takes 1 to 64 options.
    <Select key={key} value={value} options={items.slice(0, 64)} onSelect={(v) => onSelect(v)} />
  );
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
  const labels = stack(
    k,
    [
      shown.length > 0
        ? choice(
            k,
            shown.map((l) => ({
              key: `label-${l.value}`,
              label: l.label,
              isLiteral: true,
              isOn: f.labelIds.includes(l.value),
              onPress: () => on.toggleLabel(l.value),
            })),
            { key: "labels", isMulti: true, gui: { layout: "row" } },
          )
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
        ? choice(
            k,
            matches.map((l) => ({
              key: `label-add-${l.value}`,
              label: l.label,
              isLiteral: true,
              onPress: () => on.addLabel(l.value),
            })),
            { key: "label-matches", gui: { layout: "row" } },
          )
        : query
          ? notice(k, "No label matches", "dim", { gui: { isFlush: true } })
          : null,
    ],
    { gui: { gap: "xs" } },
  );
  return [
    fields(k, [
      {
        key: "title",
        label: "Title",
        isWide: true,
        control: (
          // Enter empties an Input unless the hook draws a different value, so a submit
          // remounts it under a new key, keeping the text.
          <Input
            key={`title-${f.fieldRevision ?? 0}`}
            value={f.title}
            placeholder="What to do, in a line"
            onInput={(title) => on.set({ title: oneLine(title) })}
            onSubmit={(title) =>
              on.set({ title: oneLine(title), fieldRevision: (f.fieldRevision ?? 0) + 1 })
            }
          />
        ),
      },
      { key: "team", label: "Team", control: select("team", f.team, f.teams, on.switchTeam) },
      {
        key: "priority",
        label: "Priority",
        control: select("priority", String(f.priority), p.priorities, (v) =>
          on.set({ priority: +v }),
        ),
      },
      {
        key: "status",
        label: "Status",
        control: select("status", f.state, f.statuses, (state) => on.set({ state })),
      },
      {
        key: "project",
        label: "Project",
        control: select("project", f.project, f.projects, (project) => on.set({ project })),
      },
      { key: "labels", label: "Labels", control: labels },
    ]),
  ];
}

/** The draft pane on a graphical surface. */
export function guiPane(k: Kit, p: GuiPane): JSX.Element {
  const { form: f, on } = p;
  const discard: Action = { key: "discard", label: "Discard", onPress: () => on.discard() };
  if (!f) return pane(k, () => [emptyState(k, "No Linear draft open.")]);
  // Nothing to read yet: the state and its one way out.
  if (f.phase === "drafting")
    return pane(k, (inner) => [
      notice(inner, "Drafting the issue", "dim"),
      actionBar(inner, [discard]),
    ]);
  if (f.phase === "failed")
    return pane(k, (inner) => [
      notice(inner, `Linear draft failed: ${f.error}`, "error"),
      actionBar(inner, [discard]),
    ]);

  const isFiling = f.phase === "filing";
  const canFile = f.phase === "ready" && f.title.trim() !== "";
  const actions: Action[] = [
    {
      key: "create",
      label: isFiling ? "Creating" : "Create",
      gui: { isPrimary: canFile },
      onPress: () => on.create(),
    },
    { key: "create-open", label: "Create & open", onPress: () => on.createOpen() },
    discard,
  ];

  return pane(k, (inner) => [
    f.duplicate ? duplicateRow(inner, f.duplicate, p) : null,
    editable(inner, {
      key: "fields",
      toggleKey: "edit",
      isOpen: p.editing.isOpen && !p.isReadOnly,
      isReadOnly: p.isReadOnly,
      onToggle: () => on.toggleEditing(),
      head: { folded: `New issue in ${teamName(f)}`, opened: "Edit the issue" },
      view: (k) => [
        f.title.trim()
          ? section(k, f.title, { isWrapped: true })
          : notice(k, "No title yet", "dim"),
        properties(k, summary(f, p)),
      ],
      edit: (k) => editFields(k, f, p),
    }),
    // Whole: the surface scrolls. The source line is appended to it when filed.
    stack(
      inner,
      [
        prose(inner, f.description, { gui: { isInset: true } }),
        f.source
          ? notice(inner, f.source.replace(/`/g, ""), "dim", { gui: { isCut: true } })
          : null,
      ],
      { gui: { gap: "sm" } },
    ),
    // Where reading ends: what is still being checked, what went wrong, and the actions.
    stack(
      inner,
      [
        f.isCheckingDuplicates
          ? notice(inner, "Checking for an open issue that covers this", "dim")
          : null,
        f.error ? notice(inner, f.error, "error") : null,
        actionBar(inner, actions),
      ],
      { gui: { gap: "sm" } },
    ),
  ]);
}

/** What the band above the prompt shows on a graphical surface: the draft chip, the filed issues. */
export function guiBand(
  k: Kit,
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
  return stack(
    k,
    [
      draft
        ? statusBand(k, {
            key: "draft-open",
            text: "Linear draft",
            hint: "Open",
            gui: {
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
              actions: [{ key: "draft-discard", label: "Discard", onPress: () => p.onDiscard() }],
            },
            onPress: () => p.onOpen(),
          })
        : null,
      ...p.issues.map((i) =>
        i.url !== ""
          ? statusBand(k, {
              key: `open-${i.key}`,
              text: `${i.key} ${i.title}`,
              hint: "Open",
              status: "success",
              onPress: () => p.onOpenUrl(i.url),
              gui: {
                text: filedText(i),
                actions: [
                  { key: `copy-${i.key}`, label: "Copy link", onPress: () => p.onCopy(i.url) },
                  { key: `dismiss-${i.key}`, label: "Dismiss", onPress: () => p.onDismiss(i.key) },
                ],
              },
            })
          : statusBand(k, {
              key: `dismiss-${i.key}`,
              text: `${i.key} ${i.title}`,
              hint: "Dismiss",
              status: "success",
              gui: { text: filedText(i) },
              onPress: () => p.onDismiss(i.key),
            }),
      ),
    ],
    { gui: { gap: "sm" } },
  );
}
