{
  perSystem = {
    config,
    pkgs,
    ...
  }: let
    media = pkgs.callPackage ./pkgs/media-environment.nix {inherit (config.packages) tui-test;};
    pi-dev-links = pkgs.callPackage ./pkgs/pi-dev-links.nix {};
  in {
    devShells.default = pkgs.mkShell {
      name = "agents";
      # treefmt plus every formatter `nix fmt` runs, at the same versions.
      inputsFrom = [config.treefmt.build.devShell];
      packages = [
        pkgs.nodejs # `npm ci`, then `just test` and `just typecheck`; it strips types, so e2e runs .ts as is
        pkgs.just
        pkgs.claude-code
        pkgs.pi-coding-agent
        pi-dev-links
        config.packages.handoff-test
        config.packages.tui-test # The e2e `goto` daemon
        pkgs.pngquant # optimises the kit's crops, with oxipng
        pkgs.oxipng
      ];
    };

    # What `just media` needs and nothing of the machine's: the agents, VS Code and its Claude
    # extension, the fonts, the tools the scenarios call. The Pages workflow records in it; so can anyone, signed out.
    devShells.media = pkgs.mkShell (media.graphicsEnv
      // media.vscodeEnv
      // {
        name = "agents-media";
        packages = media.packages ++ media.graphicsPackages ++ media.vscodePackages ++ [pkgs.just];
        inherit (media) PI_MONOREPO FONTCONFIG_FILE;
      });
  };
}
