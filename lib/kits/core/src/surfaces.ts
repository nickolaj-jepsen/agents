/**
 * What each host can do, written once. A kit component's props, its manifest's answers and its
 * stories follow from this table, and a drawing branches on a capability (`can(ctx, "inputRows:many")`),
 * never on a surface's name.
 *
 * Every fact has a value, a note and the source it was checked against. A fact nobody has
 * checked in a session is `unverified()`: the types treat it as absent, so no component promises
 * what nobody has seen. No imports from a host: plain Node reads this file.
 */

/** The five places a kit component is drawn. */
export const surfaceNames = ["pi", "claude-terminal", "vscode", "desktop", "mobile"] as const;
export type Surface = (typeof surfaceNames)[number];

/** The two drawings: `terminal.ts` (cells, for pi and Claude Code's terminal) and `gui.tsx`. */
export type Drawing = "terminal" | "gui";
export const drawings = ["terminal", "gui"] as const;

/** A fact that was checked: its value, why that is so, and what it was checked against. */
export type Fact<V> = { readonly value: V; readonly note: string; readonly source: string };
/** A fact nobody has checked in a session. `hint` is what the host's types suggest, never relied on. */
export type Unverified = { readonly unverified: true; readonly hint?: string };

export const fact = <const V>(value: V, note: string, source: string): Fact<V> => ({
  value,
  note,
  source,
});
export const unverified = (hint?: string): Unverified => ({ unverified: true, hint });

/** What a capability's value may be: the vocabulary of the table. */
export type CapValues = {
  /** Who draws the row the keyboard is on: the kit's pointer, the kit's parked ring, or the host. */
  keyFocus: "kit" | "ring" | "host";
  /** Who draws the row under the pointer: the kit, the painter (swapping colours), or the host. */
  hover: "kit" | "painter" | "host";
  /** A `Button`'s `hotkey` presses it. */
  hotkeys: boolean;
  /** A taller-than-room drawing can be a window the kit moves (`top`). Otherwise the host scrolls. */
  window: boolean;
  /** The host frames a pane, with its own Close, so the kit draws no edges. */
  framesPane: boolean;
  /** How many rows a text field has: one line, or several. */
  inputRows: 1 | "many";
  /** An `Input` is drawn. */
  input: boolean;
  /** A `Select` is drawn. */
  select: boolean;
  /** A `Progress` is drawn. */
  progress: boolean;
  /** An `Svg` is drawn. */
  svg: boolean;
  /** `Text`'s `size` (caption, footnote, body, heading, title) sets a type size. */
  textSize: boolean;
  /** A `Box` can be pressed. */
  boxPress: boolean;
  /** The host can scroll to a keyed element inside a mod's AssistantMessage. */
  transcriptKeyScroll: boolean;
  /** A `Button`'s label wraps onto a second line. */
  labelWraps: boolean;
  /** An `Image` is drawn. */
  images: boolean;
  /**
   * The drawing is laid out in cells: the kit sets every line to a width and cuts a row that
   * does not fit. Otherwise the host lays out and wraps, and the kit sets no width.
   */
  cells: boolean;
};
export type CapName = keyof CapValues;

type Row = { readonly drawing: Drawing } & {
  readonly [C in CapName]: Fact<CapValues[C]> | Unverified;
};

const README = "lib/kits/README.md, What still differs between the clients";
const CLAUDE_MD =
  "49167447:skills/agent-plugin-dev/references/claude.md, Graphical surfaces (extension 2.1.327)";
const TYPES =
  "claude-code types, Elements (apps/*/.claude-types/claude-code/index.d.ts, `pnpm drive types <app>`)";
const VSCODE = "VS Code extension 2.1.327";

/**
 * The table. Surfaces are the rows, capabilities the columns; each column's value type is
 * `CapValues`, which the `satisfies` clause checks, and the literals stay for the types below.
 */
