/**
 * What the frame's footer and title say in words: a path as `~/a/b`, a coarse age, a line of text
 * flattened. Pure, so the frame's own tests can ask for a string instead of reading a screen.
 *
 * `home` is handed in rather than read: a lib has no Node, and the session's own `$HOME` is what
 * decides whether a path is shown from `~`. Paths are the shell's, split on `/`.
 */

/** `text` on one line, whitespace collapsed. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** A coarse age: minutes, hours up to two days, then days; `fresh` under a minute. */
export const formatAge = (ms: number, fresh: string) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return fresh;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

/** The parts of `path` below `home`, or undefined when it is not under it. */
const underHome = (path: string, home: string) =>
  path === home
    ? []
    : path.startsWith(`${home}/`)
      ? path
          .slice(home.length + 1)
          .split("/")
          .filter(Boolean)
      : undefined;

/**
 * A directory as its parent prefix and final name, so a footer can dim the road and light the
 * place: the last segment is the worktree or checkout the session is on, the one part that has to
 * read.
 */
export const splitPath = (cwd: string, home: string) => {
  const below = underHome(cwd, home);
  const shown = below === undefined ? cwd : below.length === 0 ? "~" : `~/${below.join("/")}`;
  const cut = shown.lastIndexOf("/");
  return cut < 0
    ? { parent: "", name: shown }
    : { parent: shown.slice(0, cut + 1), name: shown.slice(cut + 1) };
};

/** A directory as `~/a/b`, eliding the middle of deep paths. */
export const shortPath = (cwd: string, home: string) => {
  const below = underHome(cwd, home);
  if (below !== undefined) {
    if (below.length === 0) return "~";
    return below.length <= 2 ? `~/${below.join("/")}` : `~/…/${below[below.length - 1]}`;
  }
  const parts = cwd.split("/").filter(Boolean);
  return parts.length <= 2 ? `/${parts.join("/")}` : `/${parts[0]}/…/${parts[parts.length - 1]}`;
};
