/**
 * The Claude Code mod UI kit: the house style (skills/agent-plugin-dev/references/style.md) as
 * functions that return a mod's element trees. Its tokens are the pi kit's (`kit/pi/tokens.ts`),
 * whose names it follows where the component exists in both.
 *
 * This file is the source of truth. The engine cannot import outside a plugin's folder, so
 * every mod that uses it carries a verbatim copy at `claude/ui.tsx`: edit this one and run
 * `just kit-sync`; `kit/claude/ui.spec.ts` fails while a copy differs.
 */
import type { ElementTable, ImageSource, RenderNode } from "claude-code";

/** The elements the kit draws with, from `$.ui.resolve(e)`. */
export type Els = Pick<ElementTable<"terminal">, "Box" | "Text" | "Button" | "Link" | "Markdown">;

/** The terminal-only picture element. */
export type ImageEls = Pick<ElementTable<"terminal">, "Image">;

/** The vector leaf of the graphical surfaces: absent on the terminal. */
export type GuiEls = Pick<ElementTable<"desktop">, "Svg">;

/**
 * What every drawing function takes first: the elements of the surface and what it measured.
 * Image is terminal-only, Svg graphical-only.
 */
export type Kit = Els &
  Partial<ImageEls> &
  Partial<GuiEls> & {
    /** The surface the elements came from. */
    surface: string;
    /**
     * The desktop app, the editor and the others that draw real controls in a proportional font:
     * the kit draws them with their own idioms, never the terminal's cells.
     */
    isNative: boolean;
    /**
     * The room in cells the terminal drawing sets text in: the pane's or band's `bodyColumns`, else
     * the viewport's. A graphical drawing reads none of it.
     */
    columns: number;
    /** The rows a band may take: `props.maxRows`. */
    maxRows?: number;
    /** A pane too short for blank rows between its blocks (terminal only). */
    isTight: boolean;
    /** The pane's own title, which a graphical surface already draws above the body. */
    title?: string;
    /** `dock`, `inline` or `widget`, where the event says. */
    placement?: string;
  };

/** The parts of a render event the kit reads: `e` itself, whichever component it is for. */
export type KitEvent = {
  surface: string;
  viewport?: { columns: number };
  props?: object;
};

/** A pane with fewer body rows than this drops the blank rows between its blocks. */
const TIGHT_ROWS = 16;

/**
 * Binds the resolved elements to the surface they came from, and to the room it measured.
 * @param els What `$.ui.resolve(e)` answered.
 * @param e The render event: `surface`, `viewport` and the pane's or band's `props`.
 */
export const kitOf = (els: Els & Partial<ImageEls> & Partial<GuiEls>, e: KitEvent): Kit => {
  const p = (e.props ?? {}) as {
    bodyColumns?: number;
    maxRows?: number;
    title?: string;
    placement?: string;
    scroll?: { bodyRows?: number };
  };
  return {
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    Markdown: els.Markdown,
    Image: els.Image,
    Link: els.Link,
    Svg: els.Svg,
    surface: e.surface,
    isNative: e.surface !== "terminal",
    columns: Math.max(1, Math.floor(p.bodyColumns ?? e.viewport?.columns ?? 80)),
    maxRows: p.maxRows,
    isTight: (p.scroll?.bodyRows ?? Infinity) < TIGHT_ROWS,
    title: p.title,
    placement: p.placement,
  };
};

/** The same kit in a room of `columns` cells: what a narrower region of the terminal draws at. */
export const withColumns = (k: Kit, columns: number): Kit => ({
  ...k,
  columns: Math.max(1, Math.floor(columns)),
});

/**
 * Options that differ by surface. `tui` is the terminal's; `gui` is every graphical surface's;
 * `desktop`, `vscode` and `mobile` override `gui` on that one. The kit merges them with `surfaceOf`.
 */
export type BySurface<T> = {
  tui?: T;
  gui?: T;
  desktop?: T;
  vscode?: T;
  mobile?: T;
};

/** The options that apply on this kit's surface: the terminal's, or `gui` with its own surface's over it. */
export function surfaceOf<T extends object>(k: Kit, o: BySurface<T> | undefined): Partial<T> {
  if (!o) return {};
  if (!k.isNative) return o.tui ?? {};
  const own = (o as Record<string, T | undefined>)[k.surface];
  return { ...o.gui, ...own };
}

/** One drawing per surface, each made only when it is the one shown. */
export type Drawings<T> = {
  tui: () => T;
  gui: () => T;
  desktop?: () => T;
  vscode?: () => T;
  mobile?: () => T;
};

/**
 * The one door through which a mod draws by surface itself. A mod describes content and intent
 * and the kit draws it on each surface; this is for what the kit can't draw yet: a terminal
 * screen the mod lays out to the cell, beside a graphical one built from the kit's functions,
 * or a value only one surface has (a hotkey the graphical surfaces would draw as a chip). `tui`
 * is the terminal's; `gui` every graphical surface's; `desktop`, `vscode` and `mobile` replace
 * `gui` on that one. Only the chosen one runs.
 */
export function forSurface<T>(k: Kit, drawings: Drawings<T>): T {
  if (!k.isNative) return drawings.tui();
  const own = (drawings as Record<string, (() => T) | undefined>)[k.surface];
  return (own ?? drawings.gui)();
}

/**
 * The house style's numbers, glyphs and colour roles; one edit here restyles every mod that
 * carries a fresh copy of this file.
 */
export const tokens = {
  /** Width classes: caps in columns, never targets. `wide` is the pane less `wideMargin`. */
  width: { reading: 96, split: 124, dialog: 72, wideMargin: 2 },
  /** What a pane is opened with, whichever mod opens it: `"transparent"` is no fill under the body. */
  pane: { backgroundColor: "transparent" },
  /** Prose is wrapped at this measure even in a wider pane. */
  prose: 80,
  /** From this many pane columns a list with detail is two panes; below it stacks. */
  splitFrom: 110,
  /** Cells of padding inside a border. */
  padding: 1,
  /** Cells between metadata columns, and before the first. */
  gutter: 2,
  /** Cells between the keys of a button row. */
  keyGap: 3,
  /** From this pane width dated entries use a date column; narrower, a date line. */
  entriesFrom: 50,
  /** Cells of the date column of dated entries: an ISO date. */
  dateWidth: 10,
  /** A row's title is never given less than this; metadata columns drop first. */
  minTitle: 16,
  glyph: {
    pointer: "❯",
    multi: { off: "□", on: "■" },
    single: { off: "○", on: "●" },
    ellipsis: "…",
    more: { up: "↑", down: "↓" },
    rule: "─",
    done: "✓",
    times: "×",
    noteMid: "│",
    noteEnd: "╰▸",
    kind: { missing: "+", stale: "↻", wrong: "!" },
    status: { warning: "⚠" },
    fold: { closed: "▸", open: "▾" },
  },
  /** Lines of a folded claim on the terminal. */
  foldedLines: 3,
  /** Inline code on the terminal, outside a `Markdown`: the theme colour its Markdown uses. */
  code: "permission",
  /** The graphical surfaces' numbers: none of them is a cell. */
  gui: {
    /** A long list shows this many rows, then an `N more` row. */
    maxItems: 12,
    /**
     * The widest a choice's label may be, in cells, before a graphical surface sets it as text
     * under a Button of its `short` word: a Button never wraps and runs off a 420-pixel pane.
     */
    maxLabel: 34,
    /**
     * Icon colours. The host's theme cannot be read from a mod and an image cannot follow it, so
     * the neutral is one mid-grey that reads on light and dark; colour marks a state only.
     */
    tone: {
      neutral: "#8b8f98",
      error: "#e5534b",
      warning: "#d4962a",
      success: "#3fa65b",
    },
    /** An icon's side, in CSS pixels. */
    icon: 16,
    /**
     * The column, in cells, that leads each row of a choice drawn as rows: its key's Button (`A`)
     * or an icon, centred, so every row's text starts at one edge.
     */
    lead: 4.6,
    /**
     * A passage longer than this, in cells, or of more than one line, is cut to one line with a
     * `More` beside it (`excerpt`): about what one line of a 420-pixel band holds beside the button.
     */
    excerptCells: 40,
    /**
     * The vertical rhythm, in lines of body text. A step name is a whole line or none on VS Code,
     * too coarse for a short pane, so the kit spaces with these numbers. `xs` sits between the
     * lines of one part (a label and its text), `sm` between the parts of one item (claim, meta,
     * evidence, keys), `md` between items that stand alone (groups, the pane's regions).
     */
    space: { xs: 0.2, sm: 0.5, md: 0.9 },
    /**
     * Horizontal room, in cells: `xs` between the buttons of a row, `sm` after an icon, `md`
     * between a line's text and its control, and `inset` on each side of a row, which is where
     * an opened row's fill reaches.
     */
    across: { xs: 0.6, sm: 0.8, md: 1.2, inset: 1 },
    /**
     * The fill of an opened row: the theme's own second background, a well the row's body sits
     * in, which a quiet button's outline still reads on.
     */
    fill: "userMessageBackground",
    /** Behind a code span in a Text, which has no code face: the theme's code background. */
    chip: "bashMessageBackgroundColor",
    /** A thin rule's colour: one grey at low alpha, which reads on a light theme and a dark one. */
    rule: "#8b8f9866",
    /**
     * The least a form's label column takes, in cells, so its controls start at one edge: a
     * label longer than this pushes only its own control.
     */
    labelColumn: 7,
  },
  /**
   * The style's roles as a mod draws them: `dim` is `dimColor`, `text` is the default,
   * the rest are theme colours. `note` is the colour of the words a person wrote.
   */
  role: {
    text: undefined,
    dim: undefined,
    accent: "claude",
    success: "success",
    warning: "warning",
    error: "error",
    note: "suggestion",
  },
} as const;

/** One of the style's colour roles. */
export type Role = keyof typeof tokens.role;

/** A step of the graphical surfaces' rhythm. */
export type GuiSpace = keyof typeof tokens.gui.space;

/** The props of a `Text` in `role`. */
export const roleProps = (role: Role) =>
  role === "dim"
    ? { dimColor: true as const }
    : tokens.role[role] === undefined
      ? {}
      : { color: tokens.role[role] };

/**
 * `text` in a role of the style.
 * @param role One of the style's roles, never a raw colour.
 */
export function paint(k: Kit, role: Role, text: string): JSX.Element {
  const { Text } = k;
  return <Text {...roleProps(role)}>{text}</Text>;
}

/** A width class: the cap for `reading`, `split`, `dialog`; `wide` and `auto` have none. */
export type WidthClass = "reading" | "split" | "dialog" | "wide" | "auto";

/**
 * The class's cap in columns in a pane `columns` wide, or the content width for `auto`.
 * Box has no `maxWidth`, so a mod draws to this width instead of the pane's.
 * @param columns The pane's `bodyColumns`.
 * @param content The widest line in cells; only `auto` reads it.
 */
export function widthCap(cls: WidthClass, columns: number, content = 0): number {
  const cap = (n: number) => Math.max(1, Math.min(n, columns));
  if (cls === "wide") return cap(columns - tokens.width.wideMargin);
  if (cls === "auto") return cap(Math.min(content, tokens.width.dialog));
  return cap(tokens.width[cls]);
}

// ---- text

