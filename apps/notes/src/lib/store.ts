/**
 * Where a repository's store is and the link a checkout sees it through (docs/adr/0001).
 * The work is one POSIX shell script, so Claude Code and pi run the same thing with whatever
 * starts a process; this file builds its command and reads what it prints.
 */

/** The link's path below a checkout's root, and the line that keeps git from seeing it. */
export const LINK = ".agents/store";
/** The file in the repository's common git directory that holds the store's name. */
export const ID_FILE = "agents-store-id";

/**
 * Where every repository's store lives: `$XDG_DATA_HOME/agents/store`. A relative
 * `XDG_DATA_HOME` is ignored, as the XDG spec says: it would land wherever the script ran.
 */
export const storeRoot = (env: { XDG_DATA_HOME?: string; HOME?: string }) => {
  const data = env.XDG_DATA_HOME?.startsWith("/") ? env.XDG_DATA_HOME : undefined;
  const base = data ?? (env.HOME?.startsWith("/") ? `${env.HOME}/.local/share` : undefined);
  return base ? `${base}/agents/store` : undefined;
};

/**
 * How the link stands once the script has run.
 * - `ok`: it was there already.
 * - `linked`: it was made.
 * - `adopted`: a real folder was there; its files went into the store and the link took its place.
 * - `conflict`: a real folder holds files the store already has under the same names; nothing
 *   was moved, so every file stays where the agent wrote it.
 * - `tracked`: git tracks files under it, or git could not say, so it is left as the repository's.
 * - `busy`: another session held the store for longer than the script waits; run it again later.
 * - `foreign`: a link to somewhere else.
 * - `file`: a file is in the way.
 * - `not-git`: the folder is in no repository, so it has no store.
 * - `failed`: the name or the link could not be written.
 */
export type LinkState =
  | "ok"
  | "linked"
  | "adopted"
  | "conflict"
  | "tracked"
  | "foreign"
  | "file"
  | "not-git"
  | "busy"
  | "failed";

export type Ensured = {
  state: LinkState;
  /** The store's name. */
  id?: string;
  /** The store's own path, outside the checkout. */
  store?: string;
  /** The checkout's root. */
  root?: string;
  /** The main checkout's root, which every worktree of the repository shares. */
  main?: string;
  /** Files moved into the store (`adopted`), or the names the store already has (`conflict`). */
  count?: number;
  /** Where a `foreign` link points, or what went wrong (`failed`). */
  detail?: string;
};

// Prints `key<TAB>value` lines. `$1` is a folder in the checkout, `$2` the folder every store is in.
//
// The name is read from the common git directory, which every worktree shares, so a repository
// that moves keeps its store. A repository without one is given `<folder>-<hash of the main
// checkout's path>`: the name agent-notes computed, so the stores it made are found again.
//
// Moving a folder's files into the store happens under a lock per store, and only when no name
// clashes: two sessions starting at once in two worktrees would otherwise overwrite each other's
// files, and a half-moved folder would hide what an agent just wrote.
const SCRIPT = String.raw`cwd=$1; stores=$2
say() { printf '%s\t%s\n' "$1" "$2"; }
# The checkout is the one cwd is in, whatever the caller's environment points git at.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_NAMESPACE
top=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || { say state not-git; exit 0; }
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { say state not-git; exit 0; }
say root "$top"
main=$(git -C "$cwd" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | head -n 1)
[ -n "$main" ] || main=$top
real=$(cd "$main" 2>/dev/null && pwd -P) && main=$real
say main "$main"

idfile=$common/${ID_FILE}
id=
[ -f "$idfile" ] && id=$(head -n 1 "$idfile" | tr -cd 'A-Za-z0-9._-')
case $id in .|..) id= ;; esac
if [ -z "$id" ]; then
  name=$(basename "$main" | sed 's/[^A-Za-z0-9._-]\{1,\}/-/g; s/^[-.]*//; s/[-.]*$//')
  [ -n "$name" ] || name=repo
  if command -v sha256sum >/dev/null 2>&1; then hash=$(printf %s "$main" | sha256sum)
  else hash=$(printf %s "$main" | shasum -a 256); fi
  id=$name-$(printf %s "$hash" | cut -c1-8)
  { printf '%s\n' "$id" > "$idfile"; } 2>/dev/null || { say state failed; say detail "cannot write $idfile"; exit 0; }
fi
store=$stores/$id
say id "$id"
say store "$store"
mkdir -p "$store" 2>/dev/null || { say state failed; say detail "cannot create $store"; exit 0; }

# One run at a time for a store. A lock older than a minute was left by a run that was killed.
lock=$stores/.$id.lock
tries=0
while ! mkdir "$lock" 2>/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -le 10 ] || { say state busy; exit 0; }
  if [ -n "$(find "$lock" -prune -mmin +1 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; else sleep 1; fi
done
trap 'rmdir "$lock" 2>/dev/null' EXIT
trap 'exit 1' HUP INT TERM

# Counts the names below $1 that $2 already has: what moving $1 into $2 would overwrite.
clashes=0
clash() {
  for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name=$(basename "$entry")
    if [ -d "$entry" ] && [ ! -L "$entry" ] && [ -d "$2/$name" ] && [ ! -L "$2/$name" ]; then
      clash "$entry" "$2/$name"
    elif [ -e "$2/$name" ] || [ -L "$2/$name" ]; then
      clashes=$((clashes + 1))
    fi
  done
}
# Moves what is in $1 into $2, going into a folder both have. Run only once clash found nothing.
merge() {
  for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name=$(basename "$entry")
    if [ -d "$entry" ] && [ ! -L "$entry" ] && [ -d "$2/$name" ] && [ ! -L "$2/$name" ]; then
      merge "$entry" "$2/$name"
    elif [ ! -e "$2/$name" ] && [ ! -L "$2/$name" ]; then
      mv "$entry" "$2/$name" 2>/dev/null
    fi
  done
  rmdir "$1" 2>/dev/null
}
same() { [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$(cd "$2" 2>/dev/null && pwd -P)" ]; }

link=$top/${LINK}
state=ok
if [ -L "$link" ]; then
  same "$link" "$store" || { state=foreign; say detail "$(readlink "$link")"; }
elif [ -e "$link" ]; then
  if [ ! -d "$link" ]; then state=file
  # A git that cannot answer counts as tracked: moving the repository's own files is not undone.
  elif ! tracked=$(git -C "$top" ls-files -- ${LINK} 2>/dev/null) || [ -n "$tracked" ]; then state=tracked
  else
    clash "$link" "$store"
    if [ "$clashes" -gt 0 ]; then state=conflict; say count "$clashes"
    else
      files=$(find "$link" \( -type f -o -type l \) 2>/dev/null | wc -l | tr -d ' ')
      merge "$link" "$store"
      if [ -e "$link" ]; then state=failed; say detail "could not move everything in $link into $store"
      elif ln -sn "$store" "$link" 2>/dev/null; then state=adopted; say count "$files"
      else state=failed; say detail "cannot link $link"; fi
    fi
  fi
else
  mkdir -p "$top/.agents" 2>/dev/null
  if ln -sn "$store" "$link" 2>/dev/null; then state=linked
  elif [ -L "$link" ] && same "$link" "$store"; then state=ok
  else state=failed; say detail "cannot link $link"; fi
fi

case $state in ok|linked|adopted)
  exclude=$common/info/exclude
  if ! grep -qxF '/${LINK}' "$exclude" 2>/dev/null; then
    mkdir -p "$common/info" 2>/dev/null
    [ -s "$exclude" ] && [ -n "$(tail -c 1 "$exclude")" ] && printf '\n' >> "$exclude"
    { printf '%s\n' '/${LINK}' >> "$exclude"; } 2>/dev/null
  fi ;;
esac
say state "$state"
exit 0`;

