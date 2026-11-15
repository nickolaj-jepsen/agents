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
        # Adds `pkgs.agent-tools` and `pkgs.tui-test`. agent-tools type-checks the pi halves
        # against `pkgs.pi-coding-agent`, so a system that ships its own pi gets checked
        # against that one; apply this on a pkgs that has it.
        overlays.default = final: _prev: {
          agent-tools = final.callPackage ./pkgs/agent-tools/package.nix {};
          tui-test = final.callPackage ./pkgs/tui-test/package.nix {};
        };

        lib = {
          # The plugins as their folders describe them (README.md, Layout): a Claude half has
          # `.claude-plugin/plugin.json`, a pi half a `pi` key in `package.json`, where
          # `agentTools.subagents` loads it in subagents too.
          # `{ <name> = { claude = bool; pi = bool; subagents = bool; path = <source dir>; }; }`
          plugins = lib.mapAttrs (name: _: let
            dir = pluginsDir + "/${name}";
            pkg = lib.optionalAttrs (builtins.pathExists (dir + "/package.json")) (lib.importJSON (dir + "/package.json"));
          in {
            claude = builtins.pathExists (dir + "/.claude-plugin/plugin.json");
            pi = pkg ? pi;
            subagents = pkg.agentTools.subagents or false;
            path = dir;
          }) (dirs pluginsDir);

          # The agent skills: `{ <name> = <source dir>; }`, one folder with a SKILL.md each.
          skills = lib.mapAttrs (name: _: skillsDir + "/${name}") (dirs skillsDir);

          # One plugin's Claude half, validated and tested against the claude-code that runs
          # it. `agentTools` is the checked sources (`pkgs.agent-tools`): its tests ran first.
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
        unstable = import inputs.nixpkgs-unstable {
          inherit system;
          config.allowUnfree = true;
        };
        # The pi the pi halves are type-checked against and the Claude Code each mod is tested
        # against are pinned in pkgs/, ahead of nixpkgs. A system that pins others builds the
        # same outputs against its own.
        pi-coding-agent = pkgs.callPackage ./pkgs/pi-coding-agent/package.nix {inherit unstable;};
        claude-code = pkgs.callPackage ./pkgs/claude-code/package.nix {inherit unstable;};
        checkPkgs = pkgs.extend (_: _: {inherit pi-coding-agent;});
        agent-tools = checkPkgs.callPackage ./pkgs/agent-tools/package.nix {};
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

        packages =
          {
            inherit agent-tools;
            tui-test = pkgs.callPackage ./pkgs/tui-test/package.nix {};
            default = agent-tools;
          }
          // lib.optionalAttrs pkgs.stdenv.isLinux {
            inherit pi-coding-agent claude-code;
          };

        checks =
          {
            inherit agent-tools;
            marketplace = assert lib.assertMsg marketplaceMatches ".claude-plugin/marketplace.json lists ${toString published}; plugins/ has ${toString expected}";
              pkgs.emptyFile;
          }
          # Every plugin with a Claude half, validated and tested against the pinned Claude Code.
          // lib.optionalAttrs pkgs.stdenv.isLinux (lib.genAttrs (map (name: "claude-${name}") claudePlugins) (
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
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";
    # pi and Claude Code, which the checks run the plugins against; the stable channel lags them.
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };
}
