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
        ./packages.nix
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

      perSystem = {system, ...}: {
        _module.args.pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
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
