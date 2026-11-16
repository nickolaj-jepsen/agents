# README.md is generated from the plugins', skills' and docs' sources: fails while it is stale, or a
# file under site/media is over budget (scripts/readme.ts --check). Reads only those sources, so a
# change to a plugin's code never reruns it, and agent-tools never reruns for a README or skill edit.
{
  lib,
  buildNpmPackage,
  importNpmLock,
}: let
  root = ./..;
  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/package.json")
      (root + "/package-lock.json")
      (root + "/README.md")
      (root + "/.claude-plugin/marketplace.json")
      (root + "/docs")
      (root + "/skills")
      (root + "/scripts/content.ts")
      (root + "/scripts/readme.ts")
      # Each plugin's README.md, package.json and manifest: what the loader reads.
      (lib.fileset.fileFilter (file: file.name == "README.md" || file.name == "package.json" || file.name == "plugin.json") (root + "/plugins"))
      (lib.fileset.maybeMissing (root + "/site/media"))
    ];
  };
in
  buildNpmPackage {
    pname = "readme-check";
    version = "0";
    inherit src;
    npmDeps = importNpmLock {npmRoot = src;};
    inherit (importNpmLock) npmConfigHook;
    dontNpmBuild = true;
    doCheck = true;
    checkPhase = ''
      runHook preCheck
      node scripts/readme.ts --check
      runHook postCheck
    '';
    installPhase = ''
      touch $out
    '';
  }
