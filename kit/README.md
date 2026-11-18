# kit

Shared UI building blocks for the plugins' halves, in `pi/` and `claude/`, one folder per harness.
Both follow the house style in `skills/agent-plugin-dev/references/style.md`.

## pi

`kit/pi/ui.ts` re-exports everything. A pi half imports it by relative path
(`../../../kit/pi/ui.ts`): pi's loader reads no tsconfig `paths`, and a package `imports`
alias cannot point out of the plugin folder. `tokens.ts` holds every number, glyph and
colour role; change one there and every plugin follows.

Tests are `kit/**/*.spec.ts`, run by `npm test`.

## Claude Code

`kit/claude/ui.tsx` is one file. It holds the tokens (the pi kit's numbers, glyphs and roles) and
the pi kit's semantics and drawings, in cells. Each drawing function takes a `Kit` first,
`kitOf(els, e.surface)` from `$.ui.resolve(e)`.

The engine cannot import outside a mod's folder, and an install copies only that folder. So the
source is **copied** verbatim into each plugin as `claude/ui.tsx` and imported as `./ui`:

```bash
just kit-sync            # rewrite every existing copy from kit/claude/ui.tsx
just kit-sync docfix     # ...and make one for a plugin that has none yet
```

Never edit a copy. `kit/claude/ui.spec.ts` (in `npm test`, so in `nix build .#agent-tools`) fails
while any copy differs. A mod is on the list by having `plugins/<name>/claude/ui.tsx`; the
catalogue mod's copy is always there (`kit/claude/copies.ts`).

`kit/claude/checks.tsx` is copied the same way, as `claude/checks.tsx` beside each plugin's
`ui.tsx`: `expectNative`, the graphical style's rules as test assertions, which a mod's tests
import from `./checks`. It is a `.tsx` file so `tsc -b`, which has no Claude types, leaves it out.

On the desktop app and VS Code each function draws the graphical style instead
(`skills/agent-plugin-dev/references/style.md`, "Graphical surfaces"). The graphical vocabulary:

- `paneTitle`: the toolbar, the count or what closing does, and the pane's actions at the far edge.
- `section`: a group's heading. `stack`, `pane`: blocks in a column, spaced by `tokens.gui.space`.
- `card`, `foldedRow`: a row that opens in place. `listRow`, `list`: a row a press acts on at once.
  All three are one internal row drawing (`guiRow`), so they share inset, height and gaps.
- `choice`: options as buttons, the chosen one filled (`short` for a sentence, `isLiteral` to keep case).
- `labelled`, `labelledRow`: form fields under their names.
- `statusBand`: the line above the prompt, its way in and more quiet actions.
- `actionBar`, `capped`, `facts`, `subhead`, `prose`, `notice`, `emptyState`, `icon`.
- `forSurface`: the one door through which a mod draws by surface itself (`claude.md`, "The one
  door").

The catalogue below shows the terminal drawings only; these graphical drawings have no stories yet.

`ui.tsx` and the spec stay out of `tsc -b`, because the Claude types are only laid when a mod
loads. Check a mod with `tsc -p plugins/<name>/claude`.

## The catalogue

`kit/catalog/pi/` is a dev-only pi extension, not a plugin: the flake publishes only `plugins/`. It
registers `/kit <component> [state]`, which draws one component alone with sample data, and `/kit`
alone lists them:

```bash
pi-dev --extension kit/catalog/pi/index.ts
```

Every story but the `frame` and `split` ones is drawn on the stage (`kit/catalog/pi/stage.ts`):
a borderless mount at a fixed cell that draws exactly the component's lines, so its crop holds
only the component. Name and settings live in the story's caption data; keep short dim labels
inside the story only where it compares variants (`width 22`). Esc closes a story, undrawn.

A story is one entry of `stories` in `kit/catalog/pi/stories.ts`, named
`<component>/<state>` (`list/grouped`, `frame/hints-drop`). Its scenario in
`e2e/kit/pi.scenarios.ts` has the same name, and its snapshots keep it.

Adding a component to the kit means adding its stories in the same change.

1. Add `Story` objects to `stories`; what a story takes and what `make()` returns is on the
   `Story` and `Live` types there, next to the stories.
2. `npm run e2e kit` (`E2E_UPDATE=1` to accept). Only the `.snap` files are committed; for
   the pictures run `E2E_PNG=1 npm run e2e kit` and look at the PNGs.
3. `npm run catalog` plays the kit scenarios itself in PNG mode (`E2E_PNG=1`), crops each shot to
   the component into `site/media/kit/`, and writes `site/data/kit.json` and `COMPONENTS.md`.
   - Commit only `COMPONENTS.md`. The crops and `site/data/kit.json` are what the site's catalogue
     (`/dev/`, `just site`) is built from, and the Pages workflow records them itself (`just
     media`, signed out: the kit scenarios are hermetic).
   - A crop whose pixels did not change is left alone. Each one is optimised with pngquant and
     oxipng, from the dev shell or from nixpkgs.
   - `npm run catalog -- --no-shots` skips the run and crops the PNGs already there.

The Claude half is the mod `kit/catalog/claude/` (its own `ui.tsx` copy, `stories.ts` as data and
`claude/render.tsx` for what each story draws), loaded by the scenarios with `--plugin-dir`.
`/kit <component> [state]` draws one component in a Pane whose body is exactly the component, or
in the band for `band/*`; `/kit` alone clears the stage. Scenarios are `e2e/kit/claude.scenarios.ts`.

A story exists to be compared, so the two harnesses' versions of one story match in everything
the harness does not force:

- **The same data.** Sample text, rows and entries come from `kit/catalog/samples.ts`. The pi
  stories import it; the Claude mod carries a copy (`claude/claude/samples.ts`) that
  `just kit-sync` writes and a test compares. Never type sample content into a story.
- **The same arrangement.** If pi shows three widths side by side, so does Claude.
- **The same sizes.** `e2e/kit/sizes.ts` holds them.
- **A story one harness can't draw** is left out there, and the component's entry in
  `components/` says why. A story that is merely not written yet is a gap: write it.

A further harness adds `kit/catalog/<harness>/stories.ts` exporting `stories` with the same
`component`/`state`/`about`/`settings` fields, and `e2e/kit/<harness>.scenarios.ts` naming
scenarios `<component>/<state>`. `build.ts` picks up the captions by itself.

### Compatibility and props

The site's catalogue also compares the harnesses. Props tables are read from `kit/pi/ui.ts`
and `kit/claude/ui.tsx` with the TypeScript compiler API, so the doc comments in the kit are
the reference: one line per exported option, `@default` where there is one, `@param` for
parameters.

`site/data/kit.json` (the model the site reads: manifests, stories, props) and `COMPONENTS.md` (the
manifests, for agents) are generated; never edit them. The site's pages are `site/src/pages/dev/`
(the overview) and `site/src/pages/dev/components/` (a page per component, its stories inline).

To add a component:

1. Write it in the kit (`kit/pi/`, and `kit/claude/` when it can exist there), export it
   from `ui.ts`/`ui.tsx`, and document every option.
2. Add `components/<id>.ts` with `defineComponent`: the name, one-line purpose, the export
   that implements it per harness (`{ none: "reason" }` when the harness cannot), and its
   features. Each feature has a status per harness (`yes`, `partial(note)`, `no(reason)`,
   `planned()`) and the story that shows it.
3. Add the stories in each harness's `stories.ts` and scenarios in `e2e/kit/`.
4. `npm run catalog` fails when a `yes`/`partial` feature names a story the harness lacks,
   or a manifest names an export the kit lacks. It lists components not yet in both kits.
   Commit the regenerated `COMPONENTS.md`; `npm test` fails while it is stale
   (`npm run catalog -- --check` runs the same check, and `--no-shots` rewrites it without
   playing the scenarios).
