/**
 * Paints styled lines for Claude Code's terminal: `Text` runs, a plain `Button` for each control
 * and the engine's own `Markdown` for a block. It also holds what a site needs so the kit's own
 * focus and hover show instead of the engine's: the parked ring, the hover fill and the hint
 * for the keyboard. The kit registers no hooks and keeps no state: a mod's hooks call the
 * helpers here and keep the state themselves.
 */
import type { ElementTable } from "claude-code";
import { cellWidth, type Line, type Role, type Span } from "../lines.ts";

type Els = Pick<ElementTable<"terminal">, "Box" | "Text" | "Button" | "Markdown">;

const COLOR: Record<Role, string | undefined> = {
  text: undefined,
  dim: undefined,
  accent: "claude",
  success: "success",
  warning: "warning",
  error: "error",
  code: "permission",
  link: undefined,
  border: undefined,
  answered: "suggestion",
};

const isDim = (role: Role | undefined) => role === "dim" || role === "border";

/**
 * The engine inverts a Button under the pointer and offers no way to turn that off. Inverting
 * swaps a cell's two colours, so while a control is hovered each run is given them the other
 * way round: its own colour as the background and this fill as the text. Swapped back by the
 * engine, the words keep their colour and the row sits on the fill: the theme's second
 * background, the well a user message is drawn in.
 */
const HOVER_FILL = "userMessageBackground";

export type PaintOptions = {
  /** Runs with a control's `hit` when it is pressed. Without it nothing is a control. */
  press?: (hit: string) => unknown;
  /** The room in cells: a control that is whole rows is padded to it, so its fill is one block. */
  width?: number;
};

/** Consecutive lines of one row-wide control, or one line of none. */
const groups = (lines: readonly Line[]) => {
  const out: { hit?: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const last = out.at(-1);
    if (last && l.hit !== undefined && last.hit === l.hit && !l.slot) last.lines.push(l);
    else out.push({ hit: l.slot ? undefined : l.hit, lines: [l] });
  }
  return out;
};

/** The spans of a row cut where the control they belong to changes. */
const runsOf = (spans: readonly Span[]) => {
  const out: { hit?: string; spans: Span[] }[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && last.hit === s.hit) last.spans.push(s);
    else out.push({ hit: s.hit, spans: [s] });
  }
  return out;
};

