/**
 * The shape of a component manifest (`components/<id>.ts`): what the catalogue knows that the
 * source cannot say — what it is for, which export implements it in each harness, and which
 * features each harness supports. `exportsIn` reads the source for the export names.
 */
import { readFileSync } from "node:fs";

export type Harness = "pi" | "claude";
export const harnesses: Harness[] = ["pi", "claude"];

/** `planned` is for a feature the harness can do but its kit does not have yet. */
export type Status = "yes" | "partial" | "no" | "planned";

export type Support = { status: Status; note?: string };

export const yes = (note?: string): Support => ({ status: "yes", note });
/** Works, with a limit: the note says what. */
export const partial = (note: string): Support => ({ status: "partial", note });
/** Cannot be done in this harness; the note gives the engine limit. */
export const no = (reason: string): Support => ({ status: "no", note: reason });
export const planned = (note?: string): Support => ({ status: "planned", note });

/** The exports that implement a component, or why the harness cannot have it. */
export type Impl = string | string[] | { none: string };

export type Feature = {
  id: string;
  label: string;
  /** The story that shows it: one id for both harnesses, or one per harness. */
  story?: string | Partial<Record<Harness, string>>;
  pi: Support;
  claude: Support;
};

export type Component = {
  /** The stories' component name: `list` for `list/grouped`. */
  id: string;
  name: string;
  /** One line: what it is for. */
  purpose: string;
  impl: Record<Harness, Impl>;
  features: Feature[];
};

export const defineComponent = (c: Component): Component => c;

export const exportsOf = (impl: Impl): string[] =>
  typeof impl === "string" ? [impl] : Array.isArray(impl) ? impl : [];

export const storyOf = (f: Feature, h: Harness): string | undefined =>
  typeof f.story === "string" ? f.story : f.story?.[h];

/**
 * The names a kit file exports: its own `export const|function|type|interface|class|enum`
 * statements and the `export { ... } from "./x.ts"` re-exports a kit barrel is made of. Enough to
 * fail a manifest that names an export the kit no longer has, without compiling it.
 */
export function exportsIn(file: string): Set<string> {
  const text = readFileSync(file, "utf8");
  const names = new Set<string>();
  for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm))
    for (const part of (m[1] ?? "").split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  for (const m of text.matchAll(
    /^export\s+(?:declare\s+)?(?:const|let|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm,
  ))
    names.add(m[1] as string);
  return names;
}
