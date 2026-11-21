# The plugins' sources, checked: the cores' tests and type-check, and each pi half against
# `pi-coding-agent`, so a pi API change fails this build. Override it to check against the pi a
# system ships.
{
  lib,
  buildNpmPackage,
  callPackage,
  importNpmLock,
  pi-coding-agent,
}: let
  pi-dev-links = callPackage ../pi-dev-links.nix {inherit pi-coding-agent;};
  # Only what the check reads, so a skill, demo or README edit doesn't rebuild the mods.
  src = lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [
      ../../package.json
      ../../package-lock.json
      ../../tsconfig.json
      ../../tsconfig.core.json
      ../../tsconfig.pi.json
      ../../vitest.config.ts
      # A plugin's README.md is content, read by the readme check, not by this one.
      (lib.fileset.difference ../../plugins (lib.fileset.fileFilter (file: file.name == "README.md") ../../plugins))
      ../../kit
      # The kit's tests hold its index in AGENTS.md to the manifests, and each client's recorded
      # stories to the shared drawing.
      ../../AGENTS.md
      (lib.fileset.fileFilter (file: file.hasExt "snap") ../../e2e/kit)
      # The e2e harness's sources, so `tsc -b` checks them; the tests need a real agent and never run here.
      (lib.fileset.fileFilter (file: file.hasExt "ts") ../../e2e)
      ../../e2e/tsconfig.json
    ];
  };
in
  buildNpmPackage {
    pname = "agent-tools";
    version = "0";
    inherit src;
    npmDeps = importNpmLock {npmRoot = src;};
    inherit (importNpmLock) npmConfigHook;
    dontNpmBuild = true;
    doCheck = true;
    nativeBuildInputs = [pi-dev-links];
    # npm's install prunes these links, so make them afterwards.
    preCheck = ''
      pi-dev-links
    '';
    checkPhase = ''
      runHook preCheck
      npm run typecheck
      npm test
      runHook postCheck
    '';
    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r plugins kit $out/
      runHook postInstall
    '';
  }
