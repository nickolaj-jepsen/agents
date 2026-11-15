# The plugins' sources, checked: the harness-free cores type-check and pass their own
# tests here, and each pi half type-checks against the pi that runs it (so an API change
# there fails this build). A consumer builds each agent's half from `$out/plugins/<name>`
# against the agent that runs it.
#
# `pi-coding-agent` is the pi the pi halves are checked against; override it to check
# against the one a system ships.
{
  lib,
  buildNpmPackage,
  importNpmLock,
  pi-coding-agent,
}: let
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
      ../../plugins
      ../../kit
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
    # A pi half imports the pi that runs, never an npm copy that would drift from it: the
    # links `just dev-setup` makes for an editor, made after npm's install would have pruned them.
    preCheck = ''
      mkdir -p node_modules/@earendil-works
      ln -s ${pi-coding-agent}/lib/node_modules/pi-monorepo node_modules/@earendil-works/pi-coding-agent
      for dep in ${pi-coding-agent}/lib/node_modules/pi-monorepo/node_modules/@earendil-works/*; do
        ln -s "$dep" node_modules/@earendil-works/
      done
      # What a pi half imports beside pi: the typebox pi aliases, and Node's types.
      mkdir -p node_modules/@types
      ln -s ${pi-coding-agent}/lib/node_modules/pi-monorepo/node_modules/typebox node_modules/
      ln -s ${pi-coding-agent}/lib/node_modules/pi-monorepo/node_modules/@types/node node_modules/@types/
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