export const surfaces = {
  pi: {
    drawing: "terminal",
    keyFocus: fact("kit", "the extension owns every key and draws its own pointer", README),
    hover: fact("kit", "pi reports the pointer; the kit bolds the label", README),
    hotkeys: fact(
      true,
      "the caller owns the binding; the key is drawn dim after the label",
      "lib/kits/buttons/src/manifest.ts, feature `bind`",
    ),
    window: fact(
      true,
      "the kit draws ↑/↓ more and moves `top`",
      "lib/kits/list/src/manifest.ts, feature `window`",
    ),
    framesPane: fact(
      false,
      "the kit draws a sheet's edges",
      "lib/kits/sheet/src/manifest.ts, feature `edges`",
    ),
    inputRows: fact(1, "pi's field is one row and follows the cursor", README + ", Blocks"),
    input: fact(true, "pi's own field, in the row an `input` slot keeps", README + ", Blocks"),
    select: unverified(),
    progress: unverified(),
    svg: fact(
      false,
      "pi draws cells; there is no vector element",
      "pi-tui has no image or vector component",
    ),
    textSize: fact(false, "the terminal has one size", TYPES + ", TextProps.size"),
    boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
    labelWraps: unverified(),
    transcriptKeyScroll: unverified(),
    images: fact(false, "pi-tui has no image component", "pi-tui exports (no Image)"),
    cells: fact(
      true,
      "the kit lays out every line in cells: a row is cut to its room, and there is no toolbar line or element for a host to draw",
      README,
    ),
  },
  "claude-terminal": {
    drawing: "terminal",
    keyFocus: fact(
      "ring",
      "a parked ring plus a `ui.focus` hook put the kit's pointer on the row",
      README,
    ),
    hover: fact(
      "painter",
      "the engine inverts a Button under the pointer; the painter swaps the row's colours first",
      README,
    ),
    hotkeys: fact(
      true,
      "a Button's `hotkey` presses it while the plugin's site holds the focus",
      TYPES + ", ButtonProps.hotkey",
    ),
    window: fact(
      true,
      "the wheel reaches the mod as `ui.scroll`; the kit moves `top`",
      "lib/kits/list/src/manifest.ts, feature `window`",
    ),
    framesPane: fact(
      true,
      "a pane or box has the engine's frame and Close; a mod draws `sheetHead` and the body",
      README + ", A panel over the screen",
    ),
    inputRows: fact(
      "many",
      "the engine's field wraps, and stands alone on its rows",
      README + ", Blocks",
    ),
    input: fact(true, "the engine's `Input`", TYPES + ", Elements.terminal"),
    select: fact(true, "the engine's `Select`", TYPES + ", Elements.terminal"),
    progress: fact(true, "the engine's `Progress`", TYPES + ", Elements.terminal"),
    svg: fact(false, "the terminal's table has no `Svg`", TYPES + ", Elements.terminal"),
    textSize: fact(
      false,
      "the terminal has one size and ignores `size`",
      TYPES + ", TextProps.size",
    ),
    boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
    labelWraps: unverified(),
    transcriptKeyScroll: unverified(),
    images: fact(true, "the terminal's table has an `Image`", TYPES + ", Elements.terminal"),
    cells: fact(
      true,
      "the kit lays out every line in cells: a row is cut to its room, and there is no toolbar line or element for a host to draw",
      README,
    ),
  },
  vscode: {
    drawing: "gui",
    keyFocus: fact(
      "host",
      "the host draws a Button's focus itself",
      "lib/kits/band/src/manifest.ts, feature `focus`",
    ),
    hover: fact(
      "host",
      "the host draws a Button's hover state itself",
      "lib/kits/buttons/src/manifest.ts, feature `hover`",
    ),
    hotkeys: fact(
      false,
      "the webview does not act on a Button's `hotkey` (checked live)",
      "lib/kits/buttons/src/manifest.ts, feature `bind`; " + VSCODE,
    ),
    window: fact(
      false,
      "the surface scrolls the pane, so there is no window for the kit to move",
      "lib/kits/list/src/manifest.ts, feature `window`",
    ),
    framesPane: fact(
      true,
      "the host frames the pane and owns its Close",
      "lib/kits/sheet/src/manifest.ts, feature `edges`",
    ),
    inputRows: fact(1, "an `Input` is one line", CLAUDE_MD),
    input: fact(true, "the extension's table has an `Input`", TYPES + ", Elements.vscode"),
    select: fact(true, "the extension's table has a `Select`", TYPES + ", Elements.vscode"),
    progress: fact(true, "the extension's table has a `Progress`", TYPES + ", Elements.vscode"),
    svg: fact(
      true,
      "drawn as an image, so it cannot take theme colours: check a light theme",
      TYPES + ", SvgProps (the editor draws an image)",
    ),
    textSize: fact(
      false,
      "the webview draws a Text's colour, dimColor, bold, italic and underline, and no `size`: every Text is the body's size. A Markdown heading has real sizes",
      "extension 2.1.330 webview/index.js, the Text style function (read; probed live: every role drew 13px)",
    ),
    boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
    labelWraps: fact(
      false,
      "a Button's label never wraps; a long one overflows a narrow pane",
      CLAUDE_MD,
    ),
    transcriptKeyScroll: fact(
      false,
      "scrolling to a key inside a mod's AssistantMessage is denied or does nothing",
      CLAUDE_MD,
    ),
    images: fact(
      false,
      "the table has no `Image`: the host shows an image itself, and a mod draws nothing there",
      TYPES + ", Elements.vscode (`Image` is the terminal's alone)",
    ),
    cells: fact(
      false,
      "the host lays out and wraps; the kit sets no width in cells",
      README + ", Draw on Claude Desktop and VS Code",
    ),
  },
  desktop: {
    drawing: "gui",
    keyFocus: unverified(),
    hover: unverified(),
    hotkeys: unverified(),
    window: unverified(),
    framesPane: unverified(),
    inputRows: unverified(),
    input: fact(
      true,
      "the extension's table has an `Input`, as VS Code's does; never driven",
      TYPES + ", Elements.desktop",
    ),
    select: fact(
      true,
      "the extension's table has a `Select`, as VS Code's does; never driven",
      TYPES + ", Elements.desktop",
    ),
    progress: unverified("the table has a `Progress`"),
    // The element types, not a session: the brief for the table asks for these per surface.
    svg: fact(
      true,
      "drawn as an image, or in a sandboxed frame when `isInteractive`",
      TYPES + ", SvgProps; never driven",
    ),
    textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
    boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
    labelWraps: unverified(),
    transcriptKeyScroll: fact(
      true,
      "the engine supports targeting element keys; Answer already relies on it for Desktop review, not verified live",
      TYPES + ", ui.scroll; apps/answer/src/claude.tsx, roundActions",
    ),
    images: fact(
      false,
      "the table has no `Image`: the host shows an image itself, and a mod draws nothing there",
      TYPES + ", Elements.desktop (`Image` is the terminal's alone)",
    ),
    cells: fact(
      false,
      "the host lays out and wraps; the kit sets no width in cells",
      README + ", Draw on Claude Desktop and VS Code",
    ),
  },
  mobile: {
    drawing: "gui",
    keyFocus: unverified(),
    hover: unverified(),
    hotkeys: unverified(),
    window: unverified(),
    framesPane: unverified(),
    inputRows: unverified(),
    input: fact(
      false,
      "an app is sent an `Input` only if it named it in `draws` on its `ui_attach`; the kit's apps name none",
      TYPES + ", Elements.mobile",
    ),
    select: fact(
      false,
      "an app is sent a `Select` only if it named it in `draws` on its `ui_attach`; the kit's apps name none",
      TYPES + ", Elements.mobile",
    ),
    progress: fact(
      false,
      "an app is sent a `Progress` only if it named it in `draws`; its Box and Text otherwise",
      TYPES + ", Elements.mobile",
    ),
    svg: fact(true, "drawn in a web view", TYPES + ", SvgProps"),
    textSize: fact(true, "`size` maps to the surface's type sizes", TYPES + ", TextProps.size"),
    boxPress: fact(false, "a Box has no press handler", TYPES + ", BoxProps"),
    labelWraps: unverified(),
    transcriptKeyScroll: unverified(),
    images: fact(
      false,
      "the table has no `Image`: the host shows an image itself, and a mod draws nothing there",
      TYPES + ", Elements.mobile (`Image` is the terminal's alone)",
    ),
    cells: fact(
      false,
      "the host lays out and wraps; the kit sets no width in cells",
      README + ", Draw on Claude Desktop and VS Code",
    ),
  },
} as const satisfies Record<Surface, Row>;

