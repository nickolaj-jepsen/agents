// The mod's state contract: the story being drawn, and what a live story holds.

/** `<component>/<state>`. */
export type StoryId = string;

declare module "claude-code" {
  interface PluginState {
    "kit-catalog": {
      /** `<component>/<state>` of the story on the stage, null for none. */
      story: Shaped<StoryId | null>;
      /** What a story that reacts has been set to, by story id; null when none has. */
      live: Shaped<{ id: StoryId; state: unknown } | null>;
      /** Whether the site with a live choice story's keys holds the keyboard. */
      keys: Shaped<boolean>;
    };
  }
}
