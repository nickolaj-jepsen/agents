{inputs, ...}: {
  imports = [inputs.treefmt-nix.flakeModule];

  perSystem = {config, ...}: {
    treefmt = {
      projectRootFile = "flake.nix";
      programs = {
        deadnix.enable = true;
        alejandra.enable = true;
        statix.enable = true;
        just.enable = true;
        oxfmt.enable = true;
      };
      settings.global.excludes = [
        "result"
        "skills/mermaid/scripts/vendor/*" # Vendored Pele, kept byte-identical to upstream
        "*.{gitignore,pub,svg,snap,gif}"
        # Written by `npm run catalog`, byte for byte what its --check compares.
        "kit/catalog/catalog.json"
        "site/media/kit/crops.json"
      ];
    };
    formatter = config.treefmt.build.wrapper;
  };
}
