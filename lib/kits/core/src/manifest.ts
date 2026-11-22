/**
 * The shape of a component manifest: what the catalogue knows that the source cannot say — what
 * it is for, which export implements it in each harness, and which features each harness
 * supports. Props come from the source (`extract.ts`), never from here.
 *
 * A manifest is `components/<id>.ts` for a component of the legacy kits, or `manifest.ts` in the
 * component's own folder (`kit/card/manifest.ts`) for one of the kit.
 */
export type Harness = "pi" | "claude";
export const harnesses: Harness[] = ["pi", "claude"];

/**
 * Where a component is drawn: pi, Claude Code's terminal, or the graphical clients (Claude
 * Desktop and VS Code). Features are per harness; `gui` has none of its own.
 */
export type Surface = Harness | "gui";
export const surfaces: Surface[] = ["pi", "claude", "gui"];

/**
 * How a surface draws the component. `legacy` is the old per-harness kit, with its own copy of
 * the drawing; `system` is the kit's one drawing (`kit/<name>/`), and on it no feature may be
 * `planned`: each is supported or not possible.
 */
export type SurfaceStatus = "legacy" | "system";

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
  /**
   * How each surface draws it. A surface left out is `legacy` where the component is
   * implemented and absent where it is not (`gui` follows `claude`).
   */
  status?: Partial<Record<Surface, SurfaceStatus>>;
  /**
   * The file, relative to `kit/`, that draws it on every `system` terminal (`card/terminal.ts`):
   * `impl` names are read from there, for pi and for Claude Code. Needed once either is `system`.
   */
  source?: string;
  features: Feature[];
};

export const defineComponent = (c: Component): Component => c;

export const isNone = (impl: Impl): boolean => typeof impl === "object" && !Array.isArray(impl);

export const exportsOf = (impl: Impl): string[] =>
  typeof impl === "string" ? [impl] : Array.isArray(impl) ? impl : [];

export const storyOf = (f: Feature, h: Harness): string | undefined =>
  typeof f.story === "string" ? f.story : f.story?.[h];
