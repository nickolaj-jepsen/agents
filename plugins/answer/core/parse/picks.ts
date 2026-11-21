/** A pick list: numbered rows that each end on how to take them, "build" or a skill to route them to. */
import type { FormItem, Option } from "../forms.ts";
import { type Doc, indent, RULE, type Split, unbold } from "./lines.ts";
import type { Start } from "./starts.ts";

// How a row ends: `· build`, `· /grill-me first`, `· brainstorm it first`, or a line that is only "build it".
const ROUTES: [RegExp, string][] = [
  [/\/grill-me\b|\bgrill(?:ing)? (?:it )?first\b/i, "/grill-me"],
  [/\/brainstorm\b|\bbrainstorm(?:ing)? (?:it )?first\b/i, "/brainstorm"],
  [/(?:·|,)\s*build(?: it)?\b|^\s*build(?: it)?\.?\s*$/i, "build"],
];

const routeOf = (line: string) => ROUTES.find(([pattern]) => pattern.test(line))?.[1];

/** The row at `start`: its own lines (the start and those indented under it) and where the next line is. */
function rowLines(doc: Doc, start: Start): { own: string[]; next: number } {
  const own = [doc.lines[start.line] ?? ""];
  let next = start.line + 1;
  for (; next < doc.lines.length; next++) {
    const line = doc.lines[next] ?? "";
    if (!line.trim() || indent(line) < 2) break;
    own.push(line);
  }
  return { own, next };
}

/** The pick list a run is, or null when a row does not end on a route; the prose between rows stays with the row before. */
export function picksOf(doc: Doc, run: Start[]): Split | null {
  const items: FormItem[] = [];
  let tail = doc.lines.length;
  for (const [index, start] of run.entries()) {
    const { own, next } = rowLines(doc, start);
    const route = routeOf(own.at(-1) ?? "");
    if (!route) return null;
    const following = run[index + 1];
    if (!following) tail = next;
    const between = following ? doc.lines.slice(next, following.line) : [];
    // `<title> · <size> · <next>` keeps its fields beside the title.
    const [title = "", ...fields] = [start.title, start.rest]
      .filter(Boolean)
      .join(" ")
      .split(" · ");
    const detail = [
      fields.join(" · "),
      ...own.slice(1).map((line) => line.trim()),
      ...between.filter((line) => line.trim() && !RULE.test(line)).map((line) => line.trim()),
    ].filter(Boolean);
    const build = route === "build";
    const options: Option[] = [{ key: "build", text: "Build it", detail: "" }];
    if (!build) options.push({ key: route, text: `Route to ${route}`, detail: "" });
    items.push({
      label: start.label,
      title: unbold(title),
      body: detail.join("\n"),
      options,
      recommended: build ? "build it" : `route it to ${route}`,
      recommendedOption: build ? 0 : 1,
    });
  }
  const form = { kind: "picks" as const, items };
  return items.length ? { form, starts: run.map((start) => start.line), tail } : null;
}
