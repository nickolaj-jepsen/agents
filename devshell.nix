{
  perSystem = {
    config,
    pkgs,
    ...
  }: let
    media = pkgs.callPackage ./pkgs/media-environment.nix {};
    mediaPackages = media.packages ++ media.graphicsPackages ++ media.vscodePackages;
    # A file naming every tool and path the recorders use: its store path changes with any of them,
    # and building it fetches them all. `//#media-env` builds it, so turbo's key for a recording
    # changes when the environment does.
    mediaEnvironment = pkgs.writeText "agents-media-environment" (
      pkgs.lib.concatMapStringsSep "\n" toString (
        mediaPackages
        ++ builtins.attrValues media.graphicsEnv
        ++ builtins.attrValues media.vscodeEnv
        ++ [media.FONTCONFIG_FILE]
      )
    );
  in {
    # The toolchain the repo pins (`.node-version`, `packageManager`, `.python-version`), for a
    # machine that would rather get it from nix. The agents and linters come from `pnpm install`.
    devShells.default = pkgs.mkShell {
      name = "agents";
      # treefmt plus every formatter `nix fmt` runs, at the same versions.
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

    packages.mediaEnvironment = mediaEnvironment;

    # Runs a command in the recording environment and nothing of the machine's: VS Code and its
    # Claude extension, the fonts, the tools the scenarios call (the agents themselves come from
    # node_modules). The media tasks of turbo and the Pages workflow record in it; so can anyone,
    # signed out: `nix run .#media -- <command>`.
    apps.media = {
      type = "app";
      program = pkgs.lib.getExe (pkgs.writeShellApplication {
        name = "agents-media";
        runtimeInputs = mediaPackages ++ [pkgs.nodejs_24 pkgs.pnpm_12];
        text = ''
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
