/**
 * A stand-in for `hunspell`, for the scenarios that draw the prompt's underlines: CI has no
 * hunspell, and which words a machine's dictionary rejects must not decide what a snapshot shows.
 *
 * It answers the two modes spellfix asks for: `-l` lists the words it rejects, one a line, and
 * `-a` accepts every word, which is enough for the underlines (only `-l` runs without the review
 * being opened).
 */
export const HUNSPELL = `#!/bin/sh
set -eu

mode=
personal=
while [ $# -gt 0 ]; do
  case "$1" in
    -l|-a) mode=$1 ;;
    -d) shift ;;
    -p) shift; personal=\${1:-} ;;
  esac
  shift
done
[ -n "$mode" ] || { echo "hunspell stand-in: no -l or -a" >&2; exit 2; }

rejected() {
  if [ -n "$personal" ] && [ -f "$personal" ] && grep -qxF "$1" "$personal"; then
    return 1
  fi
  case "$1" in
    teh|seperate|recieve|occured) return 0 ;;
  esac
  return 1
}

if [ "$mode" = "-l" ]; then
  tr -cs "[:alpha:]'" '\\n' | while IFS= read -r word; do
    [ -n "$word" ] || continue
    if rejected "$word"; then printf '%s\\n' "$word"; fi
  done
  exit 0
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "") continue ;;
    *) printf '*\\n' ;;
  esac
done
`;
