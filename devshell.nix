{
  perSystem = {
    config,
    pkgs,
    ...
  }: {
    devShells.default = pkgs.mkShell {
      name = "agents";
      # treefmt plus every formatter `nix fmt` runs, at the same versions.
      inputsFrom = [config.treefmt.build.devShell];
      packages = [
        pkgs.nodejs # `npm ci`, then `just test` and `just typecheck`; it strips types, so e2e runs .ts as is
        pkgs.just
        config.packages.tui-test # The e2e `goto` daemon
        pkgs.pngquant # `npm run catalog` optimises the kit's crops with these two
        pkgs.oxipng
      ];
    };
  };
}
