# One plugin's Claude half, validated and tested against a given claude-code, so a bump
# that breaks its API (or drops a keybinding action spellfix borrows) fails the build.
# The install leaves out tests and the editor's tsconfig: `.claude-plugin/`, `hooks/`,
# `claude/` and, when pi shares it, the harness-free `core/`.
#
# Not callPackage'd per plugin: `lib.mkClaudePlugin` in the flake applies it.
{
  stdenvNoCC,
  claude-code,
  agent-tools,
  name,
}:
stdenvNoCC.mkDerivation {
  name = "claude-code-${name}";
  # Through agent-tools, so the plugin's own tests and type-check have passed first.
  src = "${agent-tools}/plugins/${name}";
  nativeBuildInputs = [claude-code];
  buildPhase = ''
    runHook preBuild
    export HOME="$TMPDIR"
    claude plugin validate .
    claude plugin test .
    runHook postBuild
  '';
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
