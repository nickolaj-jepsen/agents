# Site design

How the site looks and why. `src/styles/site.css` holds the values; this file explains them, so a change
stays inside the system. It adapts walldye's (`walldye/docs/site.md`) to a reference for terminal tools.

## Principles

- A reference, read in a terminal user's colours: the screen captures are the plates, and they carry the
  colour. Everything else is type, hairline rules and the page ground.
- One theme, dark: fireproof. No light mode.
- Hairline rules instead of cards; no radius, no shadow, no tinted surface to mark state.
- Every line box and vertical space is a multiple of the 8px unit (`--u`). Rules are 1px background
  gradients inside an existing padding, so they take no height. A plate's box rounds its height up to the
  unit (CSS `round()`), the picture at its top, so what follows stays on the grid.
- Identifiers are set as data: plugin and skill names, commands, paths and keys are mono.

## Colour

Fireproof, from `~/nixos/modules/base/theme.nix`. Text is `fg`, `fg-alt` or `muted`, all 4.5:1 or better on
`bg` (12.0, 8.4 and 4.7). `muted` is for the least of it (counts, crumbs), never on a tinted ground.

| Role                      | Colour                                                |
| ------------------------- | ----------------------------------------------------- |
| Page ground, plates, code | `bg` #1C1B1A, which is the captures' own canvas       |
| Headings, names           | `whiteAlt` #F2F0E5                                    |
| Rules                     | `uiAlt`; masthead and section heads `ui-hi` #575653   |
| Plate and listing frame   | `uiAlt` #403E3C                                       |
| Link underline            | #676764, `ui-hi` nudged to 3:1                        |
| Accent #CF6A4C            | focus ring, the current nav entry, the brand bar, `C` |
| Harness marks             | Claude Code `accent`, pi `purple`                     |
| In progress               | `yellow`                                              |

Code blocks sit on the page ground in a hairline frame, like the plates, and use a Shiki theme from the
same colours (`src/lib/fireproof.ts`): keywords green, strings cyan, numbers purple, functions and the
command orange, types yellow, keys blue, comments muted. On `bg` every one clears 4.5:1; blue and red
are nudged lighter to get there.

## Type

- **Source Serif 4** (variable, optical sizes) for prose and headings: a screen serif with a large
  x-height, so 19px reads easily on a dark ground, and optical sizing that tightens the headings by itself.
  Its small caps (the font's own) set labels and section heads.
- **Hack** for data. It is the face the terminal captures are drawn in, so a command on the page and the
  same command in a plate look alike. A subset, made by `scripts/fonts.sh`; its license is beside it.
- Inline mono at 0.87em shares the serif's x-height.

| Role                             | Size and line |
| -------------------------------- | ------------- |
| Prose                            | 19 / 32       |
| Lead                             | 24 / 32       |
| Page title (serif) / name (mono) | 40 / 48, 36   |
| UI: nav, captions, labels, rows  | 16 / 24       |
| Listings and commands            | 15 / 24       |

Phones step prose to 18 and titles to 32 and 28, on the same lines.

## Layout

- One column of 76rem at most, a 16px gutter on phones; prose holds a 42rem measure.
- Plugin and skill pages put the facts (where it runs, install, needs, files) in a rail beside the reading
  column from 72rem; below that they follow the lede. A plugin's video and stills span both columns.
- Commands wrap inside their frame rather than scroll, so the copy button and the whole command stay in
  view; listings scroll sideways inside themselves. Nothing scrolls the page sideways at 320px.
- A skill's `SKILL.md` is "What the agent reads": its description, then the body, behind a rule, a step
  smaller, after the human facts.

## The catalogue

- The component pages take a wider page (100rem) and a sidebar of components and stories, since
  their job is comparing two pictures.
- Two renders sit side by side while each keeps 33rem, a 70-column render at three quarters of its
  size; below that they stack, so the text in a render stays readable. A render is never enlarged.
- Status reads glyph then word: ✓ green, ~ yellow, ✗ red, ○ muted. A harness is its letter, π in
  purple and C in accent: lit when it has the thing, muted when not yet, struck when it cannot.
- Switches are text buttons; the pressed one is in text colour with the accent underline of the
  current nav entry.

## Motion

A plugin's demo plays, muted and looping, while it is on screen, only when the visitor has not asked for
reduced motion; a pause or seek by the visitor ends that. Nothing else moves.

## Rejected

Light mode, cards, pill badges, gradient text, icon sets, a hero with a call to action, a footer, and an
autoplaying video that ignores `prefers-reduced-motion`.
