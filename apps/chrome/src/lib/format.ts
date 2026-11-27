/**
 * What the frame's footer and title say in words: a path as `~/a/b`, a coarse age, a line of text
 * flattened. Pure, so the frame's own tests can ask for a string instead of reading a screen.
 *
 * `home` is handed in rather than read: a lib has no Node, and the session's own `$HOME` is what
 * decides whether a path is shown from `~`. Paths are the shell's, split on `/`.
 */

/** `text` on one line, whitespace collapsed. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// Any CSI (private and colon forms too), then OSC, DCS, PM and APC strings up to BEL or ST.
const TERMINAL_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]P^_][\s\S]*?(?:\x07|\x1b\\)/g;

// Every C0 control and DEL, then the C1 range: their own escape-free forms still move a cursor,
// clear a line or start a sequence where a terminal reads them, so none survives into the row.
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * A label another extension, a repository or a model catalogue supplied, as one plain line:
 * terminal sequences and every C0, DEL and C1 control gone, runs of spaces squeezed. It is drawn in
 * the frame, so nothing it carries may move the cursor, clear a row or break the line.
 */
export const sanitizeLabel = (text: string): string =>
  oneLine(text.replace(TERMINAL_SEQUENCE, "").replace(CONTROLS, " "));

/**
 * A token count as a person reads it: `840`, `12.5k`, `200k`, `1.5M`. The window and the meters
 * share it, so two readings on the same row are set the same way.
 */
export const formatTokens = (count: number): string => {
  if (count < 1000) return `${Math.round(count)}`;
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) {
    const millions = count / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  return `${Math.round(count / 1_000_000)}M`;
};

/**
 * What pi reports the session has cost, as dollars. It is the estimate pi computes from the
 * model's own prices, not a bill; below a tenth of a cent a rounded figure would read as nothing.
 */
export const formatCost = (cost: number): string => {
  if (cost === 0) return "$0.00";
  if (cost < 0.001) return "<$0.001";
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
};

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
