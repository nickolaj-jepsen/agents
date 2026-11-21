/** Paints styled lines for Claude Code's terminal: `Text` runs, and a plain `Button` per control. */
import type { ElementTable } from "claude-code";
import type { Line, Role, Span } from "../lines.ts";

type Els = Pick<ElementTable<"terminal">, "Box" | "Text" | "Button">;

const COLOR: Record<Role, string | undefined> = {
  text: undefined,
  dim: undefined,
  accent: "claude",
  success: "success",
  warning: "warning",
  error: "error",
};

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
 * @param press Runs with a control's `hit` when it is pressed: a click on any of its rows, or
 * Enter under the engine's focus, which inverts the row.
 */
export function paintLines(k: Els, lines: Line[], press?: (hit: string) => unknown): JSX.Element {
  const { Box, Text, Button } = k;
  const run = (s: Span, key: string) => (
    <Text
      key={key}
      color={COLOR[s.role ?? "text"]}
      dimColor={s.role === "dim" || undefined}
      bold={s.bold || undefined}
      underline={s.underline || undefined}
    >
      {s.text}
    </Text>
  );
  // One Text holds a control's rows, so a press lands on it wherever it falls.
  const block = (rows: Line[], at: number) => (
    <Text key={`rows${at}`}>
      {rows.flatMap((l, r) => [
        ...(r ? ["\n"] : []),
        ...l.spans.map((s, i) => run(s, `${at}-${r}-${i}`)),
      ])}
    </Text>
  );
  return (
    <Box flexDirection="column">
      {groups(lines).map((g, at) =>
        g.hit !== undefined && press ? (
          <Button
            key={g.hit}
            plain
            label={g.lines.map((l) => l.spans.map((s) => s.text).join("")).join(" ")}
            onPress={() => press(g.hit as string)}
          >
            {block(g.lines, at)}
          </Button>
        ) : (
          block(g.lines, at)
        ),
      )}
    </Box>
  );
}
