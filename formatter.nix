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
        "skills/agent-plugin-dev/references/upstream/**" # Generated from upstream docs
        "kit/catalog/COMPONENTS.md" # Checked byte-for-byte against the generator
        "plugins/*/core/cases/**" # Messages as agents wrote them: a formatter would change what the tests parse
        "*.{gitignore,pub,svg,snap,gif}"
      ];
    };
    formatter = config.treefmt.build.wrapper;
  };
}
