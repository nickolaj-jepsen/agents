# Layout

Each `plugins/<name>/` is a Claude Code plugin (built by `lib.mkClaudePlugin`), a pi package, or both.
The folder says which: a Claude half has `.claude-plugin/plugin.json`, a pi half a `pi` key in
`package.json`. A system config loads every plugin the flake lists (`lib.plugins`). Only a plugin with a
Claude half goes in the marketplace, and `nix flake check` fails while
`.claude-plugin/marketplace.json` disagrees with the folders.

- `core/`: harness-free TypeScript shared with pi, in a single file with no imports
  and no Node or DOM APIs.
  - Tests are `core/*.spec.ts`, run by vitest (`npm test`) and by
    `nix build .#agent-tools`.
  - `claude plugin test` runs only `*.test.ts(x)`, so the two never overlap.
- `claude/`: the Claude half. It holds:
  - the hooks module;
  - `types.d.ts`, the module's contract, named by `plugin.json`'s `"types"`;
  - `*.test.tsx` for `claude plugin test`;
  - `tsconfig.json`, over the types `just dev-setup` lays, for `tsc -p claude` and the editor.
- `.claude-plugin/plugin.json` and `hooks/hooks.json` stay at the root: Claude Code
  reads the manifest only there, and a mod's module only from `hooks/hooks.json`'s
  `modules` (the manifest's `hooks` field takes settings-style hooks, not modules).
- `pi/`: the pi half, which the plugin's own `package.json` names under `pi`, so the
  folder is a pi package as it stands and imports `../core` directly. The session
  you started loads it, and subagents too when its `package.json` sets
  `"agentTools": {"subagents": true}`.
- A pi half imports only pi, typebox, Node, its own plugin and the pi UI kit (`kit/pi/`). It reaches
  the kit by relative path, because pi's loader reads no tsconfig paths and a package `imports` alias
  can't point out of the plugin. It never imports the pi leaf's `shared/`: the two are built into
  different store paths.
- Plugin root: `.claude-plugin/`, `hooks/`, `claude/`, `core/`, `pi/`, `package.json`, `README.md` and,
  with a Claude half, `tsconfig.json`.
  - `README.md` is the plugin's own page: frontmatter and prose, read by `scripts/content.ts`.
  - `tsconfig.json` only points the editor at `claude/`'s project and the cores' and pi halves'. Claude
    Code writes a root `tsconfig.json` over its own types into a mod that has none, which would then be
    the nearest config for `core/` and `pi/`. The mod's install copies its own halves only, so `pi/`
    never reaches a Claude Code install.
- No plugin imports the agent-hub client. One that needs the hub isn't a plugin.

`tsconfig.json` is a solution file, one project per area, and `npm run typecheck` builds them with
`tsc -b`. So no plugin needs a tsconfig for its `core/` or `pi/`: `tsconfig.core.json` holds the cores
to no types at all (a Node import there fails), and `tsconfig.pi.json` checks the pi halves and the
cores' specs with Node's types.

A pi half type-checks against the pi that ships, not an npm copy of it: `pkgs/agent-tools` links
nixpkgs' pi (or the consumer's) into its `node_modules` before `tsc`, and `just dev-setup` makes the
same links for an editor.

## Traps

None of these show up in `tsc`:

- The hooks module can't re-export `register`: the engine reads `on(...)` calls from
  the file `hooks.json` names. Point `hooks.json` at the real module.
- `claude/types.d.ts` must be self-contained, with no `import`. It restates the shapes
  `core/` owns, so `tsc -p claude` flags drift.
- No symlink can stand in for a file: the engine refuses one in a plugin ("not a
  regular file"), and an install copies only the plugin's own folder.
- A spec imports vitest, whose types bring Node's, so specs stay out of
  `tsconfig.core.json`. Adding one there would let a core's Node import pass.
- vitest would read the nearest `tsconfig.json`, which for a core is the plugin's,
  over the types only `just dev-setup` lays. `vitest.config.ts` passes its own
  `tsconfigRaw` so none is read.
- A pi half's imports resolve to the pi that runs only through the links
  `pkgs/agent-tools` and `just dev-setup` make. `npm install` prunes them, so re-run
  `just dev-setup` when `npm run typecheck` starts failing to find `@earendil-works/*`.
- Never add a package pi itself ships to `package.json`: a physical copy drifts from
  the pi that loads the half, and the links keep the two in step.
