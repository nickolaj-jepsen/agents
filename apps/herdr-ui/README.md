# herdr-ui

The window Herdr itself draws: the nested layout, and the mods that fill it. This is not a Claude Code or pi plugin — it is Herdr's own UI, and NixOS installs it, so nothing here is bundled or loaded by an agent.

```
src/layouts/nested.json   the layout: the tab strip on top, the spaces sidebar, the panel, the status bar
src/mods/nested-header    the tab strip, with the open tabs and their controls
src/mods/nested-spaces    the sidebar: spaces, the agents in each, and their monitor rows
src/mods/nested-status    the status bar
src/mods/new-space        the overlay that starts a space
src/mods/open-from        the overlay that opens a checkout
src/mods/open-in          the overlay that opens a path in an editor
src/mods/repo-agent-menu  the overlay that starts an agent in a checkout
src/mods/workqueue        the panel's work queue: GitHub reviews and your PRs, and Linear issues
src/lib/                  the specs of the mods' helpers; not part of what Herdr loads
```

Each mod is a `mod.json` (its title, where it sits, what it was cloned from) and the `main.js` Herdr loads as it is: no build step, no imports but the mod's own files. A mod may write `gpui-kit.d.ts` and `jsconfig.json` beside itself for an editor's sake; they are generated, and the artifact leaves them out.

The work queue keeps its cards in `queue.js` beside its `main.js`, and its two marks, `inbox.svg` and `message.svg`, beside those. The layout places it twice: in the panel (`panel-body`), and as a `workqueue-feed` block of `0px` whose `feed` props make it the copy that fetches, so the tab strip's count is there before the panel first opens. Both copies read one module-level store, and the feed publishes it as `shared("workqueue")`. Its Linear half reads the key home-manager writes to `~/.config/workqueue/linear-api-key`, and without one it simply has no Linear section.

## The artifact

`nix build .#herdr-ui` (or `packages.<system>.herdr-ui` from another flake) is the folder Herdr loads:

```
$out/layouts/nested.json
$out/mods/<name>/mod.json
$out/mods/<name>/main.js
```

`mods/` and `layouts/` are at the root of the artifact and nothing else is, so a consumer points Herdr at that one folder rather than merging the files itself.

Herdr watches its `mods/` and `layouts/` folders and reloads a change on its own, so the artifact is a plain tree and there is nothing to build. Whoever installs it does it a file at a time (write, then rename into place, mods before layouts), which is why nothing here packs the folders into an archive.

## Checks

```bash
pnpm turbo run test --filter=@nickolaj-jepsen/herdr-ui  # the specs, in vitest
nix build .#herdr-ui                                    # the artifact, and what is in it
```

The specs cover the helpers the mods share with nothing else: `agentName` (an agent's session name out of a terminal title), `monitorRow` (a read-only pi monitor's row in place of a duplicate checkout row) and the work queue's `queue.js` (what a card says, which tab it lands in and when it folds as dormant). All three were `node:test` files in the NixOS configuration this UI came from; the same assertions run here under vitest.

`artifact.spec.ts` holds the artifact to its contract: exactly the mods and the layouts, every mod a `mod.json` that places nothing plus a `main.js` whose own imports ship beside it, and nothing an editor or a spec leaves behind.

`herdr-check.spec.ts` compiles every mod with Herdr's own check, `herdr-app check <mod>`, which type-checks a mod against the kit the app hands it. It runs on a scratch copy, because that command writes `gpui-kit.d.ts` and `jsconfig.json` beside the mod it checks. Herdr is not a dependency of this repo: with no `herdr-app` on `PATH` (or no `HERDR_APP` naming one) the specs skip, and a cached `test` from a machine without the app replays without compiling anything — `pnpm turbo run test --filter=@nickolaj-jepsen/herdr-ui --force` when the mods have changed and that matters.
