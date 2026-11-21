/** A pick list: numbered rows that each end on how to take them, "build" or a skill to route them to. */
import type { FormItem, Option } from "../forms.ts";
import { type Doc, type Label, type Line, type LabelLine, type Split, unbold } from "./doc.ts";

// How a row ends: `· build`, `· /grill-me first`, `· brainstorm it first`, or a line that is only "build it".
const ROUTES: [RegExp, string][] = [
  [/\/grill-me\b|\bgrill(?:ing)? (?:it )?first\b/i, "/grill-me"],
  [/\/brainstorm\b|\bbrainstorm(?:ing)? (?:it )?first\b/i, "/brainstorm"],
  [/(?:·|,)\s*build(?: it)?\b|^\s*build(?: it)?\.?\s*$/i, "build"],
];

const routeOf = (line: string) => ROUTES.find(([pattern]) => pattern.test(line))?.[1];

/** A row's own lines: the one it starts on and those indented under it. */
function rowLines(doc: Doc, start: Line): Line[] {
  const under = doc.lines.slice(start.at + 1);
  const end = under.findIndex((line) => line.kind === "blank" || line.indent < 2);
  return [start, ...(end < 0 ? under : under.slice(0, end))];
}

/** One row as an item: build it, or the route its last line names. Prose up to the next row stays with it. */
function rowOf(label: Label, own: Line[], between: Line[], route: string): FormItem {
  // `<title> · <size> · <next>` keeps its fields beside the title.
  const [title = "", ...fields] = [label.title, label.rest].filter(Boolean).join(" ").split(" · ");
  const said = between.filter((line) => line.kind !== "blank" && line.kind !== "rule");
  const body = [fields.join(" · "), ...[...own.slice(1), ...said].map((line) => line.raw.trim())];
  const options: Option[] = [{ key: "build", text: "Build it", detail: "" }];
  if (route !== "build") options.push({ key: route, text: `Route to ${route}`, detail: "" });
  return {
    label: label.label,
    title: unbold(title),
    body: body.filter(Boolean).join("\n"),
    options,
    recommended: route === "build" ? "build it" : `route it to ${route}`,
    recommendedOption: options.length - 1,
  };
}

/** The pick list a run of numbered rows is, or null when a row does not end on a route. */
export function picksOf(doc: Doc, run: LabelLine[]): Split | null {
  const items: FormItem[] = [];
  let tail = doc.lines.length;
  for (const [i, start] of run.entries()) {
    const own = rowLines(doc, start);
    const route = routeOf(own.at(-1)?.raw ?? "");
    if (!route) return null;
    const rowEnd = start.at + own.length;
    const next = run[i + 1]?.at;
    if (next === undefined) tail = rowEnd;
    items.push(rowOf(start.mark, own, doc.lines.slice(rowEnd, next ?? rowEnd), route));
  }
  const starts = run.map((start) => start.at);
  return items.length ? { form: { kind: "picks", items }, starts, tail } : null;
}
