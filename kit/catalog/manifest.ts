/**
 * The shape of a component manifest (`components/<id>.ts`): what the catalogue knows about a
 * component that its source cannot say, namely what it is for, which export implements it in
 * each harness and which features each harness supports. Props come from the source itself
 * (`extract.ts`), never from here.
 */
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
