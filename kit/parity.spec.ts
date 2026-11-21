/**
 * Both terminals paint the one drawing: every recorded snapshot of a kit story, in pi and in
 * Claude Code, holds exactly the shared lines at the width it was given, and each client
 * paints a role one way. Reads `e2e/kit/__snapshots__`, so it checks what real sessions drew;
 * a story with no snapshot yet fails, which is the reminder to record it (`just e2e kit`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cellWidth, textOf, type Line } from "./lines.ts";
import { kitStories, storyId } from "./stories.ts";

const snapshots = join(import.meta.dirname, "../e2e/kit/__snapshots__");
const clients = ["pi", "claude"] as const;
type Client = (typeof clients)[number];

type Snap = { size: string; width: number; text: string[]; styles: string[][] };

function read(client: Client, component: string, state: string): Snap[] {
  const dir = join(snapshots, client, component);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${state}@`) && f.endsWith(".snap") && !f.includes(".actual."))
    .map((f) => {
      const rows = readFileSync(join(dir, f), "utf8").split("\n");
      const head = /\((\d+)x(\d+)\)$/.exec(rows[0] ?? "");
      const at = rows.indexOf("--- styles");
      const end = rows.indexOf("--- legend");
      return {
        size: f.slice(state.length + 1, -".snap".length),
        width: Number(head?.[1]),
        text: rows.slice(1, at),
        // One style id per cell: `3x4` is four cells of style 3, `.` the default style.
        styles: rows.slice(at + 1, end).map((row) =>
          row === "-"
            ? []
            : row.split(" ").flatMap((run) => {
                const [id, n] = run.split("x");
                return Array.from({ length: Number(n ?? 1) }, () => id as string);
              }),
        ),
      };
    });
}

/** One style key per cell of a line; a space carries none, since painting it shows nothing. */
const cellStyles = (l: Line) =>
  l.spans.flatMap((s) =>
    Array.from(s.text).flatMap((ch) =>
      Array.from({ length: cellWidth(ch) }, () =>
        ch === " "
          ? undefined
          : [s.role ?? "plain", s.bold && "bold", s.italic && "italic", s.underline && "underline"]
              .filter(Boolean)
              .join(" "),
      ),
    ),
  );

describe.each(kitStories.map((s) => ({ id: storyId(s), story: s })))("$id", ({ story }) => {
  test.each(clients)("%s holds the shared drawing at every size", (client) => {
    const snaps = read(client, story.component, story.state);
    expect(snaps.length, "no snapshot: run `E2E_UPDATE=1 just e2e kit`").toBeGreaterThan(0);
    for (const snap of snaps) {
      const lines = story.lines(snap.width);
      expect(snap.text, `${client} ${snap.size}`).toEqual(lines.map((l) => textOf(l).trimEnd()));
      // Whatever the client's colours are, it paints one style in one way.
      const painted = new Map<string, string>();
      lines.forEach((l, row) =>
        cellStyles(l).forEach((style, cell) => {
          if (!style) return;
          const drawn = snap.styles[row]?.[cell] ?? ".";
          expect(painted.get(style) ?? drawn, `${client} ${snap.size}: ${style}`).toBe(drawn);
          painted.set(style, drawn);
        }),
      );
    }
  });

  test("pi and Claude Code draw the same cells at the same width", () => {
    const [pi, claude] = clients.map((c) => read(c, story.component, story.state));
    const pairs = (pi ?? []).flatMap((a) =>
      (claude ?? []).filter((b) => b.width === a.width).map((b) => [a, b] as const),
    );
    expect(pairs.length, "no size where both clients have the same width").toBeGreaterThan(0);
    for (const [a, b] of pairs) expect(a.text, `${a.size} and ${b.size}`).toEqual(b.text);
  });
});
