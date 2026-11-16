# Agent notes

Plugins for Claude Code and pi, and agent skills, as a flake. Each `plugins/<name>/` is a Claude Code
plugin (a "mod"), a pi package, or both; `skills/<name>/` are agent skills; `kit/` is the shared UI kit.
Each plugin's page is its own `plugins/<name>/README.md`; `docs/` holds the layout, traps and the rest of
the developer notes (read `docs/layout.md` before touching a plugin). The root `README.md` is generated
(`just readme`) from those, the skills' frontmatter and `scripts/content.ts`: never edit it by hand. A system config (home-manager) consumes this flake as an input and
wires the plugins and skills into the agents; that wiring does not live here.

## Commands

All operations use `just`; run `just` for the full list.

```bash
just dev-setup           # npm ci, link nixpkgs' pi into node_modules, lay the mods' Claude Code types
just test                # vitest over the harness-free cores
just typecheck           # tsc -b over cores, pi halves, kit and e2e
just kit-sync            # after editing kit/claude/ui.tsx or kit/catalog/samples.ts
just readme              # regenerate README.md; run after editing a plugin README, a SKILL.md or docs/
just fmt                 # ALWAYS run before finishing
just check               # nix flake check: tests, type-check, each Claude half validated and tested (slow)
just build               # nix build: the checked plugin sources
```

New files must be `git add`ed or the flake ignores them.

## Where things go

| Thing                | Lives in               | Build check                                       | Dev loop                        |
| -------------------- | ---------------------- | ------------------------------------------------- | ------------------------------- |
| Own skill            | `skills/<name>/`       | none (frontmatter check below)                    | `claude plugin validate`        |
| Claude Code mod      | `plugins/<name>/`      | `claude plugin validate`/`test`, per-plugin check | `claude --plugin-dir`, `tsc -p` |
| A plugin's pi half   | `plugins/<name>/pi/`   | `nix build .#agent-tools` (`tsc -b`)              | `just dev-setup`, `pi -e`       |
| Harness-free core    | `plugins/<name>/core/` | `npm test` in `.#agent-tools`                     | `just test`                     |
| Shared UI kit        | `kit/`                 | `nix build .#agent-tools`                         | `just kit-sync`, `kit/catalog`  |
| Screens (end-to-end) | `e2e/`                 | none: local only, needs a signed-in agent         | `just e2e`, `e2e:cli goto`      |

## Skills

- Own skills are `skills/<name>/SKILL.md`. They are publicly installable; a new one gets `metadata.summary` (one line) and
  `metadata.category` in its frontmatter, then `just readme`. The flake's `lib.skills` lists every folder.
- No build check reads skill content. To check frontmatter, copy (don't symlink) `skills/` into
  `<dir>/skills/` and run `claude plugin validate --strict --json <dir>`; an empty `contents` is clean.
- Third-party and private skills are not here; the system config registers them.

## Plugins

- A plugin's pi half (`plugins/<name>/pi/`) is a package of its own: the plugin's `package.json` names it
  under `pi` (`"agentTools": {"subagents": true}` loads it in subagents too, else only the session you
  started), and it imports the plugin's `core/` directly. A plugin can be pi-only, with no Claude half.
- The pi halves type-check against the `pi-coding-agent` of the `pkgs` that builds `agent-tools`
  (nixpkgs master's in this flake's checks, the system's own when consumed through the overlay).
  That resolves `@earendil-works/pi-ai` to its
  published types, which carry no TypeBox re-exports, so code imports `Type` from `typebox`, the copy pi
  aliases to the one it loads.
- Never add an npm package pi itself ships to `package.json`: a copy drifts from the pi that loads the
  half. The links `nix build .#agent-tools` and `just dev-setup` make are what keep the two in step.
- A new mod also gets an entry in `.claude-plugin/marketplace.json`, which `nix flake check` compares to
  the folders, and its own `README.md` (frontmatter and prose; see `docs/development.md`), then `just readme`.
- A change to what a mod draws or to its keys is seen before it is handed back: load the
  `agent-plugin-dev` skill, which parks a real session on the screen. A green check says nothing about
  layout or focus.
- `.claude-plugin/marketplace.json`'s `skills` plugin has source `./` and discovers `skills/` by
  default; don't add a `skills` list there.

## Traps

- A mod's build can't run `tsc`: the API types exist only once an interactive session loads the folder.
  `just dev-setup` runs one to lay them into each mod's gitignored `.claude-plugin/types/`, for the
  editor and `tsc -p <plugin>/claude`. Re-run it after a Claude Code upgrade.
- A plugin command's name can be refused at runtime and neither `claude plugin validate` nor
  `claude plugin test` says so: `$.command.register` throws for a name a built-in (`review`, now
  `/code-review`) or a skill (`tuicr`) already has, and the mod's own catch logs it at debug. Check a
  new name by typing it in a real session.
- `pi.getSettings()` throws `Extension runtime not initialized` in an extension's factory. Read settings
  inside `execute()` or an event handler; a try/catch around the factory call yields empty settings.
- A Claude Code or pi session that ends inside a worktree may close it once nothing runs there
  (`wt close --when-free`). An agent's Bash calls only visit its worktree between calls, so a test
  session it drives there must set `WT_NO_AUTOCLOSE=1`, as the e2e harness (`e2e/lib/harness.ts`) does.
- The e2e harness starts `claude-dev` / `pi-dev` when they are on PATH (wrappers a system config
  provides that load the checkout's plugins), else plain `claude` / `pi`, which then load none of them
  unless given `--plugin-dir` / `-e`.
- A script that starts a Claude session and may kill it before its screen is up sets
  `CLAUDE_CODE_NO_FLICKER=1`. Fullscreen from settings arms a boot canary; two sessions that die
  early record `fullscreenAutoDisabled` in `~/.claude.json`, and every later session, the person's
  own included, starts in the classic renderer, where a mod's pane draws inline instead of docked.
  `/tui fullscreen` clears it.
- `pkgs/agent-tools` builds only the files its type-check reads, so a skill, demo or README edit doesn't
  rebuild it; a new top-level file it needs must be added to its fileset.

## Dependencies

Dependabot updates `flake.lock` in one daily PR (`.github/dependabot.yml`), auto-merged after `CI gate`. There
are no pinned tool versions: the checks use claude-code and pi from nixpkgs master, so a lock bump can fail on a
plugin that targets another version.

## Maintaining these files

New agent-relevant traps go here, or in `docs/`, or in the plugin's `README.md` when they are about one plugin. CLAUDE.md just
`@`-includes this file.
