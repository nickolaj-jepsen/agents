# One plugin's Claude half, validated and tested against a given claude-code, so a bump that
# breaks its API (or drops a keybinding action a plugin borrows) fails the build. The flake's
# `lib.mkClaudePlugin` applies it to each plugin's build.
{
  stdenvNoCC,
  claude-code,
  name,
  # The plugin's build (`packages.<system>.<name>`): the folder `lib/tools/build/build.ts` wrote.
  dist,
}:
stdenvNoCC.mkDerivation {
  name = "claude-code-${name}";
  dontUnpack = true;
  dontFixup = true;
  nativeBuildInputs = [claude-code];
  buildPhase = ''
    runHook preBuild
    export HOME="$TMPDIR"
    cp -r ${dist} plugin
    chmod -R u+w plugin
    cd plugin
    claude plugin validate --strict .
    claude plugin test .
    cd ..
    runHook postBuild
  '';
  # What a mod loads, with the API types the engine laid while it was tested (a store path is not
  # writable at load time). The pi half, its manifest and the tests are the repo's own.
  installPhase = ''
    runHook preInstall
    mv plugin $out
    rm -rf $out/pi $out/package.json $out/*.test.ts
    runHook postInstall
  '';
}
