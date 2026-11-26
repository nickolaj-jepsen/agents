# `agents-updates`: the explicit publication CLI (`agents`), the profile refresh helper
# (`agents-refresh`) and the pi package that lets a running pi session ask for a reload.
#
# TypeScript run as it is: Node 24 strips the types, so there is no bundle step and no npm
# dependency. The package is a copy of the sources, two wrappers, one small C program and the pi
# package. The C program is the flock(2) holder both wrappers need — Node has no flock binding — and
# it is compiled here for whatever Unix this is built on, because no portable `flock` executable
# exists (util-linux has one, macOS does not). The consumer's own wrapper supplies the environment
# (the pinned manifest and the harness paths) and lists `share/agents-updates/pi` in pi's
# `settings.packages`; see lib/tools/updates/README.md.
{
  lib,
  stdenv,
  stdenvNoCC,
  runCommandLocal,
  writeShellApplication,
  writeText,
  nodejs_24,
  git,
  nix,
  bash,
  coreutils,
  gnused,
  gnugrep,
}: let
  src = ../lib/tools/updates;
  node = "${nodejs_24}/bin/node";

  # The runtime sources, without the specs and their fixtures: what a store copy runs.
  sources = runCommandLocal "agents-updates-src" {} ''
    mkdir -p $out
    shopt -s globstar nullglob
    cd ${src}
    for file in src/**/*.ts; do
      case "$file" in
        *.spec.ts | src/test/*) continue ;;
      esac
      install -Dm644 "$file" "$out/$file"
    done
  '';

  # Holds an exclusive flock(2) on a path until the pipe on its stdin closes, so a Node process that
  # dies (or is killed) releases the lock without leaving a stale file behind; while still waiting it
  # watches the same pipe, so a waiter cannot outlive the process that asked for it. It ignores
  # terminal signals on purpose: Ctrl+C reaches the whole group, and the lock must stay held until
  # the holder's cleanup is done. An older Python `agents` used fcntl.flock on the same inode, so
  # the two exclude each other across an upgrade.
  flock = stdenv.mkDerivation {
    pname = "agents-flock";
    version = "0";
    src = ./agents-flock.c;
    dontUnpack = true;
    buildPhase = ''
      runHook preBuild
      $CC -O2 -Wall -Wextra -o agents-flock $src
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      install -Dm755 agents-flock $out/bin/agents-flock
      runHook postInstall
    '';
    meta = {
      description = "Hold an exclusive flock(2) on a file until stdin closes";
      platforms = lib.platforms.unix;
    };
  };

  # `agents`: the publication CLI. A build is the only backend, so nix, git and coreutils are on
  # PATH; the manifest and the checkout come from the caller's environment (AGENTS_BASELINE,
  # AGENTS_CHECKOUT, AGENTS_NIXPKGS, AGENTS_CLAUDE, AGENTS_SYSTEM).
  cli = writeShellApplication {
    name = "agents";
    runtimeInputs = [nodejs_24 git nix coreutils flock];
    text = ''
      export AGENTS_FLOCK=${flock}/bin/agents-flock
      exec ${node} ${sources}/src/bin.ts "$@"
    '';
  };

  # `agents-refresh`: turns the published state into one profile's skill view and pi settings.
  # It reads the effective paths through `agents resolve`, so this CLI is on PATH; AGENTS_CLI
  # overrides that.
  refresh = writeShellApplication {
    name = "agents-refresh";
    runtimeInputs = [cli nodejs_24 coreutils flock];
    text = ''
      export AGENTS_FLOCK=${flock}/bin/agents-flock
      exec ${node} ${sources}/src/refresh-bin.ts "$@"
    '';
  };

  # The pi package a consumer lists in `settings.packages`: pi loads it from its store path without
  # copying it, and its jiti loader resolves the relative `.ts` imports of the shared core. The
  # bridge is opt-in through AGENTS_UPDATES_ENABLED and does nothing without AGENTS_REFRESH.
  pi = runCommandLocal "agents-updates-pi" {} ''
    mkdir -p $out/extensions/core
    install -Dm644 ${src}/src/agents-update.ts $out/extensions/agents-update.ts
    for file in ${src}/src/core/*.ts; do
      case "$file" in *.spec.ts) continue ;; esac
      install -Dm644 "$file" "$out/extensions/core/$(basename "$file")"
    done
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

  package = stdenvNoCC.mkDerivation {
    pname = "agents-updates";
    version = "0";
    dontUnpack = true;
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      mkdir -p $out/bin $out/share/agents-updates
      ln -s ${cli}/bin/agents $out/bin/agents
      ln -s ${refresh}/bin/agents-refresh $out/bin/agents-refresh
      cp -r ${sources}/src $out/share/agents-updates/src
      ln -s ${pi} $out/share/agents-updates/pi
      runHook postInstall
    '';
    passthru = {inherit cli refresh pi tests;};
  };

  # The package as a consumer gets it, run as a black box: the fake store and checkout, the state
  # file, the kernel lock (including a holder killed mid-update), and both refresh harnesses. The
  # specs that cover each command are `pnpm turbo run test --filter=@agents/updates`; this checks
  # what only the packaged artifact can show.
  tests =
    runCommandLocal "agents-updates-tests" {
      nativeBuildInputs = [bash coreutils gnused gnugrep git nodejs_24 flock];
    } ''
      bash ${./agents-updates-test.sh} ${package}
      touch $out
    '';
in
  package
