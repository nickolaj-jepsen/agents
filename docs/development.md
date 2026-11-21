# Development

## Set up and check a change

You need Node 24 (`.node-version`), pnpm (`corepack enable` gives you the version `packageManager` pins) and uv, which fetches the Python in `.python-version`. `nix develop` gives the same tools, and `direnv allow` loads that shell. Otherwise nix is only for recording site media and checking nix files.

```bash
pnpm install                  # every package's dependencies, from pnpm-lock.yaml
pnpm turbo run test           # specs for the cores, kit and scripts, and run-handoff's pytest; runs no agent
pnpm turbo run check-types    # tsc -b in each package
pnpm turbo run lint           # oxlint over the TypeScript sources
pnpm turbo run fmt            # format the checkout: oxfmt, and ruff for Python
pnpm turbo run check          # the gate CI runs
```

Run turbo through pnpm: it puts turbo on `PATH`. `check` covers the format check, oxlint, shellcheck, ruff, each package's type-check and specs, `claude plugin validate` and `test` on each Claude half, and every plugin's screen snapshots against real Claude Code and pi. `fmt` leaves nix files alone; `nix fmt` formats them.

Turbo caches a task by its inputs, so a repeat run replays the output. CI writes a remote cache that local runs only read: `.envrc` sets `TURBO_CACHE=local:rw,remote:r`, and without direnv you export it yourself. To read the remote cache, run `turbo login` and `turbo link`, and set `TURBO_REMOTE_CACHE_SIGNATURE_KEY` to the key CI signs with. Without them every task runs on your machine.

| Task                 | What it does                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `check:nix`          | `nix flake check`: the nix files and treefmt. Not part of `check`; CI runs it only when a `.nix` file or `flake.lock` changed. |
| `test:claude`        | `claude plugin validate` and `test` on one plugin's Claude half, with the Claude Code the lockfile pins and a scratch `HOME`.  |
| `e2e`, `e2e:update`  | One plugin's screen snapshots, compared or accepted. See the [replay guide](../e2e/README.md#snapshots).                       |
| `lint:py`, `lint:sh` | ruff and shellcheck; `fmt:check` is the format check `check` runs.                                                             |
| `plugin-docs`        | Refresh the upstream manuals in the agent-plugin-dev skill. `-- vMAJOR.MINOR.PATCH` picks the pi docs' release.                |

Tasks that give you a session (`e2e-live`, `kit-live`, `answer-demo`) are interactive. Run them with `--ui=tui`, select the task in turbo's list and press `i` to send it your keys. `Ctrl+Z` gives the keys back to turbo. Turbo stops what a task leaves running, so a session parked by `goto` dies with its task: drive `goto`, `cap` and `keys` with `node e2e/cli.ts` itself, as the [replay guide](../e2e/README.md#drive-a-parked-terminal-session) shows.

Claude writes a mod's API types only when it loads the mod in a real session, and there is no turbo task for that. After upgrading Claude Code, run `scripts/dev-setup-claude.sh` with `claude` on `PATH`; it loads every mod once, waits for the types and tells you to restart the editor's TypeScript server. Then check the Claude half of one plugin with `pnpm -C plugins/<name> exec tsc -p claude --noEmit`: without `--noEmit`, tsc writes `.js` and `.d.ts` files into the plugin. `test:claude` validates and tests Claude halves without that step. pi's packages come from `pnpm install`, so pi halves need no setup.

## Try the answer form

```bash
pnpm install                                                       # prepare a new checkout
pnpm turbo run e2e:cli -- ls answer                                # list saved screens
pnpm turbo run e2e-live --ui=tui -- answer open --harness claude   # try a Claude card; Ctrl+] stops the replay
pnpm turbo run e2e-live --ui=tui -- answer open --harness pi       # try the pi version; Ctrl+] stops the replay
pnpm turbo run e2e-live --ui=tui -- answer form --harness vscode   # Linux with the extension installed; close the window to stop
```

The replay stops on a question card and hands you the controls: select `e2e-live` in turbo's list and press `i`. Pick an option or resize the window. See the [replay guide](../e2e/README.md#live-mode) to write scenarios, take pictures or update snapshots.

## Change or add a plugin

Each directory under `plugins/` contains a Claude Code mod, a pi package, or both. It is a pnpm workspace package: `pnpm install` links a new one and updates `pnpm-lock.yaml`.

