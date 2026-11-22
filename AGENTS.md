# Agent notes

Plugins for Claude Code and pi, and installable skills, distributed as a flake. Start with the [developer guide](docs/development.md) for setup, layout, tasks, adding a plugin, packaging and site changes. Home-manager loads this flake; that configuration lives outside this repo.

- Use turbo for repo commands: `pnpm turbo run <task>`, with the tasks in [the guide](docs/development.md#tasks). Run `pnpm turbo run fmt` before handing back changes. `pnpm turbo run test` is the quick check; `pnpm turbo run check` is the gate CI runs.
- Drive real agents with `pnpm drive <verb>` (`pnpm drive --help`, [the driver's guide](lib/tools/drive/README.md)), not through turbo: `live` and `goto` with `cap`, `keys`, `shot` and `stop`, `test` for snapshots, `record` for site media (in `nix run .#media`).
- When the owner wants to see or test a plugin themselves, give them a visible session they can drive with their own keyboard and mouse. Use `pnpm drive live <package> <scenario> --harness vscode` for VS Code. `goto --watch` runs headlessly there; screenshots and scripted input are not a substitute. If they ask for hot reload, say whether it works in the visible session (VS Code `live` does not support `--watch` yet).
- Don't edit the root README directly. Run `pnpm turbo run readme` after editing a plugin README, skill frontmatter, `docs/_intro.md` or `docs/_install.md`. It fails if any `apps/<name>` plugin lacks a `README.md`.
- Stage new files before running nix commands; otherwise Nix won't see them. `nix fmt` formats the nix files, which `fmt` leaves alone, and `pnpm turbo run check:nix` checks them; `check` doesn't run it.
- A mod and a pi extension are bundled from `apps/<name>/src` into the gitignored `apps/<name>/dist` by `pnpm turbo run build`, and the kit is imported as the packages `@agents/kit-*`: there are no copies to sync. See [the kit guide](lib/kits/README.md). `pnpm turbo run catalog:docs` rewrites the kit index below.
- For changes to what a plugin draws, or to its keys, mouse or focus, use the [agent-plugin-dev skill](skills/agent-plugin-dev/SKILL.md) and look at a real session before handing back.
- Plugin UI follows the house rules in [the layout reference](skills/agent-plugin-dev/references/style.md). They hold for every plugin: a design that breaks one needs the owner's approval first, and each reviewer gets the page with the design.
- Keep test sessions isolated. Fixture git must ignore the user's config and hooks; keep the agent's notes and worktrees under the run folder. Use `setupContext` and `runEnv` in `lib/tools/drive/lib/setup.ts`.
- A driver that might kill Claude before startup sets `CLAUDE_CODE_NO_FLICKER=1`. Otherwise two early exits with fullscreen enabled can leave the user's own session in the classic renderer. `/tui fullscreen` clears it.
- `PHILOSOPHY.md` records lasting project choices. Ask the owner for explicit permission before editing it.

<!-- kit:index:start -->

## Kit components

Draw plugin UI with these; add one with `pnpm turbo run kit-new -- <name>`.

- `lib/kits/band/`: The one line above the prompt that says there is something to open: a status mark and the text, then a way in and further actions.
- `lib/kits/buttons/`: A row of actions with their keys, the suggested one in the accent, and keyboard-only hints.
- `lib/kits/card/`: A question with lettered answers and a note, and the steps and summary of a form of several.
- `lib/kits/detail/`: One item read whole: a meta line, a wrapped title, sections under dim headings or a rule, keyed rows, cut to a height.
- `lib/kits/fields/`: What a record holds, one named value each: a row per field, or side by side.
- `lib/kits/frame/`: A form between two rules: a caption and Close in the top one, buttons above the bottom one.
- `lib/kits/image/`: Draws PNG images at their aspect ratios, with optional file links and a caption.
- `lib/kits/list/`: Rows with a mark and a line or two each, under group rows, behind rails or bare; taller than its room, a window.
- `lib/kits/notice/`: One line telling the person what happened, in a role, and the dim words that stand in for a list's rows.
- `lib/kits/prose/`: A text of several blocks set as lines whose rows can be counted, and the window a short room shows of it.
- `lib/kits/sheet/`: A panel laid over the screen, closed on every side: the title and Close in its top edge, buttons at its foot.

<!-- kit:index:end -->
