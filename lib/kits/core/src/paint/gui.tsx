/**
 * The graphical base: what every component's `gui.tsx` draws with, for Claude Desktop, VS Code
 * and the mobile app. A graphical drawing uses the host's native controls (`Button`, `Input`,
 * `Markdown`), not cells: a proportional font, a surface that scrolls and sizes itself.
 *
 * `lib/kits/<component>/src/gui.tsx` exports the functions of its `terminal.ts` under the same names, each
 * taking `(g: Gui, props)` with the same contract props. See the kit's README.
 */
import type { ElementTable } from "claude-code";
import type { Role, Span } from "../lines.ts";
import type { Ctx } from "../surfaces.ts";
import { tokens } from "../tokens.ts";

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
  o: { key?: string; gap?: keyof typeof tokens.gui.space; isMeasured?: boolean },
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
 */
export function spans(g: Gui, list: readonly Span[]): JSX.Element {
  const { Text } = g.els;
  return (
    <Text>
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
