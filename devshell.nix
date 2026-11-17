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
        pkgs.pngquant # optimises the kit's crops, with oxipng
        pkgs.oxipng
      ];
    };

    # What `just media` needs and nothing of the machine's: the agents, the fonts, the tools the
    # scenarios call. The Pages workflow records in it; so can anyone, signed out.
    devShells.media = pkgs.mkShell {
      name = "agents-media";
      packages = [
        pkgs.nodejs
        pkgs.just
        pkgs.git
        pkgs.which
        pkgs.fontconfig # fc-list, which the captures read the fonts from
        config.packages.tui-test
        pkgs.claude-code
        pkgs.pi-coding-agent
        pkgs.ffmpeg-headless
        pkgs.pngquant
        pkgs.oxipng
        (pkgs.hunspellWithDicts [pkgs.hunspellDicts.en_US]) # spellfix
        pkgs.typescript-language-server # lsp; it finds tsserver in the project's own typescript, else its bundled one
      ];
      # What `just _dev-setup-pi` links into node_modules for the kit's pi stories.
      PI_MONOREPO = "${pkgs.pi-coding-agent}/lib/node_modules/pi-monorepo";
      FONTCONFIG_FILE = pkgs.makeFontsConf {
        fontDirectories = [
          pkgs.nerd-fonts.hack
          pkgs.dejavu_fonts
          pkgs.noto-fonts-cjk-sans
          pkgs.unifont
        ];
      };
    };
  };
}
