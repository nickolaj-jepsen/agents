// The mod's state contract: the story being drawn.

/** `<component>/<state>`. */
export type StoryId = string;

declare module "claude-code" {
  interface PluginState {
    "kit-catalog": {
      /** `<component>/<state>` of the story on the stage, null for none. */
      story: Shaped<StoryId | null>;
    };
  }
}
