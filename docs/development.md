# Development

## Set up and check a change

```bash
nix develop        # enter the repo's dev shell (or use direnv)
just dev-setup     # install dependencies and generate/link editor types
just test          # fast tests without running an agent
just typecheck     # cores, pi extensions, kit and e2e harness
just lint          # oxlint over the TypeScript sources
just fmt           # format the checkout
just check         # all flake checks, including Claude plugin validation and tests
just kit-live card/live --harness pi  # try a kit story in your terminal; replays on each save
```

Run `just dev-setup` again after upgrading Claude Code or reinstalling npm dependencies: Claude writes its API types only when it loads a mod in a real session, and npm prunes the links to pi's packages. Check the Claude half of one plugin with `npx tsc -p plugins/<name>/claude` after setup. The flake validates and tests Claude halves without that interactive step.

## Try the answer form

```bash
nix develop                                    # enter the dev shell
just dev-setup                                 # prepare a new checkout
npm run e2e:cli -- ls answer                    # list saved screens
just e2e-live answer open --harness claude      # try a Claude card; Ctrl+] stops the replay
just e2e-live answer open --harness pi          # try the pi version; Ctrl+] stops the replay
just e2e-live answer form --harness vscode      # Linux with the extension installed; close the window to stop
```

The replay stops on a question card and hands you the controls. Pick an option or resize the window. See the [replay guide](../e2e/README.md#live-mode) to write scenarios, take pictures or update snapshots.

## Change or add a plugin

Each directory under `plugins/` contains a Claude Code mod, a pi package, or both.

| Location                                         | What goes there                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude-plugin/plugin.json`, `hooks/hooks.json` | Claude manifest and module registration, at the plugin root.                                                                                                                                       |
| `claude/`                                        | Mod implementation, self-contained `types.d.ts` named by the manifest, and `*.test.ts(x)` for `claude plugin test`.                                                                                |
| `core/`                                          | Shared logic in an import-free TypeScript file with no Node or DOM APIs. Put Vitest specs next to it; keep them out of `tsconfig.core.json` because Vitest brings in Node types.                   |
| `pi/`                                            | Extension entry declared by the root `package.json` under `pi`. Set `"agentTools": { "subagents": true }` in that file if subagents should load it.                                                |
| `README.md`                                      | Public plugin page. Include `tagline`, `featured` and `order` frontmatter. `requires` lists prerequisites when there are any; `status: in-progress` adds a notice and moves the plugin to the end. |

For a Claude half, also list the folder in [the marketplace](../.claude-plugin/marketplace.json). Its other entry, `skills`, discovers `skills/` without a per-skill list.

- Point `hooks/hooks.json` at the file with the actual `on(...)` calls, not a re-export. The manifest's `hooks` field is for settings-style hooks, not modules. The install copies only files in the plugin; symlinks aren't accepted by the mod engine.
- Give a mod a root `tsconfig.json` with project references like the other mods; without it Claude writes one that becomes the nearest config for the core and pi half.
- In pi, import the [shared UI kit](../kit/README.md) by relative path. The loader doesn't honor tsconfig aliases or imports that escape the package. Don't add npm copies of packages pi ships; the build checks against the host's packages. Import `Type` from `typebox`, not from pi-ai. Read settings inside an event or tool, not the extension factory.
- Try new slash commands in a real session. Claude can refuse a name that conflicts with a built-in or skill even when validation and tests pass. See the [Claude guide](../skills/agent-plugin-dev/references/claude.md) if a wrapper prevents `claude plugin test` from running.

## Publish a skill

Put the instructions in `skills/<name>/SKILL.md`. Set `metadata.summary` and pick a `metadata.category` from [the content loader](../scripts/content.ts). The site uses `argument-hint` for invocation help and takes the “Needs” list from bullets under `## Requirements` if present.

To validate frontmatter, copy `skills/` into a temporary plugin directory and run `claude plugin validate --strict --json <dir>`. Don't symlink the skills.

## Use the flake from another configuration

| Entry                                                           | What you get                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib.plugins`                                                   | Map by plugin name; entries have `claude`, `pi`, `subagents` and `path`.                |
| `lib.skills`                                                    | Map from name to skill directory.                                                       |
| `overlays.default` (also `overlays.tools`)                      | `agent-tools` and `tui-test` for your nixpkgs.                                          |
| `packages.<system>.agent-tools`                                 | Checked sources in `$out/plugins/<name>`. Also available: `packages.<system>.tui-test`. |
| `lib.mkClaudePlugin { pkgs; claude-code; agentTools?; } <name>` | One Claude half, validated and tested with the supplied Claude Code.                    |

The repo checks use Claude Code and pi from the flake's nixpkgs master input. An overlay consumer checks pi extensions against its own `pkgs.pi-coding-agent`. Marketplace installs aren't checked against your local Claude version.

## Preview the published site

```bash
just site             # serve http://localhost:4321/agents/
just site-build       # build the static site in site/dist
just readme           # regenerate the GitHub README after changing its inputs
```

Edit plugin READMEs, skill files and `docs/*.md`, not the generated pages. Developer pages take their title from the first `#` heading and their URL from the filename. `docs/_intro.md` feeds the site and the GitHub README; `docs/_install.md` feeds only the README. If the images are missing, see [recording site media](../e2e/README.md#site-media).

Astro builds from inputs already in `site/`; generate the data before building and don't import values from the checkout into the site. The Pages workflow deploys from `main`; set the repository's Pages source to **GitHub Actions**.
