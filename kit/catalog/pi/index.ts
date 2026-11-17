/**
 * The kit catalogue, a dev-only pi extension: `/kit <component> [state]` draws one kit
 * component alone with sample data; `/kit` lists them. Not a plugin (home-manager never loads
 * it); load it with `pi-dev -e kit/catalog/pi/index.ts`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type Component,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { overlayOptions } from "../../pi/ui.ts";
import { stageLines, stageOptions, stageRows } from "./stage.ts";
import { storyId, stories, type Live, type Story } from "./stories.ts";

class StoryView implements Component {
  private readonly live: Live;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly story: Story,
    private readonly done: () => void,
  ) {
    this.live = story.make();
  }

  invalidate() {}

  handleInput(data: string) {
    if (matchesKey(data, Key.escape) || data === "q") return this.done();
    if (this.live.input?.(data)) this.tui.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.story.frame || !this.live.mouse) return undefined;
    // The stage's cells are the component's own: the overlay's origin is its top-left.
    return this.live.mouse(event);
  }

  render(width: number): string[] {
    const env = { columns: this.tui.terminal.columns, rows: this.tui.terminal.rows };
    if (this.story.frame) return this.live.render(this.theme, width, env);
    return stageLines(this.live.render(this.theme, width, env), width, stageRows(env.rows));
  }
}

const listing = () => {
  const by = new Map<string, string[]>();
  for (const s of stories) by.set(s.component, [...(by.get(s.component) ?? []), s.state]);
  return [...by].map(([c, states]) => `${c}: ${states.join(", ")}`).join("\n");
};

export default function (pi: ExtensionAPI) {
  pi.registerCommand("kit", {
    description: "Draw a pi UI kit component alone: /kit <component> [state]",
    handler: async (args, ctx) => {
      const [component, state] = args.trim().split(/[\s/]+/);
      if (!component) return ctx.ui.notify(`Components and states\n${listing()}`, "info");
      const found = stories.filter((s) => s.component === component);
      const story =
        found.find((s) => s.state === state) ?? (found.length === 1 ? found[0] : undefined);
      if (!story) {
        const known = found.length > 0 ? found.map((s) => s.state).join(", ") : listing();
        return ctx.ui.notify(
          `${component}${state ? "/" + state : ""}: pick a state\n${known}`,
          "warning",
        );
      }
      if (!ctx.hasUI || ctx.mode !== "tui") return;
      await ctx.ui.custom<void>(
        (tui, theme, _keys, done) => new StoryView(tui, theme, story, () => done()),
        {
          overlay: true,
          overlayOptions: story.frame
            ? overlayOptions(story.width, story.content)
            : stageOptions(story),
        },
      );
    },
  });
}
