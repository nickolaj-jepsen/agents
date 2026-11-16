# Development

`nix develop` (or direnv) gives node, just and the formatters; `just` lists the recipes.

```bash
just dev-setup   # npm ci, plus the pi and Claude Code types an editor and tsc read
just test        # the cores' tests
just typecheck   # tsc -b
just check       # nix flake check: the above in a sandbox, each Claude half validated, formatting
just fmt
just readme      # regenerate README.md from the plugins', skills' and docs' sources
```

## As a flake input

The flake exposes what a system config needs to consume this repo:

- `lib.plugins`: `{ <name> = { claude; pi; subagents; path; }; }`, read from the folders.
- `lib.skills`: `{ <name> = <path to the skill folder>; }`.
- `overlays.default` (also `overlays.tools`): `pkgs.agent-tools` and `pkgs.tui-test`. agent-tools
  type-checks the pi halves against the consumer's `pkgs.pi-coding-agent`.
- `packages.<system>.agent-tools`: the checked sources, with each plugin at `$out/plugins/<name>`,
  type-checked against the consumer's pi (nixpkgs master's in the checks). Also `tui-test`.
- `lib.mkClaudePlugin { pkgs; claude-code; agentTools?; } <name>`: one plugin's Claude half validated
  and tested against the given claude-code.

The checks run against `claude-code` and `pi-coding-agent` from nixpkgs master, which gets their
releases days before unstable; a consumer's `agents.inputs.nixpkgs.follows` replaces it. Dependabot (`.github/dependabot.yml`)
opens at most one PR a day that updates every flake input together; `CI gate` checks it and
`.github/workflows/dependabot-auto-merge.yml` merges it. The repo needs "Allow auto-merge" and a ruleset
on `main` requiring `CI gate`.

## End-to-end tests

`e2e/` plays each plugin's screens in a real Claude Code and a real pi, compares them
with stored snapshots (`npm run e2e`), and parks a live session on one for driving by
hand (`npm run e2e:cli -- goto <plugin> <scenario>`). Local only: nothing in `npm test`,
the nix build or `just check` starts an agent. See `e2e/README.md`.

## Content

README.md is generated (`just readme`; `nix flake check` fails while it is stale) from the sources
`scripts/content.ts` loads:

- `plugins/<name>/README.md`: the plugin's page. Frontmatter `tagline` (one sentence), `featured`,
  `requires` (a list of markdown strings) and `order`; the harnesses and install lines come from the
  folder, as in Layout.
- `skills/<name>/SKILL.md`: `metadata.summary` (one line), `metadata.category` (`plan-build-ship`,
  `understand-decide`, `clean-up`, `harnesses`, `utilities`, `modified-public`) and, optionally,
  `metadata.credit` and `metadata.status: in-progress`.
- `docs/*.md`: the developer pages, each starting with a `# Title`. `docs/_intro.md` and
  `docs/_install.md` are the top of the README and the home page.
- `site/media/<plugin>/media.json`: the demo video and stills, within budget (`.mp4` 1 MB, `.png` 300 KB).
