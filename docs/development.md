# Development

`nix develop` (or direnv) gives node, just and the formatters; `just` lists the recipes. `just test` is
the quick loop; `just check` is the whole thing in a sandbox, and slow.

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
releases days before unstable. A consumer's `agents.inputs.nixpkgs.follows` replaces it.

Dependabot (`.github/dependabot.yml`) opens at most one PR a day that updates every flake input
together. `CI gate` checks it, and `.github/workflows/dependabot-auto-merge.yml` merges it. The repo
needs "Allow auto-merge" and a ruleset on `main` requiring `CI gate`.

## End-to-end tests

`e2e/` plays each plugin's screens in a real Claude Code and a real pi, local only: neither `npm test`,
the nix build nor `just check` starts an agent. See `e2e/README.md`.

## Content

README.md is generated (`just readme`; `nix flake check` fails while it is stale) from the sources
`scripts/content.ts` loads:

- `plugins/<name>/README.md`: the plugin's page.
  - Frontmatter: `tagline` (one sentence), `featured` (its poster in the README), `requires` (a list of
    markdown strings) and `order`. `status: in-progress` is optional; it lists the plugin after every
    other plugin and flags its page. The harnesses and install lines come from the folder, as
    `docs/layout.md` says.
  - The body is what it does. Key bindings go under `## Keys` and settings under `## Options`.
- `skills/<name>/SKILL.md`: `metadata.summary` (one line) and `metadata.category` (one of
  `scripts/content.ts`'s `CATEGORIES`). `metadata.credit` and `metadata.status: in-progress` are
  optional; the latter flags the skill and lists it last in its category.
- `docs/*.md`: the developer pages, each starting with a `# Title`. `docs/_intro.md` is the top of the
  README and the home page; `docs/_install.md` is the README's install section.
- `e2e/<plugin>/site.scenarios.ts`: the plugin's demos and stills. They are recorded, not committed:
  `just media` builds `.#site-media` and `.#site-kit` in the store, which the Pages workflow does
  before every build. The README links the featured plugins' posters on the site.
