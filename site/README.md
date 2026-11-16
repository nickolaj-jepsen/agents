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

| Page                   | Source                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `/`                    | `docs/_intro.md`, `docs/_install.md`, and every plugin's and skill's     |
| `/plugins/<name>/`     | `plugins/<name>/README.md` (frontmatter and prose), `site/media/<name>`  |
| `/skills/<name>/`      | `skills/<name>/SKILL.md`                                                 |
| `/dev/`, `/dev/<doc>/` | `docs/<doc>.md`                                                          |
| `/dev/components/...`  | `kit/catalog/catalog.json` and `site/media/kit/`, from `npm run catalog` |

- Edit those, never the pages: `src/lib/content.ts` reads them with `scripts/content.ts`, the loader
  `README.md` is generated from.
- A relative link in a source resolves against its file: one to a plugin, skill or doc lands on its page,
  anything else in the repo on GitHub (`src/lib/markdown.ts`).
- `site/media/` is served at `/agents/media/` (the `media.json` files stay out); `astro.config.mjs` copies
  it into the build and serves it in dev.
- `AGENTS_ROOT=<dir> just site` reads the content from another copy of the repo, such as a fixture with
  media in it.
- The UI kit's catalogue is a page per component (stories, compatibility, props) and per story
  (side by side, stacked or flipped). Its data is generated and committed (`kit/README.md`, The
  catalogue); the switches, filter and keys are `src/client/catalog.ts`, and every page reads whole
  without them.
- `scripts/fonts.sh` remakes the Hack subsets in `src/assets/fonts/`.

## Deploy

`.github/workflows/pages.yml` builds on every push to `main` that touches the site or its sources, and
deploys to the `github-pages` environment. The repo's Pages source must be "GitHub Actions".