/** Cells a code point takes: 0 for marks and joiners, 2 for East Asian wide and emoji. */
const cellsOf = (c: number): number => {
  if (c < 32 || (c >= 0x7f && c < 0xa0)) return 0;
  if (c < 0x300) return 1;
  if (
    (c >= 0x300 && c <= 0x36f) ||
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x20d0 && c <= 0x20ff) ||
    (c >= 0xfe00 && c <= 0xfe0f) ||
    c === 0xfeff ||
    (c >= 0xe0100 && c <= 0xe01ef)
  )
    return 0;
  return (c >= 0x1100 && c <= 0x115f) ||
    c === 0x2329 ||
    c === 0x232a ||
    (c >= 0x231a && c <= 0x231b) ||
    (c >= 0x23e9 && c <= 0x23ec) ||
    c === 0x23f0 ||
    c === 0x23f3 ||
    (c >= 0x25fd && c <= 0x25fe) ||
    (c >= 0x2614 && c <= 0x2615) ||
    (c >= 0x2648 && c <= 0x2653) ||
    c === 0x267f ||
    c === 0x2693 ||
    c === 0x26a1 ||
    (c >= 0x26aa && c <= 0x26ab) ||
    (c >= 0x26bd && c <= 0x26be) ||
    (c >= 0x26c4 && c <= 0x26c5) ||
    c === 0x26ce ||
    c === 0x26d4 ||
    c === 0x26ea ||
    (c >= 0x26f2 && c <= 0x26f3) ||
    c === 0x26f5 ||
    c === 0x26fa ||
    c === 0x26fd ||
    c === 0x2705 ||
    (c >= 0x270a && c <= 0x270b) ||
    c === 0x2728 ||
    c === 0x274c ||
    c === 0x274e ||
    (c >= 0x2753 && c <= 0x2755) ||
    c === 0x2757 ||
    (c >= 0x2795 && c <= 0x2797) ||
    c === 0x27b0 ||
    c === 0x27bf ||
    (c >= 0x2b1b && c <= 0x2b1c) ||
    c === 0x2b50 ||
    c === 0x2b55 ||
    (c >= 0x2e80 && c <= 0x303e) ||
    (c >= 0x3041 && c <= 0x33ff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0x4e00 && c <= 0xa4cf) ||
    (c >= 0xa960 && c <= 0xa97f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe10 && c <= 0xfe19) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1f64f) ||
    (c >= 0x1f680 && c <= 0x1f6ff) ||
    (c >= 0x1f900 && c <= 0x1f9ff) ||
    (c >= 0x1fa70 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
    ? 2
    : 1;
};

/** Cells `text` takes: wide characters two, marks and joiners none. Never `.length`. */
export function cellWidth(text: string): number {
  let n = 0;
  for (const ch of text) n += cellsOf(ch.codePointAt(0) ?? 0);
  return n;
}

/** The longest start of `text` that fits `cells`, and the rest. */
function split(text: string, cells: number): [head: string, rest: string] {
  let used = 0;
  let at = 0;
  for (const ch of text) {
    const w = cellsOf(ch.codePointAt(0) ?? 0);
    if (used + w > cells) break;
    used += w;
    at += ch.length;
  }
  return [text.slice(0, at), text.slice(at)];
}

/** `text` cut to `width` cells with `…` when it is longer. */
function truncate(text: string, width: number): string {
  if (cellWidth(text) <= width) return text;
  return split(text, Math.max(0, width - 1))[0] + tokens.glyph.ellipsis;
}

/** Greedy word wrap in cells; a word longer than the width is broken, and a `\n` ends a line. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    let used = 0;
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (words.length === 0) out.push("");
    for (let word of words) {
      let w = cellWidth(word);
      if (used > 0 && used + 1 + w <= width) {
        line += ` ${word}`;
        used += 1 + w;
        continue;
      }
      if (used > 0) out.push(line);
      line = "";
      used = 0;
      while (w > width) {
        const [head, rest] = split(word, width);
        out.push(head);
        word = rest;
        w = cellWidth(word);
      }
      line = word;
      used = w;
    }
    if (words.length > 0) out.push(line);
  }
  return out;
}

export type ClampOptions = {
  /**
   * Fewer lines than this are padded with blank ones, so rows keep one height.
   * @default 0
   */
  min?: number;
  /**
   * More lines than this are cut, the last filled to its end before the `…`.
   * @default Infinity
   */
  max?: number;
  /** A length in characters: as many lines as that much text needs at this width. */
  target?: number;
};

/**
 * `{min: 1, max: 1}` truncates to one line; no options wraps without limit.
 * @param width Cells, not characters; wide characters count two.
 */
export function clamp(text: string, width: number, options: ClampOptions = {}): string[] {
  if (width < 1) return [];
  const { min = 0, max = Infinity, target } = options;
  const wanted = target === undefined ? Infinity : Math.max(1, Math.ceil(target / width));
  const cap = Math.max(0, Math.max(min, Math.min(max, wanted)));
  let lines = wrap(text, width);
  if (lines.length > cap) {
    if (cap === 0) return [];
    // The cut line takes the rest of the text, so it is full before the ellipsis.
    const rest = lines.slice(cap - 1).join(" ");
    lines = [...lines.slice(0, cap - 1), truncate(rest, width)];
  }
  while (lines.length < min) lines.push("");
  return lines;
}

/** `text` padded with spaces to `width` cells, cut with `…` when longer. */
export const fit = (text: string, width: number) => {
  const cut = truncate(text, Math.max(0, width));
  return cut + " ".repeat(Math.max(0, width - cellWidth(cut)));
};

/** `text` right-aligned in `width` cells. */
export const alignRight = (text: string, width: number) =>
  " ".repeat(Math.max(0, width - cellWidth(text))) + text;

/** The lines of a text, whatever its line ends. */
export const linesOf = (text: string) => text.replace(/\r\n?/g, "\n").split("\n");

/**
 * How many rows a text takes at a width, each line wrapped: a guess, since words wrap early,
 * but measured in cells.
 * @param columns The width in cells.
 */
export const rowsOf = (text: string, columns: number) =>
  text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(cellWidth(line) / columns)), 0);

/** A stretch of inline markdown and how a Text sets it. */
export type Run = {
  text: string;
  isCode?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
  isDim?: boolean;
};

// `code`, **bold** or __bold__, *italic* or _italic_, and a [link](url), which keeps only its
// words. A marker inside a word is a letter of it, as in `snake_case_name`.
const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<!\w)__([^_\n]+?)__(?!\w)|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])|\[([^\]\n]+)\]\([^)\s]+\)/g;

function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > at) runs.push({ text: text.slice(at, start) });
    const [, code, bold, underscored, italic, slanted, link] = m;
    if (code !== undefined) runs.push({ text: code, isCode: true });
    else if (bold !== undefined || underscored !== undefined)
      runs.push({ text: bold ?? underscored ?? "", isBold: true });
    else if (italic !== undefined || slanted !== undefined)
      runs.push({ text: italic ?? slanted ?? "", isItalic: true });
    else runs.push({ text: link ?? "" });
    at = start + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

const sameStyle = (a: Run, b: Run) =>
  !a.isCode === !b.isCode &&
  !a.isBold === !b.isBold &&
  !a.isItalic === !b.isItalic &&
  !a.isDim === !b.isDim;

/** Runs in lines of at most `width` cells: greedy by word, a space at a break dropped. */
function wrapRuns(runs: readonly Run[], width: number): Run[][] {
  const lines: Run[][] = [[]];
  let used = 0;
  const put = (run: Run, text: string) => {
    const line = lines[lines.length - 1] ?? [];
    const last = line[line.length - 1];
    if (last && sameStyle(last, run)) last.text += text;
    else line.push({ ...run, text });
    used += cellWidth(text);
  };
  const end = () => {
    const line = lines[lines.length - 1] ?? [];
    while (line.length) {
      const last = line[line.length - 1];
      if (!last) break;
      last.text = last.text.replace(/ +$/, "");
      if (last.text) break;
      line.pop();
    }
    lines.push([]);
    used = 0;
  };
  for (const run of runs)
    for (const piece of run.text.replace(/\s/g, " ").split(/( +)/)) {
      if (!piece) continue;
      if (piece.startsWith(" ")) {
        if (used > 0) put(run, piece);
        continue;
      }
      let word = piece;
      if (used > 0 && used + cellWidth(word) > width) end();
      while (cellWidth(word) > width) {
        const [head, rest] = split(word, width);
        put(run, head);
        end();
        word = rest;
      }
      put(run, word);
    }
  return lines;
}

export type InlineOptions = {
  /** Wrap at this many cells. @default no wrapping */
  width?: number;
  /** Cells each line after the first is set in by, to hang under the first line's text. */
  indent?: number;
  /** Dim words after the text (`"  Recommended"`), wrapped with it. */
  aside?: string;
  /**
   * Every run dim but code: a run with its own weight does not take a dim Text's around it, and
   * a Text's dim is a grey in place of its colour, which would set code as prose.
   */
  isDim?: boolean;
};

/** One paragraph of inline markdown as the runs of each line, wrapped at `width` when given. */
export function inlineLines(
  text: string,
  options: Omit<InlineOptions, "indent" | "isDim"> = {},
): Run[][] {
  const runs = runsOf(linesOf(text).join(" "));
  if (options.aside) runs.push({ text: options.aside, isDim: true });
  return wrapRuns(runs, Math.max(1, options.width ?? Infinity));
}

/**
 * One paragraph of inline markdown as Text runs, for where a `Markdown` cannot go: a `Button`
 * holds only strings and Text, so a row that is pressed whole sets its own. `code` takes the
 * colour the terminal's Markdown sets it in, **bold** and *italic* their faces, and a link its
 * words. With a `width` the runs are wrapped there, each later line set in by `indent`.
 */
