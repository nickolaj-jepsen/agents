/** Paints styled lines for Claude Code's terminal: `Text` runs, and a plain `Button` per control. */
import type { ElementTable } from "claude-code";
import { widthOf, type Line, type Role, type Span } from "../lines.ts";

type Els = Pick<ElementTable<"terminal">, "Box" | "Text" | "Button">;

const COLOR: Record<Role, string | undefined> = {
  text: undefined,
  dim: undefined,
  accent: "claude",
  success: "success",
  warning: "warning",
  error: "error",
};

/**
 * The engine inverts a Button under the pointer and offers no way to turn that off. Inverting
 * swaps a cell's two colours, so while a control is hovered each run is given them the other
 * way round: its own colour as the background and this fill as the text. Swapped back by the
 * engine, the words keep their colour and the row sits on the fill: the theme's second
 * background, the well a user message is drawn in.
 */
const HOVER_FILL = "userMessageBackground";

/** Consecutive lines of one control, or one line of none. */
const groups = (lines: Line[]) => {
  const out: { hit?: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const last = out.at(-1);
    if (last && l.hit !== undefined && last.hit === l.hit) last.lines.push(l);
    else out.push({ hit: l.hit, lines: [l] });
  }
  return out;
};

/**
 * @param press Runs with a control's `hit` when it is pressed: a click on any of its rows.
 * @param width The room in cells, which a control's rows are padded to.
 */
export function paintLines(
  k: Els,
  lines: Line[],
  press?: (hit: string) => unknown,
  width = 0,
): JSX.Element {
  const { Box, Text, Button } = k;
  // The engine refuses a `hover` outside a keyed Box, which only a control has round it.
  const run = (s: Span, key: string, isControl: boolean) => (
    <Text
      key={key}
      color={COLOR[s.role ?? "text"]}
      dimColor={s.role === "dim" || undefined}
      bold={s.bold || undefined}
      underline={s.underline || undefined}
      hover={
        isControl
          ? {
              color: HOVER_FILL,
              backgroundColor: s.role === "dim" ? "inactive" : (COLOR[s.role ?? "text"] ?? "text"),
              dimColor: false,
            }
          : undefined
      }
    >
      {s.text}
    </Text>
  );
  // One Text holds a control's rows, so a press lands on it wherever it falls.
  // A control's rows run to `width`, so the fill under the pointer is one block, not ragged.
  const block = (rows: Line[], at: number, isControl = false) => (
    <Text key={`rows${at}`}>
      {rows.flatMap((l, r) => {
        const room = isControl ? width - widthOf(l) : 0;
        return [
          ...(r ? ["\n"] : []),
          ...l.spans.map((s, i) => run(s, `${at}-${r}-${i}`, isControl)),
          ...(room > 0 ? [run({ text: " ".repeat(room) }, `${at}-${r}-pad`, isControl)] : []),
        ];
      })}
    </Text>
  );
  return (
    <Box flexDirection="column">
      {groups(lines).map((g, at) =>
        g.hit !== undefined && press ? (
          <Box key={`hover-${g.hit}`}>
            <Button
              key={g.hit}
              plain
              label={g.lines.map((l) => l.spans.map((s) => s.text).join("")).join(" ")}
              onPress={() => press(g.hit as string)}
            >
              {block(g.lines, at, true)}
            </Button>
          </Box>
        ) : (
          block(g.lines, at)
        ),
      )}
    </Box>
  );
}
