{
  perSystem = {
    config,
    pkgs,
    ...
  }: let
    media = pkgs.callPackage ./pkgs/media-environment.nix {};
    mediaPackages = media.packages ++ media.graphicsPackages ++ media.vscodePackages ++ [pkgs.claude-code];
    # A file naming every tool and path the recorders use: its store path changes with any of them,
    # and building it fetches them all. `@agents/drive#media-env` builds it, so turbo's key for a recording
    # changes when the environment does.
    mediaEnvironment = pkgs.writeText "agents-media-environment" (
      pkgs.lib.concatMapStringsSep "\n" toString (
        mediaPackages
        ++ builtins.attrValues media.graphicsEnv
        ++ builtins.attrValues media.vscodeEnv
        ++ [media.FONTCONFIG_FILE]
      )
    );

    # What both shells hold: the toolchain the repo pins (`.node-version`, `packageManager`,
    # `.python-version`), and treefmt with every formatter `nix fmt` runs, at the same versions. All
    # of it is free software a binary cache carries, so a machine whose store is empty and whose only
    # network is the package registries and `cache.nixos.org` can realise the shell: that is what a
    # docs agent in a VM needs, and `default` is what it gets.
    base = {
      inputsFrom = [config.treefmt.build.devShell];
      packages = [
        pkgs.nodejs_24
        pkgs.pnpm_12
        pkgs.uv
        pkgs.python313
      ];
      # uv's own Pythons are generic Linux builds, which NixOS cannot run.
      UV_PYTHON_DOWNLOADS = "never";
      # The `pi` in node_modules is a bare one; the system's wrapper is what exports the
      # key's location to plugins, so the exa tools would otherwise throw.
      shellHook = ''
        export PI_EXA_KEY_FILE="''${PI_EXA_KEY_FILE:-''${HOME:-}/.pi/agent/exa-api-key}"
      '';
    };
  in {
    # The default shell: install, the specs, the site and `nix fmt`, and no Claude Code. A VM realises
    # this one (nothing else is asked for by name), and `claude-code` is unfree, which no binary cache
    # builds or serves: a shell that held it could only be realised where Anthropic's own download is
    # reachable. Claude Code, and so the gate, `drive` and the recordings, are `.#full`.
    devShells.default = pkgs.mkShell (base
      // {
        name = "agents";
      });

    # The same shell plus the Claude Code the repo pins: the gate's `test:claude` and `e2e` tasks,
    # `pnpm drive`, and `CLAUDE_BIN` for anything that starts a session. `nix develop .#full`.
    devShells.full = pkgs.mkShell (base
      // {
        name = "agents-full";
        packages = base.packages ++ [pkgs.claude-code];
        CLAUDE_BIN = pkgs.lib.getExe pkgs.claude-code;
      });

    packages.mediaEnvironment = mediaEnvironment;

    # Runs a command in the recording environment and nothing of the machine's: VS Code and its
    # Claude extension, the fonts, the tools the scenarios call (pi comes from node_modules).
    # The media tasks of turbo and the Pages workflow record in it; so can anyone,
    # signed out: `nix run .#media -- <command>`.
    apps.media = {
      type = "app";
      program = pkgs.lib.getExe (pkgs.writeShellApplication {
        name = "agents-media";
        runtimeInputs = mediaPackages ++ [pkgs.nodejs_24 pkgs.pnpm_12];
        text = ''
          export CLAUDE_BIN=${pkgs.lib.getExe pkgs.claude-code}
          ${pkgs.lib.concatStringsSep "\n" (pkgs.lib.mapAttrsToList (name: value: "export ${name}=${pkgs.lib.escapeShellArg value}") (media.graphicsEnv
            // media.vscodeEnv
            // {inherit (media) FONTCONFIG_FILE;}))}
          # `nix run .#media -- <drive verb>` is the driver in this environment (`record docfix`);
          # any other command runs as it is.
          case "''${1:-}" in
            ls|live|goto|reload|cap|snap|keys|type|paste|click|hover|wait|resize|shot|sweep|stop|eval|test|record|cast|types)
              exec node "''${AGENTS_ROOT:-$PWD}/lib/tools/drive/drive.ts" "$@" ;;
          esac
          exec "$@"
        '';
      });
    };
  };
}
