import { lackOf, type Drawing, type Need, type Surface as SurfaceName } from "./surfaces.ts";

/** The two terminal harnesses used by the catalogue's legacy entries and display model. */
export type Harness = "pi" | "claude";
export const harnesses: Harness[] = ["pi", "claude"];

/** The catalogue's three columns. Modern manifests derive answers for each actual surface. */
export type Surface = Harness | "gui";
export const surfaces: Surface[] = ["pi", "claude", "gui"];
export type SurfaceStatus = "legacy" | "system";

/** `planned` survives only in the legacy catalogue. */
export type Status = "yes" | "partial" | "no" | "planned";
export type Support = { status: Status; note?: string };
export const yes = (note?: string): Support => ({ status: "yes", note });
export const partial = (note: string): Support => ({ status: "partial", note });
export const no = (reason: string): Support => ({ status: "no", note: reason });
export const planned = (note?: string): Support => ({ status: "planned", note });

/** The exports that implement a component, or why the harness cannot have it. */
export type Impl = string | string[] | { none: string };

type LegacyFeature = {
  id: string;
  label: string;
  story?: string | Partial<Record<Harness, string>>;
  pi: Support;
  claude: Support;
};

/** Display data for the remaining legacy pi kit, not a component's own manifest. */
export type LegacyComponent = {
  id: string;
  name: string;
  purpose: string;
  impl: Record<Harness, Impl>;
  features: LegacyFeature[];
};

export const defineLegacyComponent = (c: LegacyComponent): LegacyComponent => c;

export const isNone = (impl: Impl): boolean => typeof impl === "object" && !Array.isArray(impl);
export const exportsOf = (impl: Impl): string[] =>
  typeof impl === "string" ? [impl] : Array.isArray(impl) ? impl : [];
export const storyOf = (f: LegacyFeature, h: Harness): string | undefined =>
  typeof f.story === "string" ? f.story : f.story?.[h];

/** Keep the component's literals for the exports and feature coverage checks. */
export const defineComponent = <const C extends ComponentV2>(c: C): C => c;

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
