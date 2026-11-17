# Microsoft's tui-test, not in nixpkgs: a daemon keeps sessions alive between invocations, which
# the e2e `goto` drives. The npm package has none, so take the release's static binary.
{
  lib,
  stdenvNoCC,
  fetchurl,
}: let
  version = "0.1.1";
  sources = {
    x86_64-linux = {
      target = "x86_64-unknown-linux-musl";
      hash = "sha256-e8S3BqusRIsPcEPJPtZuOcQERNo5VWTYCsfARi03d5U=";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-musl";
      hash = "sha256-8EHIJuvyN2JhP+yWlhHrBx97lrvmW7LiQE10RF6um+4=";
    };
    x86_64-darwin = {
      target = "x86_64-apple-darwin";
      hash = "sha256-KYrj03VJ1HEqd5XTiPTocfO/i3hjNyw0QXh4cMdHQI0=";
    };
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      hash = "sha256-poGVYqGAMbISVl93HQP+nl7H1PcbOJOU/ZCcxmzua4E=";
    };
  };
  source = sources.${stdenvNoCC.hostPlatform.system} or (throw "tui-test: no release for ${stdenvNoCC.hostPlatform.system}");
in
  stdenvNoCC.mkDerivation {
    pname = "tui-test";
    inherit version;
    src = fetchurl {
      url = "https://github.com/microsoft/tui-test/releases/download/${version}/tui-test-${source.target}.tar.gz";
      inherit (source) hash;
    };
    sourceRoot = ".";
    dontConfigure = true;
    dontBuild = true;
    dontFixup = true;
    installPhase = ''
      runHook preInstall
      install -Dm755 tui-test $out/bin/tui-test
      runHook postInstall
    '';
    meta = {
      description = "Headless terminal CLI and daemon for driving TUI programs";
      homepage = "https://github.com/microsoft/tui-test";
      license = lib.licenses.mit;
      mainProgram = "tui-test";
      platforms = builtins.attrNames sources;
    };
  }
