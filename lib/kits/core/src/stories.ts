/**
 * What a kit component's story is: one set of props, which both catalogues draw and the parity check
 * reads back from their snapshots. Each component's stories are its own (`<component>/src/stories.ts`);
 * the catalogue package lists them all (`registry.ts`). No host imports.
 */
import type { Line } from "./lines.ts";
import type { Surface } from "./surfaces.ts";

export type KitStory = {
  /** `<component>/<state>`: the id in `/kit`, the scenario's name and the catalogue's heading. */
  component: string;
  state: string;
  about: string;
  /** What was passed to the component, shown as the caption. */
  settings?: string;
  /** Snapshot at four sizes, for the state with the most text. */
  extreme?: boolean;
  /** The width class the stage caps the component at. @default "reading" */
  width?: "reading" | "dialog";
  /** The component at `width` cells, as it first stands. */
  lines(width: number): Line[];
  /** The surfaces that draw this story, derived from its manifest in the catalogue. */
  surfaces: readonly Surface[];
  /** Keys and clicks change it: each catalogue wires it by hand, from the same first state. */
  isLive?: boolean;
};

export const storyId = (s: Pick<KitStory, "component" | "state">) => `${s.component}/${s.state}`;

/** Keep the shared terminal story set for the terminal parity check. */
export const hasTerminalStory = (s: Pick<KitStory, "surfaces">) =>
  s.surfaces.includes("pi") || s.surfaces.includes("claude-terminal");

// ---- schema 2: a story is data

/** What plain Node reads from `stories.ts` and a snapshot can hold: JSON, and nothing else. */
export type Plain =
  | string
  | number
  | boolean
  | null
  | readonly Plain[]
  | { readonly [key: string]: Plain | undefined };

/**
 * A text field a graphical drawing is given, described as data. The catalogue's adapter
 * (`lib/kits/catalog/src/adapters.tsx`) builds the host's `Input` from it, since this file cannot
 * import a host.
 */
export type InputData = { value: string; placeholder?: string; rows?: number; label?: string };

/** The extensions every graphical drawing may have; a component adds its own, as data too. */
export type GuiExt = { inputs?: { readonly [hit: string]: InputData } };

/**
 * A story of a component on schema 2: one model value, and what each drawing adds. Which
 * surfaces draw it is the manifest's to say (a feature names it), not a flag's. No host imports,
 * no functions: `isPlain` holds for it.
 * @typeParam M The component's model (`contract.ts`).
 * @typeParam T The terminal drawing's extension: `width`, `focused`, `top`.
 * @typeParam G The graphical drawing's extension, described as data.
 */
export type Story<M extends Plain = Plain, T extends Plain = Plain, G extends Plain = GuiExt> = {
  /** `<component>/<state>`: the id in `/kit`, the scenario's name and the catalogue's heading. */
  component: string;
  state: string;
  about: string;
  settings?: string;
  /** The model: what the component is given, and what its view model decides from. */
  model: M;
  /** Each drawing's extension, apart from the model. */
  ext?: { terminal?: T; gui?: G };
  /** Keys and clicks change it: each catalogue wires it by hand, from the same first state. */
  isLive?: boolean;
};

/** Whether a story is plain data: what the spec asks of every story of schema 2. */
export function isPlain(value: unknown, seen = new Set<unknown>()): value is Plain {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const proto = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((v) => v === undefined || isPlain(v, seen));
}

/**
 * What every story's terminal extension may say about the stage it is drawn on, apart from what
 * the component's own extension adds: how wide the stage is, and whether it is snapshotted at
 * four sizes.
 */
export type StageExt = {
  /** Snapshot at four sizes, for the state with the most text. */
  extreme?: true;
  /** The width class the stage caps the component at. @default "reading" */
  stage?: "reading" | "dialog";
};
