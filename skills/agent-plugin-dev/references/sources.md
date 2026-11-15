# Sources

Where to look when a component needs a behaviour the kit does not have yet. None is a dependency: read how it behaves, then build it in the kit to the house style.

## On disk, for the pinned version

- pi's docs: `modules/programs/pi/extensions/node_modules/@earendil-works/pi-coding-agent/docs/` (`tui.md`, `extensions.md`, `themes.md`, `keybindings.md`).
- pi's example extensions, beside the docs in `examples/extensions/`: `preset.ts` (a `SelectList` in a border), `questionnaire.ts` (tabs and wrapped options, hand-built), `overlay-test.ts` and `overlay-qa-tests.ts` (anchors, margins, overflow), `widget-placement.ts`, `custom-footer.ts`.
- pi-tui's exports: `…/node_modules/@earendil-works/pi-tui/dist/index.d.ts`.
- Claude Code's mod API: the `plugin-authoring` skill (`reference.md`, the types, `examples/`). Its files move with every version, so load the skill; don't link a path.
- The types the engine laid for a mod: `plugins/<name>/.claude-plugin/types/claude-code/index.d.ts`, after `just dev-setup`.

## Official samples

- Anthropic's playground mods: <https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods>. A confirm dialog, a diff pane, a band.

## Terminal UI frameworks, for behaviour

| Framework | Look at                                                                         | For                                                            |
| --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Bubbles   | <https://github.com/charmbracelet/bubbles>: `list`, `table`, `help`, `viewport` | a help bar that drops entries when narrow; table column widths |
| Ink UI    | <https://github.com/vadimdemedes/ink-ui>: `Select`, `MultiSelect`               | the Claude side's nearest relative: flex layout in React       |
| Textual   | <https://textual.textualize.io/widget_gallery/>                                 | `DataTable`, `Tabs`, `Footer` with key bindings                |
| Ratatui   | <https://ratatui.rs/>: `Table`, `List`, `Tabs`, `Scrollbar`                     | constraint-based column sizing                                 |

When they disagree with `style.md`, the style wins.