type Table = typeof surfaces;

// ---- capability needs: "cap" (its value is truthy) or "cap:a|b" (its value is one of those)

/** A capability a field or a feature needs. `keyFocus:kit|ring`, `window`, `inputRows:many`. */
export type Need = CapName | `${CapName}:${string}`;

type Split<S extends string> = S extends `${infer A}|${infer B}` ? A | Split<B> : S;
type ValueOf<S extends Surface, C extends CapName> = Table[S][C] extends { readonly value: infer V }
  ? V
  : never;
type Falsy = false | 0 | "";

/** Whether surface `S` has the capability `N`: `true` or `false`; unverified is `false`. */
export type Holds<S extends Surface, N extends string> = N extends `${infer C}:${infer Vs}`
  ? C extends CapName
    ? [ValueOf<S, C>] extends [never]
      ? false
      : `${ValueOf<S, C> & (string | number | boolean)}` extends Split<Vs>
        ? true
        : false
    : false
  : N extends CapName
    ? [ValueOf<S, N>] extends [never]
      ? false
      : ValueOf<S, N> extends Falsy
        ? false
        : true
    : false;

/** Whether every surface of the union `S` has `N`. */
export type Can<S extends Surface, N extends string> = [
  S extends Surface ? Holds<S, N> : never,
] extends [true]
  ? true
  : false;

