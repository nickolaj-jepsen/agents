# Every app that is a plugin (a `claude` or a `pi` field in its package.json), built with the
# repo's own bundler (`lib/tools/build/build.ts`): one derivation each, whose output is the app's
# `dist/` (the folder Claude Code and pi load). Returns { apps, pnpmDeps }.
#
# The dependencies are one fixed-output fetch for every app. It installs only the apps, the kit
# packages they import and the build tool (`pnpmWorkspaces`), so a lockfile bump of a package outside
# that set (the site, the e2e driver, the linters) leaves `pnpm-deps.hash` as it is. pnpm installs the
# root's own dependencies (turbo) whatever the filter says, so a turbo bump changes it. Each app then
# installs from that store offline, filtered to its own closure, so an edit to one app rebuilds
# that app alone.
{
  lib,
  stdenvNoCC,
  nodejs_24,
  pnpm_12,
  fetchPnpmDeps,
  pnpmConfigHook,
  # The repo root.
  root ? ../.,
}: let
  inherit (lib) fileset;

  # What the apps themselves never need: the e2e driver, and the catalogue it records.
  devOnly = ["@agents/drive" "@agents/kit-catalog"];

  # Every workspace package, by name: the globs of pnpm-workspace.yaml.
  workspaceDirs = lib.concatMap (parent:
    map (name: "${parent}/${name}") (
      lib.attrNames (lib.filterAttrs (_: type: type == "directory") (builtins.readDir (root + "/${parent}")))
    )) ["apps" "lib/kits" "lib/shared" "lib/tools"];
  manifest = dir: lib.importJSON (root + "/${dir}/package.json");
  workspace = lib.listToAttrs (map (dir: {
    inherit (manifest dir) name;
    value = {
      inherit dir;
      pkg = manifest dir;
    };
  }) (lib.filter (dir: builtins.pathExists (root + "/${dir}/package.json")) workspaceDirs));

  plugins = lib.filterAttrs (_: w: lib.hasPrefix "apps/" w.dir && (w.pkg ? claude || w.pkg ? pi)) workspace;

  # An app whose package.json sets `"private": true` is unreleased: built as `packages.<name>` (so
  # `pnpm drive` and `nix flake check` still run it) but not one the `dist` branch holds.
  released = lib.filterAttrs (_: w: !(w.pkg.private or false)) plugins;

  # The workspace packages a package imports, and what those import in turn, itself included.
  workspaceDeps = pkg:
    lib.filter (n: workspace ? ${n} && !lib.elem n devOnly) (
      lib.attrNames (lib.filterAttrs (_: lib.hasPrefix "workspace:") ((pkg.dependencies or {}) // (pkg.devDependencies or {})))
    );
  closure = name:
    map (x: x.key) (builtins.genericClosure {
      startSet = [{key = name;}];
      operator = {key}: map (key: {inherit key;}) (workspaceDeps workspace.${key}.pkg);
    });

  # A package's files without what only its e2e scenarios and snapshots read.
  sources = name: let
    inherit (workspace.${name}) dir;
  in
    fileset.difference (root + "/${dir}") (fileset.unions (
      lib.filter builtins.pathExists [
        (root + "/${dir}/e2e")
        (root + "/${dir}/src/e2e")
      ]
    ));
  rootFiles = fileset.unions [
    (root + "/package.json")
    (root + "/pnpm-lock.yaml")
    (root + "/pnpm-workspace.yaml")
    # What `patchedDependencies` names: pnpm applies a patch from the tree, so the fetch and every
    # app's install read these files too.
    (root + "/patches")
  ];
  sourceOf = names:
    fileset.toSource {
      inherit root;
      fileset = fileset.unions ([rootFiles] ++ map sources names);
    };

  allNames = lib.unique (lib.concatMap closure (lib.attrNames plugins));

  pnpmDeps = fetchPnpmDeps {
    # A fixed-output fetch whose name and hash stay the same is taken from the store as it is,
    # however the lockfile changed, so a stale hash would pass. The lockfile's digest in the name
    # (the fetch is named after `pname` alone) makes every lockfile change a fetch nix must verify.
    pname = "agents-${builtins.substring 0 12 (builtins.hashFile "sha256" (root + "/pnpm-lock.yaml"))}";
    src = sourceOf allNames;
    pnpm = pnpm_12;
    fetcherVersion = 5;
    hash = lib.fileContents ./pnpm-deps.hash;
    pnpmWorkspaces = allNames;
  };

  mkApp = name: w: let
    names = closure name;
  in
    stdenvNoCC.mkDerivation {
      pname = "agents-${baseNameOf w.dir}";
      version = w.pkg.version or "0";
      src = sourceOf names;
      nativeBuildInputs = [nodejs_24 pnpm_12 pnpmConfigHook];
      inherit pnpmDeps;
      pnpmWorkspaces = names;
      # The output is published as it is: nothing in it is to be patched to a store path.
      dontFixup = true;
      buildPhase = ''
        runHook preBuild
        node lib/tools/build/build.ts ${w.dir}
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        cp -r ${w.dir}/dist $out
        runHook postInstall
      '';
    };
in {
  inherit pnpmDeps;
  # Every plugin, unreleased ones included (`packages.<name>`).
  apps = lib.mapAttrs' (name: w: lib.nameValuePair (baseNameOf w.dir) (mkApp name w)) plugins;
  # The same, minus the private apps: what `packages.plugins` copies, one `<name>/` folder each.
  releasedApps = lib.mapAttrs' (name: w: lib.nameValuePair (baseNameOf w.dir) (mkApp name w)) released;
}
