/** The fields' stories: the model as data, and what each drawing adds. No host imports. */
import type { StageExt, Story } from "@agents/kit-core/stories.ts";
import { fieldHit, type Field } from "./contract.ts";
import type { FieldsModel } from "./model.ts";

const PRIORITIES = [
  { value: "0", label: "No priority", icon: "priority:none" },
  { value: "1", label: "Urgent", icon: "priority:urgent" },
  { value: "2", label: "High", icon: "priority:high" },
  { value: "3", label: "Medium", icon: "priority:medium" },
  { value: "4", label: "Low", icon: "priority:low" },
] as const;

const STATUSES = [
  { value: "todo", label: "Todo" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

const LABELS = [
  { value: "bug", label: "Bug" },
  { value: "area", label: "Area/reliability" },
  { value: "jp", label: "保存とアーカイブ" },
  { value: "decide", label: "Needs a decision before the next release" },
  { value: "perf", label: "Performance" },
  { value: "docs", label: "Docs" },
] as const;

const TEAMS = [
  { value: "plt", label: "Platform (PLT)" },
  { value: "web", label: "Webshop (WEB)" },
] as const;

/** A record's fields: one of each kind of editor, an empty value, and a long one. */
export const ISSUE: Field[] = [
  {
    key: "T",
    label: "Team",
    value: "Platform",
    hit: fieldHit("team"),
    editor: { kind: "one", options: TEAMS, value: "plt" },
  },
  {
    key: "S",
    label: "Status",
    value: "Todo",
    icon: "field:status",
    hit: fieldHit("status"),
    editor: { kind: "one", options: STATUSES, value: "todo" },
  },
  {
    key: "P",
    label: "Priority",
    value: "Medium",
    icon: "priority:medium",
    hit: fieldHit("priority"),
    editor: { kind: "one", options: PRIORITIES, value: "3" },
  },
  {
    key: "L",
    label: "Labels",
    value: "Bug, Area/reliability, 保存とアーカイブ, Needs a decision before the next release",
    hit: fieldHit("labels"),
    editor: { kind: "many", options: LABELS, chosen: ["bug", "area", "jp", "decide"] },
  },
  {
    key: "J",
    label: "Project",
    value: "None",
    empty: true,
    icon: "field:project",
    hit: fieldHit("project"),
    editor: { kind: "one", options: [{ value: "", label: "No project" }], value: "" },
  },
];

/** What the terminal adds: how wide the stage is, and the four sizes of the busiest story. */
export type TerminalExt = StageExt;

export const fieldsStories: Story<FieldsModel, TerminalExt>[] = [
  {
    component: "fields",
    state: "rows",
    about: "A row per field: its key, its label and what it holds, the labels in one column",
    settings: "fields(all, width, {active: true})",
    model: { fields: ISSUE, active: true },
    ext: { terminal: { extreme: true, stage: "dialog" } },
  },
  {
    component: "fields",
    state: "inline",
    about: "The values side by side after their keys, where rows are short",
    settings: "fields(all, width, {active: true, inline: true})",
    model: { fields: ISSUE, active: true, inline: true },
    ext: { terminal: { stage: "dialog" } },
  },
  {
    component: "fields",
    state: "read",
    about: "Read only, away from the keyboard: no keys, nothing to press",
    settings: "fields(all, width)",
    model: {
      fields: ISSUE.slice(0, 3).map(({ label, value, icon }) => ({ label, value, icon })),
    },
    ext: { terminal: { stage: "dialog" } },
  },
  {
    component: "fields",
    state: "editors",
    about:
      "Each field's editor is data: a Select for one choice (with its meaning icon), chips for several, an Input for text",
    settings: "fields({fields: [{editor: {kind: 'one' | 'many' | 'text'}}]})",
    model: {
      fields: [
        ...ISSUE.slice(0, 4),
        {
          label: "Title",
          value: "Honor Retry-After",
          editor: { kind: "text", value: "Honor Retry-After" },
        },
      ],
    },
    ext: { terminal: { stage: "dialog" } },
  },
  {
    component: "fields",
    state: "labels-search",
    about:
      "Several of many: the chosen as chips, one turned off kept to turn back on, a search with its matches",
    settings: "{kind: 'many', options, chosen, shown, query}",
    model: {
      fields: [
        {
          label: "Labels",
          value: "Bug",
          hit: fieldHit("labels"),
          editor: {
            kind: "many",
            options: LABELS,
            chosen: ["bug"],
            shown: ["docs"],
            query: "re",
          },
        },
      ],
    },
    ext: { terminal: { stage: "dialog" } },
  },
];
