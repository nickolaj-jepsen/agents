# Development

## Set up and check a change

You need Node 24 (`.node-version`), pnpm (`corepack enable` gives you the version `packageManager` pins) and uv, which fetches the Python in `.python-version`. `nix develop` gives the same tools, and `direnv allow` loads that shell. Otherwise nix is only for recording site media, checking nix files and building the plugins the way CI publishes them.

```bash
pnpm install                  # every package's dependencies, from pnpm-lock.yaml
pnpm turbo run test           # specs for the libs, kits and build tools, and run-handoff's pytest; runs no agent
pnpm turbo run check-types    # tsc -b in each package
pnpm turbo run lint           # oxlint over the TypeScript sources
pnpm turbo run fmt            # format the checkout: oxfmt, and ruff for Python
pnpm gate                     # the gate CI runs
```

Run turbo through pnpm: it puts turbo on `PATH`. `fmt` leaves nix files alone; `nix fmt` formats them.

Turbo caches a task by its inputs, so a repeat run replays the output. CI writes a remote cache that local runs only read: `.envrc` sets `TURBO_CACHE=local:rw,remote:r`, and without direnv you export it yourself. To read the remote cache, run `turbo login` and `turbo link`, and set `TURBO_REMOTE_CACHE_SIGNATURE_KEY` to the key CI signs with. Without them every task runs on your machine.

## Layout

