# The site's recorded pictures and the catalogue's model, as two derivations. Nix keys each on the
# files it reads and on the agent versions it runs, so an unchanged recording is substituted from the
# store (or a binary cache) instead of replayed, and a changed one is the only thing rebuilt.
#
# Why two and not one per plugin: a site scenario that names no `plugins` loads every mod in
# `plugins/`, so every plugin's recording reads the whole plugin tree. A change under `plugins/`
# therefore invalidates all of them; only the kit's stories are separable.
{
  lib,
  buildNpmPackage,
  importNpmLock,
  nodejs,
  claude-code,
  pi-coding-agent,
  tui-test,
  ffmpeg-headless,
  oxipng,
  git,
  which,
  makeFontsConf,
  fontconfig, # fc-list: e2e/lib/fonts.ts links the families it names
  hunspellWithDicts,
  hunspellDicts,
  typescript-language-server,
  nerd-fonts,
  dejavu_fonts,
  noto-fonts-cjk-sans,
  unifont,
}: let
  root = ../.; # this file sits one level under it

  # What a recording reads: the mods it loads, the kit they draw with, and the harness that plays
  # them. Not `site/`, `docs/` or the skills: none reaches a screenshot.
  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/package.json")
      (root + "/package-lock.json")
      (root + "/plugins")
      (root + "/kit")
      (root + "/e2e")
    ];
  };

  piMonorepo = "${pi-coding-agent}/lib/node_modules/pi-monorepo";

  common = {
    inherit src;
    npmDeps = importNpmLock {npmRoot = src;};
    inherit (importNpmLock) npmConfigHook;
    dontNpmBuild = true;
    doCheck = false;
    nativeBuildInputs = [
      nodejs
      git
      which
      ffmpeg-headless
      oxipng
      tui-test
      claude-code
      pi-coding-agent
      (hunspellWithDicts [hunspellDicts.en_US]) # spellfix
      typescript-language-server # lsp
      fontconfig
    ];
    # The shell `just media` gives a person, as the build sees it.
    PI_MONOREPO = piMonorepo;
    FONTCONFIG_FILE = makeFontsConf {
      fontDirectories = [nerd-fonts.hack dejavu_fonts noto-fonts-cjk-sans unifont];
    };
    # A pi half imports the pi that runs, never an npm copy that would drift from it: the same
    # links `just dev-setup` makes for an editor, after npm's install would have pruned them.
    preBuild = ''
      mkdir -p node_modules/@earendil-works node_modules/@types
      ln -s ${piMonorepo} node_modules/@earendil-works/pi-coding-agent
      for dep in ${piMonorepo}/node_modules/@earendil-works/*; do
        ln -s "$dep" node_modules/@earendil-works/
      done
      ln -s ${piMonorepo}/node_modules/typebox node_modules/
      ln -s ${piMonorepo}/node_modules/@types/node node_modules/@types/
    '';
  };
in {
  /**
  `site/media/<plugin>/`: the demos and stills of every plugin that has scenarios.
  */
  media = buildNpmPackage (common
    // {
      pname = "agents-site-media";
      version = "0";
      # Recorded on a stubbed model in a config folder of the run's own: no sign-in, no network.
      buildPhase = ''
        runHook preBuild
        mkdir -p site/media
        SITE_JOBS=''${SITE_JOBS:-2} node e2e/site.ts
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        mkdir -p $out
        cp -r site/media/. $out/
        runHook postInstall
      '';
    });

  /**
  `site/media/kit/` and `site/data/kit.json`: the catalogue's crops and model.
  */
  kit = buildNpmPackage (common
    // {
      pname = "agents-site-kit";
      version = "0";
      buildPhase = ''
        runHook preBuild
        mkdir -p site/media site/data
        # The pictures are the point, not the snapshots: a newer Claude Code that draws a story
        # differently still gets its crop, as the Pages workflow has always done.
        E2E_UPDATE=1 node kit/catalog/build.ts
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        mkdir -p $out
        cp -r site/media/kit $out/kit
        cp site/data/kit.json $out/kit.json
        runHook postInstall
      '';
    });
}
