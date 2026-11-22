/**
 * What a Claude Code mod needs around the kit's drawings: guessing nothing about the surface,
 * choosing a drawing by it, opening a pane in the house style, and the band's shell. The kit
 * keeps no state and registers no hooks; a mod's hooks call these.
 */
import type { ElementTable, RenderNode } from "claude-code";
import { cellWidth } from "../lines.ts";
import { tokens } from "../tokens.ts";
import type { Gui, GuiEls, GuiSurface } from "./gui.tsx";

/** The parts of a render event the kit reads, whichever component it is for. */
export type HostEvent = {
  surface: string;
  viewport?: { columns: number };
  props?: object;
};

/** Whether the event's surface draws with native controls (Desktop, VS Code, mobile), not cells. */
export const isGui = (e: Pick<HostEvent, "surface">) => e.surface !== "terminal";

/**
 * The context of a `gui.tsx` function, from the event's resolved elements. Call it only where
 * `isGui(e)` holds.
 * @param els What `$.ui.resolve(e)` answered.
 * @param press Runs with a control's `hit`; the one reducer a mod wires for both surfaces.
 */
export const guiOf = (
  els: object,
  e: Pick<HostEvent, "surface">,
  press?: (hit: string) => unknown,
): Gui => ({ els: els as GuiEls, surface: e.surface as GuiSurface, press });

/** One drawing per surface, each made only when it is the one shown. */
export type Drawings<T> = {
  /** The terminal's. */
  tui: () => T;
  /** Every graphical surface's. */
  gui: () => T;
  /** Replace `gui` on that one surface. */
  desktop?: () => T;
  vscode?: () => T;
  mobile?: () => T;
};

/**
 * The one door through which a mod draws by surface itself: a terminal screen laid out to the
 * cell beside a graphical one built from the kit's `gui.tsx`. Only the chosen drawing runs.
 */
export function forSurface<T>(e: Pick<HostEvent, "surface">, drawings: Drawings<T>): T {
  if (!isGui(e)) return drawings.tui();
  const own = (drawings as Record<string, (() => T) | undefined>)[e.surface];
  return (own ?? drawings.gui)();
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

/** A run of siblings for the divider and the cells they take. */
export type Slot = { nodes: RenderNode[]; width: number };

export type BandShellOptions = {
  /** Left of the divider, after its lead rule. */
  title?: string;
  /**
   * After the title, before the rule that fills the line: nodes that are siblings of the
   * divider, `columnGap` apart; give their total width.
   */
  right?: Slot;
  /** A graphical surface draws this close control where a terminal draws the filling rule. */
  onClose?: () => unknown;
  /** Everything between the divider and the footer. */
  body: RenderNode;
  /** Last, so its keys keep their row whatever the body holds. */
  footer?: RenderNode;
  /** What only the terminal measures; a graphical surface has no heights in rows. */
  tui: {
    /** Rows the tallest state takes. */
    height: number;
    /** The band's room. @default the event's `props.bodyColumns`, else the viewport's, else 80 */
    columns?: number;
    /** @default the event's `props.maxRows` */
    maxRows?: number;
    /**
     * Rows kept free for another mod's row.
     * @default 1
     */
    reserved?: number;
    /** A blank row between the divider and the body, for a band with room to spare. */
    isRoomy?: boolean;
  };
};

/**
 * The band's shell: a top divider line with a title on the left and a slot after it, the body
 * under it and a footer at the bottom, standing as tall as the tallest state (`bandRows`). On a
 * graphical surface there are no rules of dashes and no heights in rows.
 * @param els What `$.ui.resolve(e)` answered.
 * @param e The `AbovePrompt` render event.
 */
export function bandShell(
  els: Pick<ElementTable<"terminal">, "Box" | "Text" | "Button">,
  e: HostEvent,
  o: BandShellOptions,
): JSX.Element {
  const { Box, Text, Button } = els;
  const isNative = isGui(e);
  const props = (e.props ?? {}) as { bodyColumns?: number; maxRows?: number };
  const rule = tokens.glyph.rule;
  const gap = tokens.keyGap;
  const { height, reserved, isRoomy } = o.tui;
  const columns = Math.max(
    1,
    Math.floor(o.tui.columns ?? props.bodyColumns ?? e.viewport?.columns ?? 80),
  );
  const rows = bandRows(height, o.tui.maxRows ?? props.maxRows ?? height, reserved);
  const used =
    rule.length * 2 + gap + (o.title ? cellWidth(o.title) + gap : 0) + (o.right?.width ?? 0) + gap;
  // A native surface gaps its blocks; a terminal uses one blank row.
  const rowGap = isNative ? ("md" as const) : undefined;
  const divider = (
    <Box columnGap={isNative ? "sm" : gap} flexWrap="wrap">
      {isNative ? null : <Text dimColor>{rule.repeat(2)}</Text>}
      {o.title ? <Text weight="semibold">{o.title}</Text> : null}
      {o.right?.nodes}
      {isNative ? (
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
      rowGap={rowGap}
      minHeight={isNative ? undefined : rows}
      justifyContent="space-between"
    >
      <Box flexDirection="column" rowGap={isNative ? rowGap : isRoomy ? 1 : undefined}>
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
