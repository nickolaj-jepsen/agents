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
  /** The graphical surfaces' numbers: none of them is a cell. */
  gui: {
    /** A long list shows this many rows, then an `N more` row. */
    maxItems: 12,
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

// ---- icons

/** The kit's icons: small stroked drawings on a 16-pixel grid, for the graphical surfaces. */
const ICONS = {
  wrong: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.7v4"/><path d="M8 11.3v.01"/>',
  stale: '<path d="M13.2 8.2A5.2 5.2 0 1 1 11.7 4.4"/><path d="M13.4 2.4v3.2h-3.2"/>',
  missing: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  warning: '<path d="M8 2.6 14.2 13.2H1.8L8 2.6Z"/><path d="M8 6.8v2.9"/><path d="M8 11.7v.01"/>',
  success: '<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/>',
  error: '<circle cx="8" cy="8" r="6.2"/><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2"/>',
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
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${tokens.gui.tone[tone]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

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
};

/**
 * A block of prose. A graphical surface draws it as markdown, as it draws a reply; the terminal
 * wraps it in cells, and cuts it where `tui.lines` says.
 * @param text Prose or markdown, whose own newlines are line breaks on the terminal.
 */
export function prose(k: Kit, text: string, options: ProseOptions = {}): JSX.Element {
  const { Text, Markdown } = k;
  const { role = "text", isDim } = options;
  if (k.isNative) return <Markdown text={text} dimColor={isDim || undefined} />;
  const { lines, weight } = options.tui ?? {};
  return (
    <Text weight={weight} {...roleProps(isDim ? "dim" : role)}>
      {clamp(text, k.columns, lines).join("\n")}
    </Text>
  );
}

// ---- blocks

/**
 * A title that can be pressed and carry keys of its own: a doc's header over its rows.
 * `choice` sets everything the section heads.
 */
export type SectionOptions = {
  /** The title Button's address. */
  key?: string;
  /** Pressing the title: opens or folds what it heads. */
  onPress?: () => unknown;
  /** Keys at the title's right that set everything the section heads. */
  choice?: ChoiceSet;
  /**
   * How many rows the section heads. A graphical surface draws no keys for one, whose own keys
   * do the same.
   */
  count?: number;
  /** The title is a path, command or symbol: set in the monospaced face on a graphical surface. */
  isCode?: boolean;
};

/** Below this many cells a header's keys drop their suffix. */
const NARROW = 60;

/**
 * A section header: bold title, then a dim rule to the edge on the terminal. With `onPress` and
 * `choice` it is also the control of its rows: a graphical surface draws the title as a heading
 * and the keys under it.
 * @param title Wrapped on a graphical surface; cut with `…` on the terminal unless it is pressable.
 */
export function section(k: Kit, title: string, options: SectionOptions = {}): JSX.Element {
  const { Box, Button, Text } = k;
  const { key, onPress, choice: set } = options;
  const width = k.columns;
  const isControl = key !== undefined && onPress !== undefined;
  if (k.isNative) {
    // A flat heading over its rows, at their inset: the title and, at the far edge, the quiet
    // keys that set every row under it, which wrap under the title when the room is short.
    const isMany = (options.count ?? 2) > 1;
    return (
      <Box
        key={key ? `g:${key}` : undefined}
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        columnGap={tokens.gui.across.md}
        rowGap={tokens.gui.space.xs}
        paddingX={tokens.gui.across.inset}
      >
        <Box flexShrink={1}>
          <Text weight="semibold" mono={options.isCode || undefined}>
            {title}
          </Text>
        </Box>
        {set && isMany ? choice(k, set.options, set) : null}
      </Box>
    );
  }
  if (!isControl) {
    const head = clamp(title, Math.max(1, width), { min: 1, max: 1 })[0] ?? "";
    const room = width - cellWidth(head) - 1;
    return (
      <Text>
        <Text weight="semibold">{head}</Text>
        {room > 0 ? <Text dimColor>{` ${tokens.glyph.rule.repeat(room)}`}</Text> : null}
      </Text>
    );
  }
  const lines = clamp(title, width);
  const last = lines.at(-1) ?? "";
  const suffix = set?.suffix && width >= NARROW ? ` ${set.suffix}` : "";
  const room = width - cellWidth(last) - (set ? chipsWidth(set.options, suffix) : 0) - 2;
  return (
    <Box key={`g:${key}`} flexWrap="wrap" columnGap={1}>
      <Button key={key} plain onPress={() => onPress()}>
        <Text weight="semibold">{lines.join("\n")}</Text>
      </Button>
      {room > 0 ? <Text dimColor>{tokens.glyph.rule.repeat(room)}</Text> : null}
      {set ? choice(k, set.options, set) : null}
    </Box>
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
  options: BySurface<PaneTitleGui> = {},
): JSX.Element | null {
  const { Box, Text } = k;
  if (k.isNative) {
    const own = surfaceOf(k, options);
    const said = own.count ?? (count === undefined ? "" : String(count));
    const lead =
      title === k.title ? null : (
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
    if (!own.actions?.length) return text;
    return (
      <Box
        key="toolbar"
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        columnGap={tokens.gui.across.md}
        rowGap={tokens.gui.space.xs}
        paddingX={tokens.gui.across.inset}
      >
        <Box flexShrink={1}>{text}</Box>
        <Box flexDirection="row" columnGap={tokens.gui.across.xs}>
          {own.actions.map((a) => actionButton(k, a))}
        </Box>
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
  options: { isWrapped?: boolean; gui?: { isHidden?: boolean } } = {},
): JSX.Element | null {
  const { Box, Text } = k;
  if (k.isNative)
    return options.gui?.isHidden ? null : (
      <Box paddingX={tokens.gui.across.inset}>
        <Text {...roleProps(status)}>{text}</Text>
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
 */
export function emptyState(k: Kit, text: string): JSX.Element {
  const { Box, Text } = k;
  if (k.isNative)
    return (
      <Box paddingX={tokens.gui.across.inset}>
        <Text dimColor>{text}</Text>
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
  onPress: () => unknown;
};

export type ChoiceOptions = {
  /** Several options can be on at once; the terminal draws squares in place of circles. */
  isMulti?: boolean;
  /** Said after each label when there is room, `apply all`: a group's keys. */
  suffix?: string;
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
     * the room.
     * @default "stack"
     */
    layout?: "row" | "stack";
  };
  desktop?: ChoiceOptions["gui"];
  vscode?: ChoiceOptions["gui"];
  mobile?: ChoiceOptions["gui"];
};

/** A choice's options with the options they are drawn by. */
export type ChoiceSet = ChoiceOptions & { options: ChoiceOption[] };

/** Cells the keys of `options` take as plain terminal keys, a hotkey drawn as `a: ` before its label. */
const chipsWidth = (options: readonly ChoiceOption[], suffix: string) =>
  options.reduce(
    (n, o, i) =>
      n + (i ? tokens.gutter : 0) + (o.hotkey ? 3 : 0) + cellWidth(`${o.label}${suffix}`),
    0,
  );

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
    const { layout = "stack" } = surfaceOf(k, {
      gui: settings.gui,
      desktop: settings.desktop,
      vscode: settings.vscode,
      mobile: settings.mobile,
    });
    const suffix = settings.suffix ? ` ${settings.suffix}` : "";
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
          // A Button does not wrap its label, so a label is a word or two; the detail is prose.
          const button = (
            <Button
              key={o.key}
              variant={o.isOn && !o.isQuiet ? "primary" : "secondary"}
              // The surface draws every variant alike, so only the chosen one is not dim.
              dimColor={!(o.isOn && !o.isQuiet) || undefined}
              label={capital(`${o.label}${suffix}`)}
              onPress={() => o.onPress()}
            />
          );
          return isRow || !o.detail ? (
            button
          ) : (
            <Box key={`${o.key}:detail`} flexDirection="column">
              {button}
              <Text dimColor>{o.detail}</Text>
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
  const suffix = settings.suffix && k.columns >= NARROW ? ` ${settings.suffix}` : "";
  return (
    <Box key={settings.key} columnGap={tokens.gutter}>
      {options.map((o) => (
        <Button
          key={o.key}
          plain
          hotkey={o.hotkey}
          dimColor={!o.isOn}
          label={`${o.label}${suffix}`}
          onPress={() => o.onPress()}
        />
      ))}
    </Box>
  );
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

/** Words between backticks, as a Text can set them: in a chip, since a Text has no code face. */
function inlineCode(k: Kit, text: string): RenderNode[] {
  const { Text } = k;
  return text
    .split(/(`[^`\n]+`)/)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
        <Text key={`c${i}`} backgroundColor={tokens.gui.chip}>{` ${part.slice(1, -1)} `}</Text>
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

/**
 * The graphical card: a row, opened in place. Folded, it is one line: the kind's icon, the claim
 * cut at the edge and a quiet button that opens it. Opened, the same line shows the claim whole
 * and the row takes a fill that holds everything under it, set in from the icon, with a rule
 * running down from the icon so the body reads as that line's own: the kind and its history, the
 * evidence, and the keys that set it. A Button cannot wrap or hold an icon, so it is never the
 * row itself.
 */
function cardGui(k: Kit, o: CardOptions): JSX.Element {
  const { Box, Button, Text } = k;
  const { space, across } = tokens.gui;
  const times = o.seen ?? 1;
  const kind = capital(o.kind);
  const mark =
    o.tone === "apply"
      ? icon(k, "success", { tone: "success", alt: "Set to apply" })
      : o.tone === "dismiss"
        ? icon(k, "error", { alt: "Set to dismiss" })
        : icon(k, o.kind, { tone: KIND_TONE[o.kind], alt: kind });
  const isDismissed = o.tone === "dismiss";
  const claim = o.isOpen ? (
    prose(k, o.claim)
  ) : (
    <Text
      wrap="truncate-end"
      dimColor={isDismissed || undefined}
      strikethrough={isDismissed || undefined}
    >
      {inlineCode(k, linesOf(o.claim).join(" "))}
    </Text>
  );
  const history = [times > 1 ? `seen ${times} times` : "", o.age ? `${o.age} ago` : ""].filter(
    Boolean,
  );
  return (
    <Box
      key={o.key}
      flexDirection="row"
      flexWrap="nowrap"
      columnGap={across.sm}
      paddingX={across.inset}
      paddingY={o.isOpen ? space.sm : space.xs}
      backgroundColor={o.isOpen ? tokens.gui.fill : undefined}
      // A round border is the surface's only rounded corner; it is drawn in no colour.
      borderStyle="round"
      borderColor="#00000000"
    >
      <Box flexDirection="column" alignItems="center" flexShrink={0} rowGap={space.xs}>
        <Box height={1} alignItems="center">
          {mark}
        </Box>
        {o.isOpen ? <Box flexGrow={1}>{sideRule(k, "thread")}</Box> : null}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} rowGap={space.sm}>
        <Box
          flexDirection="row"
          flexWrap="nowrap"
          alignItems={o.isOpen ? "flex-start" : "center"}
          columnGap={across.md}
        >
          <Box flexGrow={1} flexShrink={1}>
            {claim}
          </Box>
          <Button
            key={o.details.key}
            dimColor
            label={o.isOpen ? "Close" : "Open"}
            onPress={() => o.onToggle({ isAlone: true })}
          />
        </Box>
        {o.isOpen ? (
          <Text>
            <Text {...roleProps(KIND_ROLE[o.kind])}>{kind}</Text>
            {history.length ? <Text dimColor>{`  ·  ${history.join("  ·  ")}`}</Text> : null}
          </Text>
        ) : null}
        {o.isOpen ? o.details.render(k) : null}
        {o.isOpen ? choice(k, o.choice.options, o.choice) : null}
      </Box>
    </Box>
  );
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
    /** `text` as a graphical surface says it, in words rather than the terminal's shorthand. */
    gui?: { text?: string };
  },
): JSX.Element {
  const { Box, Button, Text } = k;
  const status = o.status ?? "warning";
  // A line of the band, not a call to arms: the way in is a quiet button, so the prompt's own
  // send stays the one filled control in view.
  if (k.isNative)
    return (
      <Box
        flexDirection="row"
        flexWrap="nowrap"
        columnGap={tokens.gui.across.sm}
        alignItems="center"
      >
        {icon(k, status, { tone: status })}
        <Box flexShrink={1}>
          <Text>{o.gui?.text ?? o.text}</Text>
        </Box>
        <Button key={o.key} dimColor label={capital(o.hint)} onPress={() => o.onPress()} />
      </Box>
    );
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
  /** Dims the row, as for something that cannot be acted on. */
  isDim?: boolean;
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
  };
  gui?: {
    /** Rows shown before the `N more` row. @default `tokens.gui.maxItems` */
    maxItems?: number;
  };
  desktop?: ListOptions["gui"];
  vscode?: ListOptions["gui"];
  mobile?: ListOptions["gui"];
};

/** Cells a mark takes with the space after it. */
const MARK = 2;

/**
 * One row of a list: a `Button` whose text is the mark, the clamped title and the metadata.
 * A focused row is drawn by the engine; this draws no pointer of its own. A graphical surface
 * draws a button as wide as the room, the title over its metadata line.
 */
export function listRow(k: Kit, item: ListItem, options: ListOptions = {}): JSX.Element {
  const { Box, Button, Text } = k;
  const meta = item.meta ?? [];
  if (k.isNative) {
    // A Button does not wrap its label, so a row's title is prose beside a short button.
    const label =
      item.action ?? (item.isMarked === undefined ? "Open" : item.isMarked ? "Chosen" : "Choose");
    return (
      <Box key={`${item.key}:row`} flexDirection="column" rowGap="xs">
        <Text dimColor={item.isDim || undefined}>{item.title}</Text>
        {meta.length > 0 ? <Text dimColor>{meta.map((c) => c.text).join("  ·  ")}</Text> : null}
        <Button
          key={item.key}
          variant={item.isMarked ? "primary" : "secondary"}
          label={label}
          onPress={() => item.onPress()}
        />
      </Box>
    );
  }
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
    <Button key={item.key} plain dimColor={item.isDim || undefined} onPress={() => item.onPress()}>
      {children}
    </Button>
  );
}

/** Rows under one section header. */
export type ListGroup = { title: string; rows: ListItem[] };

/**
 * Groups of rows, each under a section header, one blank row between groups. A Claude pane
 * scrolls as a whole, so the terminal has no windowing and no `n more`; a graphical surface shows
 * `gui.maxItems` rows of a group and says how many more.
 */
export function list(k: Kit, groups: ListGroup[], options: ListOptions = {}): JSX.Element {
  const { Box } = k;
  const own = surfaceOf(k, {
    gui: options.gui,
    desktop: options.desktop,
    vscode: options.vscode,
    mobile: options.mobile,
  });
  return (
    <Box flexDirection="column" rowGap={k.isNative ? "md" : 1}>
      {groups.map((group, g) => {
        const { shown, more } = capped(k, group.rows, { gui: own });
        return (
          <Box key={`group${g}`} flexDirection="column" rowGap={k.isNative ? "sm" : undefined}>
            {section(k, group.title)}
            {shown.map((row) => listRow(k, row, options))}
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
  options: { isTight?: boolean; gui?: { gap?: GuiSpace | "none" } } = {},
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
            : 1
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
