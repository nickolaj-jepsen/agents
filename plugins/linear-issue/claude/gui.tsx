/**
 * What the draft pane and the band above the prompt draw on the desktop app and in VS Code, from
 * the kit's functions: a short form, a toolbar with Create at its far edge, the description whole.
 * The terminal's drawing stays in `register.tsx`; `forSurface` chooses between the two.
 */
import type { ElementTable } from "claude-code";

import type { Duplicate, Filed, Form, Option } from "./types.d.ts";
import {
  choice,
  emptyState,
  facts,
  foldedRow,
  labelled,
  labelledRow,
  notice,
  pane,
  paneTitle,
  prose,
  stack,
  statusBand,
  subhead,
  type Action,
  type FieldItem,
  type Kit,
} from "./ui";

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
};

export type GuiPane = {
  form: Form | null;
  isDuplicateOpen: boolean;
  priorities: Option[];
  /** The surface draws no Input or Select (the mobile app): the draft is shown as written. */
  isReadOnly?: boolean;
  Input: Els["Input"];
  Select: Els["Select"];
  on: PaneActions;
};

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

const duplicateRow = (k: Kit, d: Duplicate, p: GuiPane) =>
  foldedRow(k, {
    key: "duplicate",
    text: `${d.issue} ${d.title}`,
    icon: { name: "warning", tone: "warning", alt: "May already cover this" },
    isOpen: p.isDuplicateOpen,
    toggleKey: "duplicate-toggle",
    onToggle: () => p.on.toggleDuplicate(),
    body: (inner) =>
      stack(inner, [subhead(inner, "The comment would add"), prose(inner, d.comment)], {
        gui: { gap: "xs" },
      }),
    actions: [{ key: "comment", label: "Comment on this", onPress: () => p.on.comment() }],
  });

/** The draft pane on a graphical surface. */
export function guiPane(k: Kit, p: GuiPane): JSX.Element {
  const { form: f, on, Input, Select } = p;
  const discard: Action = { key: "discard", label: "Discard", onPress: () => on.discard() };
  if (!f) return pane(k, () => [emptyState(k, "No Linear draft open.")]);
  if (f.phase === "drafting")
    return pane(k, (inner) => [
      paneTitle(inner, "Linear draft", undefined, {
        gui: { count: "Drafting the issue", actions: [discard] },
      }),
    ]);
  if (f.phase === "failed")
    return pane(k, (inner) => [
      paneTitle(inner, "Linear draft", undefined, { gui: { actions: [discard] } }),
      notice(inner, `Linear draft failed: ${f.error}`, "error"),
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
  const count = isFiling
    ? "Creating the issue"
    : f.isCheckingDuplicates
      ? "Checking for duplicates"
      : undefined;

  const options = (items: Option[], value: string) => items.find((o) => o.value === value)?.label;
  const selects: [string, string, string, Option[], (v: string) => unknown][] = [
    ["team", "Team", f.team, f.teams, (team) => on.switchTeam(team)],
    ["priority", "Priority", String(f.priority), p.priorities, (v) => on.set({ priority: +v })],
    ["status", "Status", f.state, f.statuses, (state) => on.set({ state })],
    ["project", "Project", f.project, f.projects, (project) => on.set({ project })],
  ];
  const chosen = f.labels.filter((l) => f.labelIds.includes(l.value));

  return pane(k, (inner) => {
    const fields: FieldItem[] = p.isReadOnly
      ? []
      : selects.map(([key, label, value, items, onSelect]) => ({
          key,
          label,
          control: (
            // A Select takes 1 to 64 options.
            <Select
              key={key}
              value={value}
              options={items.slice(0, 64)}
              onSelect={(v) => onSelect(v)}
            />
          ),
        }));
    return [
      paneTitle(inner, "Linear draft", undefined, { gui: { count, actions } }),
      f.error ? notice(inner, f.error, "error") : null,
      labelled(inner, {
        key: "title",
        label: "Title",
        control: p.isReadOnly ? (
          prose(inner, f.title)
        ) : (
          // Enter empties an Input unless the hook draws a different value, so a submit
          // remounts it under a new key, keeping the text.
          <Input
            key={`title-${f.titleRevision ?? 0}`}
            value={f.title}
            autoFocus
            onInput={(title) => on.set({ title: oneLine(title) })}
            onSubmit={(title) =>
              on.set({ title: oneLine(title), titleRevision: (f.titleRevision ?? 0) + 1 })
            }
          />
        ),
      }),
      p.isReadOnly
        ? facts(inner, [
            { label: "Team", value: options(f.teams, f.team) ?? f.team },
            { label: "Priority", value: options(p.priorities, String(f.priority)) ?? "None" },
            { label: "Status", value: options(f.statuses, f.state) ?? "" },
            { label: "Project", value: options(f.projects, f.project) ?? "No project" },
          ])
        : labelledRow(inner, fields),
      chosen.length > 0 && !p.isReadOnly
        ? labelled(inner, {
            key: "labels",
            label: "Labels",
            // The drafter's picks; a press removes one. Adding is left to Linear.
            control: choice(
              inner,
              chosen.map((l) => ({
                key: `label-${l.value}`,
                label: `Remove ${l.label}`,
                onPress: () => on.set({ labelIds: f.labelIds.filter((id) => id !== l.value) }),
              })),
              { gui: { layout: "row" } },
            ),
          })
        : null,
      f.duplicate ? duplicateRow(inner, f.duplicate, p) : null,
      labelled(inner, {
        key: "description",
        label: "Description",
        // Whole: the surface scrolls.
        control: stack(
          inner,
          [prose(inner, f.description), f.source ? prose(inner, f.source, { isDim: true }) : null],
          { gui: { gap: "sm" } },
        ),
      }),
    ];
  });
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
  return stack(
    k,
    [
      draft
        ? statusBand(k, {
            key: "draft-open",
            text: "Linear draft",
            hint: "Open",
            gui: {
              text: `Linear draft: ${draft.phase === "drafting" ? "drafting the issue" : draft.title || "untitled"}`,
              icon: "missing",
              tone: "neutral",
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
              onPress: () => p.onDismiss(i.key),
            }),
      ),
    ],
    { gui: { gap: "sm" } },
  );
}
