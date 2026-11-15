/**
 * The Claude Code mod UI kit: the house style (skills/agent-plugin-dev/references/style.md) as
 * functions that return a mod's element trees. Its numbers, glyphs and colour roles are the pi
 * kit's (`kit/pi/tokens.ts`); the names follow it where the component exists in both.
 *
 * This file is the source of truth. The engine cannot import outside a plugin's folder, so
 * every mod that uses it carries a verbatim copy at `claude/ui.tsx`: edit this one and run
 * `just kit-sync`. `kit/claude/ui.spec.ts` fails while a copy differs.
 *
 * Every drawing function takes a `Kit` first: `kitOf(els, surface)` from what
 * `$.ui.resolve(e)` answers and `e.surface`.
 */
import type { ElementTable, RenderNode } from "claude-code";

/** The elements the kit draws with, from `$.ui.resolve(e)`. */
export type Els = Pick<ElementTable<"terminal">, "Box" | "Text" | "Button">;

/** What every drawing function takes first. */
export type Kit = Els & {
  /** The desktop app and the others that draw real controls in a proportional font. */
  isNative: boolean;
};

/**
 * Binds the resolved elements to the surface they came from.
 * @param els What `$.ui.resolve(e)` answered.
 * @param surface `e.surface`; anything but `terminal` draws native controls.
 */
export const kitOf = (els: Els, surface: string): Kit => ({
  Box: els.Box,
  Text: els.Text,
  Button: els.Button,
  isNative: surface !== "terminal",
});

/**
 * Every number, glyph and colour role of the house style. One edit here restyles every mod
 * that carries a fresh copy of this file.
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
 * @param cls The width class (see style.md).
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

/**
 * How many terminal cells `text` takes: wide characters count two, combining marks and
 * joiners none. Never `.length`.
 */
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
 * Wraps `text` to `width` cells and returns lines, within the bounds. Nothing is padded or cut
 * unless asked: `{min: 1, max: 1}` is a one-line truncation, no options wraps without limit.
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

/**
 * `text` padded with spaces to `width` cells, cut with `…` when longer.
 * @param width Cells.
 */
export const fit = (text: string, width: number) => {
  const cut = truncate(text, Math.max(0, width));
  return cut + " ".repeat(Math.max(0, width - cellWidth(cut)));
};

/**
 * `text` right-aligned in `width` cells.
 * @param width Cells.
 */
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

// ---- blocks

/**
 * A section header: bold title, then a dim rule to the edge.
 * @param width The room in cells; a longer title is cut with `…`.
 */
export function section(k: Kit, width: number, title: string): JSX.Element {
  const { Text } = k;
  const head = clamp(title, Math.max(1, width), { min: 1, max: 1 })[0] ?? "";
  const room = width - cellWidth(head) - 1;
  return (
    <Text>
      <Text weight="semibold">{head}</Text>
      {room > 0 ? <Text dimColor>{` ${tokens.glyph.rule.repeat(room)}`}</Text> : null}
    </Text>
  );
}

/**
 * A pane's title line, `─ Title  count ─────`, so both harnesses share one.
 * @param width The room in cells.
 * @param count Dim, after the title; left out when none.
 */
