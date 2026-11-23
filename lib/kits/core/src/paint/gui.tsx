/**
 * The graphical base: what every component's `gui.tsx` draws with, for Claude Desktop, VS Code
 * and the mobile app. A graphical drawing uses the host's native controls (`Button`, `Input`,
 * `Markdown`), not cells: a proportional font, a surface that scrolls and sizes itself.
 *
 * `lib/kits/<component>/src/gui.tsx` exports the functions of its `terminal.ts` under the same names, each
 * taking `(g: Gui, props)` with the same contract props. See the kit's README.
 */
import type { ElementTable } from "claude-code";
import { escapeMarkdown, markdownOfSpans, type Role, type Span } from "../lines.ts";
import { meaningOf, type MeaningName, type IconShape } from "../icons.ts";
import { can, type Ctx } from "../surfaces.ts";
import { tokens, type TypeRole } from "../tokens.ts";

/** The elements a graphical drawing uses, from `$.ui.resolve(e)` on a graphical surface. */
export type GuiEls = Pick<
  ElementTable<"desktop">,
  "Box" | "Text" | "Button" | "Markdown" | "Input" | "Select" | "Svg" | "Link"
>;

/** A graphical surface of Claude Code. */
export type GuiSurface = "desktop" | "vscode" | "mobile";

/**
 * What every `gui.tsx` function takes first: the elements, and the drawing context: which
 * surface, what it can do (`can(g, "inputRows:many")`), and the one place a control's events go
 * (`press`, `input`, `submit`), so a mod's reducer serves both drawings.
 */
export type Gui<S extends GuiSurface = GuiSurface> = Ctx<S> & { els: GuiEls };

/** A component's graphical stories, by state: exactly the component, no title and no hints. */
export type GuiStories = Record<string, (g: Gui) => JSX.Element>;

/** The props of a `Text` in a role of the style. `code` is a chip; `link` is underlined. */
export const roleProps = (role: Role | undefined) => {
  switch (role) {
    case undefined:
    case "text":
      return {};
    case "dim":
    case "border":
      return { dimColor: true as const };
    case "accent":
      return { color: "claude" };
    case "warning":
      // The host names no warning colour: the kit's own, as an icon is drawn in.
      return { color: tokens.gui.tone.warning };
    case "success":
    case "error":
      return { color: role };
    case "code":
      return { backgroundColor: tokens.gui.chip, mono: true as const };
    case "link":
      return { underline: true as const };
  }
};

// ---- type roles

/**
 * The `Text` props of a type role: its size and weight from the host's scale, and dim for a role
 * that is. A drawing takes a role and never a size.
 * @param o `tabular` sets digits of one width, for a count or a time that changes or lines up.
 * `isSized: false` leaves the size out, for a host that draws none: its `section` is then dim,
 * since it cannot be smaller. `isToned: false` leaves the role's tone to the spans inside.
 */
export const typeProps = (
  role: TypeRole,
  o: { tabular?: boolean; isSized?: boolean; isToned?: boolean } = {},
) => {
  const r: {
    size: "caption" | "footnote" | "body" | "heading" | "title";
    weight: string;
    role?: string;
  } = tokens.type[role];
  const isSized = o.isSized !== false;
  const isDim = o.isToned !== false && (r.role === "dim" || (!isSized && role === "section"));
  return {
    ...(isSized ? { size: r.size } : {}),
    weight: r.weight as "regular" | "semibold",
    ...(isDim ? { dimColor: true as const } : {}),
    ...(o.tabular ? { tabular: true as const } : {}),
  };
};

/**
 * The Markdown heading level a role takes where the host draws no `Text` sizes. The webview
 * leaves about an em under a heading, which a `Box` cannot take back (it reads no negative
 * margin), so a heading sits a little further from what it heads than a `Text` would.
 */
const HEADING = { title: "##", heading: "###" } as const;

/**
 * Words in a type role: a `Text` that sets its size, weight and tone from `tokens.type`. Where
 * the host draws no `Text` size (`textSize`: VS Code's webview reads none), a `title` or a
 * `heading` of plain words is the host's own Markdown heading, which has real sizes; every other
 * role is told apart by weight and tone. `wrap: "truncate-end"` cuts the words at the edge with
 * `…` instead of wrapping them.
 */
export function typed(
  g: Gui,
  role: TypeRole,
  children: JSX.Element | string | readonly (JSX.Element | string)[],
  o: { tabular?: boolean; key?: string; wrap?: "truncate-end" } = {},
): JSX.Element {
  const { Box, Markdown, Text } = g.els;
  const isSized = can(g, "textSize");
  if (!isSized && (role === "title" || role === "heading") && typeof children === "string")
    return (
      <Box key={o.key}>
        <Markdown text={`${HEADING[role]} ${escapeMarkdown(children)}`} />
      </Box>
    );
  return (
    <Text key={o.key} wrap={o.wrap} {...typeProps(role, { ...o, isSized })}>
      {children}
    </Text>
  );
}

