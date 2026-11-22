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
        pluginsDir = ./apps;
        skillsDir = ./skills;
        dirs = dir: lib.filterAttrs (_: type: type == "directory") (builtins.readDir dir);
      in {
        lib = {
          # An app's package.json decides its halves (a `claude` field, a `pi` manifest), and an app with
          # neither (the site) is no plugin; `agentTools.subagents` loads the pi half in subagents too.
          # `path` is a string into the flake's own source. TODO(dist): it names the app's source, which
          # imports the kit by workspace package; the nix build of `dist/` comes next and replaces it.
          plugins = lib.mapAttrs (name: pkg: {
            claude = pkg ? claude;
            pi = pkg ? pi;
            subagents = pkg.agentTools.subagents or false;
            path = "${self}/apps/${name}";
          }) (lib.filterAttrs (_: pkg: pkg ? claude || pkg ? pi) (lib.mapAttrs (name: _: let
            file = pluginsDir + "/${name}/package.json";
          in
            lib.optionalAttrs (builtins.pathExists file) (lib.importJSON file)) (dirs pluginsDir)));

          # One folder per skill, each with a SKILL.md.
          skills = lib.mapAttrs (name: _: skillsDir + "/${name}") (dirs skillsDir);

          # One plugin's Claude half, validated and tested against the claude-code that runs it.
          mkClaudePlugin = {
            pkgs,
            claude-code,
          }: name:
            pkgs.callPackage ./pkgs/claude-plugin.nix {
              inherit claude-code name;
              src = self.lib.plugins.${name}.path;
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
    # master: the newest VS Code and Claude extension for the media shell; a consumer's own nixpkgs
    # supplies the claude-code that `lib.mkClaudePlugin` checks against.
    nixpkgs.url = "github:nixos/nixpkgs/master";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };
}
