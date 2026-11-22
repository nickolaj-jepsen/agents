# UI kit

One design system for the plugins on both clients. A terminal component is drawn once, as styled lines, and pi and Claude Code's terminal each only paint those lines, so the two cannot drift apart. Claude Desktop and VS Code get their own drawing with native controls.

The [component catalogue](catalog/COMPONENTS.md) lists every component, where it is drawn and which are still on the legacy kits. The [rendered catalogue](https://nickolaj-jepsen.github.io/agents/dev/) shows them in both terminals. The [layout reference](../skills/agent-plugin-dev/references/style.md) holds the rules every component follows.

## How it fits together

| Part                                                    | What it holds                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`lines.ts`](lines.ts)                                  | The line model: spans with a colour role and a face, the control a span or row belongs to, wrapping and inline Markdown in cells. |
| [`tokens.ts`](tokens.ts)                                | The numbers and glyphs. One edit restyles every plugin on both clients.                                                           |
| `<component>/contract.ts`                               | What a plugin passes in and gets back. No host imports.                                                                           |
| `<component>/terminal.ts`                               | The component as lines for a width.                                                                                               |
| [`paint/pi.ts`](paint/pi.ts)                            | Lines as pi's themed strings, and where each control sits on its row.                                                             |
| [`paint/claude.tsx`](paint/claude.tsx)                  | Lines as Claude Code elements: a plain `Button` per control, plus the parked focus ring, the hover fill and the keyboard hint.    |
| [`stories.ts`](stories.ts) and `<component>/stories.ts` | One set of sample props per state, drawn by both catalogues.                                                                      |
| [`legacy/`](legacy)                                     | The two kits from before, for what has not moved yet. Don't add to them.                                                          |

A component's functions take props and a width and return `Line[]`. They never see a theme or an element, so they run the same in a test, in pi and in a Claude Code mod.

## Draw with a component

In pi, import by relative path (the loader resolves no aliases) and paint with the theme:

```ts
import { choiceList } from "../../../kit/card/terminal.ts";
import { paintLines } from "../../../kit/paint/pi.ts";

const painted = paintLines(theme, choiceList(props, width), width);
// painted.lines are the rows; painted.cells say where each control is, for the mouse.
```

In a Claude Code mod, import from the mod's own copy and paint with the elements of the render event:

```tsx
import { choiceList } from "./kit/card/terminal.ts";
import { paintLines } from "./kit/paint/claude.tsx";

return paintLines(els, choiceList(props, width), { press: (hit) => pick(hit), width });
```

A mod can't import outside its folder, so it carries a copy of the kit as `claude/kit/`:

```bash
pnpm turbo run kit-sync -- answer  # give a mod its copy of the kit
pnpm turbo run kit-sync            # rewrite every copy after editing the kit
```

Its `claude/tsconfig.json` needs `"allowImportingTsExtensions": true`, since the kit's files import each other with `.ts`. `pnpm turbo run test` fails while a copy differs from the kit.

A screen both halves of a plugin draw is written once, in the plugin's `core/`, and imports the kit from the mod's copy (`../claude/kit/`): that folder is the one both the mod and the pi extension can reach. [linear-issue's screen](../plugins/linear-issue/core/screen.ts) is the example: it returns lines and decides what a key does, and each half only paints and delivers keys.

The kit keeps no state and registers no hooks. A plugin holds the state (what is chosen, where the keyboard is) and passes it in, the same way on both clients. [The catalogue mod](catalog/claude/claude/register.tsx) shows the hooks a Claude Code site needs for the kit's own focus.

## Add or change a component

```bash
pnpm turbo run kit-new -- status-line                                    # scaffold kit/status-line/ and register its stories
pnpm turbo run kit-live --ui=tui -- status-line/default --harness pi     # watch it in a real session; redraws on save
pnpm turbo run kit-sync                                                  # copy the kit into the mods
pnpm turbo run e2e:update --filter=@agents/e2e-kit -- -t 'status-line/'  # record it in pi and Claude Code
pnpm turbo run test --filter=@agents/kit                                 # the parity check reads those snapshots
```

`kit-live` is an interactive task: the [replay guide](../e2e/README.md#live-mode) says how to type into it.

1. Put the types in `contract.ts` and draw in `terminal.ts`. Use roles from `lines.ts` and glyphs from `tokens.ts`, never a colour or a literal glyph. Give each control a `hit`, on its row or on its spans.
2. Add a story per state in the component's `stories.ts`. A story is one call that returns lines for a width.
3. Fill in `manifest.ts`: what it is for, its features, the story that shows each, and for each surface whether it is on the system. A feature on a `system` surface is supported or says why the engine can't; "not built yet" is not an answer there.
4. Record and run the tests. [`parity.spec.ts`](parity.spec.ts) fails when a client's snapshot is not exactly the shared drawing at its width, or when the two clients differ at the same width.

Test the mouse first. Hover and click every control in a real session on each client before trying a key, in every place the component is drawn: a pane, the band and the transcript differ in focus and in who holds the keyboard.

To change how something looks everywhere, edit its `terminal.ts` or `tokens.ts` and record again. Both clients change together.

## What still differs between the clients

- **Hover.** pi reports the pointer, and the row under it gets a bold label. Claude Code inverts a `Button` under the pointer and nothing turns that off, so the painter swaps the row's colours first: the row keeps them and sits on a soft fill.
- **Keyboard focus on Claude Code.** The engine inverts whatever its focus ring rests on. A site that wants the kit's pointer and bold label instead keeps the ring on a button that draws nothing (`ring` in the painter) and turns the ring's moves into its own focus in a `ui.focus` hook (`ringMove`).
- **Who has the keyboard on Claude Code.** A pane or the band has it only after `ctrl+x tab` or a click there. `keysHint` draws the line that says so.
- **The rail of a transcript card.** On Claude Code it is the engine's quote border, which also runs beside blocks the engine draws.
- **Blocks.** Text entry is each host's own field, in the row an `input` slot keeps for it: pi's is one row and follows the cursor, Claude Code's wraps and stands alone on its rows. A slot of several rows takes each client's field of several lines, which brings its own rules. Block Markdown is a `markdown` slot for the host's renderer, or `prose` where the rows have to be counted, as in a body that scrolls.
- **A panel over the screen.** pi lays a `sheet` over the transcript, with no foot where it stands on the prompt's rule. Claude Code frames a pane itself, a box above the prompt or a rule beside the transcript, with its own Close, so a mod draws `sheetHead` and the body.

## The legacy kits

`legacy/pi/` and `legacy/claude/ui.tsx` hold what has not moved. A mod still on the Claude one carries it as `claude/ui.tsx`. The lint keeps a list of the plugin files that still draw around the kit (`.oxlintrc.json`); the list only shrinks, and a file leaves it when it imports nothing from `legacy/` and styles nothing by hand.

Their stories and manifests are under [`catalog/`](catalog), and the catalogue is built from both:

```bash
E2E_PNG=1 pnpm turbo run e2e --filter=@agents/e2e-kit --force  # compare snapshots and write pictures
pnpm turbo run catalog                                         # replay stories and regenerate crops and catalogue data
```

Commit the snapshots and the regenerated `catalog/COMPONENTS.md`. The site data and crops are generated, not committed. `pnpm turbo run catalog -- --check` validates the manifests without replaying.