/**
 * Whether a `title` or `heading` is drawn as the host's Markdown heading, which leaves about an
 * em of its own space below it: what follows takes no further step, so the gap under a title is
 * the gap between two groups and no more.
 */
export const hasHeadingGap = (g: Gui) => !can(g, "textSize");

/**
 * Spans in a type role, as `typed` draws words. Where the host draws no `Text` size, a `title` or
 * `heading` becomes a Markdown heading of the spans: plain words escaped, code as inline code,
 * bold and dim dropped. Elsewhere they are nested runs in a `Text` of the role.
 */
export function typedSpans(
  g: Gui,
  role: TypeRole,
  list: readonly Span[],
  o: { tabular?: boolean; key?: string } = {},
): JSX.Element {
  const { Box, Markdown } = g.els;
  if (!can(g, "textSize") && (role === "title" || role === "heading"))
    return (
      <Box key={o.key}>
        <Markdown text={`${HEADING[role]} ${markdownOfSpans(list)}`} />
      </Box>
    );
  const { Text } = g.els;
  return (
    <Text key={o.key} {...typeProps(role, { ...o, isSized: can(g, "textSize") })}>
      {spans(g, list)}
    </Text>
  );
}

// ---- panels and rows

/**
 * What opens in place, set apart as one object: a filled well, set in by `tokens.gui.panel`, so
 * its words stay a step inside the fill and a control in it stays on it. A terminal draws the
 * same object as a rail (`panelLines`).
 * Use it for an editor, a note, a warning with its own actions and an opened row: whatever the
 * person opens or is asked about, not for a group of rows that is always there.
 * @param o `key` addresses it. `gap` is the step between its parts. @default "sm"
 */
export function panel(
  g: Gui,
  o: { key?: string; gap?: keyof typeof tokens.gui.space },
  ...parts: readonly (JSX.Element | null | undefined | false)[]
): JSX.Element {
  const { Box } = g.els;
  return (
    <Box
      key={o.key}
      flexDirection="column"
      rowGap={tokens.gui.space[o.gap ?? "sm"]}
      paddingX={tokens.gui.panel.x}
      paddingY={tokens.gui.panel.y}
      backgroundColor={tokens.gui.fill}
      // A round border is the surface's only rounded corner; it is drawn in no colour.
      borderStyle="round"
      borderColor="#00000000"
    >
      {parts.filter(Boolean)}
    </Box>
  );
}

/**
 * One row of a list or a form: its line and `tokens.gui.row.pad` above and below, whether or not a Button is in it, its
 * parts on one centre line a step apart. A column of these keeps one beat.
 * @param o `align: "start"` sets the parts on the first line instead of the centre, for a row whose
 * text may wrap: its icon stays beside the first line.
 */
export function rowOf(
  g: Gui,
  o: { key?: string; justify?: "space-between"; align?: "start" },
  ...parts: readonly (JSX.Element | null | undefined | false)[]
): JSX.Element {
  const { Box } = g.els;
  return (
    <Box
      key={o.key}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems={o.align === "start" ? "flex-start" : "center"}
      justifyContent={o.justify}
      paddingY={tokens.gui.row.pad}
      columnGap={tokens.gui.across.sm}
    >
      {parts.filter(Boolean)}
    </Box>
  );
}

/** Rows under each other, `tokens.gui.row.gap` apart: the column a list's `rowOf`s stand in. */
export function rows(
  g: Gui,
  o: { key?: string },
  ...parts: readonly (JSX.Element | null | undefined | false)[]
): JSX.Element {
  const { Box } = g.els;
  return (
    <Box key={o.key} flexDirection="column" rowGap={tokens.gui.row.gap}>
      {parts.filter(Boolean)}
    </Box>
  );
}

/**
 * Blocks of a pane under each other, a step apart: the column a mod lays the kit's drawings in.
 * Parts that are `null` are left out.
 */
export function blocks(
  g: Gui,
  ...parts: readonly (JSX.Element | null | undefined | false)[]
): JSX.Element {
  const { Box } = g.els;
  return (
    <Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {parts.filter(Boolean)}
    </Box>
  );
}

/**
 * A column that has an address: what the host scrolls to or finds by `key`. Parts that are
 * `null` are left out.
 * @param o `gap` is the step between the parts. @default "sm". `isMeasured` sets it as wide as a
 * line of prose (`tokens.prose`), shrinking in a narrower room: for the block a host sets in a
 * message, which it sizes by its content, so text that wraps would otherwise be a few cells wide.
 */
export function column(
  g: Gui,
  o: {
    key?: string;
    gap?: keyof typeof tokens.gui.space;
    isMeasured?: boolean;
    /** Set in by `tokens.gui.across.inset` on each side, where a form's other rows are. */
    isInset?: boolean;
  },
  ...parts: readonly (JSX.Element | null | undefined | false)[]
): JSX.Element {
  const { Box } = g.els;
  const body = (
    <Box
      key={o.isMeasured ? undefined : o.key}
      flexDirection="column"
      width={o.isMeasured ? tokens.prose : undefined}
      flexShrink={o.isMeasured ? 1 : undefined}
      minWidth={o.isMeasured ? 0 : undefined}
      rowGap={tokens.gui.space[o.gap ?? "sm"]}
      paddingX={o.isInset ? tokens.gui.across.inset : undefined}
    >
      {parts.filter(Boolean)}
    </Box>
  );
  // The row takes the room the host gives, so the measure can give way in a narrow pane.
  return o.isMeasured ? (
    <Box key={o.key} flexDirection="row" minWidth={0}>
      {body}
    </Box>
  ) : (
    body
  );
}

