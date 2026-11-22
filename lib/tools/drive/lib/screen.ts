/**
 * A snapshot is the styled text of the plugin's own surface: the grid cropped to a
 * region, volatile values masked, then written as rows of text, a grid of style ids
 * and a legend. Text and styles diff as plain lines, so a review reads like any diff.
 */
import { realHome } from "./fonts.ts";
import type { Cell, Grid } from "./term.ts";

export type Pattern = string | RegExp;
export type Rect = { x: number; y: number; w: number; h: number };

/** Finds the plugin's surface on the screen, or says it is not there. */
export type Region = (grid: Grid) => Rect | undefined;

/**
 * A volatile value. `with` is what it becomes, fitted to the cells it covered; `$1` to `$9` in it
 * are the pattern's groups.
 */
export type Mask = { pattern: RegExp; with?: string };

export type Row = { text: string; at: number[] };

/** A row as one string, with where each of its cells starts: a wide character's second cell has no text. */
export function rowText(row: Cell[]): Row {
  let text = "";
  const at: number[] = [];
  for (const cell of row) {
    at.push(text.length);
    text += cell.char === "" ? "" : cell.char;
  }
  return { text, at };
}

export const gridLines = (grid: Grid) => grid.map((row) => rowText(row).text.trimEnd());

export const matches = (text: string, pat: Pattern) =>
  typeof pat === "string" ? text.includes(pat) : pat.test(text);

/** Where `pat` first shows on screen, as the cell range of that row, or one per match with `all`. */
export function findText(
  grid: Grid,
  pat: Pattern,
  all = false,
): { x: number; y: number; w: number }[] {
  const found: { x: number; y: number; w: number }[] = [];
  const re =
    typeof pat === "string"
      ? new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
      : new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
  grid.forEach((cells, y) => {
    const { text, at } = rowText(cells);
    for (const m of text.matchAll(re)) {
      if (m[0] === "") continue;
      const start = m.index ?? 0;
      const x = at.findIndex((a, i) => a >= start && (cells[i]?.char ?? "") !== "");
      let end = at.findIndex((a) => a >= start + m[0].length);
      if (end === -1) end = cells.length;
      if (x >= 0) found.push({ x, y, w: Math.max(1, end - x) });
    }
  });
  return all ? found : found.slice(0, 1);
}

// ---- regions

const TOP_LEFT = "╭┌┏╔";
const TOP_RIGHT = "╮┐┓╗";
const BOTTOM_LEFT = "╰└┗╚";
const BOTTOM_RIGHT = "╯┘┛╝";

const ch = (grid: Grid, y: number, x: number) => grid[y]?.[x]?.char ?? "";

/** Every bordered box on the screen, top to bottom. */
function boxes(grid: Grid): Rect[] {
  const out: Rect[] = [];
  const cols = grid[0]?.length ?? 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < cols; x++) {
      if (!TOP_LEFT.includes(ch(grid, y, x)) || ch(grid, y, x) === "") continue;
      let right = -1;
      for (let i = x + 1; i < cols; i++) {
        const c = ch(grid, y, i);
        if (TOP_LEFT.includes(c) && c !== "") break;
        if (TOP_RIGHT.includes(c) && c !== "") {
          right = i;
          break;
        }
      }
      if (right < 0) continue;
      for (let j = y + 1; j < grid.length; j++) {
        const l = ch(grid, j, x);
        if (l !== "" && BOTTOM_LEFT.includes(l)) {
          if (BOTTOM_RIGHT.includes(ch(grid, j, right)) && ch(grid, j, right) !== "")
            out.push({ x, y, w: right - x + 1, h: j - y + 1 });
          break;
        }
      }
    }
  }
  return out;
}

const within = (grid: Grid, r: Rect) =>
  grid
    .slice(r.y, r.y + r.h)
    .map((row) => rowText(row.slice(r.x, r.x + r.w)).text)
    .join("\n");

