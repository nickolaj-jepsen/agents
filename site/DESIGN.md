# Site design

How the site looks and why. `src/styles/site.css` holds the values; this file explains them, so a change
stays inside the system. It adapts the design notes of walldye.com, a wallpaper gallery
(`walldye/docs/site.md`), to a reference for terminal tools.

## Principles

- A reference, read in a terminal user's colours: the screen captures are the plates, and they carry the
  colour. Everything else is type, hairline rules and the page ground.
- One theme, dark: fireproof, the desktop's colour scheme. No light mode.
- Hairline rules instead of cards; no radius, no shadow, no tinted surface to mark state. Where a thing is
  an object or a control, a hairline frame marks it: a plate, a listing, a file, a panel, a switch, a tag.
- Every line box and vertical space is a multiple of the 8px unit (`--u`). Rules are 1px background
  gradients inside an existing padding, so they take no height. A plate's box rounds its height up to the
  unit (CSS `round()`), the picture at its top, so what follows stays on the grid.
- Identifiers are set as data: plugin and skill names, commands, paths and keys are mono.

## Colour

The theme's colours come from `~/nixos/modules/base/theme.nix`, mapped to the variables below in
`site.css`'s `:root`, which holds the values. Text is `fg`, `fg-alt` or `muted`, all 4.5:1 or better on
`bg` (12.0, 8.4 and 4.7). `muted` is for the least of it (counts, crumbs), never on a tinted ground.

| Role                      | Colour                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Page ground, plates, code | `bg`, which is the captures' own canvas                    |
| Headings, names           | `white` (`whiteAlt` in the theme)                          |
| Rules                     | `ui-alt`; masthead and section heads `ui-hi`               |
| Plate and listing frame   | `plate-edge`                                               |
| Link underline            | `link-line`, `ui-hi` nudged to 3:1                         |
| Accent                    | `accent`: focus ring, the current nav entry, the brand bar |
| Harness logos             | Claude Code `accent`, pi its own colours                   |
| In progress               | `yellow`: a framed tag, and a 2px rule on its notice       |

Code blocks sit on the page ground in a hairline frame, like the plates, and use a Shiki theme from the
same colours (`src/lib/fireproof.ts`), every one of its tokens clearing 4.5:1 on `bg`.

## Type

- **Source Serif 4** (variable, optical sizes) for prose and headings: a screen serif with a large
  x-height, so the prose size reads easily on a dark ground, and optical sizing that tightens the
  headings by itself. Its small caps (the font's own) set labels and section heads.
- **Hack** for data. It is the face the terminal captures are drawn in, so a command on the page and the
  same command in a plate look alike. A subset, made by `scripts/fonts.sh`; its license is beside it.
- Inline mono is sized to share the serif's x-height (`--mono-em`).

Each role has its own `--fs-*` var in `site.css`: prose, lead, the page title and a name, UI, and
listings and commands. Each sits on a line of `--u`, and phones get their own step of the same scale.

## Layout

- One column at most (`--wide`) with a gutter on phones (`--gutter`); prose holds `--measure`.
- Every page, the developer pages too, has the masthead at that width, and it stays at the top
  (`--mast`).
- A harness is its logo, never a letter: Claude Code's pixel mascot (thesvg.org, in `accent`) and pi's
  press-kit mark (pi.dev/press-kit, in its own colours). `Glyph.astro` draws both from one sprite in
  `Sprite.astro`. The harness switch (`HarnessSwitch.astro`) is one control wherever there is one: the
  home page's plugins and a plugin's gallery. The choice is remembered across them.
- The home page opens with a short plain lead, then the plugins as a grid of posters (name, harness
  logos, install, tagline), two across from 44rem. A harness switch narrows them to one harness, with
  its picture and install command, and then the skills follow as rows under a head per category. An
  in-progress plugin or skill keeps its place in its group, listed last, with its tag.
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
  in-progress notice), then a plugin's gallery, then the body. A rail sits beside the body from 64rem
  and stays in view under the masthead; below that it follows the body. A fact in the rail is its
  label over its value, one rule under the pair.
- A plugin's rail holds what it needs, the harnesses it runs in, each install command with its copy
  button, and the source. A skill's holds its files and source, then a contents list of its SKILL.md's
  headings, the one at the reading line (a third of the way down) marked in white with a 2px accent
  rule. Below 64rem the contents is left out.
- The pager ends the page: previous and next (a skill's within its category), and on a plugin page a
  way back to all plugins between them.
- A plugin's gallery is one stage and a strip of thumbnails: the demo first, then the stills, the caption
  under the stage, and a harness switch when both have media. The stage keeps the capture's shape,
  never passes 60vh and is never enlarged. It, its caption and the thumbnails share the column's left
  edge. A demo has the site's own control bar (play or pause, its time, a seek slider) instead of the
  browser's: shown on hover, on focus and while paused, always on touch. Without script the browser's
  controls remain, and every item shows, one under another.
- Commands wrap inside their frame rather than scroll, so the copy button and the whole command stay in
  view; listings scroll sideways inside themselves. Nothing scrolls the page sideways at 320px.
- A skill's header is followed by the facts a person looks for, from the skill's own data: how to
  invoke it, when the agent uses it (the description's "Use when" sentences), what it needs (its
  Requirements section).
- A skill's `SKILL.md` is "What the agent reads", framed as a file: a title bar with its path and a link
  to the source, the description, then the body, a step smaller. It shows its first screen faded into
  the page ground, then a full-width "Read all of SKILL.md (N lines)" / "Show less" button, and
  without script it is open. Opening never moves the page, closing brings the frame's top back into
  view, and a contents link or a link to a heading opens it first. "see X", where X is exactly one of
  its headings, is a link to it.

## The developer pages

- The developer pages keep the page's width. The sidebar sits in the column, its left edge under the
  masthead's brand, and the content takes the rest. Where the margin holds the whole sidebar and the
  gutter, it hangs there and the content is exactly the masthead's width; it never half-hangs. Below
  64rem the sidebar follows the page, and a framed menu at the top (the page's name, `▾`) lists the
  same pages.
- The sidebar is one plain list of the docs, nothing else, and no logos.
- `/dev/` is the overview: the lead, then "Read first", two lists side by side, the docs on this site
  (each with its opening paragraph held to two lines) and the repo's guides.
- The UI kit is not rendered as pages. Its components, and what each harness has of them, are
  `kit/catalog/COMPONENTS.md`; `/kit <component>` draws one in a session (`kit/README.md`).

## Motion

A plugin's demo plays, muted and looping, while it is on screen, and only when the visitor has not asked
for reduced motion. A pause or seek by the visitor ends that. Nothing else moves.

## Rejected

Light mode, cards, pill badges (tags are square), gradient text, icon sets, a hero with a call to
action, install commands on the home page, a footer, tinted surfaces for hover or state, keyboard
shortcuts beyond `f`, and an autoplaying video that ignores `prefers-reduced-motion`.
