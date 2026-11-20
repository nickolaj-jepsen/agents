# A scenario without an explicit plugin list loads every mod. Splitting the terminal
# recording by plugin wouldn't isolate invalidation: each recording still reads plugins/.
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

  sourceOf = fileset: let
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions ([(root + "/package.json") (root + "/package-lock.json")] ++ fileset);
    };
  in {
    inherit src;
    npmDeps = importNpmLock {npmRoot = src;};
    inherit (importNpmLock) npmConfigHook;
  };
  withSource = fileset: common // sourceOf fileset;

  # The e2e harness without any plugin's scenarios and snapshots: a folder per plugin beside
  # `lib/`, `assets/` and `kit/`.
  sharedHarness = ["lib" "assets" "kit"];
  pluginScenarios = map (name: root + "/e2e/${name}") (
    lib.attrNames (lib.filterAttrs (name: type: type == "directory" && !(lib.elem name sharedHarness)) (builtins.readDir (root + "/e2e")))
  );
  harnessOnly = lib.fileset.difference (root + "/e2e") (lib.fileset.unions pluginScenarios);
  # What the terminal's recordings leave out of `e2e/`: its README, which reaches no screenshot,
  # and the VS Code files below.
  notTerminal = lib.fileset.unions [(root + "/e2e/README.md") vscodeOnly];

  # The VS Code driver and its scenarios, which only `site-vscode` reads: the terminal's recordings
  # leave them out, so an edit to one leaves their media cached. (`lib/site.ts` names a type of
  # `vscode-scenario.ts`, which node erases.)
  vscodeOnly = lib.fileset.unions (
    [
      (root + "/e2e/site-vscode.ts")
      (root + "/e2e/vscode.ts")
      (root + "/e2e/lib/vscode.ts")
      (root + "/e2e/lib/vscode-scenario.ts")
    ]
    ++ lib.filter lib.pathExists (map (dir: dir + "/vscode.scenarios.ts") pluginScenarios)
  );
  # What the VS Code pictures read: the mods, the harness, and the folders of the plugins with VS
  # Code scenarios, less their snapshots and terminal scenarios, which no picture reads.
  vscodeSource =
    [
      (root + "/plugins")
      (root + "/e2e/lib")
      (root + "/e2e/site-vscode.ts")
      (root + "/e2e/tui-test.toml")
    ]
    ++ map (dir:
      lib.fileset.difference
      (lib.fileset.fileFilter (f: !(lib.elem f.name ["claude.scenarios.ts" "pi.scenarios.ts"])) dir)
      (lib.fileset.maybeMissing (dir + "/__snapshots__")))
    (lib.filter (dir: lib.pathExists (dir + "/vscode.scenarios.ts")) pluginScenarios);
in {
  /**
  `site/media/<plugin>/`: the demos and stills of every plugin that has scenarios.
  */
  media = buildNpmPackage (withSource [(root + "/plugins") (root + "/kit") (lib.fileset.difference (root + "/e2e") notTerminal)]
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
  kit = buildNpmPackage (withSource [(root + "/kit") (lib.fileset.difference harnessOnly notTerminal)]
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

  /**
  `site/media/<plugin>/vscode-*.png` and `media-vscode.json`: the Claude panel in VS Code, for the
  plugins whose `site.scenarios.ts` names `vscode` pictures. Linux only: cage is a Wayland
  compositor.
  */
  # A derivation of its own: VS Code, its extension and its driver are inputs the terminal's
  # recording does not read, so a bump of one, or a failure here, leaves `site-media` cached.
  vscode = buildNpmPackage (sourceOf vscodeSource
    // media.vscodeEnv
    // {
      pname = "agents-site-vscode";
      version = "0";
      dontNpmBuild = true;
      doCheck = false;
      nativeBuildInputs = media.vscodePackages;
      buildPhase = ''
        runHook preBuild
        # cage puts its socket in the runtime folder, and VS Code writes under the home: a build has
        # neither.
        export HOME=$(mktemp -d) XDG_RUNTIME_DIR=$(mktemp -d)
        chmod 700 "$XDG_RUNTIME_DIR"
        mkdir -p site/media
        node e2e/site-vscode.ts
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        mkdir -p $out
        cp -r site/media/. $out/
        runHook postInstall
      '';
    });
}
