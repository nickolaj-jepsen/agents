{
  perSystem = {
    config,
    pkgs,
    ...
  }: let
    media = pkgs.callPackage ./pkgs/media-environment.nix {};
    mediaPackages = media.packages ++ media.graphicsPackages ++ media.vscodePackages;
    # A file naming every tool and path the recorders use: its store path changes with any of them,
    # so `AGENTS_MEDIA_ENV` is the part of turbo's cache key that stands for this environment.
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

    # What `turbo run //#media` needs and nothing of the machine's: VS Code and its Claude
    # extension, the fonts, the tools the scenarios call (the agents themselves come from
    # node_modules). The Pages workflow records in it; so can anyone, signed out.
    devShells.media = pkgs.mkShell (media.graphicsEnv
      // media.vscodeEnv
      // {
        name = "agents-media";
        packages = mediaPackages ++ [pkgs.pnpm_12];
        inherit (media) FONTCONFIG_FILE;
        AGENTS_MEDIA_ENV = "${mediaEnvironment}";
      });
  };
}
