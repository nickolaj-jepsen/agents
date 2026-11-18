# The site's recorded pictures and the catalogue's model, as two derivations. Nix keys each on the
# files it reads and on the agent versions it runs, so an unchanged recording is substituted from the
# store (or a binary cache) instead of replayed, and a changed one is the only thing rebuilt.
#
# Why two and not one per plugin: a site scenario that names no `plugins` loads every mod in
# `plugins/`, so every plugin's recording reads the whole plugin tree. A change under `plugins/`
# therefore invalidates all of them; only the kit's stories are separable, and they read no plugin,
# so `site-kit` has a source of its own.
{
  lib,
  buildNpmPackage,
  callPackage,
  importNpmLock,
  tui-test,
}: let
  root = ../.; # this file sits one level under it
  media = callPackage ./media-environment.nix {inherit tui-test;};

  common = {
    inherit (media) PI_MONOREPO FONTCONFIG_FILE;
    dontNpmBuild = true;
    doCheck = false;
    nativeBuildInputs = media.packages;
    # npm's install prunes the pi links, so make them afterwards.
    preBuild = ''
      pi-dev-links
    '';
  };

  # A build's source is the files its recording reads and nothing else, so an edit elsewhere leaves
  # its store path, and so the derivation, as it was. Not `site/`, `docs/` or the skills: none
  # reaches a screenshot.
  withSource = fileset: let
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions ([(root + "/package.json") (root + "/package-lock.json")] ++ fileset);
    };
  in
    common
    // {
      inherit src;
      npmDeps = importNpmLock {npmRoot = src;};
      inherit (importNpmLock) npmConfigHook;
    };

  # The e2e harness without any plugin's scenarios and snapshots: a folder per plugin beside
  # `lib/`, `assets/` and `kit/`.
  sharedHarness = ["lib" "assets" "kit"];
  pluginScenarios = map (name: root + "/e2e/${name}") (
    lib.attrNames (lib.filterAttrs (name: type: type == "directory" && !(lib.elem name sharedHarness)) (builtins.readDir (root + "/e2e")))
  );
  harnessOnly = lib.fileset.difference (root + "/e2e") (lib.fileset.unions pluginScenarios);
in {
  /**
  `site/media/<plugin>/`: the demos and stills of every plugin that has scenarios.
  */
  media = buildNpmPackage (withSource [(root + "/plugins") (root + "/kit") (root + "/e2e")]
    // media.graphicsEnv
    // {
      nativeBuildInputs = common.nativeBuildInputs ++ media.graphicsPackages;
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
  # No plugin: the kit's scenarios load the catalogue mods and nothing else, so a plugin edit
  # leaves it cached.
  kit = buildNpmPackage (withSource [(root + "/kit") harnessOnly]
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