export function paintLines(
  k: Els,
  lines: readonly Line[],
  { press, width = 0 }: PaintOptions = {},
): JSX.Element {
  const { Box, Text, Button, Markdown } = k;
  // The engine refuses a `hover` outside a keyed Box, which only a control has round it.
  const run = (s: Span, key: string, isControl: boolean) => (
    <Text
      key={key}
      color={s.role ? COLOR[s.role] : undefined}
      dimColor={isDim(s.role) || undefined}
      bold={s.bold || undefined}
      italic={s.italic || undefined}
      underline={s.underline || undefined}
      inverse={s.inverse || undefined}
      hover={
        isControl
          ? {
              color: HOVER_FILL,
              backgroundColor: isDim(s.role) ? "inactive" : ((s.role && COLOR[s.role]) ?? "text"),
              dimColor: false,
            }
          : undefined
      }
    >
      {s.text}
    </Text>
  );
  // A Button's address must be its own: the same control drawn again further down is told apart.
  const seen = new Map<string, number>();
  const address = (hit: string) => {
    const n = seen.get(hit) ?? 0;
    seen.set(hit, n + 1);
    return n ? `${hit}#${n}` : hit;
  };
  const control = (hit: string, label: string, body: JSX.Element) => {
    const key = address(hit);
    return (
      <Box key={`hover-${key}`}>
        <Button key={key} plain label={label} onPress={() => press?.(hit)}>
          {body}
        </Button>
      </Box>
    );
  };
  const wordsOf = (spans: readonly Span[]) => spans.map((s) => s.text).join("");
  // One Text holds a control's rows, so a press lands on it wherever it falls.
  const block = (rows: Line[], at: number, isControl = false) => (
    <Text key={`rows${at}`}>
      {rows.flatMap((l, r) => {
        const room = isControl ? width - cellWidth(wordsOf(l.spans)) : 0;
        return [
          ...(r ? ["\n"] : []),
          // An empty Text takes no row: a blank line holds a space so it keeps its place.
          ...(l.spans.length ? [] : [" "]),
          ...l.spans.map((s, i) => run(s, `${at}-${r}-${i}`, isControl)),
          ...(room > 0 ? [run({ text: " ".repeat(room) }, `${at}-${r}-pad`, isControl)] : []),
        ];
      })}
    </Text>
  );
  return (
    <Box flexDirection="column">
      {groups(lines).map((g, at) => {
        const [first] = g.lines;
        if (first?.slot)
          return (
            <Box
              key={`slot${at}`}
              paddingLeft={first.slot.indent}
              width={first.slot.indent + first.slot.width}
            >
              <Markdown text={first.slot.text} dimColor={first.slot.isDim || undefined} />
            </Box>
          );
        if (g.hit !== undefined && press)
          return control(
            g.hit,
            g.lines.map((l) => wordsOf(l.spans)).join(" "),
            block(g.lines, at, true),
          );
        const parts = first ? runsOf(first.spans) : [];
        if (!press || parts.every((part) => part.hit === undefined)) return block(g.lines, at);
        // A row of several controls: each its own Button, the words between them plain.
        return (
          <Box key={`row${at}`} flexDirection="row">
            {parts.map((part, p) =>
              part.hit === undefined ? (
                <Text key={`gap${at}-${p}`}>
                  {part.spans.map((s, i) => run(s, `${at}-${p}-${i}`, false))}
                </Text>
              ) : (
                control(
                  part.hit,
                  wordsOf(part.spans),
                  <Text key={`part${at}-${p}`}>
                    {part.spans.map((s, i) => run(s, `${at}-${p}-${i}`, true))}
                  </Text>,
                )
              ),
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** Where the engine's focus ring is kept, and the stops either side that an arrow reaches. */
export const RING = { up: "kit-ring-up", park: "kit-ring", down: "kit-ring-down" } as const;

/** The address of a button that carries one key and draws nothing. */
export const keyAddress = (key: string) => `kit-key-${key}`;

/**
 * The keyboard's half of a site where the kit draws its own focus: nothing here is drawn. The
 * engine's ring rests on the middle button, so Enter acts on what the kit drew focus on; the
 * two round it are where an arrow or Tab would take the ring, which the mod's `ui.focus` hook
 * turns into a move (see `ringMove`). The rest carry the keys the site binds: a plain Button
 * that shows its own hotkey prints it before its label, so the visible rows cannot carry them.
 * @param enter What Enter does: the action of the focused control.
 * @param keys One lowercase letter or digit each.
 */
export function ring(
  k: Els,
  enter: () => unknown,
  keys: readonly { key: string; press: () => unknown }[] = [],
): JSX.Element {
  const { Box, Button } = k;
  return (
    <Box width={0} height={0} overflow="hidden">
      <Button key={RING.up} plain label="previous" onPress={() => undefined} />
      <Button key={RING.park} plain autoFocus label="act" onPress={enter} />
      <Button key={RING.down} plain label="next" onPress={() => undefined} />
      {keys.map(({ key, press }) => (
        <Button key={keyAddress(key)} plain hotkey={key} label={key} onPress={press} />
      ))}
    </Box>
  );
}

/**
 * What the ring trying to move onto `element` means for the kit's own focus, for a mod's
 * `ui.focus` hook: a step up or down, a control the person clicked, or nothing (the ring was
 * headed for the parked button, or for something that is not the kit's). Whenever this answers,
 * the hook applies it to its state and lands the ring back: `next({ ...e, element: RING.park })`.
 * @param isControl Whether `element` is one of the site's own controls: a painted `hit`.
 */
export function ringMove(
  element: string | undefined,
  isControl: (hit: string) => boolean,
): { by: number } | { hit: string } | { by: 0 } | undefined {
  if (!element || element === RING.park) return undefined;
  if (element === RING.up) return { by: -1 };
  if (element === RING.down) return { by: 1 };
  if (element.startsWith(keyAddress(""))) return { by: 0 };
  const hit = element.replace(/#\d+$/, "");
  return isControl(hit) ? { hit } : undefined;
}

/**
 * One line saying how to move the keyboard between the prompt and the site that draws this,
 * for wherever the kit's keys live. A click on a pane or the band gives it the keyboard too,
 * so the line is itself somewhere to click.
 * @param held Whether the site holds the keyboard, as far as the mod knows. The engine says
 * when the ring moves in a site (`ui.focus`), when the person types in the prompt
 * (`prompt.edit`, `prompt.change`) and when a transcript row is pressed (`ui.press` on a
 * `Placed`), but not when Escape hands the keyboard back, so both ways stay on show and
 * `held` only lights one.
 * @param canLeave Whether Escape goes back to the prompt: true in the band, false in a pane
 * that Escape closes, which then says nothing while it holds the keyboard.
 */
export function keysHint(k: Els, held: boolean, canLeave = false): JSX.Element | null {
  const { Box, Text } = k;
  if (held && !canLeave) return null;
  // The way that applies reads as an action: a bold label and its key on a keycap, the fill a
  // hovered row sits on. The other stays, dim, since the mod may be wrong about which applies.
  const way = (label: string, key: string, isLit: boolean) => (
    <Text key={key}>
      <Text bold={isLit || undefined} dimColor={!isLit || undefined}>
        {`${label} `}
      </Text>
      <Text
        backgroundColor={isLit ? HOVER_FILL : undefined}
        bold={isLit || undefined}
        dimColor={!isLit || undefined}
      >
        {isLit ? ` ${key} ` : key}
      </Text>
    </Text>
  );
  return (
    <Box columnGap={3}>
      {way("Keys here", "ctrl+x tab", !held)}
      {canLeave ? way("Back to prompt", "esc", held) : null}
    </Box>
  );
}