/** `word` with its first letter in capitals: a graphical button's label, which has no key beside it. */
export const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * Styled spans as one `Text`: a nested run per span, in its role and face. A span's `hit` is not
 * a control here: a graphical control is a `Button`, which a component draws itself.
 * @param spans A caption or a line of a contract, as `terminal.ts` takes it.
 * @param options `type` sets the line in a type role; `wrap: "truncate-end"` cuts it at the
 * edge with `…` instead of wrapping.
 */
export function spans(
  g: Gui,
  list: readonly Span[],
  options: { type?: TypeRole; tabular?: boolean; wrap?: "truncate-end" } = {},
): JSX.Element {
  const { Text } = g.els;
  return (
    <Text
      wrap={options.wrap}
      {...(options.type
        ? // The spans say their own tone, so a caption's words are dim only where a span is.
          typeProps(options.type, { ...options, isSized: can(g, "textSize"), isToned: false })
        : {})}
    >
      {list.map((s, i) => (
        <Text
          key={`s${i}`}
          {...roleProps(s.role)}
          weight={s.bold ? "bold" : undefined}
          italic={s.italic || undefined}
          underline={s.underline || undefined}
          inverse={s.inverse || undefined}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

// ---- icons

/** The kit's icons: small stroked drawings on a 16-pixel grid. */
const ICONS = {
  wrong: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.7v4"/><path d="M8 11.3v.01"/>',
  stale: '<path d="M13.2 8.2A5.2 5.2 0 1 1 11.7 4.4"/><path d="M13.4 2.4v3.2h-3.2"/>',
  missing: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  warning: '<path d="M8 2.6 14.2 13.2H1.8L8 2.6Z"/><path d="M8 6.8v2.9"/><path d="M8 11.7v.01"/>',
  success: '<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/>',
  error: '<circle cx="8" cy="8" r="6.2"/><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2"/>',
  pending: '<circle cx="8" cy="8" r="6.2" stroke-dasharray="2.4 2.4"/>',
  // The mark of a row of a list: left alone, chosen, set aside.
  open: '<circle cx="8" cy="8" r="5.4"/>',
  chosen:
    '<circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none"/>',
  dropped: '<circle cx="8" cy="8" r="5.4"/><path d="M5.6 8h4.8"/>',
  note: '<path d="M2.6 3.4h10.8v7.2H7.4l-3 2.4v-2.4H2.6Z"/><path d="M5.2 6h5.6M5.2 8h3.6"/>',
  question:
    '<circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4"/><path d="M8 11.4v.01"/>',
  write: '<path d="M10.6 2.9l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6Z"/><path d="M9.2 4.3l2.5 2.5"/>',
  // The properties of a record, as a tracker draws them beside their values.
  status: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>',
  priorityNone: '<path d="M3.2 8h1.4M7.3 8h1.4M11.4 8h1.4"/>',
  priorityLow:
    '<path d="M4 13v-2.6"/><path d="M8 13V7.4" stroke-opacity=".4"/><path d="M12 13V4.4" stroke-opacity=".4"/>',
  priorityMedium: '<path d="M4 13v-2.6M8 13V7.4"/><path d="M12 13V4.4" stroke-opacity=".4"/>',
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

// Every shape a meaning draws is in the set.
const _shapes: IconShape extends IconName ? true : never = true;
void _shapes;

/** The colour an icon is drawn in: grey, or the state it marks. */
export type IconTone = keyof typeof tokens.gui.tone;

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
 * An icon: an image, grey or in the colour of the state it marks.
 * @param alt What it says, for a reader that cannot see it. @default the icon's name
 */
export function icon(
  g: Gui,
  name: IconName,
  options: { tone?: IconTone; alt?: string; size?: number } = {},
): JSX.Element {
  const { Svg } = g.els;
  const { tone = "neutral", alt = name, size = tokens.gui.icon } = options;
  return <Svg source={iconSvg(name, tone, size)} alt={alt} width={size} height={size} />;
}

/**
 * An icon that carries a meaning (`priority:high`, `kind:stale`, `decision:apply`,
 * `state:error`): the kit's drawing for it, in its role's colour. A terminal draws the same
 * name as a glyph (`meaningSpan`).
 * @param o `size` in CSS pixels; `alt` replaces what it says.
 */
export function meaning(
  g: Gui,
  name: MeaningName,
  o: { size?: number; alt?: string } = {},
): JSX.Element {
  const m = meaningOf(name);
  return icon(g, m.shape, { tone: m.tone, alt: o.alt ?? m.alt, size: o.size });
}
