{
  self,
  inputs,
  ...
}: {
  perSystem = {pkgs, ...}: let
    inherit (inputs.nixpkgs) lib;
    # nixpkgs is master: Claude Code and pi land there days before unstable, and the
    # plugins follow their newest API. A consumer overrides it with its own.
    inherit (pkgs) claude-code pi-coding-agent;
    checkPkgs = (pkgs.extend (_: _: {inherit claude-code pi-coding-agent;})).extend self.overlays.default;
    inherit (checkPkgs) agent-tools tui-test;
    handoff-test = pkgs.callPackage ./pkgs/handoff-test.nix {};
    site-media = pkgs.callPackage ./pkgs/site-media.nix {inherit tui-test;};
    claudePlugins = lib.attrNames (lib.filterAttrs (_: plugin: plugin.claude) self.lib.plugins);

    # The marketplace publishes each Claude half from its folder; `skills` is the other entry.
    marketplace = lib.importJSON ./.claude-plugin/marketplace.json;
    published = map (p: "${p.name} ${p.source}") (builtins.filter (p: p.name != "skills") marketplace.plugins);
    expected = map (name: "${name} ./plugins/${name}") claudePlugins;
    marketplaceMatches = lib.sort lib.lessThan published == lib.sort lib.lessThan expected;
  in {
    packages =
      {
        inherit agent-tools handoff-test tui-test;
        default = agent-tools;
      }
      # Select the outputs explicitly: callPackage also adds an `override` function to the set.
      // lib.mapAttrs' (name: value: lib.nameValuePair "site-${name}" value) ({inherit (site-media) media kit;}
        # VS Code's pictures: cage, its display, is Linux only.
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {inherit (site-media) vscode;});

    checks =
      {
        inherit agent-tools;
        handoff-runtime = pkgs.runCommand "handoff-runtime-tests" {} ''
          ${handoff-test}/bin/handoff-test ${./skills/run-handoff/scripts}
          touch $out
        '';
        readme = pkgs.callPackage ./pkgs/readme-check.nix {};
        # Reads `.oxlintrc.json`: terminal escapes in regexes are this repo's trade, so that rule is off.
        lint = pkgs.runCommand "oxlint" {nativeBuildInputs = [pkgs.oxlint];} ''
          cd ${self}
          oxlint --deny-warnings
          touch $out
        '';
        # The site reads its content as data (`site/data/`, which `just site` and `just catalog`
        # write first), so its pages reach into `scripts/` and `kit/` for types only, and `site/`
        # alone builds. A value import would need this checkout at build time again.
        site-seam = pkgs.runCommand "site-seam" {} ''
          cd ${./site}
          if grep -rnE 'from "(\.\./)+(scripts|kit)/' src --include='*.ts' --include='*.astro' \
              | grep -vE ':[0-9]+:import type '; then
            echo "site/src imports a value from outside site/; see docs/development.md#preview-the-published-site" >&2
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
}
