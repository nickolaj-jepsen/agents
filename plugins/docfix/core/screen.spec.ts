import { describe, expect, test } from "vitest";

import { textOf, widthOf, type Line, type Span } from "../claude/kit/lines.ts";
import { openQueue, type Suggestion } from "./docfix.ts";
import {
  drawScreen,
  keyIntent,
  reduce,
  startState,
  zoneAt,
  type Intent,
  type ScreenOptions,
  type ScreenState,
} from "./screen.ts";

const NOW = Date.parse("2026-11-15T10:00:00Z");
const DAY = 86_400_000;

const make = (
  id: string,
  target: string,
  claim: string,
  seenBy = 1,
  evidence = [`${target}: the line contradicts what the code does now.`],
): Suggestion => ({
  id,
  target,
  kind: "wrong",
  claim,
  status: "open",
  created: new Date(NOW - 5 * DAY).toISOString(),
  updated: new Date(NOW - 2 * DAY).toISOString(),
  dismissed: "",
  sessions: Array.from({ length: seenBy }, (_, i) => `s${i}`),
  evidence: evidence.map((text, i) => ({
    at: new Date(NOW - (evidence.length - i) * DAY).toISOString(),
    session: `pi:${i}`,
    text,
  })),
});

const QUEUE = openQueue([
  make("a1", "docs/agent-hub.md", "Unittest suite needs a short `TMPDIR` and markdown-it-py", 2),
  make("a2", "docs/agent-hub.md", "Socket tests fail with AF_UNIX path too long"),
  make(
    "b1",
    "docs/agents.md",
    "pi's permission gate cannot resolve shell variables, so `cat $S/id` reads what `cat ~/.ssh/id` denies.",
    3,
    [
      'Migrated from pi memory `gate-vars`.\n\nMeasured: the path projection resolves only HOME.\n\nWhy the repo didn\'t say it: the docs describe the gate as matching on the command text.\n\nCitations: [{"kind":"path","value":"modules/pi/default.nix"}]',
      "Hit it again from a worktree.",
    ],
  ),
  make("b2", "docs/agents.md", "The hub migration plan is finished"),
  make(
    "c1",
    "skills/agent-plugin-dev/references/a-very-long-folder-name/style.md",
    "東京の節は古くなっています。全角文字の説明文が続きます。",
    12,
  ),
]);

const MANY = openQueue(
  Array.from({ length: 28 }, (_, i) =>
    make(`m${String(i).padStart(2, "0")}`, `docs/page-${Math.floor(i / 4)}.md`, `Claim ${i + 1}`),
  ),
);

const WIDTHS = [44, 48, 64, 100];
const HEIGHTS = [18, 24, 45];

const run = (s: ScreenState, intents: Intent[], o: ScreenOptions) =>
  intents.reduce((at, intent) => reduce(at, intent, o).state, s);

/** Every state the design names, reached through the reducer as a person would. */
function states(o: ScreenOptions): Record<string, ScreenState> {
  const queue = startState(QUEUE, 4);
  return {
    queue,
    many: run(startState(MANY), Array(13).fill({ do: "move", by: 1 }), o),
    set: run(
      queue,
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    ),
    decided: run(queue, [{ do: "doc", choice: "apply" }], o),
    dismissOnly: run(queue, [{ do: "set", choice: "dismiss" }], o),
    reader: run(queue, [{ do: "press", hit: "row:b1" }, { do: "reader" }], o),
    readerNext: run(queue, [{ do: "press", hit: "row:b1" }, { do: "reader" }, { do: "next" }], o),
    confirm: run(queue, [{ do: "set", choice: "apply" }, { do: "close" }], o),
    failed: {
      ...run(queue, [{ do: "set", choice: "apply" }], o),
      notice: "The prompt box can't take the draft right now: press Enter to try again.",
    },
    hover: run(queue, [{ do: "hover", hit: "row:b2" }], o),
    empty: startState([], 4),
  };
}

const at = (width: number, height: number): ScreenOptions => ({
  width,
  height,
  now: NOW,
  wholeDoc: true,
});

const spansOf = (lines: Line[]) => lines.flatMap((l) => l.spans);
const find = (lines: Line[], text: string) => lines.find((l) => textOf(l).includes(text));

describe("every state at every size", () => {
  for (const width of WIDTHS)
    for (const height of HEIGHTS) {
      const o = at(width, height);
      for (const [name, s] of Object.entries(states(o)))
        test(`${name} at ${width}x${height} fits its width and, with a queue, its height`, () => {
          const { lines } = drawScreen(s, o);
          for (const l of lines)
            expect(widthOf(l), `${name}: ${textOf(l)}`).toBeLessThanOrEqual(width);
          if (s.queue.length) expect(lines).toHaveLength(height);
        });
    }

  test("a pane of a few rows keeps the caption, the keyboard's row and the footer", () => {
    const o = at(66, 4);
    const lines = drawScreen(startState(QUEUE), o).lines.map(textOf);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^─ Doc suggestions/);
    expect(lines[1]).toContain("❯ ○ Unittest suite");
    expect(lines[2]).toContain("Apply [a]");
  });
});