/**
 * The command that names the store of the repository `cwd` is in and links the checkout to it.
 * @param stores The folder every store is in, from `storeRoot`.
 */
export const ensureArgv = (cwd: string, stores: string): string[] => [
  "sh",
  "-c",
  SCRIPT,
  "sh",
  cwd,
  stores,
];

const STATES: readonly LinkState[] = [
  "ok",
  "linked",
  "adopted",
  "conflict",
  "tracked",
  "foreign",
  "file",
  "not-git",
  "busy",
  "failed",
];

/** What the script printed; a run that printed no state counts as failed. */
export function readEnsure(stdout: string): Ensured {
  const said = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const cut = line.indexOf("\t");
    if (cut > 0) said.set(line.slice(0, cut), line.slice(cut + 1));
  }
  const state = STATES.find((known) => known === said.get("state")) ?? "failed";
  const count = Number(said.get("count"));
  return {
    state,
    id: said.get("id"),
    store: said.get("store"),
    root: said.get("root"),
    main: said.get("main"),
    count: Number.isFinite(count) && said.has("count") ? count : undefined,
    detail: said.get("detail"),
  };
}

/** Whether the checkout has a folder to write notes in and read them from. */
export const hasStore = (ensured: Ensured) =>
  ensured.state !== "not-git" &&
  ensured.state !== "failed" &&
  ensured.state !== "file" &&
  ensured.state !== "busy";

const files = (count: number | undefined) => (count === 1 ? "1 file" : `${count ?? 0} files`);

/**
 * What to tell the person once, when the link is not simply there; nothing for `ok`, `linked`
 * and a folder outside git.
 */
export function noticeOf(ensured: Ensured): string | undefined {
  switch (ensured.state) {
    case "adopted":
      return `Moved ${files(ensured.count)} from ${LINK} into this repository's store and linked it.`;
    case "conflict":
      return `${LINK} holds ${files(ensured.count)} the store already has, so nothing was moved. Move or rename them by hand; the link is made once the folder is gone.`;
    case "tracked":
      return `${LINK} is tracked by git, so notes written there stay in this checkout.`;
    case "foreign":
      return `${LINK} links to ${ensured.detail ?? "another folder"}, not to this repository's store. Left alone.`;
    case "file":
      return `${LINK} is a file, so this checkout has no store.`;
    case "failed":
      return `Couldn't set up the store: ${ensured.detail ?? "the script did not finish"}.`;
    default:
      return undefined;
  }
}

/** The line that tells an agent where its files go. */
export const CONTEXT = `Write notes, plans and other files worth keeping for this repository under \`${LINK}/\`. It is shared by every checkout of the repository and kept out of git.`;
