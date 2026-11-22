// The mod's state contract: the story being drawn, what a live story has been set to, and whether
// the kit's keys hold the keyboard.

/** `<component>/<state>`. */
export type StoryId = string;

declare module "claude-code" {
  interface PluginState {
    "kit-catalog": {
      /** `<component>/<state>` of the story on the stage, null for none. */
      story: Shaped<StoryId | null>;
      /** What a story that reacts has been set to, by story id; null for none. */
      live: Shaped<{ id: StoryId; state: unknown } | null>;
      /** Whether the kit's keys hold the keyboard (the parked focus ring is on a story). */
      keys: Shaped<boolean>;
    };
  }
}