describe("nothing jumps", () => {
  const o = at(64, 45);
  const footerAt = (s: ScreenState) =>
    drawScreen(s, o).lines.findIndex((l) => textOf(l).includes("Apply [a]"));

  test("moving, setting a row and several pieces of evidence keep every row where it was", () => {
    const start = startState(QUEUE);
    const base = drawScreen(start, o);
    for (const intents of [
      [{ do: "move", by: 1 }],
      [{ do: "set", choice: "apply" }],
      [
        { do: "set", choice: "dismiss" },
        { do: "move", by: 3 },
      ],
      [{ do: "press", hit: "row:b1" }],
      [{ do: "doc", choice: "dismiss" }],
    ] as Intent[][]) {
      const s = run(start, intents, o);
      const drawn = drawScreen(s, o);
      expect(drawn.lines).toHaveLength(base.lines.length);
      expect(drawn.zones).toEqual(base.zones);
      expect(footerAt(s)).toBe(footerAt(start));
    }
  });

  test("the reader keeps the footer's row and the evidence line, one piece or several", () => {
    const one = run(startState(QUEUE), [{ do: "reader" }], o);
    const two = run(startState(QUEUE), [{ do: "press", hit: "row:b1" }, { do: "reader" }], o);
    expect(footerAt(one)).toBe(footerAt(startState(QUEUE)));
    expect(footerAt(two)).toBe(footerAt(startState(QUEUE)));
    const rule = (s: ScreenState) =>
      drawScreen(s, o).lines.findIndex((l) => textOf(l).includes("Evidence 1 of"));
    expect(rule(one)).toBeGreaterThan(0);
    expect(rule(two)).toBeGreaterThan(0);
  });
});

describe("the queue", () => {
  const o = at(64, 45);

  test("is grouped by doc behind rails, the keyboard's path in the accent, a long path cut from the left", () => {
    const { lines } = drawScreen(startState(QUEUE), o);
    const path = find(lines, "docs/agent-hub.md")!;
    expect(path.spans.find((sp) => sp.text === "docs/agent-hub.md")).toMatchObject({
      role: "accent",
    });
    expect(
      find(lines, "docs/agents.md")!.spans.find((sp) => sp.text === "docs/agents.md"),
    ).toMatchObject({ role: "dim" });
    expect(find(lines, "…/")).toBeDefined();
    expect(textOf(find(lines, "…/")!)).toContain("style.md");
  });

  test("a row set to apply is in the accent with a filled mark; dismissed, the whole row is dim", () => {
    const s = run(
      startState(QUEUE),
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    );
    const { lines } = drawScreen(s, o);
    const applied = find(lines, "Unittest suite")!;
    expect(textOf(applied)).toContain("● Unittest");
    expect(applied.spans.find((sp) => sp.text.startsWith("Unittest"))).toMatchObject({
      role: "accent",
      bold: true,
    });
    const dropped = find(lines, "Socket tests")!;
    expect(textOf(dropped)).toContain("– Socket");
    for (const sp of dropped.spans.filter((x) => x.text.trim() && x.text !== "│"))
      expect(sp.role, sp.text).toBe("dim");
  });

  test("a doc whose every row is decided has a green rail; the keyboard's a bright one", () => {
    const s = run(startState(QUEUE), [{ do: "doc", choice: "apply" }], o);
    const { lines } = drawScreen(s, o);
    expect(find(lines, "docs/agent-hub.md")!.spans[0]).toMatchObject({
      text: "│",
      role: "success",
    });
    expect(find(lines, "docs/agents.md")!.spans[0]).toMatchObject({ text: "│", role: "text" });
    expect(find(lines, "…/")!.spans[0]).toMatchObject({ text: "│", role: "dim" });
  });

  test("focus is a neutral bold pointer; hover bolds a row without moving it", () => {
    const s = run(startState(QUEUE), [{ do: "hover", hit: "row:b2" }], o);
    const { lines } = drawScreen(s, o);
    const pointer = spansOf(lines).find((sp) => sp.text === "❯");
    expect(pointer).toMatchObject({ role: "text", bold: true });
    const hovered = find(lines, "hub migration")!;
    expect(textOf(hovered)).not.toContain("❯");
    expect(hovered.spans.find((sp) => sp.text.startsWith("The hub"))).toMatchObject({
      bold: true,
      role: "text",
    });
  });

  test("the accent is only on what will be applied, the keyboard's path and the armed main action", () => {
    const s = run(startState(QUEUE), [{ do: "set", choice: "apply" }], o);
    const accented = spansOf(drawScreen(s, o).lines)
      .filter((sp: Span) => sp.role === "accent")
      .map((sp) => sp.text);
    // The frame's title, the path, the applied row's mark and its claim (cut), the main action.
    expect(accented.join("|")).toBe(
      "Doc suggestions|docs/agent-hub.md|●|Unittest suite needs a short |TMPDIR| and markdown-i|…|Draft 1 fix",
    );
  });

  test("a long queue is a window: the keyboard's doc row on top, the last row saying what is hidden", () => {
    const s = run(startState(MANY), Array(9).fill({ do: "move", by: 1 }), o);
    const drawn = drawScreen(s, o);
    const [from, to] = drawn.zones.list!;
    const rows = drawn.lines.slice(from, to).map(textOf);
    expect(rows[0]).toContain("docs/page-2.md");
    expect(rows.at(-1)).toMatch(/↑ 2 docs above +↓ \d+ more/);
  });

  test("the wheel moves the window without moving the keyboard, and stops at the ends", () => {
    const s = startState(MANY);
    const down = run(s, Array(40).fill({ do: "scroll", zone: "list", by: 3 }), o);
    expect(down.focus).toBe(s.focus);
    const rows = drawScreen(down, o).lines.map(textOf);
    expect(rows.some((r) => r.includes("docs/page-6.md"))).toBe(true);
    const back = run(down, Array(80).fill({ do: "scroll", zone: "list", by: -3 }), o);
    expect(back.scroll.list).toBe(0);
  });
});

