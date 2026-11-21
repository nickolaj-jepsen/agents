/**
 * Both terminals paint the one drawing: every recorded snapshot of a choice story, in pi and in
 * Claude Code, holds exactly the shared lines at the width it was given, and each client colours
 * a role one way. Reads `e2e/kit/__snapshots__`, so it checks what real sessions drew.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cellWidth, textOf, type Line } from "../lines.ts";
import type { ChoiceProps } from "./contract.ts";
import { choiceStories } from "./stories.ts";
import { choiceLines } from "./terminal.ts";

const snapshots = join(import.meta.dirname, "../../e2e/kit/__snapshots__");
const clients = ["pi", "claude"] as const;
type Client = (typeof clients)[number];

/** What a story starts with: a live one has the kit's own focus on its first row, in both clients. */
const initial = (props: ChoiceProps, live: boolean): ChoiceProps =>
  live ? { ...props, focus: 0 } : props;

type Snap = { size: string; width: number; text: string[]; styles: string[][] };

function read(client: Client, state: string): Snap[] {
  const dir = join(snapshots, client, "choice");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${state}@`) && f.endsWith(".snap"))
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

/** One role key per cell of a line; a space carries none, since painting it shows nothing. */
const cellRoles = (l: Line) =>
  l.spans.flatMap((s) =>
    Array.from(s.text).flatMap((ch) =>
      Array.from({ length: cellWidth(ch) }, () =>
        ch === " " ? undefined : `${s.role ?? "text"}${s.bold ? " bold" : ""}`,
      ),
    ),
  );

describe.each(choiceStories)("choice/$state", (story) => {
  const drawn = (width: number) => choiceLines(initial(story.props, !!story.live), width);

  test.each(clients)("%s holds the shared drawing at every size", (client) => {
    const snaps = read(client, story.state);
    expect(snaps.length).toBeGreaterThan(0);
    for (const snap of snaps) {
      const lines = drawn(snap.width);
      expect(snap.text, `${client} ${snap.size}`).toEqual(lines.map((l) => textOf(l).trimEnd()));
      // A role is one style and a style one role, whatever the client's colours are.
      const styleOf = new Map<string, string>();
      const roleOf = new Map<string, string>();
      lines.forEach((l, row) =>
        cellRoles(l).forEach((role, cell) => {
          if (!role) return;
          const style = snap.styles[row]?.[cell] ?? ".";
          expect(styleOf.get(role) ?? style, `${client} ${snap.size} ${role}`).toBe(style);
          expect(roleOf.get(style) ?? role, `${client} ${snap.size} style ${style}`).toBe(role);
          styleOf.set(role, style);
          roleOf.set(style, role);
        }),
      );
    }
  });

  test("pi and Claude Code draw the same cells at the same width", () => {
    const [pi, claude] = clients.map((c) => read(c, story.state));
    const pairs = (pi ?? []).flatMap((a) =>
      (claude ?? []).filter((b) => b.width === a.width).map((b) => [a, b] as const),
    );
    expect(pairs.length).toBeGreaterThan(0);
    for (const [a, b] of pairs) expect(a.text, `${a.size} and ${b.size}`).toEqual(b.text);
  });
});
