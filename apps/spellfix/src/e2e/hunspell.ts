/**
 * A stand-in for `hunspell`, which the screens used to find on the machine's own PATH: CI has
 * none, so a `spellfix` session there drew no findings and every snapshot differed. It answers the
 * two modes the plugin asks for, with this file's words rather than a dictionary's:
 *
 *   -l   list the words it rejects, one a line   (`findMisses`: which words the count and the
 *                                                 review show)
 *   -a   pipe mode: `& word <n> <offset>: <suggestions>` for a rejected word, `*` for one it
 *        accepts, and `*word` / `#` add to and save the `-p` personal dictionary
 *
 * The rejected list is the one real hunspell's `en_US` gave for the drafts the snapshots were
 * recorded with, so a hunspell or dictionary upgrade on a developer's machine cannot move a
 * snapshot. A word a scenario adds to its personal dictionary is accepted, as hunspell would.
 *
 * Only the terminal harnesses hand this in (`start.bin`). The recordings keep the real hunspell
 * the recording environment pins (`nix run .#media`), so the site's pictures are unchanged.
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

# True when \`word\` is one this stand-in flags: hunspell's answer for the drafts these screens
# draw, less anything a scenario added to its personal dictionary.
rejected() {
  if [ -n "$personal" ] && [ -f "$personal" ] && grep -qxF "$1" "$personal"; then
    return 1
  fi
  case "$1" in
    teh|seperate|recieve|occured|wierd|goverment|tommorow|backoff|behaviour) return 0 ;;
  esac
  return 1
}

# hunspell -a's line for a rejected word: the first five suggestions a real hunspell gives for it,
# which is what the picker draws. A word with none still answers, so a scenario may open it.
suggest() {
  case "$1" in
    teh) echo '& teh 5 0: the, eh, tech, tee, tea' ;;
    seperate) echo '& seperate 5 0: separate, desperate, temperate, exasperate, serrate' ;;
    recieve) echo '& recieve 3 0: receive, relieve, reverie' ;;
    occured) echo '& occured 5 0: occurred, occur ed, occur-ed, occur, recurred' ;;
    wierd) echo '& wierd 4 0: weird, wired, wider, wield' ;;
    goverment) echo '& goverment 1 0: government' ;;
    tommorow) echo '& tommorow 2 0: tomorrow, morrow' ;;
    backoff) echo '& backoff 3 0: back off, back-off, backflow' ;;
    behaviour) echo '& behaviour 1 0: behavior' ;;
    *) echo "& $1 0 0: " ;;
  esac
}

if [ "$mode" = "-l" ]; then
  # As hunspell does, split the input into words rather than lines, so a caller may send a draft
  # or a list of words and get the same answer.
  tr -cs "[:alpha:]'" '\\n' | while IFS= read -r word; do
    [ -n "$word" ] || continue
    if rejected "$word"; then printf '%s\\n' "$word"; fi
  done
  exit 0
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "") continue ;;
    "#") continue ;;
    \\**)
      word=\${line#\\*}
      if [ -n "$personal" ]; then printf '%s\\n' "$word" >> "$personal"; fi
      printf '*\\n'
      ;;
    \\^*)
      word=\${line#^}
      if rejected "$word"; then suggest "$word"; else printf '*\\n'; fi
      ;;
    *)
      if rejected "$line"; then suggest "$line"; else printf '*\\n'; fi
      ;;
  esac
done
`;
