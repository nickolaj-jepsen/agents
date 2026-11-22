# Development

## Set up and check a change

You need Node 24 (`.node-version`), pnpm (`corepack enable` gives you the version `packageManager` pins) and uv, which fetches the Python in `.python-version`. `nix develop` gives the same tools, and `direnv allow` loads that shell. Otherwise nix is only for recording site media and checking nix files.

```bash
pnpm install                  # every package's dependencies, from pnpm-lock.yaml
pnpm turbo run test           # specs for the libs, kit and build tools, and run-handoff's pytest; runs no agent
pnpm turbo run check-types    # tsc -b in each package
pnpm turbo run lint           # oxlint over the TypeScript sources
pnpm turbo run fmt            # format the checkout: oxfmt, and ruff for Python
pnpm turbo run check          # the gate CI runs
```

Run turbo through pnpm: it puts turbo on `PATH`. `check` covers the format check, oxlint, shellcheck, ruff, each package's type-check and specs, `claude plugin validate` and `test` on each Claude half, and every plugin's screen snapshots against real Claude Code and pi. `fmt` leaves nix files alone; `nix fmt` formats them.

Turbo caches a task by its inputs, so a repeat run replays the output. CI writes a remote cache that local runs only read: `.envrc` sets `TURBO_CACHE=local:rw,remote:r`, and without direnv you export it yourself. To read the remote cache, run `turbo login` and `turbo link`, and set `TURBO_REMOTE_CACHE_SIGNATURE_KEY` to the key CI signs with. Without them every task runs on your machine.

| Task                 | What it does                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:nix`          | `nix flake check`: the nix files and treefmt. Not part of `check`; CI runs it only when a `.nix` file or `flake.lock` changed.                                                    |
| `build`              | Bundle an app or the kit catalogue into its gitignored `dist/` (the mod, its tests and the pi extension, in the shape Claude Code and pi load), and rewrite the generated README. |
| `test:claude`        | `claude plugin validate --strict` and `test` on one plugin's built mod (`dist/`), with the Claude Code the lockfile pins and a scratch `HOME`.                                    |
| `e2e`, `e2e:update`  | One plugin's screen snapshots, compared or accepted. See the [replay guide](../lib/tools/drive/README.md#snapshots).                                                              |
| `lint:py`, `lint:sh` | ruff and shellcheck; `fmt:check` is the format check `check` runs.                                                                                                                |
| `plugin-docs`        | Refresh the upstream manuals in the agent-plugin-dev skill. `-- vMAJOR.MINOR.PATCH` picks the pi docs' release.                                                                   |

Tasks that give you a session (`e2e-live`, `kit-live`, `answer-demo`) are interactive. Run them with `--ui=tui`, select the task in turbo's list and press `i` to send it your keys. `Ctrl+Z` gives the keys back to turbo. Turbo stops what a task leaves running, so a session parked by `goto` dies with its task: drive `goto`, `cap` and `keys` with `node lib/tools/drive/cli.ts` itself, as the [replay guide](../lib/tools/drive/README.md#drive-a-parked-terminal-session) shows.

Claude writes a mod's API types only when it loads the mod in a real session, into the mod's `dist/.claude-plugin/types/`, and there is no turbo task for that (a build keeps them). After upgrading Claude Code, run `lib/tools/build/dev-setup-claude.sh` with `claude` on `PATH`; it builds every mod, loads each once, waits for the types and tells you to restart the editor's TypeScript server. An app's `tsconfig.json` leaves its Claude half out, so `check-types` needs no session; to check it, take the `exclude` out of the tsconfig and add `dist/.claude-plugin/types` to its `typeRoots`. `test:claude` validates and tests the built mods without that step. pi's packages come from `pnpm install`, so pi halves need no setup.

## Try the answer form

```bash
pnpm install                                                       # prepare a new checkout
pnpm turbo run e2e:cli -- ls answer                                # list saved screens
pnpm turbo run e2e-live --ui=tui -- answer open --harness claude   # try a Claude card; Ctrl+] stops the replay
pnpm turbo run e2e-live --ui=tui -- answer open --harness pi       # try the pi version; Ctrl+] stops the replay
pnpm turbo run e2e-live --ui=tui -- answer form --harness vscode   # Linux with the extension installed; close the window to stop
```

The replay stops on a question card and hands you the controls: select `e2e-live` in turbo's list and press `i`. Pick an option or resize the window. See the [replay guide](../lib/tools/drive/README.md#live-mode) to write scenarios, take pictures or update snapshots.

## Change or add a plugin

Each directory under `apps/` is a Claude Code mod, a pi package, or both, and a pnpm workspace package: `pnpm install` links a new one and updates `pnpm-lock.yaml`. `pnpm turbo run build` bundles it into `apps/<name>/dist/`, in the shape Claude Code and pi load ([`lib/tools/build/build.ts`](../lib/tools/build/build.ts) says what goes where). `dist/` is gitignored, and the tests and the e2e scenarios run on it.

| Location                      | What goes there                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                | The workspace package: the pi manifest (`pi`), the Claude manifest (`claude`, what `.claude-plugin/plugin.json` held: the build writes that file and `hooks/hooks.json` from it), and the dependencies.                             |
| `src/claude.tsx`              | The mod: the file with the actual `on(...)` calls. The build bundles it, with the kit and `src/lib`, into `dist/register.js`. Other files of the mod are in `src/claude/`, with the self-contained `types.d.ts` the manifest names. |
| `src/claude.test.tsx`         | The mod's tests, for `claude plugin test`; bundled into `dist/claude.test.ts`.                                                                                                                                                      |
| `src/lib/`                    | Shared logic in TypeScript with no Node or DOM APIs: oxlint bans `node:` imports and Node globals here and in the mod. Put Vitest specs next to it.                                                                                 |
| `src/pi.ts`, `src/pi/`        | The pi extension entry, declared by `package.json` under `pi`, and its files. Set `"agentTools": { "subagents": true }` in that file if subagents should load it.                                                                   |
| `src/e2e/`                    | The plugin's screen scenarios, fixtures and `__snapshots__`. See the [replay guide](../lib/tools/drive/README.md#write-a-scenario).                                                                                                 |
| `tsconfig.json`, `turbo.json` | One tsconfig that extends `tsconfig.base.node.json`, and the tasks the package opts into: `build`, `test`, `test:claude`, `e2e`.                                                                                                    |
| `README.md`                   | Public plugin page. Include `tagline`, `featured` and `order` frontmatter. `requires` lists prerequisites when there are any; `status: in-progress` adds a notice and moves the plugin to the end.                                  |

For a Claude half, also list the app in [the marketplace](../.claude-plugin/marketplace.json). Its other entry, `skills`, discovers `skills/` without a per-skill list. The invariants spec in `lib/tools/build/` fails when the list and the plugins disagree.

- The manifest's `hooks` field is for settings-style hooks, not modules; a `claude.hooks` object in `package.json` is written to `hooks/hooks.json` beside the module. The mod engine accepts no symlinks.
- Declare dependencies in `package.json` with `"catalog:"` for the versions `pnpm-workspace.yaml` states once: `typescript`, `@types/node` and `tsdown`, `vitest` for specs, `@anthropic-ai/claude-code` for a Claude half. The kit packages an app imports (`@agents/kit-card`, ...) are `workspace:*` devDependencies: they are bundled, so a kit change rebuilds and retests the apps that use it. `@agents/build` and `@agents/drive` are too.
- The mod engine's check that a function handed `$` is not assigned to elsewhere does not understand scopes, and a bundle is one scope. A top-level function that takes `$` (`open($)`) collides with any `let open = ...` in the bundle, the kit's included: `claude plugin validate` fails the `test:claude` task on it. Rename the function (`openForm`).
- To run a plugin's specs, add a `vitest.config.ts` that includes `src/lib/**/*.spec.ts` and give `test` its command in `turbo.json`, `["./node_modules/.bin/vitest", "run"]`, as the other apps do. Name the tool by path: turbo's `PATH` holds only the root's `node_modules/.bin`, which has turbo alone.
- In pi, import the [shared UI kit](../lib/kits/README.md) as packages (`@agents/kit-core/paint/pi.ts`); the build bundles them into the extension. List the packages pi ships as `peerDependencies` with `"*"` and as catalog `devDependencies` for the type-check and specs, never as `dependencies`: pi supplies them (and TypeBox) at runtime, and the build leaves them out. Import `Type` from `typebox`, not from pi-ai. Read settings inside an event or tool, not the extension factory.
- Try new slash commands in a real session. Claude can refuse a name that conflicts with a built-in or skill even when validation and tests pass. See the [Claude guide](../skills/agent-plugin-dev/references/claude.md) if a wrapper prevents `claude plugin test` from running.

## Publish a skill

Put the instructions in `skills/<name>/SKILL.md`. Set `metadata.summary` and pick a `metadata.category` from [the content loader](../lib/tools/build/content.ts). The site uses `argument-hint` for invocation help and takes the “Needs” list from bullets under `## Requirements` if present.