export const region = {
  /** The whole screen. */
  full: ((grid) => ({ x: 0, y: 0, w: grid[0]?.length ?? 0, h: grid.length })) as Region,

  rect:
    (x: number, y: number, w: number, h: number): Region =>
    () => ({ x, y, w, h }),

  /** The bordered box (`╭─╮ ╰─╯`); with `contains`, the first whose text has it. */
  box:
    (contains?: Pattern): Region =>
    (grid) =>
      boxes(grid).find((b) => contains === undefined || matches(within(grid, b), contains)),

  /**
   * A box with no bottom edge, standing on something: its top edge (`╭─╮`), the rows both its
   * sides run down, and the row they stop on, which shows what it stands on.
   */
  standing: ((grid) => {
    const cols = grid[0]?.length ?? 0;
    for (let y = 0; y < grid.length; y++)
      for (let x = 0; x < cols; x++) {
        if (ch(grid, y, x) === "" || !TOP_LEFT.includes(ch(grid, y, x))) continue;
        let right = x + 1;
        while (
          right < cols &&
          (ch(grid, y, right) === "" || !TOP_RIGHT.includes(ch(grid, y, right)))
        )
          right++;
        if (right >= cols) continue;
        let h = 1;
        while (ch(grid, y + h, x) === "│" && ch(grid, y + h, right) === "│") h++;
        // A closed box has its corners there: `box` finds that one.
        if (h < 2 || BOTTOM_LEFT.includes(ch(grid, y + h, x) || " ")) continue;
        return { x, y, w: right - x + 1, h: Math.min(grid.length - y, h + 1) };
      }
    return undefined;
  }) as Region,

  /** Claude's pane docked as a column on the right: left-edged by a `│` that runs down from the top row. */
  sidebar: ((grid) => {
    const cols = grid[0]?.length ?? 0;
    for (let x = 0; x < cols; x++) {
      if (ch(grid, 0, x) !== "│") continue;
      let h = 0;
      while (h < grid.length && ch(grid, h, x) === "│") h++;
      if (h >= grid.length / 2) return { x, y: 0, w: cols - x, h };
    }
    return undefined;
  }) as Region,

  /** Whole-width rows from the first one matching `from` to the first at or below it matching `to` (default: the last row). */
  rows:
    (from: Pattern, to?: Pattern): Region =>
    (grid) => {
      const lines = gridLines(grid);
      const top = lines.findIndex((l) => matches(l, from));
      if (top < 0) return undefined;
      let bottom = lines.length - 1;
      if (to !== undefined) {
        const rel = lines.slice(top).findIndex((l) => matches(l, to));
        if (rel < 0) return undefined;
        bottom = top + rel;
      }
      return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
    },

  /** The first region that is on screen. */
  any:
    (...candidates: Region[]): Region =>
    (grid) => {
      for (const c of candidates) {
        const r = c(grid);
        if (r) return r;
      }
      return undefined;
    },
};

export const crop = (grid: Grid, r: Rect): Grid =>
  grid.slice(r.y, r.y + r.h).map((row) => row.slice(r.x, r.x + r.w));

// ---- masks

/** `text` padded to `len` cells; a placeholder that does not fit becomes bullets, so columns never move. */
const fit = (text: string, len: number) =>
  text.length > len ? "•".repeat(len) : text.padEnd(len, " ");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A path as a surface may show it: whole, and from `~` when it is under the home folder, as pi's
 * footer shows a run folder whose `$TMPDIR` is there.
 */
const spellings = (path: string) => {
  const home = realHome;
  return path.startsWith(`${home}/`) ? [path, `~${path.slice(home.length)}`] : [path];
};

/** What every plugin's surface can carry that changes between runs. */
export function builtinMasks(paths: string[] = []): Mask[] {
  return [
    ...paths
      .flatMap(spellings)
      .map((p) => ({ pattern: new RegExp(`${escapeRe(p)}[^\\s│]*`, "g"), with: "<tmp>" })),
    { pattern: /\/(?:tmp|var\/folders|run\/user)\/[^\s│]+/g, with: "<tmp>" },
    // pi's footer: the branch follows the folder, so it would stand where the path's length put it.
    { pattern: /<tmp> +(\([^\s()]+\))(?=\s*$)/g, with: "<tmp> $1" },
    // Claude's banner, also where a box cuts it short: the version, the signed-in account's model,
    // effort and plan, and the folder, which it shortens (`~/…/state/agents`).
    { pattern: /(?<=▐▛███▛█ {3})Claude Code[^│]*[^\s│]/g, with: "Claude Code <ver>" },
    { pattern: /(?<=▝▜██████▀ {2})[^│]*[^\s│]/g, with: "<model>" },
    { pattern: /(?<=▝▝ {3}▝▝ {3})[^│]*[^\s│]/g, with: "<tmp>" },
    { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, with: "<uuid>" },
    { pattern: /\bv?\d+\.\d+\.\d+(?:-[\w.]+)?\b/g, with: "<ver>" },
    { pattern: /\$\d+(?:\.\d+)?/g, with: "$<cost>" },
    { pattern: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?/g, with: "<date>" },
    { pattern: /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, with: "<time>" },
    { pattern: /\b\d+h \d+m\b|\b\d+m \d+s\b|\b\d+(?:\.\d+)?(?:ms|s)\b/g, with: "<elapsed>" },
    // pi's context meter estimates the prompt's tokens, and the prompt names the paths of pi's
    // docs: a different install (a store path, a checkout's node_modules) moves the figure.
    { pattern: /\d+(?:\.\d+)?%(?=\/\d+k\b)/g },
  ];
}

