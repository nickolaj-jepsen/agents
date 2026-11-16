# `[script]` recipes run under this interpreter; one-liners stay shell recipes.
set script-interpreter := ["bash", "-eu", "-o", "pipefail"]
# Every recipe prints its own error; `[exit-message]` opts a long command back in.
set no-exit-message

nixcmd := "nix --experimental-features 'nix-command flakes'"

[default]
[doc('List the recipes')]
list:
    just --list

[doc('npm install from the lockfile, and link the pi and mod types an editor and tsc need')]
[group('dev')]
[parallel]
dev-setup: _dev-setup-direnv _dev-setup-pi _dev-setup-claude

[private]
_dev-setup-direnv:
    if command -v direnv >/dev/null 2>&1; then direnv allow .; fi

# Links nixpkgs' pi (master) into node_modules, so `npm run typecheck` reads the plugins' pi
# halves against it, as `nix build .#agent-tools` does. `npm ci` prunes the links; re-run this.
[private]
[script]
_dev-setup-pi:
    [ -d node_modules ] || npm ci
    pi=$({{ nixcmd }} build --no-link --print-out-paths --inputs-from . nixpkgs#pi-coding-agent)/lib/node_modules/pi-monorepo
    mkdir -p node_modules/@earendil-works node_modules/@types
    ln -sfn "$pi" node_modules/@earendil-works/pi-coding-agent
    for dep in "$pi"/node_modules/@earendil-works/*; do ln -sfn "$dep" node_modules/@earendil-works/; done
    ln -sfn "$pi/node_modules/typebox" node_modules/typebox
    ln -sfn "$pi/node_modules/@types/node" node_modules/@types/node

# Needs `claude` on PATH: only an interactive session lays the types.
[private]
_dev-setup-claude:
    scripts/dev-setup-claude.sh

[doc("Run the harness-free cores' tests (vitest)")]
[group('dev')]
test:
    npm test

[doc('Type-check the plugins, the kit and the e2e harness (tsc -b)')]
[group('dev')]
typecheck:
    npm run typecheck

[doc("Rewrite every mod's claude/ui.tsx from kit/claude/ui.tsx; plugins named get a copy")]
[group('dev')]
kit-sync *PLUGINS:
    node kit/claude/sync.ts {{ PLUGINS }}

[doc("Rebuild the UI kit's catalogue (kit/catalog)")]
[group('dev')]
catalog:
    npm run catalog

[doc("Play every plugin screen in a real Claude Code and pi and compare with the snapshots; needs sign-in")]
[group('dev')]
e2e *ARGS:
    npm run e2e -- {{ ARGS }}

[doc("Regenerate README.md from the plugins', skills' and docs' sources")]
[group('dev')]
readme:
    npm run readme

[doc('Serve the site (site/) with live reload at http://localhost:4321/agents/')]
[group('site')]
[script]
site:
    [ -d node_modules ] || npm ci
    cd site
    [ -d node_modules ] || npm ci
    npm run dev

[doc('Build the site into site/dist, as the Pages workflow does')]
[group('site')]
[script]
site-build:
    [ -d node_modules ] || npm ci
    cd site
    [ -d node_modules ] || npm ci
    npm run build

# Re-records a demo GIF in a live Claude Code session (README.md, Demos).
[group('dev')]
demo name:
    demos/record.sh {{ name }}

[doc('Build the checked plugin sources')]
[group('maintenance')]
build *ARGS:
    {{ nixcmd }} build {{ ARGS }}

[doc('Format all files using treefmt')]
[group('maintenance')]
fmt:
    {{ nixcmd }} fmt

[doc('Run flake check: tests, type-check, each Claude half validated and tested, formatting')]
[exit-message]
[group('maintenance')]
check:
    {{ nixcmd }} flake check

[group('maintenance')]
clean:
    rm -rf result result-*