To validate frontmatter, copy `skills/` into a temporary plugin directory and run `claude plugin validate --strict --json <dir>`. Don't symlink the skills.

`check` lints a skill's scripts too: ruff for Python and shellcheck, at warning level, for shell. `fmt` formats the Python. A script folder with a `pyproject.toml` and tests joins the uv workspace (`skills/run-handoff/scripts` is the first); add its path to `members` in the root `pyproject.toml`.

## Use the flake from another configuration

| Entry                                              | What you get                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.plugins`                                      | Map by plugin name; entries have `claude`, `pi`, `subagents` and `path`. `path` is a string into the flake's source, `"${self}/apps/<name>"`. |
| `lib.skills`                                       | Map from name to skill directory.                                                                                                             |
| `lib.mkClaudePlugin { pkgs; claude-code; } <name>` | One Claude half, validated and tested with the supplied Claude Code.                                                                          |

The repo's own checks run in turbo, not nix: Claude Code and pi are the versions `pnpm-lock.yaml` pins. `lib.mkClaudePlugin` is how a consumer checks a Claude half against their own `claude-code`. Marketplace installs aren't checked against your local Claude version.

## Preview the published site

```bash
pnpm turbo run dev --filter=@agents/site     # serve http://localhost:4321/agents/
pnpm turbo run build --filter=@agents/site   # build the static site in apps/site/dist
pnpm turbo run readme                        # regenerate the GitHub README after changing its inputs
```

Edit plugin READMEs, skill files and `docs/*.md`, not the generated pages. Developer pages take their title from the first `#` heading and their URL from the filename. `docs/_intro.md` feeds the site and the GitHub README; `docs/_install.md` feeds only the README. If the images are missing, see [recording site media](../lib/tools/drive/README.md#site-media): the site builds without them.

Astro builds from inputs already in `apps/site/`: the two tasks above write the content model and the kit catalogue there first, and the site imports only types from `lib/` (oxlint enforces it). The Pages workflow deploys from `main`; set the repository's Pages source to **GitHub Actions**.
