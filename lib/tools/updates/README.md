# `agents-updates`

Publish a checkout's plugins and skills as immutable store snapshots, and let each harness load what this generation pins until you say otherwise. The package is `packages.<system>.agents-updates`: `bin/agents`, `bin/agents-refresh`, and the pi package at `share/agents-updates/pi`.

The design is one sentence: **a launch loads store paths, an update publishes new ones, and nothing links the checkout.** An agent never builds at startup, so a launch costs nothing and a broken working tree cannot take a session down. `agents update <name>` is the explicit act that publishes:

```bash
agents status                          # what is published, and the pinned revision
agents update answer                   # both halves of one plugin, from the checkout's working tree
agents update answer --harness pi      # only pi's half
agents update grilling --skill         # a skill
agents update answer --dry-run         # what would be built, and nothing else
agents update answer --live pi         # ...and ask running pi sessions to reload
agents reset answer                    # drop the snapshot; the pinned baseline applies again
agents check                           # drift report; always exits 0
agents resolve                         # the effective paths as JSON, for a launcher
```

A build is the only backend: the snapshot is built with Nix against the nixpkgs the wrapper names, so a published half is the same derivation the pinned one would have been.

## What a snapshot is

`agents update` copies the checkout's working tree — tracked files plus untracked files git does not ignore, read with `git ls-files`, nothing written to it — into a temporary directory, evaluates that copy as a flake, and builds only the halves you asked for plus (for a skill) the skills tree. One linkFarm holds the results, so a single `nix build --out-link` both builds and roots them.

The published tree must be self-contained. A symlink in the checkout is refused when it resolves outside the checkout, or at a path the snapshot does not carry (ignored by git, or not committed), because a store copy that still pointed into the checkout could change under a session later. A kept link is rewritten to the snapshot's own copy of the end of its chain, so `a -> b` and `b -> skills/x` cannot make the result depend on the order git listed them in.

## The manifest

