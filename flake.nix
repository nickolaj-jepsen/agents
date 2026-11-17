{
  description = "Plugins for Claude Code and pi, and agent skills";

  outputs = {
    flake-parts,
    nixpkgs,
    self,
    ...
  } @ inputs:
    flake-parts.lib.mkFlake {inherit inputs;} {
      imports = [
        ./formatter.nix
        ./devshell.nix
      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      flake = let
        inherit (nixpkgs) lib;
        pluginsDir = ./plugins;
        skillsDir = ./skills;
        dirs = dir: lib.filterAttrs (_: type: type == "directory") (builtins.readDir dir);
      in {
        # The plugin sources (pi halves checked against the consumer's `pi-coding-agent`) and tui-test.
        overlays.default = final: _prev: {
          agent-tools = final.callPackage ./pkgs/agent-tools/package.nix {};
          tui-test = final.callPackage ./pkgs/tui-test/package.nix {};
        };
        overlays.tools = self.overlays.default;

        lib = {
          # A plugin's folder decides its halves; `agentTools.subagents` loads the pi half in subagents too.
          plugins = lib.mapAttrs (name: _: let
            dir = pluginsDir + "/${name}";
            pkg = lib.optionalAttrs (builtins.pathExists (dir + "/package.json")) (lib.importJSON (dir + "/package.json"));
          in {
            claude = builtins.pathExists (dir + "/.claude-plugin/plugin.json");
            pi = pkg ? pi;
            subagents = pkg.agentTools.subagents or false;
            path = dir;
          }) (dirs pluginsDir);

          # One folder per skill, each with a SKILL.md.
          skills = lib.mapAttrs (name: _: skillsDir + "/${name}") (dirs skillsDir);

          # One plugin's Claude half, checked against the claude-code that runs it; `agentTools`'s
          # own tests have run first.
          mkClaudePlugin = {
            pkgs,
            claude-code,
            agentTools ? pkgs.agent-tools,
          }: name:
            pkgs.callPackage ./pkgs/claude-plugin.nix {
              inherit claude-code name;
              agent-tools = agentTools;
            };
        };
      };

      perSystem = {
        pkgs,
        system,
        ...
      }: let
        inherit (nixpkgs) lib;
        # nixpkgs is master: Claude Code and pi land there days before unstable, and the
        # plugins follow their newest API. A consumer overrides it with its own.
        inherit (pkgs) claude-code pi-coding-agent;
        checkPkgs = (pkgs.extend (_: _: {inherit claude-code pi-coding-agent;})).extend self.overlays.default;
        inherit (checkPkgs) agent-tools tui-test;
        claudePlugins = lib.attrNames (lib.filterAttrs (_: plugin: plugin.claude) self.lib.plugins);

        # The marketplace publishes each Claude half from its folder; `skills` is the other entry.
        marketplace = lib.importJSON ./.claude-plugin/marketplace.json;
        published = map (p: "${p.name} ${p.source}") (builtins.filter (p: p.name != "skills") marketplace.plugins);
        expected = map (name: "${name} ./plugins/${name}") claudePlugins;
        marketplaceMatches = lib.sort lib.lessThan published == lib.sort lib.lessThan expected;
      in {
        _module.args.pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        packages = {
          inherit agent-tools;
          inherit tui-test;
          default = agent-tools;
        };

        checks =
          {
            inherit agent-tools;
            handoff-runtime = pkgs.runCommand "handoff-runtime-tests" {nativeBuildInputs = [pkgs.python3 pkgs.git pkgs.procps pkgs.ruff];} ''
              export HOME=$(mktemp -d)
              export PYTHONDONTWRITEBYTECODE=1
              ruff check --isolated --select E4,E7,E9,F,I,PLW1510,EXE ${./skills/run-handoff/scripts}
              ruff format --isolated --check ${./skills/run-handoff/scripts}
              python3 -m unittest discover -s ${./skills/run-handoff/scripts} -p 'test_*.py'
              touch $out
            '';
            readme = pkgs.callPackage ./pkgs/readme-check.nix {};
            # The site reads its content as data (`site/data/content.json`, which `just site` writes
            # first), so its pages reach into `scripts/` and `kit/` for types only, and `site/` alone
            # builds. A value import would need this checkout at build time again.
            site-seam = pkgs.runCommand "site-seam" {} ''
              cd ${./site}
              if grep -rnE 'from "(\.\./)+(scripts|kit)/' src --include='*.ts' --include='*.astro' \
                  | grep -vE ':[0-9]+:import type '; then
                echo "site/src imports a value from outside site/; see docs/layout.md" >&2
                exit 1
              fi
              touch $out
            '';
            marketplace = assert lib.assertMsg marketplaceMatches ".claude-plugin/marketplace.json lists ${toString published}; plugins/ has ${toString expected}";
              pkgs.emptyFile;
          }
          # Every plugin with a Claude half, validated and tested against nixpkgs' Claude Code.
          // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux (lib.genAttrs (map (name: "claude-${name}") claudePlugins) (
            check:
              self.lib.mkClaudePlugin {
                pkgs = checkPkgs;
                inherit claude-code;
                agentTools = agent-tools;
              }
              (lib.removePrefix "claude-" check)
          ));
      };
    };

  inputs = {
    # master: the newest claude-code and pi-coding-agent to check the plugins against.
    nixpkgs.url = "github:nixos/nixpkgs/master";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };
}
