import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";
import { expectNative } from "@agents/kit-core/paint/checks.tsx";
import { guiStoryIds, guiStoryOf } from "./stories.gui.tsx";
import { storyId } from "@agents/kit-core/stories.ts";
import { kitStories } from "./registry.ts";

const PANE = {
  plugin: "kit-catalog",
  component: "Pane",
  requestId: "kit",
  props: {
    title: "story",
    isFocused: true,
    bodyColumns: 80,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const;

const engine = (on: On) => {
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
};

/** `/kit <story>`, then the pane of the graphical surface that draws it. */
async function draw($: Engine, id: string, surface: "vscode" | "desktop") {
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await $.command.run({
    command: "kit",
    args: id,
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });
  return $.ui.mount({ ...PANE, surface });
}

// Every story with a graphical drawing is mounted on both graphical surfaces and keeps the style's rules.
for (const surface of ["vscode", "desktop"] as const)
  test(`every graphical story draws natively on ${surface}`, async ($, on) => {
    engine(on);
    const ids = guiStoryIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const ui = await draw($, id, surface);
      const texts = (await ui.findAll({})).filter((e) => e.text);
      expect(texts.length, `${id} draws nothing on ${surface}`).toBeGreaterThan(0);
      await expectNative(ui);
      await ui.unmount();
    }
  });

test("a story that says `gui: true` has a drawing", () => {
  for (const s of kitStories.filter((s) => s.gui))
    expect(guiStoryOf(storyId(s)), storyId(s)).toBeDefined();
});

test("prose is the host's Markdown, dim only when the story says so", async ($, on) => {
  engine(on);
  const blocks = await draw($, "prose/blocks", "vscode");
  expect((await blocks.find({ type: "Markdown" }))?.props.dimColor).toBeUndefined();
  await blocks.unmount();
  const quiet = await draw($, "prose/quiet", "vscode");
  expect((await quiet.find({ type: "Markdown" }))?.props.dimColor).toBe(true);
  await quiet.unmount();
});
