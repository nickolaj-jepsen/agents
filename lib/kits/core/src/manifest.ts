import { lackOf, type Drawing, type Need, type Surface as SurfaceName } from "./surfaces.ts";

/**
 * The shape of a component manifest: what the catalogue knows that the source cannot say — what
 * it is for, which export implements it in each harness, and which features each harness
 * supports. Props come from the source (`extract.ts`), never from here.
 *
 * A manifest is `components/<id>.ts` for a component of pi's legacy kit, or `manifest.ts` in the
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
 * the drawing; `system` is the kit's one drawing (`kit/<name>/`: `terminal.ts` for the terminals,
 * `gui.tsx` for `gui`), and on it no feature may be `planned`: each is supported or not possible.
 * `gui` can be `system` only when the component has `impl.gui` and every feature has a `gui` answer.
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
  /**
   * The story that shows it: one id for every surface, or one per surface. `gui` falls back to
   * `claude`'s; a graphical answer needs a story with a graphical drawing (`gui: true`).
   */
  story?: string | Partial<Record<Surface, string>>;
  pi: Support;
  claude: Support;
  /**
   * The graphical clients' answer (`gui.tsx`), same vocabulary: `no` says why the host cannot.
   * Needed on every feature once `gui` is `system`; left out for a component still on `legacy`.
   */
  gui?: Support;
};

export type Component = {
  /** The stories' component name: `list` for `list/grouped`. */
  id: string;
  name: string;
  /** One line: what it is for. */
  purpose: string;
  /**
   * The exports per harness's terminal drawing, and `gui`: the exports of `gui.tsx`, the same
   * names as `terminal.ts`'s, or `{none: why}`. A component without `gui` has no graphical drawing.
   */
  impl: Record<Harness, Impl> & { gui?: Impl };
  /**
   * How each surface draws it. A surface left out is `legacy` where the component is
   * implemented and absent where it is not (`gui` follows `claude`).
   */
  status?: Partial<Record<Surface, SurfaceStatus>>;
  /**
   * The file, relative to `kit/`, that draws it on every `system` terminal (`card/terminal.ts`):
   * `impl` names are read from there, for pi and for Claude Code. Needed once either is `system`.
   * The graphical drawing is `gui.tsx` beside it.
   */
  source?: string;
  features: Feature[];
};

/**
 * Schema 1 (`Component`) keeps working until every component has moved; `schema: 2` opts into
 * `ComponentV2`, whose literals the types read (`PartsOf`, the derived answers).
 */
export function defineComponent<const C extends ComponentV2>(c: C): C;
export function defineComponent(c: Component): Component;
export function defineComponent(c: Component | ComponentV2): Component | ComponentV2 {
  return c;
}

export const isNone = (impl: Impl): boolean => typeof impl === "object" && !Array.isArray(impl);

export const exportsOf = (impl: Impl): string[] =>
  typeof impl === "string" ? [impl] : Array.isArray(impl) ? impl : [];

export const storyOf = (f: Feature, h: Surface): string | undefined =>
  typeof f.story === "string"
    ? f.story
    : (f.story?.[h] ?? (h === "gui" ? f.story?.claude : undefined));

// ---- schema 2: parts, fields and derived answers

/**
 * A part: an export of the component's drawing. A part with no `drawings` is in both; one with
 * `drawings` names those that have it, and `none` says why each other drawing cannot.
 */
export type PartDecl = {
  readonly drawings?: readonly Drawing[];
  readonly none?: { readonly [D in Drawing]?: string };
};

/**
 * A feature of schema 2. It names the model fields it covers and the capabilities it needs; the
 * answer on each surface is derived from the table (`answerOf`), never written.
 */
export type FeatureV2 = {
  readonly id: string;
  readonly label: string;
  /** The contract's fields this feature is about. */
  readonly fields?: readonly string[];
  /** What a host must have for the feature: `keyFocus:kit|ring`, `window`. */
  readonly needs?: readonly Need[];
  /** The story that shows it, `<component>/<state>`. */
  readonly story?: string;
  /** A limit of the component itself on one surface: the answer there is `partial`. */
  readonly limits?: { readonly [S in SurfaceName]?: string };
};

/** What `contract.ts` tells the catalogue: every model field, and the gated ones' needs. */
export type ContractV2 = {
  readonly fields: readonly string[];
  readonly needs: Readonly<Record<string, Need>>;
};

export type ComponentV2 = {
  readonly schema: 2;
  /** The stories' component name: `list` for `list/grouped`. */
  readonly id: string;
  readonly name: string;
  /** One line: what it is for. */
  readonly purpose: string;
  readonly contract: ContractV2;
  readonly parts: Readonly<Record<string, PartDecl>>;
  readonly features: readonly FeatureV2[];
};

/** The parts the `D` drawing exports, from a manifest declared `as const`. */
export type PartsOf<
  M extends { readonly parts: Readonly<Record<string, PartDecl>> },
  D extends Drawing,
> = {
  [P in keyof M["parts"] & string]: M["parts"][P] extends {
    readonly drawings: readonly (infer X)[];
  }
    ? D extends X
      ? P
      : never
    : P;
}[keyof M["parts"] & string];

type Verdict<Mod, Parts extends string> = [Exclude<keyof Mod & string, Parts>] extends [never]
  ? [Exclude<Parts, keyof Mod & string>] extends [never]
    ? true
    : `missing part: ${Exclude<Parts, keyof Mod & string>}`
  : `undeclared export: ${Exclude<keyof Mod & string, Parts>}`;

/**
 * Compile-time: a drawing module exports exactly the parts its manifest declares. A stray export
 * or a missing part makes `true` not assignable to the message.
 *
 * ```ts
 * assertExports<typeof import("./gui.tsx"), PartsOf<typeof manifest, "gui">>(true);
 * ```
 */
export const assertExports = <Mod, Parts extends string>(_ok: Verdict<Mod, Parts>): void => {};

type Exhaustive<M, K extends readonly string[]> = [Exclude<keyof M & string, K[number]>] extends [
  never,
]
  ? unknown
  : { readonly "missing model field": Exclude<keyof M & string, K[number]> };

/** A contract's model fields, checked against the model type: a field left out is an error. */
export const modelFields =
  <M>() =>
  <const K extends readonly (keyof M & string)[]>(keys: K & Exhaustive<M, K>): K =>
    keys;

/** The derived answer of a feature on a surface: `no` with the table's note, `partial` for a limit, else `yes`. */
export function answerOf(f: FeatureV2, surface: SurfaceName): Support {
  for (const need of f.needs ?? []) {
    const lack = lackOf(surface, need);
    if (lack) return no(lack.note);
  }
  const limit = f.limits?.[surface];
  return limit ? partial(limit) : yes();
}
