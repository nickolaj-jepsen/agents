# site

The repo's reference on GitHub Pages, <https://nickolaj-jepsen.github.io/agents/>: a page per plugin and
skill, and the developer docs. Astro, with its own `package.json`, so none of it reaches `pkgs/agent-tools`
or `nix flake check`. How it looks, and why, is [DESIGN.md](DESIGN.md).

```bash
just site         # dev server at http://localhost:4321/agents/
just site-build   # site/dist, as the Pages workflow builds it
```

Both need the root's `node_modules` too: the pages read the repo through `scripts/content.ts`, which imports
the root's `yaml`.

## Where the pages come from

| Page                    | Source                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `/`                     | `docs/_intro.md`, `docs/_install.md`, and every plugin's and skill's     |
| `/plugins/<name>/`      | `plugins/<name>/README.md` (frontmatter and prose), `site/media/<name>/` |
| `/skills/<name>/`       | `skills/<name>/SKILL.md`                                                 |
| `/dev/`                 | `kit/catalog/catalog.json` and `site/media/kit/`, from `just catalog`    |
| `/dev/components/<id>/` | the same, a component with its stories inline                            |
| `/dev/<doc>/`           | `docs/<doc>.md`                                                          |

- Edit those, never the pages: `src/lib/content.ts` reads them with `scripts/content.ts`, the loader
  `README.md` is generated from.
- A relative link in a source resolves against its file: one to a plugin, skill or doc lands on its page,
  anything else in the repo on GitHub (`src/lib/markdown.ts`).
- `site/media/` is recorded, not committed: `just media` (in `nix develop .#media`, signed out) plays
  `e2e/<plugin>/site.scenarios.ts` and the kit's stories into it, and the Pages workflow does the same
  before it builds. Without it the pages build with no pictures. It is served at `/agents/media/` (the
  `media.json` files stay out); `astro.config.mjs` copies it into the build and serves it in dev.
- `AGENTS_ROOT=<dir> just site` reads the content from another copy of the repo, such as a fixture with
  media in it.
- The UI kit's catalogue is `/dev/` (the overview) and a page per component: its stories inline (side
  by side or stacked), each with its compatibility on a line that opens, and the props. Its data is generated (`kit/README.md`, The
  catalogue); the sticky bar's switches, the `f` key, the sidebar's marker for the story in view and
  whether two renders fit side by side are `src/client/catalog.ts`, and every page reads whole without
  them. The developer docs share its sidebar.
- A plugin page's media is one gallery (`src/components/Gallery.astro`, `src/client/gallery.ts`); the
  harness a visitor picks there, on the home page (`src/client/home.ts`) or in the catalogue is
  remembered for all of them (`src/client/prefs.ts`). They share `HarnessSwitch.astro`, and a harness's
  logo is `Glyph.astro`, drawn from the sprite in `Sprite.astro`.
- `scripts/fonts.sh` remakes the Hack subsets in `src/assets/fonts/`.

## Deploy

`.github/workflows/pages.yml` records the media in `nix develop .#media` (cached by a hash of what they
are made from), builds, and deploys to the `github-pages` environment, on every push to `main` that
touches the site or its sources. A recording that fails fails the deploy, and the live site stays as it
was. The repo's Pages source must be "GitHub Actions".