/**
 * The fields of a contract's model that every surface in `S` can honour. `Needs` names the
 * capability each gated field needs; the rest of the model is for everyone. A surface that
 * lacks a capability has no such field in its type, so passing it is an error that names it.
 *
 * ```ts
 * type ChoiceProps<S extends Surface> = Props<Choice, typeof choiceNeeds, S>;
 * ```
 */
export type Props<M, Needs extends { readonly [K in keyof M]?: Need }, S extends Surface> = {
  [
    K in keyof M as K extends keyof Needs
      ? Needs[K] extends string
        ? Can<S, Needs[K]> extends true
          ? K
          : never
        : K
      : K
  ]: M[K];
};

/** What `S` has: each capability whose fact was checked, with its value. */
export type Caps<S extends Surface> = S extends Surface
  ? {
      readonly [C in CapName as [ValueOf<S, C>] extends [never] ? never : C]: ValueOf<S, C>;
    }
  : never;

/** Of the surfaces in `S`, those that have `N`. */
export type SurfaceWith<S extends Surface, N extends string> = S extends Surface
  ? Holds<S, N> extends true
    ? S
    : never
  : never;

// ---- runtime

type AnyFact = { readonly value: unknown; readonly note: string; readonly source: string };

/** What the table says of one capability on one surface: `undefined` when unverified. */
export const factOf = (surface: Surface, cap: CapName): AnyFact | undefined => {
  const f = (surfaces[surface] as Record<string, unknown>)[cap] as AnyFact | Unverified;
  return "unverified" in f ? undefined : f;
};

/** Why a need is not met on `surface`: the table's note, or that nobody has checked. */
export type Lack = { cap: CapName; note: string };

/** `undefined` when `surface` has the need, otherwise why not. */
export function lackOf(surface: Surface, need: string): Lack | undefined {
  const [cap, values] = need.split(":", 2) as [CapName, string | undefined];
  const f = factOf(surface, cap);
  if (!f) {
    const hint = ((surfaces[surface] as Record<string, unknown>)[cap] as Unverified).hint;
    return {
      cap,
      note: `${cap} has not been checked on ${surface}${hint ? ` (${hint})` : ""}`,
    };
  }
  const ok =
    values === undefined
      ? !(f.value === false || f.value === 0 || f.value === "")
      : values.split("|").includes(String(f.value));
  return ok ? undefined : { cap, note: f.note };
}

/** Whether `surface` has the need. */
export const holds = (surface: Surface, need: Need): boolean => lackOf(surface, need) === undefined;

/** Every fact a surface has, by name, for `ctx.caps`. */
export function capsOf<S extends Surface>(surface: S): Caps<S> {
  const out: Record<string, unknown> = {};
  for (const cap of Object.keys(surfaces[surface]) as (CapName | "drawing")[]) {
    if (cap === "drawing") continue;
    const f = factOf(surface, cap);
    if (f) out[cap] = f.value;
  }
  return out as Caps<S>;
}

// ---- the drawing context

/** What a control does, in the one place a mod's reducer lives. Props hold only the `hit`s. */
export type Events = {
  /** A control with this `hit` was pressed. */
  press(hit: string): unknown;
  /** The text of the field with this `hit` changed. */
  input(hit: string, text: string): unknown;
  /** The text of the field with this `hit` was submitted. */
  submit(hit: string, text: string): unknown;
};

/**
 * What a drawing is given on surface `S`: which surface, what it can do, and the events. On a
 * union of surfaces it offers what all of them do; `can` narrows it.
 */
export type Ctx<S extends Surface> = Events & { surface: S; caps: Caps<S> };

const nothing = () => undefined;

/** A context for `surface`; events left out do nothing. */
export const ctxOf = <S extends Surface>(surface: S, events: Partial<Events> = {}): Ctx<S> => ({
  surface,
  caps: capsOf(surface),
  press: events.press ?? nothing,
  input: events.input ?? nothing,
  submit: events.submit ?? nothing,
});

/**
 * Whether the context's surface has the capability, narrowing it to the surfaces that do.
 * A drawing asks this, never which surface it is.
 */
export function can<S extends Surface, N extends Need>(
  ctx: Ctx<S>,
  need: N,
): ctx is Ctx<S> & Ctx<SurfaceWith<S, N>> {
  return holds(ctx.surface, need);
}