| Location                                         | What goes there                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude-plugin/plugin.json`, `hooks/hooks.json` | Claude manifest and module registration, at the plugin root.                                                                                                                                                                                                                                                                                                                   |
| `claude/`                                        | Mod implementation, self-contained `types.d.ts` named by the manifest, and `*.test.ts(x)` for `claude plugin test`.                                                                                                                                                                                                                                                            |
| `core/`                                          | Shared logic in TypeScript with no Node or DOM APIs. It imports only other core files and, for a screen both halves draw, the mod's copy of the kit (`../claude/kit/`), since a mod can't import outside its plugin. Put Vitest specs next to it; the plugin's `tsconfig.core.json` leaves them out because Vitest brings in Node types, and `tsconfig.node.json` checks them. |
| `pi/`                                            | Extension entry declared by the plugin's `package.json` under `pi`. Set `"agentTools": { "subagents": true }` in that file if subagents should load it.                                                                                                                                                                                                                        |
| `package.json`, `turbo.json`                     | The workspace package: the pi manifest and the dev dependencies, and the tasks the package opts into.                                                                                                                                                                                                                                                                          |
| `README.md`                                      | Public plugin page. Include `tagline`, `featured` and `order` frontmatter. `requires` lists prerequisites when there are any; `status: in-progress` adds a notice and moves the plugin to the end.                                                                                                                                                                             |

For a Claude half, also list the folder in [the marketplace](../.claude-plugin/marketplace.json). Its other entry, `skills`, discovers `skills/` without a per-skill list. The invariants spec in `scripts/` fails when the list and the plugins disagree.

- Point `hooks/hooks.json` at the file with the actual `on(...)` calls, not a re-export. The manifest's `hooks` field is for settings-style hooks, not modules. The install copies only files in the plugin; symlinks aren't accepted by the mod engine.
- Declare dependencies in `package.json` with `"catalog:"` for the versions `pnpm-workspace.yaml` states once: `typescript` and `@types/node` for the type-check, `vitest` for specs, `@anthropic-ai/claude-code` for a Claude half. A plugin that imports the kit by path also lists `@agents/kit` as `workspace:*`, so a kit change reruns its type-check.
- Give a plugin a root `tsconfig.json` with project references like the other plugins; without it Claude writes one for a mod that becomes the nearest config for the core and pi half. It holds no files of its own and points at `tsconfig.core.json` (the core and the mod's kit copy, no Node types) and `tsconfig.node.json` (the pi extension and the specs, Node types), which extend the base configs at the repository root. `pnpm turbo run check-types` builds it. Don't reference `./claude` there: its types exist only after a real session lays them, so the build would fail without them. A plugin with a pi extension only needs one `tsconfig.json` that extends `tsconfig.base.node.json`. `check-types` runs in every package; one with no TypeScript to check opts out with `"command": null` in its `turbo.json`.
- To run a plugin's specs, add a `vitest.config.ts` that includes `core/**/*.spec.ts` and a `turbo.json` that gives `test` its command, `["./node_modules/.bin/vitest", "run"]`, as the other plugins do. Name the tool by path: turbo's `PATH` holds only the root's `node_modules/.bin`, which has turbo alone. A Claude half gives `test:claude` its command the same way, `["sh", "../../scripts/claude-plugin-test.sh"]`.
- The plugin's screen scenarios are their own package, `e2e/<plugin>/`: a `package.json` that depends on `@agents/e2e` and the plugin (`workspace:*`), a `tsconfig.json`, and a `turbo.json` whose `e2e` and `e2e:update` commands opt it into the snapshot task. Copy a neighbour's, then write scenarios as the [replay guide](../e2e/README.md#write-a-scenario) says.
- In pi, import the [shared UI kit](../kit/README.md) by relative path. The loader doesn't honor tsconfig aliases or imports that escape the package. List the packages pi ships as `peerDependencies` with `"*"` and as catalog `devDependencies` for the type-check and specs, never as `dependencies`: pi supplies them at runtime. Import `Type` from `typebox`, not from pi-ai. Read settings inside an event or tool, not the extension factory.
- Try new slash commands in a real session. Claude can refuse a name that conflicts with a built-in or skill even when validation and tests pass. See the [Claude guide](../skills/agent-plugin-dev/references/claude.md) if a wrapper prevents `claude plugin test` from running.

## Publish a skill

Put the instructions in `skills/<name>/SKILL.md`. Set `metadata.summary` and pick a `metadata.category` from [the content loader](../scripts/content.ts). The site uses `argument-hint` for invocation help and takes the “Needs” list from bullets under `## Requirements` if present.

To validate frontmatter, copy `skills/` into a temporary plugin directory and run `claude plugin validate --strict --json <dir>`. Don't symlink the skills.

`check` lints a skill's scripts too: ruff for Python and shellcheck, at warning level, for shell. `fmt` formats the Python. A script folder with a `pyproject.toml` and tests joins the uv workspace (`skills/run-handoff/scripts` is the first); add its path to `members` in the root `pyproject.toml`.

## Use the flake from another configuration

| Entry                                              | What you get                                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.plugins`                                      | Map by plugin name; entries have `claude`, `pi`, `subagents` and `path`. `path` is a string into the flake's source, `"${self}/plugins/<name>"`, so a pi half's `../../kit` imports resolve. |
| `lib.skills`                                       | Map from name to skill directory.                                                                                                                                                            |
| `lib.mkClaudePlugin { pkgs; claude-code; } <name>` | One Claude half, validated and tested with the supplied Claude Code.                                                                                                                         |

The repo's own checks run in turbo, not nix: Claude Code and pi are the versions `pnpm-lock.yaml` pins. `lib.mkClaudePlugin` is how a consumer checks a Claude half against their own `claude-code`. Marketplace installs aren't checked against your local Claude version.

## Preview the published site

```bash
pnpm turbo run dev --filter=@agents/site     # serve http://localhost:4321/agents/
pnpm turbo run build --filter=@agents/site   # build the static site in site/dist
pnpm turbo run readme                        # regenerate the GitHub README after changing its inputs
```

Edit plugin READMEs, skill files and `docs/*.md`, not the generated pages. Developer pages take their title from the first `#` heading and their URL from the filename. `docs/_intro.md` feeds the site and the GitHub README; `docs/_install.md` feeds only the README. If the images are missing, see [recording site media](../e2e/README.md#site-media): the site builds without them.

Astro builds from inputs already in `site/`: the two tasks above write the content model and the kit catalogue there first, and the site imports only types from `scripts/` and `kit/` (oxlint enforces it). The Pages workflow deploys from `main`; set the repository's Pages source to **GitHub Actions**.
