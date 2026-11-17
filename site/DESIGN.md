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
  the developer pages too, has the masthead at that width, and it stays at the top (`--mast`), except
  on a page with the catalogue's sticky bar: there the masthead scrolls away and the bar takes the top.
- A harness is its logo (`Glyph.astro`, drawn from one sprite in `Base.astro`) in its colour, never a
  letter: Claude Code's pixel mascot (thesvg.org, in `accent`) and pi's press-kit mark (pi.dev/press-kit, in its own colours). The harness switch (`HarnessSwitch.astro`)
  is one control wherever there is one: the home page's plugins, a plugin's gallery, the catalogue's
  sticky bar. The choice is remembered across them.
- The home page is one plain sentence, then the plugins as a two-column grid of posters (name, harness
  logos, install, tagline) under a harness switch that narrows them to one harness, with its picture and
  install command, then the skills as rows under a head per category. An in-progress plugin or
  skill keeps its place in its group, listed last, with its tag.
- A poster is a plate (a 1px `uiAlt` frame on the capture's own ground) holding a crop of the capture:
  the part that shows the plugin (its pane, form, menu or result), at about its own size so the
  terminal text reads, never enlarged. The crops, and a different still where the demo's poster shows
  nothing, are in `src/lib/posters.ts`, in the capture's pixels; a plugin without one shows its whole
  capture. Every plate has one shape, the crop centred in it, so a row of posters lines up. A crop is
  tied to the recording: when a capture's layout changes, check its crop.
- A section head wraps: below 40rem the harness switch goes under the heading.
- Where the pointer hovers, a skill row's install button shows only while the row is hovered, has
  focus within or has its panel open (by opacity, so it stays focusable); on touch it is always shown.
- A harness logo sits centred in a fixed box, so Claude Code's wide mark and pi's square one stand
  evenly beside a name and share its centre line.
- Install is a small framed button (`install ▾`) that opens a panel of commands, one per harness, each
  with its copy button; other ways sit behind "More ways". The same control on the home page and in a
  page's header.
- Plugin and skill pages read top to bottom: the header (name, tagline, harness, install, the
  in-progress notice), then a plugin's gallery, then the body with a rail beside it from 64rem that
  stays in view (under the masthead); below that the rail follows the body. A fact in the rail is its
  label over its value, one rule under the pair. A plugin's rail: what it needs, the harnesses it runs
  in, each install command with its copy button, the source. A skill's: its files and source, then a
  contents list of its SKILL.md's headings, the one at the reading line (a third of the way down)
  marked in white with a 2px accent rule; below 64rem the contents is left out.
- The pager ends the page: previous and next (a skill's within its category), and on a plugin page a
  way back to all plugins between them.
- A plugin's gallery is one stage and a strip of thumbnails: the demo first, then the stills, the caption
  under the stage, and a harness switch when both have media. The stage keeps the capture's shape,
  never passes 60vh and is never enlarged; it, its caption and the thumbnails share the column's left
  edge. A demo has the site's own control bar (play or pause, its time, a seek slider) instead of the
  browser's: shown on hover, on focus and while paused, always on touch; without script the browser's
  controls remain, and every item shows, one under another.
- Commands wrap inside their frame rather than scroll, so the copy button and the whole command stay in
  view; listings scroll sideways inside themselves. Nothing scrolls the page sideways at 320px.
- A skill's header is followed by the facts a person looks for, from the skill's own data: how to
  invoke it, when the agent uses it (the description's "Use when" sentences), what it needs (its
  Requirements section).
- A skill's `SKILL.md` is "What the agent reads", framed as a file: a title bar with its path and a link
  to the source, the description, then the body, a step smaller. It shows its first screen faded into
  the page ground, then a full-width "Read all of SKILL.md (N lines)" / "Show less" button; without
  script it is open. Opening never moves the page; closing brings the frame's top back into view; a
  contents link or a link to a heading opens it first. "see X", where X is exactly one of its headings,
  is a link to it.

## The catalogue

- The developer pages keep the page's width. The sidebar sits in the column, its left edge under the
  masthead's brand, and the content takes the rest; where the margin holds the whole sidebar and the
  gutter, it hangs there and the content is exactly the masthead's width. It never half-hangs. Below
  64rem the sidebar follows the page, and a framed menu at the top (the page's name, `▾`) lists the
  same pages.
- The sidebar is two plain lists, the components and the docs, nothing else, and no logos: the current
  component opens into its stories and, last, its props; the one filling the screen (whose heading is
  above a third of the way down) is marked as the page scrolls. Which harness has what is the
  overview's table; the repo's other guides are listed there too.
- `/dev/` is the overview, with no switch: the lead, then "Read first", two lists side by side (the
  docs on this site, each with its opening paragraph held to two lines; the repo's guides), then the
  UI kit: a line saying how to read it and where it comes from, and a table of components. A row is
  the component (name, purpose) and a cell per harness, headed by its logo: the exports, then the
  feature counts (no zeros) and the stories drawn; or ✗ Not possible and why. On a phone each row is
  a block, each cell naming its harness. A component's page is its name and purpose, one
  line of summary (the kit in both harnesses whichever is shown, the counts, a way to the props), then
  one sticky bar (the harness switch, terminal size) that applies to everything under it. On a phone
  the bar scrolls away.
- The harness switch is Both, Claude Code, pi. Both shows the two renders one above the other; there
  is no side by side, so a render is never shrunk to fit a pair. The key `f` moves between the two.
  A switch never moves the page under the reader: the render at the reading line (a third of the way
  down) keeps its place, and when it is switched away the other harness's render of that story takes
  it, so `f` flips one render for the other to compare them.
- The size switch greys out (and strikes) a size no harness on screen was drawn at. A render shows its
  size at the end of its title bar, yellow when it is the nearest to the size chosen, and one note in
  the bar says which harnesses fell back; never a warning per render.
- A story's features are open on the page, never folded: each one's name (left out when it is the
  story's own line), then a line per harness: its logo, the answer in a word (✓ Yes, ~ Partly, ✗ No,
  ○ Not yet) and, under it, how or why not. Each logo sits centred in one box as tall as the line, so
  the logos, glyphs and words line up, a missing harness's line too. No "differs" flag: a ✗ beside a ✓ says it. Features no story shows close the stories,
  the same way. There is no compatibility table.
- A render is a terminal window: a bright frame, a title bar a step off the page (the harness's logo,
  what was drawn, its size), and the capture inside a 1u margin of its own canvas, so it reads as an
  object among the page's hairlines.
- A render is at its own size, scrolling sideways inside its frame where it is wider than the column.
  It is never enlarged or shrunk.
- A harness with no render of a story is one line (its logo, name and why), not an empty frame. The
  story's name and line always head it, across the column; where the widest render leaves 18rem, that
  line and the features stand beside the renders, else they follow them. A frame is as wide as its
  render: a long title bar wraps inside it.
- Props are one harness after the other, across the column; a row puts the name and type beside what
  it is from 64rem. A list whose rows have no descriptions is one line.
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
