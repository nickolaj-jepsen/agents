# One plugin's Claude half, validated and tested against a given claude-code, so a bump that
# breaks its API (or drops a keybinding action a plugin borrows) fails the build. The flake's
# `lib.mkClaudePlugin` applies it to each plugin.
{
  stdenvNoCC,
  claude-code,
  name,
  # The plugin's folder in the flake's source (`lib.plugins.<name>.path`).
  src,
}:
stdenvNoCC.mkDerivation {
  name = "claude-code-${name}";
  # A copy of the folder alone, so an edit elsewhere in the repo leaves the build cached.
  src = builtins.path {
    path = src;
    name = "claude-code-${name}-src";
  };
  nativeBuildInputs = [claude-code];
  buildPhase = ''
    runHook preBuild
    export HOME="$TMPDIR"
    claude plugin validate .
    claude plugin test .
    runHook postBuild
  '';
  # What a mod loads: the rest of the folder (package.json, tsconfigs, tests, the pi half) is the
  # repo's own.
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r .claude-plugin hooks claude $out/
    rm -f $out/claude/*.test.ts $out/claude/*.test.tsx $out/claude/tsconfig.json
    if [ -d core ]; then
      cp -r core $out/
      rm -f $out/core/*.spec.ts
    fi
    runHook postInstall
  '';
}
