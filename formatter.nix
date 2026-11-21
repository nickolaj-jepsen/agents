{inputs, ...}: {
  imports = [inputs.treefmt-nix.flakeModule];

  perSystem = {config, ...}: {
    treefmt = {
      projectRootFile = "flake.nix";
      # Nix files only; oxfmt and ruff format the rest through turbo.
      programs = {
        deadnix.enable = true;
        alejandra.enable = true;
        statix.enable = true;
      };
      settings.global.excludes = ["result"];
    };
    formatter = config.treefmt.build.wrapper;
  };
}
