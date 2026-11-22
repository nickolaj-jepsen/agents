/**
 * What a kit component's story is: one set of props, which both catalogues draw and the parity check
 * reads back from their snapshots. Each component's stories are its own (`<component>/src/stories.ts`);
 * the catalogue package lists them all (`registry.ts`). No host imports.
 */
import type { Line } from "./lines.ts";

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
  /** Keys and clicks change it: each catalogue wires it by hand, from the same first state. */
  isLive?: boolean;
};

export const storyId = (s: Pick<KitStory, "component" | "state">) => `${s.component}/${s.state}`;