describe("the focused suggestion and the reader", () => {
  test("under the queue: a dim meta line, the claim when the row cuts it, the newest evidence", () => {
    const o = at(64, 45);
    const s = run(startState(QUEUE), [{ do: "press", hit: "row:b1" }], o);
    const lines = drawScreen(s, o).lines.map(textOf);
    expect(lines.some((l) => l.includes("wrong · seen 3× · 2 days ago"))).toBe(true);
    expect(lines.some((l) => l.includes("Hit it again from a worktree."))).toBe(true);
    expect(lines.some((l) => l.includes("Measured"))).toBe(false);
  });

  test("leaves the claim out when the row shows it whole", () => {
    const o = at(100, 45);
    const s = run(startState(QUEUE), [{ do: "press", hit: "row:b2" }], o);
    const rows = drawScreen(s, o)
      .lines.map(textOf)
      .filter((l) => l.includes("hub migration plan"));
    expect(rows).toHaveLength(1);
  });

  test("a short screen shows the meta line and the claim, not the evidence", () => {
    const o = at(64, 24);
    const lines = drawScreen(startState(QUEUE), o).lines.map(textOf);
    expect(lines.some((l) => l.includes("seen 2×"))).toBe(true);
    expect(lines.some((l) => l.includes("contradicts"))).toBe(false);
  });

  test("the reader has every piece, the reason first, keyed rows, and Next on the evidence line", () => {
    const o = at(64, 45);
    const s = run(
      startState(QUEUE),
      [{ do: "press", hit: "row:b1" }, { do: "reader" }, { do: "next" }],
      o,
    );
    const lines = drawScreen(s, o).lines.map(textOf);
    const rule = lines.findIndex((l) => l.includes("Evidence 2 of 2"));
    expect(lines[rule]).toMatch(/migrated from pi .*Next \[n\]/);
    const why = lines.findIndex((l) => l.includes("Why the repo didn't say it"));
    const details = lines.findIndex((l) => l.includes("Details"));
    expect(why).toBeLessThan(details);
    expect(lines.some((l) => /path +modules\/pi\/default\.nix/.test(l))).toBe(true);
    expect(lines.some((l) => l.includes("Back [esc]"))).toBe(true);
    expect(run(s, [{ do: "next" }], o).reader).toBe(0);
  });
});

