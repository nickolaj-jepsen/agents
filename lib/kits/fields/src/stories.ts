/** The fields' stories. No host imports. */
import type { KitStory } from "../stories.ts";
import { fieldHit, type Field } from "./contract.ts";
import { fields } from "./terminal.ts";

const ISSUE: Field[] = [
  { key: "T", label: "Team", value: "Platform", hit: fieldHit("team") },
  { key: "S", label: "Status", value: "Todo", hit: fieldHit("status") },
  { key: "P", label: "Priority", value: "Medium", hit: fieldHit("priority") },
  {
    key: "L",
    label: "Labels",
    value: "Bug, Area/reliability, 保存とアーカイブ, Needs a decision before the next release",
    hit: fieldHit("labels"),
  },
  { key: "J", label: "Project", value: "None", empty: true, hit: fieldHit("project") },
];

export const fieldsStories: KitStory[] = [
  {
    component: "fields",
    state: "rows",
    about: "A row per field: its key, its label and what it holds, the labels in one column",
    settings: "fields(all, width, {active: true})",
    extreme: true,
    width: "dialog",
    lines: (width) => fields(ISSUE, width, { active: true }),
  },
  {
    component: "fields",
    state: "inline",
    about: "The values side by side after their keys, where rows are short",
    settings: "fields(all, width, {active: true, inline: true})",
    width: "dialog",
    lines: (width) => fields(ISSUE, width, { active: true, inline: true }),
  },
  {
    component: "fields",
    state: "read",
    about: "Read only, away from the keyboard: no keys, nothing to press",
    settings: "fields(all, width)",
    width: "dialog",
    lines: (width) =>
      fields(
        ISSUE.slice(0, 3).map(({ label, value }) => ({ label, value })),
        width,
      ),
  },
];
