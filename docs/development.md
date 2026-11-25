# Development

## Set up and check a change

You need Node 24 (`.node-version`), pnpm (`corepack enable` gives you the version `packageManager` pins) and uv, which fetches the Python in `.python-version`. `nix develop` gives the same tools, and `direnv allow` loads that shell. Claude Code comes from this flake's pinned nixpkgs (currently 2.1.330): use `nix develop` for Claude tests and `drive`, or `nix develop -c pnpm gate` for the full gate. The shell exports `CLAUDE_BIN` to the exact store binary; outside it, hermetic drive and plugin tests require an explicit `CLAUDE_BIN` (use an immutable, version-specific path so Turbo can hash the pin). They fail rather than silently using a different Claude on PATH. Pi still comes from pnpm. Nix also records site media, checks nix files and builds the plugins the way CI publishes them.

```bash
pnpm install                  # every package's dependencies, from pnpm-lock.yaml
pnpm hooks                    # run the fast checks before each commit; once per checkout
pnpm turbo run test           # specs for the libs, kits and tools, and the pytest suites; runs no agent
pnpm turbo run check-types    # tsc -b in each package
pnpm turbo run lint           # oxlint over the TypeScript sources
pnpm turbo run fmt            # format the checkout: oxfmt, and ruff for Python
pnpm gate                     # the gate CI runs
pnpm gate:pages               # the other half of CI: the recordings and the site, which only a push to main checks
```

Run turbo through pnpm: it puts turbo on `PATH`. `fmt` leaves nix files alone; `nix fmt` formats them.

Turbo caches a task by its inputs, so a repeat run replays the output. CI writes a remote cache that local runs only read: `.envrc` sets `TURBO_CACHE=local:rw,remote:r`, and without direnv you export it yourself. To read the remote cache, run `turbo login` and `turbo link`, and set `TURBO_REMOTE_CACHE_SIGNATURE_KEY` to the key CI signs with. Without them every task runs on your machine.

A local run never writes the remote cache, so CI re-runs what you ran; what CI has run comes back to you. That makes the remote cache CI's record of an environment it built, which is why a task that passed on a machine with a tool the runner lacks cannot make CI skip it. `pnpm hooks` sets `core.hooksPath` to `.githooks`, so a commit runs the fast half of the gate (the format check, lint, shellcheck, ruff and pytest) in about half a minute; `git commit --no-verify` skips it. That half cannot catch what only the screen tests or the recordings see, so a change to a scenario, a plugin's UI or the site wants `pnpm gate` and `pnpm gate:pages` before the push, not the commit.

## Layout

