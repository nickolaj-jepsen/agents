# UI kit

One design system for the plugins on both clients. A terminal component is drawn once, as styled lines, and pi and Claude Code's terminal each only paint those lines, so the two cannot drift apart. Claude Desktop and VS Code get their own drawing with native controls.

The [component catalogue](catalog/COMPONENTS.md) lists every component, where it is drawn and which pi still draws with its legacy kit. The [rendered catalogue](https://nickolaj-jepsen.github.io/agents/dev/) shows them in both terminals. The [layout reference](../../skills/agent-plugin-dev/references/style.md) holds the rules every component follows.

## How it fits together

`lib/kits/` holds one package per component (`band`, `buttons`, `card`, `detail`, `fields`, `frame`, `image`, `list`, `notice`, `prose`, `sheet`; each has a short README with what it draws), `core` (the line model, tokens and painters the components share), `legacy` and `catalog`.

| Part                                                                          | What it holds                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`core/src/lines.ts`](core/src/lines.ts) (`@agents/kit-core`)                 | The line model: spans with a colour role and a face, the control a span or row belongs to, wrapping and inline Markdown in cells.                                                                                                                                                                               |
| [`core/src/tokens.ts`](core/src/tokens.ts)                                    | The numbers and glyphs. One edit restyles every plugin on both clients.                                                                                                                                                                                                                                         |
| `<component>/src/contract.ts` (`@agents/kit-<component>`)                     | What a plugin passes in and gets back. No host imports.                                                                                                                                                                                                                                                         |
| `<component>/src/terminal.ts`                                                 | The component as lines for a width.                                                                                                                                                                                                                                                                             |
| [`core/src/paint/pi.ts`](core/src/paint/pi.ts)                                | Lines as pi's themed strings, and where each control sits on its row.                                                                                                                                                                                                                                           |
| [`core/src/paint/claude.tsx`](core/src/paint/claude.tsx)                      | Lines as Claude Code elements: a plain `Button` per control, plus the parked focus ring, keys and a keybinding's action on buttons that draw nothing, the hover fill, the keyboard hint, a control that takes the focus ring when it mounts (`autoFocus`) and the engine's quote rail round a block (`quoted`). |
| `<component>/src/gui.tsx`                                                     | The component in native controls for Claude Desktop and VS Code: the same function names and props as `terminal.ts`.                                                                                                                                                                                            |
| [`core/src/paint/gui.tsx`](core/src/paint/gui.tsx)                            | What every `gui.tsx` draws with: the `Gui` context, roles, `capital`, icons, spans as `Text`, and `column` for a keyed column a host can scroll to.                                                                                                                                                             |
| [`core/src/paint/host.tsx`](core/src/paint/host.tsx)                          | A Claude Code mod's plumbing: choose a drawing by surface, `paneOptions`, the band shell and `onlyOwnRows`.                                                                                                                                                                                                     |
| [`core/src/paint/checks.tsx`](core/src/paint/checks.tsx)                      | `expectNative`: the graphical house rules as assertions for a mod's tests.                                                                                                                                                                                                                                      |
| [`core/src/stories.ts`](core/src/stories.ts) and `<component>/src/stories.ts` | One set of sample props per state, drawn by every catalogue; [`catalog/src/registry.ts`](catalog/src/registry.ts) lists them all, and [`catalog/src/stories.gui.tsx`](catalog/src/stories.gui.tsx) draws the same props with each `gui.tsx`.                                                                    |
| `<component>/e2e/`                                                            | The component's stories played in pi and Claude Code, and their snapshots.                                                                                                                                                                                                                                      |
| [`legacy/`](legacy) (`@agents/kit-legacy`)                                    | `legacy/src/pi/`, pi's kit from before, for what has not moved yet. Don't add to it.                                                                                                                                                                                                                            |

Each component is a workspace package, `lib/kits/<component>`, named `@agents/kit-<component>`; its files are imported as `@agents/kit-card/terminal.ts`. A package lists the kit packages it imports as `workspace:*` dependencies, and an app lists the components it draws with.

A component's functions take props and a width and return `Line[]`. They never see a theme or an element, so they run the same in a test, in pi and in a Claude Code mod.

## Draw on Claude Desktop and VS Code

The graphical surfaces have a proportional font, native controls and a pane that scrolls itself, so a component has a second drawing, `<component>/src/gui.tsx`, with this convention:

- It exports the functions of `terminal.ts` under the **same names**, each taking `(g: Gui, ...)` first and then the **same contract props** (for `prose`, `terminal.ts` is `prose(text, width, options)` and `gui.tsx` is `prose(g, text, options)`: the width goes, nothing else).
- `Gui` is `{ els, surface, press? }` (from [`core/src/paint/gui.tsx`](core/src/paint/gui.tsx)). A control's `hit` becomes a native `Button`'s `onPress`, which calls `g.press(hit)`: a mod wires **one reducer** for both surfaces.
- Terminal-only props are ignored on the graphical surfaces: width, height, `top` and `offset` (the surface scrolls), `focused`, `hovered` and the pointer. The manifest says so per feature.
- What only a host can type (an editor element, a fuller sentence) is an option of the `gui.tsx` function, never a prop of `contract.ts`, which stays free of hosts.
- VS Code paints a `Button` by its `dimColor` alone, so a button's variant follows it; a Button never wraps, so a label past `tokens.gui.maxLabel` cells is set as text under a Button of its short word. `expectNative` holds these and the glyph rules.
- Draw with `g.els` and the roles, icons, `capital` and `spans` of `core/src/paint/gui.tsx`, never a literal colour. The numbers are `tokens.gui` in `tokens.ts`.

```tsx
import { paintLines } from "@agents/kit-core/paint/claude.tsx";
import { forSurface, guiOf } from "@agents/kit-core/paint/host.tsx";
import { prose as proseGui } from "@agents/kit-prose/gui.tsx";
import { prose } from "@agents/kit-prose/terminal.ts";

on("ui.render", { component: "Pane", requestId: "docs" }, async ($, e) => {
  const els = $.ui.resolve(e);
  return forSurface(e, {
    tui: () => paintLines(els, prose(text, width), { width }),
    gui: () =>
      proseGui(
        guiOf(els, e, (hit) => dispatch(hit)),
        text,
      ),
  });
});
```

`forSurface(e, { tui, gui, desktop?, vscode?, mobile? })` runs only the drawing of the event's surface; `desktop`, `vscode` and `mobile` replace `gui` on that one. `paneOptions` opens a pane in the house style, and `bandShell` and `onlyOwnRows` carry the band's shell. In a mod's test, mount the screen with `surface: "vscode"` and `"desktop"` and call `expectNative(ui)` from `@agents/kit-core/paint/checks.tsx`.

A story has a graphical drawing when it says `gui: true` and `<component>/src/stories.gui.tsx` draws its props. The catalogue mod draws it on both graphical surfaces and its test mounts each one (`pnpm turbo run test:claude --filter=@agents/kit-catalog`), and the site's VS Code pictures of it are taken by its recording (see the [replay guide](../tools/drive/README.md#site-media)).

## Draw with a component

In pi, import the packages and paint with the theme:

```ts
import { choiceList } from "@agents/kit-card/terminal.ts";
import { paintLines } from "@agents/kit-core/paint/pi.ts";

const painted = paintLines(theme, choiceList(props, width), width);
// painted.lines are the rows; painted.cells say where each control is, for the mouse.
```

In a Claude Code mod, import the same way and paint with the elements of the render event:

```tsx
import { choiceList } from "@agents/kit-card/terminal.ts";
import { paintLines } from "@agents/kit-core/paint/claude.tsx";

return paintLines(els, choiceList(props, width), { press: (hit) => pick(hit), width });
```

A mod can't import outside its folder, and pi's loader resolves no aliases, so `pnpm turbo run build` bundles what an app imports into its `dist/`: there are no copies of the kit to keep in step. Add the package to the app's `devDependencies` as `workspace:*`.

A screen both halves of a plugin draw is written once, in the plugin's `src/lib/`, and imports the kit packages. [linear-issue's screen](../../apps/linear-issue/src/lib/screen.ts) is the example: it returns lines and decides what a key does, and each half only paints and delivers keys.

The kit keeps no state and registers no hooks. A plugin holds the state (what is chosen, where the keyboard is) and passes it in, the same way on both clients. [The catalogue mod](catalog/src/claude.tsx) shows the hooks a Claude Code site needs for the kit's own focus.

## Add or change a component

```bash
pnpm turbo run kit-new -- status-line                                          # scaffold lib/kits/status-line/ (terminal and graphical) and register its stories
pnpm install                                                                   # link the new package
pnpm drive live kit-status-line default --harness pi --watch                   # watch it in a real session; rebuilds on save
pnpm turbo run e2e:update --filter=@agents/kit-status-line                     # record it in pi and Claude Code
pnpm turbo run test --filter=@agents/kit-catalog                               # the parity check reads those snapshots
```

