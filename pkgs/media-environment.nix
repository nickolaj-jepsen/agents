# The recording environment of `nix develop .#media`, which `turbo run //#media` runs in: the tools,
# fonts and VS Code the recorders call. The agents themselves come from node_modules.
{
  buildEnv,
  cage,
  dejavu_fonts,
  ffmpeg-full,
  ffmpeg-headless,
  fontconfig,
  git,
  hunspell,
  inter,
  kitty,
  lib,
  mesa,
  stdenv,
  makeFontsConf,
  nerd-fonts,
  nodejs_24,
  noto-fonts-cjk-sans,
  oxipng,
  pngquant,
  runCommand,
  runtimeShell,
  unifont,
  util-linux,
  vscode,
  vscode-extensions,
  vscode-utils,
  which,
  writeText,
  writeTextDir,
  xauth,
  xvfb-run,
}: let
  hunspellEn = hunspell.withDicts (dicts: [dicts.en_US]);
  # nixpkgs' `code`, as a build can run it. It ends in Microsoft's launcher, whose
  # `#!/usr/bin/env sh` finds no /usr/bin/env in a build, so the shell is handed it instead. And
  # Chromium's own sandbox is off: it needs user namespaces, which a build inside a build sandbox
  # may not get (Ubuntu's AppArmor refuses them), and the build sandbox already holds VS Code in.
  code = runCommand "vscode-launcher" {} ''
    mkdir -p $out/bin
    substitute ${lib.getExe vscode} $out/bin/code \
      --replace-fail '"${vscode}/bin/.code-wrapped"' '${runtimeShell} "${vscode}/bin/.code-wrapped" --no-sandbox'
    chmod +x $out/bin/code
  '';
  # An extensions folder as VS Code keeps one: each extension, and `extensions.json`, which lists
  # them and without which `code --list-extensions` fails.
  extensions = let
    installed = [vscode-extensions.anthropic.claude-code];
  in
    buildEnv {
      name = "vscode-extensions";
      paths = installed ++ [(writeTextDir "share/vscode/extensions/extensions.json" (vscode-utils.toExtensionJson installed))];
    };
  # VS Code's own fonts, apart from the terminal's. Its interface asks for `system-ui`, then
  # `sans-serif`, and its editor for `monospace`: a build has no /etc/fonts to say what those are,
  # and without one fontconfig picks any font, a mono one for the prose, and hints it hard. Inter
  # for the interface, drawn as a desktop draws it, and Hack for code, as in the terminal pictures.
  vscodeFonts = makeFontsConf {
    fontDirectories = [inter nerd-fonts.hack noto-fonts-cjk-sans];
    impureFontDirectories = [];
    includes = [
      (writeText "vscode-fonts.conf" ''
        <?xml version="1.0"?>
        <!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
        <fontconfig>
          <alias binding="same"><family>system-ui</family><prefer><family>Inter</family></prefer></alias>
          <alias binding="same"><family>sans-serif</family><prefer><family>Inter</family></prefer></alias>
          <alias binding="same"><family>sans</family><prefer><family>Inter</family></prefer></alias>
          <alias binding="same"><family>monospace</family><prefer><family>Hack Nerd Font Mono</family></prefer></alias>
          <!-- A desktop's rendering: slight hinting, greyscale antialiasing. -->
          <match target="font">
            <edit name="antialias" mode="assign"><bool>true</bool></edit>
            <edit name="hinting" mode="assign"><bool>true</bool></edit>
            <edit name="hintstyle" mode="assign"><const>hintslight</const></edit>
            <edit name="rgba" mode="assign"><const>none</const></edit>
          </match>
        </fontconfig>
      '')
    ];
  };
in {
  packages = [
    nodejs_24 # `.node-version`: it strips types, so the recorders run as .ts
    git
    which
    fontconfig # fc-list, which the captures read the fonts from
    ffmpeg-headless
    pngquant
    oxipng
    hunspellEn # spellfix
  ];

  # Only the plugin media runner uses these; the component catalogue records through tui-test.
  graphicsPackages = lib.optionals stdenv.hostPlatform.isLinux [kitty xauth xvfb-run];
  graphicsEnv = lib.optionalAttrs stdenv.hostPlatform.isLinux {
    CAST_FFMPEG = lib.getExe ffmpeg-full;
    CAST_MESA = "${mesa}/lib";
  };

  # The VS Code pictures (`site-vscode`): VS Code and its Claude Code extension from this nixpkgs,
  # and cage for a display. The driver takes them from these variables instead of the machine's
  # `code`, `~/.vscode/extensions` and `nix run nixpkgs#cage` (e2e/lib/vscode.ts). The extension
  # runs the `claude` it bundles, of its own version, not the workspace's.
  vscodePackages =
    [
      nodejs_24
      git
      which
      pngquant
      oxipng
      hunspellEn
    ]
    ++ lib.optionals stdenv.hostPlatform.isLinux [
      util-linux # setsid, which detaches the window from the recorder
    ];
  vscodeEnv = lib.optionalAttrs stdenv.hostPlatform.isLinux {
    E2E_VSCODE_CODE = "${code}/bin/code";
    E2E_VSCODE_EXTENSIONS = "${extensions}/share/vscode/extensions";
    E2E_VSCODE_CAGE = lib.getExe cage;
    E2E_VSCODE_FONTCONFIG_FILE = vscodeFonts;
  };

  FONTCONFIG_FILE = makeFontsConf {
    fontDirectories = [
      nerd-fonts.hack
      dejavu_fonts
      noto-fonts-cjk-sans
      unifont
    ];
  };
}
