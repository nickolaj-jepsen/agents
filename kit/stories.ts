/**
 * Every story of the kit's components: one set of props each, which both catalogues draw and
 * the parity check reads back from their snapshots. No host imports.
 */
import { buttonStories } from "./buttons/stories.ts";
import { cardStories } from "./card/stories.ts";
import { frameStories } from "./frame/stories.ts";
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

export const kitStories: KitStory[] = [...cardStories, ...buttonStories, ...frameStories];