| Path          | What it holds                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/<name>` | A plugin: a Claude Code mod, a pi extension, or both. `apps/site` is the Astro site and no plugin.                                                                                                                                                                                              |
| `lib/kits/`   | The UI kit, one package per component (`@agents/kit-<component>`), plus `core` (lines, tokens, painters), `legacy` and `catalog`. See [the kit guide](../lib/kits/README.md).                                                                                                                   |
| `lib/tools/`  | `build` (the bundler, manifests, README generator), `drive` (`pnpm drive`: real agents, screen tests, recordings), `lint` (oxlint, oxfmt, shellcheck) and `updates` (the `agents` publication CLI, its refresh helper and pi's reload bridge; see [its guide](../lib/tools/updates/README.md)). |
| `skills/`     | Installable skills, one folder each with a `SKILL.md`.                                                                                                                                                                                                                                          |
| `docs/`       | These pages. They feed the site's developer section; `_intro.md` and `_install.md` feed the root README.                                                                                                                                                                                        |
| `pkgs/`       | Nix: how the apps are built, the recording environment, and the hash that pins the dependency fetch.                                                                                                                                                                                            |

Everything under `apps/`, `lib/kits/` and `lib/tools/` is a pnpm workspace package with its own `turbo.json`, which holds the commands of the tasks it takes part in. A package with a Python half also holds a `pyproject.toml` that is a member of the root's uv workspace, in a subdirectory (`lib/tools/updates/python`); turbo runs that member as a package of its own.

## Tasks

Use `pnpm gate` for the full local/CI gate; it runs only two Turbo tasks at a time because the E2E tasks each start their own session pools. Each pool is sized from the cores, to at most 2 Claude and 4 pi sessions; on a machine that is already loaded, `DRIVE_JOBS=1 pnpm gate` (or `claude=1,pi=2`) keeps the gate out of the memory pressure that gets build and test workers killed. Use `pnpm gate:all` on a Nix machine to run the gate, the Nix checks and the Pages half, not in parallel. `pnpm gate:pages` is the Pages half alone.

Run focused tasks as `pnpm turbo run <task> --filter=<package>`. A per-package task runs in each package that defines it.

| Task                | What it covers                                                                                                                                                                                                                                                       | Cache key                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `build`             | Per app: bundle it into its gitignored `dist/`, in the shape Claude Code and pi load. At the root it also writes the generated files (README, `COMPONENTS.md`, the kit index in `AGENTS.md`), records the media and builds the site.                                 | The package's sources and the kits and build tool it imports, less its tests, scenarios and README.              |
| `dev`               | `astro dev` for the site at http://localhost:4321/agents/. Reloads when a plugin README, skill, doc or kit manifest changes.                                                                                                                                         | Not cached.                                                                                                      |
| `test`              | Each package's vitest specs, and the pytest suite of every uv workspace member (`run-handoff`, `agents-updates`). Runs no agent.                                                                                                                                     | The package's sources and what it imports.                                                                       |
| `check-types`       | `tsc -b` per package. An app with a Claude half checks it too, against its `.claude-types/` snapshot (`tsconfig.claude.json`).                                                                                                                                       | The package, the root tsconfigs and its `types`.                                                                 |
| `types`             | Claude writes the mod API types only when it loads a mod. `drive types <app>` loads the build in a hermetic Claude and waits for them. Run it after a Claude Code upgrade.                                                                                           | The app's build and the `claude` version.                                                                        |
| `test:claude`       | `claude plugin validate --strict` and `claude plugin test` on an app's built mod, with the flake's Claude Code (`CLAUDE_BIN`) and a scratch `HOME`.                                                                                                                  | The app's build.                                                                                                 |
| `e2e`, `e2e:update` | One package's screen snapshots in real Claude Code and pi, compared or accepted (`drive test <package>`). See [snapshots](../lib/tools/drive/README.md#snapshots).                                                                                                   | `e2e`: the package's scenarios and snapshots, its build, and the kits and driver it imports. `e2e:update`: none. |
| `check`             | `pnpm gate` is the shared local/CI gate: the format check, `lint`, shellcheck and ruff, and per package `check-types`, `test`, `test:claude` and `e2e`.                                                                                                              | Its parts.                                                                                                       |
| `check:nix`         | `nix flake check`: the nix files, treefmt, and a nix build of every plugin. Run `pnpm gate:nix` separately; CI runs it only when its key misses.                                                                                                                     | The nix files, the lockfile, `pkgs/pnpm-deps.hash`, and the apps', kits' and build tool's sources.               |
| `check:pages`       | `pnpm gate:pages`: every recording (each package's `media` and `media:vscode`) and the site built from them, which is what `pages.yml` does on a push to main and nothing checks before it. Run it before pushing a change to a scenario, a plugin's UI or the site. | The recordings' own keys, and the site's.                                                                        |
| `fmt`, `lint`       | `oxfmt` and `ruff format`; `oxlint --deny-warnings`. `lint:py`, `lint:sh` and `fmt:check` are the parts `check` runs.                                                                                                                                                | `lint` and the checks: the sources they read. `fmt`: none.                                                       |
| `media`             | The pictures and demos the site shows, recorded in `nix run .#media`; `media:vscode` is a package's VS Code pictures. See [site media](../lib/tools/drive/README.md#site-media).                                                                                     | The package's scenarios, its build, what it imports and the recording environment (`@agents/drive#media-env`).   |
| `readme`            | Write the root `README.md` from the plugin READMEs, skill frontmatter, `docs/_intro.md` and `docs/_install.md`.                                                                                                                                                      | Not cached.                                                                                                      |
| `catalog:docs`      | Write `lib/kits/catalog/COMPONENTS.md` and the kit index in `AGENTS.md` from the kit manifests.                                                                                                                                                                      | The kits' sources and `AGENTS.md`.                                                                               |
| `skills:refresh`    | Refresh the upstream manuals in the agent-plugin-dev skill. `-- vMAJOR.MINOR.PATCH` picks the pi docs' release.                                                                                                                                                      | Not cached.                                                                                                      |
| `kit-new`           | `-- <name>` scaffolds a kit component; see [the kit guide](../lib/kits/README.md#add-or-change-a-component).                                                                                                                                                         | Not cached.                                                                                                      |

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

| Location                                    | What goes there                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                              | The pi manifest (`pi`), the Claude manifest (`claude`: the build writes `.claude-plugin/plugin.json` and `hooks/hooks.json` from it) and the dependencies. `version` is the plugin's one version: the build copies it into both manifests, so the `claude` object carries none. |
| `src/claude.ts`, `src/claude.tsx`           | The mod: the file with the `on(...)` calls. The build bundles it with the kit and `src/lib` into `dist/register.js`. Its other files are in `src/claude/`, with the self-contained `types.d.ts` that `claude.types` names.                                                      |
| `src/claude.test.ts`, `src/claude.test.tsx` | The mod's tests, for `claude plugin test`; bundled into `dist/claude.test.ts`.                                                                                                                                                                                                  |
| `src/lib/`                                  | Shared logic with no Node or DOM APIs: oxlint bans `node:` imports and Node globals here and in the mod. Put Vitest specs next to it.                                                                                                                                           |
| `src/pi.ts`, `src/pi/`                      | The pi extension entry, which `pi.extensions` names, and its files. Set `"agentTools": { "subagents": true }` in `package.json` if subagents should load it.                                                                                                                    |
| `src/e2e/`                                  | The scenarios (`claude.scenarios.ts`, `pi.scenarios.ts`, `vscode.scenarios.ts`, `site.scenarios.ts`), fixtures and `__snapshots__`. See [writing a scenario](../lib/tools/drive/README.md#write-a-scenario).                                                                    |
| `tsconfig.json`, `tsconfig.claude.json`     | `tsconfig.json` extends `tsconfig.base.node.json` and leaves the Claude half out. `tsconfig.claude.json` covers that half and extends the `.claude-types/` snapshot from `drive types`.                                                                                         |
| `turbo.json`                                | The commands of the tasks the package takes part in: `build`, `test`, `test:claude`, `e2e`, `e2e:update`, `types`, `check-types`, `media`, `media:vscode`. Copy them from an existing app and change the name.                                                                  |
| `README.md`                                 | The public plugin page. Include `tagline`, `featured` and `order` frontmatter. `requires` lists prerequisites when there are any; How finished it is comes from the `version`, not from here.                                                                                   |
| `CHANGELOG.md`                              | What changed for the plugin's users, per version: lines under `## [Unreleased]` as changes land, dated by a release. A new plugin starts one with `## [Unreleased]` over its first version. See [releases](#release-a-plugin-or-skill).                                         |

For a Claude half, also list the app in [the marketplace](../.claude-plugin/marketplace.json) as a `git-subdir` source on the `dist` branch (see the existing entries). Its other entry, `skills`, is the `skills/` folder of the same branch, which lists no skill by name. The invariants spec in `lib/tools/build/` fails when the list and the plugins disagree: a released plugin missing, or an unreleased one listed.

To keep a plugin unreleased, set `"private": true` in its `package.json`. It is then on no list: no site page, no home-page row, no root README count, no marketplace entry, no folder in `nix build .#plugins` and nothing on `dist`. It still builds and runs, as `packages.<name>`, `nix flake check` and `pnpm drive live <name> <scenario>`. Removing the key releases it with the next push to `main`, and setting it on a released plugin removes that plugin from `dist`.

- A `claude.hooks` object in `package.json` is written to `hooks/hooks.json` beside the module; the manifest's own `hooks` field is for settings-style hooks, not modules. The mod engine accepts no symlinks.
- Declare dependencies in `package.json`. `"catalog:"` takes the versions `pnpm-workspace.yaml` states once: `typescript`, `@types/node`, `tsdown`, `vitest` for specs. Claude halves use the flake-provided binary, not an npm dependency. The kit packages an app imports (`@agents/kit-card`, ...), `@agents/build` and `@agents/drive` are `workspace:*` devDependencies. The kits are bundled, so a kit change rebuilds and retests the apps that use it.
- A top-level function that takes `$` (`open($)`) collides with any `let open = ...` in the bundle, the kit's included: the engine's check that a function handed `$` is not assigned to elsewhere does not understand scopes, and a bundle is one scope. `claude plugin validate` fails the `test:claude` task on it. Name such a function for what it does (`openForm`).
- To run an app's specs, add a `vitest.config.ts` that includes `src/lib/**/*.spec.ts` and give `test` its command in `turbo.json`, `["./node_modules/.bin/vitest", "run"]`, as the other apps do. Name the tool by path: turbo's `PATH` holds only the root's `node_modules/.bin`, which has turbo alone.
- In pi, import the [shared UI kit](../lib/kits/README.md) as packages (`@agents/kit-core/paint/pi.ts`); the build bundles them into the extension. List the packages pi ships as `peerDependencies` with `"*"` and as catalog `devDependencies` for the type-check and specs, never as `dependencies`: pi supplies them (and TypeBox) at runtime, and the build leaves them out. Import `Type` from `typebox`, not from pi-ai. Read settings inside an event or tool, not the extension factory.
- Try new slash commands in a real session. Claude can refuse a name that conflicts with a built-in or skill even when validation and tests pass. See the [Claude guide](../skills/agent-plugin-dev/references/claude.md) if a wrapper prevents `claude plugin test` from running.

## Publish a skill

Put the instructions in `skills/<name>/SKILL.md`, and start a `CHANGELOG.md` beside it. Set `metadata.version` (three numbers; see [releases](#release-a-plugin-or-skill) for what the number says), `metadata.summary` and pick a `metadata.category` from [the content loader](../lib/tools/build/content.ts). The site uses `argument-hint` for invocation help and takes the "Needs" list from bullets under `## Requirements` if present.

An unreleased skill's folder sits under `unreleased/skills/<name>/`, which nothing reads: the site and the root README never list it, CI publishes nothing from it, and `npx skills add ./unreleased/skills/<name> --skill <name>` installs it from a checkout. Move the folder into `skills/` to release it.

To validate frontmatter, copy `skills/` into a temporary plugin directory and run `claude plugin validate --strict --json <dir>`. Don't symlink the skills.

`check` lints a skill's scripts too: ruff for Python and shellcheck, at warning level, for shell. `fmt` formats the Python. A script folder with a `pyproject.toml` and tests joins the uv workspace (`skills/run-handoff/scripts` and `lib/tools/updates/python` are the two); add its path to `members` in the root `pyproject.toml`, and run `uv lock`. Its `test` task is inferred as pytest, so a member whose tests are not pytest overrides `test` in its own `turbo.json`.

## Release a plugin or skill

A release is a version bump merged to `main`. Nothing else publishes: a change with no bump waits on `main`, and the people who installed the unit keep what they have.

| Version        | What it says                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `0.0.x`        | Unfinished: listed last, under the notice that it is not ready for anyone else. Still installable.    |
| `0.1.0` and up | A pre-release: usable, and free to change. The site shows a `pre-release` tag beside the version.     |
| `1.0.0` and up | A release.                                                                                            |
| `1.3.0-rc.1`   | Refused. There is one channel, and Claude Code hands every user any version that differs from theirs. |

The version is `version` in `apps/<name>/package.json` (the build writes it into both the Claude and the pi manifest, so the `claude` object carries none) or `metadata.version` in `skills/<name>/SKILL.md`. There is no flag beside it: the loader refuses `status`.

**Write the changelog as you go.** Each unit keeps a `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com) form with flat bullets. A change someone using the unit will notice adds a line under `## [Unreleased]`, in the same commit, saying what changed for them and not what the commit did. A breaking change goes first, as `- **Breaking:** ...`. Two branches that each add a line both keep theirs (`.gitattributes` merges these files as a union).

```markdown
# Changelog

## [Unreleased]

- Opens the picker with Ctrl+O.

## [0.2.0] - 2026-11-25

- **Breaking:** `/answer` is now `/ask`.
- Wraps a long option instead of cutting it.
```

**Bump it.** `pnpm release <name> <patch|minor|major>` (or a version, `pnpm release <name> 1.0.0`) writes the new version, turns `[Unreleased]` into `## [<version>] - <date>` under a new empty one, and commits both as `release(<name>): <version>`. It refuses an unknown name, a dirty tree, a version that does not go up, and an `[Unreleased]` with no line in it. `--dry-run` prints the version and the section and writes nothing. Both edits can be made by hand too: the gate checks the result, which is that a unit's newest dated section is its version and has a line. It tags nothing and pushes nothing.

**Merge it.** On `main`, CI publishes what the bump released; see [what CI does](#what-ci-publishes). A pull request's `Release plan` job shows what merging it would publish, on the run's summary page.

`pnpm release --status` lists what is waiting on a bump: a unit with lines under `[Unreleased]`, one whose version differs from `dist`'s (it publishes on merge), and one whose content differs from what `dist` holds at the same version. For a skill that is its folder; for a plugin it is the build in `apps/<name>/dist`, so run `pnpm turbo run build` first, and a change to a kit or a dependency that reached the plugin shows up too. The gate job prints the same list on its summary. It is a report and never a failure.

A version is published once. To undo a release, revert the change and release a new version; there is no command that republishes an old one.

## Build, publish and use the plugins with nix

Nix builds each app with the same bundler as `pnpm turbo run build` (`pkgs/plugin-apps.nix`), so `nix build .#<app>` is that app's `dist/`, and `nix build .#plugins` holds every released plugin, one `<name>/` folder each (an unreleased app builds as `.#<name>` alone). The dependencies come from one fixed-output fetch whose hash is in `pkgs/pnpm-deps.hash`. It covers the apps, the kit packages they import, the build tool and the root's own dependencies (turbo); a lockfile bump that touches only the site, the drive tool or the linters leaves it alone.

When `pnpm-lock.yaml` changes the hash, `nix run .#update-deps-hash` rewrites it, and `check:nix` fails with that advice while it is stale. On Dependabot's npm PR, [`update-deps-hash.yml`](../.github/workflows/update-deps-hash.yml) pushes the new hash to the branch and starts `ci.yml` on it, because a push made with the workflow's own token starts no workflow. A `DEPS_HASH_TOKEN` secret (a personal access token or App token) makes the push start CI itself. Dependabot opens one PR per ecosystem (nix, npm, uv) on the 1st and 15th.

### What CI publishes

The `dist` branch is what an install reads, and the record of what is released: `<name>/` per plugin (its nix build), `skills/<name>/` per skill (what git tracks in its folder, less its changelog), `skills/.claude-plugin/plugin.json` (the `skills` plugin) and `releases.json`, which names each unit's version, the commit of `main` it was built from and the day.

On every run of [`ci.yml`](../.github/workflows/ci.yml), the `plan` job ([`plan.ts`](../lib/tools/build/plan.ts)) compares each released unit's version with the one in `releases.json`. A unit new to `dist`, or at a higher version, is published; one at the same version is left alone, whatever changed in its folder; one that `dist` holds and that is no longer released here is removed. The plan fails on a version that goes down or carries a suffix, a tag that already exists, a name that is both a plugin and a skill, and a version with no changelog section. It compares against `dist` and not against the push, so a publish that failed is planned again by the next run.

On a push to `main`, after `CI gate` passes, the `publish` job ([`publish.ts`](../lib/tools/build/publish.ts)) builds the planned plugins (`nix build .#<name>`) and appends one commit to `dist` that changes only the planned folders. It creates the branch when it is missing, never force-pushes, and pushes the commit together with one annotated tag per unit, `<name>--v<version>`, the form `claude plugin tag` makes. A plugin and a skill share one set of names for that reason. It then makes a GitHub Release per unit from its changelog section, flagged a pre-release below `1.0.0` and never "latest". To retry a failed publish, run the workflow on `main`.

The marketplace entries are `git-subdir` sources on `dist`, so a Claude install gets a built plugin at its released version. The `skills` plugin there carries a version made from the released skills' versions: Claude Code offers an update when a skill was released, and not when a plugin was. The skills CLI reads the same branch (`npx skills add 'nickolaj-jepsen/agents#dist' --skill <name>`) and updates a skill when its folder there changes; `'nickolaj-jepsen/agents#<name>--v<version>'` pins one. Without the `#dist` the CLI reads `main`, which holds every skill as it was last edited: that command cannot be gated, so nothing here advertises it. A pi install clones `dist` and installs `./agents/<name>`.

A `dist` with no `releases.json` is from before releases were gated. The first run against it is the cutover: it replaces the whole tree with every released unit, tags each, and makes no GitHub Release.

| Entry                                                   | What you get                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages.<system>.<name>`, `packages.<system>.plugins` | A plugin's build (an unreleased one's too), and `.#plugins`: every released plugin, one `<name>/` folder each.                                                |
| `packages.<system>.agents-updates`                      | The explicit publication tool: `bin/agents`, `bin/agents-refresh`, and the pi package at `share/agents-updates/pi`. Nothing npm-built; the consumer wraps it. |
| `lib.plugins`                                           | Map by plugin name; entries have `claude`, `pi` and `subagents`. Their `path` throws: a build belongs to a system, which `lib` does not know.                 |
| `lib.pluginsFor pkgs`                                   | `lib.plugins` with `path` set to the app built for `pkgs.stdenv.hostPlatform.system`: a store path, the folder pi loads as a package.                         |
| `lib.skills`                                            | Map from name to skill directory.                                                                                                                             |
| `lib.mkClaudePlugin { pkgs; claude-code; } <name>`      | One Claude half, validated (`--strict`) and tested with the supplied Claude Code.                                                                             |
| `apps.media`, `apps.update-deps-hash`                   | `nix run .#media -- <command>` runs a command in the recording environment; `nix run .#update-deps-hash` refreshes the pinned hash.                           |

The repo's own checks run in turbo: Claude Code is pinned by nixpkgs in `flake.lock`, and pi by `pnpm-lock.yaml`. CI runs the gate in `nix develop`; recordings get the same Claude from `nix run .#media`. Turbo hashes `flake.lock` and `CLAUDE_BIN` so changing Claude invalidates cached checks. `nix flake check` (`check:nix`) builds every plugin, runs the updates tool's Python tests (`checks.agents-updates`), and runs each Claude half through `lib.mkClaudePlugin` with nixpkgs' `claude-code`. A consumer's flake that sets `inputs.agents.inputs.nixpkgs.follows` builds with its own nixpkgs: if its `pnpm_12` fetches differently, `agents-pnpm-deps` fails with a hash mismatch, and the answer is to drop the `follows` for `agents`. Marketplace installs aren't checked against your local Claude version.

### Binary cache for Nix consumers

On every push to `main`, whether or not it releases anything, the `cache` job of [`ci.yml`](../.github/workflows/ci.yml) builds each plugin and publishes its output to `https://agents.cachix.org`, including outputs reused from another cache. It uses repository variable `CACHIX_CACHE=agents` and secret `CACHIX_AUTH_TOKEN` (write access), and is skipped without the variable. It pushes each output by path, because the Cachix action uploads only what a run built itself. This is separate from a release: the cache holds every commit's builds for a flake consumer, and `dist` holds each plugin at its released version.

Configure consumers declaratively:

```nix
nix.settings = {
  extra-substituters = [ "https://agents.cachix.org" ];
  extra-trusted-public-keys = [
    "agents.cachix.org-1:k9+CaEjlEzDvRfdzFNIBtDxvBjgq0tmNYTrH/CHMlvU="
  ];
};
```

Keep agents' own nixpkgs pin: do not set `agents.inputs.nixpkgs.follows`. The consumer must use the same agents revision and build inputs as CI for the store paths to match. CI currently publishes `x86_64-linux` builds; other systems still build locally. A cache miss builds only the missing derivations. Configuring this cache does not bypass `lib.mkClaudePlugin` checks against the consumer's own Claude.

Stage new files before running nix commands; otherwise Nix won't see them.

## Preview the published site

```bash
pnpm turbo run dev --filter=@agents/site     # serve http://localhost:4321/agents/
pnpm turbo run build --filter=@agents/site   # build the static site in apps/site/dist
pnpm turbo run readme                        # regenerate the GitHub README after changing its inputs
```

Edit plugin READMEs, skill files and `docs/*.md`, not the generated pages. Developer pages take their title from the first `#` heading and their URL from the filename. `docs/_intro.md` feeds the site and the GitHub README; `docs/_install.md` feeds only the README. If the images are missing, see [recording site media](../lib/tools/drive/README.md#site-media): the site builds without them.

Astro reads the repo itself: the content loaders in `apps/site/src/loaders/` build collections from the plugin READMEs, skills, docs, marketplace, the kits and whatever media is under `apps/site/media/`, and `astro dev` reloads them when a source file changes. They warn about media that is missing and never fail on it. Pages read the collections and import only types from `lib/` (oxlint enforces it; only `src/content.config.ts` and `src/loaders/` import code from there). The committed generated files (`README.md`, `lib/kits/catalog/COMPONENTS.md` and the kit index in `AGENTS.md`) are written by `pnpm turbo run build`, which the freshness specs name. The Pages workflow deploys from `main`; set the repository's Pages source to **GitHub Actions**.
