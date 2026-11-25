{self, ...}: {
  perSystem = {
    pkgs,
    lib,
    ...
  }: let
    built = pkgs.callPackage ./pkgs/plugin-apps.nix {root = ./.;};
    agentsUpdates = pkgs.callPackage ./pkgs/agents-updates.nix {};
  in {
    packages =
      # One per plugin: the app's `dist/`, the folder Claude Code and pi load.
      built.apps
      // {
        # The dependencies alone (what `pkgs/pnpm-deps.hash` pins), so a stale hash fails without
        # building an app.
        inherit (built) pnpmDeps;

        # Every plugin, one folder each (`<name>/`): what the `dist` branch holds.
        plugins = pkgs.runCommand "agents-plugins" {} ''
          mkdir $out
          ${lib.concatStringsSep "\n" (lib.mapAttrsToList (name: app: "cp -r --no-preserve=mode ${app} $out/${name}") built.apps)}
        '';

        # The explicit publication tool: `bin/agents`, `bin/agents-refresh` and the pi package
        # at `share/agents-updates/pi`, with the environment left to the consumer's wrapper.
        # See lib/tools/updates/README.md.
        agents-updates = agentsUpdates;
      };

    # Each Claude half through `lib.mkClaudePlugin` too, against this flake's own claude-code, so
    # `nix flake check` builds, validates and tests everything the marketplace serves.
    checks =
      {
        inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) plugins;
        # The tool's own tests, from the scripts the package installs: no store and no network.
        agents-updates = agentsUpdates.passthru.tests;
      }
      // lib.mapAttrs' (name: _:
        lib.nameValuePair "claude-${name}" (self.lib.mkClaudePlugin {
            inherit pkgs;
            inherit (pkgs) claude-code;
          }
          name)) (lib.filterAttrs (_: p: p.claude) self.lib.plugins);

    # Recomputes `pkgs/pnpm-deps.hash` after a lockfile change: the hash of the fetch, which nix
    # reports when it differs from the one written there.
    apps.update-deps-hash = {
      type = "app";
      program = lib.getExe (pkgs.writeShellApplication {
        name = "update-deps-hash";
        runtimeInputs = [pkgs.nix pkgs.git pkgs.coreutils pkgs.gnused pkgs.gnugrep];
        text = ''
          root=$(git rev-parse --show-toplevel)
          file=$root/pkgs/pnpm-deps.hash
          old=$(cat "$file")
          log=$(mktemp)
          trap 'rm -f "$log"' EXIT

          if nix build "$root#pnpmDeps" --no-link 2>"$log"; then
            echo "pkgs/pnpm-deps.hash is current: $old"
            exit 0
          fi
          if ! grep -q 'hash mismatch' "$log"; then
            cat "$log" >&2
            echo "update-deps-hash: the fetch failed, but not on its hash" >&2
            exit 1
          fi

          # A fetch whose hash differs fails with the hash it got.
          new=$(sed -n 's/^ *got: *//p' "$log" | head -n 1)
          if [ -z "$new" ]; then
            cat "$log" >&2
            echo "update-deps-hash: nix reported no hash" >&2
            exit 1
          fi
          printf '%s\n' "$new" >"$file"
          echo "pkgs/pnpm-deps.hash: $old -> $new"
        '';
      });
    };
  };
}