describe("the footer", () => {
  const o = at(100, 45);
  const footer = (s: ScreenState, width = 100) =>
    drawScreen(s, at(width, 45))
      .lines.map(textOf)
      .find((l) => l.includes("Apply [a]"))!
      .trim();

  test("the main action says what it will do, and is accented only once armed", () => {
    const s = startState(QUEUE);
    expect(footer(s)).toBe("Close ↵  Apply [a]  Dismiss [d]  Evidence [e]  A/D whole doc");
    expect(footer(run(s, [{ do: "set", choice: "dismiss" }], o))).toMatch(/^Dismiss 1 ↵/);
    expect(
      footer(
        run(
          s,
          [
            { do: "set", choice: "apply" },
            { do: "set", choice: "apply" },
            { do: "set", choice: "dismiss" },
          ],
          o,
        ),
      ),
    ).toMatch(/^Draft 2 fixes, dismiss 1 ↵/);
    const close = spansOf(drawScreen(s, o).lines).find((sp) => sp.text === "Close");
    expect(close?.role).toBe("text");
  });

  test("narrow, the main action says less before Apply or Dismiss goes", () => {
    const s = run(
      startState(QUEUE),
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    );
    expect(footer(s, 44)).toMatch(/^Carry out 2 ↵  Apply \[a\]  Dismiss \[d\]$/);
    expect(footer(s, 48)).toMatch(/^Carry out 2 ↵  Apply \[a\]  Dismiss \[d\]$/);
    expect(footer(s, 64)).toMatch(
      /^Draft 1, dismiss 1 ↵  Apply \[a\]  Dismiss \[d\]  Evidence \[e\]$/,
    );
  });

  test("the failed draft's notice is in the error colour", () => {
    const s = { ...startState(QUEUE), notice: "The prompt box can't take the draft." };
    const row = find(drawScreen(s, o).lines, "can't take")!;
    expect(row.spans.at(-1)).toMatchObject({ role: "error" });
  });
});

describe("keys and clicks", () => {
  const o = at(64, 45);
  const key = (s: ScreenState, k: string) => reduce(s, keyIntent(k, s, o)!, o);

  test("a and d set the focused row and move on to the next row left alone; again, they leave it", () => {
    const s = startState(QUEUE);
    const one = key(s, "a").state;
    expect(one.set).toEqual({ a1: "apply" });
    expect(one.focus).toBe("a2");
    const two = key({ ...one, focus: "a1" }, "a").state;
    expect(two.set).toEqual({});
    expect(two.focus).toBe("a1");
  });

  test("A and D set the whole doc and move to the next doc; Claude Code's keys have no whole doc", () => {
    const s = key(startState(QUEUE), "D").state;
    expect(s.set).toEqual({ a1: "dismiss", a2: "dismiss" });
    expect(s.focus).toBe("b1");
    expect(keyIntent("A", s, { ...o, wholeDoc: false })).toBeUndefined();
  });

  test("Enter carries out what is set, or closes; Escape asks before throwing choices away", () => {
    expect(key(startState(QUEUE), "enter").effect).toBe("close");
    const set = key(startState(QUEUE), "a").state;
    expect(key(set, "enter").effect).toBe("submit");
    const asking = key(set, "escape").state;
    expect(asking.confirming).toBe(true);
    expect(key(asking, "escape").state.confirming).toBe(false);
    expect(key(asking, "x").state.confirming).toBe(false);
    expect(key(asking, "enter").effect).toBe("close");
    expect(key(startState(QUEUE), "escape").effect).toBe("close");
  });

  test("the reader: e opens it, j and k scroll it, n moves on, Escape leaves it", () => {
    const s = key(startState(QUEUE), "e").state;
    expect(s.reader).toBe(0);
    expect(key(s, "escape").state.reader).toBeUndefined();
    expect(key(s, "escape").effect).toBeUndefined();
    expect(key(s, "j").state.focus).toBe(s.focus);
  });

  test("clicks: a row puts the keyboard on it, a doc on its first row left alone, the focused suggestion opens the reader", () => {
    const s = startState(QUEUE);
    expect(reduce(s, { do: "press", hit: "row:b2" }, o).state.focus).toBe("b2");
    const done = reduce(s, { do: "set", choice: "apply" }, o).state;
    expect(reduce(done, { do: "press", hit: "doc:docs/agent-hub.md" }, o).state.focus).toBe("a2");
    expect(reduce(s, { do: "press", hit: "detail" }, o).state.reader).toBe(0);
    expect(reduce(s, { do: "press", hit: "frame:close" }, o).effect).toBe("close");
    const asking = reduce(done, { do: "press", hit: "frame:close" }, o).state;
    expect(reduce(asking, { do: "press", hit: "frame:keep" }, o).state.confirming).toBe(false);
    expect(reduce(asking, { do: "press", hit: "frame:discard" }, o).effect).toBe("close");
    expect(reduce(asking, { do: "press", hit: "row:b2" }, o).state.focus).toBe(done.focus);
  });

  test("the wheel's zone is the row it is over", () => {
    const { zones } = drawScreen(startState(QUEUE), o);
    expect(zoneAt(zones, zones.list![0])).toBe("list");
    expect(zoneAt(zones, zones.detail![0])).toBe("detail");
    expect(zoneAt(zones, 0)).toBeUndefined();
  });

  test("nothing open: the frame and one dim line", () => {
    const lines = drawScreen(startState([], 4), o).lines.map(textOf);
    expect(lines.some((l) => l.trim() === "No open suggestions · 4 dismissed")).toBe(true);
  });
});