`kit-new` also adds the component's stories to `catalog/src/registry.ts` and the package to the catalogue's and the site's dependencies. `drive live` runs in your terminal: [the driver's guide](../tools/drive/README.md#live-mode) says how to use it.

1. Put the types in `src/contract.ts` and draw in `src/terminal.ts` and in `src/gui.tsx`. Use roles from `lines.ts` and glyphs from `tokens.ts`, never a colour or a literal glyph. Give each control a `hit`, on its row or on its spans.
2. Add a story per state in the component's `src/stories.ts`. A story is one call that returns lines for a width; keep its props in an exported constant so `src/stories.gui.tsx` draws the same ones, and mark it `gui: true`.
3. Fill in `src/manifest.ts`: what it is for, its features, the story that shows each, and for each surface whether it is on the system. `impl.gui` names the `gui.tsx` exports and each feature has a `gui` answer; a component without `impl.gui` needs no graphical answers. A feature on a `system` surface is supported or says why the engine can't; "not built yet" is not an answer there.
4. Record and run the tests. [`parity.spec.ts`](catalog/src/parity.spec.ts) fails when a client's snapshot is not exactly the shared drawing at its width, or when the two clients differ at the same width.

Test the mouse first. Hover and click every control in a real session on each client before trying a key, in every place the component is drawn: a pane, the band and the transcript differ in focus and in who holds the keyboard.

To change how something looks everywhere, edit its `src/terminal.ts` or `core/src/tokens.ts` and record again. Both clients change together.

## What still differs between the clients

- **Hover.** pi reports the pointer, and the row under it gets a bold label. Claude Code inverts a `Button` under the pointer and nothing turns that off, so the painter swaps the row's colours first: the row keeps them and sits on a soft fill.
- **Keyboard focus on Claude Code.** The engine inverts whatever its focus ring rests on. A site that wants the kit's pointer and bold label instead keeps the ring on a button that draws nothing (`ring` in the painter) and turns the ring's moves into its own focus in a `ui.focus` hook (`ringMove`).
- **Who has the keyboard on Claude Code.** A pane or the band has it only after `ctrl+x tab` or a click there. `keysHint` draws the line that says so.
- **The rail of a transcript card.** On Claude Code it is the engine's quote border, which also runs beside blocks the engine draws.
- **Blocks.** Text entry is each host's own field, in the row an `input` slot keeps for it: pi's is one row and follows the cursor, Claude Code's wraps and stands alone on its rows. A slot of several rows takes each client's field of several lines, which brings its own rules. Block Markdown is a `markdown` slot for the host's renderer, or `prose` where the rows have to be counted, as in a body that scrolls.
- **A key the person binds.** A mod cannot define a keybinding action, but it may borrow one (`app:toggleDiffNoiseFilter` while nothing handles it), and the engine presses only a mounted `Button` that names it. `actionKey` mounts one that draws nothing; draw it whenever the key should work, including when the band shows nothing.
- **A panel over the screen.** pi lays a `sheet` over the transcript, with no foot where it stands on the prompt's rule. Claude Code frames a pane itself, a box above the prompt or a rule beside the transcript, with its own Close, so a mod draws `sheetHead` and the body.

## The legacy kit

`legacy/src/pi/` holds what pi has not moved; answer's pi transcript still uses it. Claude Code has no legacy kit: every mod draws with the kit. The lint keeps a list of the plugin files that still draw around the kit (`.oxlintrc.json`); the list only shrinks, and a file leaves it when it imports nothing from `legacy/` and styles nothing by hand.

## Snapshots and the catalogue

The catalogue is built from the components' stories and manifests, and from the legacy components' manifests (`catalog/src/components/*.ts`) and pi stories (`catalog/src/pi/stories.ts`).

```bash
pnpm drive test kit --png                                      # compare every kit package's snapshots and write pictures
pnpm turbo run media                                           # replay stories and record the crops the site shows
node lib/kits/catalog/src/build.ts --check                     # validate the manifests and the generated files without writing
```

Commit the snapshots and the regenerated `catalog/COMPONENTS.md` and kit index in `AGENTS.md`, which `pnpm turbo run catalog:docs` (and `build`) writes. The crops are generated, not committed, and the site reads the catalogue itself (`apps/site/src/loaders/kit.ts`).