export function inlineMarkdown(k: Kit, text: string, options: InlineOptions = {}): RenderNode[] {
  const { Text } = k;
  const nodes: RenderNode[] = [];
  inlineLines(text, options).forEach((line, i) => {
    if (i) nodes.push(`\n${" ".repeat(options.indent ?? 0)}`);
    line.forEach((run, j) =>
      nodes.push(
        run.isCode || run.isBold || run.isItalic || run.isDim ? (
          <Text
            key={`r${i}.${j}`}
            color={run.isCode ? tokens.code : undefined}
            weight={run.isBold ? "bold" : undefined}
            italic={run.isItalic || undefined}
            dimColor={run.isDim || (options.isDim && !run.isCode) || undefined}
          >
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      ),
    );
  });
  return nodes;
}

// ---- icons

/** The kit's icons: small stroked drawings on a 16-pixel grid, for the graphical surfaces. */
const ICONS = {
  wrong: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.7v4"/><path d="M8 11.3v.01"/>',
  stale: '<path d="M13.2 8.2A5.2 5.2 0 1 1 11.7 4.4"/><path d="M13.4 2.4v3.2h-3.2"/>',
  missing: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  warning: '<path d="M8 2.6 14.2 13.2H1.8L8 2.6Z"/><path d="M8 6.8v2.9"/><path d="M8 11.7v.01"/>',
  success: '<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/>',
  error: '<circle cx="8" cy="8" r="6.2"/><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2"/>',
  pending: '<circle cx="8" cy="8" r="6.2" stroke-dasharray="2.4 2.4"/>',
  note: '<path d="M2.6 3.4h10.8v7.2H7.4l-3 2.4v-2.4H2.6Z"/><path d="M5.2 6h5.6M5.2 8h3.6"/>',
  question:
    '<circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4"/><path d="M8 11.4v.01"/>',
  write: '<path d="M10.6 2.9l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6Z"/><path d="M9.2 4.3l2.5 2.5"/>',
  // The properties of a record, as a tracker draws them beside their values.
  status: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>',
  priorityNone: '<path d="M3.2 8h1.4M7.3 8h1.4M11.4 8h1.4"/>',
  priorityLow:
    '<path d="M4 13v-2.6"/><path d="M8 13V7.4" stroke-opacity=".35"/><path d="M12 13V4.4" stroke-opacity=".35"/>',
  priorityMedium: '<path d="M4 13v-2.6M8 13V7.4"/><path d="M12 13V4.4" stroke-opacity=".35"/>',
  priorityHigh: '<path d="M4 13v-2.6M8 13V7.4M12 13V4.4"/>',
  priorityUrgent:
    '<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.6" fill="currentColor" stroke="none"/><path d="M8 5.2v3.4M8 10.8v.01" stroke="#ffffff"/>',
  project:
    '<path d="M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2Z"/><path d="M2.8 5.2 8 8l5.2-2.8M8 8v5.6"/>',
  label: '<circle cx="8" cy="8" r="3.4" fill="currentColor" stroke="none"/>',
  draft: '<path d="M10.6 2.8 13.2 5.4 5.7 12.9 2.6 13.4 3.1 10.3Z"/><path d="M9.2 4.2l2.6 2.6"/>',
} as const;

/** One of the kit's icons. */
export type IconName = keyof typeof ICONS;

/** The colour an icon is drawn in: grey, or the state it marks. */
export type IconTone = keyof typeof tokens.gui.tone;

/** What each icon stands for on the terminal, where one glyph does it. */
const ICON_GLYPH: Record<IconName, string> = {
  wrong: tokens.glyph.kind.wrong,
  stale: tokens.glyph.kind.stale,
  missing: tokens.glyph.kind.missing,
  warning: tokens.glyph.status.warning,
  success: tokens.glyph.done,
  error: tokens.glyph.times,
  pending: tokens.glyph.single.off,
  question: "?",
  note: tokens.glyph.noteEnd,
  write: "✎",
  status: tokens.glyph.single.off,
  priorityNone: "-",
  priorityLow: "!",
  priorityMedium: "!!",
  priorityHigh: "!!!",
  priorityUrgent: tokens.glyph.status.warning,
  project: tokens.glyph.multi.off,
  label: tokens.glyph.single.on,
  draft: "✎",
};

/**
 * The markup of an icon, a whole `<svg>` document.
 * @param tone The state it marks; grey when none.
 * @param size Its side in CSS pixels.
 */
export const iconSvg = (
  name: IconName,
  tone: IconTone = "neutral",
  size: number = tokens.gui.icon,
) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" color="${tokens.gui.tone[tone]}" stroke="${tokens.gui.tone[tone]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/**
 * An icon: an image on a graphical surface, its glyph in a role's colour on the terminal.
 * @param alt What it says, for a reader that cannot see it.
 */
export function icon(
  k: Kit,
  name: IconName,
  options: { tone?: IconTone; alt?: string; size?: number } = {},
): JSX.Element {
  const { Svg, Text } = k;
  const { tone = "neutral", alt = name, size = tokens.gui.icon } = options;
  if (k.isNative && Svg)
    return <Svg source={iconSvg(name, tone, size)} alt={alt} width={size} height={size} />;
  return <Text {...roleProps(tone === "neutral" ? "dim" : tone)}>{ICON_GLYPH[name]}</Text>;
}

// ---- prose

export type ProseOptions = {
  /** The text's colour role. @default "text" */
  role?: Role;
  /** The whole block dim. */
  isDim?: boolean;
  tui?: {
    /** Bounds for the terminal's wrapping: `max` cuts with `…`. */
    lines?: ClampOptions;
    /** The terminal's weight. */
    weight?: "semibold" | "bold";
  };
  gui?: {
    /** A block of the pane's own, at the inset as every block is, not text inside a row. */
    isInset?: boolean;
  };
};

/**
 * A block of prose. A graphical surface draws it as markdown, as it draws a reply; the terminal
 * wraps it in cells, and cuts it where `tui.lines` says.
 * @param text Prose or markdown, whose own newlines are line breaks on the terminal.
 */
export function prose(k: Kit, text: string, options: ProseOptions = {}): JSX.Element {
  const { Text, Markdown } = k;
  const { role = "text", isDim } = options;
  if (k.isNative) {
    const md = <Markdown text={text} dimColor={isDim || undefined} />;
    if (!options.gui?.isInset) return md;
    const { Box } = k;
    return <Box paddingX={tokens.gui.across.inset}>{md}</Box>;
  }
  const { lines, weight } = options.tui ?? {};
  return (
    <Text weight={weight} {...roleProps(isDim ? "dim" : role)}>
      {clamp(text, k.columns, lines).join("\n")}
    </Text>
  );
}

// ---- blocks

export type SectionOptions = {
  /** The title is a path, command or symbol: set in the monospaced face on a graphical surface. */
  isCode?: boolean;
  /**
   * The terminal wraps the title whole, its rule after the last line, instead of cutting it to one
   * line with `…`: a path, whose end is the part that names it.
   */
  isWrapped?: boolean;
};

/**
 * A section header: bold title, then a dim rule to the edge on the terminal. A graphical surface
 * draws a flat heading at its rows' inset.
 * @param title Wrapped on a graphical surface; cut with `…` on the terminal unless `isWrapped`.
 */
export function section(k: Kit, title: string, options: SectionOptions = {}): JSX.Element {
  const { Box, Text } = k;
  const width = k.columns;
  if (k.isNative)
    return (
      <Box paddingX={tokens.gui.across.inset}>
        <Text weight="semibold" mono={options.isCode || undefined}>
          {title}
        </Text>
      </Box>
    );
  const lines = options.isWrapped
    ? clamp(title, Math.max(1, width))
    : clamp(title, Math.max(1, width), { min: 1, max: 1 });
  const last = lines.at(-1) ?? "";
  const room = width - cellWidth(last) - 1;
  return (
    <Text>
      <Text weight="semibold">{lines.join("\n")}</Text>
      {room > 0 ? <Text dimColor>{` ${tokens.glyph.rule.repeat(room)}`}</Text> : null}
    </Text>
  );
}

/** What a graphical surface's pane title line says and holds. */
export type PaneTitleGui = {
  /** The count as said here, `3 open`. */
  count?: string;
  /** What closing will do, said in place of the count while there is something to do. */
  summary?: string;
  /** The pane's actions, drawn at the title line's far edge: the line becomes the toolbar. */
  actions?: readonly Action[];
  /**
   * Navigation at the line's start, in place of the count: one Button per place, the current one
   * `isPrimary` (filled), as a choice's chosen option.
   */
  tabs?: readonly Action[];
};

/**
 * A pane's title line, `─ Title  count ─────`, so both harnesses share one. A graphical surface
 * already draws the pane's own title above the body, so it draws only what the title leaves out;
 * given `gui.actions`, the line is the pane's toolbar, its actions at the far edge.
 * @param count Dim, after the title; left out when none.
 * @param options `gui.count` is the count as a graphical surface says it, `3 open`; `gui.summary`
 *   what closing will do, said in its place.
 */
export function paneTitle(
  k: Kit,
  title: string,
  count?: number | string,
  options: BySurface<PaneTitleGui> & {
    /**
     * The terminal draws a bold heading with the count dim beside it, in place of the title line
     * of rules: for a pane that is a short menu.
     */
    isHeading?: boolean;
  } = {},
): JSX.Element | null {
  const { Box, Text } = k;
  if (!k.isNative && options.isHeading)
    return (
      <Box flexDirection="row">
        <Text bold>{title}</Text>
        {count === undefined ? null : <Text dimColor>{`  ${count}`}</Text>}
      </Box>
    );
  if (k.isNative) {
    const own = surfaceOf(k, options);
    const said = own.count ?? (count === undefined ? "" : String(count));
    // No title, or the host's own, leaves the line to the count and the actions.
    const lead =
      !title || title === k.title ? null : (
        <Text weight="semibold">{`${title}${said || own.summary ? "  " : ""}`}</Text>
      );
    // The pane's toolbar: what it holds, or what closing it will do, and its actions at the far
    // edge, as a source-control view sets its commit over the changes.
    const text = own.summary ? (
      <Text>
        {lead}
        {own.summary}
      </Text>
    ) : said || lead ? (
      <Text>
        {lead}
        {said ? <Text dimColor>{said}</Text> : null}
      </Text>
    ) : null;
    const actions = own.actions ?? [];
    const tabs = own.tabs ?? [];
    const left = tabs.length ? (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        columnGap={tokens.gui.across.xs}
        rowGap={tokens.gui.space.xs}
      >
        {tabs.map((a) => actionButton(k, a))}
      </Box>
    ) : (
      text
    );
    if (!left && actions.length === 0) return null;
    // One line at the inset with or without actions; with no text the actions keep the far edge.
    return (
      <Box
        key="toolbar"
        flexDirection="row"
        // Tabs wrap among themselves, so the actions keep the far edge of the first line.
        flexWrap={tabs.length ? "nowrap" : "wrap"}
        alignItems={tabs.length ? "flex-start" : "center"}
        justifyContent="space-between"
        columnGap={tokens.gui.across.md}
        rowGap={tokens.gui.space.xs}
        paddingX={tokens.gui.across.inset}
      >
        <Box flexShrink={1}>{left}</Box>
        {actions.length > 0 ? (
          <Box
            flexDirection="row"
            flexWrap="wrap"
            // Beside tabs the line does not wrap, so the tabs give way, never the actions.
            flexShrink={tabs.length ? 0 : undefined}
            columnGap={tokens.gui.across.xs}
            rowGap={tokens.gui.space.xs}
          >
            {actions.map((a) => actionButton(k, a))}
          </Box>
        ) : null}
      </Box>
    );
  }
  const width = k.columns;
  const rule = tokens.glyph.rule;
  const tail = count === undefined ? "" : `  ${count}`;
  const room = Math.max(1, width - 2 - cellWidth(tail) - 1);
  const head = clamp(title, room, { min: 1, max: 1 })[0] ?? "";
  const fill = width - 2 - cellWidth(head) - cellWidth(tail) - 1;
  return (
    <Text>
      <Text dimColor>{`${rule} `}</Text>
      <Text weight="semibold">{head}</Text>
      {tail ? <Text dimColor>{tail}</Text> : null}
      {fill > 0 ? <Text dimColor>{` ${rule.repeat(fill)}`}</Text> : null}
    </Text>
  );
}

/**
 * The arguments of `$.ui.open` for a pane: yours, with the house style's (transparent, no fill)
 * added. A pane is always opened through this.
 * @param extra `id`, `title`, `focus`, `rows` and the rest of what the pane takes.
 */
export const paneOptions = <T extends object>(extra: T) => ({
  ...extra,
  backgroundColor: tokens.pane.backgroundColor,
});

export type PaneOptions = {
  /** The width class the terminal caps the body to. @default "reading" */
  width?: WidthClass;
};

/**
 * A pane's body: the blocks of the screen in a column. On the terminal it caps the width to a
 * class (`blocks` gets a kit of that width), pads the docked pane by one cell and drops the blank
 * rows between blocks in a pane too short for them; a graphical surface has its own gap, and the
 * surface scrolls.
 * @param blocks The screen's blocks, given the kit to draw them with; `null` ones are left out.
 */
export function pane(
  k: Kit,
  blocks: (k: Kit) => (JSX.Element | null)[],
  options: PaneOptions = {},
): JSX.Element {
  const { Box } = k;
  if (k.isNative)
    return (
      <Box flexDirection="column" rowGap={tokens.gui.space.md}>
        {blocks(k)}
      </Box>
    );
  // One cell of padding, which an inline box's own border already gives.
  const padding = k.placement === "inline" ? 0 : tokens.padding;
  const width = widthCap(options.width ?? "reading", k.columns - 2 * padding);
  return (
    <Box flexDirection="column" rowGap={k.isTight ? 0 : 1} paddingX={padding}>
      {blocks(withColumns(k, width))}
    </Box>
  );
}

/** A note's gutter for line `i` of `count`: `│  ` on all but the last, `╰▸ ` on it. */
export const gutterOf = (i: number, count: number) =>
  i < count - 1 ? `${tokens.glyph.noteMid}  ` : `${tokens.glyph.noteEnd} `;

/** A note as plain text, each line behind its gutter and `indent`. */
export const noteText = (text: string, indent = "") =>
  linesOf(text)
    .map((line, i, all) => `${indent}${gutterOf(i, all.length)}${line}`)
    .join("\n");

export type NoteOptions = {
  /** Cells before the gutter. */
  indent?: number;
  /** Wraps each line to the kit's room, less the gutter and the indent; every wrapped line has its gutter. */
  isWrapped?: boolean;
  /**
   * The words' colour role.
   * @default "text"
   */
  role?: Role;
  /** The words in italic. */
  italic?: boolean;
};

/**
 * A note: a dim gutter, `│` on each line but the last, `╰▸` on the last. It belongs to the one
 * thing above it; never use it for a list of entries. A graphical surface sets it in quiet italics.
 * @param text The note; its own newlines are lines.
 */
export function note(k: Kit, text: string, options: NoteOptions = {}): JSX.Element {
  const { Text } = k;
  const { indent = 0, isWrapped, role = "text", italic } = options;
  if (k.isNative)
    return (
      <Text italic={italic ?? true} {...roleProps(role === "text" ? "dim" : role)}>
        {text}
      </Text>
    );
  const lines = !isWrapped
    ? linesOf(text)
    : linesOf(text).flatMap((line) => clamp(line, k.columns - indent - 3, { min: 1 }));
  return (
    <Text>
      {lines.flatMap((line, i, all) => [
        i ? "\n" : "",
        <Text key={`g${i}`} dimColor>{`${" ".repeat(indent)}${gutterOf(i, all.length)}`}</Text>,
        <Text key={`n${i}`} {...roleProps(role)} italic={italic}>
          {line}
        </Text>,
      ])}
    </Text>
  );
}

/**
 * One line telling the person what just happened. The terminal cuts it to the room, or wraps
 * it whole with `isWrapped`; a graphical surface always wraps.
 * @param status The colour role; success, warning and error only for an actual state.
 */
export function notice(
  k: Kit,
  text: string,
  status: "success" | "warning" | "error" | "dim" | "text" = "warning",
  options: {
    isWrapped?: boolean;
    gui?: {
      isHidden?: boolean;
      /** One line, cut at the edge by the surface: a footnote, not news. */
      isCut?: boolean;
      /** No inset of its own: it sits in a block that has one, beside the block's controls. */
      isFlush?: boolean;
    };
  } = {},
): JSX.Element | null {
  const { Box, Text } = k;
  if (k.isNative)
    return options.gui?.isHidden ? null : (
      <Box paddingX={options.gui?.isFlush ? undefined : tokens.gui.across.inset}>
        <Text wrap={options.gui?.isCut ? "truncate-end" : undefined} {...roleProps(status)}>
          {text}
        </Text>
      </Box>
    );
  const lines = options.isWrapped
    ? clamp(text, k.columns).join("\n")
    : (clamp(text, k.columns, { min: 1, max: 1 })[0] ?? "");
  return <Text {...roleProps(status)}>{lines}</Text>;
}

/**
 * What a list says when there is nothing in it, wrapped and dim.
 * @param text Say what is missing and, if it helps, what makes rows appear.
 * @param options `gui.text` is the text as a graphical surface says it: a fuller sentence, or one
 *   without the terminal's `…`.
 */
export function emptyState(
  k: Kit,
  text: string,
  options: { gui?: { text?: string } } = {},
): JSX.Element {
  const { Box, Text } = k;
  if (k.isNative)
    return (
      <Box paddingX={tokens.gui.across.inset}>
        <Text dimColor>{options.gui?.text ?? text}</Text>
      </Box>
    );
  return <Text dimColor>{clamp(text, k.columns).join("\n")}</Text>;
}

/**
 * The heading of a part inside an item: dim on the terminal; a graphical surface sets it in the
 * heavier weight too, so it reads apart from a dim label that says when and who.
 */
export function subhead(k: Kit, text: string): JSX.Element {
  const { Text } = k;
  return (
    <Text dimColor weight={k.isNative ? "semibold" : undefined}>
      {text}
    </Text>
  );
}

/** The evidence's rule: a dim label, with a dim rule after it to the edge on the terminal. */
export function rule(k: Kit, label: string): JSX.Element {
  const { Text } = k;
  if (k.isNative)
    return (
      <Text dimColor size="caption">
        {label}
      </Text>
    );
  const fill = tokens.glyph.rule.repeat(Math.max(0, k.columns - cellWidth(label) - 1));
  return <Text dimColor>{fill ? `${label} ${fill}` : label}</Text>;
}

/** Cells a set-in block is set in from its heading on the terminal. */
const INDENT = 2;

/**
 * Sets `children` in from what they belong to. The terminal gives them a kit two cells narrower.
 * @param children Given the kit to draw with.
 */
export function indent(k: Kit, children: (k: Kit) => JSX.Element): JSX.Element {
  const { Box } = k;
  // A graphical surface sets nothing in: what heads the block is a dim line above it, and a
  // second step in from an opened row's own would only narrow the text.
  if (k.isNative) return children(k);
  return (
    <Box paddingLeft={INDENT} flexDirection="column">
      {children(withColumns(k, k.columns - INDENT))}
    </Box>
  );
}

/** One fact of a labelled list: what it is, then its value. */
export type Fact = {
  label: string;
  value: string;
  /** Set in quotation marks, as words someone said. */
  isQuote?: boolean;
  /** A path, command or symbol: set in the monospaced face on a graphical surface. */
  isCode?: boolean;
};

/** Cells between a fact's label and its value on the terminal. */
const FACT_GAP = 2;

/**
 * Labelled values under an optional heading. The terminal sets the labels in one dim column
 * with the values hanging beside it; a graphical surface sets each as a line, its label dim.
 */
export function facts(k: Kit, items: readonly Fact[], heading?: string): JSX.Element {
  const { Box, Text } = k;
  const head = heading ? subhead(k, heading) : null;
  const shown = (f: Fact) => (f.isQuote ? `“${f.value}”` : f.value);
  if (k.isNative)
    return (
      <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
        {head}
        {items.map((f, i) => (
          <Box key={`f${i}`} flexWrap="nowrap" columnGap={tokens.gui.across.md}>
            <Text dimColor>{f.label}</Text>
            <Box flexShrink={1}>
              <Text mono={f.isCode || undefined}>{shown(f)}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  const width = k.columns;
  // The labels sit in one dim column and the values hang beside it, so a list of paths is read
  // down its right edge.
  const kinds = Math.min(
    Math.max(...items.map((f) => cellWidth(f.label))),
    Math.max(4, Math.floor(width / 3)),
  );
  const room = Math.max(1, width - kinds - FACT_GAP);
  return (
    <Box flexDirection="column">
      {head}
      <Text>
        {items.flatMap((f, i) => {
          const [first = "", ...rest] = clamp(shown(f), room);
          return [
            i > 0 ? "\n" : "",
            <Text key={`k${i}`} dimColor>
              {fit(f.label, kinds)}
            </Text>,
            `${" ".repeat(FACT_GAP)}${first}`,
            ...rest.map((line) => `\n${" ".repeat(kinds + FACT_GAP)}${line}`),
          ];
        })}
      </Text>
    </Box>
  );
}

/** One dated entry of a log, a history or a list of evidence. */
export type Entry = {
  /** Shown as given in a dim column, `2026-11-13`. */
  date: string;
  text: string;
};

export type EntriesOptions = {
  /** Passed to `clamp` for every entry's text. */
  lines?: ClampOptions;
};

/**
 * Dated entries, one blank row between them and no bullets or gutter. From
 * `tokens.entriesFrom` columns the date is a fixed dim column at the left and the text hangs
 * beside it; narrower, a dim date line with the text under it at full width. A graphical surface
 * always sets the date line over the text.
 */
export function entries(k: Kit, items: Entry[], options: EntriesOptions = {}): JSX.Element {
  const { Box, Text } = k;
  if (k.isNative)
    return (
      <Box flexDirection="column" rowGap="md">
        {items.map((item, i) => (
          <Box key={`entry${i}`} flexDirection="column">
            <Text dimColor size="caption">
              {item.date}
            </Text>
            {prose(k, item.text)}
          </Box>
        ))}
      </Box>
    );
  const width = k.columns;
  const isWide = width >= tokens.entriesFrom;
  const indent = tokens.dateWidth + tokens.gutter;
  return (
    <Box flexDirection="column" rowGap={1}>
      {items.map((item, i) => {
        if (isWide) {
          const text = clamp(item.text, width - indent, options.lines);
          return (
            <Text key={`entry${i}`}>
              <Text dimColor>{fit(item.date, tokens.dateWidth)}</Text>
              {text.map(
                (line, n) =>
                  `${n === 0 ? " ".repeat(tokens.gutter) : `\n${" ".repeat(indent)}`}${line}`,
              )}
            </Text>
          );
        }
        const text = clamp(item.text, width, options.lines);
        return (
          <Text key={`entry${i}`}>
            <Text dimColor>{truncate(item.date, width)}</Text>
            {text.map((line) => `\n${line}`)}
          </Text>
        );
      })}
    </Box>
  );
}

// ---- choice

/** One option of a choice. */
export type ChoiceOption = {
  /** The Button's address: unique among the pane's and stable across redraws. */
  key: string;
  label: string;
  /** What the option means, under its label. */
  detail?: string;
  /** The option is the one chosen, or one of those. */
  isOn?: boolean;
  /**
   * The option that means nothing is chosen: a graphical surface never draws it as the chosen
   * one, so a screen of rows left alone is not a screen of main buttons.
   */
  isQuiet?: boolean;
  /** The terminal's key for it. A graphical surface draws a chip for each hotkey, so it drops them. */
  hotkey?: string;
  /**
   * A word or two for the Button when `label` is too long for one: a Button never wraps, so a
   * graphical surface sets such a label as text under a Button that carries this instead.
   */
  short?: string;
  /** The label is a word of the person's own (a suggestion), so a graphical surface keeps its case. */
  isLiteral?: boolean;
  /**
   * The `rows` layout: the option's own name as the person and a reply say it (`A`), on the
   * Button that leads its row, the label as text beside it. Without one the Button carries the
   * label.
   */
  tag?: string;
  /** The `rows` layout: a control in place of the label, a write-in's field, led by `icon`. */
  field?: JSX.Element;
  /** The `rows` layout: the mark that leads a row with a `field`. */
  icon?: IconName;
  /** The `rows` layout: what the chosen option shows under its detail once it opens, a note's field. */
  body?: JSX.Element | null;
  onPress: () => unknown;
};

export type ChoiceOptions = {
  /** Several options can be on at once; the terminal draws squares in place of circles. */
  isMulti?: boolean;
  /** The Button group's address. */
  key?: string;
  tui?: {
    /**
     * `chips` is a row of plain keys, the one on lit; `marks` is a list of rows with `○ ●` or
     * `□ ■` before each.
     * @default "chips"
     */
    style?: "chips" | "marks";
  };
  gui?: {
    /**
     * `row` sets the buttons side by side, wrapping; `stack` one under the other, each as wide as
     * the room. `rows` is a list of one-line rows, each led by a Button of its `tag`, the label and
     * the detail cut beside it; the one chosen of a single choice opens in place, its detail whole.
     * @default "stack"
     */
    layout?: "row" | "stack" | "rows";
    /**
     * The `rows` layout: the way on from a single choice, a filled Button at the chosen row's far
     * edge (`Next`). A choice of several opens no row, so its way on is the mod's to place.
     */
    onward?: { key: string; label: string; onPress: () => unknown };
  };
  desktop?: ChoiceOptions["gui"];
  vscode?: ChoiceOptions["gui"];
  mobile?: ChoiceOptions["gui"];
};

/** A choice's options with the options they are drawn by. */
export type ChoiceSet = ChoiceOptions & { options: ChoiceOption[] };

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * A set of options, one chosen or several. A graphical surface draws each as a Button, the chosen
 * one `primary`, with its detail inside it; the terminal draws plain keys or marked rows.
 */
export function choice(
  k: Kit,
  options: readonly ChoiceOption[],
  settings: ChoiceOptions = {},
): JSX.Element {
  const { Box, Button, Text } = k;
  if (k.isNative) {
    const { layout = "stack", onward } = surfaceOf(k, {
      gui: settings.gui,
      desktop: settings.desktop,
      vscode: settings.vscode,
      mobile: settings.mobile,
    });
    if (layout === "rows") return choiceRows(k, options, settings, onward);
    const isRow = layout === "row";
    return (
      <Box
        key={settings.key}
        flexDirection={isRow ? "row" : "column"}
        flexWrap={isRow ? "wrap" : undefined}
        columnGap={tokens.gui.across.xs}
        rowGap={isRow ? tokens.gui.space.xs : tokens.gui.space.sm}
      >
        {options.map((o) => {
          // A Button does not wrap its label, so a label is a word or two; the detail is prose. A
          // longer label moves under a Button that carries its `short` word.
          const isLong =
            !isRow && o.short !== undefined && cellWidth(o.label) > tokens.gui.maxLabel;
          const button = (
            <Button
              key={o.key}
              variant={o.isOn && !o.isQuiet ? "primary" : "secondary"}
              // The surface draws every variant alike, so only the chosen one is not dim.
              dimColor={!(o.isOn && !o.isQuiet) || undefined}
              label={
                isLong ? capital(o.short ?? o.label) : o.isLiteral ? o.label : capital(o.label)
              }
              onPress={() => o.onPress()}
            />
          );
          return isRow || (!o.detail && !isLong) ? (
            button
          ) : (
            <Box key={`${o.key}:detail`} flexDirection="column">
              {button}
              {isLong ? <Text>{o.label}</Text> : null}
              {o.detail ? <Text dimColor>{o.detail}</Text> : null}
            </Box>
          );
        })}
      </Box>
    );
  }
  const { style = "chips" } = settings.tui ?? {};
  if (style === "marks")
    return (
      <Box key={settings.key} flexDirection="column">
        {options.map((o) =>
          listRow(
            k,
            {
              key: o.key,
              title: o.label,
              isMarked: Boolean(o.isOn),
              meta: o.detail ? [{ text: o.detail, width: 0 }] : undefined,
              onPress: o.onPress,
            },
            { marks: settings.isMulti ? "multi" : "single" },
          ),
        )}
      </Box>
    );
  return (
    <Box key={settings.key} columnGap={tokens.gutter}>
      {options.map((o) => (
        <Button
          key={o.key}
          plain
          hotkey={o.hotkey}
          dimColor={!o.isOn}
          label={o.label}
          onPress={() => o.onPress()}
        />
      ))}
    </Box>
  );
}

/**
 * A choice as rows (`guiRow`), for options a person reads before picking: each row is one line,
 * led by a Button of the option's tag (filled when chosen), its label and its detail cut at the
 * edge beside it. The option chosen of a single choice opens in its well: the label and the detail
 * whole, its `body` under them and the way on at its far edge. A row with a `field` holds that
 * control in place of the label, led by its icon, so a click lands in the field itself.
 */
function choiceRows(
  k: Kit,
  options: readonly ChoiceOption[],
  settings: ChoiceOptions,
  onward: NonNullable<ChoiceOptions["gui"]>["onward"],
): JSX.Element {
  const { Box, Button, Text } = k;
  // Keys of different widths sit in one column, so every row's text starts at one edge.
  const isTagged = options.some((o) => o.tag !== undefined);
  return (
    <Box key={settings.key} flexDirection="column">
      {options.map((o) => {
        const isOn = Boolean(o.isOn && !o.isQuiet);
        const isOpen = isOn && !settings.isMulti;
        const mark = o.field ? (
          icon(k, o.icon ?? "write")
        ) : (
          <Button
            key={o.key}
            variant={isOn ? "primary" : undefined}
            dimColor={!isOn || undefined}
            label={o.tag ?? (o.isLiteral ? o.label : capital(o.label))}
            onPress={() => o.onPress()}
          />
        );
        const label = o.field || o.tag === undefined ? "" : o.label;
        // Opened, the label and what it means are one paragraph: the label in the heavier weight
        // while it is a name, the detail running on after it.
        // A bold inside the label would close the one around it.
        const named =
          cellWidth(label) <= tokens.gui.maxLabel ? `**${label.replaceAll("**", "")}**` : label;
        const whole = isOpen ? [label ? named : "", o.detail ?? ""].filter(Boolean).join("  ") : "";
        return guiRow(k, {
          key: `${o.key}:row`,
          mark,
          markWidth: isTagged ? tokens.gui.lead : undefined,
          text: isOpen ? whole : label,
          field: o.field,
          detail: !isOpen && o.detail ? { text: o.detail } : undefined,
          isOpen,
          button: isOpen && onward ? { ...onward, isFilled: true } : undefined,
          body: isOpen
            ? [o.field && o.detail ? <Text key="detail">{o.detail}</Text> : null, o.body ?? null]
            : undefined,
        });
      })}
    </Box>
  );
}

/**
 * A control on a row of its own, led by an icon in a choice's lead column (`choice`'s `rows`), so
 * a field under a choice's rows (a note) lines up with them. The terminal draws the control alone.
 */
export function fieldRow(
  k: Kit,
  o: { key: string; icon: IconName; alt?: string; field: JSX.Element },
): JSX.Element {
  if (!k.isNative) return o.field;
  return guiRow(k, {
    key: o.key,
    mark: icon(k, o.icon, { alt: o.alt }),
    markWidth: tokens.gui.lead,
    text: "",
    field: o.field,
  });
}

/**
 * The first `gui.maxItems` of a long list, and an `N more` row for the rest. The terminal's pane
 * scrolls as a whole, so it shows every item.
 * @param isAll Show every item, as after the person asked for the rest.
 * @param onMore Makes the `N more` row a Button that asks for the rest.
 */
export function capped<T>(
  k: Kit,
  items: readonly T[],
  options: { isAll?: boolean; onMore?: () => unknown; gui?: { maxItems?: number } } = {},
): { shown: T[]; more: JSX.Element | null } {
  const { Button, Text } = k;
  const max = options.gui?.maxItems ?? tokens.gui.maxItems;
  if (!k.isNative || options.isAll || items.length <= max) return { shown: [...items], more: null };
  const left = items.length - max;
  const { onMore } = options;
  const { Box } = k;
  return {
    shown: items.slice(0, max),
    more: (
      <Box key="more:box" paddingX={tokens.gui.across.inset}>
        {onMore ? (
          <Button key="more" dimColor label={`Show ${left} more`} onPress={() => onMore()} />
        ) : (
          <Text dimColor>{`${left} more`}</Text>
        )}
      </Box>
    ),
  };
}

// ---- card

/** What a reviewed item is: a kind and the colour role it is drawn in. */
const KIND_TONE = { wrong: "error", stale: "warning", missing: "neutral" } as const;
const KIND_ROLE = { wrong: "error", stale: "warning", missing: "text" } as const;

export type CardOptions = {
  /** The card's address. */
  key: string;
  /** The claim: prose or markdown. */
  claim: string;
  /** The terminal's claim Button address; pressing it opens or folds the card. */
  claimKey: string;
  kind: keyof typeof tokens.glyph.kind;
  /** How many sessions hit it. */
  seen?: number;
  /** How long ago, short: `2d`. */
  age?: string;
  /** What it is set to: colours the claim, apply in success and dismiss struck through. */
  tone?: "apply" | "dismiss";
  isOpen: boolean;
  /**
   * Opens or folds it. A graphical surface asks for `isAlone`: opening a row folds the others,
   * so a short pane holds the one being read.
   */
  onToggle: (options?: { isAlone?: boolean }) => unknown;
  /** The details' toggle, which says how many pieces there are. */
  details: { key: string; count: number; render: (k: Kit) => JSX.Element };
  /** The keys that set it. */
  choice: ChoiceSet;
  /** The ring starts on the claim (terminal). */
  autoFocus?: boolean;
  tui?: {
    /** Lines of a folded claim; an open card shows it whole. @default `tokens.foldedLines` */
    foldedLines?: number;
  };
};

/**
 * Words between backticks, as a Text can set them: in a chip, since a Text has no code face. The
 * chip takes the line's own `truncate-end`: a nested Text without a `wrap` is drawn `pre-wrap`,
 * and VS Code's extension before 2.1.327 breaks a one-line row after it.
 */
function inlineCode(k: Kit, text: string): RenderNode[] {
  const { Text } = k;
  return text
    .split(/(`[^`\n]+`)/)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
        <Text key={`c${i}`} backgroundColor={tokens.gui.chip} wrap="truncate-end">
          {` ${part.slice(1, -1)} `}
        </Text>
      ) : (
        part.replace(/\*\*|__/g, "")
      ),
    );
}

/** A thin rule down the side of what it marks: a Box of a fraction of a cell, filled. */
function sideRule(k: Kit, key: string): JSX.Element {
  const { Box } = k;
  return <Box key={key} width={0.2} flexShrink={0} backgroundColor={tokens.gui.rule} />;
}

/** The button at a graphical row's far edge. */
type RowButton = {
  key: string;
  label: string;
  onPress: () => unknown;
  /** Filled, as the chosen option of a choice; quiet otherwise. */
  isFilled?: boolean;
};

/** What every graphical row is drawn from: `card`, `foldedRow` and `listRow`. */
type GuiRow = {
  key: string;
  /** The mark before the text, in a column of its own. None sets the text at the inset. */
  mark?: JSX.Element;
  /**
   * The mark's column at least this many cells wide, its mark at the start: rows whose marks
   * differ in width (a choice's key Buttons) keep their text at one edge.
   */
  markWidth?: number;
  /** The row's line: cut at the edge by the surface while folded, whole as prose once opened. */
  text: string;
  /** A control in place of the text (an `Input`), as wide as the line allows. */
  field?: JSX.Element;
  /** The text is plain, not markdown: a path or a name, its backticks and underscores kept. */
  isPlain?: boolean;
  /** The folded line dim and struck through: a suggestion set to be dismissed. */
  isStruck?: boolean;
  /** Nothing to press: the line dim and no button. */
  isDim?: boolean;
  /** A short dim word beside the text, or at the line's end before the button with `isAtEnd`. */
  detail?: { text: string; isAtEnd?: boolean };
  /** A dim line under a folded row's text. */
  meta?: string;
  /** The button at the line's far edge; none for a row that can't be pressed. */
  button?: RowButton;
  /** Opened: the row sits in a well, its text whole, a rule down from the mark to the body's end. */
  isOpen?: boolean;
  /** What an opened row shows under its text, set in from the mark. */
  body?: readonly (JSX.Element | null)[];
  /** A state the row is (a warning): its folded line is in that colour, as its icon is. */
  tone?: "warning" | "error";
};

/**
 * The one graphical row. Folded, it is one line: the mark, the text cut at the edge, its detail,
 * and a quiet button at the far edge. The line is one line of text tall whether it has a button
 * or not, so every folded row is the same height. Opened, the line shows the text whole and the
 * row takes a fill that holds everything under it, set in from the mark, with a rule running
 * down from the mark so the body reads as that line's own. A Button cannot wrap or hold an icon
 * and never shrinks, so it is never the row itself.
 */
function guiRow(k: Kit, o: GuiRow): JSX.Element {
  const { Box, Button, Text } = k;
  const { space, across } = tokens.gui;
  const isOpen = Boolean(o.isOpen);
  const { detail, button } = o;
  const line = o.field ? (
    o.field
  ) : isOpen ? (
    o.text ? (
      prose(k, o.text)
    ) : null
  ) : (
    <Text
      wrap="truncate-end"
      dimColor={o.isDim || o.isStruck || undefined}
      strikethrough={o.isStruck || undefined}
      // The icon's own colour: VS Code's theme draws `warning` text grey in its dark themes.
      color={o.tone ? tokens.gui.tone[o.tone] : undefined}
    >
      {o.isPlain ? o.text : inlineCode(k, linesOf(o.text).join(" "))}
    </Text>
  );
  return (
    <Box
      key={o.key}
      flexDirection="row"
      flexWrap="nowrap"
      columnGap={across.sm}
      paddingX={across.inset}
      paddingY={isOpen ? space.sm : space.xs}
      backgroundColor={isOpen ? tokens.gui.fill : undefined}
      // A round border is the surface's only rounded corner; it is drawn in no colour.
      borderStyle="round"
      borderColor="#00000000"
    >
      {o.mark ? (
        <Box
          key="mark"
          flexDirection="column"
          alignItems="flex-start"
          flexShrink={0}
          minWidth={o.markWidth}
        >
          <Box flexDirection="column" alignItems="center" flexGrow={1} rowGap={space.xs}>
            <Box height={1} alignItems="center">
              {o.mark}
            </Box>
            {isOpen ? <Box flexGrow={1}>{sideRule(k, "thread")}</Box> : null}
          </Box>
        </Box>
      ) : null}
      <Box
        key="text"
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        rowGap={isOpen ? space.sm : space.xs}
      >
        <Box
          key="line"
          flexDirection="row"
          flexWrap="nowrap"
          alignItems={isOpen ? "flex-start" : "center"}
          columnGap={across.md}
          // One line of text, whatever the button's own height: a row without one is as tall.
          height={isOpen ? undefined : 1}
        >
          <Box
            flexDirection="row"
            flexWrap="nowrap"
            flexGrow={1}
            flexShrink={1}
            columnGap={across.md}
          >
            <Box flexShrink={1} flexGrow={o.field ? 1 : undefined}>
              {line}
            </Box>
            {detail && !detail.isAtEnd ? (
              // The text is what names the row: the detail takes only the room the text leaves
              // (no width of its own, growing into the rest), so it gives way first and whole.
              <Box width={0} flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end" dimColor>
                  {detail.text}
                </Text>
              </Box>
            ) : null}
          </Box>
          {detail?.isAtEnd ? (
            // At the end it is short (an age) and keeps its room; the text gives way.
            <Box flexShrink={0}>
              <Text dimColor>{detail.text}</Text>
            </Box>
          ) : null}
          {button ? (
            <Button
              key={button.key}
              variant={button.isFilled ? "primary" : undefined}
              dimColor={!button.isFilled || undefined}
              label={button.label}
              onPress={() => button.onPress()}
            />
          ) : null}
        </Box>
        {o.meta && !isOpen ? (
          <Text wrap="truncate-end" dimColor>
            {o.meta}
          </Text>
        ) : null}
        {isOpen ? o.body : null}
      </Box>
    </Box>
  );
}

/**
 * The graphical card: a row, opened in place (`guiRow`). Its mark is the kind's icon, or what it
 * is set to; opened, its body is the kind and its history, the evidence, and the keys that set it.
 */
function cardGui(k: Kit, o: CardOptions): JSX.Element {
  const { Text } = k;
  const times = o.seen ?? 1;
  const kind = capital(o.kind);
  const mark =
    o.tone === "apply"
      ? icon(k, "success", { tone: "success", alt: "Set to apply" })
      : o.tone === "dismiss"
        ? icon(k, "error", { alt: "Set to dismiss" })
        : icon(k, o.kind, { tone: KIND_TONE[o.kind], alt: kind });
  const history = [times > 1 ? `seen ${times} times` : "", o.age ? `${o.age} ago` : ""].filter(
    Boolean,
  );
  return guiRow(k, {
    key: o.key,
    mark,
    text: o.claim,
    isStruck: o.tone === "dismiss",
    isOpen: o.isOpen,
    button: {
      key: o.details.key,
      label: o.isOpen ? "Close" : "Open",
      onPress: () => o.onToggle({ isAlone: true }),
    },
    body: [
      <Text key="meta">
        <Text {...roleProps(KIND_ROLE[o.kind])}>{kind}</Text>
        {history.length ? <Text dimColor>{`  ·  ${history.join("  ·  ")}`}</Text> : null}
      </Text>,
      o.details.render(k),
      choice(k, o.choice.options, o.choice),
    ],
  });
}

/**
 * One reviewed item: its claim, its kind, how often and how long ago, its keys and its details.
 * The terminal cuts a folded claim and sets the keys at the right of the meta line; a graphical
 * surface draws a row that opens in place (`cardGui`).
 */
export function card(k: Kit, o: CardOptions): JSX.Element {
  const { Box, Button, Text } = k;
  const times = o.seen ?? 1;
  if (k.isNative) return cardGui(k, o);
  const width = k.columns;
  const state = o.tone;
  const lines = clamp(
    o.claim,
    width,
    o.isOpen ? {} : { max: o.tui?.foldedLines ?? tokens.foldedLines },
  );
  const repeats = times > 1 ? `${times}×` : "";
  return (
    <Box key={o.key} flexDirection="column">
      <Button
        key={o.claimKey}
        plain
        autoFocus={o.autoFocus ? true : undefined}
        onPress={() => o.onToggle()}
      >
        <Text
          weight={state === "dismiss" ? undefined : "semibold"}
          strikethrough={state === "dismiss" || undefined}
          {...(state === "dismiss"
            ? roleProps("dim")
            : state === "apply"
              ? roleProps("success")
              : {})}
        >
          {lines.join("\n")}
        </Text>
      </Button>
      <Box flexWrap="wrap" columnGap={tokens.gutter} justifyContent="space-between">
        <Box flexWrap="wrap" columnGap={tokens.gutter}>
          <Text weight="bold" {...roleProps(KIND_ROLE[o.kind])}>
            {`${tokens.glyph.kind[o.kind]} ${o.kind}`}
          </Text>
          <Text dimColor>{[repeats, o.age ?? ""].filter(Boolean).join("  ")}</Text>
          <Button key={o.details.key} plain dimColor onPress={() => o.onToggle()}>
            {`${o.isOpen ? tokens.glyph.fold.open : tokens.glyph.fold.closed} evidence${o.details.count > 1 ? ` ${o.details.count}` : ""}`}
          </Button>
        </Box>
        {choice(k, o.choice.options, { ...o.choice, key: `chips:${o.key}` })}
      </Box>
      {o.isOpen ? (
        <Box key={`e:${o.key}`} flexDirection="column" paddingTop={1} paddingLeft={INDENT}>
          {o.details.render(withColumns(k, Math.max(1, width - INDENT)))}
        </Box>
      ) : null}
    </Box>
  );
}

// ---- status and actions

/**
 * A line that tells the person there is something to open, drawn in the band above the prompt: a
 * status mark and the text, and a way in.
 * @param hint What pressing it does, `review`.
 */
export function statusBand(
  k: Kit,
  o: {
    key: string;
    text: string;
    hint: string;
    status?: "warning" | "error" | "success";
    onPress: () => unknown;
    /**
     * `text` as a graphical surface says it, in words rather than the terminal's shorthand.
     * `icon` and `tone` replace the status's own mark; `actions` are quiet buttons after the way
     * in: the line is then the text, with the buttons under it.
     */
    gui?: {
      text?: string;
      icon?: IconName;
      tone?: IconTone;
      actions?: readonly { key: string; label: string; onPress: () => unknown }[];
      /**
       * Everything on one line: the text cut at the edge by the surface, every button after it.
       * For a line that names something already known (a hidden draft), not news to read whole.
       */
      isOneLine?: boolean;
    };
  },
): JSX.Element {
  const { Box, Button, Text } = k;
  const status = o.status ?? "warning";
  // A line of the band, not a call to arms: the way in is a quiet button, so the prompt's own
  // send stays the one filled control in view.
  if (k.isNative) {
    const extra = o.gui?.actions ?? [];
    const isOneLine = Boolean(o.gui?.isOneLine);
    const mark = icon(k, o.gui?.icon ?? status, { tone: o.gui?.tone ?? status });
    const text = (
      <Box flexShrink={1} flexGrow={isOneLine ? 1 : undefined}>
        <Text wrap={isOneLine ? "truncate-end" : undefined}>{o.gui?.text ?? o.text}</Text>
      </Box>
    );
    const first = (
      <Button key={o.key} dimColor label={capital(o.hint)} onPress={() => o.onPress()} />
    );
    // At the inset, as every block is: what opens under the band starts at the same edge.
    if (extra.length === 0 || isOneLine)
      return (
        <Box
          flexDirection="row"
          flexWrap="nowrap"
          columnGap={tokens.gui.across.sm}
          alignItems="center"
          paddingX={tokens.gui.across.inset}
        >
          {mark}
          {text}
          <Box flexDirection="row" flexShrink={0} columnGap={tokens.gui.across.xs}>
            {first}
            {extra.map((a) => (
              <Button key={a.key} dimColor label={capital(a.label)} onPress={() => a.onPress()} />
            ))}
          </Box>
        </Box>
      );
    // With more than one button the line is the text, and the buttons wrap under it.
    return (
      <Box flexDirection="column" rowGap={tokens.gui.space.xs} paddingX={tokens.gui.across.inset}>
        <Box flexDirection="row" flexWrap="nowrap" columnGap={tokens.gui.across.sm}>
          {mark}
          {text}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={tokens.gui.across.xs}>
          {first}
          {extra.map((a) => (
            <Button key={a.key} dimColor label={capital(a.label)} onPress={() => a.onPress()} />
          ))}
        </Box>
      </Box>
    );
  }
  return (
    <Button key={o.key} plain onPress={() => o.onPress()}>
      <Text {...roleProps(status)}>{`${ICON_GLYPH[status]} ${o.text}`}</Text>
      <Text dimColor>{` ${o.hint}`}</Text>
    </Button>
  );
}

/** One action of a pane's action row. */
export type Action = {
  key: string;
  label: string;
  onPress: () => unknown;
  /** The one worth pressing: Submit. */
  isPrimary?: boolean;
  gui?: { isPrimary?: boolean };
  /** A key for it; a graphical surface draws a chip for each, so give one only to an action. */
  hotkey?: string;
};

/**
 * The pane's action row: its Submit, its Close. Labels are as written on the terminal and
 * capitalised on a graphical surface.
 */
export function actionBar(
  k: Kit,
  actions: readonly Action[],
  options: { gui?: { summary?: string; isHidden?: boolean } } = {},
): JSX.Element | null {
  const { Box, Text } = k;
  if (k.isNative && options.gui?.isHidden) return null;
  const summary = k.isNative ? options.gui?.summary : undefined;
  return (
    <Box
      key="actions"
      columnGap={k.isNative ? tokens.gui.across.md : undefined}
      rowGap={k.isNative ? tokens.gui.space.xs : undefined}
      alignItems={k.isNative ? "center" : undefined}
      paddingX={k.isNative ? tokens.gui.across.inset : undefined}
      flexWrap="wrap"
    >
      {summary ? <Text>{summary}</Text> : null}
      {actions.map((a) => actionButton(k, a))}
    </Box>
  );
}

/**
 * One action's Button. A graphical surface fills only the one worth pressing now and draws the
 * rest quiet: VS Code paints a Button by its `dimColor` alone, so the variant follows it.
 */
function actionButton(k: Kit, a: Action): JSX.Element {
  const { Button } = k;
  const isPrimary = k.isNative ? (a.gui?.isPrimary ?? a.isPrimary) : a.isPrimary;
  return (
    <Button
      key={a.key}
      variant={isPrimary ? "primary" : undefined}
      dimColor={(k.isNative && !isPrimary) || undefined}
      hotkey={a.hotkey}
      label={k.isNative ? capital(a.label) : a.label}
      onPress={() => a.onPress()}
    />
  );
}

// ---- list

/** One metadata field of a row. */
export type Cell = {
  text: string;
  /** Cells of the column when metadata sits in columns; the text is cut or padded to it. */
  width: number;
  /** A colour on metadata marks a state or a threshold; most rows carry none. */
  role?: Role;
  /**
   * Which edge of its column the text sits at.
   * @default "left"
   */
  align?: "left" | "right";
};

export type ListItem = {
  /** The Button's address: unique in the list and stable across redraws. */
  key: string;
  title: string;
  /**
   * Marks the row as one of a choice: `□` or `■` before the title on the terminal, the chosen one
   * `primary` on a graphical surface. Left out, the row is no choice.
   */
  isMarked?: boolean;
  /**
   * Dims the row, as for something that cannot be acted on. A graphical surface draws it with no
   * button, so it cannot be pressed; the terminal keeps it pressable.
   */
  isDim?: boolean;
  /**
   * A short dim word after the title: a host, a state, why the row can't run. A graphical surface
   * sets it beside the title with a gap (or at the row's end with `gui.isDetailAtEnd`); the
   * terminal sets it after the padded title with `tui.isInline`, and otherwise as the first
   * metadata field.
   */
  detail?: string;
  /** A key that presses the row. Terminal only: a graphical surface draws no key on a row. */
  hotkey?: string;
  /** An icon before the title on a graphical surface; the terminal draws none. */
  icon?: IconName;
  /** The state the icon marks; grey when none. */
  iconTone?: IconTone;
  gui?: {
    /** Detail at the far end, before the button, as the age of a note is. */
    isDetailAtEnd?: boolean;
  };
  /** The word on a graphical surface's button for the row: `Open`, or `Choose` on a choice. */
  action?: string;
  /**
   * Metadata, in priority order. Under the title on its own dim line, joined by two spaces;
   * in columns with `tui.isColumns`.
   */
  meta?: Cell[];
  onPress: () => unknown;
};

export type ListOptions = {
  /**
   * Which marks a row with `isMarked` draws: `multi` is several-of-many (□ ■), `single`
   * one-of-many (○ ●). A graphical surface draws neither.
   * @default "multi"
   */
  marks?: "multi" | "single";
  tui?: {
    /**
     * Right-aligned metadata columns at one column on every row, as the pane is inline and
     * wide; off, metadata takes a line of its own under the title.
     * @default false
     */
    isColumns?: boolean;
    /** Bounds for each title's `clamp`. */
    title?: ClampOptions;
    /**
     * A menu: each row is one Button, the title padded to the widest in the list and its detail
     * dim after it on the same line; the title is not cut.
     * @default false
     */
    isInline?: boolean;
    /** The width `isInline` pads titles to; `list` sets it to the widest title of its rows. */
    labelWidth?: number;
  };
  gui?: {
    /** Rows shown before the `N more` row. @default `tokens.gui.maxItems` */
    maxItems?: number;
    /** Show every row, as after the person asked for the rest. */
    isAll?: boolean;
    /** Makes a group's `N more` row a Button that asks for the rest. */
    onMore?: () => unknown;
  };
  desktop?: ListOptions["gui"];
  vscode?: ListOptions["gui"];
  mobile?: ListOptions["gui"];
};

/** Cells a mark takes with the space after it. */
const MARK = 2;

/**
 * A graphical row that is pressed, not opened (`guiRow`): the title cut at the edge, its detail
 * dim beside it or at its end, and one quiet button at the far edge. A dimmed row has no button.
 */
function listRowGui(k: Kit, item: ListItem): JSX.Element {
  const meta = item.meta ?? [];
  const label =
    item.action ?? (item.isMarked === undefined ? "Open" : item.isMarked ? "Chosen" : "Choose");
  return guiRow(k, {
    key: `${item.key}:row`,
    mark: item.icon ? icon(k, item.icon, { tone: item.iconTone }) : undefined,
    text: item.title,
    isPlain: true,
    isDim: item.isDim,
    detail: item.detail ? { text: item.detail, isAtEnd: item.gui?.isDetailAtEnd } : undefined,
    meta: meta.length > 0 ? meta.map((c) => c.text).join("  ·  ") : undefined,
    button: item.isDim
      ? undefined
      : { key: item.key, label, isFilled: item.isMarked, onPress: item.onPress },
  });
}

/**
 * One row of a list: a `Button` whose text is the mark, the clamped title and the metadata.
 * A focused row is drawn by the engine; this draws no pointer of its own. A graphical surface
 * draws a row of text with a short quiet button at its end (`listRowGui`).
 */
export function listRow(k: Kit, item: ListItem, options: ListOptions = {}): JSX.Element {
  const { Button, Text } = k;
  if (k.isNative) return listRowGui(k, item);
  if (options.tui?.isInline) {
    const pad = Math.max(0, (options.tui.labelWidth ?? 0) - cellWidth(item.title));
    return (
      <Button
        key={item.key}
        plain
        hotkey={item.hotkey}
        dimColor={item.isDim || undefined}
        onPress={() => item.onPress()}
      >
        {`${item.title}${" ".repeat(pad)}`}
        {item.detail ? <Text dimColor>{`  ${item.detail}`}</Text> : null}
      </Button>
    );
  }
  const meta = [
    ...(item.detail ? [{ text: item.detail, width: cellWidth(item.detail) }] : []),
    ...(item.meta ?? []),
  ];
  const { isColumns = false } = options.tui ?? {};
  const width = k.columns;
  const gutter = tokens.gutter;
  const hasMark = item.isMarked !== undefined;
  const lead = hasMark ? MARK : 0;
  const columnsWidth = meta.reduce((n, c) => n + gutter + c.width, 0);
  const inColumns = isColumns && meta.length > 0 && width - lead - columnsWidth >= tokens.minTitle;
  const titleWidth = Math.max(1, width - lead - (inColumns ? columnsWidth : 0));
  const lines = clamp(item.title, titleWidth, options.tui?.title);
  const children: RenderNode[] = [];
  const cellText = (c: Cell) =>
    c.align === "right" ? alignRight(truncate(c.text, c.width), c.width) : fit(c.text, c.width);
  lines.forEach((line, i) => {
    if (i > 0) children.push(`\n${" ".repeat(lead)}`);
    else if (hasMark) {
      const mark = tokens.glyph[options.marks ?? "multi"];
      children.push(item.isMarked ? `${mark.on} ` : `${mark.off} `);
    }
    children.push(line);
    if (i === 0 && inColumns) {
      children.push(" ".repeat(titleWidth - cellWidth(line) + gutter));
      meta.forEach((c, n) => {
        if (n > 0) children.push(" ".repeat(gutter));
        children.push(
          <Text key={`m${n}`} {...roleProps(c.role ?? "dim")}>
            {cellText(c)}
          </Text>,
        );
      });
    }
  });
  if (!inColumns && meta.length > 0) {
    children.push(`\n${" ".repeat(lead)}`);
    meta.forEach((c, n) => {
      if (n > 0) children.push(" ".repeat(gutter));
      children.push(
        <Text key={`m${n}`} {...roleProps(c.role ?? "dim")}>
          {c.text}
        </Text>,
      );
    });
  }
  return (
    <Button
      key={item.key}
      plain
      hotkey={item.hotkey}
      dimColor={item.isDim || undefined}
      onPress={() => item.onPress()}
    >
      {children}
    </Button>
  );
}

/** Rows under one section header; an empty title draws no header. */
export type ListGroup = { title: string; rows: ListItem[] };

/**
 * Groups of rows, each under a section header, one blank row between groups. A Claude pane
 * scrolls as a whole, so the terminal has no windowing and no `n more`; a graphical surface shows
 * `gui.maxItems` rows of a group and says how many more. A group with no title is rows alone.
 */
export function list(k: Kit, groups: ListGroup[], options: ListOptions = {}): JSX.Element {
  const { Box } = k;
  const own = surfaceOf(k, {
    gui: options.gui,
    desktop: options.desktop,
    vscode: options.vscode,
    mobile: options.mobile,
  });
  const rowOptions: ListOptions = options.tui?.isInline
    ? {
        ...options,
        tui: {
          ...options.tui,
          labelWidth: Math.max(0, ...groups.flatMap((g) => g.rows.map((r) => cellWidth(r.title)))),
        },
      }
    : options;
  return (
    <Box flexDirection="column" rowGap={k.isNative ? tokens.gui.space.md : 1}>
      {groups.map((group, g) => {
        const { shown, more } = capped(k, group.rows, {
          gui: own,
          isAll: own.isAll,
          onMore: own.onMore,
        });
        const rows = shown.map((row) => listRow(k, row, rowOptions));
        // Rows space themselves with their padding, as `card`'s do: no gap between them.
        return k.isNative ? (
          <Box key={`group${g}`} flexDirection="column" rowGap={tokens.gui.space.xs}>
            {group.title ? section(k, group.title) : null}
            <Box key="rows" flexDirection="column">
              {rows}
            </Box>
            {more}
          </Box>
        ) : (
          <Box key={`group${g}`} flexDirection="column">
            {group.title ? section(k, group.title) : null}
            {rows}
            {more}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Blocks in a column with the gap of the style: a blank row on the terminal, dropped in a pane
 * too short for them when `isTight`; on a graphical surface a step of `tokens.gui.space`, `md`
 * unless `gui.gap` says, or `none` for rows that space themselves.
 */
export function stack(
  k: Kit,
  children: readonly (JSX.Element | null)[],
  options: {
    isTight?: boolean;
    /** `tui.gap` is the terminal's rows between blocks, none for a short menu. @default 1 */
    tui?: { gap?: 0 | 1 };
    gui?: { gap?: GuiSpace | "none" };
  } = {},
): JSX.Element {
  const { Box } = k;
  const gap = options.gui?.gap ?? "md";
  return (
    <Box
      flexDirection="column"
      rowGap={
        k.isNative
          ? gap === "none"
            ? 0
            : tokens.gui.space[gap]
          : options.isTight && k.isTight
            ? 0
            : (options.tui?.gap ?? 1)
      }
    >
      {children}
    </Box>
  );
}

// ---- band

/** Rows left to a mod whose band hook sits above this one, which can't be seen from here. */
export const RESERVED_ROWS = 1;

/**
 * How tall a band stands: as tall as its tallest state (`height`), within what the terminal
 * leaves it, so going from one state to the next moves nothing.
 * @param height The rows the tallest state takes.
 * @param maxRows `e.props.maxRows`.
 * @param reserved Rows kept for another mod's row.
 */
export const bandRows = (height: number, maxRows: number, reserved = RESERVED_ROWS) =>
  Math.max(1, Math.min(maxRows - reserved, height));

/** Gap between a native surface's blocks; a terminal uses one blank row. */
export const gapOf = (k: Kit) => (k.isNative ? ("md" as const) : (1 as const));

/** A run of siblings for the divider and the cells they take. */
export type Slot = { nodes: RenderNode[]; width: number };

export type BandShellOptions = {
  /** Left of the divider, after its lead rule. */
  title?: string;
  /**
   * After the title, before the rule that fills the line: what answer puts its question stops
   * in. Its nodes are siblings of the divider, `columnGap` apart; give their total width.
   */
  right?: Slot;
  /** A native surface draws this close control where a terminal draws the filling rule. */
  onClose?: () => unknown;
  /** Everything between the divider and the footer. */
  body: RenderNode;
  /** Last, so its keys keep their row whatever the body holds. */
  footer?: RenderNode;
  /** What only the terminal measures; a graphical surface has no heights in rows. */
  tui: {
    /** Rows the tallest state takes. */
    height: number;
    /** The band's room, `e.props.bodyColumns`. @default the kit's room */
    columns?: number;
    /** `e.props.maxRows`. @default the kit's */
    maxRows?: number;
    /**
     * Rows kept free for another mod's row.
     * @default 1
     */
    reserved?: number;
    /**
     * A blank row between the divider and the body, for a band with room to spare.
     */
    isRoomy?: boolean;
  };
};

/**
 * The band's shell: a top divider line with a title on the left and a slot after it, the body
 * under it and a footer at the bottom, standing as tall as the tallest state (`bandRows`).
 * On a native surface there are no rules of dashes and no heights in rows.
 */
export function bandShell(k: Kit, o: BandShellOptions): JSX.Element {
  const { Box, Text, Button } = k;
  const rule = tokens.glyph.rule;
  const gap = tokens.keyGap;
  const { height, reserved, isRoomy } = o.tui;
  const columns = o.tui.columns ?? k.columns;
  const rows = bandRows(height, o.tui.maxRows ?? k.maxRows ?? height, reserved);
  const used =
    rule.length * 2 + gap + (o.title ? cellWidth(o.title) + gap : 0) + (o.right?.width ?? 0) + gap;
  const divider = (
    <Box columnGap={k.isNative ? "sm" : gap} flexWrap="wrap">
      {k.isNative ? null : <Text dimColor>{rule.repeat(2)}</Text>}
      {o.title ? <Text weight="semibold">{o.title}</Text> : null}
      {o.right?.nodes}
      {k.isNative ? (
        o.onClose ? (
          <Button
            key="quit"
            role="dismiss"
            hotkey="q"
            label="Close"
            onPress={() => o.onClose?.()}
          />
        ) : null
      ) : (
        <Text dimColor>{rule.repeat(Math.max(0, columns - used - 1))}</Text>
      )}
    </Box>
  );
  return (
    <Box
      flexDirection="column"
      rowGap={k.isNative ? gapOf(k) : undefined}
      minHeight={k.isNative ? undefined : rows}
      justifyContent="space-between"
    >
      <Box flexDirection="column" rowGap={k.isNative ? gapOf(k) : isRoomy ? 1 : undefined}>
        {divider}
        {o.body}
      </Box>
      {o.footer}
    </Box>
  );
}

/**
 * Leaves only `plugin`'s own rows in an `AbovePromptList` event: an open form has the band to
 * itself. Return it from the hook in place of `next(e)`'s input.
 * @param e The event's input, with `props.rows`.
 */
export function onlyOwnRows<E extends { props: { rows: readonly { plugin: string }[] } }>(
  e: E,
  plugin: string,
): E {
  const rows = e.props.rows.filter((r) => r.plugin === plugin);
  return { ...e, props: { ...e.props, rows } };
}

// ---- buttons

/** One key of a button row. */
export type KeyChip = {
  /** The Button's address; the label when left out. Give one when the label changes with the screen. */
  id?: string;
  hotkey: string;
  label: string;
  press: () => unknown;
  /** The one worth pressing next: the others are dim. */
  isLit?: boolean;
};

/**
 * The keys in one row, `tokens.keyGap` apart and wrapping when narrow: each a plain `Button`
 * that shows its key, dim but for the lit one. A native surface marks the lit one as its
 * primary button and capitalises the labels.
 */
export function buttonRow(k: Kit, keys: KeyChip[]): JSX.Element {
  const { Box, Button } = k;
  const { isNative } = k;
  return (
    <Box columnGap={isNative ? "sm" : tokens.keyGap} flexWrap="wrap">
      {keys.map(({ id, hotkey, label, press, isLit }) => (
        <Button
          key={id ?? label}
          plain={isNative ? undefined : true}
          dimColor={!isNative && !isLit}
          variant={isNative && isLit ? "primary" : undefined}
          hotkey={hotkey}
          label={isNative ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label}
          onPress={() => press()}
        />
      ))}
    </Box>
  );
}

// ---- images

export type ImageSize = { width: number; height: number };
export type ImageBox = { columns: number; rows: number };

export type FitImageOptions = {
  /** Available terminal columns; the result never exceeds 255. */
  columns: number;
  /** Available terminal rows; the result never exceeds 255. @default 30 */
  rows?: number;
  /** Terminal cell height divided by its width. @default 2 */
  cellRatio?: number;
};

/** Fits an image inside a terminal cell box without changing its aspect ratio. */
export function fitImage(size: ImageSize | null, options: FitImageOptions): ImageBox {
  const bound = (value: number, fallback: number) =>
    Math.max(1, Math.min(255, Math.floor(Number.isFinite(value) ? value : fallback)));
  const columns = bound(options.columns, 1);
  const rows = bound(options.rows ?? 30, 30);
  const ratio =
    Number.isFinite(options.cellRatio) && (options.cellRatio ?? 0) > 0 ? options.cellRatio! : 2;
  const image =
    size &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
      ? size
      : { width: 16, height: 10 };
  const aspect = image.width / image.height;

  let fittedColumns = columns;
  let fittedRows = Math.max(1, Math.round(fittedColumns / aspect / ratio));
  if (fittedRows > rows) {
    fittedRows = rows;
    fittedColumns = Math.max(1, Math.round(fittedRows * ratio * aspect));
  }
  return {
    columns: Math.max(1, Math.min(columns, fittedColumns)),
    rows: Math.max(1, Math.min(rows, fittedRows)),
  };
}

export type ImageItem = {
  /** A stable address among this gallery's images. */
  key: string;
  /** Inline PNG bytes, or a local PNG file for the terminal to read. */
  source: ImageSource;
  /** Pixel dimensions; null uses a 16:10 box until dimensions are known. */
  size: ImageSize | null;
  /** Fallback text where the terminal cannot draw images. */
  alt: string;
  /** An absolute local path, drawn as a dim link below the image. */
  path?: string;
};

export type ImageGalleryOptions = FitImageOptions & {
  /** Optional dim text above the gallery. */
  caption?: string;
};

/** Encodes an absolute path as a file URL without escaping its slashes. */
export const fileUrl = (path: string) =>
  `file://${path.split("/").map(encodeURIComponent).join("/")}`;

/** Draws images at their aspect ratios, each with an optional path link below it. */
export function imageGallery(
  k: Kit,
  images: readonly ImageItem[],
  options: ImageGalleryOptions,
): JSX.Element {
  const { Box, Text, Image, Link } = k;
  return (
    <Box flexDirection="column" rowGap={1}>
      {options.caption ? <Text dimColor>{options.caption}</Text> : null}
      {images.map((image) => {
        const box = fitImage(image.size, options);
        return (
          <Box key={image.key} flexDirection="column" rowGap={1}>
            {Image ? (
              <Image source={image.source} columns={box.columns} rows={box.rows} alt={image.alt} />
            ) : (
              <Text dimColor>{image.alt}</Text>
            )}
            {image.path ? (
              <Text dimColor wrap="wrap">
                {Link ? <Link href={fileUrl(image.path)} label={image.path} /> : image.path}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

// ---- forms and folded rows

/** One field of a form: its name, and the control that holds or sets its value. */
export type FieldItem = {
  key: string;
  label: string;
  control: JSX.Element;
  /** In `fields`, the name over the control and the control the form's whole width: a title. */
  isWide?: boolean;
};

function fieldBox(k: Kit, f: FieldItem, isInset: boolean): JSX.Element {
  const { Box, Text } = k;
  if (k.isNative)
    return (
      <Box
        key={`field:${f.key}`}
        flexDirection="column"
        rowGap={tokens.gui.space.xs}
        paddingX={isInset ? tokens.gui.across.inset : undefined}
      >
        {subhead(k, f.label)}
        {f.control}
      </Box>
    );
  return (
    <Box key={`field:${f.key}`} flexDirection="column">
      <Text dimColor>{f.label}</Text>
      {f.control}
    </Box>
  );
}

/**
 * A control under its name: a graphical surface sets the name as a dim, semibold sub-heading at
 * the inset, the control under it; the terminal a dim line over the control.
 */
export function labelled(k: Kit, f: FieldItem): JSX.Element {
  return fieldBox(k, f, true);
}

/** Several short fields side by side, wrapping onto the next line when they do not fit. */
export function labelledRow(k: Kit, items: readonly FieldItem[]): JSX.Element {
  const { Box } = k;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      columnGap={k.isNative ? tokens.gui.across.md : tokens.gutter}
      rowGap={k.isNative ? tokens.gui.space.sm : undefined}
      paddingX={k.isNative ? tokens.gui.across.inset : undefined}
    >
      {items.map((f) => fieldBox(k, f, false))}
    </Box>
  );
}

export type ExcerptOptions = {
  key: string;
  /** Prose or markdown. Nothing is drawn for none. */
  text: string;
  isOpen: boolean;
  /** The address of the `More` / `Less` button. */
  toggleKey: string;
  onToggle: () => unknown;
};

/**
 * A passage that gives way to what follows it: a graphical surface shows its first line dim, cut
 * at the edge, with a quiet `More` at the far edge when there is more; opened, the passage is
 * whole in a well, with `Less`. The terminal draws it whole.
 */
export function excerpt(k: Kit, o: ExcerptOptions): JSX.Element | null {
  const text = o.text.trim();
  if (!text) return null;
  if (!k.isNative) return prose(k, text);
  const isLong = linesOf(text).length > 1 || cellWidth(text) > tokens.gui.excerptCells;
  return guiRow(k, {
    key: o.key,
    text,
    isDim: !o.isOpen,
    isOpen: isLong && o.isOpen,
    button: isLong
      ? { key: o.toggleKey, label: o.isOpen ? "Less" : "More", onPress: o.onToggle }
      : undefined,
  });
}

export type FoldedRowOptions = {
  key: string;
  /** The row's line; whole, as prose, when opened. */
  text: string;
  /** The mark before it. */
  icon: { name: IconName; tone?: IconTone; alt?: string };
  /** A dim line under the folded text: what the line names, said whole once opened. */
  meta?: string;
  /**
   * The row is a state to be seen before anything else (a possible duplicate): its folded line is
   * in that state's colour, as its icon is. One such row at most, first in its pane.
   */
  tone?: "warning" | "error";
  isOpen: boolean;
  /** The address of the Open / Close button. */
  toggleKey: string;
  /** Opens or folds it; a graphical surface opens one row alone. */
  onToggle: () => unknown;
  /** What an opened row shows under its text, set in from the icon. */
  body?: (k: Kit) => JSX.Element | null;
  /** The row's actions, once opened: quiet buttons in a row. */
  actions?: readonly ChoiceOption[];
};

/**
 * A row that opens in place, for what is not a reviewed suggestion (`card`'s kinds): a graphical
 * surface draws the folded row, one line with a quiet `Open`, and the opened row in its well with
 * the body set in under the text; the terminal a plain button and the body under it.
 */
export function foldedRow(k: Kit, o: FoldedRowOptions): JSX.Element {
  const { Box, Button, Text } = k;
  if (!k.isNative)
    return (
      <Box key={o.key} flexDirection="column">
        <Button key={o.toggleKey} plain onPress={() => o.onToggle()}>
          <Text weight="semibold">{o.text}</Text>
        </Button>
        {o.isOpen ? (
          <Box flexDirection="column" paddingLeft={INDENT}>
            {o.body?.(withColumns(k, Math.max(1, k.columns - INDENT)))}
            {o.actions ? choice(k, o.actions) : null}
          </Box>
        ) : null}
      </Box>
    );
  return guiRow(k, {
    key: o.key,
    mark: icon(k, o.icon.name, { tone: o.icon.tone, alt: o.icon.alt }),
    text: o.text,
    meta: o.meta,
    tone: o.tone,
    isOpen: o.isOpen,
    button: { key: o.toggleKey, label: o.isOpen ? "Close" : "Open", onPress: o.onToggle },
    body: [
      o.body?.(k) ?? null,
      o.actions ? choice(k, o.actions, { key: `${o.key}:actions`, gui: { layout: "row" } }) : null,
    ],
  });
}

/**
 * A form: each field's name and its control. A graphical surface sets the names in a dim column
 * whose controls start at one edge, and an `isWide` field's name over a control the form's whole
 * width; the terminal a dim line over each control.
 */
export function fields(k: Kit, items: readonly FieldItem[]): JSX.Element {
  const { Box, Text } = k;
  if (!k.isNative)
    return (
      <Box flexDirection="column">
        {items.map((f) => (
          <Box key={`field:${f.key}`} flexDirection="column">
            <Text dimColor>{f.label}</Text>
            {f.control}
          </Box>
        ))}
      </Box>
    );
  const { space, across } = tokens.gui;
  return (
    <Box flexDirection="column" rowGap={space.sm}>
      {items.map((f) =>
        f.isWide ? (
          <Box
            key={`field:${f.key}`}
            flexDirection="column"
            rowGap={space.xs}
            paddingX={across.inset}
          >
            <Text dimColor>{f.label}</Text>
            {f.control}
          </Box>
        ) : (
          <Box
            key={`field:${f.key}`}
            flexDirection="row"
            flexWrap="nowrap"
            alignItems="flex-start"
            columnGap={across.md}
            paddingX={across.inset}
          >
            <Box flexShrink={0} minWidth={tokens.gui.labelColumn} paddingTop={0.1}>
              <Text dimColor>{f.label}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {f.control}
            </Box>
          </Box>
        ),
      )}
    </Box>
  );
}

/** One property of a record: its value, and the icon that says which property it is. */
export type Property = {
  key: string;
  text: string;
  icon?: IconName;
  /** What the icon says, for a reader that cannot see it: the property's name. */
  alt?: string;
};

/**
 * A record's properties on one line, as a tracker shows an issue's status, priority and labels: a
 * graphical surface sets each value after its icon, wrapping; the terminal the values dim, two
 * cells apart.
 */
export function properties(k: Kit, items: readonly Property[]): JSX.Element {
  const { Box, Text } = k;
  if (!k.isNative)
    return (
      <Text dimColor>
        {clamp(items.map((p) => p.text).join(" ".repeat(tokens.gutter)), k.columns).join("\n")}
      </Text>
    );
  const { space, across } = tokens.gui;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      columnGap={across.md * 1.5}
      rowGap={space.xs}
      paddingX={across.inset}
    >
      {items.map((p) => (
        <Box
          key={p.key}
          flexDirection="row"
          flexWrap="nowrap"
          alignItems="center"
          columnGap={across.sm * 0.6}
        >
          {p.icon ? icon(k, p.icon, { alt: p.alt ?? p.key, size: 14 }) : null}
          <Text dimColor>{p.text}</Text>
        </Box>
      ))}
    </Box>
  );
}

export type EditableOptions = {
  key: string;
  /** The address of the Edit / Done button. */
  toggleKey: string;
  isOpen: boolean;
  onToggle: () => unknown;
  /** The dim first line, the toggle at its far edge: what the block is, folded and opened. */
  head: { folded: string; opened: string };
  /** What it shows folded: the values as read. */
  view: (k: Kit) => readonly (JSX.Element | null)[];
  /** What it shows opened: the controls that set them, as `fields`. */
  edit: (k: Kit) => readonly (JSX.Element | null)[];
  /** Nothing can be edited here (a surface without fields): the values alone, no toggle. */
  isReadOnly?: boolean;
};

/**
 * A summary that opens to edit: the values as they read, with a quiet Edit at the far edge of a dim
 * first line; opened, the same place says Done and the controls sit in a well, as an opened row's
 * body does. For a short form whose values are mostly right: it reads as the record, not as a wall
 * of controls.
 */
export function editable(k: Kit, o: EditableOptions): JSX.Element {
  const { Box, Button, Text } = k;
  const head = o.isOpen ? o.head.opened : o.head.folded;
  const toggle = o.isReadOnly ? null : (
    <Button
      key={o.toggleKey}
      plain={k.isNative ? undefined : true}
      dimColor
      label={o.isOpen ? "Done" : "Edit"}
      onPress={() => o.onToggle()}
    />
  );
  if (!k.isNative)
    return (
      <Box key={o.key} flexDirection="column">
        <Box flexDirection="row" columnGap={tokens.gutter}>
          <Text dimColor>{head}</Text>
          {toggle}
        </Box>
        {o.isOpen ? o.edit(k) : o.view(k)}
      </Box>
    );
  const { space, across } = tokens.gui;
  const line = (
    <Box
      key="head"
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      justifyContent="space-between"
      columnGap={across.md}
      height={1}
      paddingX={across.inset}
    >
      <Box flexShrink={1}>
        <Text dimColor wrap="truncate-end">
          {head}
        </Text>
      </Box>
      {toggle}
    </Box>
  );
  if (!o.isOpen)
    return (
      <Box key={o.key} flexDirection="column" rowGap={space.xs}>
        {line}
        {o.view(k)}
      </Box>
    );
  // The well spans the pane, as an opened row's does; what is in it keeps the inset.
  return (
    <Box
      key={o.key}
      flexDirection="column"
      rowGap={space.sm}
      paddingY={space.sm}
      backgroundColor={tokens.gui.fill}
      borderStyle="round"
      borderColor="#00000000"
    >
      {line}
      {o.edit(k)}
    </Box>
  );
}
