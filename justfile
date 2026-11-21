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

# Links nixpkgs' pi into node_modules, so `typecheck` reads the pi halves against it as the
# nix build does. `npm ci` prunes the links, so re-run this.
[private]
[script]
_dev-setup-pi:
    [ -d node_modules ] || npm ci
    pi-dev-links

# Needs `claude` on PATH: only an interactive session lays the types.
[private]
_dev-setup-claude:
    scripts/dev-setup-claude.sh

[doc("Run the harness-free cores' tests (vitest)")]
[group('dev')]
test:
    npm test

[doc('Lint and test the handoff watchdog and finite command leases without a harness')]
[group('dev')]
handoff-test:
    handoff-test

[doc('Type-check the plugins, the kit and the e2e harness (tsc -b)')]
[group('dev')]
typecheck:
    npm run typecheck

[doc('Lint the TypeScript sources (oxlint)')]
[group('dev')]
lint:
    oxlint --deny-warnings

[doc("Rewrite every mod's claude/ui.tsx from kit/legacy/claude/ui.tsx; plugins named get a copy")]
[group('dev')]
kit-sync *PLUGINS:
    node kit/sync.ts {{ PLUGINS }}

[doc("Replay the UI kit's stories and rewrite the catalogue: its crops (site/media/kit), site/data/kit.json, COMPONENTS.md")]
[group('dev')]
catalog:
    npm run catalog

[doc("Play plugin scenarios in real Claude Code and pi and compare with the snapshots")]
[group('dev')]
e2e *ARGS:
    npm run e2e -- {{ ARGS }}

[doc('Replay a scenario and take over in your terminal or VS Code')]
[group('dev')]
e2e-live PLUGIN SCENARIO *OPTIONS:
    node e2e/cli.ts live {{ quote(PLUGIN) }} {{ quote(SCENARIO) }} {{ OPTIONS }}

[doc('Try the answer plugin in an interactive Claude terminal using a local replay')]
[group('dev')]
answer-demo FIXTURE="details":
    node e2e/answer/live.ts {{ quote(FIXTURE) }}

[doc('Open a canned answer session in Claude Desktop on Linux, or draft a prompt in live mode')]
[group('dev')]
claude-desktop-dev FIXTURE="recommended" MODE="seed":
    node e2e/desktop.ts {{ quote(FIXTURE) }} {{ quote(MODE) }}

[doc("Regenerate README.md from the plugins', skills' and docs' sources")]
[group('dev')]
readme:
    npm run readme

[doc('Refresh the upstream Markdown references in the agent-plugin-dev skill')]
[group('dev')]
[positional-arguments]
plugin-docs PI_TAG="":
    node skills/agent-plugin-dev/scripts/refresh-docs.ts ${1:+"$1"}

[doc('Serve the site (site/) with live reload at http://localhost:4321/agents/')]
[group('site')]
[script]
site:
    [ -d node_modules ] || npm ci
    # The content model and the catalogue's, before Astro reads either: re-run to see a new README
    # or a freshly recorded demo.
    npm run site-data
    [ -f site/data/kit.json ] || npm run catalog -- --no-shots
    cd site
    [ -d node_modules ] || npm ci
    npm run dev

[doc('Build the site into site/dist, as the Pages workflow does')]
[group('site')]
[script]
site-build:
    [ -d node_modules ] || npm ci
    npm run site-data
    [ -f site/data/kit.json ] || npm run catalog -- --no-shots
    cd site
    [ -d node_modules ] || npm ci
    npm run build

[doc("Record the site's demos and screenshots from the e2e scenarios into site/media/ (no sign-in, no model); name plugins to redo only those")]
[group('dev')]
site-shots *PLUGINS:
    npm run site-shots -- {{ PLUGINS }}

[doc("Photograph the mods in VS Code's Claude panel for the site into site/media/ (no sign-in, no model); name plugins to redo only those")]
[group('dev')]
site-vscode *PLUGINS:
    npm run site-vscode -- {{ PLUGINS }}

[doc('Export a trusted asciicast to PNG and MP4 using Kitty on a private X11 display (Linux)')]
[group('dev')]
capture-cast CAST OUT:
    {{ nixcmd }} shell --inputs-from . nixpkgs#nodejs nixpkgs#xvfb-run nixpkgs#xauth nixpkgs#kitty nixpkgs#ffmpeg-full -c node e2e/capture-cast.ts {{ quote(CAST) }} {{ quote(OUT) }}

[doc("Record the site's media and the catalogue through the store: an unchanged recording is not replayed")]
[group('site')]
[script]
media:
    # `.#site-media`, `.#site-kit` and `.#site-vscode` read git-tracked files only: `git add` a new
    # scenario, or use `just media-fresh` to record what is in the tree as it stands.
    out=$({{ nixcmd }} build --no-link --print-out-paths .#site-media)
    kit=$({{ nixcmd }} build --no-link --print-out-paths .#site-kit)
    # VS Code's pictures need cage, a Linux compositor.
    vscode=""
    if [ "$(uname -s)" = Linux ]; then vscode=$({{ nixcmd }} build --no-link --print-out-paths .#site-vscode); fi
    rm -rf site/media
    mkdir -p site/media site/data
    cp -r "$out"/. site/media/
    cp -r "$kit"/kit site/media/kit
    cp "$kit"/kit.json site/data/kit.json
    # The store's files are read-only: the next copy, and the next run, have to write beside them.
    chmod -R u+w site/media site/data
    # Into the terminal's plugin folders: its own files are `vscode-*.png` and `media-vscode.json`.
    if [ -n "$vscode" ]; then cp -r "$vscode"/. site/media/ && chmod -R u+w site/media; fi
    echo "media: site/media/ and site/data/kit.json written from the store"

[doc("Record everything into the tree, ignoring the store: the escape hatch when a recording looks wrong")]
[group('site')]
media-fresh:
    {{ nixcmd }} develop .#media -c just _media

# Inside the media shell: a pi half imports pi's packages, which _dev-setup-pi links.
[private]
[script]
_media: _dev-setup-pi
    npm run catalog
    npm run site-shots
    if [ "$(uname -s)" = Linux ]; then npm run site-vscode; fi

[doc('Build the checked plugin sources')]
[group('maintenance')]
build *ARGS:
    {{ nixcmd }} build {{ ARGS }}

[doc('Format all files using treefmt')]
[group('maintenance')]
fmt:
    {{ nixcmd }} fmt

[doc('Run flake check: tests, type-check, lint, each Claude half validated and tested, formatting')]
[exit-message]
[group('maintenance')]
check:
    {{ nixcmd }} flake check

[group('maintenance')]
clean:
    rm -rf result result-*
