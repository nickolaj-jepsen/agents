/**
 * The elements a story's graphical extension describes as data. `stories.ts` is read by plain
 * Node and cannot hold an `Input` or an editor, so it holds `{ inputs: { "<hit>": { value } } }`
 * and this builds the host's element from it, wired to the drawing context's `input` and `submit`.
 * A component with elements of its own (linear-issue's editors) adds an adapter to `guiAdapters`.
 */
import type { GuiExt, InputData } from "@agents/kit-core/stories.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";

/** What an adapter hands the component's drawing: the host's elements, by the `hit` they answer. */
export type GuiElements = { inputs: Record<string, JSX.Element> };

/** A text field for the `hit`: the host's `Input`, its events going to the context. */
export function inputOf(g: Gui, hit: string, data: InputData): JSX.Element {
  const { Input } = g.els;
  return (
    <Input
      key={hit}
      label={data.label}
      value={data.value}
      placeholder={data.placeholder}
      rows={data.rows}
      onInput={(text) => g.input(hit, text)}
      onSubmit={(text) => g.submit(hit, text)}
    />
  );
}

/** The elements every story may describe: its `inputs`. */
export const guiElements = (g: Gui, ext: GuiExt = {}): GuiElements => ({
  inputs: Object.fromEntries(
    Object.entries(ext.inputs ?? {}).map(([hit, data]) => [hit, inputOf(g, hit, data)]),
  ),
});

/** A component's own adapter: its extension as data in, its elements out. Keyed by component id. */
export type GuiAdapter<E = never> = (g: Gui, ext: E) => unknown;

/** The per-component adapters; a component that needs none uses `guiElements`. */
export const guiAdapters: Record<string, GuiAdapter> = {};
