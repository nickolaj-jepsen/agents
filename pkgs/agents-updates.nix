# `agents-updates`: the explicit publication CLI (`agents`), the profile refresh helper
# (`agents-refresh`) and the pi package that lets a running pi session ask for a reload.
#
# Plain stdlib Python and one TypeScript file, so nothing is bundled and no npm dependency is
# fetched: `nix build .#agents-updates` is a copy and two wrappers. The consumer's own wrapper
# supplies the environment (the pinned manifest and the harness paths) and lists
# `share/agents-updates/pi` in pi's `settings.packages`; see lib/tools/updates/README.md.
{
  stdenvNoCC,
  runCommandLocal,
  writeShellApplication,
  writeText,
  python3,
  git,
  nix,
  bash,
  coreutils,
  gnused,
  gnugrep,
}: let
  src = ../lib/tools/updates;

  # The scripts, as a consumer's own wrapper runs them: the interpreter comes from the wrapper,
  # so a caller that bakes in its own environment needs nothing but the file.
  scripts = runCommandLocal "agents-updates-scripts" {} ''
    mkdir -p $out
    install -Dm644 ${src}/python/agents-update.py $out/agents-update.py
    install -Dm644 ${src}/python/agents-refresh.py $out/agents-refresh.py
    # The UI deployer: agents-update.py puts this directory on sys.path, so the two travel
    # together (it is imported, not executed).
    install -Dm644 ${src}/python/agents_ui.py $out/agents_ui.py
  '';

  # `agents`: the publication CLI. A build is the only backend, so nix, git and coreutils are on
  # PATH; the manifest and the checkout come from the caller's environment (AGENTS_BASELINE,
  # AGENTS_CHECKOUT, AGENTS_NIXPKGS, AGENTS_CLAUDE, AGENTS_SYSTEM).
  cli = writeShellApplication {
    name = "agents";
    runtimeInputs = [python3 git nix coreutils];
    text = ''
      exec ${python3.interpreter} ${scripts}/agents-update.py "$@"
    '';
  };

  # `agents-refresh`: turns the published state into one profile's skill view and pi settings.
  # It reads the effective paths through `agents resolve`, so this CLI is on PATH; AGENTS_CLI
  # overrides that.
  refresh = writeShellApplication {
    name = "agents-refresh";
    runtimeInputs = [cli python3 coreutils];
    text = ''
      exec ${python3.interpreter} ${scripts}/agents-refresh.py "$@"
    '';
  };

  # The pi package a consumer lists in `settings.packages`: pi loads it from its store path
  # without copying it. The bridge is opt-in through AGENTS_UPDATES_ENABLED and does nothing
  # without AGENTS_REFRESH.
  pi = runCommandLocal "agents-updates-pi" {} ''
    mkdir -p $out/extensions
    install -Dm644 ${src}/src/agents-update.ts $out/extensions/agents-update.ts
    install -Dm644 ${writeText "agents-updates-pi.manifest.json" (builtins.toJSON {
      name = "agents-updates";
      version = "0.0.0";
      private = true;
      description = "Explicit local updates for the agents plugins: pi's reload bridge";
      keywords = ["pi-package"];
      pi.extensions = ["./extensions/agents-update.ts"];
    })} \
      $out/package.json
  '';

  # The Python half's own tests, from the installed scripts: the fake nix and the git checkouts
  # need bash, git and coreutils, and no store or network is touched.
  tests =
    runCommandLocal "agents-updates-tests" {
      nativeBuildInputs = [python3 git bash coreutils gnused gnugrep];
    } ''
      # The installed scripts, beside their specs: the tests read the CLI from their own
      # directory, and a store copy is read-only.
      mkdir tests
      cd tests
      install -m644 ${scripts}/agents-update.py ${scripts}/agents-refresh.py ${scripts}/agents_ui.py .
      install -m644 ${src}/python/test_agents_update.py ${src}/python/test_agents_refresh.py ${src}/python/test_agents_ui.py .
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      python3 -m unittest discover -s . -p 'test_agents_*.py'
      touch "$out"
    '';
in
  stdenvNoCC.mkDerivation {
    pname = "agents-updates";
    version = "0";
    dontUnpack = true;
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      mkdir -p $out/bin $out/share/agents-updates/python
      ln -s ${cli}/bin/agents $out/bin/agents
      ln -s ${refresh}/bin/agents-refresh $out/bin/agents-refresh
      install -Dm644 ${scripts}/agents-update.py $out/share/agents-updates/python/agents-update.py
      install -Dm644 ${scripts}/agents-refresh.py $out/share/agents-updates/python/agents-refresh.py
      install -Dm644 ${scripts}/agents_ui.py $out/share/agents-updates/python/agents_ui.py
      ln -s ${pi} $out/share/agents-updates/pi
      runHook postInstall
    '';
    passthru = {inherit cli refresh pi tests;};
  }
