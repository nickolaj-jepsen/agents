# Agent notes

Plugins for Claude Code and pi, and installable skills, distributed as a flake. Start with the [developer guide](docs/development.md) for plugin layout, checks, packaging and site changes. Home-manager loads this flake; that configuration lives outside this repo.

- Use `just` for repo commands. Run `just fmt` before handing back changes. `just test` is the quick check; `just check` runs the flake checks.
- Don't edit the root README directly. Run `just readme` after editing plugin or skill frontmatter or `docs/_intro.md` or `docs/_install.md`.
- Stage new files before running flake commands; otherwise Nix won't see them.
- Edit the kit source, not a mod's copy. Run `just kit-sync` after changing the Claude kit or shared catalogue samples. See [the kit guide](kit/README.md).
- For changes to what a plugin draws, or to its keys, mouse or focus, use the [agent-plugin-dev skill](skills/agent-plugin-dev/SKILL.md) and look at a real session before handing back.
- Keep test sessions isolated. Fixture git must ignore the user's config and hooks; keep the agent's notes and worktrees under the run folder. Use `setupContext` and `runEnv` in `e2e/lib/setup.ts`.
- A driver that might kill Claude before startup sets `CLAUDE_CODE_NO_FLICKER=1`. Otherwise two early exits with fullscreen enabled can leave the user's own session in the classic renderer. `/tui fullscreen` clears it.
- `PHILOSOPHY.md` records lasting project choices. Ask the owner for explicit permission before editing it.
