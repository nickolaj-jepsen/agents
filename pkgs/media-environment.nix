# The recording environment shared by `nix develop .#media` and the site-media derivations.
# Keeping the tools and fonts together makes a local replay match the sandboxed recording.
{
  callPackage,
  claude-code,
  dejavu_fonts,
  ffmpeg-headless,
  fontconfig,
  git,
  hunspell,
  makeFontsConf,
  nerd-fonts,
  nodejs,
  noto-fonts-cjk-sans,
  oxipng,
  pi-coding-agent,
  pngquant,
  tui-test,
  typescript-language-server,
  unifont,
  which,
}: let
  piMonorepo = "${pi-coding-agent}/lib/node_modules/pi-monorepo";
in {
  packages = [
    (callPackage ./pi-dev-links.nix {inherit pi-coding-agent;})
    nodejs
    git
    which
    fontconfig # fc-list, which the captures read the fonts from
    tui-test
    claude-code
    pi-coding-agent
    ffmpeg-headless
    pngquant
    oxipng
    (hunspell.withDicts (dicts: [dicts.en_US])) # spellfix
    typescript-language-server # lsp; it finds tsserver in the project's own typescript, else its bundled one
  ];

  # What `pi-dev-links` links into node_modules for the kit's pi stories.
  PI_MONOREPO = piMonorepo;
  FONTCONFIG_FILE = makeFontsConf {
    fontDirectories = [
      nerd-fonts.hack
      dejavu_fonts
      noto-fonts-cjk-sans
      unifont
    ];
  };
}
