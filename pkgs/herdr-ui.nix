# Herdr's own window: the layout that places it, and the mods that draw its tabs, spaces and status.
# The artifact is the folder Herdr loads, `mods/` and `layouts/` at its root, and nothing else: the
# `gpui-kit.d.ts` and `jsconfig.json` a mod run writes are the editor's. It is not a Claude or pi
# plugin, so `plugin-apps.nix` does not build it: NixOS's herdr module takes this as its `uiSource`.
{
  lib,
  stdenvNoCC,
  # The app (`apps/herdr-ui`).
  app ? ../apps/herdr-ui,
}:
stdenvNoCC.mkDerivation {
  pname = "herdr-ui";
  inherit ((lib.importJSON (app + "/package.json"))) version;
  dontUnpack = true;
  dontBuild = true;
  # Published as it is: nothing in it is to be patched to a store path.
  dontFixup = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ${app + "/src/mods"} $out/mods
    cp -r ${app + "/src/layouts"} $out/layouts
    runHook postInstall
  '';
}