export function paneTitle(
  k: Kit,
  width: number,
  title: string,
  count?: number | string,
): JSX.Element {
  const { Text } = k;
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
  /** Wraps each line to this width, less the gutter and the indent; every wrapped line has its gutter. */
  width?: number;
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
 * thing above it; never use it for a list of entries.
 * @param text The note; its own newlines are lines.
 */
export function note(k: Kit, text: string, options: NoteOptions = {}): JSX.Element {
  const { Text } = k;
  const { indent = 0, width, role = "text", italic } = options;
  const lines =
    width === undefined
      ? linesOf(text)
      : linesOf(text).flatMap((line) => clamp(line, width - indent - 3, { min: 1 }));
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
 * One line telling the person what just happened, cut to `width`.
 * @param status The colour role; success, warning and error only for an actual state.
 */
export function notice(
  k: Kit,
  width: number,
  text: string,
  status: "success" | "warning" | "error" | "dim" = "warning",
): JSX.Element {
  const { Text } = k;
  return <Text {...roleProps(status)}>{clamp(text, width, { min: 1, max: 1 })[0] ?? ""}</Text>;
}

/**
 * What a list says when there is nothing in it, wrapped and dim.
 * @param text Say what is missing and, if it helps, what makes rows appear.
 */
export function emptyState(k: Kit, width: number, text: string): JSX.Element {
  const { Text } = k;
  return <Text dimColor>{clamp(text, width).join("\n")}</Text>;
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
 * beside it; narrower, a dim date line with the text under it at full width.
 * @param width The room in cells.
 * @param items The entries, in the order to show them.
 */
export function entries(
  k: Kit,
  width: number,
  items: Entry[],
  options: EntriesOptions = {},
): JSX.Element {
  const { Box, Text } = k;
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
   * Draws `□` or `■` before the title; left out, no mark.
   */
  isMarked?: boolean;
  /** Dims the row, as for something that cannot be acted on. */
  isDim?: boolean;
  /**
   * Metadata, in priority order. Under the title on its own dim line, joined by two spaces;
   * in columns with `isColumns`.
   */
  meta?: Cell[];
  onPress: () => unknown;
};

export type ListOptions = {
  /** The room in cells, already capped with `widthCap`. */
  width: number;
  /**
   * Right-aligned metadata columns at one column on every row, as the pane is inline and
   * wide; off, metadata takes a line of its own under the title.
   * @default false
   */
  isColumns?: boolean;
  /** Bounds for each title's `clamp`. */
  title?: ClampOptions;
  /**
   * Which marks a row with `isMarked` draws: `multi` is several-of-many (□ ■), `single`
   * one-of-many (○ ●).
   * @default "multi"
   */
  marks?: "multi" | "single";
};

/** Cells a mark takes with the space after it. */
const MARK = 2;

/**
 * One row of a list: a `Button` whose text is the mark, the clamped title and the metadata.
 * A focused row is drawn by the engine; this draws no pointer of its own.
 */
export function listRow(k: Kit, item: ListItem, options: ListOptions): JSX.Element {
  const { Button, Text } = k;
  const { width, isColumns = false } = options;
  const meta = item.meta ?? [];
  const gutter = tokens.gutter;
  const hasMark = item.isMarked !== undefined;
  const lead = hasMark ? MARK : 0;
  const columnsWidth = meta.reduce((n, c) => n + gutter + c.width, 0);
  const inColumns = isColumns && meta.length > 0 && width - lead - columnsWidth >= tokens.minTitle;
  const titleWidth = Math.max(1, width - lead - (inColumns ? columnsWidth : 0));
  const lines = clamp(item.title, titleWidth, options.title);
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
    <Button key={item.key} plain dimColor={item.isDim || undefined} onPress={() => item.onPress()}>
      {children}
    </Button>
  );
}

/** Rows under one section header. */
export type ListGroup = { title: string; rows: ListItem[] };

/**
 * Groups of rows, each under a section header, one blank row between groups. A Claude pane
 * scrolls as a whole, so there is no windowing and no `n more`.
 */
export function list(k: Kit, groups: ListGroup[], options: ListOptions): JSX.Element {
  const { Box } = k;
  return (
    <Box flexDirection="column" rowGap={1}>
      {groups.map((group, g) => (
        <Box key={`group${g}`} flexDirection="column">
          {section(k, options.width, group.title)}
          {group.rows.map((row) => listRow(k, row, options))}
        </Box>
      ))}
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
  /** The band's room: `e.props.bodyColumns`. */
  columns: number;
  /** Rows the tallest state takes. */
  height: number;
  /** `e.props.maxRows`. */
  maxRows: number;
  /**
   * Rows kept free for another mod's row.
   * @default 1
   */
  reserved?: number;
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
  const rows = bandRows(o.height, o.maxRows, o.reserved);
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
        <Text dimColor>{rule.repeat(Math.max(0, o.columns - used - 1))}</Text>
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
      <Box flexDirection="column" rowGap={k.isNative ? gapOf(k) : undefined}>
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
      {keys.map(({ hotkey, label, press, isLit }) => (
        <Button
          key={label}
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
