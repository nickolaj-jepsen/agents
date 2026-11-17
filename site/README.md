# site

The site is the repo's reference on GitHub Pages, <https://nickolaj-jepsen.github.io/agents/>: a page
per plugin and skill, and the developer docs. It is built with Astro and has its own `package.json`,
so none of it reaches `pkgs/agent-tools` or `nix flake check`. How it looks, and why, is
[DESIGN.md](DESIGN.md).

```bash
just site         # dev server at http://localhost:4321/agents/
just site-build   # site/dist, as the Pages workflow builds it
```

Both write `data/content.json` first: `npm run site-data` runs the repo's content loader
(`scripts/content.ts`, which imports the root's `yaml`), and the pages read that file as data. So a
site build needs the root only to make the model: `cd site && npm run build` reads nothing outside
`site/`. Re-run `just site` to see a freshly recorded demo or a new README.

## Where the pages come from

| Page                    | Source                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `/`                     | `docs/_intro.md`, `docs/_install.md`, each plugin's install and tagline, each skill's summary |
| `/plugins/<name>/`      | `plugins/<name>/README.md` (frontmatter and prose), `site/media/<name>/`                      |
| `/skills/<name>/`       | `skills/<name>/SKILL.md`                                                                      |
| `/dev/`                 | `kit/catalog/catalog.json` and `site/media/kit/`, from `just catalog`                         |
| `/dev/components/<id>/` | the same, a component with its stories inline                                                 |
| `/dev/<doc>/`           | `docs/<doc>.md`                                                                               |

- Edit those sources, never the pages. `just site` loads them into `data/content.json` with
  `scripts/content.ts`, the loader the root `README.md` is generated from, and `src/lib/content.ts`
  reads that file and nothing else.
- A relative link in a source resolves against its file: one to a plugin, skill or doc lands on its page,
  anything else in the repo on GitHub (`src/lib/markdown.ts`).
- `site/media/` is recorded, not committed. `just media` (in `nix develop .#media`, signed out)
  plays `e2e/<plugin>/site.scenarios.ts` and the kit's stories into it, and the Pages workflow does
  the same before it builds. Without it the pages build with no pictures. It is served at
  `/agents/media/` (the `media.json` files stay out); `astro.config.mjs` copies it into the build and
  serves it in dev.
- `AGENTS_ROOT=<dir> just site` reads the content from another copy of the repo, such as a fixture with
  media in it.
- The UI kit's catalogue is `/dev/` (the overview) plus a page per component. A component's page
  holds its stories inline, each with what each harness does of its features, and the props. Its data
  is generated (`kit/README.md`, The catalogue). The behaviour lives in `src/client/catalog.ts`: the
  sticky bar's switches, the `f` key, the sidebar's marker for the story in view, and whether a
  story's text fits beside its renders. Every page still reads completely without it. The developer
  docs share its sidebar.
- A plugin page's media is one gallery (`src/components/Gallery.astro`, `src/client/gallery.ts`). The
  harness a visitor picks there, on the home page (`src/client/home.ts`) or in the catalogue is
  remembered for all of them (`src/client/prefs.ts`). All three share `HarnessSwitch.astro`. A
  harness's logo is `Glyph.astro`, drawn from the sprite in `Sprite.astro`.
- `scripts/fonts.sh` remakes the Hack subsets in `src/assets/fonts/`.

## Deploy

`.github/workflows/pages.yml` records the media, builds and deploys on a push to `main` that touches the
site or its sources, one deploy at a time. The repo's Pages source must be "GitHub Actions".