const BLANK: Cell = {
  char: " ",
  fg: "default",
  bg: "default",
  bold: false,
  dim: false,
  italic: false,
  inverse: false,
  strike: false,
  invisible: false,
  blink: false,
  underline_style: "none",
};

/**
 * Masks `grid` in place of its text. Each match keeps the cells it covered: the placeholder's keep
 * their styles, and those past it are blank.
 */
export function applyMasks(grid: Grid, masks: Mask[]): Grid {
  const out = grid.map((row) => row.map((c) => ({ ...c })));
  for (const row of out) {
    for (const mask of masks) {
      const { text, at } = rowText(row);
      const re = new RegExp(
        mask.pattern.source,
        mask.pattern.flags.includes("g") ? mask.pattern.flags : mask.pattern.flags + "g",
      );
      for (const m of text.matchAll(re)) {
        if (m[0] === "") continue;
        const start = m.index ?? 0;
        const covered = row.filter(
          (c, i) => c.char !== "" && (at[i] ?? -1) >= start && (at[i] ?? -1) < start + m[0].length,
        );
        const fill =
          mask.with === undefined
            ? "•".repeat(covered.length)
            : fit(
                mask.with.replace(/\$(\d)/g, (_, n: string) => m[Number(n)] ?? ""),
                covered.length,
              );
        const filled = fill.trimEnd().length;
        covered.forEach((c, i) => {
          // Past the placeholder a cell is blank, or a style run keeps the masked text's length
          // (a run folder under a longer $TMPDIR).
          if (i >= filled) Object.assign(c, BLANK);
          else c.char = fill[i] ?? " ";
        });
      }
    }
  }
  return out;
}

// ---- serialization

const IDS = "123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const color = (c: Cell["fg"]) => (typeof c === "number" ? `p${c}` : c);

function styleKey(c: Cell): string {
  const parts: string[] = [];
  if (c.fg !== "default") parts.push(`fg=${color(c.fg)}`);
  if (c.bg !== "default") parts.push(`bg=${color(c.bg)}`);
  for (const flag of ["bold", "dim", "italic", "inverse", "strike", "blink", "invisible"] as const)
    if (c[flag]) parts.push(flag);
  if (c.underline_style !== "none") parts.push(`underline=${c.underline_style}`);
  return parts.join(" ");
}

/** Text rows, then each row's runs of style ids (`.` is the default style), then what each id means. */
export function serialize(title: string, grid: Grid): string {
  const text = gridLines(grid);
  const legend = new Map<string, string>();
  const styleRows = grid.map((row) => {
    const ids = row.map((c) => {
      const key = styleKey(c);
      if (key === "") return ".";
      let id = legend.get(key);
      if (id === undefined) {
        id = IDS[legend.size] ?? "*";
        legend.set(key, id);
      }
      return id;
    });
    while (ids[ids.length - 1] === ".") ids.pop();
    const runs: string[] = [];
    for (let i = 0; i < ids.length;) {
      let j = i;
      while (ids[j] === ids[i]) j++;
      runs.push(j - i > 1 ? `${ids[i]}x${j - i}` : (ids[i] as string));
      i = j;
    }
    return runs.length ? runs.join(" ") : "-";
  });
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  return [
    `# ${title} (${w}x${h})`,
    ...text,
    "--- styles",
    ...styleRows,
    "--- legend",
    ...[...legend].map(([key, id]) => `${id} ${key}`),
    "",
  ].join("\n");
}
