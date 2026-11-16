# Site design

How the site looks and why. `src/styles/site.css` holds the values; this file explains them, so a change
stays inside the system. It adapts walldye's (`walldye/docs/site.md`) to a reference for terminal tools.

## Principles

- A reference, read in a terminal user's colours: the screen captures are the plates, and they carry the
  colour. Everything else is type, hairline rules and the page ground.
- One theme, dark: fireproof. No light mode.
- Hairline rules instead of cards; no radius, no shadow, no tinted surface to mark state. Where a thing is
  an object or a control, a hairline frame marks it: a plate, a listing, a file, a panel, a switch, a tag.
- Every line box and vertical space is a multiple of the 8px unit (`--u`). Rules are 1px background
  gradients inside an existing padding, so they take no height. A plate's box rounds its height up to the
  unit (CSS `round()`), the picture at its top, so what follows stays on the grid.
- Identifiers are set as data: plugin and skill names, commands, paths and keys are mono.

## Colour

Fireproof, from `~/nixos/modules/base/theme.nix`. Text is `fg`, `fg-alt` or `muted`, all 4.5:1 or better on
`bg` (12.0, 8.4 and 4.7). `muted` is for the least of it (counts, crumbs), never on a tinted ground.

| Role                      | Colour                                               |
| ------------------------- | ---------------------------------------------------- |
| Page ground, plates, code | `bg` #1C1B1A, which is the captures' own canvas      |
| Headings, names           | `whiteAlt` #F2F0E5                                   |
| Rules                     | `uiAlt`; masthead and section heads `ui-hi` #575653  |
| Plate and listing frame   | `uiAlt` #403E3C                                      |
| Link underline            | #676764, `ui-hi` nudged to 3:1                       |
| Accent #CF6A4C            | focus ring, the current nav entry, the brand bar     |
| Harness logos             | Claude Code `accent`, pi its own colours             |
| In progress               | `yellow`: a framed tag, and a 2px rule on its notice |

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

- One column of 76rem at most, a 16px gutter on phones; prose holds a 42rem measure. Every page,
  the developer pages too, has the masthead at that width.
- A harness is its logo (`Glyph.astro`, drawn from one sprite in `Base.astro`) in its colour, never a
  letter: Claude Code's pixel mascot (thesvg.org, in `accent`) and pi's press-kit mark (pi.dev/press-kit, in its own colours). The harness switch (`HarnessSwitch.astro`)
  is one control wherever there is one: the home page's plugins, a plugin's gallery, the catalogue's
  sticky bar. The choice is remembered across them.
- The home page is one plain sentence, then the plugins as a two-column grid of posters (name, harness
  logos, install, tagline) under a harness switch that narrows them to one harness, with its picture and
  install command, then the skills as rows under a head per category. An in-progress plugin or
  skill keeps its place in its group, listed last, with its tag.
- Install is a small framed button (`install ▾`) that opens a panel of commands, one per harness, each
  with its copy button; other ways sit behind "More ways". The same control on the home page and in a
  page's header.
- Plugin and skill pages read top to bottom: the header (name, tagline, harness, install, the
  in-progress notice), then a plugin's gallery across the column, then the body with a rail of facts
  (needs, files, source) beside it from 64rem; below that the rail follows the body.
- A plugin's gallery is one stage and a strip of thumbnails: the demo first, then the stills, the caption
  under the stage, and a harness switch when both have media. A still opens at its actual size in a
  dialog. Without script every item shows, one under another.
- Commands wrap inside their frame rather than scroll, so the copy button and the whole command stay in
  view; listings scroll sideways inside themselves. Nothing scrolls the page sideways at 320px.
- A skill's `SKILL.md` is "What the agent reads", framed as a file: a title bar with its path and a link
  to the source, the description, then the body, a step smaller.

## The catalogue

- The developer pages keep the page's width. The sidebar (the components, the current one's stories
  under it as anchors, the docs, the repo's other guides) hangs in the margin to the left of the column
  as far as the screen has margin, and the content takes the rest: on a wide screen it is exactly the
  masthead's width, on a narrow one it is indented by what did not fit; below 64rem the sidebar follows.
- `/dev/` is the overview. A component's page is its name and purpose, one line of summary (the kit in
  each harness, the counts, a way to the props), then one sticky bar (the harness switch, terminal size,
  actual size) that applies to everything under it: the stories, then the props. On a phone the bar
  scrolls away.
- The harness switch is also the layout: Side by side and Stacked show both harnesses (for the stories
  and the props alike), Claude Code and pi show one alone. The key `f` moves between the two.
- A story's compatibility is one line under its renders (the features it shows), which opens into what
  each harness does and the caveat. There is no separate compatibility table.
- A render is a terminal window: a bright frame and a title bar a step off the page, with the harness's
  logo and what was drawn, so it reads as an object among the page's hairlines.
- Two renders sit side by side while each keeps 32rem, a 70-column render at about three quarters of
  its size; below that they stack, so the text in a render stays readable. A render is never enlarged.
- Status reads glyph then word: ✓ green, ~ yellow, ✗ red, ○ muted. A harness is its logo: lit when it
  has the thing, muted when not yet, struck when it cannot.
- Switches are a hairline row of buttons; the pressed one is in white with a 2px accent rule under it. A
  toggle is the same box alone.
- The pages are for the mouse. The one key is `f`, which switches the harness.

## Motion

A plugin's demo plays, muted and looping, while it is on screen, only when the visitor has not asked for
reduced motion; a pause or seek by the visitor ends that. Nothing else moves.

## Rejected

Light mode, cards, pill badges (tags are square), gradient text, icon sets, a hero with a call to
action, install commands on the home page, a footer, tinted surfaces for hover or state, keyboard
shortcuts beyond `f`, and an autoplaying video that ignores `prefers-reduced-motion`.