The wrapper (`agents`'s environment) names one JSON file, `AGENTS_BASELINE`. It is what this generation pins: the revision, and one path per plugin variant and per skill.

```json
{
  "revision": "<git revision this configuration was built from>",
  "plugins": {
    "answer": { "pi": "/nix/store/…-agents-answer", "claude": "/nix/store/…-claude-answer" },
    "docfix": { "pi": "/nix/store/…-agents-docfix", "claude": null }
  },
  "skills": { "grilling": "/nix/store/…-agents-skills/grilling" }
}
```

- `plugins.<name>.pi` is the folder pi loads as a package (an app's `dist/`), and `.claude` is the folder Claude Code loads as a plugin. A variant the plugin does not have is `null`; a missing key reads as `null`.
- `skills.<name>` is one skill directory, holding a `SKILL.md`.
- `revision` is only reported: `status` and `check` compare it with what each snapshot was published from.

`agents resolve` merges `current.json` over that baseline — an override wins, and a variant a snapshot does not override falls back to the pin — so a partial update is safe, and a name that only the state knows still resolves. When the pin moves, published snapshots keep being used and `agents check` says what is older than the pin.

State lives in `$XDG_STATE_HOME/agents-updates` (default `~/.local/state/agents-updates`):

| Path                                | What it holds                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `current.json`                      | the published overrides: per plugin variant, per skill, and the revision each came from |
| `roots/<stamp>-<pid>-<token>/build` | a GC root per generation: a link to the linkFarm that keeps its outputs alive           |
| `sessions/*.json`, `requests/`      | pi sessions that advertised an update bridge, and the reload requests for them          |
| `lock`                              | serialises updates and resets; `AGENTS_UPDATE_LOCK_TIMEOUT` (default 600) caps the wait |

Roots are never removed. A running session may still be loading an older snapshot — pi holds the paths it started with, Claude Code resolved them at launch — so only a person knows when an old root is dead weight. `nix-collect-garbage` leaves those paths alone until the symlink is deleted by hand:

```bash
ls -l ~/.local/state/agents-updates/roots/          # one directory per generation
rm -r ~/.local/state/agents-updates/roots/<stamp>/  # only when no session uses it
```

`AGENTS_UPDATE_KEEP_SNAPSHOT=1` keeps the temporary snapshot of a successful update, for reading what was actually built; a failed build always keeps it.

## Install it

The flake exports the tool and the flake's own plugin and skill builds; a consumer supplies the environment and the wrapper. Env for `bin/agents`:

| Variable          | What it is                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS_BASELINE` | the manifest above, as a file path                                                                                                                     |
| `AGENTS_CHECKOUT` | the agents checkout `update` publishes from                                                                                                            |
| `AGENTS_NIXPKGS`  | a nixpkgs source store path (`pkgs.path`): what a published snapshot is built against                                                                  |
| `AGENTS_CLAUDE`   | the `claude-code` package store path, **unwrapped**: `mkClaudePlugin` runs `claude plugin validate`, and a wrapper's injected `--plugin-dir` breaks it |
| `AGENTS_SYSTEM`   | the system to build for, e.g. `x86_64-linux`                                                                                                           |

A minimal consumer: `agents`'s flake exports the tool and the flake's own plugin and skill builds, and you write the wrapper that pins them. With `agents` an input and `system` and `pkgs` your own, nothing here assumes your paths:

```nix
let
  updates = agents.packages.${system}.agents-updates;
  # `lib.pluginsFor` needs a system: `path` is that plugin's build (the folder pi loads), and
  # its Claude half is validated and tested against the claude-code that runs it.
  plugins = agents.lib.pluginsFor pkgs;
  claudePlugin = name:
    agents.lib.mkClaudePlugin {inherit pkgs; claude-code = pkgs.claude-code;} name;
  baseline = pkgs.writeText "agents-baseline.json" (builtins.toJSON {
    revision = agents.rev or "";
    plugins = builtins.mapAttrs (name: plugin: {
      pi =
        if plugin.pi
        then "${plugin.path}"
        else null;
      claude =
        if plugin.claude
        then "${claudePlugin name}"
        else null;
    }) plugins;
    skills = agents.lib.skills;
  });
in
  # `home.packages` or `environment.systemPackages`: the same wrapper serves either.
  pkgs.writeShellScriptBin "agents" ''
    export AGENTS_BASELINE=${baseline}
    export AGENTS_CHECKOUT=$HOME/src/agents
    export AGENTS_NIXPKGS=${pkgs.path}
    export AGENTS_CLAUDE=${pkgs.claude-code}
    export AGENTS_SYSTEM=${system}
    exec ${updates}/bin/agents "$@"
  ''
```

That wrapper is the whole contract: the pinned paths in one file, the checkout to publish from, and what a build runs against. `AGENTS_CHECKOUT` is a checkout of this repository — the `apps/` and `skills/` trees are what a name is looked up in. `pkgs.claude-code` is the unwrapped package for the reason in the table above, and `${pkgs.path}` is what makes `context.store` correct: a published snapshot's outputs are checked to be in the store that nixpkgs path came from.

The build runs the snapshot's own flake, so its inputs resolve the way the pinned flake's did; a consumer that already has this flake as an input usually finds them in the store. `nix` must be on `PATH`, and the CLI passes `--extra-experimental-features "nix-command flakes"` itself, so a `nix.conf` that leaves flakes off is not a problem. The package's `bin/agents` puts git, nix, python and coreutils on `PATH`.

## Give a harness the effective paths

`agents-refresh` (env below) turns the resolved state into what one profile actually loads, and owns nothing else in it:

| Harness  | What it writes                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi`     | `<profile>/settings.json`: `skills` (the effective store paths, plus a `-<dir>` exclusion per registry name), the managed entries of `packages`, and `piAgents.twinExtensions`. Third-party packages, `parent/`, `${extensions}/core` and anything else someone added stay. Twins stay the pinned set: publishing a plugin does not promote it into a durable agent's tools.                              |
| `claude` | `<profile>/skills/`: one symlink per skill. Claude Code discovers skills in its config dir and also syncs its own there, so the directory stays a real directory and only the per-name entries are this tool's; an entry a previous generation wrote is replaced, anything else is reported and left alone. The launch settings file is content-addressed and printed on stdout, for `claude --settings`. |

A manifest file (`.agents-updates.json`) records which entries this tool wrote, so a `reset` still recognises one it must remove and a pattern added with `pi config` survives.

| Variable                       | What it is                                                            |
| ------------------------------ | --------------------------------------------------------------------- |
| `AGENTS_HARNESS`               | `pi` or `claude`                                                      |
| `AGENTS_PROFILE`               | the profile root to manage (pi's agent dir, Claude Code's config dir) |
| `AGENTS_BASELINE`              | passed through to `agents resolve`                                    |
| `AGENTS_CLI`                   | the `agents` to resolve through; default: `agents` on `PATH`          |
| `AGENTS_PLUGIN_ORDER`          | space separated load order for Claude Code's plugin dirs              |
| `AGENTS_SKILL_EXTRAS`          | optional JSON file `{name: path}`: skills outside the registry        |
| `AGENTS_CLAUDE_ENV`            | optional JSON file `{"env": {…}}` the launch settings start from      |
| `AGENTS_CLAUDE_SETTINGS_DIR`   | where launch settings go; the chosen file is printed                  |
| `AGENTS_CLAUDE_EXTRA_SETTINGS` | optional JSON object merged into those settings                       |

Run it where a launch can reach it — a pi or Claude Code launcher, or home-manager's activation. It reloads nothing itself.

The Claude skill view is **per profile, not per session**: a publication reaches the next start, and a refresh rewrites the one view every session in that profile reads at its next start, so two sessions in one profile are not isolated from each other. Loaded instructions are not replaced, but a later file read in an older session can see another launch's view.

## Same-user live reload

There is no reload API in either harness that another process can call, so `--live` is a best-effort request, and it never claims more than it knows:

- **pi, installed bridge.** List the package in pi's `settings.packages` (`share/agents-updates/pi`), and set `AGENTS_UPDATES_ENABLED=1`, `AGENTS_REFRESH` (the package's `bin/agents-refresh`) and `AGENTS_PROFILE`. A session then advertises itself in `sessions/` with its pid and a request path; `agents update … --live pi` writes a request, and the bridge — when the session is idle — runs `AGENTS_REFRESH` and reloads its runtime, then acknowledges `applied` or `failed`. It runs only for its own user: the state directory is yours, and the bridge's command is a private name, so a peer message cannot trigger it. Without the bridge nothing happens; `--live` says so.
- **Claude Code, a restart.** It resolves plugin paths and skills at launch, so `--live claude` reports unsupported and the output names the restart. A `SessionStart` hook can run `agents check` and report drift as a message.

`update` prints `requested`/`queued`, and the ack is reported only for the request it belongs to; an unanswered request is not replaced until it is older than ten minutes, so a session cannot be told to reload twice for one update.

## Environment of the tool itself

Optional, in addition to the manifest and harness variables above: `XDG_STATE_HOME` (where the state lives), `AGENTS_UPDATE_LOCK_TIMEOUT` (seconds to wait for a concurrent update, default 600), `AGENTS_UPDATE_KEEP_SNAPSHOT=1`.

## Tests

```bash
pnpm turbo run test --filter=@agents/updates    # the pi bridge, in vitest
pnpm turbo run test --filter=agents-updates     # the Python half, in pytest
nix build .#agents-updates                      # bin/agents, bin/agents-refresh, the pi package
nix flake check                                 # ...and the Python tests through `checks.agents-updates`
```

The Python tests need no nix and no network: a fake `nix` on `PATH` turns the expression it receives into a fake store with the linkFarm shape the CLI reads back, and the checkout is a real (small) git repository. Run one file directly with `uv run --frozen python -m pytest python/test_agents_update.py`.
