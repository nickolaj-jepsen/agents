#!/usr/bin/env bash
# Writes src/assets/fonts/hack-{regular,bold}.woff2: Hack, the face the terminal captures are drawn
# in, from nixpkgs, cut to the characters the site prints (Latin, punctuation, arrows, box drawing
# and the status glyphs). Run from anywhere; needs nix.
set -euo pipefail
cd "$(dirname "$0")/.."
hack=$(nix build --no-link --print-out-paths nixpkgs#hack-font)/share/fonts/truetype
python='(builtins.getFlake "nixpkgs").legacyPackages.${builtins.currentSystem}.python3.withPackages (p: [ p.fonttools p.brotli ])'
unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+03C0,U+2000-206F,U+2190-21FF,U+2212,U+2260-2265,U+2300-23FF,U+2500-259F,U+25A0-25FF,U+2713,U+2717,U+276F"
for weight in Regular Bold; do
  out=src/assets/fonts/hack-${weight,,}.woff2
  nix shell --impure --expr "$python" -c \
    pyftsubset "$hack/Hack-$weight.ttf" --unicodes="$unicodes" --flavor=woff2 \
    --layout-features='kern,calt' --output-file="$out"
  echo "$out: $(stat -c %s "$out") bytes"
done
