# Run the handoff watchdog's lint and unit tests with every tool they need. The dev shell, the
# flake check and `nix run .#handoff-test` all use this wrapper.
{
  writeShellApplication,
  coreutils,
  git,
  procps,
  python3,
  ruff,
}:
writeShellApplication {
  name = "handoff-test";
  runtimeInputs = [
    coreutils
    git
    procps
    python3
    ruff
  ];
  text = ''
    export PYTHONDONTWRITEBYTECODE=1
    home=$(mktemp -d)
    trap 'rm -rf "$home"' EXIT
    export HOME="$home"

    src=''${1:-skills/run-handoff/scripts}
    ruff check --isolated --select E4,E7,E9,F,I,PLW1510,EXE "$src"
    ruff format --isolated --check "$src"
    python3 -m unittest discover -s "$src" -p 'test_*.py'
  '';
}
