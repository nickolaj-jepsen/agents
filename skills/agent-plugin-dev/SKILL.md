---
name: agent-plugin-dev
description: Design, build and check the UI of a plugin in this repo, for Claude Code (a mod's pane, band, status) and pi (an extension's overlay, form, widget) — the house style, the shared UI kit, and a driver that parks a real session on any screen and photographs it at four sizes. Use when developing, fixing or reviewing what a mod or pi extension draws, its keys, mouse or focus; before handing any plugin UI change back; when a plugin seems to do nothing; or when asking how one renders.
compatibility: Works in a checkout of nickolaj-jepsen/agents, with nix, Claude Code signed in and pi.
metadata:
  summary: "the UI of a Claude Code mod or pi extension, with a house style, a shared kit and a driver that parks a real session on any screen."
  category: harnesses
---

A plugin's logic can be right while its screen is unusable: a title cut to nothing, lines 200 columns wide, metadata at a different column on every row. Tests don't see that, and neither does a text capture read as text. So this skill has three parts: a style that says what good looks like, a kit that already does it, and a driver that makes you look.

Most plugins have a Claude half and a pi half. Design both together: the harnesses can draw different things, and a layout that suits one may not exist in the other.

- `references/style.md`: the house style. Read it before any layout.
- `references/claude.md`: what a mod can draw, the engine's limits and traps. Load `plugin-authoring` too; it holds the API.
- `references/pi.md`: what a pi extension can draw, pi-tui's components, traps, and reading a session file.
- `references/sources.md`: where to look for how others solved a component.
- `e2e/README.md`: writing scenarios and reading snapshots.

## What each harness can draw

| Need                           | Claude Code                                                           | pi                                                              |
| ------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| A form that replaces the input | a band above the prompt (`AbovePrompt`)                               | a component in the editor's place (`overlay: false`)            |
| A panel to read or pick from   | a `Pane`: the surface docks it from 110 columns, the mod can't choose | an overlay: you choose width, anchor and margin                 |
| List beside its detail         | no: a docked pane is about 48 columns                                 | yes: two panes from 110 columns                                 |
| Layout                         | flex `Box` and `Text`; no `maxWidth`, no list, table or divider       | `render(width)` returns lines; pi-tui has stacks, lists, scroll |
| Selection and focus            | the engine draws focus on a `Button`; focus is asked for, not taken   | yours to draw; you get every key                                |
| Mouse                          | free on `Button`                                                      | hit-test it yourself, or `MouseRegion`                          |
| Status                         | `$.ui.status`: one plain line per mod                                 | `setStatus`, `setWidget`, `setFooter`                           |

## Design before code

1. Name the surface and its width class (`style.md`).
2. List the states: empty, one item, more than fit, text far longer than expected, wide characters, an error or notice.
3. Sketch the fullest state as text at the narrowest and the widest size, in both harnesses. Fix the sketch before the code; it is cheaper.
4. Build from the kit. A component the kit lacks is added to the kit, not written into the plugin.

## The kit

One source per harness, with the style's numbers and glyphs in its tokens:

- pi: `kit/pi/`, imported by a plugin's pi half.
- Claude Code: `kit/claude/`, copied into each mod as `claude/ui.tsx`. The build fails when a copy differs from the source, so edit the source and run `just kit-sync`.

Never hand-roll a frame, a padded row, a truncation or a hint bar in a plugin. If a kit component can't do what the screen needs, change the component.

`kit/catalog/COMPONENTS.md` lists every component, what each harness has of it and which features work; `/kit <component>` in a session draws one, and `npm run e2e kit` replays their stories. Read it before designing, to see what exists and what a harness can't do. `kit/README.md` says how to add a component: the kit code, its entry in `kit/catalog/components/`, its stories in both harnesses over the shared samples, and nothing drawn that a story does not show.

## The driver

A scenario is a named screen of a plugin: its fixture, how the agent starts, and the steps that reach it. Scenarios live in `e2e/<plugin>/`, and the same file drives the tests and `goto`. Run these from the repo root:

```bash
npm run e2e:cli -- ls docfix
npm run e2e:cli -- goto docfix queue --harness pi   # a live session, parked on that screen
npm run e2e:cli -- cap                               # the screen as text
npm run e2e:cli -- keys Down Enter                   # also: type, paste, click <text>, hover <text>, wait, resize
npm run e2e:cli -- sweep                             # a PNG at each of the four sizes; prints the paths
npm run e2e:cli -- stop
npm run e2e docfix                                   # play the plugin's scenarios against their snapshots
```

A screen you need more than once gets a scenario, so the next agent reaches it in one command. Both harnesses replay canned model turns (`start.turns`), so a screen that follows a model reply costs nothing and never varies.

A Claude dev session watches the mod's folder: save, and it reloads. Check `references/pi.md` for pi.

When a plugin does nothing, look before guessing: `cap` at startup shows pi's `[Extension issues]`, and the Claude debug log in the run folder says whether the module loaded, a hook was skipped or a tree was refused.

## Before handing back

A change to what a plugin draws, or to its keys, is not done until all of this is:

1. **A stress scenario exists**, marked `extreme: true`: the longest text you can imagine in every field, many rows, wide characters. Short placeholder text hides every layout fault.
2. **`sweep` it, and open every PNG with Read.** A text capture does not show alignment or spacing; the picture does. Sizes are 70×24, 112×32, 160×45 and 240×60.
3. **Write down what you saw at each size**, in the hand-back:
   - what is cut, and whether anything the person needs is lost;
   - what wraps, and whether rows keep their height;
   - whether metadata sits at one column on every row;
   - whether the width cap holds at 240;
   - what happens to the hints and the layout at 70. A review that does not name the narrowest size has not finished.
4. **Check it against `style.md`'s list of defaults that are wrong.**
5. **Press every key shown and click every target**, from the prompt with a draft typed and with it empty.
6. **Run the plugin's scenarios** (`npm run e2e <plugin>`). Read the diff of any snapshot you update, and say what changed and why. Only `.snap` files are committed; PNGs are generated (`E2E_PNG=1 npm run e2e <plugin>`, or `sweep`) and git-ignored.

If a session could not be run, say that instead of calling the work tested.

## Limits

- A Claude session is the person's own account. Scenarios use canned turns; send no real prompt a screen does not need. It starts with no MCP servers.
- The suite is local: nothing runs it in the build or in CI. It is run by you, before handing back.
- A scenario starts at one size and is resized between snapshots, so a layout that depends on the size it opened at needs its own scenario with `size`.