| Path          | What it holds                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/<name>` | A plugin: a Claude Code mod, a pi extension, or both. `apps/site` is the Astro site and no plugin.                                                                            |
| `lib/kits/`   | The UI kit, one package per component (`@agents/kit-<component>`), plus `core` (lines, tokens, painters), `legacy` and `catalog`. See [the kit guide](../lib/kits/README.md). |
| `lib/tools/`  | `build` (the bundler, manifests, README generator), `drive` (`pnpm drive`: real agents, screen tests, recordings) and `lint` (oxlint, oxfmt, shellcheck).                     |
| `skills/`     | Installable skills, one folder each with a `SKILL.md`.                                                                                                                        |
| `docs/`       | These pages. They feed the site's developer section; `_intro.md` and `_install.md` feed the root README.                                                                      |
| `pkgs/`       | Nix: how the apps are built, the recording environment, and the hash that pins the dependency fetch.                                                                          |

Everything under `apps/`, `lib/kits/` and `lib/tools/` is a pnpm workspace package with its own `turbo.json`, which holds the commands of the tasks it takes part in.

## Tasks

Use `pnpm gate` for the full local/CI gate; it runs only two Turbo tasks at a time because the E2E tasks each start their own session pools. Use `pnpm gate:all` on a Nix machine to run the gate and then the Nix checks, not in parallel.

Run focused tasks as `pnpm turbo run <task> --filter=<package>`. A per-package task runs in each package that defines it.

| Task                | What it covers                                                                                                                                                                                                                       | Cache key                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `build`             | Per app: bundle it into its gitignored `dist/`, in the shape Claude Code and pi load. At the root it also writes the generated files (README, `COMPONENTS.md`, the kit index in `AGENTS.md`), records the media and builds the site. | The package's sources and the kits and build tool it imports, less its tests, scenarios and README.              |
| `dev`               | `astro dev` for the site at http://localhost:4321/agents/. Reloads when a plugin README, skill, doc or kit manifest changes.                                                                                                         | Not cached.                                                                                                      |
| `test`              | Each package's vitest specs, and run-handoff's pytest. Runs no agent.                                                                                                                                                                | The package's sources and what it imports.                                                                       |
| `check-types`       | `tsc -b` per package. An app with a Claude half checks it too, against its `.claude-types/` snapshot (`tsconfig.claude.json`).                                                                                                       | The package, the root tsconfigs and its `types`.                                                                 |
| `types`             | Claude writes the mod API types only when it loads a mod. `drive types <app>` loads the build in a hermetic Claude and waits for them. Run it after a Claude Code upgrade.                                                           | The app's build and the `claude` version.                                                                        |
| `test:claude`       | `claude plugin validate --strict` and `claude plugin test` on an app's built mod, with the Claude Code the lockfile pins and a scratch `HOME`.                                                                                       | The app's build.                                                                                                 |
| `e2e`, `e2e:update` | One package's screen snapshots in real Claude Code and pi, compared or accepted (`drive test <package>`). See [snapshots](../lib/tools/drive/README.md#snapshots).                                                                   | `e2e`: the package's scenarios and snapshots, its build, and the kits and driver it imports. `e2e:update`: none. |
| `check`             | `pnpm gate` is the shared local/CI gate: the format check, `lint`, shellcheck and ruff, and per package `check-types`, `test`, `test:claude` and `e2e`.                                                                              | Its parts.                                                                                                       |
| `check:nix`         | `nix flake check`: the nix files, treefmt, and a nix build of every plugin. Run `pnpm gate:nix` separately; CI runs it only when its key misses.                                                                                     | The nix files, the lockfile, `pkgs/pnpm-deps.hash`, and the apps', kits' and build tool's sources.               |
| `fmt`, `lint`       | `oxfmt` and `ruff format`; `oxlint --deny-warnings`. `lint:py`, `lint:sh` and `fmt:check` are the parts `check` runs.                                                                                                                | `lint` and the checks: the sources they read. `fmt`: none.                                                       |
| `media`             | The pictures and demos the site shows, recorded in `nix run .#media`; `media:vscode` is a package's VS Code pictures. See [site media](../lib/tools/drive/README.md#site-media).                                                     | The package's scenarios, its build, what it imports and the recording environment (`//#media-env`).              |
| `readme`            | Write the root `README.md` from the plugin READMEs, skill frontmatter, `docs/_intro.md` and `docs/_install.md`.                                                                                                                      | Not cached.                                                                                                      |
| `catalog:docs`      | Write `lib/kits/catalog/COMPONENTS.md` and the kit index in `AGENTS.md` from the kit manifests.                                                                                                                                      | The kits' sources and `AGENTS.md`.                                                                               |
| `skills:refresh`    | Refresh the upstream manuals in the agent-plugin-dev skill. `-- vMAJOR.MINOR.PATCH` picks the pi docs' release.                                                                                                                      | Not cached.                                                                                                      |
| `kit-new`           | `-- <name>` scaffolds a kit component; see [the kit guide](../lib/kits/README.md#add-or-change-a-component).                                                                                                                         | Not cached.                                                                                                      |

A session of an agent is not a turbo task: turbo stops what a task leaves running, and `goto` would park nothing. `pnpm drive live` replays a scenario in your terminal, and `pnpm drive goto` parks one that `pnpm drive terminal` (a claude or pi session, through the tui-test CLI the repo pins) and drive's own verbs (a VS Code session) drive from separate commands; see [the driver's guide](../lib/tools/drive/README.md#drive-a-parked-session).

## Try the answer form

```bash
pnpm install                                        # prepare a new checkout
pnpm drive ls answer                                # list saved screens
pnpm drive live answer open --harness claude        # try a Claude card; Ctrl+] stops the replay
pnpm drive live answer cards-open --harness pi      # try the pi version; Ctrl+] stops the replay
pnpm drive live answer form --harness vscode --watch --in-place  # visible window, reload plugin edits without restarting
```

The replay stops on a question card and hands you the controls. Pick an option or resize the window. See [the driver's guide](../lib/tools/drive/README.md) to write scenarios, take pictures or update snapshots.

## Change or add a plugin

Each directory under `apps/` is a Claude Code mod, a pi package, or both. To add one, copy a small app such as `apps/docfix`, rename it, then:

```bash
pnpm install                                  # link the new package and update pnpm-lock.yaml
pnpm turbo run build --filter=<package>       # bundle it into apps/<name>/dist/
pnpm turbo run types --filter=<package>       # a Claude half: write the mod API types the editor and tsc read
pnpm drive live <name> <scenario> --watch     # look at it in a real session
```

`dist/` is gitignored and holds what Claude Code and pi load ([`lib/tools/build/build.ts`](../lib/tools/build/build.ts) says what goes where). The tests and the screen scenarios run on it.

| Location                                    | What goes there                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                              | The pi manifest (`pi`), the Claude manifest (`claude`: the build writes `.claude-plugin/plugin.json` and `hooks/hooks.json` from it) and the dependencies.                                                                 |
| `src/claude.ts`, `src/claude.tsx`           | The mod: the file with the `on(...)` calls. The build bundles it with the kit and `src/lib` into `dist/register.js`. Its other files are in `src/claude/`, with the self-contained `types.d.ts` that `claude.types` names. |
| `src/claude.test.ts`, `src/claude.test.tsx` | The mod's tests, for `claude plugin test`; bundled into `dist/claude.test.ts`.                                                                                                                                             |
| `src/lib/`                                  | Shared logic with no Node or DOM APIs: oxlint bans `node:` imports and Node globals here and in the mod. Put Vitest specs next to it.                                                                                      |
| `src/pi.ts`, `src/pi/`                      | The pi extension entry, which `pi.extensions` names, and its files. Set `"agentTools": { "subagents": true }` in `package.json` if subagents should load it.                                                               |
| `src/e2e/`                                  | The scenarios (`claude.scenarios.ts`, `pi.scenarios.ts`, `vscode.scenarios.ts`, `site.scenarios.ts`), fixtures and `__snapshots__`. See [writing a scenario](../lib/tools/drive/README.md#write-a-scenario).               |
| `tsconfig.json`, `tsconfig.claude.json`     | `tsconfig.json` extends `tsconfig.base.node.json` and leaves the Claude half out. `tsconfig.claude.json` covers that half and extends the `.claude-types/` snapshot from `drive types`.                                    |
| `turbo.json`                                | The commands of the tasks the package takes part in: `build`, `test`, `test:claude`, `e2e`, `e2e:update`, `types`, `check-types`, `media`, `media:vscode`. Copy them from an existing app and change the name.             |
| `README.md`                                 | The public plugin page. Include `tagline`, `featured` and `order` frontmatter. `requires` lists prerequisites when there are any; `status: in-progress` adds a notice and moves the plugin to the end.                     |

For a Claude half, also list the app in [the marketplace](../.claude-plugin/marketplace.json) as a `git-subdir` source on the `dist` branch (see the existing entries). Its other entry, `skills`, discovers `skills/` without a per-skill list. The invariants spec in `lib/tools/build/` fails when the list and the plugins disagree.

- A `claude.hooks` object in `package.json` is written to `hooks/hooks.json` beside the module; the manifest's own `hooks` field is for settings-style hooks, not modules. The mod engine accepts no symlinks.
- Declare dependencies in `package.json`. `"catalog:"` takes the versions `pnpm-workspace.yaml` states once: `typescript`, `@types/node`, `tsdown`, `vitest` for specs, `@anthropic-ai/claude-code` for a Claude half. The kit packages an app imports (`@agents/kit-card`, ...), `@agents/build` and `@agents/drive` are `workspace:*` devDependencies. The kits are bundled, so a kit change rebuilds and retests the apps that use it.
- A top-level function that takes `$` (`open($)`) collides with any `let open = ...` in the bundle, the kit's included: the engine's check that a function handed `$` is not assigned to elsewhere does not understand scopes, and a bundle is one scope. `claude plugin validate` fails the `test:claude` task on it. Name such a function for what it does (`openForm`).
- To run an app's specs, add a `vitest.config.ts` that includes `src/lib/**/*.spec.ts` and give `test` its command in `turbo.json`, `["./node_modules/.bin/vitest", "run"]`, as the other apps do. Name the tool by path: turbo's `PATH` holds only the root's `node_modules/.bin`, which has turbo alone.
- In pi, import the [shared UI kit](../lib/kits/README.md) as packages (`@agents/kit-core/paint/pi.ts`); the build bundles them into the extension. List the packages pi ships as `peerDependencies` with `"*"` and as catalog `devDependencies` for the type-check and specs, never as `dependencies`: pi supplies them (and TypeBox) at runtime, and the build leaves them out. Import `Type` from `typebox`, not from pi-ai. Read settings inside an event or tool, not the extension factory.
- Try new slash commands in a real session. Claude can refuse a name that conflicts with a built-in or skill even when validation and tests pass. See the [Claude guide](../skills/agent-plugin-dev/references/claude.md) if a wrapper prevents `claude plugin test` from running.

## Publish a skill

Put the instructions in `skills/<name>/SKILL.md`. Set `metadata.summary` and pick a `metadata.category` from [the content loader](../lib/tools/build/content.ts). The site uses `argument-hint` for invocation help and takes the "Needs" list from bullets under `## Requirements` if present.

To validate frontmatter, copy `skills/` into a temporary plugin directory and run `claude plugin validate --strict --json <dir>`. Don't symlink the skills.

`check` lints a skill's scripts too: ruff for Python and shellcheck, at warning level, for shell. `fmt` formats the Python. A script folder with a `pyproject.toml` and tests joins the uv workspace (`skills/run-handoff/scripts` is the first); add its path to `members` in the root `pyproject.toml`.

## Build, publish and use the plugins with nix

Nix builds each app with the same bundler as `pnpm turbo run build` (`pkgs/plugin-apps.nix`), so `nix build .#<app>` is that app's `dist/`, and `nix build .#plugins` holds them all, one `<name>/` folder each. The dependencies come from one fixed-output fetch whose hash is in `pkgs/pnpm-deps.hash`. It covers the apps, the kit packages they import, the build tool and the root's own dependencies (turbo); a lockfile bump that touches only the site, the drive tool or the linters leaves it alone.

When `pnpm-lock.yaml` changes the hash, `nix run .#update-deps-hash` rewrites it, and `check:nix` fails with that advice while it is stale. On Dependabot's npm PR, [`update-deps-hash.yml`](../.github/workflows/update-deps-hash.yml) pushes the new hash to the branch and starts `ci.yml` on it, because a push made with the workflow's own token starts no workflow. A `DEPS_HASH_TOKEN` secret (a personal access token or App token) makes the push start CI itself. Dependabot opens one PR per ecosystem (nix, npm, uv) on the 1st and 15th.

On every push to `main`, after `CI gate` passes, the `publish` job of [`ci.yml`](../.github/workflows/ci.yml) builds `.#plugins` and appends one commit with the result to the `dist` branch ([`publish-dist.sh`](../.github/publish-dist.sh)); it creates the branch when it is missing, never force-pushes, and commits nothing when the build is unchanged. The marketplace entries are `git-subdir` sources on that branch, so a Claude install gets a built plugin, not the app's source. The `skills` entry stays `./` on `main`.

| Entry                                                   | What you get                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages.<system>.<name>`, `packages.<system>.plugins` | A plugin's build, and all of them (`<name>/`).                                                                                                |
| `lib.plugins`                                           | Map by plugin name; entries have `claude`, `pi` and `subagents`. Their `path` throws: a build belongs to a system, which `lib` does not know. |
| `lib.pluginsFor pkgs`                                   | `lib.plugins` with `path` set to the app built for `pkgs.stdenv.hostPlatform.system`: a store path, the folder pi loads as a package.         |
| `lib.skills`                                            | Map from name to skill directory.                                                                                                             |
| `lib.mkClaudePlugin { pkgs; claude-code; } <name>`      | One Claude half, validated (`--strict`) and tested with the supplied Claude Code.                                                             |
| `apps.media`, `apps.update-deps-hash`                   | `nix run .#media -- <command>` runs a command in the recording environment; `nix run .#update-deps-hash` refreshes the pinned hash.           |

The repo's own checks run in turbo, not nix: Claude Code and pi are the versions `pnpm-lock.yaml` pins. `nix flake check` (`check:nix`) builds every plugin and runs each Claude half through `lib.mkClaudePlugin` with nixpkgs' `claude-code`. A consumer's flake that sets `inputs.agents.inputs.nixpkgs.follows` builds with its own nixpkgs: if its `pnpm_12` fetches differently, `agents-pnpm-deps` fails with a hash mismatch, and the answer is to drop the `follows` for `agents`. Marketplace installs aren't checked against your local Claude version.

Stage new files before running nix commands; otherwise Nix won't see them.

## Preview the published site

```bash
pnpm turbo run dev --filter=@agents/site     # serve http://localhost:4321/agents/
pnpm turbo run build --filter=@agents/site   # build the static site in apps/site/dist
pnpm turbo run readme                        # regenerate the GitHub README after changing its inputs
```

Edit plugin READMEs, skill files and `docs/*.md`, not the generated pages. Developer pages take their title from the first `#` heading and their URL from the filename. `docs/_intro.md` feeds the site and the GitHub README; `docs/_install.md` feeds only the README. If the images are missing, see [recording site media](../lib/tools/drive/README.md#site-media): the site builds without them.

Astro reads the repo itself: the content loaders in `apps/site/src/loaders/` build collections from the plugin READMEs, skills, docs, marketplace, the kits and whatever media is under `apps/site/media/`, and `astro dev` reloads them when a source file changes. They warn about media that is missing and never fail on it. Pages read the collections and import only types from `lib/` (oxlint enforces it; only `src/content.config.ts` and `src/loaders/` import code from there). The committed generated files (`README.md`, `lib/kits/catalog/COMPONENTS.md` and the kit index in `AGENTS.md`) are written by `pnpm turbo run build`, which the freshness specs name. The Pages workflow deploys from `main`; set the repository's Pages source to **GitHub Actions**.
